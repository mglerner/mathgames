// @ts-check
// rationalize-denominator (skill 25, DESIGN.md section 4), d1 only (the slice
// gate): k/sqrt(n) with n squarefree, made root-free in the denominator by
// the form of 1 sqrt(n)/sqrt(n), using sqrt(n) x sqrt(n) = n (skill 21).
// Built on the recipe in ../common.js, following the reference
// src/gen/mint/frac-times-whole.core.js.
//
// Difficulty: d1 only (section 4 "Slice deviations": k/sqrt(n), n
// squarefree). k in 1..12, n in {2, 3, 5, 6, 7, 10, 11}. The answer is
// (k/n) sqrt(n) in lowest terms (6/sqrt(3) = 2sqrt(3); 1/sqrt(2) = sqrt(2)/2).
// Seeds where two mal-rules agree are rejected; in particular n = 2 on every
// item the Halver reads (it turns sqrt(2) into 2/2 = 1, the Half-Coin's k).
//
// Interactions:
//   forge     form of 1 (section 3 I4): goal "no root in the denominator".
//             Offered faces (fade 0-1): sqrt(n)/sqrt(n) (correct), and the
//             Half-Coin's sqrt(n)/1 and 1/sqrt(n) (tagged one-part-coin).
//             Also a form of 1 that is legal but not closer, so they must
//             choose WHICH 1: section 3's n/n ("3/3"), or sqrt(m)/sqrt(m)
//             with another radicand m (the key's shape and length). Typed (fade 2-3): any form of 1 that
//             clears the root is correct; n/n is judged "Legal. Not closer."
//   predict   "Multiply" (k/sqrt(n))(sqrt(n)/sqrt(n)): the product with no
//             root in the denominator (6sqrt(3)/3 is accepted).
//   strike    "Rationalize" k/sqrt(n): no root in the denominator, lowest
//             terms, radicals simplified.
//   twin      k/sqrt(n) against another form. Equivalent (about half): the
//             rationalized form, or (when it reduces) k sqrt(n)/n unreduced.
//             Different: the Half-Coin's k or k/n, or the Overshoot's
//             k sqrt(n)/n^2 ("same" is tagged with that rule). Follow-up key:
//             for an equivalent pair the form of 1 that connects the forms,
//             sqrt(n)/sqrt(n) (section 3 I5); for a different pair both values.
//   why       variant 'hidden-1' (counting): in (k/sqrt(n))(sqrt(n)/sqrt(n)),
//             tap the 1. Targets: k/sqrt(n), its sqrt(n), and the coin
//             (correct).
// Every item carries the worked chain in `steps`.
//
// Mal-rules separated here: one-part-coin (4), root-square-overshoot (18),
// half-power-is-half (16), form-change-changes-value (2).
//
// Documented seed (pinned by test/gen/rationalize-denominator.test.js):
//   EXAMPLE_SEED at d1 gives 6/sqrt(3) (section 12: a teacher example) in
//   every interaction (predict and why show (6/sqrt(3))(sqrt(3)/sqrt(3))).
//
// Display width: as in sqrt-squared.core.js, fitsAll() gets a fixed estimate
// that counts "sqrt(" as one character (common.js conservativeWidth would
// reject (6/sqrt(3))(sqrt(3)/sqrt(3)), which mathdom draws about 137px wide).
// The harness re-checks every displayed tree with the real mathdom estimate.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, shuffledChoices,
  twinChoices, tapTargets, DISPLAY_CAP_PX,
} from '../common.js';
import { num, mul, frac, sqrt, isEquation } from '../../math/ast.js';
import { q, gcd } from '../../math/rational.js';
import { constValue } from '../../math/evaluate.js';
import { surdToNode } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { outputsOf } from '../../misc/diagnose.js';
import halfCoin from '../../misc/malrules/one-part-coin.js';
import overshoot from '../../misc/malrules/root-square-overshoot.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {{ k: bigint; n: bigint }} Params */

const GEN = Object.freeze({ id: 'rationalize-denominator.core', version: 1, skill: 'rationalize-denominator' });

/** makeRng(EXAMPLE_SEED) at d1 gives 6/sqrt(3) in every interaction. Pinned by the test. */
export const EXAMPLE_SEED = 'parent-example-148';

const SQUAREFREE = Object.freeze([2n, 3n, 5n, 6n, 7n, 10n, 11n]);
const NO_ROOT_BELOW = 'no-radical-in-denominator';

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

