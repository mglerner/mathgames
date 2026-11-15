// @ts-check
// exp-product-quotient (skill 18, DESIGN.md section 4): x^m x^n = x^(m+n)
// and x^m / x^n = x^(m-n), each DERIVED from the expansion (section 7
// "Derivations over rules"): (xx)(xxx) has 2 + 3 factors; xxxxx/xx is
// (xxx)(xx/xx), three factors and a hidden 1. Built on the recipe in
// ../common.js, after src/gen/stacks-roots/sqrt-squared.core.js.
//
// Documented seeds (pinned by test/gen/exp-product-quotient.test.js):
//   EXAMPLE_SEED at d1, predict: "(xx)(xxx) = x^_" (key 5), the section 7
//     expansion text "xx . xxx".
//   QUOTIENT_SEED at d2, why: a worked step of k x^m / (e x^n) with its
//     hidden 1, x^n/x^n.
//
// Difficulty (my reading, reported):
//   d1  product x^m x^n, m, n in 2..5, m + n <= 9 (never 2 + 2 = 2 x 2).
//   d2  quotient x^m / x^n, n in 2..4, m - n >= 2, m <= 9 (never 4/2 = 4 - 2).
//   d3  the invisible exponent 1 (x x^n, x^n / x), or coefficients: the
//       coefficients multiply (divide), the exponents add (subtract):
//       (3x^2)(4x^5) = 12x^7, 12x^7 / (3x^2) = 4x^5.
//   d4  three powers, x^a x^b / x^c (c is neither a nor b).
// The quotient's result exponent is always 2 or more: zero and negative
// exponents are skill 20 (exp-zero-negative).
//
// Interactions (I2 Next Line is not offered: its distractors must be
// mal-rule outputs and none of the 19 models a product or quotient bug, see
// the report):
//   twin      I5, box 0-1, with visuals. Product: x^m x^n against x^k,
//             Same for k = m + n; Different for k = m n (exponents
//             multiplied) or k = m + n +- 1, written the same way. Quotient:
//             x^k against x^m / x^n: Same for k = m - n, keyed by the form of
//             1 that joins them, x^n/x^n (x^k x^n/x^n = x^m/x^n); Different
//             for k = m / n (exponents divided), m + n, m - n +- 1. d3 also
//             the bare x read as x^0 (x x^4 against x^4) and the coefficients
//             added instead of multiplied. Different pairs are keyed by the
//             first form's value at the x named in the goal; "same" on them is
//             untagged (no section 5 mal-rule models these bugs).
//   predict   I3 (constructed): the derivation step, from the expansion:
//             "(xx)(xxx) = x^_", "xxxxx/xx = x^_", "(3xx)(4xxx) = _x^5".
//   strike    I8 (constructed): the rule, symbol-only: "x^2 x^3 = x^_",
//             "12x^7/(3x^2) = 4x^_" (a blank for the exponent or the
//             coefficient; never the whole power, see the report).
//   why       I7 'hidden-1' (counting): the worked step
//             (k/e) x^(m-n) (x^n/x^n) of k x^m / (e x^n), factors in any
//             order. Two fractions; tap the one worth 1.
// x is declared nonzero (and the goal says so) on every item with x in a
// denominator.
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
import { qNode } from '../../misc/kit.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../common.js').GenOpts} GenOpts */

const GEN = Object.freeze({ id: 'exp-product-quotient.core', version: 1, skill: 'exp-product-quotient' });

/** makeRng(EXAMPLE_SEED) at d1 predict gives "(xx)(xxx) = x^_". Pinned by the test. */
export const EXAMPLE_SEED = 's7';
/** makeRng(QUOTIENT_SEED) at d2 why gives a quotient step with its hidden 1. Pinned by the test. */
export const QUOTIENT_SEED = 's0';

const PRODUCT_VISUALS = ['squareplot', 'numberline'];
const QUOTIENT_VISUALS = ['coin', 'numberline'];
/** @type {Assumption[]} */
const NONZERO = [{ name: 'x', rel: 'nonzero' }];
const NOT_ZERO = ' x is not 0.';

// ---------------------------------------------------------------- small trees

const x = () => v('x');
/** n factors of x (n = 1 gives x). @param {number} n @returns {Node} */
function xs(n) { return n === 1 ? x() : mul(...Array.from({ length: n }, x)); }
/** x^n (x for n = 1). @param {number} n @returns {Node} */
function xp(n) { return n === 1 ? x() : pow(x(), num(n)); }
/** c x^n (x^n for c = 1). @param {number} c @param {number} n @returns {Node} */
function cxp(c, n) { return c === 1 ? xp(n) : mul(num(c), xp(n)); }
/** x^(a + b) or x^(a - b): the exponent arithmetic shown. @param {number} a @param {number} b @param {boolean} minus */
function xArith(a, b, minus) { return pow(x(), add(num(a), minus ? neg(num(b)) : num(b))); }

