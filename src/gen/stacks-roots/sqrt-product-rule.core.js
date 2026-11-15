// @ts-check
// sqrt-product-rule (skill 23, DESIGN.md section 4), d1 only (the slice
// gate): sqrt(a b) = sqrt(a) x sqrt(b) for a, b >= 0, and no such rule for
// sums. Built on the recipe in ../common.js, following the reference
// src/gen/mint/frac-times-whole.core.js.
//
// Difficulty: d1 only (section 4 "Slice deviations": numeric, perfect-square
// factors only, the two named Twin pairs of section 3 I5 and their
// siblings). Every radicand shown is a perfect square or a product or sum of
// perfect squares, so every value is a whole number. Three kinds, drawn
// evenly:
// Number load: every number shown stays inside the times table (under 400;
// the largest are 15^2 = 225 and 19^2 = 361), so the item is about the rule
// and not about big-number arithmetic.
//   prod  sqrt(a b) with a = p^2, b = q^2, p != q in 2..5 (named: sqrt(4 x 9)).
//   sum   sqrt(a + b) with a = p^2, b = q^2 the legs of a Pythagorean triple
//         with legs up to 12, so the root is whole (named: sqrt(9 + 16)).
//   coef  k sqrt(m), m = t^2 with t prime in {2, 3, 5, 7}, k in 2..9,
//         k t < 20: the
//         product rule read backward (k sqrt(m) = sqrt(k^2) sqrt(m) =
//         sqrt(k^2 m)). t is prime so the Smuggler's "factor enters
//         un-squared" reading applies (its other branch fires first on a
//         radicand with a smaller square factor, such as sqrt(36)).
// My reading of "siblings" includes the coef kind; reported.
//
// Interactions:
//   twin      prod: against sqrt(a) sqrt(b), equivalent (the named pair);
//             or against the Halver's a b/2, different, "same" tagged
//             half-power-is-half (so the pool is near half equivalent).
//             sum: against sqrt(a) + sqrt(b), different, "same" tagged
//             sqrt-splits-sum (the named pair); or against its whole value,
//             equivalent. coef: against sqrt(k^2 m), equivalent; or, when k
//             is itself a perfect square (4 or 9; so every radicand stays a
//             perfect square), against sqrt(k m), different, "same" tagged
//             sqrt-product-misapplied. Follow-up key: the common value, or
//             both values.
//   strike    "Evaluate": the value, a whole number.
//   why       variant 'hidden-1' (counting): (c/e) x sqrt(a b)/(sqrt(a) sqrt(b))
//             in either order: two fractions, tap the one worth 1 (by the
//             product rule). Targets: both fractions, sqrt(a b),
//             sqrt(a) sqrt(b). Only p, q in {2, 3} fit the display, so this
//             form draws a, b from {4, 9}.
// Every item carries the worked chain in `steps`.
//
// Mal-rules separated here: sqrt-splits-sum (15), sqrt-product-misapplied
// (17), half-power-is-half (16), form-change-changes-value (2).
//
// Documented seeds (pinned by test/gen/sqrt-product-rule.test.js):
//   PRODUCT_SEED at d1: the twin sqrt(4 x 9) vs sqrt(4) x sqrt(9) (same);
//     the strike sqrt(4 x 9).
//   SUM_SEED at d1: the twin sqrt(9 + 16) vs sqrt(9) + sqrt(16) (different,
//     Splitter); the strike sqrt(9 + 16).
//
// Display width: as in sqrt-squared.core.js, fitsAll() gets a fixed estimate
// that counts "sqrt(" as one character. The harness re-checks every
// displayed tree with the real mathdom estimate.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll,
  twinChoices, tapTargets, DISPLAY_CAP_PX,
} from '../common.js';
import { num, mul, add, frac, sqrt, isEquation } from '../../math/ast.js';
import { constQ } from '../../math/evaluate.js';
import { gcd } from '../../math/rational.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { qNode } from '../../misc/kit.js';
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
 * @typedef {{ kind: 'prod'; p: bigint; q: bigint }
 *   | { kind: 'sum'; p: bigint; q: bigint; h: bigint }
 *   | { kind: 'coef'; k: bigint; t: bigint }} Params
 */

const GEN = Object.freeze({ id: 'sqrt-product-rule.core', version: 1, skill: 'sqrt-product-rule' });

/** makeRng(PRODUCT_SEED) at d1: sqrt(4 x 9) vs sqrt(4) x sqrt(9) (twin), sqrt(4 x 9) (strike). Pinned by the test. */
export const PRODUCT_SEED = 'named-pair-566';
/** makeRng(SUM_SEED) at d1: sqrt(9 + 16) vs sqrt(9) + sqrt(16) (twin), sqrt(9 + 16) (strike). Pinned by the test. */
export const SUM_SEED = 'named-pair-10';

/** Pythagorean triples with legs p, q (both orders are drawn). */
const TRIPLES = Object.freeze([[3n, 4n, 5n], [6n, 8n, 10n], [5n, 12n, 13n], [9n, 12n, 15n]]);
const PRIMES = Object.freeze([2n, 3n, 5n, 7n]);

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
 * The harness re-checks every item with the real mathdom estimate.
 * @param {Node | Equation} x @returns {number}
 */
