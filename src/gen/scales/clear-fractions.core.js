// @ts-check
// clear-fractions (skill 15, DESIGN.md section 4): multiply BOTH sides by a
// numeric LCD (least common denominator) and every fraction is gone; the
// solutions stay because the multiplier is not 0. v1 restriction (section 3):
// numeric LCDs only, never a variable. Recipe: ../common.js; line helpers
// from ./balance-moves.core.js.
//
// Documented seed (pinned by test/gen/clear-fractions.test.js):
//   EXAMPLE_SEED at d2 strike: x/2 + x/3 = 5 -> x 6: 3x + 2x = 30 -> x = 6.
//
// Difficulty (section 4 gives none; my reading, reported). Every root is a
// whole number that is not 0 or 1; every number shown is small:
//   d1  one fraction, LCD 2..5, a whole number on the right:
//       x/3 + 2 = 5, x/4 - 1 = 2, (x + 4)/3 = 5.
//   (every numerator as written is at most 20 at d1-d2, 30 at d3-d4; every
//   number on the cleared line at most 60)
//   d2  two fractions with different denominators, LCD <= 12:
//       x/2 + x/3 = 5, x/4 - 1/2 = 3/4, x/3 = x/6 + 2.
//   d3  binomial numerators, LCD <= 12: (x + 1)/2 = (x - 3)/5,
//       (x + 3)/4 + (x - 1)/2 = 4.
//   d4  a minus in front of a binomial numerator, LCD <= 20:
//       x/2 - (x - 4)/3 = 3, (x + 2)/5 - (x - 1)/4 = 1/2.
//
// Worked chain (problem.steps): the line; at d1-d2 the multiplier written on
// EVERY term, "6(x/6) = 6(x/2) - 6(4/3)" (review finding 10: "do I multiply
// every term?" is this learner's question; with a Step.reason naming the
// LCD); "x LCD" written term by term
// ("3(x + 1) = 2(x - 3)": each denominator cancels against the LCD, the step
// this learner needs, and the whole-number terms are multiplied too); the
// line simplified (the products distributed, like terms combined); then the
// standard moves (balance-moves.core linearChain) to x = r.
//
// Interactions:
//   twin      I5 equation pair ("same solutions?", section 3: from
//             balance-moves onward), box 0-1, with the balance. The second
//             line is ALWAYS written like the cleared, simplified line. Same:
//             that line. Different: the same move done with a slip: a whole
//             number term not multiplied, the denominators dropped without
//             multiplying, one side only, a minus not distributed over a
//             numerator, a numerator's later term not multiplied, one
//             fraction's bottom dropped without multiplying its top, or its
//             top multiplied with its bottom thrown away. No mal-rule
//             compares equations on a Twin, so "same" is untagged here.
//             The typed follow-up key is the solution of the first line.
//   predict   I3 after the stated move "Multiply both sides by LCD": the
//             line, side-wise (section 3); 'lowest-terms' so that
//             "6(x/2) ..." written as 6x/2 is "same value, not finished".
//   strike    "Solve": the solution set.
//   cast      I1 on the item: chips "x LCD", "x" each single denominator,
//             "x" a multiple of one denominator that is larger than the LCD
//             and clears only some fractions (x 9 on x/2 + x/3, so the
//             largest multiplier is not always the answer), removing each
//             term, "/ x" (risky), "x 0" (illegal). With one denominator
//             the shown "Legal, not closer" chip is "x (LCD + 1)", so the LCD
//             chip is not the only multiply chip (review finding 12).
//             The goal is "no fractions left" (every coefficient a whole
//             number): with "solved" as the goal, "- 1/2, x 3" is as short as
//             "x 6, - 3, / 2" and the LCD chip would read "Legal. Not closer."
//             DEVIATION from the solved-form goal of the other Casts, reported.
//   trace     I6 on the worked chain; about 2 in 3 have one bad line, its
//             place drawn first: the "x LCD" line with a whole-number term not
//             multiplied (untagged: no rule models it; proposed rule reported;
//             but when the whole numbers are the entire other side that line
//             is the Lopsider's and is planted once, tagged as his)
//             or with one side only (one-sided-operation); the simplified line
//             with a minus not distributed (neg-distribution) or a later term
//             not multiplied (partial-distribution); or a later move done the
//             Lopsider's, Carrier's, Peeler's or Slicer's way (plantedChains);
//             or the "x LCD" line with the denominators dropped and nothing
//             multiplied (untagged). A clearing-line plant is preferred 1
//             time in 3 where one exists (review finding 10).
//             Every line after the bad one follows correctly from it and the
//             chain ends on a whole number that is not 0 or 1, like a clean
//             chain. Chains of 3-5 lines (section 3 I6: "a 3-5 line worked
//             solution"; the other interactions' worked chains may run to 6).
//   why       'hidden-1' (counting): "6(x/3) = 2(3/3)x": the denominator
//             cancels because 3/3 is 1. Sides drawn in either order.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, fitsDisplay, DISPLAY_CAP_PX,
  twinChoices, tapTargets, traceChoices, probeEnvs,
} from '../common.js';
import { num, mul, frac, add, neg, group, v, eq, isEquation } from '../../math/ast.js';
import { q, add as qadd, mul as qmul, div as qdiv, sub as qsub, gcd, isZero, ZERO } from '../../math/rational.js';
import { fromQ, toQ } from '../../math/surd.js';
import { print } from '../../math/print.js';
import { solve } from '../../math/solve.js';
import { sameSolutions, sameSides } from '../../math/equiv.js';
import { applyMove } from '../../moves/apply.js';
import { canonicalize, search, step } from '../../moves/graph.js';
import { classify } from '../../moves/classify.js';
import { polyNode } from '../../misc/kit.js';
import {
  X, coeffs, linearChain, castChoices, plantedChains, isOnly, moveText,
} from './balance-moves.core.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Move} Move */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').SolutionSet} SolutionSet */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/**
 * One written term: sign (p x + c)/den. den 1 is a plain term.
 * @typedef {{ s: bigint; p: bigint; c: bigint; den: bigint }} Term
 * @typedef {{ L: Term[]; R: Term[] }} Sides
 */

