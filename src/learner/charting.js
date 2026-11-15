// @ts-check
// Charting: placement folded into normal play (DESIGN.md section 6).
//
// The probe RESULT is recorded as a 'placement' event built by placementFor()
// right after the probe's attempt, so the reducer never needs the generator
// registry (the "shipped" set) to replay a placement. The reducer ignores
// charting attempts for boxes; it applies placement events.
//
// Branch walk (recomputed from state, so it is replayable):
//   starts, in order: solve-linear, distribute, exp-product-quotient,
//   sqrt-product-rule (each only once it is shipped). From a start, a hit or
//   an already-seen skill ends the branch; a miss descends to the first
//   prerequisite (in `pre` order) that is shipped, unseen and untested; the
//   branch closes after 2 misses. Once the named starts' branches are done,
//   new branches open at every other untested, unseen, shipped skill,
//   highest level first, because Charting runs "until every shipped skill is
//   either placed or unlocked"; a content drop's new skills are untested, so
//   they get branches too. A closed branch's bottom skill and its ancestors
//   never start a new branch. Charting is over when no branch has a target.

import { skills as ALL_SKILLS } from '../data/skills.js';
import { cleanFirstTryCorrect } from './mastery.js';

/** @typedef {import('../../types.d.ts').Attempt} Attempt */
/** @typedef {import('../../types.d.ts').SkillDef} SkillDef */

export const PROBE_STARTS = Object.freeze(['solve-linear', 'distribute', 'exp-product-quotient', 'sqrt-product-rule']);
export const MAX_PROBES_PER_RUN = 2;
export const BRANCH_MISSES = 2;
/** Probe pairs (I8 + I5 Twin) that report procedure / why. */
export const PAIRED_PROBES = Object.freeze(['frac-times-whole', 'rationalize-denominator']);

/**
 * @typedef {{ skill: string; result: 'hit' | 'miss'; difficulty: number; inferred: string[]; branch: string }} PlacementData
 */

/** @param {readonly SkillDef[]} graph */
function index(graph) {
  return new Map(graph.map((d) => [d.id, d]));
}

/**
 * The prerequisites a probe at difficulty d depends on: the slice-gate list
 * at or below its maxDifficulty, the full list above it.
 * @param {SkillDef} def
 * @param {number} d
 */
export function prereqsAt(def, d) {
  return def.sliceGate && d <= def.sliceGate.maxDifficulty ? def.sliceGate.pre : def.pre;
}

/**
 * Probe difficulty: d2, except a slice-gated skill is probed at its gate
 * difficulty (never above 2) so the probe only assumes the gated prerequisites.
 * @param {SkillDef} def
 */
export function probeDifficulty(def) {
  return def.sliceGate ? Math.min(2, def.sliceGate.maxDifficulty) : 2;
}

/**
 * All ancestors of `id` reached through `first` (the direct prerequisites to
 * start from), then the full `pre` of each ancestor. Sorted by skill number.
 * @param {string[]} first
 * @param {Map<string, SkillDef>} byId
 * @returns {string[]}
 */
function ancestorsFrom(first, byId) {
  const out = new Set();
  const stack = [...first];
  while (stack.length) {
    const id = /** @type {string} */ (stack.pop());
    if (out.has(id)) continue;
    out.add(id);
    const def = byId.get(id);
    if (def) stack.push(...def.pre);
  }
  return [...out].sort((a, b) => (byId.get(a)?.n ?? 0) - (byId.get(b)?.n ?? 0));
}

/**
 * Full ancestor set (full prerequisites) of a skill.
 * @param {string} id
 * @param {readonly SkillDef[]} [graph]
 */
export function ancestors(id, graph = ALL_SKILLS) {
  const byId = index(graph);
  const def = byId.get(id);
  return def ? ancestorsFrom([...def.pre], byId) : [];
}

/**
 * @param {any} state
 * @param {string} id
 */
function seen(state, id) {
  return state.skills[id]?.seen === true;
}

/**
 * Longest full-prerequisite chain below a skill (0 for a root).
 * @param {Map<string, SkillDef>} byId
 */
function levelFn(byId) {
  /** @type {Map<string, number>} */
  const memo = new Map();
  /** @param {string} id @returns {number} */
  const level = (id) => {
    const m = memo.get(id);
    if (m !== undefined) return m;
    const def = byId.get(id);
    const pre = def ? def.pre.filter((p) => byId.has(p)) : [];
    const v = pre.length ? 1 + Math.max(...pre.map(level)) : 0;
    memo.set(id, v);
    return v;
  };
  return level;
}

/**
 * Open probe targets with the branch each belongs to, in priority order:
 * the named starts' branches, then branches opened earlier at other skills,
 * then new branches at every remaining untested skill (top-down: highest
 * level first). A skill is never a new start if it lies at or below the
 * bottom of a closed branch (the skill whose miss closed it, and its
 * ancestors).
 * @param {any} state reducer state
 * @param {ReadonlySet<string>} shipped skill ids that have a generator
 * @param {readonly SkillDef[]} [graph]
 * @returns {{ skill: string; branch: string }[]}
 */
