// @ts-check
// solve-linear (skill 14, DESIGN.md section 4): linear equations with x on
// both sides; at d4 also the no-solution and all-reals cases (the folded-in
// linear-special-cases). Recipe: ../common.js; line helpers from
// ./balance-moves.core.js.
//
// Difficulty (section 4 fixes only d4; the rest is my reading, reported):
//   d1  a x + b = c x + d, a > c >= 1, b, d >= 1, root a whole number 2..9.
//   d2  the same with signs: a, c in +-1..9 (a != c), b, d nonzero, root in
//       +-2..9; sides may be swapped.
//   d3  a product to distribute on the left: k(p x + m) + e = c x + d
//       (sometimes k(m + p x)), k in +-2..6, p in 1..3; root in +-2..9.
//   d4  one third each: no solution (k p = c, constants differ), all reals
//       (k p = c, constants equal), and a d3 item with k negative. A
//       no-solution item writes the product k(m + p x): written k(p x + m),
//       the Half-Hand's line (k p x + m + e) would ALSO have no solution, so
//       his answer could not be told from the right one and the draw would
//       be rejected almost always.
// Never: a root 0 or 1.
//
// Worked chain (problem.steps): the line, the expanded line when the line
// has a product, then the standard moves (balance-moves.core linearChain):
// remove the right side's x term, remove the constant beside x, divide by
// the coefficient. Ends at x = r, or at a true or false number line.
//
// Interactions:
//   strike    "Solve": the solution set ("no solution" / "all reals" at d4).
//   nextline  one stated move of the chain (random step), candidates: the
//             line, the Lopsider's, and the Carrier's (add / sub) or the
//             Peeler's and the Slicer's (divide).
//   predict   the same, typed.
//   cast      linearAlphabet chips on the expanded line (the Cast shows the
//             expanded line, since the chips name its terms).
//   trace     the chain; 2 in 3 have one bad line: a stated move done the
//             Lopsider's, Carrier's, Peeler's or Slicer's way (tagged), and
//             only when it changes the solution set; the lines after it
//             follow correctly from it and end on a whole number that is not
//             0 or 1 (as every clean chain does). Chains of 3-5 lines. At d4
//             a Trace (and a Why) always has one solution: see build().
//   why       'hidden-0' (counting): the zero-pair "(2x - 2x)" that removing
//             the right side's x term leaves, in "5x + 3 - 2x = (2x - 2x) + 9".

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, shuffledChoices,
  tapTargets, traceChoices, probeEnvs, voteProofChoices,
} from '../common.js';
import { num, add, mul, group, eq } from '../../math/ast.js';
import { q, ZERO, isZero } from '../../math/rational.js';
import { fromQ } from '../../math/surd.js';
import { print } from '../../math/print.js';
import { solve, sameSolutionSet } from '../../math/solve.js';
import { applyMove } from '../../moves/apply.js';
import { canonicalize } from '../../moves/graph.js';
import { polyNode } from '../../misc/kit.js';
import {
  X, coeffs, linearAlphabet, isSolvedLinear, linearChain, castChoices, moveText, hiddenZeroStep, idleDecoys,
  rulesFor, plantedChains,
} from './balance-moves.core.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Move} Move */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').SolutionSet} SolutionSet */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {{ math: Equation; key: SolutionSet; mid?: Equation }} Params */

const GEN = Object.freeze({ id: 'solve-linear.core', version: 1, skill: 'solve-linear' });

