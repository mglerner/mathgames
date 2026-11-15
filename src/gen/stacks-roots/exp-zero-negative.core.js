// @ts-check
// exp-zero-negative (skill 20, DESIGN.md section 4): x^0 = 1 and
// x^-n = 1/x^n (x not 0), DERIVED from the quotient of powers (section 7
// "Derivations over rules"): xxx/xxx is 1 and is also x^(3 - 3) = x^0;
// xx/xxxxx is 1/xxx and is also x^(2 - 5) = x^-3. Built on the recipe in
// ../common.js, after src/gen/stacks-roots/sqrt-squared.core.js.
//
// Documented seeds (pinned by test/gen/exp-zero-negative.test.js):
//   EXAMPLE_SEED at d2, predict: "xx/xxxxx = 1/x^_" (key 3), the expansion
//     that forces x^(2 - 5) = 1/x^3.
//   TWIN_SEED at d2, twin: x^-3 against 1/x^3 (Same, keyed by the form of 1
//     x^3/x^3 that joins them: x^-3 x^3/x^3 = x^0/x^3).
//
// Difficulty (my reading, reported):
//   d1  the zero exponent: x^m/x^m = x^0; k x^0 = k; (k x)^0 = 1.
//   d2  negative exponents with x: x^m / x^n with m < n; x^-n = 1/x^n.
//   d3  negative exponents with numbers: 2^-3 = 1/8 (b^n <= 100, never 2^2:
//       2 + 2 = 2 x 2).
//   d4  coefficients and mixed: k x^-n = k/x^n against (k x)^-n = 1/(k^n x^n);
//       x^-a x^b, x^a / x^-b.
// The zero exponent makes 0 (and 1) the honest key of some d1 items
// ("x^4/x^4 = x^_" is 0); that is the content of the skill, reported.
//
// Interactions (I2 Next Line is not offered: none of the 19 mal-rules models
// x^0 = 0 or x^-n = -x^n, see the report):
//   twin      I5, box 0-1, with visuals. d1: k x^0 against k (Same), 0, 1;
//             (k x)^0 against 1 (Same) or k; (k x)^0 + j against j + 1 (Same),
//             j + k, j. (The follow-up key of a (k x)^0 pair is 1: the value
//             of the form, which is the content.) d2: x^-n against
//             1/x^n or x^a/x^(a+n) (Same, keyed by the form of 1 x^n/x^n or
//             x^(a+n)/x^(a+n) that joins them); Different: the flipped
//             quotient x^(a+n)/x^a and 1/x^(n+1) (written like the Same
//             partners), -x^n, -1/x^n. d3: the same with numbers (2^-3 against
//             1/8, 1/2^3; 1/6, 1/16, -8, 8); a d3 Same pair is keyed by the
//             common value, not a coin (review finding 11). d4: k x^-n and (k x)^-n against
//             k/x^n, 1/(k x^n), 1/(k^n x^n), k^n/x^n. A Different pair is keyed
//             by the first form's value at the x in the goal (numbers: both
//             values); "same" on it is untagged.
//   predict   I3 (constructed): the derivation step from the expansion:
//             "5xxx/(xxx) = _", "xxxx/(xxxx) = x^_", "xx/xxxxx = 1/x^_",
//             "2^2/2^5" to evaluate, "(1/(xxx))(xxxxx) = x^_".
//   strike    I8 (constructed): "x^4/x^4 = x^_", "7x^0 = _", "x^2/x^5 = x^_",
//             "1/x^4 = x^_", "Evaluate 2^-3", "(3x)^-2 = 1/(_x^2)".
//   why       I7 'hidden-1' (counting). d1: the step
//             (j/e) x^(a - b) x^(m - m): tap the 1 (x^(m - m) = x^0; the other
//             power has a computed exponent too, so the minus sign is no tell). d2: two products, (x^-3 x^3) and a
//             near miss (x^-2/x^2, x^-2 x^3); d3 with numbers ((2^-3)(8) and
//             (3^-2)(6), the 1 for a student who reads 3^-2 as 1/(3 x 2));
//             d4 two quotients, 3x^-2 / (3/x^2) or (3x)^-2 / (1/(9x^2))
//             against 2x^-2 / (1/(2x^2)) or (2x)^-2 / (1/(2x^2)).
// x is declared nonzero (and the goal says so) on every item with x.
//
// Mal-rules separated here: form-change-changes-value (2).

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, twinChoices, tapTargets,
  probeEnvs, blank, V_FILL_BLANK, DISPLAY_CAP_PX,
} from '../common.js';
import { num, mul, frac, add, neg, pow, group, v, eq, isEquation } from '../../math/ast.js';
import { q, gcd } from '../../math/rational.js';
import { evaluate } from '../../math/evaluate.js';
import { toQ } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { qNode, int } from '../../misc/kit.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../common.js').GenOpts} GenOpts */

