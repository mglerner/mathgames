// @ts-check
// Mal-rule 4 (DESIGN.md section 5): the Half-Coin.
// The form of 1 is applied to the numerator only or to the denominator only.
// Applies to:
//   'form-of-1' (Forge, and the typed "connect the forms" follow-up of a
//     Twin): with reference coin c/d, the coins c/1 and 1/d
//     (sqrt(3)/1 and 1/sqrt(3) for sqrt(3)/sqrt(3)).
//   a Twin tap item whose forms are both single fractions, N/D against a
//     fraction with only one part multiplied by a whole number k > 1:
//     (k N)/D, or N/(k D) (3/7 vs 12/7; x/4 vs x/12). That twin IS the output.
//   expression items N/D with a form predicate 'denominator:T', T = k D, k a
//     whole number > 1 ("write it with denominator T"): bottom-only N/T, then
//     top-only (k N)/D (1/2 with denominator 4 -> 1/4, or -> 2/2).
//   expression items a/b, two whole numbers with a common factor g > 1, with
//     the form predicate 'lowest-terms' ("reduce"): only one part divided by
//     g: (a/g)/b, then a/(b/g) (48/36 -> 4/36, or -> 48/3).
//   expression items whose prompt shows the coin, x times c/d with c = d in
//     value: numerator-only (x.num c)/x.den, then denominator-only
//     x.num/(x.den d).
//   expression items k/sqrt(n) with the form predicate
//     'no-radical-in-denominator' (the coin sqrt(n)/sqrt(n) is implied):
//     numerator-only k, then denominator-only k/n (6/sqrt(3) -> 6, or -> 2).

import { defineMalRule, exprOf, isExprItem, stripGroups, over, times, simp, int, intOf, monoDiv } from '../kit.js';
import { equivExpr } from '../../math/equiv.js';
import { gcd } from '../../math/rational.js';

/** @typedef {import('../../../types.d.ts').Node} Node */

/** @param {Node} n @returns {[Node, Node]} */
function parts(n) { return n.t === 'frac' ? [n.num, n.den] : [n, int(1n)]; }

export default defineMalRule({
  id: 'one-part-coin',
  n: 4,
  haunt: 'the Half-Coin',
  standardTerm: 'multiplied only one part of the fraction',
  script: 'That multiplier was not worth one.',
  skills: ['frac-equivalence', 'identity-moves', 'frac-add-sub', 'rationalize-denominator'],
  outputs(p) {
    const tap = p.interaction === 'twin' && !p.constructed;
    if (p.answer.kind === 'form-of-1' && !tap) {
      const c = stripGroups(/** @type {Node} */ (p.answer.expected));
      return c.t === 'frac' ? [over(c.num, int(1n)), over(int(1n), c.den)] : [];
    }
    const m = exprOf(p);
    if (!m || !isExprItem(p)) return [];
    const as = p.assumptions ?? [];
    if (tap && m.t === 'frac') {
      const tw = p.prompt.twin && !('lhs' in p.prompt.twin) ? stripGroups(p.prompt.twin) : undefined;
      if (tw && tw.t === 'frac') {
        const kTop = intOf(monoDiv(tw.num, m.num) ?? m);
        const kBot = intOf(monoDiv(tw.den, m.den) ?? m);
        if (kTop !== undefined && kTop > 1n && equivExpr(tw.den, m.den, as).equal === true) return [over(tw.num, m.den)];
        if (kBot !== undefined && kBot > 1n && equivExpr(tw.num, m.num, as).equal === true) return [over(m.num, tw.den)];
      }
    }
    if (m.t === 'frac' && !tap) {
      const D = intOf(m.den);
      const want = p.answer.formPredicates.map((f) => /^denominator:(\d+)$/.exec(f)).find(Boolean);
      if (want && D !== undefined && D > 0n) {
        const T = BigInt(want[1]);
        if (T % D === 0n && T / D > 1n) return [over(m.num, int(T)), over(simp(times(int(T / D), m.num)), m.den)];
      }
      const N = intOf(m.num);
      if (p.answer.formPredicates.includes('lowest-terms') && N !== undefined && D !== undefined && D > 0n && N !== 0n) {
        const g = gcd(N < 0n ? -N : N, D);
        if (g > 1n) return [over(int(N / g), int(D)), over(int(N), int(D / g))];
      }
    }
    if (m.t === 'mul' && m.args.length === 2) {
      for (const [x, c] of [[m.args[0], m.args[1]], [m.args[1], m.args[0]]]) {
        if (c.t === 'frac' && equivExpr(c.num, c.den, p.assumptions ?? []).equal === true) {
          const [a, b] = parts(x);
          return [simp(over(times(a, c.num), b)), simp(over(a, times(b, c.den)))];
        }
      }
      return [];
    }
    if (m.t === 'frac' && m.den.t === 'root' && p.answer.formPredicates.includes('no-radical-in-denominator')) {
      return [simp(m.num), simp(over(m.num, times(m.den, m.den)))];
    }
    return [];
  },
});
