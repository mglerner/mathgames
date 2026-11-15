// @ts-check
// Session planner (DESIGN.md sections 2 and 6). Pure and deterministic: the
// learner state, the generator registry, the clock (`now`) and the Rng are all
// parameters. The registry is never imported here.
//
// Run skeleton (10 Knots): warm-up 1, fork 1, Room A 2, Room B 2, fork 2,
// Room C 2, Room D 1, Boss or Vault 1, closer 1. At 9 Knots Room B has 1, at 8
// Room C also has 1.
//
// Predicted success is kept in integer percent so every band comparison is
// exact; it is a planning estimate, never a correctness check.
//
// Four scheduling rules were added after the timeline simulation showed the
// first planner starving skills (each has a switch in DEFAULT_PLANNER_PARAMS;
// test/session/timeline.test.js is the gate they exist for):
//  1. reserveTraining: the first new skill of a run gets its Training Room
//     even when the due and evidence lists could fill the run. Before, a new
//     skill needed two slots left over after EVERY due and early-evidence
//     item, so a learner with many skills in play was taught nothing new for
//     weeks (a skill whose Charting probe missed waited about 30 days).
//  2. Warden focus: the skills of the first cluster (section 8 order) whose
//     Warden is not yet eligible, while they are short of 2 evidence days, go
//     first whenever they are due or can take an evidence item. Without it,
//     40 skills share the evidence slots round-robin and a cluster's last
//     skill decides the Warden's day.
//  3. overdueOrder 'relative': "most overdue first" is measured against the
//     skill's own interval (days since review / interval), so a box 0-1 skill
//     one day late outranks a box 4 skill three days late. In absolute days a
//     just-taught or just-missed skill queued behind every older one.
//  4. Training Rooms take Room C before Room A. The live low-rate trigger
//     replaces the room AFTER the one that went badly; with the new skill in
//     Room A, a rough Training Room wiped out Room B's due and evidence items.

import { skills as ALL_SKILLS, CLUSTERS } from '../data/skills.js';
import { dayOf, isDue, overdueBy, intervalOf } from '../learner/scheduler.js';
import { firstTryStats } from '../learner/fading.js';
import { DEFAULT_LEARNER_PARAMS, gapPassed, evidenceComplete, evidencePoints, EVIDENCE_MIN_BOX } from '../learner/mastery.js';
import { probesForRun, probeDifficulty } from '../learner/charting.js';
import { wardenAvailable, wardenEligible } from '../learner/season.js';
import { cellKey, emptySkill } from '../learner/model.js';

/** @typedef {import('../../types.d.ts').Generator} Generator */
/** @typedef {import('../../types.d.ts').Interaction} Interaction */
/** @typedef {import('../../types.d.ts').Attempt} Attempt */
/** @typedef {import('../../types.d.ts').SkillDef} SkillDef */
/** @typedef {import('../../types.d.ts').Rng} Rng */
/** @typedef {import('../learner/model.js').LearnerState} LearnerState */
/** @typedef {import('../learner/model.js').SkillState} SkillState */

/**
 * @typedef {'warmup' | 'repair' | 'due' | 'evidence' | 'training' | 'practice' | 'probe' | 'boss' | 'vault' | 'closer' | 'echo' | 'why' | 'review'} ItemKind
 */
/**
 * @typedef {{
 *   room: string; kind: ItemKind; skill: string; gen: string; seed: string;
 *   difficulty: number; interaction: Interaction; constructed: boolean; fadeLevel: number;
 *   evidence: boolean; context: Attempt['context']; predicted: number; whyAfter: boolean;
 *   workedExample?: boolean; cluster?: string;
 * }} PlanItem
 * predicted is integer percent (30..97); probes carry 0 and are excluded from the mean.
 */
/**
 * @typedef {{
 *   day: number; knots: number; items: PlanItem[];
 *   forks: { room: string; doors: { roomType: string; items: PlanItem[] }[] }[];
 *   boss: string | null; newSkills: string[]; probes: string[];
 *   meanPredicted: number; belowBand: boolean; notes: string[];
 * }} Plan
 */

export const DEFAULT_PLANNER_PARAMS = Object.freeze({
  /** new skills per run when the recent first-try rate is >= newRateMin */
  newSkillBase: 1,
  /** new skills per run when the rate is >= newRateHigh and few skills sit at box 0-1 */
  newSkillHigh: 2,
  /** percent */
  newRateMin: 70,
  /** percent */
  newRateHigh: 80,
  maxLowBoxForHigh: 6,
  /** predicted-success band, percent */
  target: 80,
  bandLow: 78,
  bandHigh: 82,
  /**
   * How many of a run's new skills (still within the cap above) get their
   * Training Room before the precedence list fills the rooms. Further new
   * skills only get rooms that list leaves free. 0 = never reserve (the
   * literal "new skills last" precedence, which starves them), 2 = always.
   */
  reserveTraining: 1,
  /**
   * Not in the spec; Infinity = off. With a finite value, a Training Room is
   * reserved only while at most this many skills are due (repairs included).
   * Trades breadth for depth; see the realistic-learner report.
   */
  newSkillBacklogMax: Infinity,
  /** serve the nearest Warden's unfinished skills first (header, rule 2) */
  wardenFocus: true,
  /** 'relative' (to the box interval) or 'absolute' (days) */
  overdueOrder: /** @type {'relative' | 'absolute'} */ ('relative'),
  /** order new-skill candidates slice skills first (section 4 implementation order) */
  sliceFirst: true,
  /** one Why follow-up per this many items */
  whyEvery: 4,
  evidenceGap: DEFAULT_LEARNER_PARAMS.evidenceGap,
});

/** Predicted-success tables (section 6), percent. */
export const BASE_BY_BOX = Object.freeze([50, 60, 70, 80, 88]);
export const FADE_ADJ = Object.freeze([25, 15, 7, 0]);
/** @type {Readonly<Record<number, number>>} */
export const DIFF_ADJ = Object.freeze({ 1: 5, 2: 0, 3: -7, 4: -14 });
export const OBSERVED_MIN = 30;
const CLAMP_LO = 30;
const CLAMP_HI = 97;

/** Default difficulty by box. Not given by the spec; see the M2 report. */
const DEFAULT_DIFF_BY_BOX = Object.freeze([1, 1, 2, 2, 3]);