/** Exact value of n at x = p, or undefined. @param {Node} n @param {number} p @returns {Q | undefined} */
function valueAt(n, p) {
  const s = evaluate(n, { x: q(p) });
  return s ? toQ(s) : undefined;
}
/** Easy to read and not a guess: not 0 or +-1, at most 243. @param {Q | undefined} a */
function goodValue(a) {
  if (!a) return false;
  const mag = a.n < 0n ? -a.n : a.n;
  return mag <= 243n && a.d <= 243n && !(a.d === 1n && mag <= 1n);
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

// ---------------------------------------------------------------- the draw

/**
 * One item's numbers. kind:
 *   prod   x^m x^n           quot   x^m / x^n
 *   cprod  (a x^m)(b x^n)    cquot  (a b x^m) / (a x^n)
 *   three  x^m x^n / x^c
 * m or n is 1 for the d3 invisible exponent.
 * @typedef {{ kind: 'prod' | 'quot' | 'cprod' | 'cquot' | 'three'; m: number; n: number; a: number; b: number; c: number }} Params
 */

/** @param {Rng} r @param {number} d @returns {Params | undefined} */
function draw(r, d) {
  const base = { a: 1, b: 1, c: 0 };
  if (d === 1) {
    const m = r.int(2, 5);
    const n = r.int(2, 5);
    if (m + n > 9 || (m === 2 && n === 2)) return undefined;
    return { kind: 'prod', m, n, ...base };
  }
  if (d === 2) {
    const n = r.int(2, 4);
    const m = r.int(n + 2, 9);
    if (m === 4 && n === 2) return undefined;
    return { kind: 'quot', m, n, ...base };
  }
  if (d === 3) {
    const kind = r.pick(['prod', 'quot', 'cprod', 'cquot']);
    if (kind === 'prod') { const n = r.int(2, 7); return r.bool() ? { kind, m: 1, n, ...base } : { kind, m: n, n: 1, ...base }; }
    if (kind === 'quot') return { kind, m: r.int(3, 8), n: 1, ...base };
    const a = r.int(2, 9);
    const b = r.int(2, 9);
    if (a * b > 81 || a === b) return undefined;
    if (kind === 'cprod') {
      const m = r.int(1, 5);
      const n = r.int(2, 5);
      if (m + n > 8) return undefined;
      return { kind, m, n, a, b, c: 0 };
    }
    const n = r.int(1, 4);
    return { kind, m: r.int(n + 2, 8), n, a, b, c: 0 };
  }
  const m = r.int(2, 6);
  const n = r.int(2, 6);
  const c = r.int(2, 6);
  if (m + n > 10 || m + n - c < 2 || c === m || c === n) return undefined; // x^3 x^2 / x^2 cancels on sight
  return { kind: 'three', m, n, a: 1, b: 1, c };
}

/** The exponent of the result. @param {Params} p */
function resultExp(p) {
  if (p.kind === 'prod' || p.kind === 'cprod') return p.m + p.n;
  if (p.kind === 'three') return p.m + p.n - p.c;
  return p.m - p.n;
}
/** The coefficient of the result. @param {Params} p */
const resultCoef = (p) => (p.kind === 'cprod' ? p.a * p.b : p.kind === 'cquot' ? p.b : 1);
/** Is x in a denominator? @param {Params} p */
const isQuot = (p) => p.kind === 'quot' || p.kind === 'cquot' || p.kind === 'three';

/** The prompt form. @param {Params} p @returns {Node} */
function form(p) {
  switch (p.kind) {
    case 'prod': return mul(xp(p.m), xp(p.n));
    case 'quot': return frac(xp(p.m), xp(p.n));
    case 'cprod': return mul(cxp(p.a, p.m), cxp(p.b, p.n));
    case 'cquot': return frac(cxp(p.a * p.b, p.m), cxp(p.a, p.n));
    case 'three': return frac(mul(xp(p.m), xp(p.n)), xp(p.c));
  }
}

/** The worked chain from the prompt form to the result, through the expansion. @param {Params} p @returns {Node[]} */
function chainOf(p) {
  const k = resultExp(p);
  const out = [form(p)];
  switch (p.kind) {
    case 'prod':
      out.push(mul(group(xs(p.m)), group(xs(p.n))), xs(k), xp(k));
      break;
    case 'quot':
      out.push(frac(xs(p.m), xs(p.n)), mul(group(xs(k)), frac(xs(p.n), xs(p.n))), xp(k));
      break;
    case 'cprod':
      out.push(mul(group(mul(num(p.a), num(p.b))), group(mul(xp(p.m), xp(p.n)))), mul(num(p.a * p.b), xArith(p.m, p.n, false)), cxp(p.a * p.b, k));
      break;
    case 'cquot':
      out.push(mul(frac(num(p.a * p.b), num(p.a)), frac(xp(p.m), xp(p.n))), mul(num(p.b), xArith(p.m, p.n, true)), cxp(p.b, k));
      break;
    case 'three':
      out.push(frac(xArith(p.m, p.n, false), xp(p.c)), xArith(p.m + p.n, p.c, true), xp(k));
      break;
  }
  return out;
}

/** @param {Node[]} lines @returns {Step[]} */
const chain = (lines) => lines.map((line) => ({ line, legal: true }));

// ---------------------------------------------------------------- items

/**
 * The Twin pair: [first form, second form, joining form of 1 or undefined].
 * @param {Rng} r @param {Params} p @returns {[Node, Node, Node | undefined] | undefined}
 */
function twinPair(r, p) {
  const want = r.bool();
  const k = resultExp(p);
  const c = resultCoef(p);
  // a wrong exponent: never 1 (x^1 would be the only bare x), never past 8 (no x gives a small value)
  /** @param {number[]} ks @returns {number | undefined} */
  const wrong = (ks) => {
    const usable = (/** @type {number[]} */ es) => es.filter((e) => e >= 2 && e <= 8 && e !== k);
    const ok = usable(ks).length ? usable(ks) : usable([k - 1, k + 1]); // fall back to a count off by one
    return ok.length ? r.pick(ok) : undefined;
  };
  if (p.kind === 'prod' || p.kind === 'cprod') {
    let cc = c;
    let kk = k;
    if (!want) {
      if (p.kind === 'cprod' && r.bool()) cc = p.a + p.b; // coefficients added
      else {
        const bare = p.m === 1 || p.n === 1;
        const e = wrong(bare && r.bool(0.6) ? [k - 1] : r.bool(0.6) ? [p.m * p.n] : [k - 1, k + 1]);
        if (e === undefined) return undefined;
        kk = e;
      }
    }
    const pair = /** @type {[Node, Node]} */ ([form(p), cxp(cc, kk)]);
    if (r.bool()) pair.reverse();
    return [...pair, undefined];
  }
  // a quotient: x^k against the quotient, joined by the form of 1 den/den
  const twin = form(p);
  if (want) return [cxp(c, k), twin, frac(structuredClone(/** @type {any} */ (twin).den), structuredClone(/** @type {any} */ (twin).den))];
  const top = p.kind === 'three' ? p.m + p.n : p.m;
  const bottom = p.kind === 'three' ? p.c : p.n;
  const divided = top % bottom === 0 ? [top / bottom] : [];
  const e = wrong(r.bool(0.6) && divided.length ? divided : p.kind === 'three' && r.bool() ? [p.m * p.n - p.c] : [top + bottom, k - 1, k + 1]);
  if (e === undefined) return undefined;
  return [cxp(c, e), twin, undefined];
}

/**
 * @param {Rng} r @param {Params} pr @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, pr, opts, seed) {
  const k = resultExp(pr);
  const c = resultCoef(pr);
  const quot = isQuot(pr);
  const as = quot ? NONZERO : [];
  const nz = quot ? NOT_ZERO : '';
  const visuals = quot ? QUOTIENT_VISUALS : PRODUCT_VISUALS;
  const env = { variableKeys: ['x'], probes: probeEnvs(['x']), assumptions: as };
  const lines = chainOf(pr);
  switch (opts.interaction) {
    case 'strike': case 'predict': {
      /** @type {Node} */ let lhs;
      if (opts.interaction === 'strike') lhs = form(pr);
      else if (pr.kind === 'prod') lhs = mul(group(xs(pr.m)), group(xs(pr.n)));
      else if (pr.kind === 'quot') lhs = frac(xs(pr.m), xs(pr.n));
      else if (pr.kind === 'three') lhs = frac(mul(group(xs(pr.m)), group(xs(pr.n))), xs(pr.c));
      else if (pr.kind === 'cprod') lhs = mul(group(mul(num(pr.a), xs(pr.m))), group(mul(num(pr.b), xs(pr.n))));
      else lhs = frac(mul(num(pr.a * pr.b), xs(pr.m)), mul(num(pr.a), xs(pr.n)));
      // the blank: the exponent, or (coefficients) the coefficient on about half
      const onCoef = c > 1 && r.bool();
      const rhs = onCoef ? mul(blank(), xp(k)) : c > 1 ? mul(num(c), pow(x(), blank())) : pow(x(), blank());
      return makeProblem(GEN, seed, opts, {
        variant: V_FILL_BLANK,
        prompt: { verb: 'Fill the blank', math: eq(lhs, rhs), goal: (opts.interaction === 'predict' ? 'Count the factors of x.' : 'Write it as one power of x.') + nz },
        answer: { kind: 'expr', expected: num(onCoef ? c : k), formPredicates: ['integer'], assumptions: as },
        steps: chain(opts.interaction === 'predict' ? [lhs, lines[lines.length - 1]] : lines), visuals, ...env,
      });
    }
    case 'twin': {
      const pair = twinPair(r.fork('pair'), pr);
      if (!pair) return undefined;
      const [math, twin, coin] = pair;
      const want = equivExpr(math, twin, as).equal;
      if (want === undefined || (want && quot && !coin)) return undefined;
      const goods = r.shuffle([2, -2, 3, 5, -1]).filter((p) => {
        const a = valueAt(math, p);
        const b = valueAt(twin, p);
        return goodValue(a) && b !== undefined && (want || !qsame(/** @type {Q} */ (a), b));
      });
      // the smallest arithmetic that does the job: a value of at most 64 when some x gives one
      const p0 = goods.find((p) => { const a = /** @type {Q} */ (valueAt(math, p)); return (a.n < 0n ? -a.n : a.n) <= 64n && a.d <= 64n; }) ?? goods[0];
      if (p0 === undefined) return undefined;
      const goal = quot
        ? `Same: the form of 1 that joins them. Different: the first form's value at x = ${p0}.${nz}`
        : `Find the first form's value at x = ${p0}.`;
      const prompt = { verb: 'Same value?', math, twin, goal };
      return makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want),
        answer: want && coin
          ? { kind: 'form-of-1', expected: coin, formPredicates: [], assumptions: as }
          : { kind: 'expr', expected: qNode(/** @type {Q} */ (valueAt(math, p0))), formPredicates: ['single-number'], assumptions: as },
        steps: chain(lines), // the true chain of the product or quotient in the pair
        visuals, ...env,
      });
    }
    case 'why': {
      // the worked step of k x^M / (e x^N): (k/e) x^(M-N) (x^N/x^N), in any order
      const wr = r.fork('why');
      const N = opts.difficulty === 3 ? 1 : wr.int(2, opts.difficulty === 1 ? 3 : 4);
      const left = wr.int(2, opts.difficulty === 1 ? 3 : 5);
      const M = N + left;
      const kk = wr.int(2, 9);
      const e = wr.int(2, 9);
      if (kk === e || gcd(BigInt(kk), BigInt(e)) !== 1n) return undefined;
      const ratio = frac(num(kk), num(e));
      const one = frac(xp(N), xp(N));
      const order = wr.shuffle([0, 1, 2]); // order[i] = the slot of factor i (ratio, power, one)
      /** @type {Node[]} */
      const slots = [];
      [ratio, xp(left), one].forEach((f, i) => { slots[order[i]] = f; });
      const shown = mul(...slots);
      const at = order[2];
      const inner = wr.bool() ? at : order[0]; // the parts of the 1 or of k/e are the fourth target
      const start = frac(cxp(kk, M), cxp(e, N));
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: `A step of dividing powers. One factor is worth exactly 1. Tap it.${NOT_ZERO}` },
        choices: tapTargets(shown, ['e.0', 'e.1', 'e.2', `e.${inner}.0`].sort(), `e.${at}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: NONZERO },
        steps: chain([start, mul(frac(num(kk), num(e)), frac(xs(M), xs(N))), shown, mul(frac(num(kk), num(e)), xp(left))]),
        visuals: QUOTIENT_VISUALS, ...env, assumptions: NONZERO,
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['twin', 'predict', 'strike', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const d = draw(r.fork('params'), opts.difficulty);
      if (!d) return undefined;
      if (opts.interaction === 'predict' && d.kind === 'cquot') return undefined; // its expansion is too wide; cprod carries d3
      const p = item(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: stackedWidth }) ? p : undefined;
    });
  },
});
