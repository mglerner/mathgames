// @ts-check
// rationalize-denominator (skill 25, DESIGN.md section 4), difficulties 2-4
// (d1, the slice gate k/sqrt(n), is rationalize-denominator.core.js): make
// the denominator root-free by multiplying by a form of 1. Built on the
// recipe in ../common.js, following src/gen/stacks-roots/rationalize-denominator.core.js.
//
// Kinds and difficulty (my reading, reported):
//   d2  cden     k/(c sqrt(n)), c in 2..5, k in 2..12, n squarefree in
//                {2, 3, 5, 6, 7, 10, 11}: 6/(2 sqrt(3)) = sqrt(3). The coin is
//                still sqrt(n)/sqrt(n); the c stays put.
//       rootnum  sqrt(a)/sqrt(n), a and n distinct coprime squarefree numbers:
//                sqrt(5)/sqrt(3) = sqrt(15)/3.
//   d3  big      k/sqrt(N), N = s^2 m not squarefree (8, 12, 18, 20, 24, 27,
//                28, 32, 45, 50), k in 2..12: the radicand must also be
//                simplified (simplify-radicals is a prerequisite).
//                6/sqrt(12) = sqrt(3). Two coins clear the root:
//                sqrt(N)/sqrt(N) and the smaller sqrt(m)/sqrt(m); both are
//                correct when typed; the offered faces show one of them.
//   d4  conj     k/(a + sqrt(n)) or k/(a - sqrt(n)), a in 2..5, a^2 > n: the
//                coin is the CONJUGATE (a -+ sqrt(n))/(a -+ sqrt(n)), because
//                (a + sqrt(n))(a - sqrt(n)) = a^2 - n has no root.
//                2/(3 + sqrt(7)) = 3 - sqrt(7). k is a multiple of a^2 - n on
//                about half the items, so the answer often has whole-number
//                coefficients. a^2 < n (1/(1 + sqrt(2)) = sqrt(2) - 1, a
//                negative denominator to clear as well) is not served: one new
//                idea per item; reported.
// Never: a negative radicand; a denominator worth 0.
//
// Interactions:
//   forge     form of 1, goal "no root in the denominator". Offered faces
//             (fade 0-1), four:
//             - the clearing coin (correct);
//             - a form of 1 that is legal but not closer, so they must choose
//               WHICH 1: sqrt(x)/sqrt(x) for another squarefree x (d2 cden,
//               d3 small coin), sqrt(a)/sqrt(a) (d2 rootnum), another
//               sqrt(M)/sqrt(M) with M not squarefree (d3 big coin), the
//               denominator over itself (d4). Always written with roots and
//               about as long as the key, so neither "the only coin made of
//               roots" nor "the longest" finds the key. (Section 3's numeric n/n,
//               "3/3", is therefore not offered; typed, it is still judged
//               "Legal. Not closer.");
//             - ONE half of the key, c/1 or 1/d (the Half-Coin, tagged
//               one-part-coin), and the SAME half of the idle coin
//               (untagged, not worth 1), so the options' parts do not
//               out-vote to the key.
//             Typed (fade 2-3): any form of 1 that clears the root.
//   predict   "Multiply" the prompt by its coin: any form with no root in the
//             denominator.
//   strike    "Rationalize": no root in the denominator, lowest terms,
//             radicals simplified.
//   twin      the prompt against another form. Same (about half): the
//             rationalized form or the unreduced product; follow-up key: the
//             form of 1 that connects them (section 3 I5). Different: a
//             mal-rule output ("same" tagged by the rule matcher; about 2
//             Different pairs in 10, 1 in 10 at d4, where only the Halver's
//             number applies), or a near miss written like the Same
//             forms, unreduced and reduced (untagged unless a rule explains
//             it): at d2 the c forgotten, n squared, over the wrong root, the
//             top not multiplied; at d3 the s forgotten or left squared; at
//             d4 a^2 + n for a^2 - n, or only the first term divided by
//             a^2 - n. (The same-sign coin's k(a + sqrt(n))/(a^2 - n) is not a
//             Twin partner: its sign alone would mark it Different. It is the
//             Forge's legal-idle face instead.) Key: both values.
//   why       variant 'hidden-1' (counting): the prompt times its coin, in
//             either order; tap the 1. Targets: both factors and the top and
//             bottom of each.
// Every item carries the worked chain in `steps`: the multiply-across line,
// the root-times-itself line (and at d4 a^2 - sqrt(n)^2), the result.
//
// Mal-rules separated here: one-part-coin (4), root-square-overshoot (18),
// half-power-is-half (16), sqrt-product-misapplied (17, at d3),
// form-change-changes-value (2). At d2 cden and d4 the strike's wrong
// answers are mostly UNCLASSIFIED: the Half-Coin and the Overshoot read only
// k/sqrt(n) with a bare root below (reported under NEEDS FROM OTHERS).
//
// Documented seeds (pinned by test/gen/rationalize-denominator.d2plus.test.js):
//   CDEN_SEED at d2: the strike 6/(2sqrt(3)) (key sqrt(3)).
//   CONJ_SEED at d4: the strike 2/(3 + sqrt(7)) (key 3 - sqrt(7)).
//
// Display width: as in rationalize-denominator.core.js, fitsAll() gets a
// fixed estimate that counts "sqrt(" as one character. The harness re-checks
// every displayed tree with the real mathdom estimate.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, shuffledChoices,
  twinChoices, tapTargets, DISPLAY_CAP_PX, TWIN_SAME,
} from '../common.js';
import { num, mul, add, sub, frac, pow, sqrt, group, isEquation } from '../../math/ast.js';
import { gcd } from '../../math/rational.js';
import { constValue } from '../../math/evaluate.js';
import { surdToNode } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { outputsOf, malrules, ruleMatches } from '../../misc/diagnose.js';
import halfCoin from '../../misc/malrules/one-part-coin.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/**
 * @typedef {{ kind: 'cden'; k: bigint; c: bigint; n: bigint }
 *   | { kind: 'rootnum'; a: bigint; n: bigint }
 *   | { kind: 'big'; k: bigint; s: bigint; m: bigint; bigCoin: boolean }
 *   | { kind: 'conj'; k: bigint; a: bigint; n: bigint; minus: boolean }} Params
 *   conj: k/(a + sqrt(n)), or k/(a - sqrt(n)) when minus.
 */

