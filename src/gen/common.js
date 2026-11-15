// @ts-check
// Shared generator helpers, and THE RECIPE for adding a generator.
// Reference implementation: src/gen/mint/frac-times-whole.core.js with
// test/gen/frac-times-whole.test.js. Copy those two files.
//
// ============================================================ the recipe
//
// 1. One file per generator: src/gen/<zone>/<skill>.<name>.js (zone ids are
//    data/skills.js ZONES), default export a Generator (types.d.ts) made
//    with defineGenerator(). scripts/gen-registry.js globs it; nothing else
//    is edited. Imports: ../../math/*, ../../moves/*, ../../misc/*,
//    ../common.js only (never render/, session/, learner/, proto/).
//
// 2. generate(rng, opts) is pure: every random choice comes from `rng`
//    (fork it by label so one stream does not shift another). Build BACKWARD
//    from the answer: draw the answer's ingredients first, then the prompt.
//    Wrap the draw in rejectionSample(); return undefined from the builder
//    to reject a candidate. Reject until ALL of these hold (section 11):
//      - separated(problem).ok: no mal-rule output is the answer, and
//        outputs of DIFFERENT mal-rules are pairwise different. This runs
//        every registered rule, not only the ones you had in mind;
//      - no solution is 0 or 1, no "2 + 2 = 2 x 2" coincidence (your draw);
//      - a Trace bad line really changes the solution set;
//      - a Cast item has a BFS path of length <= 6 (moves/graph.js
//        chipVerdicts() returns undefined otherwise: reject);
//      - fitsAll(problem): everything displayed fits the width cap.
//    makeProblem() fills the bookkeeping fields; finish with it.
//
// 3. Distractors are ONLY mal-rule outputs: malChoices(problem, rules) then
//    shuffledChoices(). Forge and Cast options are designed alphabets, each
//    with a machine-computed verdict (judge.js recomputes Forge and Cast
//    labels and answers 'unverifiable' on a label that disagrees). A Forge
//    offers a second genuine form of 1 / 0 that misses the goal (verdict
//    'legal-idle', section 3 I4), so the choice is WHICH 1, not whether it
//    is a 1. A Cast shows at most 2 progress chips and a legal-idle chip
//    whenever the alphabet has one (castChoices in balance-moves.core.js).
//
// 4. Problem conventions. The mal-rules (src/misc/malrules/*.js, each with a
//    header saying which shapes it reads) and judge.js read ONLY the Problem,
//    so these shapes are the contract:
//      expression item   prompt.math: Node. answer.kind 'expr', expected =
//                        the result, formPredicates = what "finished" means.
//      solve item        prompt.math: Equation in one variable. answer.kind
//                        'solution-set'. variableKeys = [that variable].
//      next line/predict prompt.math: Equation, prompt.move: the stated
//        on an equation  Move. answer.kind 'equation-sides', expected =
//                        the line after the move (canonicalize(applyMove())).
//      rewrite as = 0    prompt.math: Equation. answer.kind
//                        'equation-multiple', expected = THE ORIGINAL line,
//                        formPredicates ['standard-form'].
//      read a, b, c      variant V_READ_ABC, answer.kind 'tuple', expected
//                        [a, b, c].
//      fill the blank    variant V_FILL_BLANK, prompt.math: Equation whose
//                        blank is blank() on the right side; answer 'expr'.
//      forge             form of 1 / 0: answer.kind 'form-of-1' / 'form-of-0'
//                        (check/answer-spec.js). Fade 0-1: choices, not
//                        constructed. Fade 2-3: typed, constructed, no
//                        choices. A named variant that asks for something
//                        else sets `variant` (V_WHOLE_AS_FRACTION) and uses
//                        'expr'.
//      twin              prompt.math and prompt.twin: the two forms.
//                        choices = twinChoices(): ids TWIN_SAME /
//                        TWIN_DIFFERENT. Tag "same" on a different pair with
//                        the mal-rule that turns one form into the other
//                        (a near-miss pair that no rule produces is left
//                        untagged: "same" on it is unclassified), and
//                        "different" on an equivalent pair with
//                        'form-change-changes-value'. `answer` is the key of
//                        the typed follow-up (section 3 I5). Equivalent
//                        pair: 'form-of-1' (the coin that turns prompt.math
//                        into prompt.twin, with the form predicate that says
//                        so) where one form of 1 connects the forms;
//                        otherwise 'expr' (the common value; at the probe
//                        named in the goal when there is a variable).
//                        Different pair: 'tuple' [value of math, value of
//                        twin] for a numeric pair, 'expr' (the value of
//                        prompt.math at the probe named in the goal) with a
//                        variable. The game judges the follow-up on
//                        { ...problem, constructed: true, choices: undefined }
//                        (followUp()).
//      lantern           variant V_LANTERN ("find its value at x = p"):
//                        probes[0] is that x, answer 'expr' = the number.
//                        The mal-rules answer with THEIR number there.
//      cast              prompt.math: Equation; choices[i].display: a Move,
//                        with verdict and distance from chipVerdicts();
//                        problem.moveGraph from the same call. The generator
//                        has alphabet(state). A one-way generator sets
//                        variant V_ONE_WAY (mal-rule 12 then tags its
//                        multiply / divide-by-variable chips).
//      trace             problem.steps: the worked lines; a planted bad
//                        line has legal: false and its malrule (each later
//                        line follows correctly from the line before it).
//                        choices = traceChoices(steps): ids 'L1', 'L2', ...
//                        (the line index) and TRACE_NONE ("No bad line").
//      why               counting forms have variant 'hidden-1', 'hidden-0'
//                        or 'repair' (learner/mastery.js). hidden-1/0:
//                        prompt.math is the worked step, choices =
//                        tapTargets(): each id is the mathdom data-path of a
//                        sub-expression of prompt.math ('e.0.1'), display =
//                        that sub-expression, exactly one 'correct'.
//    constructed must equal constructedFor(interaction, fadeLevel), which
//    mirrors session/planner.js expectConstructed (the planner's contract).
//    visuals: use fadeVisuals(): all at fade 0-1, the first at fade 2, none
//    at fade 3 (an evidence item is symbol-only). probes: probeEnvs().
//    A generator must throw (defineGenerator does it) when asked for an
//    interaction, difficulty or fade it does not offer.
//
// 5. Test: test/gen/<skill>.test.js calls runGeneratorSuite() from
//    test/gen/harness.js and nothing else. See that file's header.
//    Run: node scripts/gen-registry.js && node --test test/gen/<skill>.test.js
//
// ============================================================ notes
//
// Display width: gen may not import render/ (layering), and a generator's
// accept / reject decisions must never depend on which module happens to be
// loaded (the same seed must give the same item in the game, in the tests
// and next year). So fitsDisplay() uses ONE fixed estimate,
// conservativeWidth(): whatever it lets through, render/mathdom.js
// fitsDisplay() lets through too, and for an expression it is never below
// mathdom's displayWidth() (test/misc/common.test.js, 40000 random trees;
// that is a test over random trees, not a proof). There is no
// global hook to swap it; a caller that really wants another estimate passes
// it per call (opts.estimate). The harness re-checks every displayed tree
// with the real mathdom estimate.

