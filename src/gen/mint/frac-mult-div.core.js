// @ts-check
// frac-mult-div (skill 5, DESIGN.md section 4): multiply fractions straight
// across; divide = multiply by the reciprocal, and the WHY is a form of 1.
// Built on the recipe in ../common.js, after frac-times-whole.core.js.
//
// Documented seed (pinned by test/gen/frac-mult-div.test.js):
//   EXAMPLE_SEED at d3: (2/3)/(4/5) = (2/3)(5/4) = 5/6.
//
// Difficulty (section 4 gives none per skill; my reading, reported):
//   d1  multiply two proper fractions, denominators 2..9, nothing cancels
//       (no numerator shares a factor with either denominator).
//   d2  multiply, a fraction may be improper (every number still 1..9), and
//       a numerator shares a factor with the OTHER denominator (it cancels).
//   d3  divide two proper fractions, denominators 2..9.
//   d4  divide with a whole number: n / (a/b) or (a/b) / n.
// A division is shown as a stacked fraction of fractions ((2/3)/(4/5)): the
// tree has no division sign, and the bar IS division.
// Never: a result of 0 or 1; a result that equals the sum of the two numbers
// (the "2 + 2 = 2 x 2" coincidence); a fraction not in lowest terms in the prompt.
//
// Interactions:
//   predict   "Multiply" / "Divide", typed; finished = one number (unreduced
//             accepted).
//   strike    the same, finished = one number in lowest terms.
//   twin      Multiply (d1-2): the product against ONE fraction. Same: the
//             unreduced (a c)/(b d) or the reduced value; Different: the
//             cross product (a d)/(b c). Reduced or not is drawn on its own
//             (scaled by 2 or 3, or reduced), independent of the verdict.
//             Follow-up key: the common value (no
//             form of 1 joins them; multiplying across does), or both values.
//             Divide (d3-4): the quotient against a PRODUCT of two fractions,
//             a whole number written n/1, so every twin has the same written
//             shape. Same: times the reciprocal of the divisor; Different:
//             no flip, the first flipped, both flipped. The Same pair IS
//             joined by one form of 1: quotient x (d/c)/(d/c) has the
//             product on top and (c/d)(d/c) = 1 underneath, so the follow-up
//             key is that form of 1 (answer kind form-of-1; the judge then
//             wants a typed form of 1 whose bottom times the divisor is 1).
//             No existing mal-rule produces these wrong partners (NEEDS FROM
//             OTHERS in the report); "same" on them is unclassified.
//   why       'hidden-1' (counting).
//             d1-2: cancelling is a hidden 1. (2/3)(3/4) = 6/12 is regrouped
//             as (3/3)(2/4); tap the form of 1. The Why draw always has a
//             factor to cancel, also at d1 (where the other items do not).
//             d3-4: why dividing by 4/5 is multiplying by 5/4. The check
//             multiplies the answer back by the divisor:
//             (2/3)((5/4)(4/5)); tap the form of 1 (the reciprocal pair).
//             The pair sits after or before the other factor, either order
//             inside. (The plainer display, the quotient times
//             ((5/4)/(5/4)), is too wide for a phone: 26 characters.)
// Every item carries the worked chain, with the multiply-across line
// (a x c)/(b x d). A division chain is forced from a form of 1: the quotient
// times (d/c)/(d/c), then tops and bottoms multiplied, then the bottom
// (c/d)(d/c) = 1 leaves the times-the-reciprocal line (each with a
// Step.reason). Those lines are measured stacked (stackedWidth); the harness
// re-checks with render/mathdom.js. The division Predict goal names the coin.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll,
  twinChoices, tapTargets, TWIN_SAME,
} from '../common.js';
import { num, mul, frac, group } from '../../math/ast.js';
import { q, gcd, add as qadd, mul as qmul, div as qdiv, qeq, ONE } from '../../math/rational.js';
import { constQ } from '../../math/evaluate.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { qNode } from '../../misc/kit.js';
import { malrules, ruleMatches } from '../../misc/diagnose.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {{ a: bigint; b: bigint }} Num  a/b; b = 1n is a whole number, shown without a bar */
/** @typedef {{ kind: 'mul' | 'div'; x: Num; y: Num; value: Q }} Params */

const GEN = Object.freeze({ id: 'frac-mult-div.core', version: 1, skill: 'frac-mult-div' });

