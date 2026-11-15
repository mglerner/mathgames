// @ts-check
// square-roots (skill 22, DESIGN.md section 4): sqrt(p) is THE NONNEGATIVE
// number whose square is p; the equation x^2 = p (p > 0) has TWO solutions,
// sqrt(p) and -sqrt(p) (typed with the plus-minus key, or as a list). Built on
// the recipe in ../common.js, following src/gen/stacks-roots/sqrt-squared.core.js.
//
// Two kinds of item, both at every difficulty:
//   eval   a square root to evaluate (the nonnegative root);
//   solve  an equation x^2 = p, or one that reduces to it (both roots).
// Difficulty (section 4 gives none per skill; my reading, reported):
//   d1  eval sqrt(n^2), n in 2..12; solve x^2 = n^2, n in 2..12. Every number
//       is inside the times table (n^2 <= 144).
//   d2  eval sqrt(n^2), n in 2..15, or -sqrt(n^2) (the minus is outside the
//       root), or sqrt(p^2 + q^2) with a whole root (legs of a Pythagorean
//       triple up to 12: the Splitter's ground); solve a x^2 = a n^2 (a in
//       2..5) or x^2 + c = n^2 + c (c in 1..20).
//   d3  eval sqrt(a^2/b^2) = a/b (a, b in 2..9, coprime); solve x^2 = p with p
//       squarefree in 2..30 (roots +-sqrt(p)), or x^2 = a^2/b^2.
//   d4  eval sqrt((-n)^2) = n (the root of a square is never negative), or
//       sqrt(a^2/b^2); solve a x^2 + c = d (a in 1..5, c in -20..20 not 0)
//       down to x^2 = t, t = n^2 or t squarefree, and on about 1 in 5 a
//       negative t: NO real solution (a square is never negative).
// Never: a negative radicand; a root 0 or 1; a variable under a root.
//
// Interactions:
//   twin      eval kinds only (expression pairs, numeric). The prompt root
//             against: its value (Same; at d2 a sum root is also paired with
//             a sum that IS the value, sqrt(16 + 9) vs 2 + 3, so "a sum is
//             Different" is no tell); the Halver's p/2 only when it is
//             written like the value (whole for a whole value; on whole
//             values it coincides with the Smuggler's and is rejected, so it
//             shows at d3-4); the Splitter's p + q for a sum; or near misses
//             written like the value and untagged: the value +- 1 ("square
//             it and see"), for a fraction the root of one part only
//             (sqrt(9/64) vs 3/64), and at d4 the negative root -n for
//             sqrt((-n)^2) (no rule models "sqrt of (-5)^2 is -5"; on about
//             1 Different pair in 5 there, and that look always means
//             Different). Same / Different about half each. Follow-up key:
//             the common value (no single form of 1 joins sqrt(49) and 7), or
//             both values (tuple).
//   strike    "Evaluate" (eval: the value; integer, or a fraction in lowest
//             terms) or "Solve" (solve: the solution set; each typed value
//             radical-simplified, so "sqrt(49)" is "not finished").
//   why       variant 'hidden-1' (counting): (k/e)(sqrt(n^2)/n) in either
//             order: two fractions, tap the one worth 1 (because sqrt(n^2) is
//             n, the nonnegative root). Targets: both fractions and the top
//             and bottom of each (so the targets do not mark the 1).
// Every item carries the worked chain in `steps`: eval shows the radicand
// as a square, sqrt(49) -> sqrt(7^2) -> 7 (sqrt((-5)^2) -> sqrt(25) ->
// sqrt(5^2) -> 5); solve undoes the other operations and ends on
// x^2 = 7^2 (x^2 = sqrt(7)^2), the line where BOTH 7 and -7 visibly work;
// its Step.reason states both solutions ("So x = 7 or x = -7: (7)(7) = 49
// and (-7)(-7) = 49 too."), or, for x^2 = -5, that no number has a negative
// square (review finding 8; a legal line "x = r" cannot hold two roots).
//
// Mal-rules separated here: half-power-is-half (16), sqrt-splits-sum (15),
// form-change-changes-value (2). The central wrong answer of this skill,
// x^2 = 49 -> {7} (the negative root dropped), is judged wrong ("One
// solution is missing.") but UNCLASSIFIED: no section 5 rule models it
// (reported under NEEDS FROM OTHERS). So is sqrt((-5)^2) -> -5.
//
// Documented seeds (pinned by test/gen/square-roots.test.js):
//   EXAMPLE_SEED at d1: the strike "Solve x^2 = 49" (key -7, 7);
//   NONNEG_SEED at d4: the twin sqrt((-5)^2) vs -5 (Different).
//
// Display width: as in sqrt-squared.core.js, fitsAll() gets a fixed estimate
// that counts "sqrt(" as one character. The harness re-checks every
// displayed tree with the real mathdom estimate.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll,
  twinChoices, tapTargets, probeEnvs, DISPLAY_CAP_PX, TWIN_SAME,
} from '../common.js';
import { num, mul, add, neg, frac, pow, sqrt, group, eq, v, isEquation } from '../../math/ast.js';
import { q, gcd } from '../../math/rational.js';
import { constValue } from '../../math/evaluate.js';
import { fromQ, sneg, surdToNode } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { malrules, ruleMatches } from '../../misc/diagnose.js';
import halver from '../../misc/malrules/half-power-is-half.js';
import splitter from '../../misc/malrules/sqrt-splits-sum.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Surd} Surd */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').SolutionSet} SolutionSet */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/**
 * @typedef {{ kind: 'eval'; form: 'sq' | 'negsq' | 'sum' | 'frac' | 'negbase'; n: bigint; m: bigint; h?: bigint }
 *   | { kind: 'solve'; a: bigint; c: bigint; t: Q; root: 'whole' | 'frac' | 'surd' | 'none' }} Params
 *   eval: sq sqrt(n^2); negsq -sqrt(n^2); sum sqrt(n^2 + m^2) = h; frac sqrt(n^2/m^2);
 *         negbase sqrt((-n)^2).
 *   solve: a x^2 + c = a t + c, x^2 = t.
 */