import { malrules, outputsOf, matchesKey, sameOutput, ruleMatches } from '../misc/diagnose.js';
import { BLANK, TWIN_SAME, TWIN_DIFFERENT, V_FILL_BLANK, V_WHOLE_AS_FRACTION, V_READ_ABC, V_ONE_WAY, V_LANTERN } from '../misc/kit.js';
import { isEquation } from '../math/ast.js';
import { print } from '../math/print.js';
import { q } from '../math/rational.js';
import { evaluate } from '../math/evaluate.js';
import { seq } from '../math/surd.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Move} Move */
/** @typedef {import('../../types.d.ts').Env} Env */
/** @typedef {import('../../types.d.ts').Rng} Rng */
/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Choice} Choice */
/** @typedef {import('../../types.d.ts').Generator} Generator */
/** @typedef {import('../../types.d.ts').Interaction} Interaction */
/** @typedef {import('../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../misc/kit.js').MalRuleX} MalRuleX */
/** @typedef {{ difficulty: number; interaction: Interaction; fadeLevel: number }} GenOpts */

export { BLANK, TWIN_SAME, TWIN_DIFFERENT, V_FILL_BLANK, V_WHOLE_AS_FRACTION, V_READ_ABC, V_ONE_WAY, V_LANTERN };

// ---------------------------------------------------------------- generator shell