/** makeRng(EXAMPLE_SEED) at difficulty 3 gives (2/3)/(4/5). Pinned by the test. */
export const EXAMPLE_SEED = 's86';

/** @param {Rng} r @param {number} lo @param {number} hi @param {boolean} improper @returns {Num | undefined} */
function fraction(r, lo, hi, improper) {
  const b = r.int(lo, hi);
  const a = r.int(1, improper ? 2 * b - 1 : b - 1);
  if (a === b || gcd(BigInt(a), BigInt(b)) !== 1n) return undefined;
  return { a: BigInt(a), b: BigInt(b) };
}

/** @param {Num} u */
const qOf = (u) => q(u.a, u.b);

/**
 * @param {Rng} r @param {number} d
 * @param {boolean} cancel the d1-2 Why: a numerator must share a factor with the other denominator
 * @returns {Params | undefined}
 */
export function draw(r, d, cancel) {
  /** @type {Num | undefined} */ let x;
  /** @type {Num | undefined} */ let y;
  /** @type {'mul' | 'div'} */ let kind;
  if (d <= 2) {
    kind = 'mul';
    const improper = d === 2 && !cancel;
    x = fraction(r, 2, 9, improper);
    y = fraction(r, 2, 9, improper);
    if (!x || !y || x.a > 9n || y.a > 9n) return undefined; // every number a times-table number
    const shares = gcd(x.a, y.b) > 1n || gcd(y.a, x.b) > 1n;
    if ((d === 2 || cancel) !== shares) return undefined;
  } else if (d === 3) {
    kind = 'div';
    x = fraction(r, 2, 9, false);
    y = fraction(r, 2, 9, false);
  } else {
    kind = 'div';
    const n = { a: BigInt(r.int(2, 12)), b: 1n };
    const f = fraction(r, 2, 9, false);
    if (!f) return undefined;
    if (r.bool()) { x = n; y = f; } else { x = f; y = { a: BigInt(r.int(2, 9)), b: 1n }; }
  }
  if (!x || !y) return undefined;
  const value = kind === 'mul' ? qmul(qOf(x), qOf(y)) : qdiv(qOf(x), qOf(y));
  if (value.n === 0n || qeq(value, ONE)) return undefined;
  if (qeq(value, qadd(qOf(x), qOf(y)))) return undefined; // "2 + 2 = 2 x 2"
  return { kind, x, y, value };
}

/** A number as shown in the prompt: a/b, or n. @param {Num} u @returns {Node} */
function shown(u) { return u.b === 1n ? num(u.a) : frac(num(u.a), num(u.b)); }
/** A number as a fraction, a whole number written n/1 (the Twin partners). @param {Num} u @returns {Node} */
function asFrac(u) { return frac(num(u.a), num(u.b)); }
/** @param {Num} u @returns {Num} */
function flip(u) { return { a: u.b, b: u.a }; }
/** A factor in a quotient: a fraction is grouped so it prints (2/3)/(4/5). @param {Num} u @returns {Node} */
function part(u) { return u.b === 1n ? num(u.a) : group(frac(num(u.a), num(u.b))); }

/** @param {Params} P @returns {Node} */
function promptOf(P) { return P.kind === 'mul' ? mul(shown(P.x), shown(P.y)) : frac(part(P.x), part(P.y)); }

/**
 * The worked chain. A division is FORCED from a form of 1 (review finding 7):
 * the quotient times (d/c)/(d/c), whose bottom (c/d)(d/c) is 1, so the
 * quotient IS the product with the reciprocal. Then multiply across.
 * @param {Params} P @returns {Step[]}
 */
function chain(P) {
  const { x, y } = P;
  /** @type {Step[]} */
  const out = [{ line: promptOf(P), legal: true }];
  const z = P.kind === 'mul' ? y : flip(y);
  if (P.kind === 'div') {
    const R = group(asFrac(z));
    out.push({ line: mul(promptOf(P), frac(R, R)), legal: true, reason: `Times ${print(asFrac(z))} over ${print(asFrac(z))}, a form of 1: the value does not change.` });
    out.push({ line: frac(mul(part(x), R), mul(part(y), R)), legal: true, reason: 'Multiply top by top and bottom by bottom.' });
    out.push({ line: mul(shown(x), shown(z)), legal: true, reason: `The bottom ${print(mul(shown(y), shown(z)))} is 1, so dividing by ${print(shown(y))} is multiplying by ${print(shown(z))}.` });
  }
  out.push({ line: frac(mul(num(x.a), num(z.a)), mul(num(x.b), num(z.b))), legal: true });
  const top = x.a * z.a;
  const bot = x.b * z.b;
  out.push({ line: bot === 1n ? num(top) : frac(num(top), num(bot)), legal: true });
  const v = qNode(P.value);
  if (print(v) !== print(out[out.length - 1].line)) out.push({ line: v, legal: true });
  return out;
}