const GEN = Object.freeze({ id: 'clear-fractions.core', version: 1, skill: 'clear-fractions' });

/** Seed of the documented example (see the header). */
export const EXAMPLE_SEED = 's112';

const VISUALS = ['balance', 'bars'];

/** @param {bigint} a @param {bigint} b */
const lcm = (a, b) => (a / gcd(a, b)) * b;
/** @param {bigint} a */
const babs = (a) => (a < 0n ? -a : a);

// ---------------------------------------------------------------- terms

/** p x + c as a display tree. @param {bigint} p @param {bigint} c */
const lin = (p, c) => polyNode([q(c), q(p), ZERO], X);

/** A term's size (no sign) as written: x/3, 2x/3, 1/2, (x + 1)/2, 5, 2x. @param {Term} t @returns {Node} */
function sizeNode(t) {
  if (t.den === 1n) return lin(t.p, t.c);
  const top = t.p !== 0n && t.c !== 0n ? group(lin(t.p, t.c)) : lin(t.p, t.c);
  return frac(top, num(t.den));
}

/** A side as written. @param {Term[]} ts @returns {Node} */
function sideNode(ts) {
  const ns = ts.map((t) => (t.s < 0n ? neg(sizeNode(t)) : sizeNode(t)));
  return ns.length === 1 ? ns[0] : add(...ns);
}

/** The written line. @param {Sides} S @returns {Equation} */
const lineOf = (S) => eq(sideNode(S.L), sideNode(S.R));

/** [constant, x coefficient] of a side. @param {Term[]} ts @returns {[Q, Q]} */
function value(ts) {
  let c0 = ZERO;
  let c1 = ZERO;
  for (const t of ts) {
    c0 = qadd(c0, q(t.s * t.c, t.den));
    c1 = qadd(c1, q(t.s * t.p, t.den));
  }
  return [c0, c1];
}

/** LCD of every denominator shown. @param {Sides} S */
function lcdOf(S) { return [...S.L, ...S.R].reduce((a, t) => lcm(a, t.den), 1n); }

/**
 * A side after "x m", term by term: each term's denominator cancels against m:
 * (m/den)(p x + c), written k(p x + c) for a binomial, or the product worked out.
 * `skip` lists terms NOT multiplied (a bad line).
 * @param {Term[]} ts @param {bigint} m @param {(t: Term) => boolean} [skip]
 * @returns {Node}
 */
function clearedSide(ts, m, skip = () => false) {
  /** @type {Node[]} */
  const ns = [];
  for (const t of ts) {
    if (skip(t)) { ns.push(t.s < 0n ? neg(sizeNode(t)) : sizeNode(t)); continue; }
    const k = (m / t.den) * t.s;
    if (t.p !== 0n && t.c !== 0n && t.den > 1n && k !== 1n) {
      // k(p x + c), or -(p x + c): the numerator keeps its parentheses
      const body = group(lin(t.p, t.c));
      ns.push(k === -1n ? neg(body) : k < 0n ? neg(mul(num(-k), body)) : mul(num(k), body));
      continue;
    }
    // a product worked out; a numerator that is multiplied by 1 loses its parentheses
    if (k * t.p !== 0n) ns.push(lin(k * t.p, 0n));
    if (k * t.c !== 0n) ns.push(lin(0n, k * t.c));
  }
  return ns.length === 0 ? num(0) : ns.length === 1 ? ns[0] : add(...ns);
}

/**
 * A side with the multiplier written on EVERY term, before any product is
 * worked out: 6(x/6) - 6(4/3), 3(x/3) + 3(2). The step this learner asks
 * about ("does it go on every term?"; review finding 10).
 * @param {Term[]} ts @param {bigint} m @returns {Node}
 */
