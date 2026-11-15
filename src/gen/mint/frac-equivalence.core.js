// @ts-check
// frac-equivalence (skill 1, DESIGN.md section 4): a/b = (k a)/(k b), because
// k/k = 1. Built on the recipe in ../common.js, after frac-times-whole.core.js.
//
// Documented seeds (pinned by test/gen/frac-equivalence.test.js):
//   EXAMPLE_SEED at d1: the section 7 coin example, 3/4 = 15/20 (k = 5).
//
// Difficulty (section 4 gives none per skill; my reading, reported):
//   d1  a/b proper, b in 2..7, k in 2..5.
//   d2  a/b proper, b in 2..10, k in 2..9.
//   d3  a/b may be improper (a < 2b), b in 2..12, k in 2..12; Strike may
//       ask to reduce (k a)/(k b) to lowest terms instead.
//   d4  as d3 with b and k in 3..12 (larger denominators).
// Always: a/b in lowest terms, a != b (the value is never 0 or 1).
//
// Interactions:
//   forge     "Make the denominator k b" on a/b: the coin k/k. Fade 0-1
//             offers k/k, a second genuine coin m/m that misses the goal
//             ("Legal. Not closer."; they must choose WHICH 1), and the
//             Half-Coin's k/1 and 1/k (both tagged one-part-coin).
//             Fade 2-3 is typed (any coin worth 1 that reaches the denominator).
//   predict   "Multiply" (a/b)(k/k): typed, finished = denominator k b. The
//             Half-Coin's (k a)/b and a/(k b) are separable here.
//   strike    "Rewrite a/b with denominator k b" (d1-4), or at d3-4 half the
//             time "Reduce (k a)/(k b) to lowest terms".
//   twin      a/b against a second fraction, so both verdicts share one
//             written shape. Equivalent (about half): (k a)/(k b); the
//             follow-up key is the form of 1 that connects them, k/k
//             (section 3 I5). Different: the Half-Coin's (k a)/b or a/(k b)
//             ("same" is tagged one-part-coin); the follow-up key is both
//             values.
//   why       variant 'hidden-1' (counting): in (a/b)(k/k), tap the 1.
//             Targets: a/b, k/k, the k on top, the b of a/b (none worth 1
//             but the coin).
// Every item carries the worked chain a/b -> (a/b)(k/k) -> (k a)/(k b).

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, shuffledChoices,
  twinChoices, tapTargets, TWIN_SAME,
} from '../common.js';
import { num, mul, frac } from '../../math/ast.js';
import { q, gcd } from '../../math/rational.js';
import { constQ } from '../../math/evaluate.js';
import { equivExpr } from '../../math/equiv.js';
import { diagnose } from '../../misc/diagnose.js';
import { qNode } from '../../misc/kit.js';
import halfCoin from '../../misc/malrules/one-part-coin.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').Choice} Choice */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {{ a: bigint; b: bigint; k: bigint }} Params */

const GEN = Object.freeze({ id: 'frac-equivalence.core', version: 1, skill: 'frac-equivalence' });

/** makeRng(EXAMPLE_SEED) at difficulty 1 gives 3/4 with k = 5 (3/4 = 15/20). Pinned by the test. */
export const EXAMPLE_SEED = 's66';

