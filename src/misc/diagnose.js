// @ts-check
// Diagnosis (DESIGN.md section 5): which mal-rule, if any, explains a wrong
// response. Every comparison is exact (equiv.js / solve.js); "cannot verify"
// never counts as a match.
//
//   diagnose(problem, response)        -> { misconceptions, ambiguous }
//   diagnoseJudged(problem, judged)    the same, straight from a judge() result
//   simulate(rule, problem)            the responses a student with that bug
//                                      gives on the item (tests, Haunt demos)
//   matchesKey / sameOutput            the comparators generators use to keep
//                                      mal-rule outputs apart (src/gen/common.js)
//   statusOfHits / misconceptionStatus the section 5 status rules, pure
//   isHit                              which attempts count as a hit
//
// `response` is what the student produced, already read:
//   a Node            expression items, and typed forms of 1 / 0
//   an Equation       line items (I2/I3 next line, I8 rewrite)
//   a SolutionSet     solve items
//   a Node[]          a tuple (only the read-abc tuple can match a rule)
//   a string          a choice id (Next Line / Forge candidate, Twin tap,
//                     Cast chip, Why target)
// It is compared with EVERY output (applyAll) of EVERY registered rule:
//   expressions       same value (equivExpr);
//   'equation-sides'  the same line, side by side, swap allowed (sameSides);
//   'equation-multiple' and the read-abc tuple
//                     a nonzero rational multiple of the rule's line
//                     (isMultiple), so 2, 4, 6 and 1, 2, 3 are one reading;
//   solution sets     the same set of exact roots;
//   a choice id       the rule's picks() name it; or its displayed line
//                     matches as above; or, on a Twin, the id is "same" and
//                     the rule turns one form into the other.
// One rule matching: tagged. Two or more: ambiguous (all are listed, none is
// to be acted on; learner/model.js ignores ambiguous attempts). None:
// unclassified (the raw response is in the Attempt already).
//
// The rule list is the generated registry (scripts/gen-registry.js), so run
// that script before anything that imports this file.

import { malrules as REGISTRY } from './malrules.generated.js';
import { isEquation, vars } from '../math/ast.js';
import { equivExpr, sameSides, isMultiple } from '../math/equiv.js';
import { sameSolutionSet } from '../math/solve.js';
import { print } from '../math/print.js';
import { toPoly, coeffsIn } from '../math/poly.js';
import { ZERO, ONE } from '../math/rational.js';
import { isNode, isSolutionSet, solutionSetText } from '../check/answer-spec.js';
import { TWIN_SAME, V_READ_ABC, qNode } from './kit.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').SolutionSet} SolutionSet */
/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Attempt} Attempt */
/** @typedef {import('../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../../types.d.ts').Tri} Tri */
/** @typedef {import('./kit.js').MalRuleX} MalRuleX */
/** @typedef {import('./kit.js').MalOutput} MalOutput */
/** @typedef {Node | Equation | SolutionSet | Node[] | string} Response */
/** @typedef {{ misconceptions: string[]; ambiguous: boolean }} Diagnosis */

/** Every registered mal-rule, in section 5 order. */
export const malrules = /** @type {readonly MalRuleX[]} */ (Object.freeze(
  /** @type {MalRuleX[]} */ (REGISTRY.slice()).sort((a, b) => (a.n ?? 0) - (b.n ?? 0)),
));

/** @param {string} id @returns {MalRuleX} */
export function malruleById(id) {
  const r = malrules.find((x) => x.id === id);
  if (!r) throw new RangeError(`unknown mal-rule ${JSON.stringify(id)}`);
  return r;
}

/** Every faithful output of a rule on an item (applyAll, or apply for a plain MalRule). @param {MalRuleX} rule @param {Problem} problem @returns {MalOutput[]} */
export function outputsOf(rule, problem) {
  if (typeof rule.applyAll === 'function') return rule.applyAll(problem);
  const x = rule.apply(problem);
  return x === undefined ? [] : [x];
}

/** @param {Problem} p @returns {Assumption[]} */
function assumptionsOf(p) { return [...(p.assumptions ?? []), ...((p.answer && p.answer.assumptions) ?? [])]; }

/** @param {Problem} p */
function isReadAbc(p) { return p.answer.kind === 'tuple' && p.variant === V_READ_ABC; }

/**
 * (a, b, c) as the line a v^2 + b v + c = 0.
 * @param {Node[]} t @param {string} v @returns {Equation}
 */
function tupleLine(t, v) {
  /** @type {Node} */
  const x = { t: 'var', name: v };
  return {
    t: 'eq',
    lhs: { t: 'add', args: [
      { t: 'mul', args: [{ t: 'group', arg: t[0] }, { t: 'pow', base: x, exp: { t: 'num', q: { n: 2n, d: 1n } } }] },
      { t: 'mul', args: [{ t: 'group', arg: t[1] }, x] },
      { t: 'group', arg: t[2] },
    ] },
    rhs: { t: 'num', q: ZERO },
  };
}