function spreadSide(ts, m) {
  const ns = ts.map((t) => { const pr = mul(num(m), group(sizeNode(t))); return t.s < 0n ? neg(pr) : pr; });
  return ns.length === 1 ? ns[0] : add(...ns);
}

/** The spread Step objects: measured on the stacked estimate; every other tree on common.js conservativeWidth, as before. */
const SPREAD = new WeakSet();

/**
 * Characters drawn for a tree with each fraction stacked (as wide as its
 * wider part, plus one). Pure; the harness re-checks every tree with
 * render/mathdom.js.
 * @param {Node} n @returns {number}
 */
function chars(n) {
  switch (n.t) {
    case 'frac': return Math.max(chars(n.num), chars(n.den)) + 1;
    case 'group': return chars(n.arg) + 2;
    case 'neg': return 1 + chars(n.arg);
    case 'add': return n.args.reduce((a, x, i) => a + chars(x) + (i > 0 ? 3 : 0), 0);
    case 'mul': return n.args.reduce((a, x) => a + chars(x), 0);
    default: return print(n).length;
  }
}
/**
 * Width estimate for the spread line "10(2x/5) - 10(x/2) = -10(9/10)", whose
 * one-line print is a little over the common.js cap: 16px a stacked
 * character plus 24, an equation wrapping at "=" when too wide.
 * @param {Node | Equation} x
 */
function stackedWidth(x) {
  const px = (/** @type {Node} */ y) => 16 * chars(y) + 24;
  if (!isEquation(x)) return px(x);
  const one = 16 * (chars(x.lhs) + 3 + chars(x.rhs)) + 24;
  return one <= DISPLAY_CAP_PX ? one : Math.max(px(x.lhs), px(x.rhs)) + 32;
}

/**
 * The worked chain with the spread line put in after the first line (it
 * carries the stated move; the cleared line follows from it), at d1-d2: at
 * d3-d4 the cleared line already shows k(x + 1) term by term, and the chain
 * would run past 6 lines. Lines too wide
 * for the phone are left out, as before.
 * @param {Step[]} good @param {Sides} S @param {bigint} lcd @param {number} d
 * @returns {Step[]}
 */
function withSpread(good, S, lcd, d) {
  const spread = eq(spreadSide(S.L, lcd), spreadSide(S.R, lcd));
  const [first, cleared, ...rest] = good;
  /** @type {Step[]} */
  const out = [first];
  const fits = (/** @type {Step} */ st) => fitsDisplay(st.line);
  if (d <= 2 && fitsDisplay(spread, { estimate: stackedWidth }) && print(spread) !== print(cleared.line)) {
    out.push({ line: spread, move: cleared.move, legal: true, reason: `Multiply every term on both sides by the LCD (least common denominator) ${lcd}${[...S.L, ...S.R].some((t) => t.den === 1n) ? ', whole numbers too' : ''}.` });
    out.push({ line: cleared.line, legal: true, reason: `Each denominator divides ${lcd}, so each fraction becomes a whole-number product.` });
    // the spread line is kept on the stacked estimate (checked above)
    SPREAD.add(out[1]);
    return [first, out[1], ...[out[2], ...rest].filter(fits)];
  }
  out.push(cleared);
  return [...out, ...rest].filter(fits);
}

// ---------------------------------------------------------------- draws

/** @param {Rng} r @param {number} lo @param {number} hi */
const pos = (r, lo, hi) => BigInt(r.int(lo, hi));
/** @param {Rng} r */
const sgn = (r) => (r.bool() ? 1n : -1n);

/**
 * Terms for each difficulty; one side is completed by a balancing number so
 * that x = root solves it (build backward from the answer).
 * @param {Rng} r @param {number} d @returns {{ S: Sides; root: bigint } | undefined}
 */
