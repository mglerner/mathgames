// @ts-check
// order-of-ops (skill 7, DESIGN.md section 4): precedence, and an exponent
// binds to its base only (-3^2 = -(3^2) = -9, but (-3)^2 = 9). Built on the
// recipe in ../common.js. Products of numbers are drawn with a centered dot
// (render/mathdom.js); their printed keypad form is 3(4).
//
// Documented seed (pinned by test/gen/order-of-ops.test.js):
//   EXAMPLE_SEED at d3: -3^2 = -9.
//
// Difficulty (section 4 gives none per skill; my reading, reported):
//   d1  times before plus and minus, numbers 2..12 (the times table):
//       a + b c, a b + c, a - b c, a(b + c) (parentheses first), and
//       a - b + c (plus and minus left to right: not a - (b + c)).
//   d2  an exponent binds to its base: a b^2, a + b^2, a - b^2, (a + b)^2;
//       bases 2..9, exponent 2.
//   d3  a negative base: -a^2, (-a)^2, -a^2 + b, b - (-a)^2, and (-a)^3
//       (which equals -a^3); bases 2..9 (2..4 for cubes).
//   d4  several steps: (a + b)/c + d (the bar groups the top; the result is a
//       fraction), a - (b - c)^2, -a^2 + b c.
// Every result is other than 0 and 1, and a whole number except (a + b)/c + d.
//
// Interactions:
//   predict   "Evaluate" with the precedence reminder as the goal (the
//             scaffolded form); finished = one number.
//   strike    "Evaluate", no reminder; finished = one number in lowest terms.
//   twin      two pools, drawn per seed:
//             value: the expression against one number. Same: its value.
//               Different: the value under a real slip: left to right
//               ((2 + 3)4 for 2 + 3(4)), the exponent on the whole product or
//               sum, the exponent read as times (3^2 = 6), the minus inside
//               the square (-3^2 = 9), the square of a sum taken term by term,
//               (-3)^2 read as 2(3) with the sign right, b - (-a)^2 with the
//               exponent read as times. A slip whose sign differs from the
//               true value's is offered on 1 Different item in 4 only, so the
//               partner's sign does not settle the pair (review finding 2).
//             grouping (about 1 in 3 where the template has one): the
//               expression against itself with parentheses added. Same: the
//               parentheses go around what is done first anyway
//               (2 + (3(4)), -(3^2)); Different: around something else
//               ((2 + 3)(4), (-3)^2). Here the place of the parentheses IS
//               the concept, so the written shape settles the pair for anyone
//               who has the concept (reported).
//             A wrong partner that an existing mal-rule produces is tagged
//             with it (the Spreader on (a + b)^2 = a^2 + b^2, the Half-Hand
//             on a(b + c) = a b + c); the rest are unclassified. No form of
//             1 or 0 joins any pair, so the Same follow-up is the value and
//             the Different follow-up is both values.
//   why       'hidden-1' (counting): why (-3)^2 is positive. (-3)^2 =
//             (-3)(-3), regrouped as ((-1)(-1))(3)(3): tap the hidden 1 (the
//             two minus signs pair up into a 1; -3^2 = (-1)(3)(3) has only
//             one). Targets: the pair, a single (-1), a (3). The pair comes
//             first or last. Bases 2..9 at d1-2, 2..12 at d3-4. A d1-2 Why
//             previews the negative base, which the d1-2 items do not use.
// Every item carries the worked chain, with the invisible parentheses of
// precedence written in: 2 + 3(4) -> 2 + (3(4)) -> 2 + 12 -> 14.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll,
  twinChoices, tapTargets, TWIN_SAME,
} from '../common.js';
import { num, mul, frac, add, neg, group, pow } from '../../math/ast.js';
import { q, qeq, ONE } from '../../math/rational.js';
import { constQ } from '../../math/evaluate.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { qNode, int } from '../../misc/kit.js';
import { malrules, ruleMatches } from '../../misc/diagnose.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/**
 * @typedef {{
 *   math: Node; lines: Node[]; value: Q; misses: Q[];
 *   paren?: { same: Node; diff: Node };
 * }} Item
 */

const GEN = Object.freeze({ id: 'order-of-ops.core', version: 1, skill: 'order-of-ops' });

/** makeRng(EXAMPLE_SEED) at difficulty 3 gives -3^2. Pinned by the test. */
export const EXAMPLE_SEED = 's35';

const REMINDER = 'Order of operations: parentheses, powers, times and divide, then plus and minus, left to right.';

