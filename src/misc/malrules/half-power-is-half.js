// @ts-check
// Mal-rule 16 (DESIGN.md section 5): the Halver.
// Applies wherever the prompt holds a square root or a 1/2 power: it is read
// as "half of" (sqrt(9) -> 9/2; 9^(1/2) -> 9/2), every such root at once.
// Expression items give the rewritten expression; solve items give the
// solution set of the equation rewritten that way.

import { defineMalRule, lift, rewriteWhere, over, simp, int, hasVar } from '../kit.js';
import { constQ } from '../../math/evaluate.js';

/** @typedef {import('../../../types.d.ts').Node} Node */

/** @param {Node} a @returns {Node} */
const half = (a) => simp(over(a, int(2n)));

export default defineMalRule({
  id: 'half-power-is-half',
  n: 16,
  haunt: 'the Halver',
  standardTerm: "read the 1/2 power, or the square root, as 'half of'",
  script: 'A square root is the number whose square is the radicand, not half of it.',
  skills: ['rational-exponents', 'square-roots', 'sqrt-squared'],
  outputs(p) {
    return lift(p, (tree) => rewriteWhere(tree, (n) => {
      if (n.t === 'root' && n.index === 2) return [half(n.radicand)];
      if (n.t === 'pow' && !hasVar(n.exp)) {
        const e = constQ(n.exp);
        if (e && e.n === 1n && e.d === 2n) return [half(n.base)];
      }
      return [];
    }).map(simp));
  },
});