function draw(r, d) {
  /** @type {Term[]} */
  let L;
  /** @type {Term[]} */
  let R = [];
  let balance = true; // complete the right side with the number that makes x = root work
  let maxLcd = 12n;
  if (d === 1) {
    const a = pos(r, 2, 5);
    if (r.bool(0.65)) {
      L = [{ s: 1n, p: 1n, c: 0n, den: a }];
      if (r.bool(0.75)) L.push({ s: sgn(r), p: 0n, c: pos(r, 1, 9), den: 1n });
    } else L = [{ s: 1n, p: 1n, c: pos(r, 1, 9) * sgn(r), den: a }];
    maxLcd = 5n;
  } else if (d === 2) {
    const [a, b] = r.shuffle([2n, 3n, 4n, 5n, 6n]).slice(0, 2);
    const form = r.int(0, 2);
    if (form === 0) L = [{ s: 1n, p: pos(r, 1, 2), c: 0n, den: a }, { s: sgn(r), p: 1n, c: 0n, den: b }];
    else if (form === 1) L = [{ s: 1n, p: pos(r, 1, 3), c: 0n, den: a }, { s: sgn(r), p: 0n, c: pos(r, 1, 5), den: b }];
    else { L = [{ s: 1n, p: 1n, c: 0n, den: a }]; R = [{ s: 1n, p: 1n, c: 0n, den: b }]; }
  } else if (d === 3) {
    const [a, b] = r.shuffle([2n, 3n, 4n, 5n, 6n]).slice(0, 2);
    const t1 = { s: 1n, p: 1n, c: pos(r, 1, 9) * sgn(r), den: a };
    const t2 = { s: 1n, p: 1n, c: pos(r, 1, 9) * sgn(r), den: b };
    if (r.bool()) { L = [t1]; R = [t2]; balance = false; } else L = [t1, t2];
  } else {
    const [a, b] = r.shuffle([2n, 3n, 4n, 5n]).slice(0, 2);
    const first = r.bool() ? { s: 1n, p: 1n, c: 0n, den: a } : { s: 1n, p: 1n, c: pos(r, 1, 9) * sgn(r), den: a };
    L = [first, { s: -1n, p: 1n, c: pos(r, 1, 9) * sgn(r), den: b }];
    maxLcd = 20n;
  }
  const [l0, l1] = value(L);
  const [r0, r1] = value(R);
  /** @type {bigint} */
  let root;
  /** @type {Sides} */
  let S;
  if (!balance) {
    // both sides hold x: the root is forced; keep it only if it is a whole number we allow
    if (isZero(qsub(l1, r1))) return undefined;
    const x = qdiv(qsub(r0, l0), qsub(l1, r1));
    if (x.d !== 1n) return undefined;
    root = x.n;
    S = { L, R };
  } else {
    root = BigInt(r.pick(ROOTS));
    const need = qsub(qadd(l0, qmul(l1, q(root))), qadd(r0, qmul(r1, q(root))));
    if (isZero(need)) return undefined;
    if (d === 1 && need.d !== 1n) return undefined; // d1: one fraction only, a whole number on the right
    S = { L, R: [...R, { s: need.n < 0n ? -1n : 1n, p: 0n, c: babs(need.n), den: need.d }] };
  }
  if (root === 0n || root === 1n || babs(root) > 12n) return undefined;
  if (isZero(qsub(value(S.L)[1], value(S.R)[1]))) return undefined;
  const lcd = lcdOf(S);
  if (lcd < 2n || lcd > maxLcd) return undefined;
  // the LCD really is needed: no term is a whole number written as a fraction
  for (const t of [...S.L, ...S.R]) if (t.den > 1n && gcd(gcd(t.p, t.c), t.den) !== 1n) return undefined;
  // small numbers as written (numerators up to 20, 30 from d3) and on the cleared line
  for (const t of [...S.L, ...S.R]) if (babs(t.c) > (d <= 2 ? 20n : 30n)) return undefined;
  // small numbers on the cleared line
  for (const t of [...S.L, ...S.R]) if (babs((lcd / t.den) * t.c) > 60n || babs((lcd / t.den) * t.p) > 12n) return undefined;
  return { S, root };
}

const ROOTS = [-9, -8, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 8, 9, 10, 12];

// ---------------------------------------------------------------- chains

/**
 * The worked chain from the written line: line, "x LCD" term by term (the
 * stated move), the simplified line, the standard moves. undefined if a
 * line repeats or the chain is not linear.
 * @param {Equation} line @param {Node} lhs1 @param {Node} rhs1 the line after x LCD, term by term
 * @param {Move} move
 * @returns {Step[] | undefined}
 */
function chainFrom(line, lhs1, rhs1, move) {
  const l1 = eq(lhs1, rhs1);
  const l2 = canonicalize(l1);
  const rest = linearChain(l2);
  if (!rest) return undefined;
  /** @type {Step[]} */
  const steps = [{ line, legal: true }, { line: l1, move, legal: true }];
  if (print(l2) !== print(l1)) steps.push({ line: l2, legal: true });
  steps.push(...rest);
  if (steps.some((st, i) => i > 0 && print(st.line) === print(steps[i - 1].line))) return undefined;
  return steps;
}

/** The whole-number root a chain ends on, if any. @param {Step[]} steps */
function endRoot(steps) {
  const s = solve(/** @type {Equation} */ (steps[steps.length - 1].line), X);
  if (!s || s.kind !== 'finite' || s.roots.length !== 1) return undefined;
  const x = toQ(s.roots[0]);
  return x && x.d === 1n ? x.n : undefined;
}

/**
 * Every way to plant one bad line (see the header), each a full chain whose
 * later lines follow correctly from the bad one. The clear step and the
 * simplify step are planted here; later moves by plantedChains().
 * @param {Sides} S @param {Equation} line @param {Step[]} good @param {Move} move @param {bigint} lcd
 * @returns {Step[][]}
 */