/**
 * Are two results the same answer on this item? true / false, or undefined
 * when the math core cannot decide. Different kinds of thing are never equal.
 * @param {Problem} problem
 * @param {Response | MalOutput} a
 * @param {Response | MalOutput} b
 * @returns {Tri}
 */
export function sameOutput(problem, a, b) {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  const as = assumptionsOf(problem);
  if (isSolutionSet(a) || isSolutionSet(b)) return isSolutionSet(a) && isSolutionSet(b) && sameSolutionSet(a, b);
  let x = a;
  let y = b;
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!isReadAbc(problem)) {
      if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return false;
      /** @type {Tri} */
      let all = true;
      for (let i = 0; i < x.length; i++) {
        const r = equivExpr(x[i], y[i], as).equal;
        if (r === false) return false;
        if (r === undefined) all = undefined;
      }
      return all;
    }
    const other = Array.isArray(x) ? y : x;
    const v = (isEquation(other) ? vars(other)[0] : undefined) ?? vars(problem.prompt.math)[0] ?? 'x';
    /** @param {typeof x} t */
    const line = (t) => (Array.isArray(t) ? (t.length === 3 && t.every(isNode) ? tupleLine(t, v) : undefined) : t);
    const lx = line(x);
    const ly = line(y);
    if (!lx || !ly) return false;
    x = lx; y = ly;
  }
  if (isEquation(x) || isEquation(y)) {
    if (!isEquation(x) || !isEquation(y)) return false;
    return problem.answer.kind === 'equation-sides' ? sameSides(x, y, as) : isMultiple(x, y, as);
  }
  if (!isNode(x) || !isNode(y)) return false;
  return equivExpr(x, y, as).equal;
}

/**
 * Is a mal-rule output the item's correct answer? (A generator must reject a
 * seed where this is not `false` for every output.) For a form of 1 / 0 the
 * question is "is it worth 1 / 0"; for the other kinds it is the judge's own
 * value test, without the form predicates.
 * @param {Problem} problem @param {MalOutput} out
 * @returns {Tri}
 */
export function matchesKey(problem, out) {
  const spec = problem.answer;
  if (spec.kind === 'form-of-1' || spec.kind === 'form-of-0') {
    if (!isNode(out)) return false;
    return equivExpr(out, { t: 'num', q: spec.kind === 'form-of-1' ? ONE : ZERO }, assumptionsOf(problem)).equal;
  }
  return sameOutput(problem, out, /** @type {Response} */ (spec.expected));
}

/** @param {unknown} d */
function isMove(d) { return typeof d === 'object' && d !== null && 'op' in d && !('t' in d); }

/**
 * Does the rule turn one Twin form into the other?
 * @param {MalRuleX} rule @param {Problem} problem
 */
function twinMatch(rule, problem) {
  const a = problem.prompt.math;
  const b = problem.prompt.twin;
  if (!b || isEquation(a) || isEquation(b)) return false;
  if (outputsOf(rule, problem).some((o) => sameOutput(problem, o, b) === true)) return true;
  const flipped = /** @type {Problem} */ ({ ...problem, prompt: { ...problem.prompt, math: b, twin: a } });
  return outputsOf(rule, flipped).some((o) => sameOutput(problem, o, a) === true);
}

/**
 * Does this rule explain this response?
 * @param {MalRuleX} rule @param {Problem} problem @param {Response} response
 * @returns {boolean}
 */
export function ruleMatches(rule, problem, response) {
  try {
    if (typeof response === 'string') {
      const choice = (problem.choices ?? []).find((c) => c.id === response);
      if (!choice) return false;
      if (rule.picks && rule.picks(problem).includes(response)) return true;
      if (problem.interaction === 'twin') return response === TWIN_SAME && twinMatch(rule, problem);
      // A Why target or a Trace line is a tap on a place, not a result: a
      // sub-expression that happens to equal a rule's output proves nothing.
      if (problem.interaction === 'why' || problem.interaction === 'trace') return false;
      const d = choice.display;
      if (isMove(d)) return false;
      return outputsOf(rule, problem).some((o) => sameOutput(problem, /** @type {Node | Equation} */ (d), o) === true);
    }
    // A typed answer on a Twin is the follow-up (the form of 1 that connects
    // the pair), not a rewrite of the prompt: no rule output is comparable.
    if (problem.interaction === 'twin') return false;
    return outputsOf(rule, problem).some((o) => sameOutput(problem, response, o) === true);
  } catch {
    return false;
  }
}

/**
 * @param {Problem} problem
 * @param {Response} response the parsed response, or a choice id
 * @param {{ rules?: readonly MalRuleX[] }} [opts] rules: default every registered rule
 * @returns {Diagnosis}
 */
export function diagnose(problem, response, opts = {}) {
  /** @type {string[]} */
  const hits = [];
  if (problem && problem.prompt && problem.answer && response !== undefined && response !== null) {
    for (const rule of opts.rules ?? malrules) if (ruleMatches(rule, problem, response)) hits.push(rule.id);
  }
  return { misconceptions: hits, ambiguous: hits.length >= 2 };
}