const GEN = Object.freeze({ id: 'exp-zero-negative.core', version: 1, skill: 'exp-zero-negative' });

/** makeRng(EXAMPLE_SEED) at d2 predict gives "xx/xxxxx = 1/x^_". Pinned by the test. */
export const EXAMPLE_SEED = 's26';
/** makeRng(TWIN_SEED) at d2 twin gives x^-3 against 1/x^3. Pinned by the test. */
export const TWIN_SEED = 's15';

const VISUALS = ['coin', 'numberline'];
/** @type {Assumption[]} */
const NONZERO = [{ name: 'x', rel: 'nonzero' }];
const NOT_ZERO = ' x is not 0.';

// ---------------------------------------------------------------- small trees

const x = () => v('x');
/** n factors of x (x for n = 1). @param {number} n @returns {Node} */
function xs(n) { return n === 1 ? x() : mul(...Array.from({ length: n }, x)); }
/** x^n for any whole n (x for 1; a negative exponent as -n). @param {number} n @returns {Node} */
function xp(n) { return n === 1 ? x() : pow(x(), int(BigInt(n))); }
/** b^n for numbers (b for n = 1). @param {number} b @param {number} n @returns {Node} */
function bp(b, n) { return n === 1 ? num(b) : pow(num(b), int(BigInt(n))); }
/** c x^n (x^n for c = 1). @param {number} c @param {number} n @returns {Node} */
function cxp(c, n) { return c === 1 ? xp(n) : mul(num(c), xp(n)); }
/** (k x). @param {number} k */
const kx = (k) => group(mul(num(k), x()));

/** Exact value of n at x = p, or undefined. @param {Node} n @param {number} p @returns {Q | undefined} */
function valueAt(n, p) {
  const s = evaluate(n, { x: q(p) });
  return s ? toQ(s) : undefined;
}
/** Easy to read: numerator and denominator at most 256, and (unless allowed) not 0 or +-1. @param {Q | undefined} a @param {boolean} [unit] */
function goodValue(a, unit = false) {
  if (!a) return false;
  const mag = a.n < 0n ? -a.n : a.n;
  return mag <= 256n && a.d <= 256n && (unit || !(a.d === 1n && mag <= 1n));
}
/** @param {Q} a @param {Q} b */
const qsame = (a, b) => a.n === b.n && a.d === b.d;

// ---------------------------------------------------------------- display width

/**
 * Characters drawn for a tree, with a fraction stacked (as wide as its wider
 * part) and every exponent counted at full size. Pure and fixed.
 * @param {Node} n @returns {number}
 */
function chars(n) {
  switch (n.t) {
    case 'num': return String(n.q.n).length + (n.q.d === 1n ? 0 : 1 + String(n.q.d).length);
    case 'var': return 1;
    case 'group': return chars(n.arg) + 2;
    case 'neg': return 1 + chars(n.arg) + (n.arg.t === 'add' ? 2 : 0);
    case 'add': return n.args.reduce((s, a, i) => s + chars(a) + (i > 0 ? 3 : 0), 0);
    case 'mul': return n.args.reduce((s, a, i) => s + chars(a) + (a.t === 'add' || (i > 0 && a.t === 'neg') ? 2 : 0) + (i > 0 && startsNum(a) ? 1 : 0), 0);
    case 'frac': return Math.max(chars(n.num), chars(n.den));
    case 'pow': return chars(n.base) + (['num', 'var', 'group'].includes(n.base.t) ? 0 : 2) + chars(n.exp);
    case 'root': return 2 + chars(n.radicand);
  }
}
/** Is the first glyph of n a digit (mathdom then draws a dot before it)? @param {Node} n @returns {boolean} */
function startsNum(n) {
  if (n.t === 'num') return true;
  if (n.t === 'mul') return n.args.length > 0 && startsNum(n.args[0]);
  if (n.t === 'pow') return startsNum(n.base);
  if (n.t === 'frac') return startsNum(n.num);
  return false;
}
/**
 * The width estimate this file passes to fitsAll: 16px a character plus 24,
 * and an equation too wide for one line wraps at "=" (as common.js
 * conservativeWidth). The harness re-checks with render/mathdom.js.
 * @param {Node | Equation} e
 */