/**
 * Predicted first-try success, integer percent. Uses their observed rate for
 * the (box, fade, difficulty) cell after OBSERVED_MIN first-try attempts.
 * @param {LearnerState} state
 * @param {number} box
 * @param {number} fade
 * @param {number} d
 */
export function predictedPct(state, box, fade, d) {
  const c = state.cells[cellKey(box, fade, d)];
  let p;
  if (c && c.n >= OBSERVED_MIN) p = Math.round((100 * c.k) / c.n);
  else p = BASE_BY_BOX[Math.max(0, Math.min(4, box))] + FADE_ADJ[Math.max(0, Math.min(3, fade))] + (DIFF_ADJ[d] ?? 0);
  return Math.max(CLAMP_LO, Math.min(CLAMP_HI, p));
}

/**
 * Constructed-response expectation per interaction and fade (section 3):
 * I3 and I8 always; I4 Forge only typed (fade 2+); I6 find, I7 tap, I1, I2,
 * I5 never. The planner plans Forge only as a choice item (fade 0-1).
 * CONTRACT for generators: Problem.constructed must agree with this.
 * @param {Interaction} interaction
 * @param {number} fade
 */
export function expectConstructed(interaction, fade) {
  if (interaction === 'predict' || interaction === 'strike') return true;
  if (interaction === 'forge') return fade >= 2;
  return false;
}

/**
 * Everything the planner and controller derive from the registry and graph.
 * @param {LearnerState} state
 * @param {readonly Generator[]} registry
 * @param {readonly SkillDef[]} graph
 */
export function makeContext(state, registry, graph) {
  const defs = new Map(graph.map((d) => [d.id, d]));
  /** @type {Map<string, Generator[]>} */
  const bySkill = new Map();
  for (const g of registry) {
    if (!defs.has(g.skill)) continue;
    const xs = bySkill.get(g.skill) ?? [];
    xs.push(g);
    bySkill.set(g.skill, xs);
  }
  for (const xs of bySkill.values()) xs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shipped = new Set(bySkill.keys());
  /** @param {string} id @returns {SkillState} */
  const sk = (id) => state.skills[id] ?? emptySkill();
  /** @param {string} id */
  const atLeastBox1 = (id) => sk(id).seen && sk(id).box >= 1;
  /** @param {string} id */
  const fullPreMet = (id) => /** @type {SkillDef} */ (defs.get(id)).pre.every(atLeastBox1);
  /**
   * Servable difficulty range [lo, hi] for a skill, or undefined.
   * @param {string} id
   * @returns {[number, number] | undefined}
   */
  const range = (id) => {
    const gs = bySkill.get(id);
    const def = defs.get(id);
    if (!gs || !def) return undefined;
    const lo = Math.min(...gs.map((g) => g.difficulty[0]));
    let hi = Math.max(...gs.map((g) => g.difficulty[1]));
    if (def.sliceGate && !fullPreMet(id) && !(sk(id).placed && (state.charting[id]?.difficulty ?? 0) > def.sliceGate.maxDifficulty)) {
      hi = Math.min(hi, def.sliceGate.maxDifficulty);
    }
    return lo <= hi ? [lo, hi] : undefined;
  };
  /**
   * A generator for (skill, interaction, d), or undefined.
   * @param {string} id @param {Interaction} interaction @param {number} d
   */
  const genFor = (id, interaction, d) =>
    (bySkill.get(id) ?? []).find((g) => g.interactions.includes(interaction) && d >= g.difficulty[0] && d <= g.difficulty[1]);
  /** @param {string} id */
  const unlockable = (id) => {
    const def = defs.get(id);
    if (!def || sk(id).seen || !shipped.has(id) || !range(id)) return false;
    if (def.pre.every(atLeastBox1)) return true;
    return def.sliceGate !== undefined && def.sliceGate.pre.every(atLeastBox1);
  };
  /** @type {Map<string, number>} */
  const levels = new Map();
  /** @param {string} id @returns {number} */
  const level = (id) => {
    const cached = levels.get(id);
    if (cached !== undefined) return cached;
    const def = /** @type {SkillDef} */ (defs.get(id));
    const pre = (def.sliceGate ? def.sliceGate.pre : def.pre).filter((p) => defs.has(p));
    const v = pre.length === 0 ? 0 : 1 + Math.max(...pre.map(level));
    levels.set(id, v);
    return v;
  };
  return { state, graph, defs, bySkill, shipped, sk, range, genFor, unlockable, level, fullPreMet };
}

/** @typedef {ReturnType<typeof makeContext>} Ctx */

/**
 * Knots for the next run: 10, dropping by one (floor 8) whenever the median
 * of the last 3 completed sessions exceeded 10 minutes.
 * @param {LearnerState} state
 */
export function knotsForRun(state) {
  const done = state.sessions.filter((s) => s.endT !== null);
  const prev = state.sessions.length ? state.sessions[state.sessions.length - 1].knots : 10;
  if (done.length < 3) return Math.max(8, Math.min(10, prev));
  const mins = done.slice(-3).map((s) => Date.parse(/** @type {string} */ (s.endT)) - Date.parse(s.startT)).sort((a, b) => a - b);
  const median = mins[1];
  return median > 10 * 60 * 1000 ? Math.max(8, prev - 1) : Math.max(8, Math.min(10, prev));
}

/**
 * New skills allowed this run (section 6).
 * @param {Ctx} ctx
 * @param {typeof DEFAULT_PLANNER_PARAMS} p
 */
export function newSkillCap(ctx, p) {
  const recent = ctx.state.sessions.filter((s) => firstTryStats(s.attempts).n > 0).slice(-2);
  if (recent.length === 0) return p.newSkillBase; // cold start: no rate yet
  const { n, k } = firstTryStats(recent.flatMap((s) => s.attempts));
  const lowBox = ctx.graph.filter((d) => ctx.sk(d.id).seen && ctx.sk(d.id).box <= 1).length;
  if (100 * k >= p.newRateHigh * n && lowBox <= p.maxLowBoxForHigh) return p.newSkillHigh;
  if (100 * k >= p.newRateMin * n) return p.newSkillBase;
  return 0;
}

/**
 * Does this skill still want evidence (EP below 3, or the mastery evidence
 * conditions not yet met)?
 * @param {SkillState} s
 */
function needsEvidence(s) {
  return !evidenceComplete(s);
}