/**
 * Wrap a generator: validates opts (throws on an interaction, difficulty or
 * fade the generator does not offer) and freezes the result.
 * @param {{ id: string; version: number; skill: string; difficulty: [number, number];
 *   interactions: Interaction[]; build: (rng: Rng, opts: GenOpts) => Problem;
 *   alphabet?: (state: Equation) => Move[] }} def
 * @returns {Generator}
 */
export function defineGenerator(def) {
  /** @type {Generator} */
  const g = {
    id: def.id, version: def.version, skill: def.skill, difficulty: def.difficulty, interactions: def.interactions,
    generate(rng, opts) {
      if (!def.interactions.includes(opts.interaction)) throw new RangeError(`${def.id}: interaction ${JSON.stringify(opts.interaction)} not offered`);
      if (!Number.isInteger(opts.difficulty) || opts.difficulty < def.difficulty[0] || opts.difficulty > def.difficulty[1]) {
        throw new RangeError(`${def.id}: difficulty ${opts.difficulty} outside [${def.difficulty.join(', ')}]`);
      }
      if (![0, 1, 2, 3].includes(opts.fadeLevel)) throw new RangeError(`${def.id}: bad fadeLevel ${opts.fadeLevel}`);
      return def.build(rng, opts);
    },
  };
  if (def.alphabet) g.alphabet = def.alphabet;
  return Object.freeze(g);
}

/** Hard cap on rejection-sampling tries. */
export const MAX_TRIES = 400;

/**
 * Rejection sampling with a hard cap. `build` gets a fresh fork of rng for
 * each try (so a try does not depend on how many numbers earlier tries drew)
 * and returns the item, or undefined to reject. Throws, naming the seed,
 * when no try is accepted.
 * @template T
 * @param {string} genId
 * @param {Rng} rng
 * @param {(r: Rng, attempt: number) => T | undefined} build
 * @param {number} [maxTries]
 * @returns {T}
 */
export function rejectionSample(genId, rng, build, maxTries = MAX_TRIES) {
  for (let i = 0; i < maxTries; i++) {
    const x = build(rng.fork(`try:${i}`), i);
    if (x !== undefined) return x;
  }
  throw new Error(`${genId}: no valid item in ${maxTries} tries for seed ${JSON.stringify(rng.seed)}`);
}

/**
 * Must agree with session/planner.js expectConstructed (section 3): Predict
 * and Strike always; Forge only when typed (fade 2+); the rest never.
 * @param {Interaction} interaction @param {number} fadeLevel
 */
export function constructedFor(interaction, fadeLevel) {
  if (interaction === 'predict' || interaction === 'strike') return true;
  if (interaction === 'forge') return fadeLevel >= 2;
  return false;
}

/**
 * Visuals for a fade level: all at 0-1, the first (primary) at 2, none at 3
 * (symbol-only). Simplest reading of sections 6 and 7; reported.
 * @param {number} fadeLevel @param {string[]} visuals primary first
 * @returns {string[]}
 */
export function fadeVisuals(fadeLevel, visuals) {
  if (fadeLevel >= 3) return [];
  return fadeLevel === 2 ? visuals.slice(0, 1) : visuals.slice();
}

/**
 * The Problem id: everything that makes an item, in a fixed order.
 * @param {{ id: string; version: number }} gen @param {string} seed @param {GenOpts} opts
 */
export function problemId(gen, seed, opts) {
  return `${gen.id}@${gen.version}/${opts.interaction}/d${opts.difficulty}/f${opts.fadeLevel}/${seed}`;
}

/**
 * Fill the bookkeeping fields of a Problem. `seed` must be the seed of the
 * rng that generate() was called with (not of a fork), so that
 * makeRng(problem.seed) regenerates the item.
 * @param {{ id: string; version: number; skill: string }} gen
 * @param {string} seed
 * @param {GenOpts} opts
 * @param {Pick<Problem, 'prompt' | 'answer'> & Partial<Problem>} body
 * @returns {Problem}
 */
