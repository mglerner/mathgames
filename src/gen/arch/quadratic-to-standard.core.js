// @ts-check
// quadratic-to-standard (skill 32, DESIGN.md sections 4 and 7): rewrite a
// quadratic equation as ... = 0 by moving terms (adding zero-pairs split
// across both sides). Either side may be the zero side. Recipe: ../common.js;
// line helpers from ../scales/balance-moves.core.js.
//
// The teacher's examples, reproducible by seed (pinned by
// test/gen/quadratic-to-standard.test.js):
//   EXAMPLE_SEED_D1 at difficulty 1: 6 + 4x = 2x^2 (roots 3 and -1)
//   EXAMPLE_SEED_D3 at difficulty 3: 4 + 4x = 2x^2 (roots 1 +- sqrt(3))
// in every interaction except Cast, which shows the line in canonical order
// (4x + 6 = 2x^2, 4x + 4 = 2x^2) because its chips are named from that form.
//
// Difficulty (section 4 slice deviation: d1-2 move terms only, integer roots;
// d3 is here only so that 4 + 4x = 2x^2 exists; the slice gate caps the
// planner at d2; my reading of the rest, reported):
//   d1  L - R = s a (x - r1)(x - r2), a in 1..3, s = +-1, r1 != r2 in
//       -5..-1, 2..5, r1 + r2 != 0, |a r1 r2| <= 30 (three terms); each
//       power on one side.
//   d2  the same with a fourth term: one power appears on both sides
//       (2x^2 + 3 = x^2 + 4x), so like terms combine after the move.
//   d3  L - R = s(a x^2 + b x + c) with a positive non-square discriminant
//       (two irrational roots), split as d1 or d2.
//
// Interactions:
//   nextline  "Subtract <one whole side> from both sides" (either side); the
//             line, the Lopsider's (0 = R) and the Carrier's (0 = R + L),
//             all shown with the zero side on the same side of the =.
//   predict   the same, typed; 0 = P and P = 0 are both right (side-wise
//             judging allows the swap).
//   strike    variant 'read-abc' (I8 "Read a, b, c") on the UNREARRANGED
//             line: any nonzero multiple of (a, b, c) of L - R = 0 is right;
//             this is where the Copyist (mal-rule 11) is caught.
//   cast      quadAlphabet chips: subtract a whole side (progress), subtract
//             one term or divide by the common factor (legal, not closer),
//             "/ x" (risky), "x 0" (illegal).
//   trace     the term-by-term chain to ... = 0, then "/ g" when the
//             coefficients share a factor g (3-5 lines); 2 in 3 have one bad
//             line (Carrier / Lopsider on a move, Peeler / Slicer / Lopsider
//             on the division, or the Copyist's line in place of the line
//             that reaches 0), only when it changes the solution set.
//   why       'hidden-0' (counting): in 6 + 4x - (6 + 4x) = 2x^2 - (6 + 4x)
//             tap the side that became 0; when that line is too wide for the
//             phone, the first term moved instead: tap the zero-pair
//             "(x^2 - x^2)" in "(x^2 - x^2) + 7 = 7x - 5 - x^2".
// "Rewrite as ... = 0" typed (answer kind 'equation-multiple') is NOT
// offered: see the report (the generator suite cannot pass it as written).

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, malChoices, shuffledChoices,
  tapTargets, traceChoices, probeEnvs, fitsDisplay, V_READ_ABC,
} from '../common.js';
import { num, add, neg, group, eq, isEquation } from '../../math/ast.js';
import { print } from '../../math/print.js';
import { seq, SZERO, SONE } from '../../math/surd.js';
import { outputsOf } from '../../misc/diagnose.js';
import { q, isZero, gcd, sign } from '../../math/rational.js';
import { solve } from '../../math/solve.js';
import { sameSolutions } from '../../math/equiv.js';
import { applyMove } from '../../moves/apply.js';
import { canonicalize, step } from '../../moves/graph.js';
import { qNode } from '../../misc/kit.js';
import lopsider from '../../misc/malrules/one-sided-operation.js';
import carrier from '../../misc/malrules/transpose-no-sign-change.js';
import peeler from '../../misc/malrules/transpose-coefficient-as-subtract.js';
import slicer from '../../misc/malrules/divide-one-term.js';
import copyist from '../../misc/malrules/copy-coefficients.js';
import {
  X, coeffs, mono, termMove, divMove, quadAlphabet, isZeroSided, castChoices, moveText, hiddenZeroStep,
} from '../scales/balance-moves.core.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Move} Move */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {{ math: Equation; P: bigint[] }} Params  P = [c, b, a] of the standard form, a > 0 */