/**
 * Diagnose from a judge() result. Only a miss is diagnosed: verdict 'wrong',
 * or a 'risky' chip (which only a rule with picks() can match: the Lost Root
 * in a one-way Cast, section 3 I1).
 * @param {Problem} problem
 * @param {{ verdict: string; parsed?: unknown; choice?: { id: string } }} judged
 * @param {{ rules?: readonly MalRuleX[] }} [opts]
 * @returns {Diagnosis}
 */
export function diagnoseJudged(problem, judged, opts = {}) {
  if (!judged || (judged.verdict !== 'wrong' && !(judged.verdict === 'risky' && judged.choice))) {
    return { misconceptions: [], ambiguous: false };
  }
  const response = judged.choice ? judged.choice.id : judged.parsed;
  return diagnose(problem, /** @type {Response} */ (response), opts);
}

/**
 * A mal-rule output as the text a student would type on this item.
 * @param {Problem} problem @param {MalOutput} out @returns {string}
 */
export function outputText(problem, out) {
  if (isSolutionSet(out)) return solutionSetText(out);
  if (isEquation(out) && isReadAbc(problem)) {
    const v = vars(out)[0] ?? 'x';
    const p = toPoly({ t: 'add', args: [out.lhs, { t: 'neg', arg: out.rhs }] });
    const cs = (p && coeffsIn(p, v)) || [];
    return [2, 1, 0].map((i) => print(qNode(cs[i] ?? ZERO))).join(', ');
  }
  return print(/** @type {Node | Equation} */ (out));
}

/**
 * What a student with this bug answers on this item: every response the bug
 * can produce ([] when it does not show here). On a typed item, each output
 * as keypad text; on a choice item, the choices the bug leads to (a bug
 * whose result is not among the choices gives nothing).
 * @param {MalRuleX} rule @param {Problem} problem
 * @returns {{ response: string; tapped: boolean }[]}
 */
export function simulate(rule, problem) {
  const choices = problem.choices ?? [];
  /** @type {{ response: string; tapped: boolean }[]} */
  const out = [];
  if (choices.length > 0 && !problem.constructed) {
    for (const c of choices) if (ruleMatches(rule, problem, c.id)) out.push({ response: c.id, tapped: true });
    return out;
  }
  for (const o of outputsOf(rule, problem)) {
    const text = outputText(problem, o);
    if (!out.some((x) => x.response === text)) out.push({ response: text, tapped: false });
  }
  return out;
}

// ---------------------------------------------------------------- status (section 5)

/** @typedef {'none' | 'suspected' | 'active'} MisconceptionStatus */

/**
 * Status of one misconception from its hits:
 *   no hit -> 'none'; 1 hit -> 'suspected';
 *   2 hits on separating items, on 2 different items -> 'active'.
 * A hit is one unambiguous tag, so every hit is on a separating item (an
 * ambiguous answer is never tagged to one rule and never becomes a hit).
 * "Different items" are different (gen, seed) pairs: the same seed served
 * twice is one item. Charting hits stay "suspected (charting)" and never
 * make a misconception active (section 6: no Haunt spawns from a probe).
 * The hit shape is what learner/model.js stores in state.misconceptions[tag].
 * @param {readonly { gen: string; seed: string; charting?: boolean }[]} hits
 * @returns {MisconceptionStatus}
 */
export function statusOfHits(hits) {
  if (!hits || hits.length === 0) return 'none';
  const items = new Set(hits.filter((h) => !h.charting).map((h) => `${h.gen}|${h.seed}`));
  return items.size >= 2 ? 'active' : 'suspected';
}

/**
 * Is this attempt a hit (a tagged miss)? A 'wrong' attempt with a tag and
 * ambiguous: false; or a 'risky' one with a tag. A risky verdict carries a tag
 * only when a rule's picks() named the tapped chip: the "/ x" tap on a one-way
 * Cast, which section 3 I1 calls "a tagged miss (mal-rule 12)" (diagnoseJudged
 * tags nothing else on a risky verdict; elsewhere Risky is a caution).
 * learner/model.js must use the same test when it records hits.
 * @param {Pick<Attempt, 'verdict' | 'ambiguous' | 'misconceptions'>} a
 */
export function isHit(a) {
  return (a.verdict === 'wrong' || a.verdict === 'risky') && !a.ambiguous
    && Array.isArray(a.misconceptions) && a.misconceptions.length > 0;
}

/**
 * The same, straight from attempts (in any order): the status of every
 * misconception that has at least one hit (isHit).
 * @param {readonly Attempt[]} attempts
 * @returns {Record<string, MisconceptionStatus>}
 */
export function misconceptionStatus(attempts) {
  /** @type {Record<string, { gen: string; seed: string; charting: boolean }[]>} */
  const hits = {};
  for (const a of attempts) {
    if (!isHit(a)) continue;
    for (const tag of a.misconceptions) {
      (hits[tag] ??= []).push({ gen: a.problem.gen, seed: a.problem.seed, charting: a.context === 'charting' });
    }
  }
  /** @type {Record<string, MisconceptionStatus>} */
  const out = {};
  for (const tag of Object.keys(hits)) out[tag] = statusOfHits(hits[tag]);
  return out;
}
