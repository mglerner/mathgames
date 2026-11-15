// @ts-check
// sqrt-squared (skill 21, DESIGN.md section 4): sqrt(n) is the number whose
// square is n, so sqrt(n) x sqrt(n) = n. Built on the recipe in ../common.js,
// following the reference src/gen/mint/frac-times-whole.core.js.
//
// Difficulty (section 4 gives none per skill; this is my reading, reported):
//   d1  sqrt(n) x sqrt(n), n squarefree in 2..19.
//   d2  (sqrt(n))^2, n squarefree in 2..47.
// n is never a perfect square (sqrt(4) x sqrt(4) can be done without the
// fact), and squarefree, so no other radical rule is in play.
//
// Interactions:
//   forge     variant 'root-pair' (section 3 I4 named variant
//             "sqrt(?) x sqrt(?) = 5"): the equation sqrt(_)sqrt(_) = n (d2:
//             sqrt(_)^2 = n), pick or type the radicand. Offered faces (fade
//             0-1): n (correct), n^2, sqrt(n). These are a designed
//             alphabet with judge-computed verdicts, untagged: no section 5
//             mal-rule reads this shape. Typed (fade 2-3): an integer worth n.
//   predict   "Multiply" (d2 "Square"): the result, no root left in it.
//   strike    "Evaluate": the value, a whole number.
//   twin      the prompt form against another form. Equivalent (about half):
//             n, or the other shape (sqrt(n)^2 for sqrt(n)sqrt(n) and back).
//             Different: the Overshoot's n^2 or the Halver's n^2/4 ("same" is
//             tagged with that rule). Follow-up key: the common value, or
//             both values.
//   why       variant 'hidden-1' (counting): (k/e) x (sqrt(n)sqrt(n))/n in
//             either order: two fractions, tap the one worth 1 (because
//             sqrt(n)sqrt(n) = n). Targets: both fractions, sqrt(n)sqrt(n), n.
// Every item carries the worked chain in `steps`.
//
// Mal-rules separated here: root-square-overshoot (18), half-power-is-half
// (16), form-change-changes-value (2).
//
// Documented seeds (pinned by test/gen/sqrt-squared.test.js):
//   EXAMPLE_SEED at d1 gives sqrt(3) x sqrt(3) (section 12: a teacher example)
//     in every interaction (the why shows (k/e)(sqrt(3)sqrt(3)/3), either order).
//   FORGE_SEED at d1 gives the named Forge "sqrt(?) x sqrt(?) = 5".
//
// Display width: the shared conservativeWidth (common.js) charges 16px for
// each of the five characters of "sqrt(", about 3x what render/mathdom.js
// draws for a radical sign; that rejects k(sqrt(13)sqrt(13)/13). This file
// passes fitsAll() a fixed, pure estimate instead (the recipe allows one per
// call): the same 16px-per-character rule with "sqrt(" counted as one
// character. The harness re-checks every displayed tree with the real
// mathdom estimate.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, shuffledChoices,
  twinChoices, tapTargets, blank, DISPLAY_CAP_PX,
} from '../common.js';
import { num, mul, frac, pow, sqrt, eq, isEquation } from '../../math/ast.js';
import { gcd } from '../../math/rational.js';
import { constQ } from '../../math/evaluate.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { qNode } from '../../misc/kit.js';
import overshoot from '../../misc/malrules/root-square-overshoot.js';
import halver from '../../misc/malrules/half-power-is-half.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
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

/** @typedef {{ n: bigint; k: bigint; squared: boolean }} Params */

const GEN = Object.freeze({ id: 'sqrt-squared.core', version: 1, skill: 'sqrt-squared' });

/** Forge variant: "sqrt(?) x sqrt(?) = n", pick the radicand. */
export const V_ROOT_PAIR = 'root-pair';

/** makeRng(EXAMPLE_SEED) at d1 gives sqrt(3) x sqrt(3) in every interaction. Pinned by the test. */
export const EXAMPLE_SEED = 'parent-example-8';
/** makeRng(FORGE_SEED) at d1 gives the section 3 Forge "sqrt(?) x sqrt(?) = 5". Pinned by the test. */
export const FORGE_SEED = 'named-forge-7';