function plants(S, line, good, move, lcd) {
  /** @type {Step[][]} */
  const out = [];
  /** @param {Step[]} steps @param {number} at @param {string | undefined} tag */
  const keep = (steps, at, tag) => {
    const bad = steps[at];
    if (sameSolutions(/** @type {Equation} */ (steps[at - 1].line), /** @type {Equation} */ (bad.line), X).equal !== false) return;
    const root = endRoot(steps);
    if (root === undefined || root === 0n || root === 1n || babs(root) > 20n) return;
    // like a clean chain: no fraction after the first line (else the look gives the plant away)
    if (!steps.slice(1).every((st) => noFractions(/** @type {Equation} */ (st.line)))) return;
    /** @type {Step} */
    const marked = { line: bad.line, legal: false };
    if (bad.move) marked.move = bad.move;
    if (tag) marked.malrule = tag;
    out.push(steps.map((st, i) => (i === at ? marked : st)));
  };
  // the x LCD line on one side only (the Lopsider)
  const lopLines = [eq(clearedSide(S.L, lcd), sideNode(S.R)), eq(sideNode(S.L), clearedSide(S.R, lcd))];
  const lopChains = lopLines.map((l) => chainFrom(line, l.lhs, l.rhs, move));
  for (const c of lopChains) if (c) keep(c, 1, 'one-sided-operation');
  // the x LCD line with a whole-number term not multiplied. When the whole
  // numbers are the entire other side this IS the Lopsider's line (one side
  // multiplied, the other not): then it carries his tag, and is not planted a
  // second time when his chain above already holds it (review gen2-oracle-a
  // finding 1: the same slip was tagged on some items and not on others).
  const whole = (/** @type {Term} */ t) => t.den === 1n;
  if ([...S.L, ...S.R].some(whole)) {
    const c = chainFrom(line, clearedSide(S.L, lcd, whole), clearedSide(S.R, lcd, whole), move);
    if (c) {
      const lop = lopLines.findIndex((l) => sameSides(/** @type {Equation} */ (c[1].line), l) === true);
      if (lop < 0) keep(c, 1, undefined);
      else if (!lopChains[lop]) keep(c, 1, 'one-sided-operation');
    }
  }
  // the denominators dropped and nothing multiplied (x/2 + x/3 = 5 read as
  // x + x = 5): the clearing slip on an item with no whole-number term
  // (review finding 10: d3 planted the clearing step 0 times in 200).
  // Untagged: no section 5 rule models it.
  {
    const dropped = (/** @type {Term[]} */ ts) => sideNode(ts.map((t) => ({ ...t, den: 1n })));
    const c = chainFrom(line, dropped(S.L), dropped(S.R), move);
    if (c && !out.some((o) => print(o[1].line) === print(c[1].line))) {
      const lop = lopLines.some((l) => sameSides(/** @type {Equation} */ (c[1].line), l) === true);
      if (!lop) keep(c, 1, undefined);
    }
  }
  // the simplified line with a product distributed wrongly
  if (good.length > 2 && !good[2].move) {
    const l1 = /** @type {Equation} */ (good[1].line);
    for (const [tag, wrongSide] of /** @type {[string, (n: Node) => Node | undefined][]} */ ([
      ['neg-distribution', (n) => distributeWrong(n, 'thief')],
      ['partial-distribution', (n) => distributeWrong(n, 'half')],
    ])) {
      for (const which of ['l', 'r']) {
        const side = which === 'l' ? l1.lhs : l1.rhs;
        const w = wrongSide(side);
        if (!w) continue;
        const l2 = canonicalize(which === 'l' ? eq(w, l1.rhs) : eq(l1.lhs, w));
        const rest = linearChain(l2);
        if (!rest) continue;
        /** @type {Step[]} */
        const steps = [good[0], good[1], { line: l2, legal: true }, ...rest];
        if (steps.some((st, i) => i > 0 && print(st.line) === print(steps[i - 1].line))) continue;
        keep(steps, 2, tag);
      }
    }
  }
  // a later move done wrong
  const at = good.findIndex((st, i) => i > 1 && st.move);
  if (at > 0) {
    for (const steps of plantedChains(good)) {
      const bad = steps.findIndex((st) => !st.legal);
      const root = endRoot(steps);
      if (bad >= at && root !== undefined && babs(root) <= 20n && steps.slice(1).every((st) => noFractions(/** @type {Equation} */ (st.line)))) out.push(steps);
    }
  }
  return out;
}

/**
 * A side's products distributed the Sign-Thief's way (a minus reaches the
 * first term only) or the Half-Hand's way (the multiplier reaches the first
 * term only), the rest of the side kept; undefined when no product is hit.
 * @param {Node} side @param {'thief' | 'half'} how @returns {Node | undefined}
 */