const GEN = Object.freeze({ id: 'rationalize-denominator.d2plus', version: 1, skill: 'rationalize-denominator' });

/** makeRng(CDEN_SEED) at d2, strike: 6/(2sqrt(3)). Pinned by the test. */
export const CDEN_SEED = 'cden-1906';
/** makeRng(CONJ_SEED) at d4, strike: 2/(3 + sqrt(7)). Pinned by the test. */
export const CONJ_SEED = 'conj-20';

const SQUAREFREE = Object.freeze([2n, 3n, 5n, 6n, 7n, 10n, 11n]);
/** [s, m] with s^2 m = 8, 12, 18, 20, 24, 27, 28, 32, 45, 50. */
const BIG = Object.freeze([[2n, 2n], [2n, 3n], [3n, 2n], [2n, 5n], [2n, 6n], [3n, 3n], [2n, 7n], [4n, 2n], [3n, 5n], [5n, 2n]]);
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

/**
 * rootWidth, but a fraction, or a product of fractions, is measured as
 * drawn: each fraction is stacked, so it is as wide as the wider of its two
 * parts. The harness re-checks every item with the real mathdom estimate.
 * @param {Node | Equation} x @returns {number}
 */
function stackedWidth(x) {
  if (isEquation(x)) return rootWidth(x);
  if (x.t === 'frac') return Math.max(rootWidth(x.num), rootWidth(x.den)) + 24;
  if (x.t !== 'mul' || !x.args.every((a) => a.t === 'frac')) return rootWidth(x);
  return x.args.reduce((w, a) => w + (a.t === 'frac' ? Math.max(rootWidth(a.num), rootWidth(a.den)) : 0), 0) + 24;
}

/** @param {Rng} r @param {bigint} lo @param {bigint} hi */
const bint = (r, lo, hi) => BigInt(r.int(Number(lo), Number(hi)));

