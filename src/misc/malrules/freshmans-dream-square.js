// @ts-check
// Mal-rule 13 (DESIGN.md section 5): the Spreader.
// Applies wherever the prompt holds (sum)^n, n a whole number 2..6: the power
// is taken term by term ((x + 3)^2 -> x^2 + 9). With a negative term and an
// even n there is a second faithful output that keeps the minus
// ((x - 3)^2 -> x^2 + 9, then x^2 - 9).
// Expression items (and Twin pairs) give the rewritten expression; solve
// items give the solution set of the equation rewritten that way.

import { defineMalRule, lift, rewriteWhere, sum, simp, intOf, isNegTerm } from '../kit.js';

/** @typedef {import('../../../types.d.ts').Node} Node */

export default defineMalRule({
  id: 'freshmans-dream-square',
  n: 13,
  haunt: 'the Spreader',
  standardTerm: 'squared a sum term by term',
  script: 'A squared sum has a middle term. The square has four pieces.',
  skills: ['exp-power-rules', 'poly-multiply', 'factor-special', 'complete-square'],
  outputs(p) {
    return lift(p, (tree) => rewriteWhere(tree, (n) => {
      if (n.t !== 'pow' || n.base.t !== 'add' || n.base.args.length < 2) return [];
      const e = intOf(n.exp);
      if (e === undefined || e < 2n || e > 6n) return [];
      /** @param {Node} t @returns {Node} */
      const pw = (t) => simp({ t: 'pow', base: { t: 'group', arg: t }, exp: n.exp });
      const terms = n.base.args;
      const out = [sum(terms.map(pw))];
      if (e % 2n === 0n && terms.some(isNegTerm)) {
        out.push(sum(terms.map((t) => (isNegTerm(t) ? /** @type {Node} */ ({ t: 'neg', arg: pw(t) }) : pw(t)))));
      }
      return out;
    }).map(simp));
  },
});