const GEN = Object.freeze({ id: 'square-roots.core', version: 1, skill: 'square-roots' });

/** makeRng(EXAMPLE_SEED) at d1, strike: "Solve x^2 = 49". Pinned by the test. */
export const EXAMPLE_SEED = 'x2-49-14';
/** makeRng(NONNEG_SEED) at d4, twin: sqrt((-5)^2) vs -5 (Different). Pinned by the test. */
export const NONNEG_SEED = 'nonneg-51';

const X = 'x';
const TRIPLES = Object.freeze([[3n, 4n, 5n], [6n, 8n, 10n], [5n, 12n, 13n], [9n, 12n, 15n]]);
const SQUAREFREE = Object.freeze([2n, 3n, 5n, 6n, 7n, 10n, 11n, 13n, 14n, 15n, 17n, 19n, 21n, 22n, 23n, 26n, 29n, 30n]);
const SQUAREFREE_SMALL = Object.freeze([2n, 3n, 5n, 6n, 7n, 10n, 11n, 13n, 14n, 15n]);

/**
 * Width estimate for fitsAll: conservativeWidth with "sqrt(" as one character.
 * @param {Node | Equation} x @returns {number}
 */
function rootWidth(x) {
  const px = (/** @type {Node | Equation} */ y) => { const s = print(y); return 16 * (s.length - 4 * (s.match(/sqrt\(/g) ?? []).length) + 24; };
  const one = px(x);
  if (!isEquation(x) || one <= DISPLAY_CAP_PX) return one;
  return Math.max(px(x.lhs), px(x.rhs)) + 32;
}

/**
 * rootWidth, but a product of fractions (the Why) is measured as drawn:
 * each fraction is stacked, so it is as wide as the wider of its two parts.
 * @param {Node | Equation} x @returns {number}
 */
function stackedWidth(x) {
  if (isEquation(x) || x.t !== 'mul' || !x.args.every((a) => a.t === 'frac')) return rootWidth(x);
  return x.args.reduce((w, a) => w + (a.t === 'frac' ? Math.max(rootWidth(a.num), rootWidth(a.den)) : 0), 0);
}

/** @param {Rng} r @param {bigint} lo @param {bigint} hi */
const bint = (r, lo, hi) => BigInt(r.int(Number(lo), Number(hi)));

/**
 * @param {Rng} r @param {number} d @param {'eval' | 'solve'} kind
 * @returns {Params | undefined}
 */
function draw(r, d, kind) {
  if (kind === 'eval') {
    if (d === 1) return { kind, form: 'sq', n: bint(r, 2n, 12n), m: 0n };
    if (d === 2) {
      const form = r.pick(/** @type {const} */ (['sq', 'negsq', 'sum']));
      if (form === 'sum') {
        const [p, s, h] = r.pick(TRIPLES);
        return r.bool() ? { kind, form, n: p, m: s, h } : { kind, form, n: s, m: p, h };
      }
      return { kind, form, n: bint(r, 2n, form === 'sq' ? 15n : 12n), m: 0n };
    }
    const form = d === 3 ? 'frac' : r.pick(/** @type {const} */ (['negbase', 'negbase', 'frac']));
    if (form === 'negbase') return { kind, form, n: bint(r, 2n, 12n), m: 0n };
    const n = bint(r, 2n, 9n);
    const m = bint(r, 2n, 9n);
    return n !== m && gcd(n, m) === 1n ? { kind, form, n, m } : undefined;
  }
  if (d === 1) {
    const n = bint(r, 2n, 12n);
    return { kind, a: 1n, c: 0n, t: q(n * n), root: 'whole' };
  }
  if (d === 2) {
    const n = bint(r, 2n, 9n);
    if (r.bool()) {
      const a = bint(r, 2n, 5n);
      return a * n * n <= 150n ? { kind, a, c: 0n, t: q(n * n), root: 'whole' } : undefined;
    }
    return { kind, a: 1n, c: bint(r, 1n, 20n), t: q(n * n), root: 'whole' };
  }
  if (d === 3) {
    if (r.bool(2 / 3)) return { kind, a: 1n, c: 0n, t: q(r.pick(SQUAREFREE)), root: 'surd' };
    const n = bint(r, 2n, 9n);
    const m = bint(r, 2n, 9n);
    return n !== m && gcd(n, m) === 1n ? { kind, a: 1n, c: 0n, t: q(n * n, m * m), root: 'frac' } : undefined;
  }
  const a = bint(r, 1n, 5n);
  const c = bint(r, 1n, 20n) * (r.bool() ? 1n : -1n);
  const pick = r.int(1, 5);
  if (pick === 1) {
    const t = -bint(r, 1n, 9n); // a x^2 + c = a t + c with t < 0: no real solution
    return { kind, a, c, t: q(t), root: 'none' };
  }
  if (pick <= 3) {
    const n = bint(r, 2n, 6n);
    return a * n * n <= 100n ? { kind, a, c, t: q(n * n), root: 'whole' } : undefined;
  }
  const p = r.pick(SQUAREFREE_SMALL);
  return a * p <= 60n ? { kind, a, c, t: q(p), root: 'surd' } : undefined;
}

/** A rational as a display node: 7, 3/2. @param {Q} x @returns {Node} */
function qn(x) { return x.d === 1n ? num(x.n) : frac(num(x.n), num(x.d)); }

/** The square root of t (t > 0) as a Surd: a perfect square ratio or a squarefree whole number. @param {Params & { kind: 'solve' }} d @returns {Surd} */
function rootOf(d) {
  if (d.root === 'surd') return { terms: [{ coef: q(1n), rad: d.t.n }] };
  const rt = (/** @type {bigint} */ N) => { let s = 0n; while ((s + 1n) * (s + 1n) <= N) s++; return s; };
  return fromQ(q(rt(d.t.n), rt(d.t.d)));
}

/**
 * The eval prompt, its value and its worked chain.
 * @param {Params & { kind: 'eval' }} d @returns {{ math: Node; value: Q; steps: Node[] }}
 */
function evalForm(d) {
  const { n, m } = d;
  switch (d.form) {
    case 'sq': {
      const math = sqrt(num(n * n));
      return { math, value: q(n), steps: [math, sqrt(pow(num(n), num(2))), num(n)] };
    }
    case 'negsq': {
      const math = neg(sqrt(num(n * n)));
      return { math, value: q(-n), steps: [math, neg(sqrt(pow(num(n), num(2)))), neg(num(n))] };
    }
    case 'sum': {
      const h = /** @type {bigint} */ (d.h);
      const math = sqrt(add(num(n * n), num(m * m)));
      return { math, value: q(h), steps: [math, sqrt(num(h * h)), sqrt(pow(num(h), num(2))), num(h)] };
    }
    case 'frac': {
      const math = sqrt(frac(num(n * n), num(m * m)));
      return { math, value: q(n, m), steps: [math, sqrt(pow(group(frac(num(n), num(m))), num(2))), frac(num(n), num(m))] };
    }
    case 'negbase': {
      const math = sqrt(pow(group(neg(num(n))), num(2)));
      return { math, value: q(n), steps: [math, sqrt(num(n * n)), sqrt(pow(num(n), num(2))), num(n)] };
    }
  }
}

/**
 * The solve prompt, its solution set and its worked chain.
 * Each line after the first carries a Step.reason; the last one names BOTH
 * solutions, or says there are none (review finding 8: a legal line "x = r"
 * cannot hold two roots, so the roots are stated in the reason).
 * @param {Params & { kind: 'solve' }} d @returns {{ math: Equation; set: SolutionSet; steps: Step[] }}
 */
function solveForm(d) {
  const { a, c, t } = d;
  const x2 = pow(v(X), num(2));
  const ax2 = a === 1n ? x2 : mul(num(a), x2);
  const rhs = q(a * t.n + c * t.d, t.d); // a t + c
  const left = c === 0n ? ax2 : add(ax2, c > 0n ? num(c) : neg(num(-c)));
  const math = eq(left, signed(rhs));
  /** @type {Step[]} */
  const steps = [{ line: math, legal: true }];
  if (c !== 0n) steps.push({ line: eq(ax2, signed(q(a * t.n, t.d))), legal: true, reason: `${c > 0n ? 'Subtract' : 'Add'} ${c > 0n ? c : -c} ${c > 0n ? 'from' : 'to'} both sides.` });
  if (a !== 1n) steps.push({ line: eq(x2, signed(t)), legal: true, reason: `Divide both sides by ${a}.` });
  if (d.root === 'none') {
    const last = steps[steps.length - 1];
    steps[steps.length - 1] = { ...last, reason: `${last.reason ? last.reason + ' ' : ''}No number has a negative square (a number times itself is never negative): no solution.` };
    return { math, set: { kind: 'none' }, steps };
  }
  const r = rootOf(d);
  const rq = r.terms[0].coef;
  /** @type {Node} */
  const base = d.root === 'surd' ? sqrt(num(t.n)) : d.root === 'frac' ? group(qn(rq)) : num(rq.n);
  const rt = print(surdToNode(r));
  const nt = print(surdToNode(sneg(r)));
  const tt = print(signed(t));
  const why = d.root === 'surd'
    ? `sqrt(${t.n}) and -sqrt(${t.n}) both square to ${t.n}`
    : `(${rt})(${rt}) = ${tt} and (${nt})(${nt}) = ${tt} too`;
  // t written as a square: r and -r both square to it
  steps.push({ line: eq(x2, pow(base, num(2))), legal: true, reason: `So x = ${rt} or x = ${nt}: ${why}.` });
  return { math, set: { kind: 'finite', roots: [sneg(r), r] }, steps };
}

/** A rational with its sign as a neg node: -5, -9/4. @param {Q} x @returns {Node} */
function signed(x) { return x.n < 0n ? neg(qn(q(-x.n, x.d))) : qn(x); }

/**
 * The rules that turn one Twin form into the other ("same" explained by them).
 * @param {Problem} p a Twin with choices @returns {string[]}
 */
function sameHits(p) { return malrules.filter((r) => ruleMatches(r, p, TWIN_SAME)).map((r) => r.id); }

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, d, opts, seed) {
  const visuals = ['squareplot', 'numberline'];
  if (d.kind === 'solve') {
    const { math, set, steps } = solveForm(d);
    return makeProblem(GEN, seed, opts, {
      prompt: { verb: 'Solve', math, goal: set.kind === 'none' ? 'Type every solution, or "no solution".' : 'Type every solution.' },
      answer: { kind: 'solution-set', expected: set, formPredicates: ['radical-simplified', 'lowest-terms'], assumptions: [] },
      variableKeys: [X], probes: probeEnvs([X]),
      steps, visuals,
    });
  }
  const { math, value, steps: chain } = evalForm(d);
  const valueNode = signed(value);
  /** @type {Step[]} */
  const steps = chain.map((line) => ({ line, legal: true }));
  const finished = value.d === 1n ? ['integer'] : ['single-number', 'lowest-terms'];
  /** @param {string[]} formPredicates */
  const key = (formPredicates) => ({ kind: /** @type {const} */ ('expr'), expected: valueNode, formPredicates, assumptions: [] });

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Evaluate', math, goal: 'Type the value.' }, answer: key(finished), steps, visuals });
    case 'twin': {
      const tr = r.fork('twin');
      const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Same value?', math }, answer: key(finished) });
      const want = tr.bool();
      /** @type {Node} */ let twin;
      if (want) {
        // A sum is also written as a Same twin, so "a sum is Different" is no tell.
        if (d.form === 'sum' && tr.bool()) {
          const h = /** @type {bigint} */ (d.h);
          const a = bint(tr, 2n, h - 2n);
          if (a === d.n || a === d.m || h - a === d.n || h - a === d.m) return undefined;
          twin = add(num(a), num(h - a));
        } else {
          twin = valueNode;
        }
      } else {
        /** @type {Node[]} */
        const pool = [];
        if (d.form === 'sum') { const o = splitter.apply(base); if (o && 't' in o && o.t !== 'eq') pool.push(o, o); }
        // The Halver's p/2, only when written like the value (a whole number
        // for a whole value), so its look does not give it away.
        const h = halver.apply(base);
        const hv = h && 't' in h && h.t !== 'eq' ? constValue(h) : undefined;
        if (h && 't' in h && h.t !== 'eq' && hv && hv.terms.length === 1 && hv.terms[0].rad === 1n && (hv.terms[0].coef.d === 1n) === (value.d === 1n)) pool.push(h);
        // Near misses written like the value: the value +- 1 ("square it and
        // see"); for a fraction, the root of one part only.
        const off = tr.bool() ? 1n : -1n;
        if (value.d === 1n && value.n + off !== 0n && value.n + off !== 1n) pool.push(signed(q(value.n + off)));
        if (d.form === 'frac') pool.push(tr.bool() ? frac(num(d.n), num(d.m * d.m)) : frac(num(d.n * d.n), num(d.m)));
        // The negative root (untagged: no section 5 rule models it), on about
        // 1 Different pair in 5 at d4 (its look always means Different).
        if (d.form === 'negbase' && tr.bool(0.3)) pool.splice(0, pool.length, neg(num(d.n)));
        if (pool.length === 0) return undefined;
        twin = tr.pick(pool);
      }
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) return undefined;
      const twinValue = constValue(twin);
      if (!twinValue) return undefined;
      const prompt = { verb: 'Same value?', math, twin };
      const draft = makeProblem(GEN, seed, opts, { prompt, choices: twinChoices(prompt, want), answer: key(finished) });
      const hits = want ? [] : sameHits(draft);
      if (hits.length > 1) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, hits[0]),
        answer: want ? key(['single-number'])
          : { kind: 'tuple', expected: [valueNode, surdToNode(twinValue)], formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
    }
    case 'why': {
      const wr = r.fork('why');
      const n = d.form === 'frac' || d.form === 'sum' ? bint(wr, 2n, 12n) : d.n;
      const k = bint(wr, 2n, 9n);
      const e = bint(wr, 2n, 9n);
      if (k === n || e === n || gcd(k, e) !== 1n) return undefined; // two targets would show n; k/e in lowest terms
      const one = frac(sqrt(num(n * n)), num(n));
      const oneFirst = wr.bool();
      const shown = oneFirst ? mul(one, frac(num(k), num(e))) : mul(frac(num(k), num(e)), one);
      const at = oneFirst ? 0 : 1;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: `This is still ${k}/${e}. Tap the 1 hiding in it.` },
        choices: tapTargets(shown, ['e.0', 'e.0.0', 'e.0.1', 'e.1', 'e.1.0', 'e.1.1'], `e.${at}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps: evalForm({ kind: 'eval', form: 'sq', n, m: 0n }).steps.map((line) => ({ line, legal: true })),
        visuals: ['coin', ...visuals],
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['twin', 'strike', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      // Strike: about half solve items (more at d3-4); twin and why: eval only.
      const kind = opts.interaction === 'strike' && r.bool(opts.difficulty >= 3 ? 0.6 : 0.5) ? 'solve' : 'eval';
      const d = draw(r.fork('params'), opts.difficulty, kind);
      if (!d) return undefined;
      const p = item(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: opts.interaction === 'why' ? stackedWidth : rootWidth }) ? p : undefined;
    });
  },
});
