// @ts-check
// solution-meaning (skill 12, DESIGN.md sections 4 and 7): a solution makes
// both sides equal; = is a balance, not "the answer comes next"; check a
// candidate by substitution. Recipe: ../common.js.
//
// Difficulty (section 4 gives none for this skill; my reading, reported):
//   d1  fill the blank a + b = [ ] + c with a, b, c in 1..9; the check is on
//       a x + b = c (x on one side), candidate x = r in 2..6.
//   d2  fill the blank with a subtraction on either side (a - b = [ ] + c,
//       a + b = [ ] - c); the check is on a x + b = c x + d, r in +-2..6.
//   About half the checked candidates are solutions.
//
// Interactions:
//   strike    variant 'fill-blank' (I8 "Fill the blank"): the detector of
//             mal-rule 1, equals-as-operator (the Announcer types a + b).
//   predict   "Check": put x = r into both sides and type the two values
//             (answer kind 'tuple', left then right). My reading of I3 for
//             this skill: the "move" is the substitution; the Scale shows the
//             two values after commit. Reported as a deviation.
//   why       'hidden-0' (counting): at a solution the gap between the sides
//             is 0. In "(3(2) + 1 - 7) + 5" or "5 + (3(2) + 1 - 7)" tap the
//             part worth 0: the bracketed gap, not the extra number, the
//             value put in for x, or the right side's value. Always on a x + b = d
//             (x on one side, at both difficulties): with x on both sides the
//             gap "(2(3) + 9) - (3(3) + 7)" is too wide for a 375px phone.
// No problem.steps: the substitution check is not a chain of lines with
// the same solutions (3(2) + 1 = 7 is a statement about numbers, not an
// equation in x), which is what Step.legal means.
// No choice interaction (nextline / twin / forge) is offered: section 3
// assigns none of them to this skill, and an equation Twin cannot carry a
// mal-rule tag on its "same" tap (diagnose.js twinMatch reads expression
// pairs only). Predict is the box 0-1 item, with the balance visual.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, tapTargets, blank, V_FILL_BLANK,
} from '../common.js';
import { num, add, neg, group, eq } from '../../math/ast.js';
import { q, ZERO } from '../../math/rational.js';
import { evaluate } from '../../math/evaluate.js';
import { print } from '../../math/print.js';
import { seq, fromQ } from '../../math/surd.js';
import { qNode, polyNode } from '../../misc/kit.js';
import { X } from './balance-moves.core.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../common.js').GenOpts} GenOpts */

const GEN = Object.freeze({ id: 'solution-meaning.core', version: 1, skill: 'solution-meaning' });

/** makeRng(EXAMPLE_SEED) at d1 gives the section 5 example 3 + 4 = [ ] + 2 (strike). Pinned by the test. */
export const EXAMPLE_SEED = 'announcer-791';

/** c x + d as a display tree. @param {bigint} c @param {bigint} d */
const lin = (c, d) => polyNode([q(d), q(c), ZERO], X);

/** The tree with x replaced by (r). @param {Node} n @param {Node} r @returns {Node} */
function subst(n, r) {
  switch (n.t) {
    case 'var': return n.name === X ? group(r) : n;
    case 'num': return n;
    case 'add': return { t: 'add', args: n.args.map((c) => subst(c, r)) };
    case 'mul': return { t: 'mul', args: n.args.map((c) => subst(c, r)) };
    case 'neg': return { t: 'neg', arg: subst(n.arg, r) };
    case 'group': return { t: 'group', arg: subst(n.arg, r) };
    case 'frac': return { t: 'frac', num: subst(n.num, r), den: subst(n.den, r) };
    case 'pow': return { t: 'pow', base: subst(n.base, r), exp: subst(n.exp, r) };
    case 'root': return { t: 'root', index: n.index, radicand: subst(n.radicand, r) };
  }
}

/** The fill-the-blank item. @param {Rng} r @param {GenOpts} opts @param {string} seed @returns {Problem | undefined} */
function fillBlank(r, opts, seed) {
  const a = BigInt(r.int(1, 9));
  const b = BigInt(r.int(1, 9));
  const c = BigInt(r.int(1, 9));
  const form = opts.difficulty === 1 ? 'plus' : r.pick(['minus-left', 'minus-right']);
  const left = form === 'minus-left' ? add(num(a), neg(num(b))) : add(num(a), num(b));
  const right = form === 'minus-right' ? add(blank(), neg(num(c))) : add(blank(), num(c));
  const lv = form === 'minus-left' ? a - b : a + b;
  const key = form === 'minus-right' ? lv + c : lv - c;
  if (key < 2n || key === lv) return undefined; // never 0 or 1, and never the Announcer's number
  return makeProblem(GEN, seed, opts, {
    variant: V_FILL_BLANK,
    prompt: { verb: 'Fill the blank', math: eq(left, right), goal: 'Make both sides balance.' },
    answer: { kind: 'expr', expected: num(key), formPredicates: ['single-number'], assumptions: [] },
    visuals: ['balance'],
  });
}