const GEN = Object.freeze({ id: 'quadratic-to-standard.core', version: 1, skill: 'quadratic-to-standard' });

/** makeRng(EXAMPLE_SEED_D1) at d1 gives 6 + 4x = 2x^2. Pinned by the test. */
export const EXAMPLE_SEED_D1 = 'parent-quad-d1-6045';
/** makeRng(EXAMPLE_SEED_D3) at d3 gives 4 + 4x = 2x^2. Pinned by the test. */
export const EXAMPLE_SEED_D3 = 'parent-quad-d3-13319';

const ROOTS = [-5, -4, -3, -2, -1, 2, 3, 4, 5];

/** @param {bigint} n */
function isSquare(n) {
  if (n < 0n) return false;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x * x === n;
}

/** A side from its terms, in the given order. @param {{ c: bigint; k: number }[]} ts @returns {Node} */
function side(ts) {
  const nodes = ts.map((t) => mono(q(t.c), t.k));
  return nodes.length === 1 ? nodes[0] : add(...nodes);
}

/** @param {Rng} r @param {number} d @returns {Params | undefined} */
function draw(r, d) {
  /** @type {bigint[]} */
  let P;
  if (d <= 2) {
    const a = BigInt(r.int(1, 3));
    const r1 = BigInt(r.pick(ROOTS));
    const r2 = BigInt(r.pick(ROOTS));
    if (r1 === r2 || r1 + r2 === 0n) return undefined;
    P = [a * r1 * r2, -a * (r1 + r2), a];
    if (P[0] > 30n || P[0] < -30n) return undefined;
  } else {
    const a = BigInt(r.int(1, 3));
    const b = BigInt(r.pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]));
    const c = BigInt(r.pick([-9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const disc = b * b - 4n * a * c;
    if (disc <= 0n || isSquare(disc)) return undefined;
    P = [c, b, a];
  }
  const s = r.bool() ? 1n : -1n;
  const T = P.map((x) => s * x); // L - R
  const onLeft = [r.bool(), r.bool(), r.bool()];
  if (onLeft.every(Boolean) || onLeft.every((x) => !x)) return undefined;
  const L = [0n, 0n, 0n];
  const R = [0n, 0n, 0n];
  for (let k = 0; k < 3; k++) { if (onLeft[k]) L[k] = T[k]; else R[k] = -T[k]; }
  const four = d === 2 || (d === 3 && r.bool());
  if (four) {
    const k = r.int(0, 2);
    const u = BigInt(r.pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]));
    L[k] += u;
    R[k] += u;
    if (L[k] === 0n || R[k] === 0n) return undefined;
  }
  /** @param {bigint[]} cs */
  const terms = (cs) => r.shuffle([0, 1, 2].filter((k) => cs[k] !== 0n).map((k) => ({ c: cs[k], k })));
  return { math: eq(side(terms(L)), side(terms(R))), P };
}

/** The rules that model a wrong way of doing this stated move. @param {Move} m */
const rulesFor = (m) => (m.op === 'div' ? [lopsider, peeler, slicer] : [lopsider, carrier]);

