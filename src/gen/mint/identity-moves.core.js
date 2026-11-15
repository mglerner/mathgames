// @ts-check
// identity-moves (skill 3, DESIGN.md section 4): x 1 and + 0 change the form,
// not the value. Built on the recipe in ../common.js, after
// frac-times-whole.core.js. Two kinds of item, drawn per seed:
//   coin   x 1:  (m x)/b times the coin k/k gives (k m x)/(k b).
//   zero   + 0:  x + c plus the zero-pair (g - g) gives x + T - g, T = c + g.
//
// Documented seeds (pinned by test/gen/identity-moves.test.js):
//   ZERO_SEED at d1: the zero-pair x + 5 = x + 8 - 3 (pair 3 - 3).
//   COIN_SEED at d1: the coin x/4 = 3x/12 (coin 3/3).
//
// Difficulty (my reading, reported):
//   d1  coin: x/b, b in 2..6, k in 2..5.    zero: c in 1..9, g in 2..9 (T > c).
//   d2  coin: x/b, b in 2..9, k in 2..9.    zero: c in 1..20, g in 2..20.
//   d3  coin: (m x)/b, m in 2..9.           zero: the target may be below c (g < 0,
//                                           the pair is -|g| + |g|).
//   d4  coin: (m x)/b, b, k up to 12.       zero: c may be negative (x - 3).
// Never: a value-0 or value-1 key, m x / b not in lowest terms, T = 0.
//
// Interactions:
//   forge     coin: "Make the denominator k b": k/k, a second coin m/m that
//             misses the goal ("Legal. Not closer."), and the Half-Coin's k/1
//             and 1/k (tagged one-part-coin). zero: "Make x + T appear": the
//             pair g - g, a second zero-pair h - h that misses the goal
//             (legal-idle; h is T when it can be), the bare g, the bare T
//             (untagged: no mal-rule models a half zero-pair). Fade 2-3 typed.
//   predict   coin only: "Multiply" (m x / b)(k/k), finished = denominator k b.
//   strike    coin: "Write it with denominator k b". zero: fill the blank
//             x + c = x + T - [ ] (or + [ ] when the target is below).
//   twin      coin only (a zero-pair Different has no mal-rule to tag it, and
//             a pool of zero-pair pairs that are always Same would leak the
//             answer). (m x)/b against a second fraction. Equivalent:
//             (k m x)/(k b); the follow-up key is the form of 1 that connects
//             them, k/k (section 3 I5). Different: the Half-Coin's
//             (k m x)/b, or for m > 1 also (m x)/(k b) (with m = 1 that one
//             would be the only twin with a bare x on top, a tell); the
//             follow-up key is the first form's value at the probe named in
//             the goal.
//   why       coin: 'hidden-1', tap k/k. zero: 'hidden-0', tap (g - g).

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, shuffledChoices,
  twinChoices, tapTargets, probeEnvs, blank, V_FILL_BLANK, PROBE_VALUES, TWIN_SAME,
} from '../common.js';
import { num, mul, frac, add, neg, group, v, eq } from '../../math/ast.js';
import { q, gcd } from '../../math/rational.js';
import { evaluate } from '../../math/evaluate.js';
import { toQ } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { qNode, int } from '../../misc/kit.js';
import { diagnose } from '../../misc/diagnose.js';
import halfCoin from '../../misc/malrules/one-part-coin.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').Choice} Choice */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {{ kind: 'coin'; m: bigint; b: bigint; k: bigint } | { kind: 'zero'; c: bigint; g: bigint }} Params */

const GEN = Object.freeze({ id: 'identity-moves.core', version: 1, skill: 'identity-moves' });

/** Seeds of the documented examples at d1 (see the header). */
export const ZERO_SEED = 's416';
export const COIN_SEED = 's23';

const X = v('x');

