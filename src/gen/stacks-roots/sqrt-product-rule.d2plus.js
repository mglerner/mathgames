// @ts-check
// sqrt-product-rule (skill 23, DESIGN.md section 4), difficulties 2-4 (d1, the
// slice gate, is sqrt-product-rule.core.js): sqrt(a) sqrt(b) = sqrt(a b) for
// a, b >= 0, and NO such rule for sums. Built on the recipe in ../common.js,
// following src/gen/stacks-roots/sqrt-product-rule.core.js.
//
// Past d1 the factors are no longer perfect squares, so the rule is the only
// way in: sqrt(2) sqrt(8) has no whole-number factor to evaluate first.
// Every answer is still a whole number (the 'integer' predicate then tells
// "finished" apart from the prompt retyped; there is no predicate for "one
// radical, not a product of radicals", so a product whose value is a surd,
// sqrt(2) sqrt(3) = sqrt(6), is not served: reported).
// Kinds:
//   pair  sqrt(a) sqrt(b), a != b, neither a perfect square, a b = c^2,
//         c in 4..12 (so a b <= 144): sqrt(2) sqrt(8) = 4.
//   sum   sqrt(a + b) with a + b = h^2 (h in 3..10) and a not a perfect
//         square: the root of a sum is NOT sqrt(a) + sqrt(b).
//   coef  (p sqrt(a))(q sqrt(b)), p, q in 2..5, a b = c^2 (a = b allowed),
//         p q c <= 120: (2 sqrt(3))(5 sqrt(12)) = 60.
//   dist  sqrt(a)(sqrt(b) +- sqrt(e)), a b and a e perfect squares, a not:
//         sqrt(2)(sqrt(8) + sqrt(18)) = 4 + 6 = 10 (the rule applied to each
//         term of a sum, never to the sum's root).
// Difficulty (my reading, reported): d2 pair (2 in 3) or sum; d3 coef (2 in
// 3) or sum; d4 dist (2 in 3) or coef.
//
// Interactions:
//   twin      the full Twin pools for mal-rules 15-17 at these difficulties.
//             Same (about half): the value, or a form one rule-step away
//             (sqrt(16) for sqrt(2) sqrt(8); sqrt(16) + sqrt(36) for the dist
//             kind; for a sum, a sum of two whole roots that IS the value,
//             sqrt(4) + sqrt(16) for sqrt(16 + 20), so a sum of roots is not
//             always Different). Different: the Splitter's sqrt(a) + sqrt(b)
//             (tagged sqrt-splits-sum), the VALUE of the Smuggler's or the
//             Halver's result written as a number (tagged by the rule
//             matcher: it compares values), and near misses written like the
//             Same forms: sqrt(a + b) written as one number under the root
//             for sqrt(a) sqrt(b), the value +- 1, (p + q) c, p q a b and
//             (p + q) sqrt(a b) for the coef kind, sqrt(a b) + sqrt(e) for the
//             dist kind (untagged unless a rule explains them: the last is
//             the Half-Hand's, partial-distribution). Every "same" tag is recomputed by diagnose's
//             rule matcher; a pair two rules explain is rejected. Follow-up
//             key: the common value, or both values.
//   strike    "Evaluate": the value, a whole number.
//   why       variant 'hidden-1' (counting): two fractions, one worth 1 by
//             the product rule (sqrt(a) sqrt(b) over sqrt(a b), either way
//             up, or over sqrt(x + y) with x + y = a b, so a "+" does not
//             mark the decoy) and a decoy that is not: (sqrt(a) + sqrt(b))/
//             sqrt(a + b) (the Splitter's claim), sqrt(a) sqrt(b)/(a b) (the
//             root forgotten) or sqrt(a) sqrt(b)/sqrt((c +- 1)^2) (written
//             like the 1). Either order; targets both fractions and the top
//             and bottom of each.
// Every item carries the worked chain in `steps`, with the line
// sqrt(a) sqrt(b) = sqrt(a b).
//
// Mal-rules separated here: sqrt-splits-sum (15), sqrt-product-misapplied
// (17), half-power-is-half (16), form-change-changes-value (2).
//
// Documented seeds (pinned by test/gen/sqrt-product-rule.d2plus.test.js):
//   PAIR_SEED at d2: the strike sqrt(2) sqrt(18) (key 6). (sqrt(2) sqrt(8) is
//     never served: the Halver's (2/2)(8/2) = 4 is the answer.)
//   SUM_SEED at d2: the twin sqrt(11 + 5) vs sqrt(11) + sqrt(5) (Different,
//     the Splitter).
//
// Display width: as in sqrt-squared.core.js, fitsAll() gets a fixed estimate
// that counts "sqrt(" as one character. The harness re-checks every
// displayed tree with the real mathdom estimate.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll,
  twinChoices, tapTargets, DISPLAY_CAP_PX, TWIN_SAME,
} from '../common.js';
import { num, mul, add, sub, frac, sqrt, group, isEquation } from '../../math/ast.js';
import { constValue } from '../../math/evaluate.js';
import { surdToNode, toQ } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { malrules, ruleMatches } from '../../misc/diagnose.js';
import splitter from '../../misc/malrules/sqrt-splits-sum.js';
import smuggler from '../../misc/malrules/sqrt-product-misapplied.js';
import halver from '../../misc/malrules/half-power-is-half.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/**
 * @typedef {{ kind: 'pair'; a: bigint; b: bigint; c: bigint }
 *   | { kind: 'sum'; a: bigint; b: bigint; h: bigint }
 *   | { kind: 'coef'; p: bigint; q: bigint; a: bigint; b: bigint; c: bigint }
 *   | { kind: 'dist'; a: bigint; b: bigint; e: bigint; u: bigint; w: bigint; minus: boolean }} Params
 */