/** @param {number} n @param {number} lo @param {number} hi */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Choice interactions by box (section 6): box 0-1 I4 (offered faces), I2,
// I5; box 2 adds I6 (find) and I1 Cast; box 3+ as box 2. Constructed: I3 and
// I8 (I8 first at box 3+). The by-box list in section 6 does not name I1;
// it is served from box 2, where the skill has been practised.
const CHOICE_BY_BOX = /** @type {Interaction[][]} */ ([
  ['forge', 'nextline', 'twin'],
  ['forge', 'nextline', 'twin'],
  ['trace', 'nextline', 'twin', 'cast'],
  ['nextline', 'twin', 'trace', 'cast'],
  ['nextline', 'twin', 'trace', 'cast'],
]);
const CR_BY_BOX = /** @type {Interaction[][]} */ ([
  ['predict', 'strike'],
  ['predict', 'strike'],
  ['predict', 'strike'],
  ['strike', 'predict'],
  ['strike', 'predict'],
]);

/**
 * Pick an interaction (and generator) for a skill. Tries the preferred class
 * first, in order (rotated by `rot`), then the other class.
 * @param {Ctx} ctx
 * @param {string} skill
 * @param {boolean} wantCR
 * @param {number} box
 * @param {number} fade
 * @param {number} d
 * @param {number} rot
 * @param {Interaction[]} [prefer]
 * @returns {{ interaction: Interaction; gen: string; constructed: boolean } | undefined}
 */
export function pickInteraction(ctx, skill, wantCR, box, fade, d, rot, prefer) {
  const b = clamp(box, 0, 4);
  const choice = CHOICE_BY_BOX[b].filter((i) => !expectConstructed(i, fade));
  const cr = CR_BY_BOX[b];
  /** @param {Interaction[]} xs */
  const rotate = (xs) => xs.map((_, i) => xs[(i + rot) % xs.length]);
  const first = prefer ?? rotate(wantCR ? cr : choice);
  const order = [...first, ...(wantCR ? choice : cr), ...(wantCR ? cr : choice)];
  for (const i of order) {
    const g = ctx.genFor(skill, i, d);
    if (g) return { interaction: i, gen: g.id, constructed: expectConstructed(i, fade) };
  }
  return undefined;
}

/**
 * @param {Ctx} ctx
 * @param {string} skill
 * @returns {[number, number]}
 */
export function rangeOf(ctx, skill) {
  const r = ctx.range(skill);
  if (r) return r;
  const gs = ctx.bySkill.get(skill) ?? [];
  if (!gs.length) throw new Error(`planRun: skill ${skill} has no generator`);
  return [Math.min(...gs.map((g) => g.difficulty[0])), Math.max(...gs.map((g) => g.difficulty[1]))];
}

/**
 * Build one plan item. Interaction class is decided later (assignForms).
 * @param {Ctx} ctx
 * @param {string} skill
 * @param {ItemKind} kind
 * @param {string} room
 * @param {Attempt['context']} context
 * @param {{ evidence?: boolean; difficulty?: number; fade?: number; workedExample?: boolean; cluster?: string }} [o]
 * @returns {PlanItem}
 */
function item(ctx, skill, kind, room, context, o = {}) {
  const s = ctx.sk(skill);
  const [lo, hi] = rangeOf(ctx, skill);
  const evidence = o.evidence === true;
  const fade = evidence ? 3 : (o.fade ?? s.fade);
  const difficulty = clamp(o.difficulty ?? DEFAULT_DIFF_BY_BOX[clamp(s.box, 0, 4)], lo, hi);
  return {
    room, kind, skill, gen: '', seed: '', difficulty, interaction: 'predict', constructed: true,
    fadeLevel: fade, evidence, context, predicted: 0, whyAfter: false,
    ...(o.workedExample ? { workedExample: true } : {}),
    ...(o.cluster ? { cluster: o.cluster } : {}),
  };
}

/**
 * Skeleton of rooms for a knot count.
 * @param {number} knots
 */
function skeleton(knots) {
  return [
    { label: 'A', size: 2 },
    { label: 'B', size: knots >= 10 ? 2 : 1 },
    { label: 'C', size: knots >= 9 ? 2 : 1 },
    { label: 'D', size: 1 },
  ];
}

/**
 * Warm-up pick: the box 3+ skill with the highest predicted success (section
 * 6). Among equally winnable ones it prefers a due one that no longer needs
 * evidence (section 2's "most winnable due item"; the warm-up then does a
 * review the rooms would otherwise spend a slot on). Cold-start fallback: the highest box that
 * exists, lowest difficulty, one fade step easier; with nothing seen, a d1
 * item of a no-prerequisite skill with full visuals.
 * @param {Ctx} ctx
 * @param {number} today
 * @returns {{ skill: string; fade: number; difficulty: number; cold: boolean; isNew: boolean } | undefined}
 */
function pickWarmup(ctx, today) {
  const seen = ctx.graph.filter((d) => ctx.sk(d.id).seen && ctx.range(d.id)).map((d) => d.id);
  const high = seen.filter((id) => ctx.sk(id).box >= 3);
  if (high.length) {
    /** @param {string} id */
    const score = (id) => {
      const s = ctx.sk(id);
      const lo = rangeOf(ctx, id)[0];
      return [predictedPct(ctx.state, s.box, s.fade, lo), isDue(s, today) && !needsEvidence(s) ? 1 : 0, !needsEvidence(s) ? 1 : 0];
    };
    const best = high.slice().sort((a, b) => {
      const x = score(a); const y = score(b);
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
      return /** @type {SkillDef} */ (ctx.defs.get(a)).n - /** @type {SkillDef} */ (ctx.defs.get(b)).n;
    })[0];
    const s = ctx.sk(best);
    return { skill: best, fade: s.fade, difficulty: rangeOf(ctx, best)[0], cold: false, isNew: false };
  }
  if (seen.length) {
    const maxBox = Math.max(...seen.map((id) => ctx.sk(id).box));
    const cands = seen.filter((id) => ctx.sk(id).box === maxBox);
    const best = cands.sort((a, b) => {
      const sa = ctx.sk(a); const sb = ctx.sk(b);
      const pa = predictedPct(ctx.state, sa.box, Math.max(0, sa.fade - 1), rangeOf(ctx, a)[0]);
      const pb = predictedPct(ctx.state, sb.box, Math.max(0, sb.fade - 1), rangeOf(ctx, b)[0]);
      return pb - pa || /** @type {SkillDef} */ (ctx.defs.get(a)).n - /** @type {SkillDef} */ (ctx.defs.get(b)).n;
    })[0];
    const s = ctx.sk(best);
    return { skill: best, fade: Math.max(0, s.fade - 1), difficulty: rangeOf(ctx, best)[0], cold: true, isNew: false };
  }
  const roots = ctx.graph.filter((d) => d.pre.length === 0 && ctx.range(d.id) && ctx.unlockable(d.id)).sort((a, b) => a.n - b.n);
  if (!roots.length) return undefined;
  const id = roots[0].id;
  return { skill: id, fade: 0, difficulty: rangeOf(ctx, id)[0], cold: true, isNew: true };
}