export function makeProblem(gen, seed, opts, body) {
  const { visuals, ...rest } = body;
  return {
    id: problemId(gen, seed, opts), gen: gen.id, version: gen.version, seed, skill: gen.skill,
    difficulty: /** @type {1 | 2 | 3 | 4} */ (opts.difficulty), interaction: opts.interaction,
    constructed: constructedFor(opts.interaction, opts.fadeLevel),
    fadeLevel: /** @type {0 | 1 | 2 | 3} */ (opts.fadeLevel),
    assumptions: [], variableKeys: [], probes: [],
    visuals: fadeVisuals(opts.fadeLevel, visuals ?? []),
    ...rest,
  };
}

/** The typed follow-up of a tap item (a Twin's "connect the forms"), as the Problem judge() takes. @param {Problem} p @returns {Problem} */
export function followUp(p) {
  const { choices: _choices, ...rest } = p;
  return { ...rest, constructed: true };
}

/** The blank of a fill-the-blank item. @returns {Node} */
export function blank() { return { t: 'var', name: BLANK }; }

// ---------------------------------------------------------------- mal-rule separation

/**
 * The generator contract's mal-rule conditions, over every registered rule:
 *   - no output of any rule is the item's answer;
 *   - no two DIFFERENT rules share an output.
 * On a Twin the question is the tap instead: on an equivalent pair no rule
 * may turn one form into the other; on a different pair at most one may.
 * "Cannot verify" counts as a failure (the item would not be diagnosable).
 * @param {Problem} problem
 * @param {readonly MalRuleX[]} [rules]
 * @returns {{ ok: boolean; why?: string }}
 */
export function separated(problem, rules = malrules) {
  if (problem.interaction === 'twin') {
    const hits = rules.filter((r) => ruleMatches(r, problem, TWIN_SAME)).map((r) => r.id);
    const sameIsRight = (problem.choices ?? []).some((c) => c.id === TWIN_SAME && c.verdict === 'correct');
    if (sameIsRight && hits.length > 0) return { ok: false, why: `${hits[0]} turns one form into the other on an equivalent pair` };
    if (hits.length > 1) return { ok: false, why: `"same" is explained by ${hits.join(' and ')}` };
    return { ok: true };
  }
  // A Why or a Trace find is a tap on a place; no mal-rule output is compared.
  if ((problem.interaction === 'why' || problem.interaction === 'trace') && !problem.constructed) return { ok: true };
  /** @type {{ id: string; out: import('../misc/kit.js').MalOutput }[]} */
  const all = [];
  for (const r of rules) {
    for (const out of outputsOf(r, problem)) {
      if (matchesKey(problem, out) !== false) return { ok: false, why: `${r.id} gives the answer (or cannot be told from it)` };
      all.push({ id: r.id, out });
    }
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].id !== all[j].id && sameOutput(problem, all[i].out, all[j].out) !== false) {
        return { ok: false, why: `${all[i].id} and ${all[j].id} give the same result` };
      }
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------- choices

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

/**
 * Distractors for a line or expression choice item: the first output of each
 * given rule on the problem (rules that do not apply are skipped), each
 * tagged with its rule. Returns undefined (reject the seed) when a
 * distractor is the answer, cannot be told from it, or two of them coincide.
 * Pass the problem WITHOUT choices; the rules read prompt and answer only.
 * @param {Problem} problem
 * @param {readonly MalRuleX[]} rules
 * @returns {Omit<Choice, 'id'>[] | undefined}
 */
export function malChoices(problem, rules) {
  /** @type {Omit<Choice, 'id'>[]} */
  const out = [];
  for (const r of rules) {
    const o = r.apply(problem);
    if (o === undefined) continue;
    if (!isEquation(o) && !('t' in o)) return undefined; // a solution set cannot be a displayed line
    if (matchesKey(problem, o) !== false) return undefined;
    if (out.some((c) => sameOutput(problem, /** @type {Node | Equation} */ (c.display), o) !== false)) return undefined;
    out.push({ display: /** @type {Node | Equation} */ (o), verdict: 'wrong', malrule: r.id });
  }
  return out;
}

