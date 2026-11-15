// @ts-check
// Mal-rule 6 (DESIGN.md section 5): the Half-Hand.
// Applies wherever the prompt holds multiplier x (sum): the multiplier reaches
// the first term only, the later terms are copied (3(x + 4) -> 3x + 4;
// -3(2x - 5) -> -6x - 5). A bare minus sign is the multiplier -1:
// -(5x - 1) -> -5x - 1. That line is also the Sign-Thief's (mal-rule 7), so on
// a bare -(sum) the answer is diagnosed 'ambiguous' (section 5) and the
// generators, which reject items where two rules share an output, do not
// serve -(sum) as a diagnosable item.
// Expression items give the rewritten expression; solve items give the
// solution set of the equation rewritten that way.

import { defineMalRule, lift, rewriteWhere, productWithSum, sum, times, simp } from '../kit.js';

export default defineMalRule({
  id: 'partial-distribution',
  n: 6,
  haunt: 'the Half-Hand',
  standardTerm: 'distributed to the first term only',
  script: 'The multiplier reached the first term only. It multiplies every term.',
  skills: ['distribute', 'solve-linear', 'poly-multiply'],
  outputs(p) {
    return lift(p, (tree) => rewriteWhere(tree, (n) => {
      const s = productWithSum(n);
      if (!s) return [];
      return [sum([simp(times(s.mult, s.terms[0])), ...s.terms.slice(1)])];
    }).map(simp));
  },
});