function distributeWrong(side, how) {
  const terms = side.t === 'add' ? side.args : [side];
  let hit = false;
  const out = terms.map((t) => {
    const negd = t.t === 'neg';
    const body = negd ? t.arg : t;
    if (body.t !== 'mul' || body.args.length !== 2 || body.args[0].t !== 'num' || body.args[1].t !== 'group') return t;
    const k = body.args[0].q.n * (negd ? -1n : 1n);
    const cs = coeffs(body.args[1].arg);
    if (!cs || cs[0].d !== 1n || cs[1].d !== 1n) return t;
    const p = cs[1].n;
    const c = cs[0].n;
    if (how === 'thief') {
      if (k > 0n) return t;
      hit = true;
      return lin(k * p, babs(k) * c);
    }
    hit = true;
    return lin(k * p, c);
  });
  if (!hit) return undefined;
  return out.length === 1 ? out[0] : add(...out);
}

// ---------------------------------------------------------------- Cast alphabet and goal

/** Every coefficient of both sides a whole number: no fractions left. @param {Equation} s */
export function noFractions(s) {
  const L = coeffs(s.lhs);
  const R = coeffs(s.rhs);
  return !!L && !!R && [...L, ...R].every((c) => c.d === 1n);
}

/** A term c x^k as a chip operand, written like the item: x/3, 2x/3, 1/2. @param {Q} c positive @param {number} k */
function chipTerm(c, k) {
  const top = k === 0 ? num(c.n) : c.n === 1n ? v(X) : mul(num(c.n), v(X));
  return c.d === 1n ? top : frac(top, num(c.d));
}

/**
 * The chip alphabet of a linear state with fractions (section 3 I1): "x LCD",
 * "x d" for each denominator, "x m" for one m > LCD that only some
 * denominators divide, remove each term, "/ x", "x 0".
 * At most 12 moves.
 * @param {Equation} state @returns {Move[]}
 */