/** A scratch Problem for a rule to read (rules read only prompt, answer, variant). @param {Equation} math @param {Move | undefined} m @param {'equation-sides' | 'equation-multiple'} kind @returns {Problem} */
function scratch(math, m, kind) {
  return /** @type {Problem} */ ({
    id: 'scratch', gen: GEN.id, version: GEN.version, seed: '', skill: GEN.skill, difficulty: 1,
    interaction: kind === 'equation-sides' ? 'nextline' : 'strike', constructed: kind !== 'equation-sides', fadeLevel: 0,
    prompt: m ? { verb: 'Next line', math, move: m } : { verb: 'Rewrite', math },
    assumptions: [], variableKeys: [X], visuals: [], probes: [],
    answer: { kind, expected: m ? canonicalize(applyMove(m, math)) : math, formPredicates: kind === 'equation-multiple' ? ['standard-form'] : [], assumptions: [] },
  });
}

/** The move that subtracts the whole side `which` (a one-term side: that term's move). @param {Equation} e @param {'l' | 'r'} which @returns {Move | undefined} */
function wholeSideMove(e, which) {
  const S = which === 'l' ? e.lhs : e.rhs;
  const cs = coeffs(S);
  if (!cs) return undefined;
  const nz = [2, 1, 0].filter((k) => !isZero(cs[k]));
  if (nz.length === 1) return termMove(cs[nz[0]], nz[0]);
  return { op: 'sub', operand: S };
}

/**
 * Term-by-term to "... = 0" with `zero` the side that empties, then "/ g"
 * when the coefficients share a factor g (sign chosen so x^2 is positive).
 * @param {Equation} line @param {'l' | 'r'} zero @returns {Step[] | undefined} the steps after `line`
 */
function quadChain(line, zero) {
  /** @type {Step[]} */
  const out = [];
  let cur = line;
  for (let i = 0; i < 4; i++) {
    const Z = coeffs(zero === 'l' ? cur.lhs : cur.rhs);
    if (!Z) return undefined;
    const k = [2, 1, 0].find((j) => !isZero(Z[j]));
    if (k === undefined) break;
    const m = termMove(Z[k], k);
    cur = step(m, cur);
    out.push({ line: cur, move: m, legal: true });
  }
  const Z = coeffs(zero === 'l' ? cur.lhs : cur.rhs);
  const O = coeffs(zero === 'l' ? cur.rhs : cur.lhs);
  if (!Z || !O || !Z.every(isZero)) return undefined;
  if (O.some((c) => c.d !== 1n) || O.every(isZero)) return out;
  let g = O.reduce((acc, c) => gcd(acc, c.n), 0n);
  const lead = [2, 1, 0].find((j) => !isZero(O[j]));
  if (lead !== undefined && sign(O[lead]) < 0) g = -g;
  if (g !== 1n) {
    const m = divMove(q(g));
    cur = step(m, cur);
    out.push({ line: cur, move: m, legal: true });
  }
  return out;
}

/**
 * The trace chain: the correct steps, or one planted bad line. Every way of
 * planting is listed (each stated move done each way its rules model; the
 * Copyist's line in place of the line that reaches 0) and one is drawn. Kept
 * only when the bad line changes the solution set, exactly one rule gives
 * it, no line repeats, the chain has 3-5 lines, and the last line does not
 * have the coincidence roots 0 or 1 (section 3).
 * @param {Rng} r @param {Step[]} good first line included @param {'l' | 'r'} zero @param {Equation} math
 * @param {boolean} planted drawn once per seed (2 in 3), so rejection does not move the share
 * @returns {Step[] | undefined}
 */