/** Evidence days per skill that make a Warden eligible (section 8). */
const WARDEN_EP = 2;

/**
 * The cluster the planner is working toward: the first in section 8 order
 * (clusters the data file does not list come last, in graph order) whose
 * Warden is not yet eligible. Undefined once every Warden is.
 * @param {LearnerState} state
 * @param {readonly SkillDef[]} graph
 * @returns {string | undefined}
 */
export function focusCluster(state, graph) {
  const inGraph = [...new Set(graph.map((d) => d.cluster))].filter((c) => c !== 'none');
  const order = [...CLUSTERS.filter((c) => inGraph.includes(c)), ...inGraph.filter((c) => !CLUSTERS.includes(c))];
  return order.find((c) => !wardenEligible(state, c, graph));
}

/**
 * Plan one run.
 * @param {{
 *   state: LearnerState; registry: readonly Generator[]; now: string; rng: Rng;
 *   graph?: readonly SkillDef[]; params?: Partial<typeof DEFAULT_PLANNER_PARAMS>;
 * }} input
 * @returns {Plan}
 */
export function planRun(input) {
  const graph = input.graph ?? ALL_SKILLS;
  const p = { ...DEFAULT_PLANNER_PARAMS, ...(input.params ?? {}) };
  const { state, rng } = input;
  const today = dayOf(input.now);
  const ctx = makeContext(state, input.registry, graph);
  const knots = knotsForRun(state);
  /** @type {string[]} */
  const notes = [];
  const n = (/** @type {string} */ id) => /** @type {SkillDef} */ (ctx.defs.get(id)).n;
  /** @param {string} a @param {string} b */
  const sliceTie = (a, b) => (p.sliceFirst ? Number(/** @type {SkillDef} */ (ctx.defs.get(b)).slice) - Number(/** @type {SkillDef} */ (ctx.defs.get(a)).slice) : 0);
  const servableSeen = graph.filter((d) => ctx.sk(d.id).seen && ctx.range(d.id)).map((d) => d.id);
  /** @param {string} id */
  const evidenceEligible = (id) => {
    const s = ctx.sk(id);
    return s.box >= EVIDENCE_MIN_BOX && needsEvidence(s) && gapPassed(s, today, p.evidenceGap);
  };

  // ---- warm-up
  const warm = pickWarmup(ctx, today);
  if (!warm) throw new Error('planRun: nothing servable (empty registry?)');

  // ---- probes: one strike generator must exist at the probe difficulty
  const probes = probesForRun(state, ctx.shipped, graph).filter((id) => {
    const r = ctx.range(id) ?? (ctx.bySkill.has(id) ? [1, 4] : undefined);
    if (!r) return false;
    const d = probeDifficulty(/** @type {SkillDef} */ (ctx.defs.get(id)));
    return (ctx.bySkill.get(id) ?? []).some((g) => g.interactions.includes('strike') && d >= g.difficulty[0] && d <= g.difficulty[1]);
  });

  // ---- precedence lists
  /** @type {{ skill: string; kind: ItemKind }[]} */
  const prec = [];
  const used = new Set();
  /** @param {string} skill @param {ItemKind} kind */
  const push = (skill, kind) => { if (!used.has(skill)) { used.add(skill); prec.push({ skill, kind }); } };
  // The warm-up's constructed response is the review of a due skill, so that
  // skill leaves the room lists unless it still needs a separate evidence item.
  if (!warm.isNew && isDue(ctx.sk(warm.skill), today) && !evidenceEligible(warm.skill)) used.add(warm.skill);
  // Same for the closer: among the most winnable skills, prefer a due one that
  // is not evidence-eligible, and let the closer carry its review.
  const closerPref = preferredCloser(ctx, today, warm.skill, evidenceEligible);
  if (closerPref) used.add(closerPref);
  for (const r of state.repairs) if (servableSeen.includes(r.skill)) push(r.skill, 'repair');
  // Warden focus: the first cluster (section 8 order) not yet eligible. Its
  // skills still short of the 2 evidence days eligibility needs go first, as
  // an evidence item when they can take one, as a plain review when due.
  const focus = p.wardenFocus ? focusCluster(state, graph) : undefined;
  if (focus !== undefined) {
    const xs = servableSeen.filter((id) => /** @type {SkillDef} */ (ctx.defs.get(id)).cluster === focus
      && evidencePoints(ctx.sk(id)) < WARDEN_EP && (evidenceEligible(id) || isDue(ctx.sk(id), today)))
      .sort((a, b) => evidencePoints(ctx.sk(a)) - evidencePoints(ctx.sk(b)) || n(a) - n(b));
    for (const id of xs) push(id, evidenceEligible(id) ? 'evidence' : 'due');
  }
  /**
   * Lateness of a due skill as an exact fraction [num, den]: days since its
   * last review over its interval (relative), or days past due (absolute).
   * @param {string} id @returns {[number, number]}
   */
  const lateness = (id) => {
    const s = ctx.sk(id);
    return p.overdueOrder === 'relative'
      ? [today - /** @type {number} */ (s.lastReviewDay), Math.max(1, intervalOf(s.box))]
      : [overdueBy(s, today), 1];
  };
  const due = servableSeen.filter((id) => isDue(ctx.sk(id), today)).sort((a, b) => {
    const [na, da] = lateness(a); const [nb, db] = lateness(b);
    return nb * da - na * db || ctx.sk(a).box - ctx.sk(b).box || sliceTie(a, b) || n(a) - n(b);
  });
  for (const id of due) push(id, evidenceEligible(id) ? 'evidence' : 'due');
  const backlog = prec.length; // repairs, focus skills and everything due
  const early = servableSeen.filter((id) => !isDue(ctx.sk(id), today) && evidenceEligible(id)).sort((a, b) => sliceTie(a, b) || n(a) - n(b));
  for (const id of early) push(id, 'evidence');

  // ---- boss
  const clusters = [...new Set(graph.map((d) => d.cluster))].filter((c) => c !== 'none');
  const bossCluster = clusters.find((c) => wardenAvailable(state, c, today, graph) && graph.some((d) => d.cluster === c && ctx.genFor(d.id, 'strike', rangeOf(ctx, d.id)?.[0] ?? 0))) ?? null;

  // ---- rooms
  const rooms = skeleton(knots).map((r) => ({ ...r, items: /** @type {(PlanItem | null)[]} */ (Array(r.size).fill(null)), training: false }));
  const roomBy = (/** @type {string} */ l) => /** @type {(typeof rooms)[number]} */ (rooms.find((r) => r.label === l));
  // probes go into D, then the last slot of B, then of C
  const probeSlots = [['D', 0], ['B', -1], ['C', -1]];
  for (const [i, id] of probes.entries()) {
    const [l, pos] = /** @type {[string, number]} */ (probeSlots[i]);
    const r = roomBy(l);
    const at = pos < 0 ? r.size - 1 : pos;
    if (r.size < 1 || r.items[at] !== null) continue;
    const it = item(ctx, id, 'probe', l, 'charting', { fade: 3 });
    const d = probeDifficulty(/** @type {SkillDef} */ (ctx.defs.get(id)));
    const g = (ctx.bySkill.get(id) ?? []).find((x) => x.interactions.includes('strike') && d >= x.difficulty[0] && d <= x.difficulty[1]);
    Object.assign(it, { difficulty: d, interaction: 'strike', constructed: true, fadeLevel: 3, gen: g ? g.id : '' });
    r.items[at] = it;
  }
  const probesPlaced = rooms.flatMap((r) => r.items).filter((x) => x && x.kind === 'probe').map((x) => /** @type {PlanItem} */ (x).skill);

  // ---- new skills (after repairs, due and early evidence: precedence)
  const slotsFree = rooms.reduce((t, r) => t + r.items.filter((x) => x === null).length, 0) + 1; // + vault/boss
  // Room C first (header, rule 4), unless nothing has been seen yet: then
  // there is nothing to review first and the worked example opens the run.
  const freeTwoRooms = (servableSeen.length ? ['C', 'A', 'B'] : ['A', 'C', 'B']).map(roomBy).filter((r) => r.size === 2 && r.items.every((x) => x === null));
  const cap = newSkillCap(ctx, p);
  const cands = graph.filter((d) => ctx.unlockable(d.id) && d.id !== warm.skill && !probesPlaced.includes(d.id))
    .sort((a, b) => (p.sliceFirst ? Number(b.slice) - Number(a.slice) : 0) || ctx.level(a.id) - ctx.level(b.id) || a.n - b.n).map((d) => d.id);
  /** @type {string[]} */
  const newSkills = [];
  if (warm.isNew) newSkills.push(warm.skill);
  let leftover = slotsFree - prec.length;
  for (const id of cands) {
    if (newSkills.length >= Math.max(cap, warm.isNew ? 1 : 0)) break;
    if (newSkills.length >= freeTwoRooms.length) break;
    const reserved = newSkills.length < p.reserveTraining && backlog <= p.newSkillBacklogMax;
    if (!reserved && leftover < 2) break;
    newSkills.push(id);
    leftover -= 2;
  }
  if (warm.isNew && newSkills.length > freeTwoRooms.length) notes.push('no room for the training room');
  for (const [i, id] of newSkills.entries()) {
    const r = freeTwoRooms[i];
    if (!r) break;
    r.training = true;
    const lo = rangeOf(ctx, id)[0];
    r.items = [
      item(ctx, id, 'training', r.label, 'blocked', { fade: 0, difficulty: lo, workedExample: true }),
      item(ctx, id, 'training', r.label, 'blocked', { fade: 0, difficulty: lo }),
      item(ctx, id, 'training', r.label, 'blocked', { fade: 0, difficulty: lo }),
    ];
  }

  // ---- boss / vault slot
  /** @type {PlanItem | null} */
  let bossItem = null;
  if (bossCluster) {
    const members = graph.filter((d) => d.cluster === bossCluster && ctx.range(d.id)).map((d) => d.id);
    const inPrec = prec.find((e) => members.includes(e.skill) && e.kind === 'evidence' && ctx.genFor(e.skill, 'strike', rangeOf(ctx, e.skill)[0]));
    const pick = inPrec ? inPrec.skill
      : members.filter((id) => ctx.genFor(id, 'strike', rangeOf(ctx, id)[0])).sort((a, b) => evidencePoints(ctx.sk(a)) - evidencePoints(ctx.sk(b)) || n(a) - n(b))[0];
    if (inPrec) prec.splice(prec.indexOf(inPrec), 1);
    // Section 8: a Boss Knot is symbol-only whether or not it is evidence.
    bossItem = item(ctx, pick, 'boss', 'boss', 'boss', { evidence: evidenceEligible(pick), fade: 3, cluster: bossCluster });
  }

  // ---- fill rooms A-D from precedence, keeping consecutive rooms disjoint
  /** @param {number} ri */
  const skillsIn = (ri) => new Set(ri < 0 || ri >= rooms.length ? [] : rooms[ri].items.filter((x) => x !== null).map((x) => /** @type {PlanItem} */ (x).skill));
  /** @param {number} ri @param {string} skill */
  const fits = (ri, skill) => !skillsIn(ri).has(skill) && !skillsIn(ri - 1).has(skill) && !skillsIn(ri + 1).has(skill);
  let relaxed = false;
  /** @param {{ skill: string; kind: ItemKind }} e @param {string} room @returns {PlanItem} */
  const precItem = (e, room) => item(ctx, e.skill, e.kind, room, 'mixed', { evidence: e.kind === 'evidence' });
  const fillerOrder = servableSeen.slice().sort((a, b) => ctx.sk(a).box - ctx.sk(b).box || (ctx.sk(a).lastReviewDay ?? 0) - (ctx.sk(b).lastReviewDay ?? 0) || n(a) - n(b));
  for (const [ri, r] of rooms.entries()) {
    for (let i = 0; i < r.items.length; i++) {
      if (r.items[i] !== null) continue;
      let e = prec.find((x) => fits(ri, x.skill));
      if (e) { prec.splice(prec.indexOf(e), 1); r.items[i] = precItem(e, r.label); continue; }
      // a new skill may fill a slot only after its own Training Room
      const f = fillerOrder.find((id) => fits(ri, id))
        ?? newSkills.find((id) => fits(ri, id) && rooms.slice(0, ri).some((q) => q.training && q.items.some((x) => x !== null && x.skill === id)));
      if (f) { r.items[i] = item(ctx, f, 'practice', r.label, 'mixed'); continue; }
      e = prec[0];
      if (e) { prec.shift(); r.items[i] = precItem(e, r.label); relaxed = true; continue; }
      const any = fillerOrder[0] ?? newSkills[0] ?? warm.skill;
      r.items[i] = item(ctx, any, 'practice', r.label, 'mixed');
      relaxed = true;
    }
  }
  if (relaxed) notes.push('interleave relaxed: not enough distinct skills');
  if (!bossItem) {
    const e = prec.shift();
    if (e) bossItem = item(ctx, e.skill, e.kind === 'evidence' ? 'evidence' : e.kind, 'vault', 'mixed', { evidence: e.kind === 'evidence' });
    else {
      const f = fillerOrder.find((id) => !skillsIn(rooms.length - 1).has(id)) ?? fillerOrder[0] ?? newSkills[0] ?? warm.skill;
      bossItem = item(ctx, f, 'vault', 'vault', 'mixed');
    }
  }
  if (prec.length) notes.push(`deferred: ${prec.map((e) => e.skill).join(', ')}`);
  for (const r of rooms) {
    if (r.training) continue;
    const ids = r.items.filter((x) => x && x.kind !== 'probe').map((x) => /** @type {PlanItem} */ (x).skill);
    if (ids.length > 1 && new Set(ids).size === 1) for (const x of r.items) if (x && x.kind !== 'probe') x.context = 'blocked';
  }

  // ---- warm-up item and the ordered list
  const warmItem = item(ctx, warm.skill, 'warmup', 'warmup', 'warmup', { fade: warm.fade, difficulty: warm.difficulty });
  /** @type {PlanItem[]} */
  let items = [warmItem, ...rooms.flatMap((r) => /** @type {PlanItem[]} */ (r.items)), bossItem];

  // ---- zones: at least 2 once 2 exist
  const zonesSeen = new Set(servableSeen.map((id) => /** @type {SkillDef} */ (ctx.defs.get(id)).zone));
  const zoneOf = (/** @type {string} */ id) => /** @type {SkillDef} */ (ctx.defs.get(id)).zone;
  const mainZones = () => new Set(items.filter((x) => x.kind !== 'probe').map((x) => zoneOf(x.skill)));
  if (zonesSeen.size >= 2 && mainZones().size < 2) {
    const z = [...mainZones()][0];
    const other = fillerOrder.find((id) => zoneOf(id) !== z);
    const victimIdx = [...items.keys()].reverse().find((i) => ['practice', 'vault'].includes(items[i].kind))
      ?? [...items.keys()].reverse().find((i) => ['evidence', 'due'].includes(items[i].kind) && items[i].room !== 'boss');
    if (other && victimIdx !== undefined) {
      const v = items[victimIdx];
      items[victimIdx] = item(ctx, other, v.kind === 'vault' ? 'vault' : 'practice', v.room, v.context);
      notes.push('zone swap');
    }
  }

  // ---- forms: first item of a skill is constructed (training: its last item)
  assignForms(ctx, items, rng);

  // ---- predicted, band fill
  for (const it of items) it.predicted = it.kind === 'probe' ? 0 : predictedPct(state, ctx.sk(it.skill).box, it.fadeLevel, it.difficulty);
  bandFill(ctx, items, p);

  // ---- closer: the most winnable config available, never evidence
  const closer = pickCloser(ctx, items, warm, closerPref);
  if (closerPref && closer.skill !== closerPref) notes.push(`closer review deferred: ${closerPref}`);
  items.push(closer);
  assignForms(ctx, items, rng, true);
  for (const it of items) it.predicted = it.kind === 'probe' ? 0 : predictedPct(state, ctx.sk(it.skill).box, it.fadeLevel, it.difficulty);
  // second fill, now that the closer counts toward the mean
  bandFill(ctx, items, p);
  const others = items.slice(0, -1).filter((x) => x.kind !== 'probe');
  if (others.some((x) => x.predicted > items[items.length - 1].predicted)) {
    items[items.length - 1] = pickCloser(ctx, items.slice(0, -1), warm, closerPref);
    assignForms(ctx, items, rng, true);
    const c = items[items.length - 1];
    c.predicted = predictedPct(state, ctx.sk(c.skill).box, c.fadeLevel, c.difficulty);
  }

  // ---- Why follow-ups, about 1 in 4 items
  assignWhys(ctx, items, p, today);

  // ---- choice cap, last, so nothing after it can add a choice item
  if (!enforceChoiceCap(ctx, items)) notes.push('choice cap not met');

  // ---- seeds
  items.forEach((it, i) => { it.seed = rng.fork(`item:${i}`).seed; });

  // ---- doors
  const forks = ['A', 'C'].filter((l) => items.some((x) => x.room === l)).map((l, f) => {
    const own = items.filter((x) => x.room === l);
    const alt = own.map((x, i) => altItem(ctx, x, rng.fork(`door:${f}:${i}`)));
    return { room: l, doors: [{ roomType: roomType(own), items: own }, { roomType: roomType(alt), items: alt }] };
  });

  const main = items.filter((x) => x.kind !== 'probe');
  const sum = main.reduce((t, x) => t + x.predicted, 0);
  const meanPredicted = main.length ? Math.round(sum / main.length) : 0;
  const belowBand = 100 * sum < p.bandLow * 100 * main.length;
  if (belowBand) notes.push('below band');
  if (100 * sum > p.bandHigh * 100 * main.length) notes.push('above band: no item can be made harder');
  return { day: today, knots, items, forks, boss: bossCluster, newSkills, probes: probesPlaced, meanPredicted, belowBand, notes };
}