export function fractionAlphabet(state) {
  /** @type {Move[]} */
  const out = [];
  const L = coeffs(state.lhs);
  const R = coeffs(state.rhs);
  if (L && R && isZero(L[2]) && isZero(R[2])) {
    const cs = [L[0], L[1], R[0], R[1]].filter((c) => !isZero(c));
    const dens = [...new Set(cs.map((c) => c.d).filter((d) => d > 1n))].sort((a, b) => (a < b ? -1 : 1));
    const lcd = dens.reduce((a, d) => lcm(a, d), 1n);
    if (lcd > 1n) {
      out.push({ op: 'mul', operand: num(lcd) });
      for (const d of dens) if (d !== lcd) out.push({ op: 'mul', operand: num(d) });
      // a multiple of one denominator that is LARGER than the LCD and still
      // leaves a fraction (x 9 on x/2 + x/3): "the biggest number clears it"
      // is then not a rule that works
      for (const d of dens) {
        if (d === lcd) continue;
        let m = d;
        while (m <= lcd || m % lcd === 0n) m += d;
        if (m <= 60n) { out.push({ op: 'mul', operand: num(m) }); break; }
      }
    }
    for (const side of [L, R]) {
      for (const k of [1, 0]) {
        const c = side[k];
        if (isZero(c)) continue;
        const size = c.n < 0n ? q(-c.n, c.d) : c;
        out.push({ op: c.n > 0n ? 'sub' : 'add', operand: chipTerm(size, k) });
      }
    }
  }
  out.push({ op: 'div', operand: v(X) }, { op: 'mul', operand: num(0) });
  /** @type {Set<string>} */
  const seen = new Set();
  return out.filter((m) => { const k = `${m.op} ${m.operand ? print(m.operand) : ''}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
}

// ---------------------------------------------------------------- items

/** Written shape of a line: digits become N. @param {Node | Equation} x */
export function shapeText(x) { return print(x).replace(/\d+/g, 'N'); }

/**
 * @param {Rng} r @param {Sides} S @param {bigint} root @param {GenOpts} opts @param {string} seed
 * @param {boolean} planted (trace only; drawn once per seed)
 * @param {boolean} want (twin only: a Same pair; drawn once per seed so that rejection does not skew the half)
 * @returns {Problem | undefined}
 */
function item(r, S, root, opts, seed, planted, want) {
  const line = lineOf(S);
  const s = solve(line, X);
  if (!s || !isOnly(s, q(root))) throw new Error(`${GEN.id}: built root is not the root (seed ${JSON.stringify(seed)})`);
  const lcd = lcdOf(S);
  /** @type {Move} */
  const move = { op: 'mul', operand: num(lcd) };
  const good = chainFrom(line, clearedSide(S.L, lcd), clearedSide(S.R, lcd), move);
  if (!good || good.length > 6) return undefined;
  const cleared = /** @type {Equation} */ (good[1].line);
  if (sameSides(cleared, applyMove(move, line)) !== true) throw new Error(`${GEN.id}: the cleared line is not the move (seed ${JSON.stringify(seed)})`);
  /** @type {SolutionSet} */
  const solved = { kind: 'finite', roots: [fromQ(q(root))] };
  const solveKey = { kind: /** @type {const} */ ('solution-set'), expected: solved, formPredicates: [], assumptions: [] };
  // (the < 3 test is on the chain without the spread line, so the accepted items are those of before)
  if (good.filter((st) => fitsDisplay(st.line)).length < 3) return undefined;
  const shared = { variableKeys: [X], probes: probeEnvs([X]), visuals: VISUALS, steps: withSpread(good, S, lcd, opts.difficulty) };

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Solve', math: line, goal: 'Solve for x.' }, answer: solveKey, ...shared });
    case 'predict':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Next line', math: line, move, goal: moveText(move) },
        answer: { kind: 'equation-sides', expected: cleared, formPredicates: ['lowest-terms'], assumptions: [] },
        ...shared,
      });
    case 'cast': {
      const start = canonicalize(line);
      // the chips name the canonical line's denominators: skip an item whose
      // like terms combine to a smaller LCD (x/6 + x/3 is x/2)
      const L0 = coeffs(start.lhs);
      const R0 = coeffs(start.rhs);
      if (!L0 || !R0 || [...L0, ...R0].reduce((a, c) => lcm(a, c.d), 1n) !== lcd) return undefined;
      const isLcd = (/** @type {Move} */ m) => m.op === 'mul' && m.operand !== undefined && m.operand.t === 'num' && m.operand.q.n === lcd;
      const cc = castChoices(r.fork('cast'), start, fractionAlphabet, noFractions, undefined, isLcd);
      if (!cc) return undefined;
      let choices = cc.choices;
      // one denominator: the shown "Legal, not closer" chip becomes a
      // multiplier the denominator does not divide (x 4 on x/3 + 2 = 5), so
      // "the only multiply chip" is not the answer (review finding 12: it
      // found the d1 key 99% of the time). Its verdict is checked here.
      const muls = choices.filter((c) => { const m = /** @type {Move} */ (c.display); return m.op === 'mul' && !(m.operand && m.operand.t === 'num' && m.operand.q.n === 0n); });
      const idle = choices.find((c) => c.verdict === 'legal-idle');
      if (muls.length === 1 && idle) {
        /** @type {Move} */
        const decoy = { op: 'mul', operand: num(lcd + 1n) };
        const now = cc.moveGraph.distance;
        const after = search(step(decoy, start), fractionAlphabet, noFractions);
        if (classify(decoy, start, []) !== 'legal' || after.capped || !after.found || after.found.distance < now) return undefined;
        choices = choices.map((c) => (c === idle ? { id: c.id, display: decoy, verdict: /** @type {const} */ ('legal-idle') } : c));
      }
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Cast', math: line, goal: 'Pick a move that clears every fraction.' },
        choices, moveGraph: cc.moveGraph, answer: solveKey, ...shared,
      });
    }
    case 'twin': {
      const tr = r.fork('twin');
      const simple = /** @type {Equation} */ (good[2] && !good[2].move ? good[2].line : good[1].line);
      const target = canonicalize(simple);
      /** @type {Equation} */
      let twin = target;
      if (!want) {
        /** @type {Equation[]} */
        const cands = [];
        const whole = (/** @type {Term} */ t) => t.den === 1n;
        if ([...S.L, ...S.R].some(whole)) cands.push(eq(clearedSide(S.L, lcd, whole), clearedSide(S.R, lcd, whole)));
        // denominators dropped: every numerator kept, nothing multiplied
        const dropped = (/** @type {Term[]} */ ts) => sideNode(ts.map((t) => ({ ...t, den: 1n })));
        cands.push(eq(dropped(S.L), dropped(S.R)));
        cands.push(eq(clearedSide(S.L, lcd), sideNode(S.R)), eq(sideNode(S.L), clearedSide(S.R, lcd)));
        // one fraction term cleared wrongly, the rest right: its bottom dropped
        // but its top not multiplied (6(4/3) read as 4), or its top
        // multiplied but its bottom kept away (6(4/3) read as 24). These keep
        // the written shape of the cleared line, so a fraction-only item has
        // Different partners too (review finding 2: d2 78%, d4 94%)
        for (const side of /** @type {const} */ (['L', 'R'])) {
          S[side].forEach((t, i) => {
            if (t.den === 1n) return;
            for (const how of /** @type {const} */ (['drop', 'top'])) {
              const ts = S[side].map((u, j) => (j !== i ? u : how === 'drop' ? { ...u, den: 1n } : { ...u, p: u.p * lcd, c: u.c * lcd, den: 1n }));
              const other = side === 'L' ? S.R : S.L;
              const a = clearedSide(ts, lcd, (u) => u === ts[i]);
              const b = clearedSide(other, lcd);
              cands.push(side === 'L' ? eq(a, b) : eq(b, a));
            }
          });
        }
        for (const how of /** @type {const} */ (['thief', 'half'])) {
          const wl = distributeWrong(cleared.lhs, how);
          const wr = distributeWrong(cleared.rhs, how);
          if (wl) cands.push(eq(wl, cleared.rhs));
          if (wr) cands.push(eq(cleared.lhs, wr));
        }
        const ok = cands.map((c) => canonicalize(c)).filter((c) => noFractions(c) && shapeText(c) === shapeText(target) && sameSolutions(c, line, X).equal === false);
        if (ok.length === 0) return undefined;
        twin = tr.pick(ok);
      }
      if (sameSolutions(line, twin, X).equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const prompt = { verb: 'Same solutions?', math: line, twin, goal: 'Then solve the first equation.' };
      return makeProblem(GEN, seed, opts, { prompt, choices: twinChoices(prompt, want), answer: solveKey, ...shared });
    }
    case 'trace': {
      let lines = good;
      if (planted) {
        const cands = plants(S, line, good, move, lcd).filter((st) => st.length >= 3 && st.length <= 5 && st.every((x) => fitsDisplay(x.line)));
        if (cands.length === 0) return undefined;
        /** @type {Map<number, Step[][]>} */
        const byPlace = new Map();
        for (const c of cands) {
          const at = c.findIndex((st) => !st.legal);
          byPlace.set(at, [...(byPlace.get(at) ?? []), c]);
        }
        const tr = r.fork('trace');
        // the fraction-clearing slip itself (a whole-number term not
        // multiplied, one side only, or the denominators dropped) is
        // preferred 1 time in 3 where it can be planted, on top of its share
        // of the uniform draw of the place (review finding 10); more would
        // make "the bad line is the first move" a positional tell at d1
        const clearing = cands.filter((c) => c.findIndex((st) => !st.legal) === 1);
        lines = clearing.length > 0 && tr.bool(1 / 3)
          ? tr.pick(clearing)
          : tr.pick(/** @type {Step[][]} */ (byPlace.get(tr.pick([...byPlace.keys()].sort((a, b) => a - b)))));
      }
      if (lines.length < 3 || lines.length > 5 || !lines.every((st) => fitsDisplay(st.line))) return undefined;
      for (let i = 1; i < lines.length; i++) {
        const same = sameSolutions(/** @type {Equation} */ (lines[i - 1].line), /** @type {Equation} */ (lines[i].line), X).equal;
        if (same !== lines[i].legal) throw new Error(`${GEN.id}: trace step ${i} is mislabelled (seed ${JSON.stringify(seed)})`);
      }
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Find the bad line', math: line, goal: 'Tap the first line that changes the solutions, or No bad line.' },
        choices: traceChoices(lines), answer: solveKey, ...shared, steps: lines,
      });
    }
    case 'why': {
      // a fraction term of the item, and the factor the LCD leaves: 6(x/3) = 2(3/3)x
      const fr = [...S.L, ...S.R].filter((t) => t.den > 1n && t.p !== 0n);
      if (fr.length === 0) return undefined;
      const t = r.fork('pick').pick(fr);
      const m = lcd / t.den;
      const body = t.c === 0n ? lin(t.p, 0n) : group(lin(t.p, t.c));
      const coin = group(frac(num(t.den), num(t.den)));
      const left = mul(num(lcd), group(frac(t.c === 0n ? lin(t.p, 0n) : group(lin(t.p, t.c)), num(t.den))));
      const right = m === 1n ? mul(coin, body) : mul(num(m), coin, body);
      const coinFirst = r.fork('side').bool();
      const math = coinFirst ? eq(right, left) : eq(left, right);
      const cs = coinFirst ? 'l' : 'r';
      const ls = coinFirst ? 'r' : 'l';
      const coinAt = m === 1n ? `${cs}.0` : `${cs}.1`;
      const targets = [`${ls}.0`, `${ls}.1`, coinAt, m === 1n ? `${cs}.1` : `${cs}.0`].sort();
      if (!isEquation(math)) return undefined;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math, goal: `Why ${lcd} times this fraction has no fraction left: tap the hidden 1.` },
        choices: tapTargets(math, targets, coinAt),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        ...shared,
        steps: [left, right, m === 1n ? lin(t.p, t.c) : mul(num(m), body)].map((ln) => ({ line: ln, legal: true })),
        visuals: ['coin', 'balance'],
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['twin', 'predict', 'strike', 'cast', 'trace', 'why'],
  alphabet: fractionAlphabet,
  build(rng, opts) {
    const seed = rng.seed;
    const planted = rng.fork('planted').int(0, 2) !== 0;
    const want = rng.fork('same').bool();
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const D = draw(r.fork('params'), opts.difficulty);
      if (!D) return undefined;
      const p = item(r, D.S, D.root, opts, seed, planted, want);
      return p && separated(p).ok && fitsAll({ ...p, steps: (p.steps ?? []).filter((st) => !SPREAD.has(st)) }) ? p : undefined;
    });
  },
});