const SQUAREFREE_D1 = Object.freeze([2n, 3n, 5n, 6n, 7n, 10n, 11n, 13n, 14n, 15n, 17n, 19n]);
const SQUAREFREE_D2 = Object.freeze([...SQUAREFREE_D1, 21n, 22n, 23n, 26n, 29n, 30n, 31n, 33n, 34n, 35n, 37n, 38n, 39n, 41n, 42n, 43n, 46n, 47n]);

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

/** @param {Rng} r @param {number} d @returns {Params} */
function draw(r, d) {
  const n = r.pick(d === 1 ? SQUAREFREE_D1 : SQUAREFREE_D2);
  const k = BigInt(r.int(2, 9));
  return { n, k, squared: d === 2 };
}

/** sqrt(n)sqrt(n), or sqrt(n)^2. @param {bigint} n @param {boolean} squared @returns {Node} */
function rootForm(n, squared) {
  return squared ? pow(sqrt(num(n)), num(2)) : mul(sqrt(num(n)), sqrt(num(n)));
}

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, d, opts, seed) {
  const { n, k, squared } = d;
  const math = rootForm(n, squared);
  const value = num(n);
  /** @type {Step[]} */
  const steps = (squared ? [math, rootForm(n, false), value] : [math, value]).map((line) => ({ line, legal: true }));
  const visuals = ['squareplot', 'numberline'];
  /** @param {string[]} formPredicates */
  const key = (formPredicates) => ({ kind: /** @type {const} */ ('expr'), expected: value, formPredicates, assumptions: [] });

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Evaluate', math, goal: 'Type the value.' }, answer: key(['integer']), steps, visuals });
    case 'predict':
      return makeProblem(GEN, seed, opts, { prompt: { verb: squared ? 'Square' : 'Multiply', math }, answer: key(['no-radical']), steps, visuals });
    case 'forge': {
      const hole = sqrt(blank());
      /** @type {Equation} */
      const shown = eq(squared ? pow(hole, num(2)) : mul(hole, sqrt(blank())), value);
      const p = makeProblem(GEN, seed, opts, {
        variant: V_ROOT_PAIR,
        prompt: { verb: 'Forge', math: shown, goal: 'What number goes inside the square root?' },
        answer: key(['integer']), steps, visuals,
      });
      if (p.constructed) return p; // fade 2-3: typed
      return {
        ...p,
        choices: shuffledChoices(r.fork('choices'), [
          { display: value, verdict: 'correct' },
          { display: num(n * n), verdict: 'wrong' },
          { display: sqrt(num(n)), verdict: 'wrong' },
        ]),
      };
    }
    case 'twin': {
      const tr = r.fork('twin');
      const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Same value?', math }, answer: key(['integer']) });
      const want = tr.bool();
      /** @type {Node} */ let twin;
      /** @type {string | undefined} */ let tag;
      if (want) {
        twin = tr.pick([value, rootForm(n, !squared)]);
      } else {
        const rule = tr.pick([overshoot, halver]);
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
        answer: want ? key(['integer'])
          : { kind: 'tuple', expected: [value, qNode(twinValue)], formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
    }
    case 'why': {
      // The multiplier is itself a fraction (not worth 1), written before or
      // after: "tap the only fraction" does not find the 1.
      const wr = r.fork('why');
      const e = BigInt(wr.int(2, 9));
      if (k === n || e === n || gcd(k, e) !== 1n) return undefined; // two targets would show n; k/e in lowest terms
      const one = frac(math, num(n));
      const oneFirst = wr.bool();
      const shown = oneFirst ? mul(one, frac(num(k), num(e))) : mul(frac(num(k), num(e)), one);
      const at = oneFirst ? 0 : 1;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: `This is still ${k}/${e}. Tap the 1 hiding in it.` },
        choices: tapTargets(shown, [`e.${1 - at}`, `e.${at}.0`, `e.${at}.1`, `e.${at}`].sort(), `e.${at}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps, visuals: ['coin', ...visuals],
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 2],
  interactions: ['forge', 'predict', 'strike', 'twin', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const d = draw(r.fork('params'), opts.difficulty);
      const p = item(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: opts.interaction === 'why' ? stackedWidth : rootWidth }) ? p : undefined;
    });
  },
});