const GEN = Object.freeze({ id: 'sqrt-product-rule.d2plus', version: 1, skill: 'sqrt-product-rule' });

/** makeRng(PAIR_SEED) at d2, strike: sqrt(2) sqrt(18). Pinned by the test. */
export const PAIR_SEED = 'pair-67';
/** makeRng(SUM_SEED) at d2, twin: sqrt(11 + 5) vs sqrt(11) + sqrt(5). Pinned by the test. */
export const SUM_SEED = 'sum-2781';

/** @param {bigint} n */
function isqrtB(n) { let s = 0n; while ((s + 1n) * (s + 1n) <= n) s++; return s; }
/** @param {bigint} n */
const isSquare = (n) => isqrtB(n) ** 2n === n;

/** [a, b, c]: a != b, neither a square, a b = c^2, c in 4..12, a, b <= 72. */
const PAIRS = Object.freeze((() => {
  /** @type {[bigint, bigint, bigint][]} */
  const out = [];
  for (let c = 4n; c <= 12n; c++) for (let a = 2n; a <= 72n; a++) {
    if ((c * c) % a !== 0n) continue;
    const b = (c * c) / a;
    if (a !== b && b <= 72n && !isSquare(a) && !isSquare(b)) out.push([a, b, c]);
  }
  return out;
})());
/** [a, b, c] for the coef kind: as PAIRS, and also a = b (2 sqrt(3) x 5 sqrt(3)). */
const COEF_PAIRS = Object.freeze([...PAIRS.filter(([a, b]) => a <= 27n && b <= 27n), ...[2n, 3n, 5n, 6n, 7n].map((a) => /** @type {[bigint, bigint, bigint]} */ ([a, a, a]))]);
/** For the dist kind: a and the radicands b with a b a perfect square. */
const DIST = Object.freeze([[2n, [8n, 18n, 32n, 50n]], [3n, [12n, 27n, 48n, 75n]], [5n, [20n, 45n, 80n]], [6n, [24n, 54n]], [7n, [28n, 63n]]]);

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

/** @param {Rng} r @returns {Params} */
function drawPair(r) {
  const [x, y, c] = r.pick(PAIRS);
  return r.bool() ? { kind: 'pair', a: x, b: y, c } : { kind: 'pair', a: y, b: x, c };
}

/** @param {Rng} r @param {number} d @returns {Params | undefined} */
function draw(r, d) {
  const main = r.bool(2 / 3);
  if (d === 2 && main) return drawPair(r);
  if ((d === 2 || d === 3) && !main) {
    const h = bint(r, 3n, 10n);
    const a = bint(r, 2n, h * h - 2n);
    const b = h * h - a;
    return isSquare(a) || b < 2n ? undefined : { kind: 'sum', a, b, h };
  }
  if (d === 3 || (d === 4 && !main)) {
    const [x, y, c] = r.pick(COEF_PAIRS);
    const p = bint(r, 2n, 5n);
    const q = bint(r, 2n, 5n);
    if (p * q * c > 120n) return undefined;
    return r.bool() ? { kind: 'coef', p, q, a: x, b: y, c } : { kind: 'coef', p, q, a: y, b: x, c };
  }
  const [a, bs] = /** @type {[bigint, bigint[]]} */ (r.pick(DIST));
  const b = r.pick(bs);
  const e = r.pick(bs);
  if (b === e) return undefined;
  const minus = r.bool(1 / 3);
  const u = isqrtB(a * b);
  const w = isqrtB(a * e);
  if (minus && u - w < 2n) return undefined; // positive, and not 0 or 1
  return u + w <= 25n ? { kind: 'dist', a, b, e, u, w, minus } : undefined;
}