/** @param {Rng} r @param {number} d @returns {Params | undefined} */
function draw(r, d) {
  if (d === 2) {
    if (r.bool()) return { kind: 'cden', k: bint(r, 2n, 12n), c: bint(r, 2n, 5n), n: r.pick(SQUAREFREE) };
    const a = r.pick(SQUAREFREE);
    const n = r.pick(SQUAREFREE);
    return a !== n && gcd(a, n) === 1n ? { kind: 'rootnum', a, n } : undefined;
  }
  if (d === 3) {
    const [s, m] = r.pick(BIG);
    return { kind: 'big', k: bint(r, 2n, 12n), s, m, bigCoin: r.bool() };
  }
  const a = bint(r, 2n, 5n);
  const n = r.pick(SQUAREFREE);
  const D = a * a - n;
  if (D <= 0n) return undefined; // a positive denominator after the conjugate (see the header)
  const k = r.bool() && D <= 12n ? D * bint(r, 1n, 2n) : bint(r, 2n, 9n);
  return { kind: 'conj', k, a, n, minus: r.bool(1 / 3) };
}

/** c sqrt(n), or sqrt(n) when c is 1. @param {bigint} c @param {bigint} n @returns {Node} */
function cr(c, n) { return c === 1n ? sqrt(num(n)) : mul(num(c), sqrt(num(n))); }
/** @param {bigint} n */
const rt = (n) => sqrt(num(n));
/**
 * sqrt(M)/sqrt(M) with M = t^2 x not squarefree and x != m: written like the
 * big coin sqrt(N)/sqrt(N), and it leaves a root below sqrt(N) (N M is a
 * square only when x = m).
 * @param {bigint} m @returns {Node}
 */
function otherBig(m) { const [t, x] = /** @type {bigint[]} */ (BIG.find(([, y]) => y !== m && y > m) ?? BIG.find(([, y]) => y !== m)); return frac(rt(t * t * x), rt(t * t * x)); }
/**
 * sqrt(x)/sqrt(x) with x a squarefree number other than n, chosen from n so
 * it needs no draw: worth 1, and it leaves a root below sqrt(n) (sqrt(n x) is
 * irrational: n and x are different squarefree numbers).
 * @param {bigint} n @returns {Node}
 */
function otherRoot(n) { const x = SQUAREFREE[(SQUAREFREE.indexOf(n) + 1) % SQUAREFREE.length]; return frac(rt(x), rt(x)); }

/**
 * The prompt, its coin (the form of 1 that clears the root), legal-idle
 * coins, the worked chain and near misses written like the answer.
 * @param {Params} d
 * @returns {{ math: Node; coin: Node; idle: Node[]; chain: Node[]; unreduced: Node; near: Node[] }}
 */