/**
 * Decide each item's interaction. The first item on a skill in the run is a
 * constructed response, except in a Training Room, where the burst's last
 * item is the constructed one and the earlier items are choice. Evidence
 * items are constructed and symbol-only; Strike is preferred while the skill
 * has no Strike evidence. Later items on a skill are choice items, so they
 * cannot cost a box.
 * @param {Ctx} ctx
 * @param {PlanItem[]} items
 * @param {Rng} rng
 * @param {boolean} [onlyLast] only (re)assign the last item
 */
function assignForms(ctx, items, rng, onlyLast = false) {
  const seenCR = new Set();
  const trainingSkills = new Set(items.filter((x) => x.kind === 'training').map((x) => x.skill));
  for (const [i, it] of items.entries()) {
    if (it.kind === 'probe') continue;
    const s = ctx.sk(it.skill);
    const box = s.box;
    let wantCR;
    /** @type {Interaction[] | undefined} */
    let prefer;
    if (it.evidence) {
      wantCR = true;
      prefer = s.evidence.some((e) => e.interaction === 'strike') ? ['predict', 'strike'] : ['strike', 'predict'];
    } else if (it.kind === 'boss') {
      wantCR = true;
      prefer = ['strike', 'predict'];
    } else if (it.kind === 'training') {
      const last = items.filter((x) => x.kind === 'training' && x.skill === it.skill && x.room === it.room).pop();
      wantCR = last === it;
    } else if (trainingSkills.has(it.skill)) {
      wantCR = false;
    } else {
      wantCR = !seenCR.has(it.skill);
    }
    if (wantCR) seenCR.add(it.skill);
    if (onlyLast && i !== items.length - 1) continue;
    const pick = pickInteraction(ctx, it.skill, wantCR, it.kind === 'training' ? 0 : box, it.fadeLevel, it.difficulty, rng.int(0, 3), prefer);
    if (!pick) throw new Error(`planRun: no generator for ${it.skill} at d${it.difficulty}`);
    if (it.evidence && !pick.constructed) it.evidence = false;
    Object.assign(it, pick);
  }
}

