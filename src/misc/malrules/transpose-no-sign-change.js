// @ts-check
// Mal-rule 8 (DESIGN.md section 5): the Carrier.
// A term is moved across the = sign with its sign kept. Applies to:
//   'equation-sides' with an add / sub move (I2/I3): one side gets the move,
//     the other gets the OPPOSITE move, i.e. the term reappears across the =
//     with the same sign. Both choices of side, shortest line first
//     (3x + 5 = 11, "- 5": 3x = 16).
//   'equation-multiple' (I8 "rewrite as ... = 0"): every term carried to one
//     side unchanged: L + R = 0 (6 + 4x = 2x^2 -> 2x^2 + 4x + 6 = 0).
//   'solution-set', linear a v + b = c v + d: the variable terms are
//     collected on the left (on the right when the left has none) and the
//     constants on the other side; outputs, most typical first: every moved
//     term carried, then each single moved term carried (x + 5 = 12 -> 17).

import { defineMalRule, equationOf, eqn, int, simp, linearOf, oneRoot, shortestFirst } from '../kit.js';
import { applyToSide } from '../../moves/apply.js';
import { add, sub, div, isZero, qeq } from '../../math/rational.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Move} Move */

/**
 * a v + b = c v + d, variable collected on the a side.
 * @param {Q} a @param {Q} b @param {Q} c @param {Q} d @returns {Q[]}
 */
function carried(a, b, c, d) {
  const mc = !isZero(c);
  const mb = !isZero(b);
  /** @type {[boolean, boolean][]} */
  const sets = [];
  if (mc && mb) sets.push([true, true]);
  if (mc) sets.push([true, false]);
  if (mb) sets.push([false, true]);
  /** @type {Q[]} */
  const out = [];
  for (const [kc, kb] of sets) {
    const A = kc ? add(a, c) : sub(a, c);
    const D = kb ? add(d, b) : sub(d, b);
    if (isZero(A)) continue;
    const x = div(D, A);
    if (!out.some((y) => qeq(x, y))) out.push(x);
  }
  return out;
}

export default defineMalRule({
  id: 'transpose-no-sign-change',
  n: 8,
  haunt: 'the Carrier',
  standardTerm: 'moved a term across without changing its sign',
  script: 'You carried a term across. Do the same thing to both sides.',
  skills: ['balance-moves', 'solve-linear', 'quadratic-to-standard'],
  outputs(p) {
    const e = equationOf(p);
    if (!e) return [];
    const kind = p.answer.kind;
    const mv = p.prompt.move;
    if (kind === 'equation-sides' && mv && (mv.op === 'add' || mv.op === 'sub') && mv.operand) {
      /** @type {Move} */
      const opp = { op: mv.op === 'add' ? 'sub' : 'add', operand: mv.operand };
      return shortestFirst([
        eqn(simp(applyToSide(mv, e.lhs)), simp(applyToSide(opp, e.rhs))),
        eqn(simp(applyToSide(opp, e.lhs)), simp(applyToSide(mv, e.rhs))),
      ]);
    }
    if (kind === 'equation-multiple') return [eqn(simp({ t: 'add', args: [e.lhs, e.rhs] }), int(0n))];
    if (kind === 'solution-set') {
      const l = linearOf(p);
      if (!l) return [];
      const xs = !isZero(l.a) ? carried(l.a, l.b, l.c, l.d) : !isZero(l.c) ? carried(l.c, l.d, l.a, l.b) : [];
      return xs.map(oneRoot);
    }
    return [];
  },
});