/**
 * Characters drawn for a tree, a fraction stacked (as wide as its wider
 * part). The coin lines of a division chain are only narrow enough stacked;
 * the harness re-checks every tree with render/mathdom.js.
 * @param {Node} n @returns {number}
 */
function chars(n) {
  switch (n.t) {
    case 'num': return String(n.q.n).length + (n.q.d === 1n ? 0 : 1 + String(n.q.d).length);
    case 'group': return chars(n.arg) + 2;
    case 'mul': return n.args.reduce((s, a, i) => s + chars(a) + (i > 0 && a.t === 'num' ? 1 : 0), 0);
    case 'frac': return Math.max(chars(n.num), chars(n.den)) + 1;
    default: return print(n).length;
  }
}
/** @param {Node | import('../../../types.d.ts').Equation} e */
const stackedWidth = (e) => 16 * (e.t === 'eq' ? print(e).length : chars(e)) + 24;

/**
 * A Twin partner n/d written reduced (lowest terms) or not (n/d itself when it
 * is not in lowest terms, else scaled by 2 or 3). undefined when the reduced
 * form is a whole number or the partner is not a plain positive fraction.
 * @param {Node} x @param {boolean} reduced @param {Rng} r @returns {Node | undefined}
 */
function restyle(x, reduced, r) {
  if (x.t !== 'frac' || x.num.t !== 'num' || x.den.t !== 'num') return undefined;
  const n = x.num.q.n; const d = x.den.q.n;
  if (n <= 0n || d <= 0n || x.num.q.d !== 1n || x.den.q.d !== 1n) return undefined;
  const g = gcd(n, d);
  if (reduced) return d / g === 1n ? undefined : frac(num(n / g), num(d / g));
  if (g > 1n) return x;
  const m = BigInt(r.pick([2, 3]));
  return frac(num(n * m), num(d * m));
}

/** @param {Problem} p @param {boolean} equivalent @returns {string | undefined | null} null = reject */
function twinTag(p, equivalent) {
  const hits = malrules.filter((r) => ruleMatches(r, p, TWIN_SAME)).map((r) => r.id);
  if (hits.length === 0) return undefined;
  if (equivalent || hits.length > 1) return null;
  return hits[0];
}

