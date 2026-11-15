// @ts-check
// AnswerSpec conventions (DESIGN.md section 11 frozen type; section 3 judging
// rules). The type says only `expected: Node | Equation | SolutionSet |
// Node[]`; this file fixes what `expected` holds for each kind, validates a
// spec, and prints the key as the text a student would type (the "correct
// answer" line, and the round trip the tests use).
//
//   kind               expected      the response is judged as (judge.js)
//   expr               Node          value-equal to expected (equivExpr), then
//                                    every formPredicate on the typed tree.
//   equation-sides     Equation      the line AFTER the stated move (I2/I3):
//                                    side-wise equal, swap allowed (sameSides),
//                                    then formPredicates on the typed line.
//   equation-multiple  Equation      the ORIGINAL line L0 = R0 (I8 "rewrite as
//                                    ... = 0"): L - R a nonzero rational
//                                    multiple of L0 - R0 (isMultiple), then
//                                    formPredicates (normally 'standard-form').
//   solution-set       SolutionSet   exact equality of root sets; formPredicates
//                                    on every typed value ('radical-simplified').
//   form-of-1          Node          the reference coin, e.g. sqrt(3)/sqrt(3).
//                                    The response must be worth exactly 1. Goal:
//                                    if formPredicates is non-empty they are
//                                    checked on prompt.math multiplied across by
//                                    the response (numerator x numerator over
//                                    denominator x denominator, each part reduced
//                                    to its exact value), e.g. 6sqrt(3)/3 for
//                                    'no-radical-in-denominator'. If empty, the
//                                    goal is reached when that denominator has
//                                    the same value as with the reference coin.
//   form-of-0          Node          the reference zero-pair, e.g. 9 - 9 (add[9,
//                                    neg 9]). The response must be worth exactly
//                                    0. Goal: its first term (the part that is
//                                    added) has the same value as the reference's
//                                    first term (+36 - 36 on x^2 + 6x is legal,
//                                    not closer). formPredicates, if any, on the
//                                    typed response.
//   tuple              Node[]        a comma list, the same length, each entry
//                                    value-equal; formPredicates on each entry.
//                                    When problem.variant is SCALABLE_TUPLE_VARIANT
//                                    ('read-abc', I8 "read a, b, c"), any
//                                    (ka, kb, kc) with k a nonzero rational is
//                                    correct, with a note when k is not 1.
// `assumptions` are added to problem.assumptions for the judge.

import { isEquation } from '../math/ast.js';
import { print } from '../math/print.js';
import { hasForm } from '../math/forms.js';
import { surdToNode } from '../math/surd.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').SolutionSet} SolutionSet */
/** @typedef {import('../../types.d.ts').AnswerSpec} AnswerSpec */

/** problem.variant that makes a tuple accept any nonzero rational multiple. */
export const SCALABLE_TUPLE_VARIANT = 'read-abc';

/** Keypad words for the two non-finite solution sets (section 9). */
export const NO_SOLUTION = 'no solution';
export const ALL_REALS = 'all reals';

export const KINDS = Object.freeze(['expr', 'equation-sides', 'equation-multiple', 'solution-set', 'form-of-1', 'form-of-0', 'tuple']);

/** @param {unknown} x @returns {x is Node} */
export function isNode(x) {
  return typeof x === 'object' && x !== null && typeof /** @type {{t?: unknown}} */ (x).t === 'string' && /** @type {{t: string}} */ (x).t !== 'eq';
}

/** @param {unknown} x @returns {x is SolutionSet} */
export function isSolutionSet(x) {
  if (typeof x !== 'object' || x === null) return false;
  const k = /** @type {{kind?: unknown, roots?: unknown}} */ (x).kind;
  if (k === 'none' || k === 'all') return true;
  return k === 'finite' && Array.isArray(/** @type {{roots?: unknown}} */ (x).roots);
}

/**
 * Problems with a spec, as a list of messages (empty = valid). A spec that
 * fails here is a generator bug; judge() answers 'unverifiable' for it.
 * @param {AnswerSpec} spec
 * @returns {string[]}
 */
export function validateSpec(spec) {
  /** @type {string[]} */
  const errs = [];
  if (!spec || typeof spec !== 'object') return ['spec is not an object'];
  if (!KINDS.includes(spec.kind)) errs.push(`unknown kind ${JSON.stringify(spec.kind)}`);
  if (!Array.isArray(spec.formPredicates)) errs.push('formPredicates is not an array');
  else for (const f of spec.formPredicates) if (!hasForm(f)) errs.push(`unknown form predicate ${JSON.stringify(f)}`);
  if (!Array.isArray(spec.assumptions)) errs.push('assumptions is not an array');
  if (spec.solvedFor !== undefined && (spec.kind !== 'expr' || typeof spec.solvedFor !== 'string' || spec.solvedFor === '')) errs.push('solvedFor must be a variable name, on an expr spec');
  const x = spec.expected;
  switch (spec.kind) {
    case 'expr': case 'form-of-1': case 'form-of-0':
      if (!isNode(x)) errs.push(`${spec.kind}: expected must be a Node`);
      break;
    case 'equation-sides': case 'equation-multiple':
      if (!isEquation(x)) errs.push(`${spec.kind}: expected must be an Equation`);
      break;
    case 'solution-set':
      if (!isSolutionSet(x)) errs.push('solution-set: expected must be a SolutionSet');
      else if (x.kind === 'finite' && x.roots.length === 0) errs.push('solution-set: an empty finite set must be { kind: "none" }');
      break;
    case 'tuple':
      if (!Array.isArray(x) || x.length === 0 || !x.every(isNode)) errs.push('tuple: expected must be a non-empty Node[]');
      break;
  }
  return errs;
}

/**
 * A solution set as typed text: "1 - sqrt(3), 1 + sqrt(3)", "no solution", "all reals".
 * @param {SolutionSet} s
 * @returns {string}
 */
export function solutionSetText(s) {
  if (s.kind === 'none') return NO_SOLUTION;
  if (s.kind === 'all') return ALL_REALS;
  return s.roots.map((r) => print(surdToNode(r))).join(', ');
}

/**
 * The key as keypad text (ASCII; plus-minus is never used). judge() on this
 * text is 'correct' for every valid spec whose expected form passes its own
 * predicates (the tests check exactly that).
 * @param {AnswerSpec} spec
 * @returns {string}
 */
export function answerText(spec) {
  const x = spec.expected;
  if (spec.kind === 'solution-set') return solutionSetText(/** @type {SolutionSet} */ (x));
  if (spec.kind === 'tuple') return /** @type {Node[]} */ (x).map((n) => print(n)).join(', ');
  return print(/** @type {Node | Equation} */ (x));
}