function traceSteps(r, good, zero, math, planted) {
  if (!planted) return good;
  /** @type {Step[][]} */
  const cands = [];
  for (let j = 1; j < good.length; j++) {
    const m = good[j].move;
    if (!m) continue;
    const prev = /** @type {Equation} */ (good[j - 1].line);
    const reachesZero = isZeroSided(/** @type {Equation} */ (good[j].line)) && !isZeroSided(prev);
    /** @type {Map<string, { bad: Equation; rules: Set<string> }>} */
    const lines = new Map();
    for (const rule of reachesZero ? [...rulesFor(m), copyist] : rulesFor(m)) {
      const outs = rule === copyist ? outputsOf(rule, scratch(math, undefined, 'equation-multiple')) : outputsOf(rule, scratch(prev, m, 'equation-sides'));
      for (const out of outs) {
        if (!isEquation(out)) continue;
        let bad = canonicalize(out);
        if (rule === copyist && zero === 'l') bad = eq(bad.rhs, bad.lhs);
        const k = print(bad);
        const e = lines.get(k) ?? { bad, rules: new Set() };
        e.rules.add(rule.id);
        lines.set(k, e);
      }
    }
    for (const { bad, rules } of lines.values()) {
      if (rules.size !== 1) continue;
      if (sameSolutions(prev, bad, X).equal !== false) continue;
      const rest = quadChain(bad, zero);
      if (!rest) continue;
      /** @type {Step[]} */
      const steps = [...good.slice(0, j), { line: bad, move: m, legal: false, malrule: [...rules][0] }, ...rest];
      if (steps.length < 3 || steps.length > 5) continue;
      if (steps.some((st, i) => i > 0 && print(st.line) === print(steps[i - 1].line))) continue;
      const end = solve(/** @type {Equation} */ (steps[steps.length - 1].line), X);
      if (!end || (end.kind === 'finite' && end.roots.some((x) => seq(x, SZERO) || seq(x, SONE)))) continue;
      cands.push(steps);
    }
  }
  return cands.length > 0 ? r.pick(cands) : undefined;
}

/**
 * The hidden-0 step of "subtract the whole side `zero`": that side shows
 * "S - (S)", the other "O - (S)". zero: the path of the side that became 0.
 * @param {Equation} e @param {'l' | 'r'} zero
 * @returns {{ line: Equation; zero: string; targets: string[] } | undefined}
 */
function hiddenZero(e, zero) {
  const S = zero === 'l' ? e.lhs : e.rhs;
  const O = zero === 'l' ? e.rhs : e.lhs;
  const cs = coeffs(S);
  if (!cs) return undefined;
  const nz = [2, 1, 0].filter((k) => !isZero(cs[k]));
  if (nz.length === 1) {
    const hz = hiddenZeroStep(e, zero, cs[nz[0]], nz[0]);
    return hz && { line: hz.line, zero: hz.zero, targets: [hz.zero, ...hz.others].sort() };
  }
  const back = neg(group(S));
  const terms = (/** @type {Node} */ n) => (n.t === 'add' ? n.args : [n]);
  const held = add(...terms(S), back);
  const moved = add(...terms(O), back);
  const line = zero === 'l' ? eq(held, moved) : eq(moved, held);
  const o = zero === 'l' ? 'r' : 'l';
  return { line, zero, targets: [zero, `${zero}.${held.t === 'add' ? held.args.length - 1 : 0}`, o, `${o}.${moved.t === 'add' ? moved.args.length - 1 : 0}`].sort() };
}

/**
 * @param {Rng} r @param {Params} Pm @param {GenOpts} opts @param {string} seed
 * @param {boolean} planted (trace only)
 * @returns {Problem | undefined}
 */