function stackedWidth(e) {
  const px = (/** @type {number} */ c) => 16 * c + 24;
  if (!isEquation(e)) return px(chars(e));
  const one = px(chars(e.lhs) + 3 + chars(e.rhs));
  return one <= DISPLAY_CAP_PX ? one : Math.max(px(chars(e.lhs)), px(chars(e.rhs))) + 32;
}

/** @param {Node[]} lines @returns {Step[]} */
const chain = (lines) => lines.map((line) => ({ line, legal: true }));

/** b^n <= 100 for d3 numbers (never 2^2). */
const NUM_POWERS = Object.freeze([[2, 3], [2, 4], [2, 5], [2, 6], [3, 2], [3, 3], [3, 4], [4, 2], [4, 3], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2]]);

// ---------------------------------------------------------------- twin pairs

/**
 * [first form, second form, the form of 1 that joins a Same pair (or undefined)].
 * @param {Rng} r @param {number} d
 * @param {boolean} want a Same pair; drawn once per seed so that rejection does not skew the half (section 3 I5)
 * @returns {[Node, Node, Node | undefined] | undefined}
 */
function twinPair(r, d, want) {
  if (d === 1) {
    // k x^0 is k; (k x)^0 is 1: the number on show matches the Same partner
    // in one family and the Different partner in the other
    const k = r.int(2, 9);
    const fam = r.pick(['coef', 'coef', 'all', 'plus']);
    if (fam === 'coef') return [mul(num(k), pow(x(), num(0))), want ? num(k) : num(r.pick([0, 1])), undefined];
    if (fam === 'all') return [pow(kx(k), num(0)), num(want ? 1 : k), undefined];
    const j = r.int(2, 9);
    const math = add(pow(kx(k), num(0)), num(j));
    return [math, num(want ? j + 1 : r.pick([j + k, j])), undefined];
  }
  /** den/den: the form of 1 joining a Same pair whose second form is a fraction. @param {Node} t */
  const coinOf = (t) => (t.t === 'frac' ? frac(structuredClone(t.den), structuredClone(t.den)) : undefined);
  if (d === 2) {
    const n = r.int(2, 4);
    const a = r.int(2, 4);
    const math = xp(-n);
    /** @type {Node} */ let twin;
    if (want) twin = r.bool() ? frac(num(1), xp(n)) : frac(xp(a), xp(a + n));
    else if (r.bool(0.75)) twin = r.pick([() => frac(xp(a + n), xp(a)), () => frac(num(1), xp(n + 1))])();
    else twin = r.pick([() => neg(xp(n)), () => neg(frac(num(1), xp(n)))])();
    return [math, twin, want ? coinOf(twin) : undefined];
  }
  if (d === 3) {
    const [b, n] = r.pick(NUM_POWERS);
    const math = bp(b, -n);
    /** @type {Node} */ let twin;
    if (want) twin = r.bool() ? frac(num(1), num(b ** n)) : frac(num(1), bp(b, n));
    else if (r.bool(0.8)) {
      if (b * n === b ** n || n + 1 > 6 || b ** (n + 1) > 256) return undefined;
      twin = r.pick([() => frac(num(1), num(b * n)), () => frac(num(1), bp(b, n + 1))])();
    } else twin = r.pick([() => neg(num(b ** n)), () => num(b ** n), () => neg(frac(num(1), num(b ** n)))])();
    return [math, twin, want ? coinOf(twin) : undefined];
  }
  const k = r.int(2, 3);
  const n = r.int(2, 3);
  if (k ** n > 27) return undefined;
  const powered = r.bool();
  const math = powered ? pow(kx(k), int(BigInt(-n))) : mul(num(k), xp(-n));
  const kOver = frac(num(k), xp(n)); // k/x^n: Same for k x^-n
  const allOver = frac(num(1), cxp(k ** n, n)); // 1/(k^n x^n): Same for (k x)^-n
  const kBelow = frac(num(1), cxp(k, n)); // 1/(k x^n): the power on x only, moved below
  const knOver = frac(num(k ** n), xp(n)); // k^n/x^n: the coefficient powered, left on top
  /** @type {Node} */ let twin;
  if (want) twin = powered ? allOver : kOver;
  else twin = r.bool(0.8) ? (powered ? kBelow : knOver) : r.pick(powered ? [kOver, knOver] : [kBelow, allOver]);
  return [math, twin, want ? coinOf(twin) : undefined];
}