/** @param {number} x @returns {Node} */
const n = (x) => int(BigInt(x));
/** @param {number} x @returns {Q} */
const Q_ = (x) => q(BigInt(x));
/** @param {Node} b @param {number} e @returns {Node} */
const pw = (b, e) => pow(b, num(e));
/** @param {number} x @returns {Node} (-x) as a power base or factor */
const negBase = (x) => group(neg(num(x)));

/**
 * One template, by difficulty.
 * @param {Rng} r @param {number} d
 * @returns {Item | undefined}
 */
export function draw(r, d) {
  const N = (/** @type {number} */ lo, /** @type {number} */ hi) => r.int(lo, hi);
  const t = r.int(0, d === 1 ? 4 : d === 2 ? 3 : d === 3 ? 4 : 2);
  /** @type {Item} */
  let it;
  if (d === 1) {
    const [a, b, c] = [N(2, 12), N(2, 12), N(2, 12)];
    if (t === 0) { // a + b c
      it = {
        math: add(n(a), mul(n(b), n(c))), value: Q_(a + b * c), misses: [Q_((a + b) * c)],
        lines: [add(n(a), group(mul(n(b), n(c)))), add(n(a), n(b * c))],
        paren: { same: add(n(a), group(mul(n(b), n(c)))), diff: mul(group(add(n(a), n(b))), n(c)) },
      };
    } else if (t === 1) { // a b + c
      it = {
        math: add(mul(n(a), n(b)), n(c)), value: Q_(a * b + c), misses: [Q_(a * (b + c))],
        lines: [add(group(mul(n(a), n(b))), n(c)), add(n(a * b), n(c))],
        paren: { same: add(group(mul(n(a), n(b))), n(c)), diff: mul(n(a), group(add(n(b), n(c)))) },
      };
    } else if (t === 2) { // a - b c
      it = {
        math: add(n(a), neg(mul(n(b), n(c)))), value: Q_(a - b * c), misses: [Q_((a - b) * c)],
        lines: [add(n(a), neg(group(mul(n(b), n(c))))), add(n(a), neg(n(b * c)))],
        paren: { same: add(n(a), neg(group(mul(n(b), n(c))))), diff: mul(group(add(n(a), neg(n(b)))), n(c)) },
      };
    } else if (t === 4) { // a - b + c: plus and minus left to right (the a - (b + c) trap)
      it = {
        math: add(n(a), neg(n(b)), n(c)), value: Q_(a - b + c), misses: [Q_(a - (b + c))],
        lines: [add(group(add(n(a), neg(n(b)))), n(c)), add(int(BigInt(a - b)), n(c))],
        paren: { same: add(group(add(n(a), neg(n(b)))), n(c)), diff: add(n(a), neg(group(add(n(b), n(c))))) },
      };
    } else { // a(b + c)
      it = {
        math: mul(n(a), add(n(b), n(c))), value: Q_(a * (b + c)), misses: [Q_(a * b + c)],
        lines: [mul(n(a), group(n(b + c)))],
      };
    }
  } else if (d === 2) {
    const [a, b] = [N(2, 9), N(2, 9)];
    if (t === 0) { // a b^2
      it = {
        math: mul(n(a), pw(n(b), 2)), value: Q_(a * b * b), misses: [Q_(a * a * b * b), Q_(a * 2 * b)],
        lines: [mul(n(a), n(b * b))],
      };
    } else if (t === 1) { // a + b^2
      it = {
        math: add(n(a), pw(n(b), 2)), value: Q_(a + b * b), misses: [Q_((a + b) ** 2), Q_(a + 2 * b)],
        lines: [add(n(a), group(pw(n(b), 2))), add(n(a), n(b * b))],
        paren: { same: add(n(a), group(pw(n(b), 2))), diff: pw(group(add(n(a), n(b))), 2) },
      };
    } else if (t === 2) { // a - b^2
      it = {
        math: add(n(a), neg(pw(n(b), 2))), value: Q_(a - b * b), misses: [Q_((a - b) ** 2), Q_(a - 2 * b)],
        lines: [add(n(a), neg(group(pw(n(b), 2)))), add(n(a), neg(n(b * b)))],
        paren: { same: add(n(a), neg(group(pw(n(b), 2)))), diff: pw(group(add(n(a), neg(n(b)))), 2) },
      };
    } else { // (a + b)^2
      it = {
        math: pw(group(add(n(a), n(b))), 2), value: Q_((a + b) ** 2), misses: [Q_(a * a + b * b), Q_(a + b * b), Q_(2 * (a + b))],
        lines: [pw(group(n(a + b)), 2), mul(n(a + b), n(a + b))],
      };
    }
  } else if (d === 3) {
    if (t === 0) { // -a^2
      const a = N(2, 9);
      it = {
        math: neg(pw(n(a), 2)), value: Q_(-a * a), misses: [Q_(a * a), Q_(-2 * a)],
        lines: [neg(group(pw(n(a), 2))), neg(group(mul(n(a), n(a))))],
        paren: { same: neg(group(pw(n(a), 2))), diff: pw(negBase(a), 2) },
      };
    } else if (t === 1) { // (-a)^2
      const a = N(2, 9);
      it = {
        math: pw(negBase(a), 2), value: Q_(a * a), misses: [Q_(-a * a), Q_(-2 * a), Q_(2 * a)],
        lines: [mul(negBase(a), negBase(a))],
        paren: { same: mul(negBase(a), negBase(a)), diff: neg(pw(n(a), 2)) },
      };
    } else if (t === 2) { // -a^2 + b
      const [a, b] = [N(2, 9), N(2, 12)];
      it = {
        math: add(neg(pw(n(a), 2)), n(b)), value: Q_(b - a * a), misses: [Q_(a * a + b), Q_(b - 2 * a)],
        lines: [add(neg(group(pw(n(a), 2))), n(b)), add(neg(n(a * a)), n(b))],
        paren: { same: add(neg(group(pw(n(a), 2))), n(b)), diff: add(pw(negBase(a), 2), n(b)) },
      };
    } else if (t === 3) { // b - (-a)^2
      const [a, b] = [N(2, 9), N(2, 12)];
      it = {
        math: add(n(b), neg(pw(negBase(a), 2))), value: Q_(b - a * a), misses: [Q_(b + a * a), Q_((b + a) ** 2), Q_(b - 2 * a)],
        lines: [add(n(b), neg(group(mul(negBase(a), negBase(a))))), add(n(b), neg(n(a * a)))],
      };
    } else { // (-a)^3
      const a = N(2, 4);
      it = {
        math: pw(negBase(a), 3), value: Q_(-(a ** 3)), misses: [Q_(a ** 3), Q_(-3 * a)],
        lines: [mul(negBase(a), negBase(a), negBase(a))],
        paren: { same: neg(pw(n(a), 3)), diff: pw(n(a), 3) },
      };
    }
  } else if (t === 0) { // (a + b)/c + d: a is a multiple of c, b is not
    // The bar groups the whole top. The result is a fraction: when the top
    // is a multiple of c, either both terms cancel or neither does, so a
    // whole-number result would leave nothing for "cancel one term" to do.
    const c = N(2, 6);
    const a = c * N(1, 4);
    const b = N(1, 9);
    const dd = N(2, 9);
    if (b % c === 0) return undefined;
    const s = a + b;
    it = {
      math: add(frac(group(add(n(a), n(b))), n(c)), n(dd)), value: q(BigInt(s + dd * c), BigInt(c)),
      misses: [Q_(a / c + b + dd), q(BigInt(a * c + b + dd * c), BigInt(c)), q(BigInt(s), BigInt(c + dd))],
      lines: [add(frac(n(s), n(c)), n(dd)), add(frac(n(s), n(c)), frac(n(dd * c), n(c))), frac(n(s + dd * c), n(c))],
    };
  } else if (t === 1) { // a - (b - c)^2
    const [a, b, c] = [N(2, 20), N(2, 9), N(2, 9)];
    if (Math.abs(b - c) < 2) return undefined; // a base of 0, 1 or -1 squares to nothing to see
    it = {
      math: add(n(a), neg(pw(group(add(n(b), neg(n(c)))), 2))), value: Q_(a - (b - c) ** 2), misses: [Q_((a - b + c) ** 2), Q_(a - (b - c) * 2)],
      lines: [add(n(a), neg(pw(group(n(b - c)), 2))), add(n(a), neg(n((b - c) ** 2)))],
    };
  } else { // -a^2 + b c
    const [a, b, c] = [N(2, 9), N(2, 9), N(2, 9)];
    it = {
      math: add(neg(pw(n(a), 2)), mul(n(b), n(c))), value: Q_(b * c - a * a), misses: [Q_(a * a + b * c), Q_((b - a * a) * c)],
      lines: [add(neg(group(pw(n(a), 2))), group(mul(n(b), n(c)))), add(neg(n(a * a)), n(b * c))],
    };
  }
  if (it.value.n === 0n || qeq(it.value, ONE)) return undefined;
  const big = (/** @type {Q} */ x) => x.n > 200n || x.n < -200n;
  if (big(it.value)) return undefined;
  it.misses = it.misses.filter((m) => !qeq(m, it.value) && m.n !== 0n && !qeq(m, ONE) && !big(m));
  return it;
}