/** @param {Rng} r @param {number} d @param {'coin' | 'zero'} kind @returns {Params | undefined} */
function draw(r, d, kind) {
  if (kind === 'coin') {
    const m = d >= 3 ? r.int(2, 9) : 1;
    const b = d === 1 ? r.int(2, 6) : r.int(2, d === 4 ? 12 : 9);
    const k = d === 1 ? r.int(2, 5) : r.int(2, d === 4 ? 12 : 9);
    if (gcd(BigInt(m), BigInt(b)) !== 1n) return undefined;
    return { kind, m: BigInt(m), b: BigInt(b), k: BigInt(k) };
  }
  let c;
  let g;
  if (d === 1) { c = r.int(1, 9); g = r.int(2, 9); }
  else if (d === 2) { c = r.int(1, 20); g = r.int(2, 20); }
  else {
    c = d === 4 ? r.pick([r.int(-9, -1), r.int(1, 15)]) : r.int(1, 20);
    g = r.int(2, 15) * (r.bool() ? 1 : -1);
  }
  if (c + g === 0) return undefined;
  return { kind, c: BigInt(c), g: BigInt(g) };
}

/** x + n, n a nonzero integer, in the parser's shape. @param {bigint} n @returns {Node} */
function xPlus(n) { return add(X, int(n)); }

/** The zero-pair g - g (g > 0) or -|g| + |g| (g < 0). @param {bigint} g @returns {Node} */
function zeroPair(g) { return g > 0n ? add(num(g), neg(num(g))) : add(neg(num(-g)), num(-g)); }

/** (m x)/b. @param {bigint} m @param {bigint} b @returns {Node} */
function mxOver(m, b) { return frac(m === 1n ? X : mul(num(m), X), num(b)); }