function item(r, Pm, opts, seed, planted) {
  const { math, P } = Pm;
  const sol = solve(math, X);
  const standard = eq(add(mono(q(P[2]), 2), mono(q(P[1]), 1), mono(q(P[0]), 0)), num(0));
  if (!sol || sol.kind !== 'finite' || sol.roots.length !== 2 || sameSolutions(math, standard, X).equal !== true) {
    throw new Error(`${GEN.id}: the line is not the built quadratic (seed ${JSON.stringify(seed)})`);
  }
  const visuals = ['balance', 'zeropair'];
  const rr = r.fork('side');
  /** @type {'l' | 'r'} */
  const zero = rr.bool() ? 'l' : 'r';
  // The worked solution: term by term to ... = 0 (the Trace builds its own).
  const worked = quadChain(math, zero);
  /** @type {Step[]} */
  const steps = worked && worked.length > 0 ? [{ line: math, legal: true }, ...worked] : [{ line: math, legal: true }, { line: standard, legal: true }];
  const shared = { variableKeys: [X], probes: probeEnvs([X]), visuals, steps };
  const solKey = { kind: /** @type {const} */ ('solution-set'), expected: sol, formPredicates: [], assumptions: [] };

  switch (opts.interaction) {
    case 'nextline': case 'predict': {
      const move = wholeSideMove(math, zero);
      if (!move) return undefined;
      const after = canonicalize(applyMove(move, math));
      const p = makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Next line', math, move, goal: moveText(move) },
        answer: { kind: 'equation-sides', expected: after, formPredicates: [], assumptions: [] },
        ...shared,
      });
      if (opts.interaction === 'predict') return p;
      const wrong = malChoices(p, [lopsider, carrier]);
      if (!wrong || wrong.length !== 2) return undefined;
      const flip = rr.bool(); // show the zero side on the left or on the right, the same for every candidate
      /** @param {Node | Equation | import('../../../types.d.ts').Move} x */
      const show = (x) => { const e = /** @type {Equation} */ (x); return flip ? eq(e.rhs, e.lhs) : e; };
      return {
        ...p,
        choices: shuffledChoices(r.fork('choices'), [{ display: show(after), verdict: 'correct' }, ...wrong.map((w) => ({ ...w, display: show(w.display) }))]),
      };
    }
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        variant: V_READ_ABC,
        prompt: { verb: 'Read a, b, c', math, goal: 'Rewrite it as ... = 0 (either side may be 0). Type a, b, c.' },
        answer: { kind: 'tuple', expected: [qNode(q(P[2])), qNode(q(P[1])), qNode(q(P[0]))], formPredicates: [], assumptions: [] },
        ...shared,
      });
    case 'cast': {
      const start = canonicalize(math);
      const cc = castChoices(r.fork('cast'), start, quadAlphabet, isZeroSided);
      if (!cc) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Cast', math: start, goal: 'Pick a move that makes one side 0.' },
        choices: cc.choices, moveGraph: cc.moveGraph, answer: solKey, ...shared,
      });
    }
    case 'trace': {
      const chain = quadChain(math, zero);
      if (!chain) return undefined;
      /** @type {Step[]} */
      const good = [{ line: math, legal: true }, ...chain];
      if (good.length < 3 || good.length > 5) return undefined;
      const traced = traceSteps(r.fork('trace'), good, zero, math, planted);
      if (!traced) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Find the bad line', math, goal: 'Tap the first line that changes the solutions, or No bad line.' },
        choices: traceChoices(traced), answer: solKey, ...shared, steps: traced,
      });
    }
    case 'why': {
      let hz = hiddenZero(math, zero);
      let move = wholeSideMove(math, zero);
      let tail = 'Tap the side that is now 0.';
      if (!hz || !fitsDisplay(hz.line)) {
        // "S - (S)" is too wide: show the first term of that side moved instead
        const cs = coeffs(zero === 'l' ? math.lhs : math.rhs);
        const k = cs && [2, 1, 0].find((j) => !isZero(cs[j]));
        if (!cs || k === undefined) return undefined;
        const h = hiddenZeroStep(math, zero, cs[k], k);
        if (!h) return undefined;
        hz = { line: h.line, zero: h.zero, targets: [h.zero, ...h.others].sort() };
        move = termMove(cs[k], k);
        tail = 'Tap the 0 that was added.';
      }
      if (!move) return undefined;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-0',
        prompt: { verb: 'Tap the hidden 0', math: hz.line, goal: `${moveText(move)} ${tail}` },
        choices: tapTargets(hz.line, hz.targets, hz.zero),
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
  difficulty: [1, 3],
  interactions: ['nextline', 'predict', 'strike', 'cast', 'trace', 'why'],
  alphabet: quadAlphabet,
  build(rng, opts) {
    const seed = rng.seed;
    const planted = rng.fork('planted').int(0, 2) !== 0;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const P = draw(r.fork('params'), opts.difficulty);
      if (!P) return undefined;
      const p = item(r, P, opts, seed, planted);
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