const NZ9 = [-9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ROOTS = [-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9];

/** c x + d as a display tree. @param {bigint} c @param {bigint} d */
const lin = (c, d) => polyNode([q(d), q(c), ZERO], X);

/**
 * k(p x + m) [+ e] as a display tree; a negative k is a negative literal
 * (prints -3(x + 4)). constFirst writes the inner sum as (m + p x).
 * @param {bigint} k @param {bigint} p @param {bigint} m @param {bigint} e @param {boolean} constFirst
 */
function distributed(k, p, m, e, constFirst) {
  const inner = constFirst ? add(polyNode([q(m), ZERO, ZERO], X), polyNode([ZERO, q(p), ZERO], X)) : lin(p, m);
  const prod = mul(num(k), group(inner));
  return e === 0n ? prod : add(prod, polyNode([q(e), ZERO, ZERO], X));
}

/** @typedef {'none' | 'all' | 'one'} Kind */

/** @param {Rng} r @param {number} d @param {Kind} kind (d4 only; drawn once per seed so the thirds survive rejection) @returns {Params | undefined} */
function draw(r, d, kind) {
  if (d === 1) {
    const root = BigInt(r.int(2, 9));
    const c = BigInt(r.int(1, 6));
    const a = c + BigInt(r.int(1, 4));
    const b = BigInt(r.int(1, 12));
    const dd = (a - c) * root + b;
    return { math: eq(lin(a, b), lin(c, dd)), key: { kind: 'finite', roots: [fromQ(q(root))] } };
  }
  if (d === 2) {
    const root = BigInt(r.pick(ROOTS));
    const a = BigInt(r.pick(NZ9));
    const c = BigInt(r.pick(NZ9));
    const b = BigInt(r.pick(NZ9)) + (r.bool() ? 0n : BigInt(r.pick([-3, 3])));
    if (a === c || b === 0n) return undefined;
    const dd = (a - c) * root + b;
    if (dd === 0n || dd > 40n || dd < -40n) return undefined;
    const math = r.bool(0.3) ? eq(lin(c, dd), lin(a, b)) : eq(lin(a, b), lin(c, dd));
    return { math, key: { kind: 'finite', roots: [fromQ(q(root))] } };
  }
  const k = BigInt(r.int(2, 6)) * (d === 4 && kind === 'one' ? -1n : r.bool(0.3) ? -1n : 1n);
  const p = BigInt(r.pick([1, 1, 2, 3]));
  const m = BigInt(r.pick(NZ9));
  const e = r.bool(0.4) ? BigInt(r.pick(NZ9)) : 0n;
  // On a no-solution item the Half-Hand's line must not be no-solution too:
  // with (m + p x) the multiplier misses the x term, so his line has a root.
  const constFirst = kind === 'none' || r.bool(0.3);
  const a = k * p;
  const b = k * m + e;
  if (b > 40n || b < -40n) return undefined;
  // the product distributed, like terms not yet combined: "k p x + k m + e = ..."
  const xt = polyNode([ZERO, q(a), ZERO], X);
  const ct = polyNode([q(k * m), ZERO, ZERO], X);
  const mid = (/** @type {Node} */ rhs) => (e === 0n ? undefined : eq(add(...(constFirst ? [ct, xt] : [xt, ct]), polyNode([q(e), ZERO, ZERO], X)), rhs));
  if (kind === 'one') {
    const root = BigInt(r.pick([-6, -5, -4, -3, -2, 2, 3, 4, 5, 6]));
    const c = BigInt(r.pick(NZ9));
    if (c === a) return undefined;
    const dd = (a - c) * root + b;
    if (dd > 40n || dd < -40n) return undefined;
    return { math: eq(distributed(k, p, m, e, constFirst), lin(c, dd)), key: { kind: 'finite', roots: [fromQ(q(root))] }, mid: mid(lin(c, dd)) };
  }
  const dd = kind === 'all' ? b : b + BigInt(r.pick(NZ9));
  return { math: eq(distributed(k, p, m, e, constFirst), lin(a, dd)), key: kind === 'all' ? { kind: 'all' } : { kind: 'none' }, mid: mid(lin(a, dd)) };
}

/**
 * The trace chain: the correct steps, or one planted bad line (plantedChains
 * in ./balance-moves.core.js lists every way of planting one), 3-5 lines.
 * @param {Rng} r @param {Step[]} good the correct chain, first line included
 * @param {boolean} planted drawn once per seed (2 in 3), so rejection does not move the share
 * @returns {Step[] | undefined}
 */
function traceSteps(r, good, planted) {
  if (!planted) return good;
  const cands = plantedChains(good).filter((steps) => steps.length >= 3 && steps.length <= 5);
  return cands.length > 0 ? r.pick(cands) : undefined;
}

/**
 * @param {Rng} r @param {Params} P @param {GenOpts} opts @param {string} seed
 * @param {boolean} planted (trace only)
 * @returns {Problem | undefined}
 */
function item(r, P, opts, seed, planted) {
  const { math, key } = P;
  const s = solve(math, X);
  if (!s || !sameSolutionSet(s, key)) throw new Error(`${GEN.id}: built solution set is not the solution set (seed ${JSON.stringify(seed)})`);
  const start = canonicalize(math);
  const chain = linearChain(start);
  if (!chain) return undefined;
  /** @type {Step[]} */
  const good = [{ line: math, legal: true }];
  // The distributed line before like terms are combined ("-3x - 12 + 5"):
  // shown in the worked solution; a Trace keeps to 5 lines and skips it.
  const spell = P.mid !== undefined && opts.interaction !== 'trace' && print(P.mid) !== print(start);
  if (spell) good.push({ line: /** @type {Equation} */ (P.mid), legal: true });
  if (print(start) !== print(math)) good.push({ line: start, legal: true });
  good.push(...chain);
  if (good.length < 3 || good.length > (spell ? 6 : 5)) return undefined;
  if (good.some((st, i) => i > 0 && print(st.line) === print(good[i - 1].line))) return undefined;
  const shared = { variableKeys: [X], probes: probeEnvs([X]), visuals: ['balance', 'zeropair'], steps: good };
  const solveKey = { kind: /** @type {const} */ ('solution-set'), expected: key, formPredicates: [], assumptions: [] };

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Solve', math, goal: 'Solve for x.' }, answer: solveKey, ...shared });
    case 'nextline': case 'predict': {
      const at = good.map((st, i) => (st.move ? i : -1)).filter((i) => i > 0);
      const j = r.fork('step').pick(at);
      const prev = /** @type {Equation} */ (good[j - 1].line);
      const move = /** @type {Move} */ (good[j].move);
      const after = canonicalize(applyMove(move, prev));
      const p = makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Next line', math: prev, move, goal: moveText(move) },
        answer: { kind: 'equation-sides', expected: after, formPredicates: [], assumptions: [] },
        ...shared,
      });
      if (opts.interaction === 'predict') return p;
      const wrong = voteProofChoices(r.fork('wrong'), p, rulesFor(move));
      if (!wrong) return undefined;
      return { ...p, choices: shuffledChoices(r.fork('choices'), [{ display: after, verdict: 'correct' }, ...wrong]) };
    }
    case 'cast': {
      const cc = castChoices(r.fork('cast'), start, linearAlphabet, isSolvedLinear, undefined, undefined, idleDecoys(start));
      if (!cc) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Cast', math: start, goal: 'Pick a move for both sides.' },
        choices: cc.choices, moveGraph: cc.moveGraph, answer: solveKey, ...shared,
      });
    }
    case 'trace': {
      const steps = traceSteps(r.fork('trace'), good, planted);
      if (!steps) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Find the bad line', math, goal: 'Tap the first line that changes the solutions, or No bad line.' },
        choices: traceChoices(steps), answer: solveKey, ...shared, steps,
      });
    }
    case 'why': {
      const L = coeffs(start.lhs);
      const R = coeffs(start.rhs);
      if (!L || !R || isZero(L[0]) || isZero(R[1])) return undefined;
      const hz = hiddenZeroStep(start, 'r', R[1], 1);
      if (!hz) return undefined;
      const m = /** @type {Move} */ (chain[0].move);
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-0',
        prompt: { verb: 'Tap the hidden 0', math: hz.line, goal: `${moveText(m)} Tap the 0 that was added.` },
        choices: tapTargets(hz.line, [hz.zero, ...hz.others].sort(), hz.zero),
        answer: { kind: 'expr', expected: num(0), formPredicates: [], assumptions: [] },
        ...shared,
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['strike', 'nextline', 'predict', 'cast', 'trace', 'why'],
  alphabet: linearAlphabet,
  build(rng, opts) {
    const seed = rng.seed;
    /** @type {Kind} */
    const drawn = opts.difficulty === 4 ? rng.fork('kind').pick(/** @type {Kind[]} */ (['none', 'all', 'one'])) : 'one';
    // A Trace needs a true root for its number evidence (section 3 I6), and
    // the hidden-0 Why needs the two x terms to differ (else both sides show
    // a zero pair): on these two the d4 item always has one solution.
    const kind = opts.interaction === 'trace' || opts.interaction === 'why' ? 'one' : drawn;
    const planted = rng.fork('planted').int(0, 2) !== 0;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const P = draw(r.fork('params'), opts.difficulty, kind);
      if (!P) return undefined;
      const p = item(r, P, opts, seed, planted);
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
