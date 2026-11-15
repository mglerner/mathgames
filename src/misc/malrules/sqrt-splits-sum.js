// @ts-check
// Mal-rule 15 (DESIGN.md section 5): the Splitter.
// Applies wherever the prompt holds the square root of a sum: the root is
// taken term by term, each term keeping its sign (sqrt(9 + 16) -> 3 + 4;
// sqrt(25 - 9) -> 5 - 3). A term with an exact rational root is written as
// that number; any other stays under its own radical.
// Expression items (and Twin pairs: "Same" on sqrt(9 + 16) vs
// sqrt(9) + sqrt(16)) give the rewritten expression; solve items give the
// solution set of the equation rewritten that way.

import { defineMalRule, lift, rewriteWhere, sum, qNode, hasVar } from '../kit.js';
import { constQ } from '../../math/evaluate.js';
import { sqrtQ, toQ } from '../../math/surd.js';

/** @typedef {import('../../../types.d.ts').Node} Node */

/** @param {Node} t @returns {Node} */
function rootOf(t) {
  const c = hasVar(t) ? undefined : constQ(t);
  const s = c && c.n >= 0n ? sqrtQ(c) : undefined;
  const r = s && toQ(s);
  return r ? qNode(r) : { t: 'root', index: 2, radicand: t };
}

export default defineMalRule({
  id: 'sqrt-splits-sum',
  n: 15,
  haunt: 'the Splitter',
  standardTerm: 'took the square root of a sum term by term',
  script: 'Roots split products, not sums.',
  skills: ['sqrt-product-rule', 'square-roots', 'simplify-radicals'],
  outputs(p) {
    return lift(p, (tree) => rewriteWhere(tree, (n) => {
      if (n.t !== 'root' || n.index !== 2 || n.radicand.t !== 'add' || n.radicand.args.length < 2) return [];
      return [sum(n.radicand.args.map((t) => (t.t === 'neg' ? /** @type {Node} */ ({ t: 'neg', arg: rootOf(t.arg) }) : rootOf(t))))];
    }));
  },
});