/**
 * Move difficulties to bring the mean predicted rate into [bandLow, bandHigh].
 * Training, warm-up and closer items stay at their lowest difficulty.
 * @param {Ctx} ctx
 * @param {PlanItem[]} items
 * @param {typeof DEFAULT_PLANNER_PARAMS} p
 */
function bandFill(ctx, items, p) {
  const adj = items.filter((x) => !['probe', 'training', 'warmup', 'closer'].includes(x.kind));
  const main = items.filter((x) => x.kind !== 'probe');
  if (!main.length) return;
  /** @param {PlanItem} x @param {number} d */
  const pred = (x, d) => predictedPct(ctx.state, ctx.sk(x.skill).box, x.fadeLevel, d);
  /** @param {PlanItem} x @param {number} d */
  const ok = (x, d) => ctx.genFor(x.skill, x.interaction, d) !== undefined;
  const total = () => main.reduce((t, x) => t + x.predicted, 0);
  for (let guard = 0; guard < 64 && total() < p.bandLow * main.length; guard++) {
    let best = null; let gain = 0;
    for (const x of adj) {
      const d = x.difficulty - 1;
      if (d < rangeOf(ctx, x.skill)[0] || !ok(x, d)) continue;
      const raw = pred(x, d) - x.predicted;
      if (raw <= 0) continue;
      const g = raw + (x.evidence ? 0 : 0.5); // prefer easing non-evidence items
      if (g > gain) { gain = g; best = x; }
    }
    if (!best) break;
    best.difficulty -= 1;
    best.predicted = pred(best, best.difficulty);
    best.gen = /** @type {Generator} */ (ctx.genFor(best.skill, best.interaction, best.difficulty)).id;
  }
  for (let guard = 0; guard < 64 && total() > p.bandHigh * main.length; guard++) {
    let best = null; let loss = Infinity;
    for (const x of adj) {
      const d = x.difficulty + 1;
      if (d > rangeOf(ctx, x.skill)[1] || !ok(x, d)) continue;
      const l = x.predicted - pred(x, d);
      if (total() - l < p.bandLow * main.length) continue;
      if (l < loss) { loss = l; best = x; }
    }
    if (!best) break;
    best.difficulty += 1;
    best.predicted = pred(best, best.difficulty);
    best.gen = /** @type {Generator} */ (ctx.genFor(best.skill, best.interaction, best.difficulty)).id;
  }
}

