// @ts-check
// Mal-rule 2 (DESIGN.md section 5): the Stranger.
// Applies to: a Twin item whose two forms ARE equivalent.
// It has no wrong value to compute: the bug is the tap "Different", so this
// rule has picks() and no outputs. (Section 5 asks for 2 such taps before the
// misconception is active; that is the status logic in diagnose.js.)

import { defineMalRule, isEquation, vars, TWIN_DIFFERENT } from '../kit.js';
import { equivExpr, sameSolutions } from '../../math/equiv.js';

export default defineMalRule({
  id: 'form-change-changes-value',
  n: 2,
  haunt: 'the Stranger',
  standardTerm: 'thinks a new form is a new value',
  script: 'No witness exists. Two forms, one value.',
  skills: ['frac-equivalence', 'frac-times-whole', 'identity-moves', 'equivalent-expressions'],
  picks(p) {
    if (p.interaction !== 'twin' || !p.prompt.twin) return [];
    if (!(p.choices ?? []).some((c) => c.id === TWIN_DIFFERENT)) return [];
    const a = p.prompt.math;
    const b = p.prompt.twin;
    const as = [...(p.assumptions ?? []), ...(p.answer.assumptions ?? [])];
    let equal;
    if (isEquation(a) && isEquation(b)) {
      const vs = vars(a);
      equal = vs.length === 1 ? sameSolutions(a, b, vs[0]).equal : undefined;
    } else if (!isEquation(a) && !isEquation(b)) {
      equal = equivExpr(a, b, as).equal;
    }
    return equal === true ? [TWIN_DIFFERENT] : [];
  },
});
