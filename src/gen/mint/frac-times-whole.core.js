// @ts-check
// frac-times-whole (skill 2, DESIGN.md section 4): n x a/b = (n a)/b, because
// n is n/1. The reference generator: see the recipe in ../common.js.
//
// Difficulty (section 4 gives none per skill; this is my reading, reported):
//   d1  n x 1/b, a unit fraction, n in 2..6, b in 2..9, nothing to reduce.
//       The teacher's example 4 x 1/3 is EXAMPLE_SEED at d1.
//   d2  n x a/b, a proper fraction with a >= 2, n in 2..9, b in 3..12,
//       nothing to reduce.
//   d3  as d2 but n and b share a factor: the product must be reduced, and
//       may be a whole number (6 x 2/3 = 4).
//   d4  the fraction comes first (a/b x n), n in 2..12, the fraction may be
//       improper, reducible or not.
// Never: a product worth 0 or 1; n + a/b = n x a/b (3 x 3/2), the
// "2 + 2 = 2 x 2" coincidence; a fraction not in lowest terms in the prompt.
//
// Interactions:
//   forge     variant 'whole-as-fraction': "Write n as a fraction with the
//             same value": n/1 (correct), n/n (Stacker), 1/n (Sinker). Fade
//             0-1 offers the three; fade 2-3 is typed (any integer fraction
//             worth n is correct: 8/2 for 4).
//   nextline  "Multiply": the product, the Stacker's (n a)/(n b), the
//             Sinker's a/(n b).
//   predict   "Multiply", typed; finished = one number (12/8 is accepted).
//   strike    "Evaluate", typed; finished = one number in lowest terms.
//   twin      the product against ONE fraction, so both verdicts share one
//             written shape. Equivalent (about half): the unreduced (n a)/b,
//             or the reduced value when that is still a fraction.
//             Different: the Stacker's or the Sinker's result ("same" is
//             tagged with that rule). Numeric pair: the follow-up key is the
//             common value (no single form of 1 connects n x a/b and
//             (n a)/b), or both values for a different pair.
//   why       variant 'hidden-1' (counting): why multiplying BOTH parts
//             moves nothing. (n a)/(n b) is (n/n)(a/b): tap the form of 1.
//             Targets: the two fractions (either order), the n on top, b.
// Every item carries the worked chain in `steps`, with the multiply-across
// line (n x a)/(1 x b).

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, malChoices, shuffledChoices,
  twinChoices, tapTargets, V_WHOLE_AS_FRACTION,
} from '../common.js';
import { num, mul, frac } from '../../math/ast.js';
import { q, gcd } from '../../math/rational.js';
import { constQ } from '../../math/evaluate.js';
import { equivExpr } from '../../math/equiv.js';
import { qNode } from '../../misc/kit.js';
import stacker from '../../misc/malrules/scalar-times-both-parts.js';
import sinker from '../../misc/malrules/scalar-into-denominator.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {{ n: bigint; a: bigint; b: bigint; fracFirst: boolean }} Params */

const GEN = Object.freeze({ id: 'frac-times-whole.core', version: 1, skill: 'frac-times-whole' });

/** makeRng(EXAMPLE_SEED) at difficulty 1 gives the teacher's example, 4 x 1/3. Pinned by the test. */
export const EXAMPLE_SEED = 'parent-example-24';

/**
 * @param {Rng} r @param {number} d
 * @returns {Params | undefined} undefined = draw again
 */
function draw(r, d) {
  /** @type {bigint} */ let n;
  /** @type {bigint} */ let a;
  /** @type {bigint} */ let b;
  if (d === 1) {
    n = BigInt(r.int(2, 6)); b = BigInt(r.int(2, 9)); a = 1n;
  } else if (d === 2 || d === 3) {
    n = BigInt(r.int(2, 9)); b = BigInt(r.int(d === 2 ? 3 : 4, 12)); a = BigInt(r.int(d === 2 ? 2 : 1, Number(b) - 1));
  } else {
    n = BigInt(r.int(2, 12)); b = BigInt(r.int(2, 12)); a = BigInt(r.int(1, 2 * Number(b) - 1));
  }
  if (gcd(a, b) !== 1n) return undefined; // the prompt's fraction is in lowest terms (and a is not b)
  const shared = gcd(n, b) !== 1n;
  if (d <= 2 && shared) return undefined;
  if (d === 3 && !shared) return undefined;
  if (n * a === b) return undefined; // product 1
  if (a * (n - 1n) === n * b) return undefined; // n + a/b = n x a/b
  return { n, a, b, fracFirst: d === 4 };
}