/**
 * The closer: the highest predicted success available. Candidates are every
 * seen, servable skill at its lowest difficulty and current fade (one step
 * easier under the cold-start fallback), and every config already in the
 * plan, so the closer is never less winnable than any planned item.
 * @param {Ctx} ctx
 * @param {PlanItem[]} items
 * @param {{ skill: string; fade: number; difficulty: number; cold: boolean }} warm
 * @param {string | undefined} pref a due skill to prefer among equally winnable ones
 * @returns {PlanItem}
 */
function pickCloser(ctx, items, warm, pref) {
  /** @type {{ skill: string; fade: number; d: number; pr: number; box: number }[]} */
  const cands = [];
  const high = ctx.graph.some((d) => ctx.sk(d.id).seen && ctx.range(d.id) && ctx.sk(d.id).box >= 3);
  for (const d of ctx.graph) {
    const s = ctx.sk(d.id);
    if (!s.seen || !ctx.range(d.id)) continue;
    const lo = rangeOf(ctx, d.id)[0];
    for (const f of high ? [s.fade] : [s.fade, Math.max(0, s.fade - 1)]) cands.push({ skill: d.id, fade: f, d: lo, pr: predictedPct(ctx.state, s.box, f, lo), box: s.box });
  }
  for (const x of items) if (x.kind !== 'probe') cands.push({ skill: x.skill, fade: x.fadeLevel, d: x.difficulty, pr: x.predicted, box: ctx.sk(x.skill).box });
  if (!cands.length) cands.push({ skill: warm.skill, fade: warm.fade, d: warm.difficulty, pr: 0, box: 0 });
  cands.sort((a, b) => b.pr - a.pr || (b.skill === pref ? 1 : 0) - (a.skill === pref ? 1 : 0) || b.box - a.box || a.d - b.d);
  const c = cands[0];
  return item(ctx, c.skill, 'closer', 'closer', 'closer', { fade: c.fade, difficulty: c.d });
}

/**
 * A due, non-evidence-eligible skill (not the warm-up's) whose lowest-difficulty
 * item is as winnable as the best available, for the closer to review.
 * @param {Ctx} ctx
 * @param {number} today
 * @param {string} warmSkill
 * @param {(id: string) => boolean} evidenceEligible
 * @returns {string | undefined}
 */
