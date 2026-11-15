// @ts-check
// Mal-rule 19 (DESIGN.md section 5): the Sinker.
// Applies to n x a/b (either order, n an integer literal):
//   expression items: a/(n b) (4 x 1/3 -> 1/12);
//   variant 'whole-as-fraction' (Forge "write 4 as a fraction with the same
//     value"): 1/n, the whole number written under the bar.

import { defineMalRule, exprOf, isExprItem, wholeTimesFrac, over, times, simp, int, V_WHOLE_AS_FRACTION } from '../kit.js';

export default defineMalRule({
  id: 'scalar-into-denominator',
  n: 19,
  haunt: 'the Sinker',
  standardTerm: 'multiplied the denominator by the whole number',
  script: 'A whole number is itself over one. It multiplies the numerator.',
  skills: ['frac-times-whole'],
  outputs(p) {
    const m = exprOf(p);
    const s = m && wholeTimesFrac(m);
    if (!s) return [];
    if (p.variant === V_WHOLE_AS_FRACTION) return p.answer.kind === 'expr' ? [over(int(1n), int(s.n))] : [];
    if (!isExprItem(p)) return [];
    return [over(s.f.num, simp(times(s.w, s.f.den)))];
  },
});