/**
 * @param {Rng} r @param {Params} P @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, P, opts, seed) {
  const { x, y, value } = P;
  const math = promptOf(P);
  const steps = chain(P);
  const visuals = ['bars', 'numberline'];
  const valueNode = qNode(value);
  const verb = P.kind === 'mul' ? 'Multiply' : 'Divide';

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb, math, goal: 'Type the result in lowest terms.' },
        answer: { kind: 'expr', expected: valueNode, formPredicates: ['single-number', 'lowest-terms'], assumptions: [] },
        steps, visuals,
      });
    case 'predict': {
      const z = P.kind === 'mul' ? y : flip(y);
      const top = x.a * z.a;
      const bot = x.b * z.b;
      return makeProblem(GEN, seed, opts, {
        prompt: { verb, math, ...(P.kind === 'div' ? { goal: `Multiply by ${print(frac(group(asFrac(z)), group(asFrac(z))))}, a form of 1: the bottom becomes 1.` } : {}) },
        answer: { kind: 'expr', expected: bot === 1n ? num(top) : frac(num(top), num(bot)), formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
    }
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      /** @type {Node[]} */
      const pool = [];
      if (P.kind === 'mul') {
        if (want) {
          pool.push(frac(num(x.a * y.a), num(x.b * y.b)));
          if (value.d !== 1n && value.d !== x.b * y.b) pool.push(valueNode);
        } else {
          pool.push(frac(num(x.a * y.b), num(x.b * y.a))); // cross-multiplied
        }
      } else if (want) {
        pool.push(mul(asFrac(x), asFrac(flip(y))));
      } else {
        pool.push(mul(asFrac(x), asFrac(y)), mul(asFrac(flip(x)), asFrac(y)), mul(asFrac(flip(x)), asFrac(flip(y))));
      }
      // Multiply: reduced or not is drawn on its own, independent of Same /
      // Different (review finding 1: "unreduced partner" decided 70-80%).
      const reduced = tr.bool();
      const styled = P.kind === 'mul' ? pool.map((t) => restyle(t, reduced, tr)) : pool;
      const usable = /** @type {Node[]} */ (styled.filter((t) => { if (!t) return false; const tv = constQ(t); return tv !== undefined && (want || !qeq(tv, value)); }));
      if (usable.length === 0) return undefined;
      const twin = tr.pick(usable);
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const twinValue = /** @type {Q} */ (constQ(twin));
      const prompt = { verb: 'Same value?', math, twin };
      const recip = asFrac(flip(y));
      /** @type {Problem['answer']} */
      const answer = !want
        ? { kind: 'tuple', expected: [valueNode, qNode(twinValue)], formPredicates: ['single-number'], assumptions: [] }
        : P.kind === 'div'
          ? { kind: 'form-of-1', expected: frac(group(recip), group(recip)), formPredicates: [], assumptions: [] }
          : { kind: 'expr', expected: valueNode, formPredicates: ['single-number'], assumptions: [] };
      const base = makeProblem(GEN, seed, opts, { prompt, answer, steps, visuals });
      const tag = twinTag({ ...base, choices: twinChoices(prompt, want) }, want);
      if (tag === null) return undefined;
      return { ...base, choices: twinChoices(prompt, want, tag) };
    }
    case 'why': {
      const wr = r.fork('why');
      if (P.kind === 'mul') {
        // cancelling: (a c)/(b d) = (g/g) x ((a c / g)/(b d / g))
        const g = gcd(x.a, y.b) > 1n ? gcd(x.a, y.b) : gcd(y.a, x.b);
        const coin = frac(num(g), num(g));
        const rest = frac(num((x.a * y.a) / g), num((x.b * y.b) / g));
        const coinFirst = wr.bool();
        const shownMath = coinFirst ? mul(coin, rest) : mul(rest, coin);
        const c = coinFirst ? 0 : 1;
        return makeProblem(GEN, seed, opts, {
          variant: 'hidden-1',
          prompt: { verb: 'Tap the hidden 1', math: shownMath, goal: `${print(math)} = ${x.a * y.a}/${x.b * y.b}, regrouped. Tap the form of 1.` },
          choices: tapTargets(shownMath, ['e.0', 'e.1', `e.${c}.0`, `e.${1 - c}.1`].sort(), `e.${c}`),
          answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
          steps: [math, frac(num(x.a * y.a), num(x.b * y.b)), shownMath, rest].map((line) => ({ line, legal: true })),
          visuals: ['coin', ...visuals],
        });
      }
      // dividing by y is multiplying by 1/y: check by multiplying back by y
      const R = asFrac(flip(y));
      const pair = group(wr.bool() ? mul(R, shown(y)) : mul(shown(y), R));
      const pairLast = wr.bool();
      const shownMath = pairLast ? mul(shown(x), pair) : mul(pair, shown(x));
      const at = pairLast ? 'e.1' : 'e.0';
      const other = pairLast ? 'e.0' : 'e.1';
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: {
          verb: 'Tap the hidden 1', math: shownMath,
          goal: `Check ${print(math)} = ${print(mul(shown(x), R))}: multiply back by ${print(shown(y))}. Tap the form of 1.`,
        },
        choices: tapTargets(shownMath, [other, at, `${at}.0.0`, `${at}.0.1`].sort(), at),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps: [shownMath, pairLast ? mul(shown(x), group(num(1))) : mul(group(num(1)), shown(x)), shown(x)].map((line) => ({ line, legal: true })),
        visuals: ['coin', ...visuals],
      });
    }
    default:
      return undefined;
  }
}

/**
 * One rejection-sampling try (exported for the rejection-rate measurement in
 * the report; the generator itself is the default export).
 * @param {Rng} r @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
export function attempt(r, opts, seed) {
  const P = draw(r.fork('params'), opts.difficulty, opts.interaction === 'why');
  if (!P) return undefined;
  const p = item(r, P, opts, seed);
  return p && separated(p).ok && fitsAll(p, { estimate: stackedWidth }) ? p : undefined;
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['predict', 'strike', 'twin', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => attempt(r, opts, seed));
  },
});
