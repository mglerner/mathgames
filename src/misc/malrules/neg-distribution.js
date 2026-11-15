// @ts-check
// Mal-rule 7 (DESIGN.md section 5): the Sign-Thief.
// Applies wherever the prompt holds (negative multiplier) x (sum), including
// a bare -(sum): the minus reaches the first term only; each later term is
// multiplied by the size of the multiplier but keeps its own sign
// (-3(2x - 5) -> -6x - 15; -(x - 4) -> -x - 4).
// Expression items give the rewritten expression; solve items give the
// solution set of the equation rewritten that way.

import { defineMalRule, lift, rewriteWhere, productWithSum, sum, times, simp, isNegTerm, hasVar } from '../kit.js';
import { constQ } from '../../math/evaluate.js';

/** @typedef {import('../../../types.d.ts').Node} Node */

/** @param {Node} mult */
function isNegative(mult) {
  if (!hasVar(mult)) { const v = constQ(mult); return !!v && v.n < 0n; }
  return isNegTerm(mult);
}

export default defineMalRule({
  id: 'neg-distribution',
  n: 7,
  haunt: 'the Sign-Thief',
  standardTerm: 'dropped the negative on a later term',
  script: 'The minus reached the first term only.',
  skills: ['distribute', 'solve-linear', 'poly-add-sub'],
  outputs(p) {
    return lift(p, (tree) => rewriteWhere(tree, (n) => {
      const s = productWithSum(n);
      if (!s || !isNegative(s.mult)) return [];
      /** @type {Node} */
      const size = { t: 'neg', arg: s.mult };
      return [sum([simp(times(s.mult, s.terms[0])), ...s.terms.slice(1).map((t) => simp(times(size, t)))])];
    }).map(simp));
  },
});
