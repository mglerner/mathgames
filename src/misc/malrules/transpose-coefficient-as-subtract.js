// @ts-check
// Mal-rule 9 (DESIGN.md section 5): the Peeler.
// A coefficient is "moved across" by subtracting it. Applies to:
//   'solution-set', linear with the variable on one side (a v + b = d, a a
//     whole number other than 0, 1, -1): the constant is handled correctly,
//     then a is subtracted:
//     v = (d - b) - a (3x = 12 -> 9).
//   'equation-sides' with a move "/ k", k a number, and the variable on one
//     side only: that side is divided, the other side gets "- k"
//     (3x = 12, "/ 3": x = 9).

import { defineMalRule, equationOf, eqn, simp, oneSidedLinear, oneRoot, hasVar } from '../kit.js';
import { applyToSide } from '../../moves/apply.js';
import { sub, abs } from '../../math/rational.js';

/** @typedef {import('../../../types.d.ts').Move} Move */

export default defineMalRule({
  id: 'transpose-coefficient-as-subtract',
  n: 9,
  haunt: 'the Peeler',
  standardTerm: 'subtracted a coefficient instead of dividing',
  script: 'The coefficient multiplies the variable. Undo it with division.',
  skills: ['balance-moves', 'solve-linear'],
  outputs(p) {
    const e = equationOf(p);
    if (!e) return [];
    const mv = p.prompt.move;
    if (p.answer.kind === 'equation-sides' && mv && mv.op === 'div' && mv.operand && !hasVar(mv.operand)) {
      const lv = hasVar(e.lhs);
      if (lv === hasVar(e.rhs)) return [];
      /** @type {Move} */
      const minus = { op: 'sub', operand: mv.operand };
      return [lv
        ? eqn(simp(applyToSide(mv, e.lhs)), simp(applyToSide(minus, e.rhs)))
        : eqn(simp(applyToSide(minus, e.lhs)), simp(applyToSide(mv, e.rhs)))];
    }
    if (p.answer.kind === 'solution-set') {
      const l = oneSidedLinear(p);
      if (!l || l.a.d !== 1n || abs(l.a).n < 2n) return [];
      return [oneRoot(sub(sub(l.d, l.b), l.a))];
    }
    return [];
  },
});