// ---------------------------------------------------------------- items

/**
 * @param {Rng} r @param {GenOpts} opts @param {string} seed
 * @param {boolean} wantSame (twin only: a Same pair; drawn once per seed)
 * @returns {Problem | undefined}
 */
function item(r, opts, seed, wantSame) {
  const d = opts.difficulty;
  const numeric = d === 3;
  const as = numeric ? [] : NONZERO;
  const nz = numeric ? '' : NOT_ZERO;
  const env = numeric ? {} : { variableKeys: ['x'], probes: probeEnvs(['x']), assumptions: as };
  /** A fill-the-blank item. @param {Node} lhs @param {Node} rhs @param {number} key @param {string} goal @param {Node[]} lines */
  const fill = (lhs, rhs, key, goal, lines) => makeProblem(GEN, seed, opts, {
    variant: V_FILL_BLANK,
    prompt: { verb: 'Fill the blank', math: eq(lhs, rhs), goal: goal + nz },
    answer: { kind: 'expr', expected: int(BigInt(key)), formPredicates: ['integer'], assumptions: as },
    steps: chain(lines), visuals: VISUALS, ...env,
  });
  /** An evaluate item (numbers). @param {string} verb @param {Node} math @param {Node[]} lines */
  const value = (verb, math, lines) => {
    const val = valueAt(math, 2);
    if (!val) return undefined;
    return makeProblem(GEN, seed, opts, {
      prompt: { verb, math, goal: 'Write it as a single number.' },
      answer: { kind: 'expr', expected: qNode(val), formPredicates: ['single-number'], assumptions: [] },
      steps: chain([...lines, qNode(val)]), visuals: VISUALS,
    });
  };
  switch (opts.interaction) {
    case 'strike': {
      if (d === 1) {
        const m = r.int(2, 6);
        if (r.bool()) return fill(frac(xp(m), xp(m)), pow(x(), blank()), 0, 'Write it as one power of x.', [frac(xp(m), xp(m)), pow(x(), add(num(m), neg(num(m)))), pow(x(), num(0))]);
        const k = r.int(2, 9);
        return fill(mul(num(k), pow(x(), num(0))), blank(), k, 'Find its value.', [mul(num(k), pow(x(), num(0))), mul(num(k), frac(xp(m), xp(m))), num(k)]);
      }
      if (d === 2) {
        if (r.bool(0.6)) {
          const n = r.int(3, 7); const m = r.int(1, n - 2);
          return fill(frac(xp(m), xp(n)), pow(x(), blank()), m - n, 'Write it as one power of x.', [frac(xp(m), xp(n)), pow(x(), add(num(m), neg(num(n)))), xp(m - n)]);
        }
        const n = r.int(2, 6);
        return fill(frac(num(1), xp(n)), pow(x(), blank()), -n, 'Write it as one power of x.', [frac(num(1), xp(n)), frac(xp(0), xp(n)), pow(x(), add(num(0), neg(num(n)))), xp(-n)]);
      }
      if (d === 3) {
        const [b, n] = r.pick(NUM_POWERS);
        if (r.bool(0.7)) return value('Evaluate', bp(b, -n), [bp(b, -n), frac(num(1), bp(b, n))]);
        const k = r.int(2, 9);
        if (gcd(BigInt(k), BigInt(b)) !== 1n) return undefined;
        return value('Evaluate', mul(num(k), bp(b, -n)), [mul(num(k), bp(b, -n)), mul(num(k), frac(num(1), bp(b, n)))]);
      }
      const kind = r.pick(['prod', 'quot', 'coef']);
      if (kind === 'coef') {
        const k = r.int(2, 3); const n = r.int(2, 3);
        if (k ** n > 27) return undefined;
        const math = pow(kx(k), int(BigInt(-n)));
        return fill(math, frac(num(1), mul(blank(), xp(n))), k ** n, 'Write it with x^' + n + ' in the denominator.', [math, frac(num(1), pow(kx(k), num(n))), frac(num(1), cxp(k ** n, n))]);
      }
      const a = r.int(2, 6); const b = r.int(2, 6);
      const e = kind === 'prod' ? b - a : a + b;
      if (Math.abs(e) < 2) return undefined;
      const math = kind === 'prod' ? mul(xp(-a), xp(b)) : frac(xp(a), xp(-b));
      const mid = kind === 'prod' ? pow(x(), add(neg(num(a)), num(b))) : pow(x(), add(num(a), neg(int(BigInt(-b)))));
      return fill(math, pow(x(), blank()), e, 'Write it as one power of x.', [math, mid, xp(e)]);
    }
    case 'predict': {
      if (d === 1) {
        const m = r.int(2, 5);
        if (r.bool()) return fill(frac(xs(m), xs(m)), pow(x(), blank()), 0, 'How many factors of x are left?', [frac(xs(m), xs(m)), pow(x(), add(num(m), neg(num(m)))), pow(x(), num(0))]);
        const k = r.int(2, 9);
        const lhs = frac(mul(num(k), ...Array.from({ length: m }, x)), xs(m));
        return fill(lhs, blank(), k, 'Each x/x is worth 1. What is left?', [lhs, mul(num(k), frac(xs(m), xs(m))), num(k)]);
      }
      if (d === 2) {
        const n = r.int(3, 7); const m = r.int(1, n - 2);
        const lhs = frac(xs(m), xs(n));
        return fill(lhs, frac(num(1), pow(x(), blank())), n - m, 'Each x/x is worth 1. How many factors of x are left?', [lhs, frac(num(1), xs(n - m)), frac(num(1), xp(n - m))]);
      }
      if (d === 3) {
        const b = r.int(2, 5); const n = r.int(3, 6); const m = r.int(1, n - 2);
        if (b ** (n - m) > 100) return undefined;
        return value('Evaluate', frac(bp(b, m), bp(b, n)), [frac(bp(b, m), bp(b, n)), frac(num(1), bp(b, n - m))]);
      }
      const a = r.int(2, 5); const b = r.int(2, 6);
      if (Math.abs(b - a) < 2) return undefined;
      const lhs = r.bool() ? mul(frac(num(1), xs(a)), group(xs(b))) : mul(group(xs(b)), frac(num(1), xs(a)));
      return fill(lhs, pow(x(), blank()), b - a, 'Each x/x is worth 1. How many factors of x are left?', [lhs, frac(xs(b), xs(a)), xp(b - a)]);
    }
    case 'twin': {
      const pair = twinPair(r.fork('pair'), d, wantSame);
      if (!pair) return undefined;
      const [math, twin, coin] = pair;
      const want = equivExpr(math, twin, as).equal;
      if (want === undefined || (want && d >= 2 && !coin)) return undefined;
      if (numeric) {
        const a = valueAt(math, 2); const b = valueAt(twin, 2);
        if (!a || !b) return undefined;
        // the Same follow-up is the common value: the coin 49/49 joins 7^-2 and
        // 1/49 only for someone who already knows 7^-2 times 49 is 1 (review
        // finding 11)
        const prompt = { verb: 'Same value?', math, twin, goal: 'Same: their common value. Different: both values.' };
        return makeProblem(GEN, seed, opts, {
          prompt, choices: twinChoices(prompt, want),
          answer: want ? { kind: 'expr', expected: qNode(a), formPredicates: ['single-number'], assumptions: [] }
            : { kind: 'tuple', expected: [qNode(a), qNode(b)], formPredicates: ['single-number'], assumptions: [] },
          steps: chain([math, frac(num(1), bp(Number(/** @type {any} */ (math).base.q.n), Number(/** @type {any} */ (math).exp.arg.q.n))), qNode(a)]),
          visuals: VISUALS,
        });
      }
      const goods = r.shuffle([2, -2, 3, 5, -1]).filter((p) => {
        const a = valueAt(math, p); const b = valueAt(twin, p);
        return goodValue(a, d === 1) && b !== undefined && (want || !qsame(/** @type {Q} */ (a), b));
      });
      // the smallest arithmetic that does the job: a value of at most 64 when some x gives one
      const p0 = goods.find((p) => { const a = /** @type {Q} */ (valueAt(math, p)); return (a.n < 0n ? -a.n : a.n) <= 64n && a.d <= 64n; }) ?? goods[0];
      if (p0 === undefined) return undefined;
      const goal = d === 1
        ? `Find the first form's value at x = ${p0}.${nz}`
        : `Same: the form of 1 that joins them. Different: the first form's value at x = ${p0}.${nz}`;
      const prompt = { verb: 'Same value?', math, twin, goal };
      return makeProblem(GEN, seed, opts, {
        prompt, choices: twinChoices(prompt, want),
        answer: want && coin ? { kind: 'form-of-1', expected: coin, formPredicates: [], assumptions: as }
          : { kind: 'expr', expected: qNode(/** @type {Q} */ (valueAt(math, p0))), formPredicates: ['single-number'], assumptions: as },
        steps: chain(twinLines(math)), visuals: VISUALS, ...env,
      });
    }
    case 'why': {
      const wr = r.fork('why');
      if (d === 1) {
        // the step (j/e) x^(a - b) x^(m - m) of j x^a x^m / (e x^b x^m): the 1 is
        // x^(m - m); the other power is written the same way, so the minus sign
        // in the exponent does not point to it
        const j = wr.int(2, 9); const e = wr.int(2, 9); const m = wr.int(2, 5);
        const b = wr.int(1, 4); const n = wr.int(2, 4); const a = b + n;
        if (j === e || gcd(BigInt(j), BigInt(e)) !== 1n || a === m) return undefined;
        const one = pow(x(), add(num(m), neg(num(m))));
        const other = pow(x(), add(num(a), neg(num(b))));
        const order = wr.shuffle([0, 1, 2]);
        /** @type {Node[]} */ const slots = [];
        [frac(num(j), num(e)), other, one].forEach((f, i) => { slots[order[i]] = f; });
        const shown = mul(...slots);
        const at = order[2];
        return makeProblem(GEN, seed, opts, {
          variant: 'hidden-1',
          prompt: { verb: 'Tap the hidden 1', math: shown, goal: `One factor is worth exactly 1. Tap it.${nz}` },
          choices: tapTargets(shown, ['e.0', 'e.1', 'e.2', `e.${order[0]}.0`].sort(), `e.${at}`),
          answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: as },
          steps: chain([frac(mul(num(j), xp(a), xp(m)), mul(num(e), xp(b), xp(m))), mul(frac(num(j), num(e)), frac(xp(a), xp(b)), frac(xp(m), xp(m))), shown, mul(frac(num(j), num(e)), xp(n))]),
          visuals: VISUALS, ...env,
        });
      }
      const pair = whyPair(wr, d);
      if (!pair) return undefined;
      const [one, near] = pair;
      if (equivExpr(near, num(1), as).equal !== false || equivExpr(one, num(1), as).equal !== true) return undefined;
      const oneFirst = wr.bool();
      const shown = mul(oneFirst ? one : near, oneFirst ? near : one);
      const at = oneFirst ? 0 : 1;
      const f = wr.bool() ? at : 1 - at; // the two parts of the 1, or of the near miss, are the other targets
      const part = /** @type {any} */ ([oneFirst ? one : near, oneFirst ? near : one][f]).t === 'group' ? `e.${f}.0` : `e.${f}`;
      const nearVal = numeric ? qNode(/** @type {Q} */ (valueAt(near, 2))) : near;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: `One factor is worth exactly 1. Tap it.${nz}` },
        choices: tapTargets(shown, ['e.0', 'e.1', `${part}.0`, `${part}.1`].sort(), `e.${at}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: as },
        steps: chain([shown, nearVal]), visuals: VISUALS, ...env,
      });
    }
    default:
      return undefined;
  }
}

/** The worked chain of a twin's first form, through the expansion or the quotient. @param {Node} math @returns {Node[]} */
function twinLines(math) {
  // k x^0 -> k (x^2/x^2) -> k ; (k x)^0 + j -> 1 + j ; (k x)^0 -> (k x)^2/(k x)^2 -> 1 ; x^-n -> x^0/x^n -> 1/x^n ; k x^-n -> k/x^n ; (k x)^-n -> 1/(k x)^n
  const m = /** @type {any} */ (math);
  if (m.t === 'mul' && m.args[1].t === 'pow' && m.args[1].exp.t === 'num' && m.args[1].exp.q.n === 0n) {
    return [math, mul(m.args[0], frac(xp(2), xp(2))), m.args[0]];
  }
  if (m.t === 'add') return [math, add(num(1), m.args[1]), num(1n + m.args[1].q.n)];
  if (m.t === 'pow' && m.exp.t === 'num' && m.exp.q.n === 0n) {
    const k = Number(m.base.arg.args[0].q.n);
    return [math, frac(pow(kx(k), num(2)), pow(kx(k), num(2))), num(1)];
  }
  if (m.t === 'pow' && m.base.t === 'var') {
    const n = -Number(m.exp.arg.q.n);
    return [math, frac(xp(0), xp(-n)), frac(num(1), xp(-n))];
  }
  if (m.t === 'mul') {
    const n = Number(m.args[1].exp.arg.q.n);
    return [math, mul(m.args[0], frac(num(1), xp(n))), frac(m.args[0], xp(n))];
  }
  const n = Number(m.exp.arg.q.n);
  const k = Number(m.base.arg.args[0].q.n);
  return [math, frac(num(1), pow(kx(k), num(n))), frac(num(1), cxp(k ** n, n))];
}

/**
 * The hidden-1 Why products for d2-d4: [the one worth 1, the near miss], each
 * a bracketed product of two factors.
 * @param {Rng} r @param {number} d @returns {[Node, Node] | undefined}
 */
function whyPair(r, d) {
  if (d === 2) {
    const n = r.int(2, 5); const p = r.int(2, 5);
    const one = group(r.bool() ? mul(xp(-n), xp(n)) : mul(xp(n), xp(-n)));
    const near = r.pick([
      () => group(mul(xp(-p), xp(p + 1))), // x^1: one factor of x too many
      () => group(mul(xp(p), xp(-p - 1))),
      () => frac(xp(-p), xp(p)), // x^-2p: "they cancel"
    ])();
    return [one, near];
  }
  if (d === 3) {
    const [b, n] = r.pick(NUM_POWERS);
    const [c, m] = r.pick(NUM_POWERS);
    if (c * m === c ** m) return undefined;
    return [group(mul(bp(b, -n), num(b ** n))), group(mul(bp(c, -m), num(c * m)))]; // c^-m read as 1/(c m)
  }
  // d4: a quotient of two forms, worth 1 when the coefficient is handled right
  // (stacked, so it fits): 3x^-2 / (3/x^2) and (3x)^-2 / (1/(9x^2)) are 1;
  // the near misses are 1 only if j x^-p were 1/(j x^p), or (j x)^-p were
  // 1/(j x^p).
  const k = r.int(2, 3); const n = r.int(2, 3);
  const j = r.int(2, 3); const p = r.int(2, 3);
  if (k ** n > 27 || j ** p > 27) return undefined;
  const one = r.bool()
    ? frac(cxp(k, -n), frac(num(k), xp(n)))
    : frac(pow(kx(k), int(BigInt(-n))), frac(num(1), cxp(k ** n, n)));
  const near = r.bool()
    ? frac(cxp(j, -p), frac(num(1), cxp(j, p)))
    : frac(pow(kx(j), int(BigInt(-p))), frac(num(1), cxp(j, p)));
  return [one, near];
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['twin', 'predict', 'strike', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    const wantSame = rng.fork('same').bool();
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const p = item(r, opts, seed, wantSame);
      return p && separated(p).ok && fitsAll(p, { estimate: stackedWidth }) ? p : undefined;
    });
  },
});