export function chartingBranches(state, shipped, graph = ALL_SKILLS) {
  const byId = index(graph);
  /** @type {{ skill: string; branch: string }[]} */
  const out = [];
  const excluded = new Set();
  const named = PROBE_STARTS.filter((id) => byId.has(id) && shipped.has(id));
  const older = [];
  for (const [id, r] of Object.entries(state.charting)) {
    const b = /** @type {any} */ (r).branch;
    if (typeof b === 'string' && !named.includes(b) && !older.includes(b) && byId.has(b)) older.push(b);
  }
  for (const start of [...named, ...older]) {
    /** @type {string | undefined} */
    let cur = start;
    let misses = 0;
    const visited = new Set();
    while (cur !== undefined && !visited.has(cur)) {
      visited.add(cur);
      const res = state.charting[cur];
      if (!res) {
        if (seen(state, cur)) cur = undefined; // unlocked by teaching: branch over
        break; // untested: this is the target
      }
      if (res.result === 'hit') { cur = undefined; break; }
      misses++;
      if (misses >= BRANCH_MISSES) {
        excluded.add(cur);
        for (const a of ancestors(cur, graph)) excluded.add(a);
        cur = undefined;
        break;
      }
      const def = /** @type {SkillDef} */ (byId.get(cur));
      // one prerequisite down: the first that is already charted (the path
      // taken before) or still probe-able
      cur = prereqsAt(def, probeDifficulty(def)).find((p) => byId.has(p) && shipped.has(p) && (state.charting[p] !== undefined || !seen(state, p)));
    }
    if (cur !== undefined && !out.some((x) => x.skill === cur)) out.push({ skill: cur, branch: start });
  }
  const level = levelFn(byId);
  const fresh = graph.filter((d) => shipped.has(d.id) && !seen(state, d.id) && !state.charting[d.id] && !excluded.has(d.id) && !out.some((x) => x.skill === d.id))
    .sort((a, b) => level(b.id) - level(a.id) || a.n - b.n);
  for (const d of fresh) out.push({ skill: d.id, branch: d.id });
  return out;
}

/**
 * Open probe targets (skills only), in priority order.
 * @param {any} state
 * @param {ReadonlySet<string>} shipped
 * @param {readonly SkillDef[]} [graph]
 * @returns {string[]}
 */
export function chartingTargets(state, shipped, graph = ALL_SKILLS) {
  return chartingBranches(state, shipped, graph).map((x) => x.skill);
}

/**
 * Up to MAX_PROBES_PER_RUN targets for one run. A target that is an ancestor
 * or descendant of one already chosen is skipped, so one probe's hit can
 * never make the other probe in the same run moot.
 * @param {any} state
 * @param {ReadonlySet<string>} shipped
 * @param {readonly SkillDef[]} [graph]
 */
export function probesForRun(state, shipped, graph = ALL_SKILLS) {
  const targets = chartingTargets(state, shipped, graph);
  /** @type {string[]} */
  const chosen = [];
  for (const t of targets) {
    if (chosen.length >= MAX_PROBES_PER_RUN) break;
    const anc = new Set(ancestors(t, graph));
    const related = chosen.some((c) => anc.has(c) || ancestors(c, graph).includes(t));
    if (!related) chosen.push(t);
  }
  return chosen;
}

/**
 * Is Charting still running (some branch has a target)?
 * @param {any} state
 * @param {ReadonlySet<string>} shipped
 * @param {readonly SkillDef[]} [graph]
 */
export function chartingActive(state, shipped, graph = ALL_SKILLS) {
  return chartingTargets(state, shipped, graph).length > 0;
}

/**
 * The placement event data for a probe attempt. Correct, first try, hint-free
 * is a hit: the skill goes to box 3 with one evidence day, and its untested
 * prerequisites (transitively; the gated list at the probe difficulty, then
 * full lists) that are shipped and unseen go to box 2 "inferred".
 * @param {any} state reducer state BEFORE the placement
 * @param {Attempt} attempt the probe attempt (context 'charting')
 * @param {ReadonlySet<string>} shipped
 * @param {readonly SkillDef[]} [graph]
 * @returns {PlacementData}
 */
export function placementFor(state, attempt, shipped, graph = ALL_SKILLS) {
  const byId = index(graph);
  const skill = attempt.problem.skill;
  const def = byId.get(skill);
  if (!def) throw new RangeError(`placementFor: unknown skill ${skill}`);
  const d = attempt.problem.difficulty;
  const hit = cleanFirstTryCorrect(attempt);
  /** @type {string[]} */
  let inferred = [];
  if (hit) {
    inferred = ancestorsFrom([...prereqsAt(def, d)], byId)
      .filter((id) => shipped.has(id) && !seen(state, id) && !state.charting[id] && id !== skill);
  }
  const branch = chartingBranches(state, shipped, graph).find((x) => x.skill === skill)?.branch ?? skill;
  return { skill, result: hit ? 'hit' : 'miss', difficulty: d, inferred, branch };
}
