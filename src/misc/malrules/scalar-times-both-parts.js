// @ts-check
// Mal-rule 5 (DESIGN.md section 5): the Stacker.
// Applies to n x a/b (either order, n an integer literal):
//   expression items: (n a)/(n b), which still has the value a/b
//     (4 x 1/3 -> 4/12);
//   variant 'whole-as-fraction' (Forge "write 4 as a fraction with the same
//     value"): n/n, the coin that multiplies both parts.

import { defineMalRule, exprOf, isExprItem, wholeTimesFrac, over, times, simp, int, V_WHOLE_AS_FRACTION } from '../kit.js';

export default defineMalRule({
  id: 'scalar-times-both-parts',
  n: 5,
  haunt: 'the Stacker',
  standardTerm: 'multiplied numerator and denominator by the whole number',
  script: 'You multiplied numerator and denominator. That is times one. Nothing moved.',
  skills: ['frac-times-whole'],
  outputs(p) {
    const m = exprOf(p);
    const s = m && wholeTimesFrac(m);
    if (!s) return [];
    if (p.variant === V_WHOLE_AS_FRACTION) return p.answer.kind === 'expr' ? [over(int(s.n), int(s.n))] : [];
    if (!isExprItem(p)) return [];
    return [over(simp(times(s.w, s.f.num)), simp(times(s.w, s.f.den)))];
  },
});