/**
 * The checked equation and candidate.
 * @param {Rng} r @param {number} d @param {boolean} wantRoot @param {boolean} oneSided x on the left only
 * @returns {{ math: Equation; root: bigint; L: bigint; R: bigint } | undefined}
 */
function drawCheck(r, d, wantRoot, oneSided) {
  const x = BigInt(d === 1 ? r.int(2, 6) : r.pick([-6, -5, -4, -3, -2, 2, 3, 4, 5, 6]));
  const a = BigInt(d === 1 ? r.int(2, 6) : r.pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]));
  const b = BigInt(r.pick([-9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  const c = d === 1 || oneSided ? 0n : BigInt(r.pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]));
  if (a === c) return undefined;
  const off = wantRoot ? 0n : BigInt(r.pick([-3, -2, -1, 1, 2, 3]));
  const Lv = a * x + b;
  const dd = Lv - c * x + off;
  if (d === 1 && b < 0n && r.bool()) return undefined; // d1 keeps mostly a x + b with b > 0
  const math = eq(lin(a, b), lin(c, dd));
  const Rv = c * x + dd;
  if (Lv === 0n || Rv === 0n) return undefined;
  return { math, root: x, L: Lv, R: Rv };
}

/**
 * The data-path of the first bracket inside n (the value put in for x).
 * @param {Node} n @param {string} path the path of n @returns {string | undefined}
 */
function firstGroup(n, path) {
  if (n.t === 'group') return path;
  const kids = n.t === 'add' || n.t === 'mul' ? n.args : n.t === 'neg' ? [n.arg] : [];
  for (let i = 0; i < kids.length; i++) {
    const at = firstGroup(kids[i], `${path}.${i}`);
    if (at) return at;
  }
  return undefined;
}

/** @param {Rng} r @param {GenOpts} opts @param {string} seed @returns {Problem | undefined} */
function check(r, opts, seed) {
  const why = opts.interaction === 'why';
  const ck = drawCheck(r.fork('check'), opts.difficulty, why || r.bool(), why);
  if (!ck) return undefined;
  const { math, root, L, R } = ck;
  const rNode = qNode(q(root));
  // exact substitution, independent of the drawn numbers
  const lv = evaluate(math.lhs, { [X]: q(root) });
  const rv = evaluate(math.rhs, { [X]: q(root) });
  if (!lv || !rv || !seq(lv, fromQ(q(L))) || !seq(rv, fromQ(q(R)))) throw new Error(`${GEN.id}: substitution disagrees with the draw (seed ${JSON.stringify(seed)})`);
  if (!why) {
    return makeProblem(GEN, seed, opts, {
      prompt: { verb: 'Check', math, goal: `Put x = ${root} into both sides. Type the left value, then the right.` },
      answer: { kind: 'tuple', expected: [qNode(q(L)), qNode(q(R))], formPredicates: ['single-number'], assumptions: [] },
      visuals: ['balance'],
    });
  }
  const Ls = subst(math.lhs, rNode);
  const Rs = subst(math.rhs, rNode);
  // The gap "left - right" at the solution, bracketed, beside one more number
  // (before or after it): the 0 is a part of what is shown, not all of it,
  // and its place varies. Targets: the gap, the extra number, the bracketed
  // value that was put in for x, and the right side's value.
  const wr = r.fork('why');
  const k = BigInt(wr.int(2, 9));
  const terms = (/** @type {Node} */ n) => (n.t === 'add' ? n.args : [n]);
  const gap = group(add(...terms(Ls), neg(Rs.t === 'add' ? group(Rs) : Rs)));
  const gapFirst = wr.bool();
  const shown = gapFirst ? add(gap, num(k)) : add(num(k), gap);
  const g = gapFirst ? 'e.0' : 'e.1';
  const xAt = firstGroup(gap.arg, `${g}.0`);
  if (!xAt) return undefined;
  return makeProblem(GEN, seed, opts, {
    variant: 'hidden-0',
    prompt: { verb: 'Tap the hidden 0', math: shown, goal: `x = ${root} solves ${print(math)}. Tap the part worth 0.` },
    choices: tapTargets(shown, [g, gapFirst ? 'e.1' : 'e.0', xAt, `${g}.0.${terms(Ls).length}`].sort(), g),
    answer: { kind: 'expr', expected: num(0), formPredicates: [], assumptions: [] },
    visuals: ['zeropair', 'balance'],
  });
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 2],
  interactions: ['strike', 'predict', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const p = opts.interaction === 'strike' ? fillBlank(r.fork('params'), opts, seed) : check(r.fork('params'), opts, seed);
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