/** The exact rational value of n at x = p. @param {Node} n @param {number} p */
function valueAt(n, p) {
  const s = evaluate(n, { x: q(p) });
  return s ? toQ(s) : undefined;
}

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function coinItem(r, d, opts, seed) {
  const { m, b, k } = d.kind === 'coin' ? d : /** @type {never} */ (undefined);
  const f = mxOver(m, b);
  const coin = frac(num(k), num(k));
  const withCoin = mul(f, coin);
  const scaled = frac(mul(num(k * m), X), num(k * b));
  /** @type {Step[]} */
  const steps = [f, withCoin, scaled].map((line) => ({ line, legal: true }));
  const visuals = ['coin', 'numberline'];
  const toDen = `denominator:${k * b}`;
  const env = { variableKeys: ['x'], probes: probeEnvs(['x']) };

  switch (opts.interaction) {
    case 'forge': {
      const p = makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Forge', math: f, goal: `Make the denominator ${k * b}.` },
        answer: { kind: 'form-of-1', expected: coin, formPredicates: [toDen], assumptions: [] },
        steps, visuals, ...env,
      });
      if (p.constructed) return p;
      const wrong = halfCoin.applyAll(p);
      if (wrong.length !== 2) return undefined;
      // a second coin, worth 1 but not the one that reaches the goal
      const idle = r.fork('idle').pick([2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n].filter((x) => x !== k));
      /** @type {Omit<Choice, 'id'>[]} */
      const items = [{ display: coin, verdict: 'correct' }, { display: frac(num(idle), num(idle)), verdict: 'legal-idle' }];
      for (const w of wrong) items.push({ display: /** @type {Node} */ (w), verdict: 'wrong', malrule: halfCoin.id });
      return { ...p, choices: shuffledChoices(r.fork('choices'), items) };
    }
    case 'predict':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Multiply', math: withCoin },
        answer: { kind: 'expr', expected: scaled, formPredicates: [toDen], assumptions: [] },
        steps, visuals, ...env,
      });
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Rewrite', math: f, goal: `Write it with denominator ${k * b}.` },
        answer: { kind: 'expr', expected: scaled, formPredicates: [toDen], assumptions: [] },
        steps, visuals, ...env,
      });
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      const p0 = tr.pick(PROBE_VALUES);
      tr.bool(); // (stream kept from version 1)
      const math = f;
      // Different: as the Half-Coin writes it, in the same "Nx/D" shape as
      // the equivalent partner (k m x)/(k b).
      const wrong = m === 1n ? [frac(mul(num(k), X), num(b))] : [frac(mul(num(k * m), X), num(b)), mxOver(m, k * b)];
      const twin = want ? scaled : tr.pick(wrong);
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      if (want) {
        const prompt = { verb: 'Same value?', math, twin };
        return makeProblem(GEN, seed, opts, {
          prompt,
          choices: twinChoices(prompt, true),
          // the follow-up asks for the form of 1 that connects the forms
          answer: { kind: 'form-of-1', expected: coin, formPredicates: [toDen], assumptions: [] },
          steps, visuals, ...env,
        });
      }
      const at = valueAt(math, p0);
      const other = valueAt(twin, p0);
      if (!at || !other || (at.d === 1n && (at.n === 0n || at.n === 1n))) return undefined; // a key of 0 or 1 is too guessable
      // The value at the named probe must tell the pair apart.
      if (at.n * other.d === other.n * at.d) return undefined;
      const prompt = { verb: 'Same value?', math, twin, goal: `Substitute x = ${p0} into both forms.` };
      const p = makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, false, halfCoin.id),
        answer: { kind: 'expr', expected: qNode(at), formPredicates: ['single-number'], assumptions: [] },
        steps, visuals, ...env,
      });
      const dg = diagnose(p, TWIN_SAME);
      if (dg.misconceptions.length !== 1 || dg.misconceptions[0] !== halfCoin.id) throw new Error(`${GEN.id}: the Half-Coin twin is not a one-part-coin output (seed ${JSON.stringify(seed)})`);
      return p;
    }
    case 'why':
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: withCoin, goal: 'Tap the form of 1.' },
        choices: tapTargets(withCoin, ['e.0', 'e.0.1', 'e.1', 'e.1.0'], 'e.1'),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps, visuals, ...env,
      });
    default:
      return undefined;
  }
}

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function zeroItem(r, d, opts, seed) {
  const { c, g } = d.kind === 'zero' ? d : /** @type {never} */ (undefined);
  const T = c + g;
  const start = xPlus(c);
  const pair = zeroPair(g);
  const withPair = add(X, int(c), group(pair));
  const result = add(X, int(T), g > 0n ? neg(num(g)) : num(-g));
  /** @type {Step[]} */
  const steps = [start, withPair, result].map((line) => ({ line, legal: true }));
  const visuals = ['zeropair', 'numberline'];
  const env = { variableKeys: ['x'], probes: probeEnvs(['x']) };
  const target = print(xPlus(T));

  switch (opts.interaction) {
    case 'forge': {
      const p = makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Forge', math: start, goal: `Make ${target} appear.` },
        answer: { kind: 'form-of-0', expected: pair, formPredicates: [], assumptions: [] },
        steps, visuals, ...env,
      });
      if (p.constructed) return p;
      // a second zero-pair, worth 0 but not the one that makes x + T appear
      const mag = (/** @type {bigint} */ n) => (n < 0n ? -n : n);
      const h = [mag(T), mag(c), mag(g) + 1n].find((x) => x !== mag(g)) ?? mag(g) + 1n;
      /** @type {Omit<Choice, 'id'>[]} */
      const items = [
        { display: pair, verdict: 'correct' }, { display: zeroPair(g > 0n ? h : -h), verdict: 'legal-idle' },
        { display: int(g), verdict: 'wrong' }, { display: int(T), verdict: 'wrong' },
      ];
      return { ...p, choices: shuffledChoices(r.fork('choices'), items) };
    }
    case 'strike': {
      const gap = g > 0n ? g : -g;
      const rhs = add(X, int(T), g > 0n ? neg(blank()) : blank());
      return makeProblem(GEN, seed, opts, {
        variant: V_FILL_BLANK,
        prompt: { verb: 'Fill the blank', math: eq(start, rhs) },
        answer: { kind: 'expr', expected: num(gap), formPredicates: ['single-number'], assumptions: [] },
        steps, visuals, ...env,
      });
    }
    case 'why':
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-0',
        prompt: { verb: 'Tap the hidden 0', math: withPair, goal: 'Tap the form of 0.' },
        choices: tapTargets(withPair, ['e.1', 'e.2', 'e.2.0.0', 'e.2.0.1'], 'e.2'),
        answer: { kind: 'expr', expected: num(0), formPredicates: [], assumptions: [] },
        steps, visuals, ...env,
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
    const coinOnly = opts.interaction === 'predict' || opts.interaction === 'twin';
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const kind = coinOnly || r.fork('kind').bool() ? 'coin' : 'zero';
      const d = draw(r.fork('params'), opts.difficulty, kind);
      if (!d) return undefined;
      const p = d.kind === 'coin' ? coinItem(r, d, opts, seed) : zeroItem(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