function stackedWidth(x) {
  if (isEquation(x) || x.t !== 'mul' || !x.args.every((a) => a.t === 'frac')) return rootWidth(x);
  return x.args.reduce((w, a) => w + (a.t === 'frac' ? Math.max(rootWidth(a.num), rootWidth(a.den)) : 0), 0);
}

/** @param {Rng} r @returns {Params | undefined} */
function draw(r) {
  const kind = r.pick(/** @type {const} */ (['prod', 'sum', 'coef']));
  if (kind === 'prod') {
    const p = BigInt(r.int(2, 5));
    const q = BigInt(r.int(2, 5));
    return p === q ? undefined : { kind, p, q };
  }
  if (kind === 'sum') {
    const [x, y, h] = r.pick(TRIPLES);
    return r.bool() ? { kind, p: x, q: y, h } : { kind, p: y, q: x, h };
  }
  const k = BigInt(r.int(2, 9));
  const t = r.pick(PRIMES);
  return k * t < 20n ? { kind, k, t } : undefined;
}

/** sqrt(N) for a whole number N. @param {bigint} n */
const rt = (n) => sqrt(num(n));

/**
 * The prompt form and its worked chain.
 * @param {Params} d @returns {{ math: Node; value: bigint; steps: Node[] }}
 */
function form(d) {
  if (d.kind === 'prod') {
    const { p, q } = d;
    const math = sqrt(mul(num(p * p), num(q * q)));
    return { math, value: p * q, steps: [math, mul(rt(p * p), rt(q * q)), mul(num(p), num(q)), num(p * q)] };
  }
  if (d.kind === 'sum') {
    const { p, q, h } = d;
    const math = sqrt(add(num(p * p), num(q * q)));
    return { math, value: h, steps: [math, rt(h * h), num(h)] };
  }
  const { k, t } = d;
  const math = mul(num(k), rt(t * t));
  return { math, value: k * t, steps: [math, mul(num(k), num(t)), num(k * t)] };
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
      const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Same value?', math }, answer: key(['integer']) });
      /** @type {Node} */ let twin;
      /** @type {string | undefined} */ let tag;
      if (d.kind === 'prod') {
        if (tr.bool()) {
          twin = mul(rt(d.p * d.p), rt(d.q * d.q));
        } else {
          const out = halver.apply(base); // sqrt(a b) -> a b / 2
          if (!out || !('t' in out) || out.t === 'eq') return undefined;
          twin = out;
          tag = halver.id;
        }
      } else if (d.kind === 'sum') {
        if (tr.bool(2 / 3)) {
          twin = add(rt(d.p * d.p), rt(d.q * d.q));
          tag = splitter.id; // the Splitter's output, each root written as a root
        } else {
          twin = valueNode;
        }
      } else if ((d.k === 4n || d.k === 9n) && tr.bool()) {
        const out = smuggler.apply(base); // k sqrt(m) -> sqrt(k m)
        if (!out || !('t' in out) || out.t !== 'root') return undefined;
        twin = out;
        tag = smuggler.id;
      } else {
        twin = rt(d.k * d.k * d.t * d.t);
      }
      const want = tag === undefined;
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const twinValue = constQ(twin);
      if (!twinValue) return undefined;
      const prompt = { verb: 'Same value?', math, twin };
      return makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, tag),
        answer: want ? key(['integer'])
          : { kind: 'tuple', expected: [valueNode, qNode(twinValue)], formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
    }
    case 'why': {
      // Its own small draw: only a, b in {4, 9} fit the display.
      const wr = r.fork('why');
      const [p, q] = wr.bool() ? [2n, 3n] : [3n, 2n];
      // The multiplier is itself a fraction (not worth 1), written before or
      // after: "tap the only fraction" does not find the 1.
      const c = BigInt(wr.int(2, 9));
      const e = BigInt(wr.int(2, 9));
      if (gcd(c, e) !== 1n) return undefined;
      const one = frac(sqrt(mul(num(p * p), num(q * q))), mul(rt(p * p), rt(q * q)));
      const oneFirst = wr.bool();
      const shown = oneFirst ? mul(one, frac(num(c), num(e))) : mul(frac(num(c), num(e)), one);
      const at = oneFirst ? 0 : 1;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: `This is still ${c}/${e}. Tap the 1 hiding in it.` },
        choices: tapTargets(shown, [`e.${1 - at}`, `e.${at}.0`, `e.${at}.1`, `e.${at}`].sort(), `e.${at}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps: form({ kind: 'prod', p, q }).steps.map((line) => ({ line, legal: true })),
        visuals: ['coin', ...visuals],
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 1],
  interactions: ['twin', 'strike', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const d = draw(r.fork('params'));
      if (!d) return undefined;
      const p = item(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: opts.interaction === 'why' ? stackedWidth : rootWidth }) ? p : undefined;
    });
  },
});