/** @param {Params} d @param {Node} whole the whole number as shown: n, or n/1 */
function product(d, whole) {
  const f = frac(num(d.a), num(d.b));
  return d.fracFirst ? mul(f, whole) : mul(whole, f);
}

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, d, opts, seed) {
  const { n, a, b } = d;
  const math = product(d, num(n));
  const withOne = product(d, frac(num(n), num(1)));
  const value = q(n * a, b);
  const valueNode = qNode(value);
  const unreduced = frac(num(n * a), num(b));
  const across = d.fracFirst ? frac(mul(num(a), num(n)), mul(num(b), num(1))) : frac(mul(num(n), num(a)), mul(num(1), num(b)));
  /** @type {Step[]} */
  const steps = [math, withOne, across, unreduced].map((line) => ({ line, legal: true }));
  if (value.d !== b) steps.push({ line: valueNode, legal: true });
  const visuals = ['numberline', 'bars'];
  /** @param {string[]} formPredicates */
  const key = (formPredicates) => ({ kind: /** @type {const} */ ('expr'), expected: valueNode, formPredicates, assumptions: [] });

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Evaluate', math, goal: 'Type the result in lowest terms.' },
        answer: key(['single-number', 'lowest-terms']), steps, visuals,
      });
    case 'predict':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Multiply', math }, answer: key(['single-number']), steps, visuals });
    case 'nextline': {
      const p = makeProblem(GEN, seed, opts, { prompt: { verb: 'Multiply', math }, answer: key(['single-number']), steps, visuals });
      const wrong = malChoices(p, [stacker, sinker]);
      if (!wrong || wrong.length !== 2) return undefined;
      return { ...p, choices: shuffledChoices(r.fork('choices'), [{ display: valueNode, verdict: 'correct' }, ...wrong]) };
    }
    case 'forge': {
      const asFraction = frac(num(n), num(1));
      const p = makeProblem(GEN, seed, opts, {
        variant: V_WHOLE_AS_FRACTION,
        prompt: { verb: 'Forge', math, goal: `Write ${n} as a fraction with the same value.` },
        answer: { kind: 'expr', expected: asFraction, formPredicates: ['integer-fraction'], assumptions: [] },
        steps, visuals,
      });
      if (p.constructed) return p; // fade 2-3: typed
      const wrong = malChoices(p, [stacker, sinker]);
      if (!wrong || wrong.length !== 2) return undefined;
      return { ...p, choices: shuffledChoices(r.fork('choices'), [{ display: asFraction, verdict: 'correct' }, ...wrong]) };
    }
    case 'twin': {
      const tr = r.fork('twin');
      const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Same value?', math }, answer: key(['single-number']) });
      const want = tr.bool();
      /** @type {Node} */ let twin;
      /** @type {string | undefined} */ let tag;
      if (want) {
        // always one fraction, like the mal-rule twins: the written shape
        // must not give the answer away (a whole number is never a twin)
        twin = tr.pick(value.d === b || value.d === 1n ? [unreduced, unreduced] : [valueNode, unreduced]);
      } else {
        const rule = tr.pick([stacker, sinker]);
        const out = rule.apply(base);
        if (!out || !('t' in out) || out.t === 'eq') return undefined;
        twin = out;
        tag = rule.id;
      }
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const twinValue = constQ(twin);
      if (!twinValue) return undefined;
      const prompt = { verb: 'Same value?', math, twin };
      return makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, tag),
        answer: want ? key(['single-number'])
          : { kind: 'tuple', expected: [valueNode, qNode(twinValue)], formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
    }
    case 'why': {
      // The Stacker's (n a)/(n b), taken apart: it is a/b times a form of 1.
      const coin = frac(num(n), num(n));
      const f = frac(num(a), num(b));
      const coinFirst = r.fork('why').bool();
      const shown = coinFirst ? mul(coin, f) : mul(f, coin);
      const c = coinFirst ? 0 : 1;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: `${n * a}/${n * b} is this product. Tap the form of 1 in it.` },
        choices: tapTargets(shown, ['e.0', 'e.1', `e.${c}.0`, `e.${1 - c}.1`].sort(), `e.${c}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps: [frac(num(n * a), num(n * b)), shown, f].map((line) => ({ line, legal: true })),
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
  interactions: ['forge', 'nextline', 'predict', 'strike', 'twin', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const d = draw(r.fork('params'), opts.difficulty);
      if (!d) return undefined;
      const p = item(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
