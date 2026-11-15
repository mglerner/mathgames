// @ts-check
// Mal-rule 10 (DESIGN.md section 5): the Slicer.
// A side with several terms is divided in one term only. Applies to:
//   'solution-set', linear with the variable on one side (a v + b = d, a a
//     whole number other than 0, 1, -1, and b not 0): the other side and the
//     variable term are divided by a, the constant b is not: v + b = d/a,
//     so v = d/a - b
//     (2x + 6 = 10 -> x + 6 = 5 -> -1).
//   'equation-sides' with a move "/ k", k a number: for each side that is a
//     sum, the line where only one term of that side is divided (the first
//     term with the variable, else the first term) and the other side is
//     divided whole (2x + 6 = 10, "/ 2": x + 6 = 5).

import { defineMalRule, equationOf, eqn, simp, sum, over, oneSidedLinear, oneRoot, hasVar } from '../kit.js';
import { applyToSide } from '../../moves/apply.js';
import { sub, div, abs, isZero } from '../../math/rational.js';

/** @typedef {import('../../../types.d.ts').Node} Node */

/** @param {Node} side @param {Node} k @returns {Node | undefined} */
function sliced(side, k) {
  if (side.t !== 'add' || side.args.length < 2) return undefined;
  let at = side.args.findIndex(hasVar);
  if (at < 0) at = 0;
  return sum(side.args.map((t, i) => (i === at ? simp(over(t, k)) : t)));
}

export default defineMalRule({
  id: 'divide-one-term',
  n: 10,
  haunt: 'the Slicer',
  standardTerm: 'divided only one term of a side',
  script: 'Divide the whole side, every term.',
  skills: ['balance-moves', 'solve-linear', 'clear-fractions'],
  outputs(p) {
    const e = equationOf(p);
    if (!e) return [];
    const mv = p.prompt.move;
    if (p.answer.kind === 'equation-sides' && mv && mv.op === 'div' && mv.operand && !hasVar(mv.operand)) {
      const l = sliced(e.lhs, mv.operand);
      const r = sliced(e.rhs, mv.operand);
      const out = [];
      if (l) out.push(eqn(l, simp(applyToSide(mv, e.rhs))));
      if (r) out.push(eqn(simp(applyToSide(mv, e.lhs)), r));
      return out;
    }
    if (p.answer.kind === 'solution-set') {
      const l = oneSidedLinear(p);
      if (!l || l.a.d !== 1n || abs(l.a).n < 2n || isZero(l.b)) return [];
      return [oneRoot(sub(div(l.d, l.a), l.b))];
    }
    return [];
  },
});