/** @param {Rng} r @param {number} d @returns {Params | undefined} */
function draw(r, d) {
  /** @type {number} */ let b;
  /** @type {number} */ let a;
  /** @type {number} */ let k;
  if (d === 1) { b = r.int(2, 7); a = r.int(1, b - 1); k = r.int(2, 5); }
  else if (d === 2) { b = r.int(2, 10); a = r.int(1, b - 1); k = r.int(2, 9); }
  else { const lo = d === 4 ? 3 : 2; b = r.int(lo, 12); a = r.int(1, 2 * b - 1); k = r.int(lo, 12); }
  if (a === b || gcd(BigInt(a), BigInt(b)) !== 1n) return undefined;
  return { a: BigInt(a), b: BigInt(b), k: BigInt(k) };
}

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, d, opts, seed) {
  const { a, b, k } = d;
  const f = frac(num(a), num(b));
  const coin = frac(num(k), num(k));
  const withCoin = mul(f, coin);
  const scaled = frac(num(k * a), num(k * b));
  const value = qNode(q(a, b));
  /** @type {Step[]} */
  const steps = [f, withCoin, scaled].map((line) => ({ line, legal: true }));
  const visuals = ['numberline', 'bars', 'coin'];
  const toDen = `denominator:${k * b}`;

  switch (opts.interaction) {
    case 'forge': {
      const p = makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Forge', math: f, goal: `Make the denominator ${k * b}.` },
        answer: { kind: 'form-of-1', expected: coin, formPredicates: [toDen], assumptions: [] },
        steps, visuals: ['coin', 'numberline', 'bars'],
      });
      if (p.constructed) return p;
      const wrong = halfCoin.applyAll(p);
      if (wrong.length !== 2) return undefined;
      // a second coin, worth 1 but not the one that reaches the goal
      const m = r.fork('idle').pick([2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n].filter((x) => x !== k));
      /** @type {Omit<Choice, 'id'>[]} */
      const items = [{ display: coin, verdict: 'correct' }, { display: frac(num(m), num(m)), verdict: 'legal-idle' }];
      for (const w of wrong) items.push({ display: /** @type {Node} */ (w), verdict: 'wrong', malrule: halfCoin.id });
      return { ...p, choices: shuffledChoices(r.fork('choices'), items) };
    }
    case 'predict':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Multiply', math: withCoin },
        answer: { kind: 'expr', expected: scaled, formPredicates: [toDen], assumptions: [] },
        steps, visuals,
      });
    case 'strike': {
      if (opts.difficulty >= 3 && r.fork('variant').bool()) {
        return makeProblem(GEN, seed, opts, {
          prompt: { verb: 'Simplify', math: scaled, goal: 'Reduce to lowest terms.' },
          answer: { kind: 'expr', expected: value, formPredicates: ['single-number', 'lowest-terms'], assumptions: [] },
          steps: steps.slice().reverse(), visuals,
        });
      }
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Rewrite', math: f, goal: `Write it with denominator ${k * b}.` },
        answer: { kind: 'expr', expected: scaled, formPredicates: [toDen], assumptions: [] },
        steps, visuals,
      });
    }
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      tr.bool(); // (stream kept from version 1)
      const math = f;
      // Different: as the Half-Coin writes it, (k a)/b or a/(k b); the same
      // "fraction vs fraction" shape as the equivalent partner (k a)/(k b).
      const twin = want ? scaled : tr.pick([frac(num(k * a), num(b)), frac(num(a), num(k * b))]);
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const twinValue = constQ(twin);
      if (!twinValue || (twinValue.n === twinValue.d)) return undefined; // 3/3 is plainly 1: too easy to tell apart
      const prompt = { verb: 'Same value?', math, twin };
      const p = makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, want ? undefined : halfCoin.id),
        // Same: the follow-up asks for the form of 1 that connects the forms.
        answer: want ? { kind: 'form-of-1', expected: coin, formPredicates: [toDen], assumptions: [] }
          : { kind: 'tuple', expected: [value, qNode(twinValue)], formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
      if (!want) {
        const dg = diagnose(p, TWIN_SAME);
        if (dg.misconceptions.length !== 1 || dg.misconceptions[0] !== halfCoin.id) throw new Error(`${GEN.id}: the Half-Coin twin is not a one-part-coin output (seed ${JSON.stringify(seed)})`);
      }
      return p;
    }
    case 'why':
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: withCoin, goal: 'Tap the form of 1 that changed the look, not the value.' },
        choices: tapTargets(withCoin, ['e.0', 'e.0.1', 'e.1', 'e.1.0'], 'e.1'),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps, visuals,
      });
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['forge', 'predict', 'strike', 'twin', 'why'],
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
