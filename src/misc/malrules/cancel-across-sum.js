// @ts-check
// Mal-rule 14 (DESIGN.md section 5): the Crosser.
// A term of a sum is cancelled against the other part of a fraction as if it
// were a factor. Applies wherever the prompt holds a fraction with a sum on
// top or bottom. "Cancels" means the two single terms divide to a single
// term with a whole-number coefficient (6/3, 2x/2, x/x).
//   sum over one term:  each term that cancels is divided, the rest copied,
//     the bar dropped ((x + 6)/3 -> x + 2). If the quotient is 1 there is
//     also the crossed-out form with that term gone ((x + 3)/x -> 4, then 3).
//   one term over a sum: the mirror image (x/(x + 3) -> 1/4, then 1/3).
//   sum over sum: each cancelling pair of terms ((x + 6)/(x + 3) -> 7/4, 2,
//     (x + 2)/(x + 1)).
// Expression items give the rewritten expression; solve items give the
// solution set of the equation rewritten that way.

import { defineMalRule, lift, rewriteWhere, termsOf, sum, over, simp, int, monoDiv, isOne, same } from '../kit.js';

/** @typedef {import('../../../types.d.ts').Node} Node */

/** @param {Node[]} N @param {Node[]} D @returns {Node} */
function build(N, D) {
  const top = N.length ? sum(N) : int(1n);
  const bottom = D.length ? sum(D) : int(1n);
  return simp(isOne(bottom) ? top : over(top, bottom));
}

/** @template T @param {T[]} xs @param {number} i @param {T} [x] @returns {T[]} */
function swap(xs, i, x) { return x === undefined ? xs.filter((_, k) => k !== i) : xs.map((y, k) => (k === i ? x : y)); }

/** @param {Node} n @returns {Node[]} */
function alts(n) {
  if (n.t !== 'frac') return [];
  const nt = termsOf(n.num);
  const dt = termsOf(n.den);
  if (nt.length < 2 && dt.length < 2) return [];
  /** @type {Node[]} */
  const out = [];
  if (dt.length === 1) {
    nt.forEach((t, i) => {
      const quo = monoDiv(t, dt[0]);
      if (!quo) return;
      out.push(build(swap(nt, i, quo), []));
      if (isOne(quo)) out.push(build(swap(nt, i), []));
    });
  } else if (nt.length === 1) {
    dt.forEach((t, j) => {
      const quo = monoDiv(t, nt[0]);
      if (!quo) return;
      out.push(build([], swap(dt, j, quo)));
      if (isOne(quo)) out.push(build([], swap(dt, j)));
    });
  } else {
    nt.forEach((t, i) => dt.forEach((d, j) => {
      const quo = monoDiv(t, d);
      const inv = quo ? undefined : monoDiv(d, t);
      if (quo) out.push(build(swap(nt, i, quo), swap(dt, j, int(1n))));
      else if (inv) out.push(build(swap(nt, i, int(1n)), swap(dt, j, inv)));
      if (quo && same(t, d)) out.push(build(swap(nt, i), swap(dt, j)));
    }));
  }
  return out;
}

export default defineMalRule({
  id: 'cancel-across-sum',
  n: 14,
  haunt: 'the Crosser',
  standardTerm: 'cancelled a term instead of a factor',
  script: 'Cancel factors, not terms.',
  skills: ['factor-gcf', 'clear-fractions', 'frac-mult-div'],
  outputs(p) {
    return lift(p, (tree) => rewriteWhere(tree, alts));
  },
});