function preferredCloser(ctx, today, warmSkill, evidenceEligible) {
  let best = -1;
  /** @type {{ id: string; pr: number; due: boolean; box: number; n: number }[]} */
  const xs = [];
  for (const d of ctx.graph) {
    const s = ctx.sk(d.id);
    if (!s.seen || !ctx.range(d.id)) continue;
    const pr = predictedPct(ctx.state, s.box, s.fade, rangeOf(ctx, d.id)[0]);
    best = Math.max(best, pr);
    xs.push({ id: d.id, pr, due: isDue(s, today) && !evidenceEligible(d.id) && d.id !== warmSkill, box: s.box, n: d.n });
  }
  const c = xs.filter((x) => x.pr === best && x.due).sort((a, b) => b.box - a.box || a.n - b.n)[0];
  return c ? c.id : undefined;
}

/**
 * Does this item bring a Why follow-up with it (the controller serves one
 * after it)? Mirrors the controller's lookup.
 * @param {Ctx} ctx
 * @param {PlanItem} x
 */
export function bringsWhy(ctx, x) {
  return x.whyAfter && x.kind !== 'why' && (ctx.bySkill.get(x.skill) ?? []).some((g) => g.interactions.includes('why'));
}

/**
 * Choice-item count and total over a list of items as they will be served:
 * every item counts once, and each Why follow-up it brings counts as one more
 * choice item (a Why is a tap, section 3).
 * @param {Ctx} ctx
 * @param {readonly PlanItem[]} items
 */
export function choiceShare(ctx, items) {
  let choice = 0; let total = 0;
  for (const x of items) {
    total++;
    if (!x.constructed) choice++;
    if (bringsWhy(ctx, x)) { total++; choice++; }
  }
  return { choice, total };
}

/**
 * Make the choice share of `items` at most 50%, counting `extra` already-served
 * items, by turning choice items into constructed ones (last first: other
 * kinds, then Training Room items other than the worked example, then review
 * items), and as a last resort dropping Why follow-ups (last first). Items at
 * index < `from` are never changed. Returns whether the cap holds. Mutates.
 * Section 6: "Choice items never exceed 50% of a run."
 * @param {Ctx} ctx
 * @param {PlanItem[]} items
 * @param {{ choice: number; total: number }} [extra]
 * @param {number} [from]
 */
export function enforceChoiceCap(ctx, items, extra = { choice: 0, total: 0 }, from = 0) {
  const over = () => {
    const { choice, total } = choiceShare(ctx, items);
    return 2 * (choice + extra.choice) > total + extra.total;
  };
  /** @type {((x: PlanItem) => boolean)[]} */
  const passes = [
    (x) => x.kind !== 'training' && x.kind !== 'review',
    (x) => x.kind === 'training' && !x.workedExample,
    (x) => x.kind === 'review',
  ];
  for (const pass of passes) {
    for (let i = items.length - 1; i >= from && over(); i--) {
      const it = items[i];
      if (it.constructed || it.kind === 'probe' || it.kind === 'why' || !pass(it)) continue;
      const box = it.kind === 'training' ? 0 : ctx.sk(it.skill).box;
      const pick = pickInteraction(ctx, it.skill, true, box, it.fadeLevel, it.difficulty, 0);
      if (pick && pick.constructed) Object.assign(it, pick);
    }
  }
  for (let i = items.length - 1; i >= from && over(); i--) if (items[i].whyAfter) items[i].whyAfter = false;
  return !over();
}

/**
 * Mark about 1 in 4 items for a Why follow-up, weighted to new skills,
 * recently missed skills, and skills with no counting Why yet. At most one
 * per skill; never on probes or worked examples.
 * @param {Ctx} ctx
 * @param {PlanItem[]} items
 * @param {typeof DEFAULT_PLANNER_PARAMS} p
 * @param {number} today
 */
function assignWhys(ctx, items, p, today) {
  const eligible = items.filter((x) => x.kind !== 'probe' && !x.workedExample && x.kind !== 'closer'
    && (ctx.bySkill.get(x.skill) ?? []).some((g) => g.interactions.includes('why')));
  const want = Math.ceil(items.filter((x) => x.kind !== 'probe').length / p.whyEvery);
  /** @param {PlanItem} x */
  const score = (x) => {
    const s = ctx.sk(x.skill);
    if (x.kind === 'training' && x.constructed) return 0;
    if (s.lastMissDay !== null && today - s.lastMissDay <= 3) return 1;
    if (!s.countingWhy && s.box >= 1) return 2;
    if (!s.countingWhy) return 3;
    return 4;
  };
  const order = eligible.map((x, i) => ({ x, i, sc: score(x) })).sort((a, b) => a.sc - b.sc || a.i - b.i);
  const done = new Set();
  let k = 0;
  for (const { x } of order) {
    if (k >= want) break;
    if (done.has(x.skill)) continue;
    if (x.kind === 'training' && !x.constructed) continue;
    done.add(x.skill);
    x.whyAfter = true;
    k++;
  }
}

/**
 * Alternative door content: same skills, evidence and constructed-ness,
 * swapped interaction where the generator allows.
 * @param {Ctx} ctx
 * @param {PlanItem} x
 * @param {Rng} rng
 * @returns {PlanItem}
 */
function altItem(ctx, x, rng) {
  const y = { ...x, seed: rng.seed };
  if (x.kind === 'probe') return y;
  const pool = /** @type {Interaction[]} */ (x.constructed ? ['predict', 'strike'] : ['forge', 'nextline', 'twin', 'trace', 'cast'])
    .filter((i) => i !== x.interaction && expectConstructed(i, x.fadeLevel) === x.constructed && !(x.evidence && i !== 'strike' && x.interaction === 'strike'));
  for (const i of pool) {
    const g = ctx.genFor(x.skill, i, x.difficulty);
    if (g) return { ...y, interaction: i, gen: g.id };
  }
  return y;
}

/** @param {PlanItem[]} items */
function roomType(items) {
  if (items.some((x) => x.kind === 'training')) return 'training';
  const xs = items.filter((x) => x.kind !== 'probe');
  if (!xs.length) return 'fog';
  /** @type {Record<string, number>} */
  const c = {};
  for (const x of xs) c[x.interaction] = (c[x.interaction] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}