function form(d) {
  switch (d.kind) {
    case 'cden': {
      const { k, c, n } = d;
      const math = frac(num(k), cr(c, n));
      const coin = frac(rt(n), rt(n));
      const unreduced = frac(cr(k, n), num(c * n));
      return {
        math, coin, idle: [frac(num(n), num(n)), otherRoot(n)], unreduced,
        chain: [math, mul(math, coin), frac(cr(k, n), mul(num(c), rt(n), rt(n))), unreduced],
        near: [frac(cr(k, n), num(n)), frac(cr(k, n), num(c * n * n))], // the c forgotten; n squared
      };
    }
    case 'rootnum': {
      const { a, n } = d;
      const math = frac(rt(a), rt(n));
      const coin = frac(rt(n), rt(n));
      const unreduced = frac(rt(a * n), num(n));
      return {
        math, coin, idle: [frac(num(n), num(n)), frac(rt(a), rt(a))], unreduced,
        chain: [math, mul(math, coin), frac(mul(rt(a), rt(n)), mul(rt(n), rt(n))), unreduced],
        near: [frac(rt(a * n), num(a)), frac(rt(a), num(n))], // over the wrong one; the top not multiplied
      };
    }
    case 'big': {
      const { k, s, m, bigCoin } = d;
      const N = s * s * m;
      const math = frac(num(k), rt(N));
      const coin = bigCoin ? frac(rt(N), rt(N)) : frac(rt(m), rt(m));
      const unreduced = bigCoin ? frac(cr(k, N), num(N)) : frac(cr(k, m), num(s * m));
      return {
        math, coin, idle: [frac(num(N), num(N)), bigCoin ? otherBig(m) : otherRoot(m)], unreduced,
        chain: bigCoin
          ? [math, mul(math, coin), frac(cr(k, N), mul(rt(N), rt(N))), unreduced, frac(mul(num(k * s), rt(m)), num(N))]
          : [math, mul(math, coin), frac(cr(k, m), mul(rt(N), rt(m))), frac(cr(k, m), rt(N * m)), unreduced],
        near: [frac(cr(k, m), num(m)), frac(cr(k, m), num(s * s * m))], // the s forgotten; s left squared
      };
    }
    case 'conj': {
      const { k, a, n, minus } = d;
      const join = (/** @type {boolean} */ neg, /** @type {Node} */ x, /** @type {Node} */ y) => (neg ? sub(x, y) : add(x, y));
      const den = () => join(minus, num(a), rt(n));
      const other = () => join(!minus, num(a), rt(n));
      const math = frac(num(k), den());
      const coin = frac(other(), other());
      const D = a * a - n; // > 0 (draw)
      const top = () => (k === 1n ? other() : mul(num(k), group(other())));
      const unreduced = frac(top(), num(D));
      return {
        math, coin, idle: [frac(rt(n), rt(n)), frac(den(), den())], unreduced,
        chain: [
          math, mul(math, coin),
          frac(top(), mul(group(den()), group(other()))),
          frac(top(), sub(pow(num(a), num(2)), pow(rt(n), num(2)))),
          unreduced,
        ],
        near: [
          frac(top(), num(a * a + n)), // a^2 + n for a^2 - n
          // only the first term divided by a^2 - n (served when that division is whole)
          ...((k * a) % D === 0n ? [reducedLook(join(!minus, num((k * a) / D), cr(k, n)))] : []),
        ],
      };
    }
  }
}

/**
 * A value p + q sqrt(n) written over ONE denominator, (P + Q sqrt(n))/L, as a
 * student writes it (surdToNode would give 10/19 - 2sqrt(6)/19). A single
 * term is surdToNode's own form (7sqrt(10)/30).
 * @param {import('../../../types.d.ts').Surd} v @returns {Node}
 */
function overOne(v) {
  if (v.terms.length !== 2) return surdToNode(v);
  const [t0, t1] = v.terms[0].rad === 1n ? v.terms : [v.terms[1], v.terms[0]];
  const L = (t0.coef.d * t1.coef.d) / gcd(t0.coef.d, t1.coef.d);
  const P = (t0.coef.n * L) / t0.coef.d;
  const Q = (t1.coef.n * L) / t1.coef.d;
  const absQ = Q < 0n ? -Q : Q;
  const top = Q < 0n ? sub(num(P), cr(absQ, t1.rad)) : add(num(P), cr(absQ, t1.rad));
  return L === 1n ? top : frac(top, num(L));
}

/** A constant written as the answer is (overOne). @param {Node} x @returns {Node} */
function reducedLook(x) { const v = constValue(x); return v ? overOne(v) : x; }

/**
 * The largest whole number written in x: a Twin partner above 200 is not
 * served (numbers must serve the idea, not swamp it).
 * @param {Node} x @returns {number}
 */
function maxNum(x) { return Math.max(0, ...(print(x).match(/\d+/g) ?? []).map(Number)); }