/**
 * Does the "majority vote" attack find the key of an equation Next Line?
 * The attack reads no mathematics: it takes the candidate whose left side
 * and right side, as written, are the most common among the candidates.
 * @param {(Node | Equation)[]} lines key first
 * @returns {boolean} true when the attack's unique pick is the key
 */
export function voteFindsKey(lines) {
  if (!lines.every(isEquation)) return false;
  const es = /** @type {Equation[]} */ (lines);
  /** @type {Record<string, number>} */ const L = {};
  /** @type {Record<string, number>} */ const R = {};
  for (const e of es) { const l = print(e.lhs); const r = print(e.rhs); L[l] = (L[l] ?? 0) + 1; R[r] = (R[r] ?? 0) + 1; }
  const score = es.map((e) => L[print(e.lhs)] + R[print(e.rhs)]);
  return score.slice(1).every((x) => x < score[0]);
}

/**
 * Distractors for an equation Next Line that the majority-vote attack
 * (voteFindsKey) cannot solve: every output of every given rule is a
 * candidate (a rule that does a move to one side has two); the largest set
 * of up to 3 on which the attack does not land on the key is drawn. Returns
 * undefined (reject the seed) when malChoices would, or no such set of 2+
 * exists.
 * @param {Rng} rng @param {Problem} problem without choices @param {readonly MalRuleX[]} rules
 * @returns {Omit<Choice, 'id'>[] | undefined}
 */
export function voteProofChoices(rng, problem, rules) {
  if (!malChoices(problem, rules)) return undefined;
  /** @type {Omit<Choice, 'id'>[]} */
  const pool = [];
  for (const r of rules) {
    for (const o of outputsOf(r, problem)) {
      if (!isEquation(o)) continue;
      if (matchesKey(problem, o) !== false) continue;
      if (pool.some((c) => sameOutput(problem, /** @type {Equation} */ (c.display), o) !== false)) continue;
      pool.push({ display: o, verdict: 'wrong', malrule: r.id });
    }
  }
  const key = /** @type {Equation} */ (problem.answer.expected);
  for (const size of [3, 2]) {
    /** @type {Omit<Choice, 'id'>[][]} */
    const sets = [];
    const walk = (/** @type {number} */ from, /** @type {Omit<Choice, 'id'>[]} */ acc) => {
      if (acc.length === size) { if (!voteFindsKey([key, ...acc.map((c) => /** @type {Equation} */ (c.display))])) sets.push(acc); return; }
      for (let i = from; i < pool.length; i++) walk(i + 1, [...acc, pool[i]]);
    };
    walk(0, []);
    if (sets.length > 0) return rng.pick(sets);
  }
  return undefined;
}

/**
 * Shuffle and give ids 'a', 'b', ... (at most 6).
 * @param {Rng} rng @param {Omit<Choice, 'id'>[]} items
 * @returns {Choice[]}
 */
export function shuffledChoices(rng, items) {
  if (items.length > LETTERS.length) throw new RangeError('shuffledChoices: more than 6 choices');
  return rng.shuffle(items).map((c, i) => ({ id: LETTERS[i], ...c }));
}

/**
 * The two Twin choices. display carries the form each button is about (the
 * Choice type needs one); the UI labels the buttons Same / Different.
 * @param {Problem['prompt']} prompt with math and twin
 * @param {boolean} equivalent the truth, computed by the generator with equivExpr
 * @param {string} [malrule] the tag of the wrong tap: on a different pair,
 *   the rule that turns one form into the other; on an equivalent pair it
 *   is always 'form-change-changes-value'
 * @returns {Choice[]}
 */
export function twinChoices(prompt, equivalent, malrule) {
  if (!prompt.twin) throw new TypeError('twinChoices: prompt.twin is missing');
  /** @type {Choice} */
  const same = { id: TWIN_SAME, display: prompt.math, verdict: equivalent ? 'correct' : 'wrong' };
  /** @type {Choice} */
  const diff = { id: TWIN_DIFFERENT, display: prompt.twin, verdict: equivalent ? 'wrong' : 'correct' };
  if (equivalent) diff.malrule = 'form-change-changes-value';
  else if (malrule) same.malrule = malrule;
  return [same, diff];
}