/** @param {bigint} n */
const rt = (n) => sqrt(num(n));

/**
 * The prompt, its whole-number value and the worked chain.
 * @param {Params} d @returns {{ math: Node; value: bigint; steps: Node[] }}
 */
function form(d) {
  switch (d.kind) {
    case 'pair': {
      const { a, b, c } = d;
      const math = mul(rt(a), rt(b));
      return { math, value: c, steps: [math, sqrt(mul(num(a), num(b))), rt(c * c), num(c)] };
    }
    case 'sum': {
      const { a, b, h } = d;
      const math = sqrt(add(num(a), num(b)));
      return { math, value: h, steps: [math, rt(h * h), num(h)] };
    }
    case 'coef': {
      const { p, q, a, b, c } = d;
      const math = mul(group(mul(num(p), rt(a))), group(mul(num(q), rt(b))));
      return { math, value: p * q * c, steps: [math, mul(num(p * q), rt(a), rt(b)), mul(num(p * q), rt(a * b)), num(p * q * c)] };
    }
    case 'dist': {
      const { a, b, e, u, w, minus } = d;
      const join = (/** @type {Node} */ x, /** @type {Node} */ y) => (minus ? sub(x, y) : add(x, y));
      const math = mul(rt(a), group(join(rt(b), rt(e))));
      const value = minus ? u - w : u + w;
      return { math, value, steps: [math, join(mul(rt(a), rt(b)), mul(rt(a), rt(e))), join(rt(a * b), rt(a * e)), join(num(u), num(w)), num(value)] };
    }
  }
}

/**
 * The largest whole number written in x: a Twin partner above 300 is not
 * served (numbers must serve the idea, not swamp it).
 * @param {Node} x @returns {number}
 */
function maxNum(x) { return Math.max(0, ...(print(x).match(/\d+/g) ?? []).map(Number)); }

/** The rules that turn one Twin form into the other. @param {Problem} p @returns {string[]} */
function sameHits(p) { return malrules.filter((r) => ruleMatches(r, p, TWIN_SAME)).map((r) => r.id); }

/**
 * A rule's result on the prompt, as the number it is worth (undefined when the
 * rule does not apply, or the result is not a whole or simple number).
 * @param {import('../../misc/kit.js').MalRuleX} rule @param {Problem} base @returns {Node | undefined}
 */
function ruleValue(rule, base) {
  const o = rule.apply(base);
  if (!o || !('t' in o) || o.t === 'eq') return undefined;
  const v = constValue(o);
  return v && toQ(v) ? surdToNode(v) : undefined;
}

/**
 * Twin partners: [equivalent forms, different forms].
 * @param {Rng} r @param {Params} d @param {bigint} value @param {Problem} base
 * @returns {{ same: Node[]; diff: Node[] }}
 */
