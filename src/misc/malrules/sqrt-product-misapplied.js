// @ts-check
// Mal-rule 17 (DESIGN.md section 5): the Smuggler.
// A factor crosses the radical without being rooted or squared. Applies to
// expression items:
//   a square root of a whole number with a square factor s^2 > 1 and a
//     cofactor > 1, anywhere in the prompt: the factor leaves un-rooted,
//     sqrt(s^2 m) -> s^2 sqrt(m) (sqrt(12) -> 4 sqrt(3)). Largest square
//     factor first, then the smaller ones (sqrt(72) -> 36 sqrt(2),
//     9 sqrt(8), 4 sqrt(18)).
//   and, when the prompt is exactly k sqrt(m), k > 1 a whole number: the
//     factor enters un-squared, -> sqrt(k m) (2 sqrt(3) -> sqrt(6)). Both
//     apply to k sqrt(m) with a square factor in m (3 sqrt(54): 27 sqrt(6)
//     or sqrt(162)); section 5 names both as the Smuggler.

import { defineMalRule, exprOf, isExprItem, rewriteWhere, times, int, intOf } from '../kit.js';
import { isqrt } from '../../math/rational.js';

/** @typedef {import('../../../types.d.ts').Node} Node */

/** @param {Node} n @returns {Node[]} */
function leaves(n) {
  if (n.t !== 'root' || n.index !== 2) return [];
  const N = intOf(n.radicand);
  if (N === undefined || N < 8n || N > 1000000n) return [];
  /** @type {Node[]} */
  const out = [];
  for (let s = isqrt(N); s >= 2n; s--) {
    if (N % (s * s) === 0n && N / (s * s) > 1n) out.push(times(int(s * s), { t: 'root', index: 2, radicand: int(N / (s * s)) }));
  }
  return out;
}

export default defineMalRule({
  id: 'sqrt-product-misapplied',
  n: 17,
  haunt: 'the Smuggler',
  standardTerm: 'moved a factor across the radical without rooting or squaring it',
  script: 'A factor crosses the radical sign only by being rooted or squared.',
  skills: ['sqrt-product-rule', 'simplify-radicals'],
  outputs(p) {
    const m = exprOf(p);
    if (!m || !isExprItem(p)) return [];
    const out = rewriteWhere(m, leaves);
    if (m.t === 'mul' && m.args.length === 2) {
      const k = intOf(m.args[0]);
      const r = m.args[1];
      const rad = r.t === 'root' && r.index === 2 ? intOf(r.radicand) : undefined;
      if (k !== undefined && k > 1n && rad !== undefined && rad > 1n) out.push({ t: 'root', index: 2, radicand: int(k * rad) });
    }
    return out;
  },
});