/** The rules that turn one Twin form into the other. @param {Problem} p @returns {string[]} */
function sameHits(p) { return malrules.filter((r) => ruleMatches(r, p, TWIN_SAME)).map((r) => r.id); }

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, d, opts, seed) {
  const { math, coin, idle, chain, unreduced, near } = form(d);
  const value = constValue(math);
  if (!value) return undefined;
  const answer = overOne(value);
  const withCoin = mul(math, coin);
  /** @type {Step[]} */
  const steps = chain.map((line) => ({ line, legal: true }));
  if (print(chain[chain.length - 1]) !== print(answer)) steps.push({ line: answer, legal: true });
  const visuals = ['coin', 'numberline'];
  /** @param {string[]} formPredicates */
  const key = (formPredicates) => ({ kind: /** @type {const} */ ('expr'), expected: answer, formPredicates, assumptions: [] });
  const coinKey = { kind: /** @type {const} */ ('form-of-1'), expected: coin, formPredicates: [NO_ROOT_BELOW], assumptions: [] };

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
        answer: coinKey, steps, visuals,
      });
      if (p.constructed) return p; // fade 2-3: typed
      const halves = outputsOf(halfCoin, p);
      if (halves.length !== 2) return undefined;
      // Which 1: the clearing coin, or a 1 that leaves a root below, always
      // written with roots too, so "the only coin made of roots" is no tell. Then ONE half of each coin, the same half: the Half-Coin's
      // half of the key (tagged) and the same half of the idle coin
      // (untagged, not worth 1), so the parts of the options do not
      // out-vote to the key.
      const ir = r.fork('idle');
      const idleCoin = /** @type {Extract<Node, { t: 'frac' }>} */ (idle[1]);
      const top = ir.bool();
      const idleHalf = top ? frac(idleCoin.num, num(1)) : frac(num(1), idleCoin.den);
      if (halves.some((h) => 't' in h && h.t !== 'eq' && equivExpr(h, idleHalf).equal !== false)) return undefined; // (at d4 with a^2 - n = 1, 1/(a + sqrt(n)) is a - sqrt(n))
      return {
        ...p,
        choices: shuffledChoices(r.fork('choices'), [
          { display: coin, verdict: 'correct' },
          { display: idleCoin, verdict: 'legal-idle' },
          { display: /** @type {Node} */ (halves[top ? 0 : 1]), verdict: 'wrong', malrule: halfCoin.id },
          { display: idleHalf, verdict: 'wrong' },
        ]),
      };
    }
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Same value?', math }, answer: key([NO_ROOT_BELOW]) });
      /** @type {Node} */ let twin;
      if (want) {
        twin = tr.pick(print(unreduced) !== print(answer) ? [answer, unreduced] : [answer]);
      } else {
        // Near misses written like the Same forms (each in the unreduced look
        // and in the reduced look of the answer), on about 8 Different pairs
        // in 10; otherwise a mal-rule's output, whose look may give it away.
        /** @type {Node[]} */
        const looks = [];
        for (const x of near) {
          const v = constValue(x);
          for (const y of v ? [x, overOne(v)] : [x]) if (!looks.some((z) => print(z) === print(y))) looks.push(y);
        }
        /** @type {Node[]} */
        const outs = [];
        for (const rule of malrules) {
          for (const o of outputsOf(rule, base)) if ('t' in o && o.t !== 'eq' && !outs.some((x) => print(x) === print(o))) outs.push(o);
        }
        const small = (/** @type {Node[]} */ xs) => xs.filter((x) => maxNum(x) <= 200);
        const pool = small(outs).length > 0 && tr.bool(d.kind === 'conj' ? 0.1 : 0.2) ? small(outs) : small(looks);
        if (pool.length === 0) return undefined;
        twin = tr.pick(pool);
      }
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) return undefined;
      const twinValue = constValue(twin);
      if (!twinValue) return undefined;
      const prompt = { verb: 'Same value?', math, twin };
      const draft = makeProblem(GEN, seed, opts, { prompt, choices: twinChoices(prompt, want), answer: key([NO_ROOT_BELOW]) });
      const hits = want ? [] : sameHits(draft);
      if (hits.length > 1) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, hits[0]),
        answer: want ? coinKey
          : { kind: 'tuple', expected: [answer, overOne(twinValue)], formPredicates: [NO_ROOT_BELOW], assumptions: [] },
        steps, visuals,
      });
    }
    case 'why': {
      if (d.kind !== 'rootnum' && d.k === 1n) return undefined; // a target "1" would also be worth 1
      const coinFirst = r.fork('why').bool();
      const shown = coinFirst ? mul(coin, math) : mul(math, coin);
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: 'Tap the 1 that changes the form, not the value.' },
        choices: tapTargets(shown, ['e.0', 'e.0.0', 'e.0.1', 'e.1', 'e.1.0', 'e.1.1'], coinFirst ? 'e.0' : 'e.1'),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps, visuals,
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [2, 4],
  interactions: ['forge', 'predict', 'strike', 'twin', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const d = draw(r.fork('params'), opts.difficulty);
      if (!d) return undefined;
      const p = item(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: stackedWidth }) ? p : undefined;
    });
  },
});
