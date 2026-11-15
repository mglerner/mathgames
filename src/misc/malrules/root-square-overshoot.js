// @ts-check
// Mal-rule 18 (DESIGN.md section 5): the Overshoot.
// sqrt(n) x sqrt(n), or (sqrt(n))^2, is read as n^2. Applies to:
//   expression items k/sqrt(n) with the form predicate
//     'no-radical-in-denominator' (the coin sqrt(n)/sqrt(n) is implied), and
//     k/sqrt(n) x c/sqrt(n) with the coin shown: (k c)/n^2
//     (6/sqrt(3) -> 6 sqrt(3)/9);
//   anywhere else a product holds the same square root twice, or a square
//     root is squared: that pair becomes n^2 (sqrt(3) sqrt(3) -> 9).
// Expression items give the rewritten expression; solve items give the
// solution set of the equation rewritten that way.

import { defineMalRule, lift, rewriteWhere, exprOf, isExprItem, over, times, simp, int, intOf, same } from '../kit.js';

/** @typedef {import('../../../types.d.ts').Node} Node */

/** @param {Node} n @returns {n is Extract<Node, { t: 'root' }>} */
const isSqrt = (n) => n.t === 'root' && n.index === 2;
/** @param {Node} r @returns {Node} */
const squared = (r) => simp({ t: 'pow', base: { t: 'group', arg: r }, exp: int(2n) });

/** @param {Node} n @returns {Node[]} */
function alts(n) {
  if (n.t === 'pow' && isSqrt(n.base) && intOf(n.exp) === 2n) return [squared(n.base.radicand)];
  if (n.t === 'mul') {
    for (let i = 0; i < n.args.length; i++) {
      for (let j = i + 1; j < n.args.length; j++) {
        const a = n.args[i];
        if (isSqrt(a) && same(a, n.args[j])) {
          const args = n.args.map((x, k) => (k === i ? squared(a.radicand) : x)).filter((_, k) => k !== j);
          return [args.length === 1 ? args[0] : { t: 'mul', args }];
        }
      }
    }
  }
  return [];
}

export default defineMalRule({
  id: 'root-square-overshoot',
  n: 18,
  haunt: 'the Overshoot',
  standardTerm: 'squared the radicand instead of undoing the root',
  script: 'A square root times itself gives back the radicand.',
  skills: ['sqrt-squared', 'rationalize-denominator'],
  outputs(p) {
    const m = exprOf(p);
    if (m && isExprItem(p)) {
      if (m.t === 'frac' && isSqrt(m.den) && p.answer.formPredicates.includes('no-radical-in-denominator')) {
        return [simp(over(times(m.num, m.den), squared(m.den.radicand)))];
      }
      if (m.t === 'mul' && m.args.length === 2) {
        const [a, b] = m.args;
        if (a.t === 'frac' && b.t === 'frac' && isSqrt(a.den) && same(a.den, b.den)) {
          return [simp(over(times(a.num, b.num), squared(a.den.radicand)))];
        }
      }
    }
    return lift(p, (tree) => rewriteWhere(tree, alts).map(simp));
  },
});
