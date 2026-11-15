// @ts-check
// Mal-rule 11 (DESIGN.md section 5): the Copyist.
// a, b, c are read straight off an equation that does not have 0 on one side
// yet. Applies to a one-variable equation of degree 2 with neither side 0:
//   the read-abc tuple (answer.kind 'tuple', variant 'read-abc'): the
//     coefficient of each power as displayed, wherever it stands (that is,
//     the coefficients of L + R), then the same sizes with every other sign
//     pattern ("with or without sign flips"). When the v^2 terms of the two
//     sides are equal and opposite, L + R has no v^2 term: a is then read off
//     one side (its size; the sign patterns cover both sides);
//   'equation-multiple' (I8 "rewrite as ... = 0"): the same lines, EXCEPT
//     L + R = 0 itself, which is the Carrier's line (mal-rule 8). Section 5
//     lists that line under both rules; it is left to the Carrier here so
//     that the two stay separable on the rewrite task. DEVIATION, reported.
// Each output is the line a v^2 + b v + c = 0, one per +/- pair (a line and
// its negative are the same answer). A pattern that is the true standard
// form or its negative is never an output. diagnose.js compares a typed
// (a, b, c) or line with these up to a nonzero rational multiple.
// NOT triggered by keeping v^2 on the right: 0 = 2x^2 - 4x - 6 is correct.

import { defineMalRule, eqn, int, quadraticSides, polyNode, V_READ_ABC } from '../kit.js';
import { add, sub, neg, abs, isZero, qeq } from '../../math/rational.js';

/** @typedef {import('../../../types.d.ts').Q} Q */

/** @param {Q[]} x @param {Q[]} y */
const sameUpToSign = (x, y) => x.every((c, i) => qeq(c, y[i])) || x.every((c, i) => qeq(c, neg(y[i])));

export default defineMalRule({
  id: 'copy-coefficients',
  n: 11,
  haunt: 'the Copyist',
  standardTerm: 'read a, b, c before one side was 0',
  script: 'You copied coefficients. Make one side zero first.',
  skills: ['quadratic-to-standard', 'quadratic-formula'],
  outputs(p) {
    const tuple = p.answer.kind === 'tuple' && p.variant === V_READ_ABC;
    if (!tuple && p.answer.kind !== 'equation-multiple') return [];
    const s = quadraticSides(p);
    if (!s || s.L.every(isZero) || s.R.every(isZero)) return [];
    let read = s.L.map((c, i) => add(c, s.R[i]));
    const carried = read;
    const truth = s.L.map((c, i) => sub(c, s.R[i]));
    // v^2 on both sides, equal and opposite (x^2 + 4x = -x^2 + 30): there is no
    // "the" displayed v^2 coefficient to add up, so the student reads one of the two.
    if (isZero(read[2])) read = [read[0], read[1], abs(s.L[2])];
    if (isZero(read[2]) || isZero(truth[2])) return [];
    /** @type {Q[][]} */
    const cands = [read];
    for (let mask = 0; mask < 8; mask++) cands.push(read.map((c, i) => (mask & (1 << i) ? neg(abs(c)) : abs(c))));
    /** @type {Q[][]} */
    const kept = [];
    for (const c of cands) {
      if (sameUpToSign(c, truth)) continue;
      if (!tuple && sameUpToSign(c, carried)) continue;
      if (kept.some((k) => sameUpToSign(c, k))) continue;
      kept.push(c);
    }
    return kept.map((c) => eqn(polyNode(c, s.v), int(0n)));
  },
});