/** @param {Problem} p @param {boolean} equivalent @returns {string | undefined | null} null = reject */
function twinTag(p, equivalent) {
  const hits = malrules.filter((rule) => ruleMatches(rule, p, TWIN_SAME)).map((rule) => rule.id);
  if (hits.length === 0) return undefined;
  if (equivalent || hits.length > 1) return null;
  return hits[0];
}

/**
 * @param {Rng} r @param {Item} I @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, I, opts, seed) {
  const { math, value } = I;
  const valueNode = qNode(value);
  /** @type {Node[]} */
  const lines = [math, ...I.lines];
  if (print(lines[lines.length - 1]) !== print(valueNode)) lines.push(valueNode);
  const steps = lines.map((line) => ({ line, legal: true }));
  const visuals = opts.difficulty === 1 ? ['numberline'] : ['squareplot', 'numberline'];

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Evaluate', math },
        answer: { kind: 'expr', expected: valueNode, formPredicates: ['single-number', 'lowest-terms'], assumptions: [] },
        steps, visuals,
      });
    case 'predict':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Evaluate', math, goal: REMINDER },
        answer: { kind: 'expr', expected: valueNode, formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      const grouping = I.paren !== undefined && tr.bool(1 / 3);
      /** @type {Node} */
      let twin;
      if (grouping && I.paren) {
        twin = want ? I.paren.same : I.paren.diff;
      } else if (want) {
        twin = valueNode;
      } else {
        if (I.misses.length === 0) return undefined;
        // a slip whose sign differs from the true value's is offered on 1
        // Different item in 4 only: the partner's sign against the item's
        // look must not settle the pair (review finding 2, d3: 76%)
        const slipOk = tr.bool(1 / 4);
        const pool = slipOk ? I.misses : I.misses.filter((m) => (m.n < 0n) === (value.n < 0n));
        if (pool.length === 0) return undefined;
        twin = qNode(tr.pick(pool));
      }
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const twinValue = constQ(twin);
      if (!twinValue || twinValue.n === 0n || qeq(twinValue, ONE)) return undefined;
      const prompt = { verb: 'Same value?', math, twin };
      const base = makeProblem(GEN, seed, opts, {
        prompt,
        answer: want ? { kind: 'expr', expected: valueNode, formPredicates: ['single-number'], assumptions: [] }
          : { kind: 'tuple', expected: [valueNode, qNode(twinValue)], formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
      const tag = twinTag({ ...base, choices: twinChoices(prompt, want) }, want);
      if (tag === null) return undefined;
      return { ...base, choices: twinChoices(prompt, want, tag) };
    }
    default:
      return undefined;
  }
}

/**
 * The Why: (-b)^2 = (-b)(-b) = ((-1)(-1))(b)(b); tap the hidden 1.
 * @param {Rng} r @param {GenOpts} opts @param {string} seed
 * @returns {Problem}
 */
function whyItem(r, opts, seed) {
  const b = r.int(2, opts.difficulty <= 2 ? 9 : 12);
  const one = group(neg(num(1)));
  const pair = group(mul(one, one));
  const pairFirst = r.bool();
  const shown = pairFirst ? mul(pair, group(num(b)), group(num(b))) : mul(group(num(b)), group(num(b)), pair);
  const at = pairFirst ? 'e.0' : 'e.2';
  const start = pw(negBase(b), 2);
  const lines = [start, mul(negBase(b), negBase(b)), shown, mul(group(num(1)), group(num(b * b))), num(b * b)];
  return makeProblem(GEN, seed, opts, {
    variant: 'hidden-1',
    prompt: { verb: 'Tap the hidden 1', math: shown, goal: `${print(start)} = (-${b})(-${b}), regrouped. Tap the hidden 1.` },
    choices: tapTargets(shown, [at, `${at}.0.0`, pairFirst ? 'e.1' : 'e.0'].sort(), at),
    answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
    steps: lines.map((line) => ({ line, legal: true })),
    visuals: ['coin', 'numberline'],
  });
}

/**
 * One rejection-sampling try (exported for the rejection-rate measurement in
 * the report; the generator itself is the default export).
 * @param {Rng} r @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
export function attempt(r, opts, seed) {
  if (opts.interaction === 'why') {
    const p = whyItem(r.fork('why'), opts, seed);
    return fitsAll(p) ? p : undefined;
  }
  const I = draw(r.fork('params'), opts.difficulty);
  if (!I) return undefined;
  const p = item(r, I, opts, seed);
  return p && separated(p).ok && fitsAll(p) ? p : undefined;
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
