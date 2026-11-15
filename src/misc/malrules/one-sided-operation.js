// @ts-check
// Mal-rule 3 (DESIGN.md section 5): the Lopsider.
// Applies to equation items:
//   'equation-sides' with prompt.move (I2/I3): the move done to one side
//     only, the other side copied. Both choices of side, shortest line first
//     (3x + 5 = 11, "- 5": 3x = 11, then 3x + 5 = 6).
//   'equation-multiple' (I8 "rewrite as ... = 0"): one side replaced by 0,
//     the other copied (6 + 4x = 2x^2 -> 0 = 2x^2, 6 + 4x = 0).
//   'solution-set', linear with the variable on one side only (a v + b = d):
//     every undoing step is done to the variable side only, so the other
//     side is never touched: v = d (x/3 = 5 -> 5).

import { defineMalRule, equationOf, eqn, int, simp, oneSidedLinear, oneRoot, shortestFirst } from '../kit.js';
import { applyToSide } from '../../moves/apply.js';
import { qeq, ONE, isZero } from '../../math/rational.js';

export default defineMalRule({
  id: 'one-sided-operation',
  n: 3,
  haunt: 'the Lopsider',
  standardTerm: 'operated on one side only',
  script: 'You changed one side only.',
  skills: ['balance-moves', 'solve-linear', 'quadratic-to-standard'],
  outputs(p) {
    const e = equationOf(p);
    if (!e) return [];
    const kind = p.answer.kind;
    if (kind === 'equation-sides' && p.prompt.move) {
      const mv = p.prompt.move;
      return shortestFirst([eqn(simp(applyToSide(mv, e.lhs)), e.rhs), eqn(e.lhs, simp(applyToSide(mv, e.rhs)))]);
    }
    if (kind === 'equation-multiple') return [eqn(int(0n), e.rhs), eqn(e.lhs, int(0n))];
    if (kind === 'solution-set') {
      const l = oneSidedLinear(p);
      if (!l || (qeq(l.a, ONE) && isZero(l.b))) return [];
      return [oneRoot(l.d)];
    }
    return [];
  },
});