/**
 * Resolve a mathdom data-path ('e', 'e.0.1', 'l.1', 'r') to its Node: 'e' is
 * an expression, 'l' / 'r' the sides of an equation, '.i' the i-th child in
 * ast.js children() order. (render/mathdom.js nodeAtPath is the same rule;
 * gen may not import render, and the harness checks the two agree.)
 * @param {Node | Equation} x @param {string} path
 * @returns {Node | undefined}
 */
export function nodeAtPath(x, path) {
  const parts = path.split('.');
  /** @type {Node | undefined} */
  let n;
  if (isEquation(x)) n = parts[0] === 'l' ? x.lhs : parts[0] === 'r' ? x.rhs : undefined;
  else n = parts[0] === 'e' ? x : undefined;
  for (let i = 1; i < parts.length && n; i++) {
    if (!/^\d+$/.test(parts[i])) return undefined;
    /** @type {Node[]} */
    let kids;
    switch (n.t) {
      case 'add': case 'mul': kids = n.args; break;
      case 'neg': case 'group': kids = [n.arg]; break;
      case 'frac': kids = [n.num, n.den]; break;
      case 'pow': kids = [n.base, n.exp]; break;
      case 'root': kids = [n.radicand]; break;
      default: kids = [];
    }
    n = kids[Number(parts[i])];
  }
  return n;
}

/**
 * Tap targets of a "tap the hidden 1 / 0" Why: one choice per path, in the
 * order given (reading order: do not shuffle), id = the path.
 * @param {Node | Equation} math @param {string[]} paths @param {string} correctPath
 * @returns {Choice[]}
 */
export function tapTargets(math, paths, correctPath) {
  if (!paths.includes(correctPath)) throw new RangeError('tapTargets: the correct path is not a target');
  return paths.map((path) => {
    const node = nodeAtPath(math, path);
    if (!node) throw new RangeError(`tapTargets: no node at ${path}`);
    return { id: path, display: node, verdict: path === correctPath ? 'correct' : 'wrong' };
  });
}

/** Choice id of "No bad line" on a Trace. */
export const TRACE_NONE = 'none';

/**
 * The find-step choices of a Trace: one per line after the first (id 'L<i>',
 * display that line) and "No bad line" (id TRACE_NONE, display the last
 * line). The planted bad line (legal: false) is the correct one; with no bad
 * line, TRACE_NONE is. Not shuffled: the lines are tapped in place.
 * @param {import('../../types.d.ts').Step[]} steps
 * @returns {Choice[]}
 */
export function traceChoices(steps) {
  if (steps.length < 2) throw new RangeError('traceChoices: a chain needs at least 2 lines');
  const bad = steps.findIndex((s) => !s.legal);
  /** @type {Choice[]} */
  const out = [];
  for (let i = 1; i < steps.length; i++) {
    /** @type {Choice} */
    const c = { id: `L${i}`, display: steps[i].line, verdict: i === bad ? 'correct' : 'wrong' };
    out.push(c);
  }
  out.push({ id: TRACE_NONE, display: steps[steps.length - 1].line, verdict: bad < 0 ? 'correct' : 'wrong' });
  return out;
}

// ---------------------------------------------------------------- probes (section 3)

/** Probe values, in order of preference. Never 0 or 1. */
export const PROBE_VALUES = Object.freeze([2, 3, -1, 5, -2]);
/** For a variable declared nonneg or pos. */
export const PROBE_VALUES_NONNEG = Object.freeze([2, 3, 5]);
/** For a variable declared nonneg or pos where a clean square root helps. */
export const PROBE_VALUES_ROOT = Object.freeze([4, 9]);

/**
 * Probe environments for an item's variables (section 3): values from
 * {2, 3, -1, 5, -2}; a variable declared nonneg or pos uses {2, 3, 5}, or
 * {4, 9} with cleanRoot. The k-th env gives the i-th variable the (k + i)-th
 * value, so two variables never share a value in one env when there are at
 * least two values. A 'nonzero' declaration needs nothing: no probe is 0.
 * @param {string[]} variableKeys
 * @param {Assumption[]} [assumptions]
 * @param {{ count?: number; cleanRoot?: boolean }} [opts] count: default 3
 * @returns {Env[]}
 */