/** @param {Rng} r @returns {Params} */
function draw(r) {
  return { k: BigInt(r.int(1, 12)), n: r.pick(SQUAREFREE) };
}

/** c sqrt(n), or sqrt(n) when c is 1. @param {bigint} c @param {bigint} n @returns {Node} */
function timesRoot(c, n) { return c === 1n ? sqrt(num(n)) : mul(num(c), sqrt(num(n))); }

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, d, opts, seed) {
  const { k, n } = d;
  const root = () => sqrt(num(n));
  const math = frac(num(k), root());
  const coin = frac(root(), root());
  const withCoin = mul(math, coin);
  const c = q(k, n); // the answer is c sqrt(n)
  const answer = surdToNode({ terms: [{ coef: c, rad: n }] }); // 2sqrt(3), sqrt(2)/2, 3sqrt(2)/2
  const unreduced = frac(timesRoot(k, n), num(n));
  /** @type {Step[]} */
  const steps = [math, withCoin, frac(timesRoot(k, n), mul(root(), root())), unreduced].map((line) => ({ line, legal: true }));
  if (gcd(k, n) !== 1n) steps.push({ line: answer, legal: true });
  const visuals = ['coin', 'numberline'];
  /** @param {string[]} formPredicates */
  const key = (formPredicates) => ({ kind: /** @type {const} */ ('expr'), expected: answer, formPredicates, assumptions: [] });

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Rationalize', math, goal: 'No root in the denominator. Simplify.' },
        answer: key([NO_ROOT_BELOW, 'lowest-terms', 'radical-simplified']), steps, visuals,
      });
    case 'predict':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Multiply', math: withCoin }, answer: key([NO_ROOT_BELOW]), steps, visuals });
    case 'forge': {
      const p = makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Forge', math, goal: 'No root in the denominator. Pick a form of 1.' },
        answer: { kind: 'form-of-1', expected: coin, formPredicates: [NO_ROOT_BELOW], assumptions: [] },
        steps, visuals,
      });
      if (p.constructed) return p; // fade 2-3: typed
      const halves = outputsOf(halfCoin, p);
      if (halves.length !== 2) return undefined;
      const ir = r.fork('idle');
      const m = BigInt(ir.pick([2, 3, 5, 6, 7].filter((x) => BigInt(x) !== n)));
      const idle = ir.bool() ? frac(num(n), num(n)) : frac(sqrt(num(m)), sqrt(num(m)));
      return {
        ...p,
        choices: shuffledChoices(r.fork('choices'), [
          { display: coin, verdict: 'correct' },
          // worth 1, but the root stays below: n/n, or the right shape with another radicand
          { display: idle, verdict: 'legal-idle' },
          ...halves.map((h) => ({ display: /** @type {Node} */ (h), verdict: /** @type {const} */ ('wrong'), malrule: halfCoin.id })),
        ]),
      };
    }
    case 'twin': {
      const tr = r.fork('twin');
      const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Same value?', math }, answer: key([NO_ROOT_BELOW]) });
      const want = tr.bool();
      /** @type {Node} */ let twin;
      /** @type {string | undefined} */ let tag;
      if (want) {
        twin = tr.pick(gcd(k, n) !== 1n ? [answer, unreduced] : [answer]);
      } else {
        const wrong = [...outputsOf(halfCoin, base).map((o) => ({ o, id: halfCoin.id })), ...outputsOf(overshoot, base).map((o) => ({ o, id: overshoot.id }))];
        if (wrong.length === 0) return undefined;
        const pick = tr.pick(wrong);
        if (!('t' in pick.o) || pick.o.t === 'eq') return undefined;
        twin = pick.o;
        tag = pick.id;
      }
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const twinValue = constValue(twin);
      if (!twinValue) return undefined;
      const prompt = { verb: 'Same value?', math, twin };
      return makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, tag),
        answer: want ? { kind: 'form-of-1', expected: coin, formPredicates: [NO_ROOT_BELOW], assumptions: [] }
          : { kind: 'tuple', expected: [answer, surdToNode(twinValue)], formPredicates: [NO_ROOT_BELOW], assumptions: [] },
        steps, visuals,
      });
    }
    case 'why':
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: withCoin, goal: 'Tap the 1 that changes the form, not the value.' },
        choices: tapTargets(withCoin, ['e.0', 'e.0.1', 'e.1'], 'e.1'),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps, visuals,
      });
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 1],
  interactions: ['forge', 'predict', 'strike', 'twin', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const d = draw(r.fork('params'));
      const p = item(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: rootWidth }) ? p : undefined;
    });
  },
});