function partners(r, d, value, base) {
  /** @type {Node[]} */ const same = [num(value)];
  /** @type {Node[]} */ const diff = [];
  const near = r.bool() ? value + 1n : value - 1n;
  if (near >= 2n) diff.push(num(near));
  for (const rule of [smuggler, halver]) { const v = ruleValue(rule, base); if (v) diff.push(v); }
  switch (d.kind) {
    case 'pair':
      same.push(rt(d.a * d.b));
      diff.push(rt(d.a + d.b)); // the radicands added, not multiplied (written like sqrt(a b))
      break;
    case 'sum': {
      const o = splitter.apply(base);
      if (o && 't' in o && o.t !== 'eq') diff.push(o, o);
      // a sum of two whole roots that is the value: sqrt(x^2) + sqrt(y^2), x + y = h
      const x = bint(r, 1n, d.h - 1n);
      const y = d.h - x;
      // (sometimes with the second root already taken, as the Splitter writes it)
      if (x * x !== d.a && x * x !== d.b && y * y !== d.a && y * y !== d.b) same.push(add(rt(x * x), r.bool() ? rt(y * y) : num(y)));
      break;
    }
    case 'coef':
      same.push(mul(num(d.p * d.q), rt(d.a * d.b)));
      diff.push(num((d.p + d.q) * d.c)); // the coefficients added
      if (d.p * d.q * d.a * d.b <= 200n) diff.push(num(d.p * d.q * d.a * d.b)); // the radicands multiplied, the root forgotten
      diff.push(mul(num(d.p + d.q), rt(d.a * d.b))); // the coefficients added (written like the Same form)
      break;
    case 'dist': {
      const join = (/** @type {Node} */ x, /** @type {Node} */ y) => (d.minus ? sub(x, y) : add(x, y));
      same.push(join(rt(d.a * d.b), rt(d.a * d.e)));
      diff.push(join(rt(d.a * d.b), rt(d.e))); // the outside root reached the first term only
      break;
    }
  }
  return { same, diff };
}

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, d, opts, seed) {
  const { math, value, steps: chain } = form(d);
  const valueNode = num(value);
  /** @type {Step[]} */
  const steps = chain.map((line) => ({ line, legal: true }));
  const visuals = ['squareplot', 'numberline'];
  /** @param {string[]} formPredicates */
  const key = (formPredicates) => ({ kind: /** @type {const} */ ('expr'), expected: valueNode, formPredicates, assumptions: [] });

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Evaluate', math, goal: 'Type the value.' }, answer: key(['integer']), steps, visuals });
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Same value?', math }, answer: key(['integer']) });
      const { same, diff } = partners(tr.fork('partners'), d, value, base);
      const pool = (want ? same : diff).filter((x) => maxNum(x) <= 300);
      if (pool.length === 0) return undefined;
      const twin = tr.pick(pool);
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) return undefined;
      const twinValue = constValue(twin);
      if (!twinValue) return undefined;
      const prompt = { verb: 'Same value?', math, twin };
      const draft = makeProblem(GEN, seed, opts, { prompt, choices: twinChoices(prompt, want), answer: key(['integer']) });
      const hits = want ? [] : sameHits(draft);
      if (hits.length > 1) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, hits[0]),
        answer: want ? key(['integer'])
          : { kind: 'tuple', expected: [valueNode, surdToNode(twinValue)], formPredicates: ['radical-simplified'], assumptions: [] },
        steps, visuals,
      });
    }
    case 'why': {
      const wr = r.fork('why');
      const pr = /** @type {Extract<Params, { kind: 'pair' }>} */ (drawPair(wr.fork('pair')));
      const prod = () => mul(rt(pr.a), rt(pr.b));
      // The 1: sqrt(a) sqrt(b) over sqrt(a b), either way up, or with sqrt(a b)
      // written as the root of a sum (sqrt(10 + 6) for sqrt(16)), so "the one
      // with a +" is not always the decoy.
      const ab = pr.a * pr.b;
      const x = BigInt(wr.int(2, Number(ab) - 2));
      const shapes = [frac(prod(), rt(ab)), frac(rt(ab), prod())];
      if (x !== pr.a && x !== pr.b && ab - x !== pr.a && ab - x !== pr.b) shapes.push(frac(sqrt(add(num(x), num(ab - x))), prod()));
      const one = wr.pick(shapes);
      // The decoy: the Splitter's claim, the root forgotten, or the root of
      // another square (written like the 1).
      const off = pr.c + (wr.bool() ? 1n : -1n);
      const decoy = wr.pick([
        frac(add(rt(pr.a), rt(pr.b)), sqrt(add(num(pr.a), num(pr.b)))),
        frac(prod(), num(ab)),
        frac(prod(), rt(off * off)),
      ]);
      const oneFirst = wr.bool();
      const shown = oneFirst ? mul(one, decoy) : mul(decoy, one);
      const at = oneFirst ? 0 : 1;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: 'One of these fractions is worth exactly 1. Tap it.' },
        choices: tapTargets(shown, ['e.0', 'e.0.0', 'e.0.1', 'e.1', 'e.1.0', 'e.1.1'], `e.${at}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps: form(pr).steps.map((line) => ({ line, legal: true })),
        visuals: ['coin', ...visuals],
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [2, 4],
  interactions: ['twin', 'strike', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const d = draw(r.fork('params'), opts.difficulty);
      if (!d) return undefined;
      const p = item(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: opts.interaction === 'why' ? stackedWidth : rootWidth }) ? p : undefined;
    });
  },
});