export function probeEnvs(variableKeys, assumptions = [], opts = {}) {
  if (variableKeys.length === 0) return [];
  const count = opts.count ?? 3;
  /** @param {string} name */
  const pool = (name) => {
    const nonneg = assumptions.some((a) => a.name === name && (a.rel === 'nonneg' || a.rel === 'pos'));
    return nonneg ? (opts.cleanRoot ? PROBE_VALUES_ROOT : PROBE_VALUES_NONNEG) : PROBE_VALUES;
  };
  const most = Math.min(count, ...variableKeys.map((name) => pool(name).length));
  /** @type {Env[]} */
  const out = [];
  for (let k = 0; k < most; k++) {
    /** @type {Env} */
    const env = {};
    variableKeys.forEach((name, i) => { const ps = pool(name); env[name] = q(ps[(k + i) % ps.length]); });
    out.push(env);
  }
  return out;
}

/**
 * The first probe at which two expressions have different exact values (the
 * witness the Lantern shows), or undefined if none of the envs separates
 * them. Display only: equality is never concluded from agreement.
 * @param {Node} a @param {Node} b @param {Env[]} envs
 * @returns {Env | undefined}
 */
export function separatingProbe(a, b, envs) {
  for (const env of envs) {
    const x = evaluate(a, env);
    const y = evaluate(b, env);
    if (x && y && !seq(x, y)) return env;
  }
  return undefined;
}

// ---------------------------------------------------------------- display width

/** Display-width cap in CSS px: a 375px phone minus two 16px gutters (render/mathdom.js DISPLAY_CAP_PX). */
export const DISPLAY_CAP_PX = 343;

/**
 * The fixed, conservative width estimate: 16px for every character of the
 * one-line printed form, plus 24px (math is drawn at 24px; stacked fractions
 * and exponents are narrower than their printed text). An equation wider
 * than the cap wraps at "=", so its width is then its wider side plus the
 * "=" sign.
 * @param {Node | Equation} x
 * @returns {number} CSS px
 */
export function conservativeWidth(x) {
  const px = (/** @type {Node | Equation} */ y) => 16 * print(y).length + 24;
  const one = px(x);
  if (!isEquation(x) || one <= DISPLAY_CAP_PX) return one;
  return Math.max(px(x.lhs), px(x.rhs)) + 32;
}

/**
 * Does x fit the display-width cap? Pure: the estimate is conservativeWidth
 * unless the caller passes one.
 * @param {Node | Equation} x
 * @param {{ estimate?: (x: Node | Equation) => number; capPx?: number }} [opts]
 */
export function fitsDisplay(x, opts = {}) {
  return (opts.estimate ?? conservativeWidth)(x) <= (opts.capPx ?? DISPLAY_CAP_PX);
}

/**
 * Every tree a Problem displays: prompt.math, prompt.twin, the choice
 * displays (a Move chip: its operand), the expected answer, the worked lines.
 * @param {Problem} p
 * @returns {(Node | Equation)[]}
 */
export function displayedTrees(p) {
  /** @type {(Node | Equation)[]} */
  const out = [p.prompt.math];
  if (p.prompt.twin) out.push(p.prompt.twin);
  if (p.prompt.move && p.prompt.move.operand) out.push(p.prompt.move.operand);
  for (const c of p.choices ?? []) {
    const d = /** @type {{ t?: string; operand?: Node }} */ (c.display);
    if (typeof d.t === 'string') out.push(/** @type {Node | Equation} */ (c.display));
    else if (d.operand) out.push(d.operand);
  }
  const e = p.answer.expected;
  if (Array.isArray(e)) out.push(...e);
  else if ('t' in e) out.push(e);
  for (const s of p.steps ?? []) out.push(s.line);
  return out;
}

/** Does everything the Problem displays fit? @param {Problem} p @param {{ estimate?: (x: Node | Equation) => number; capPx?: number }} [opts] */
export function fitsAll(p, opts = {}) {
  return displayedTrees(p).every((x) => fitsDisplay(x, opts));
}
