// @ts-check
// Mal-rule 12 (DESIGN.md section 5): the Lost Root.
// Applies to:
//   'solution-set' on a one-variable equation whose two sides are both 0 at
//     v = 0 and which has 0 and at least one other root (x^2 = kx): the root
//     set without 0, as after dividing both sides by v.
//   a Cast in a one-way generator (variant 'one-way'): picks() gives every
//     chip that multiplies or divides by an expression with a variable
//     ("/ x" on x^2 = 3x loses 0; "x x" on x = 2 adds 0; section 3 I1 files
//     both under this rule).

import { defineMalRule, equationOf, solveVar, hasVar, V_ONE_WAY } from '../kit.js';
import { solve } from '../../math/solve.js';
import { evaluateS } from '../../math/evaluate.js';
import { sIsZero, SZERO } from '../../math/surd.js';

export default defineMalRule({
  id: 'divide-by-variable-loses-root',
  n: 12,
  haunt: 'the Lost Root',
  standardTerm: 'divided by an expression that could be 0',
  script: 'Dividing by the variable deleted the solution zero.',
  skills: ['balance-moves', 'zero-product'],
  outputs(p) {
    const e = equationOf(p);
    const v = solveVar(p);
    if (!e || !v) return [];
    const l0 = evaluateS(e.lhs, { [v]: SZERO });
    const r0 = evaluateS(e.rhs, { [v]: SZERO });
    if (!l0 || !r0 || !sIsZero(l0) || !sIsZero(r0)) return [];
    const s = solve(e, v);
    if (!s || s.kind !== 'finite' || s.roots.length < 2) return [];
    const rest = s.roots.filter((r) => !sIsZero(r));
    return rest.length < s.roots.length ? [{ kind: 'finite', roots: rest }] : [];
  },
  picks(p) {
    if (p.interaction !== 'cast' || p.variant !== V_ONE_WAY) return [];
    /** @type {string[]} */
    const out = [];
    for (const c of p.choices ?? []) {
      const d = /** @type {{ op?: string; operand?: import('../../../types.d.ts').Node }} */ (c.display);
      if ((d.op === 'div' || d.op === 'mul') && d.operand && hasVar(d.operand)) out.push(c.id);
    }
    return out;
  },
});
