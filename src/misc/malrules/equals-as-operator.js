// @ts-check
// Mal-rule 1 (DESIGN.md section 5): the Announcer.
// Applies to: the I8 fill-the-blank a + b = [ ] + c (variant 'fill-blank',
// the blank is the variable node kit.BLANK on the right side, the left side
// is plain arithmetic, answer.kind 'expr').
// Output: the value of the left side (3 + 4 = [ ] + 2 -> 7).

import { defineMalRule, equationOf, some, vars, simp, BLANK, V_FILL_BLANK } from '../kit.js';

/** @param {import('../../../types.d.ts').Node} n */
const hasBlank = (n) => some(n, (x) => x.t === 'var' && x.name === BLANK);

export default defineMalRule({
  id: 'equals-as-operator',
  n: 1,
  haunt: 'the Announcer',
  standardTerm: "reads = as 'the answer comes next'",
  script: "The = is a balance, not 'answer next'.",
  skills: ['solution-meaning'],
  outputs(p) {
    const e = equationOf(p);
    if (!e || p.variant !== V_FILL_BLANK || p.answer.kind !== 'expr') return [];
    if (hasBlank(e.lhs) || !hasBlank(e.rhs) || vars(e.lhs).length > 0) return [];
    return [simp(e.lhs)];
  },
});
