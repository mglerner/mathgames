// @ts-check
// exp-meaning (skill 17, DESIGN.md section 4): x^n means n factors of x,
// written out as expansion text (section 7: "xx . xxx"). Built on the recipe
// in ../common.js, after src/gen/stacks-roots/sqrt-squared.core.js.
//
// Documented seeds (pinned by test/gen/exp-meaning.test.js):
//   EXAMPLE_SEED at d1, predict: the expansion count "xxxxx = x^_" (key 5).
//   TWIN_SEED at d1, twin: x^3 against 3x (Different).
//
// Difficulty (section 4 gives none per skill; my reading, reported):
//   d1  base x, n factors, n in 2..5. Evaluate b^n inside the times table
//       (b^n <= 100; 2^2 is never used: 2 + 2 = 2 x 2).
//   d2  n up to 7; two letters in one product (xyxxy); b^n up to 1000.
//   d3  a negative base: (-x)^n against -x^n (the exponent binds to its base
//       only, section 4 skill 7); (-b)^n and -b^n with |value| <= 125.
//   d4  a coefficient: k x^n against (k x)^n, k in 2..4, n in 2..3.
//
// Interactions (section 3 assigns I3, I5, I7, I8 to every skill; I2 Next Line
// is not offered: its distractors must be mal-rule outputs and none of the 19
// models a wrong reading of x^n, see the report):
//   twin      I5, box 0-1, with visuals. Two forms of "n copies of x": the
//             power x^n, the product xx..x, the coefficient form n x, the sum
//             x + x + ... Same: one multiplicative and one additive pair with
//             the same count, or (d3) a sign that matches. Different: the other
//             family (x^3 vs 3x), or the right family with a count off by one
//             (xxx vs x^4), or (d3) the wrong sign, so the look of the pair
//             does not settle it. No form of 1 joins any pair, so the typed
//             follow-up key is the first form's value at the x named in the
//             goal (section 3 I5). "Same" on a Different pair is untagged: no
//             section 5 mal-rule models these readings.
//   predict   I3 (constructed). The derivation step from the expansion: count
//             the factors (fill the exponent blank of "xxxxx = x^_"; d2 two
//             letters; d4 the coefficient of "(3x)(3x) = _x^2"), or (d3)
//             multiply the expansion (-2)(-2)(-2).
//   strike    I8 (constructed). Evaluate b^n (d1-2), (-b)^n or -b^n (d3); d4
//             the value of k x^n or (k x)^n at a named x (variant lantern).
//   why       I7 'hidden-1' (counting): two fractions, exactly one worth 1;
//             the other is a near miss of the same shape (a count off by one,
//             the coefficient form, the wrong sign, the coefficient inside or
//             outside the power). Tap the 1. x is declared nonzero.
// Every item carries its worked chain in `steps`; the chain goes through the
// expansion, so the value is read off the factors, never off a rule.
//
// Mal-rules separated here: form-change-changes-value (2). Wrong typed
// answers (3^4 -> 12, -3^2 -> 9) are left unclassified: see the report.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, twinChoices, tapTargets,
  probeEnvs, blank, V_FILL_BLANK, DISPLAY_CAP_PX, V_LANTERN,
} from '../common.js';
import { num, mul, frac, add, neg, pow, group, v, eq, isEquation } from '../../math/ast.js';
import { q } from '../../math/rational.js';
import { evaluate } from '../../math/evaluate.js';
import { toQ } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { int, qNode } from '../../misc/kit.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../common.js').GenOpts} GenOpts */

const GEN = Object.freeze({ id: 'exp-meaning.core', version: 1, skill: 'exp-meaning' });

/** makeRng(EXAMPLE_SEED) at d1 predict gives "xxxxx = x^_". Pinned by the test. */
export const EXAMPLE_SEED = 's15';
/** makeRng(TWIN_SEED) at d1 twin gives x^3 against 3x. Pinned by the test. */
export const TWIN_SEED = 's290';

const VISUALS = ['squareplot', 'numberline'];
/** @type {Assumption[]} */
const NONZERO = [{ name: 'x', rel: 'nonzero' }];
/** Largest |numerator| or denominator a typed value may have (d1 stays inside the times table). @param {number} d */
const cap = (d) => (d === 1 ? 100n : 243n);

// ---------------------------------------------------------------- small trees

const x = () => v('x');
/** n factors of a fresh copy of `f()` (n = 1 gives one). @param {() => Node} f @param {number} n @returns {Node} */
function prod(f, n) { return n === 1 ? f() : mul(...Array.from({ length: n }, f)); }
/** x^n. @param {number} n @returns {Node} */
function xp(n) { return pow(x(), num(n)); }
/** n x. @param {number} n @returns {Node} */
function coef(n) { return mul(num(n), x()); }
/** x + x + ... (n terms). @param {number} n @returns {Node} */
function sum(n) { return add(...Array.from({ length: n }, x)); }
/** (-x) as a factor. */
const negx = () => group(neg(x()));
/** (k x) as a factor. @param {number} k */
const kx = (k) => () => group(mul(num(k), x()));

/** Exact value of n at x = p (and y = p2), or undefined. @param {Node} n @param {number} p @param {number} [p2] @returns {Q | undefined} */
function valueAt(n, p, p2 = 3) {
  const s = evaluate(n, { x: q(p), y: q(p2) });
  return s ? toQ(s) : undefined;
}
/** A typed value that is easy to read and not a guess: not 0 or +-1, small. @param {Q | undefined} a @param {number} d */
function goodValue(a, d) {
  if (!a) return false;
  const mag = a.n < 0n ? -a.n : a.n;
  return mag <= cap(d) && a.d <= cap(d) && !(a.d === 1n && mag <= 1n);
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

// ---------------------------------------------------------------- items

/** @param {Node[]} lines @returns {Step[]} */
const chain = (lines) => lines.map((line) => ({ line, legal: true }));

/**
 * The Twin pair for difficulty d: [first form, second form].
 * @param {Rng} r @param {number} d @returns {[Node, Node] | undefined}
 */
function twinPair(r, d) {
  const want = r.bool();
  if (d <= 2) {
    const lo = d === 1 ? 2 : 3;
    const hi = d === 1 ? 5 : 7;
    const n = r.int(lo, hi);
    /** @type {Record<string, (k: number) => Node>} */
    const form = { pow: xp, prod: (k) => prod(x, k), coef, sum };
    const mult = ['pow', 'prod'];
    const plus = ['coef', 'sum'];
    let a; let b; let m = n;
    if (want) {
      [a, b] = r.shuffle(r.bool(0.7) ? mult : plus);
    } else if (r.bool(0.3)) {
      a = r.pick(mult); b = r.pick(plus); // the other family, same count
      if (r.bool()) [a, b] = [b, a];
    } else {
      [a, b] = r.shuffle(r.bool(0.7) ? mult : plus); // the right family, one count off
      m = n === lo ? n + 1 : n === hi ? n - 1 : n + r.pick([-1, 1]); // inside the range, so the length does not tell
    }
    if ((a === 'sum' || b === 'sum') && Math.max(n, m) > 5) return undefined; // display width
    return [form[a](n), form[b](m)];
  }
  if (d === 3) {
    const n = r.int(2, 4);
    const kind = r.pick(['pn', 'pp', 'pe', 'ne']);
    const pn = pow(negx(), num(n)); // (-x)^n
    const nn = neg(xp(n)); // -x^n
    if (kind === 'pn') return [pn, nn];
    if (kind === 'pp') return [pn, xp(n)];
    const m = want ? n : n + r.pick([-1, 1]);
    if (m < 2) return undefined;
    return kind === 'pe' ? [pn, prod(negx, m)] : [nn, prod(negx, m)];
  }
  // d4: k x^n or (k x)^n against an expansion, so the coefficient decides:
  // (3x)^2 vs (3x)(3x) or vs 9xx; 9x^2 vs (3x)(3x) (Same) and 3x^2 vs (3x)(3x)
  const n = r.int(2, 3);
  const j = r.pick([2, 3]);
  const powered = r.bool();
  const asProd = r.bool();
  /** c x x .. x (m factors of x). @param {number} c @param {number} m */
  const cxx = (c, m) => mul(num(c), ...Array.from({ length: m }, x));
  const off = () => (n === 2 ? 3 : r.pick([2, 4])); // a count off by one
  if (powered) {
    const math = pow(kx(j)(), num(n));
    if (asProd) return [math, prod(kx(j), want ? n : off())];
    if (want) return [math, cxx(j ** n, n)];
    return [math, r.bool(0.7) ? cxx(j, n) : cxx(j ** n, off())];
  }
  if (asProd) return [mul(num(want ? j ** n : j), xp(n)), prod(kx(j), n)];
  const math = mul(num(j), xp(n));
  if (want) return [math, cxx(j, n)];
  return [math, r.bool(0.7) ? cxx(j ** n, n) : cxx(j, off())];
}

/**
 * The hidden-1 Why fractions for difficulty d: [the one worth 1, the near miss].
 * @param {Rng} r @param {number} d @returns {[Node, Node] | undefined}
 */
function whyPair(r, d) {
  if (d <= 2) {
    const n = r.int(2, d === 1 ? 4 : 5);
    const one = r.bool() ? frac(prod(x, n), xp(n)) : frac(xp(n), prod(x, n));
    const m = r.int(2, d === 1 ? 4 : 5);
    const off = m + r.pick([-1, 1]);
    if (off < 2) return undefined;
    const near = r.pick([
      () => frac(prod(x, off), xp(m)), // a count off by one
      () => frac(xp(m), prod(x, off)),
      () => frac(coef(m), xp(m)), // the coefficient form
      () => frac(xp(m), coef(m)),
    ])();
    return [one, near];
  }
  if (d === 3) {
    // (-x)^n over x^n or over -x^n: worth 1 or -1 by the parity of n
    /** @param {number} n @param {boolean} negDen */
    const f = (n, negDen) => frac(pow(negx(), num(n)), negDen ? neg(xp(n)) : xp(n));
    const n = r.int(2, 4);
    const m = r.int(2, 4);
    const one = f(n, n % 2 === 1);
    const near = r.bool() ? f(m, m % 2 === 0) : frac(neg(xp(m)), xp(m));
    return [one, near];
  }
  const n = r.int(2, 3);
  const k = r.int(2, 3);
  const m = r.int(2, 3);
  const j = r.int(2, 3);
  const one = r.bool() ? frac(pow(kx(k)(), num(n)), prod(kx(k), n)) : frac(mul(num(k), xp(n)), mul(num(k), ...Array.from({ length: n }, x)));
  const near = r.bool() ? frac(pow(kx(j)(), num(m)), mul(num(j), xp(m))) : frac(mul(num(j), xp(m)), prod(kx(j), m));
  return [one, near];
}

/**
 * @param {Rng} r @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, opts, seed) {
  const d = opts.difficulty;
  const env = { variableKeys: ['x'], probes: probeEnvs(['x']) };
  switch (opts.interaction) {
    case 'strike': {
      if (d === 4) {
        const n = r.int(2, 3);
        const k = r.int(2, 4);
        const powered = r.bool();
        const math = powered ? pow(kx(k)(), num(n)) : mul(num(k), xp(n));
        const p0 = r.pick([2, -2, 3]);
        const at = valueAt(math, p0);
        if (!goodValue(at, d)) return undefined;
        const expansion = powered ? prod(kx(k), n) : mul(num(k), ...Array.from({ length: n }, x));
        return makeProblem(GEN, seed, opts, {
          variant: V_LANTERN,
          prompt: { verb: 'Evaluate', math, goal: `Find its value at x = ${p0}.` },
          answer: { kind: 'expr', expected: qNode(/** @type {Q} */ (at)), formPredicates: ['integer'], assumptions: [] },
          steps: chain([math, expansion]), visuals: VISUALS, ...env,
          probes: [{ x: q(p0) }, ...env.probes.filter((e) => !(e.x.n === BigInt(p0) && e.x.d === 1n))],
        });
      }
      /** @type {Node} */ let math;
      /** @type {Node} */ let expansion;
      if (d <= 2) {
        const [b, n] = r.pick(d === 1 ? EVAL_D1 : EVAL_D2);
        math = pow(num(b), num(n));
        expansion = prod(() => num(b), n);
      } else {
        const b = r.int(2, 5);
        const n = r.int(2, 4);
        if (b ** n > 125) return undefined;
        const inside = r.bool();
        math = inside ? pow(group(int(BigInt(-b))), num(n)) : neg(pow(num(b), num(n)));
        expansion = inside ? prod(() => group(int(BigInt(-b))), n) : neg(group(prod(() => num(b), n)));
      }
      const val = valueAt(math, 2);
      if (!val) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Evaluate', math },
        answer: { kind: 'expr', expected: qNode(val), formPredicates: ['integer'], assumptions: [] },
        steps: chain([math, expansion, qNode(val)]), visuals: VISUALS,
      });
    }
    case 'predict': {
      if (d === 3) {
        const b = r.int(2, 5);
        const n = r.int(2, 4);
        if (b ** n > 125) return undefined;
        const math = prod(() => group(int(BigInt(-b))), n);
        const val = /** @type {Q} */ (valueAt(math, 2));
        return makeProblem(GEN, seed, opts, {
          prompt: { verb: 'Multiply', math, goal: 'Multiply the factors.' },
          answer: { kind: 'expr', expected: qNode(val), formPredicates: ['integer'], assumptions: [] },
          steps: chain([math, pow(group(int(BigInt(-b))), num(n)), qNode(val)]), visuals: VISUALS,
        });
      }
      /** @type {Node} */ let lhs;
      /** @type {Node} */ let rhs;
      /** @type {number} */ let key;
      /** @type {Node} */ let done;
      let vk = ['x'];
      if (d === 1) {
        const n = r.int(2, 7);
        const name = r.pick(['x', 'y', 'a', 'b']);
        lhs = prod(() => v(name), n); rhs = pow(v(name), blank()); key = n; done = pow(v(name), num(n));
        vk = [name];
      } else if (d === 2) {
        const a = r.int(2, 4);
        const b = r.int(2, 4);
        const order = r.shuffle([...Array(a).fill('x'), ...Array(b).fill('y')]);
        if (order.every((c, i) => i === 0 || order[i - 1] === c || c === 'y')) return undefined; // keep it scrambled
        lhs = mul(...order.map((c) => v(c)));
        const blankX = r.bool();
        rhs = mul(pow(x(), blankX ? blank() : num(a)), pow(v('y'), blankX ? num(b) : blank()));
        key = blankX ? a : b;
        done = mul(xp(a), pow(v('y'), num(b)));
        vk = ['x', 'y'];
      } else {
        const n = r.int(2, 3);
        const k = n === 2 ? r.int(2, 9) : r.int(2, 3);
        const onCoef = r.bool(0.7);
        lhs = prod(kx(k), n); done = mul(num(k ** n), xp(n));
        rhs = onCoef ? mul(blank(), xp(n)) : mul(num(k ** n), pow(x(), blank()));
        key = onCoef ? k ** n : n;
      }
      return makeProblem(GEN, seed, opts, {
        variant: V_FILL_BLANK,
        prompt: { verb: 'Fill the blank', math: eq(lhs, rhs), goal: d === 4 ? 'Multiply the coefficients; count the factors of x.' : 'Count the factors.' },
        answer: { kind: 'expr', expected: num(key), formPredicates: ['integer'], assumptions: [] },
        steps: chain([lhs, done]), visuals: VISUALS, variableKeys: vk, probes: probeEnvs(vk),
      });
    }
    case 'twin': {
      const pair = twinPair(r.fork('pair'), d);
      if (!pair) return undefined;
      const [math, twin] = pair;
      const want = equivExpr(math, twin).equal;
      if (want === undefined) return undefined;
      // the named x: the first form's value there is the follow-up key
      const goods = r.shuffle([2, -2, 3, 5]).filter((p) => {
        const a = valueAt(math, p);
        const b = valueAt(twin, p);
        return goodValue(a, d) && b !== undefined && (want || !qsame(/** @type {Q} */ (a), b));
      });
      // the smallest arithmetic that does the job: a value of at most 64 when some x gives one
      const p0 = goods.find((p) => { const a = /** @type {Q} */ (valueAt(math, p)); return (a.n < 0n ? -a.n : a.n) <= 64n && a.d <= 64n; }) ?? goods[0];
      if (p0 === undefined) return undefined;
      const prompt = { verb: 'Same value?', math, twin, goal: `Find the first form's value at x = ${p0}.` };
      return makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want),
        answer: { kind: 'expr', expected: qNode(/** @type {Q} */ (valueAt(math, p0))), formPredicates: ['single-number'], assumptions: [] },
        steps: chain(want ? [math, twin] : [math, twinStep(math)]), visuals: VISUALS, ...env,
      });
    }
    case 'why': {
      const pair = whyPair(r.fork('pair'), d);
      if (!pair) return undefined;
      const [one, near] = pair;
      if (equivExpr(near, num(1), NONZERO).equal !== false) return undefined;
      const oneFirst = r.bool();
      const shown = oneFirst ? mul(one, near) : mul(near, one);
      const at = oneFirst ? 0 : 1;
      const f = r.bool() ? at : 1 - at; // the parts of the 1, or of the near miss, are the other two targets
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: 'One factor is worth exactly 1. Tap it. x is not 0.' },
        choices: tapTargets(shown, ['e.0', 'e.1', `e.${f}.0`, `e.${f}.1`].sort(), `e.${at}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: NONZERO },
        assumptions: NONZERO,
        steps: chain([shown, near]), visuals: ['coin', ...VISUALS], ...env,
      });
    }
    default:
      return undefined;
  }
}

/** The expansion of a first form (the step that shows its value). @param {Node} math @returns {Node} */
function twinStep(math) {
  if (math.t === 'pow' && math.exp.t === 'num') return prod(() => structuredClone(math.base), Number(math.exp.q.n));
  if (math.t === 'neg' && math.arg.t === 'pow' && math.arg.exp.t === 'num') return neg(group(prod(x, Number(math.arg.exp.q.n))));
  if (math.t === 'mul' && math.args.length === 2 && math.args[1].t === 'pow') {
    const p = math.args[1];
    if (p.exp.t === 'num') return mul(math.args[0], ...Array.from({ length: Number(p.exp.q.n) }, x));
  }
  if (math.t === 'mul' && math.args.every((a) => a.t === 'var')) return pow(x(), num(math.args.length));
  if (math.t === 'mul' && math.args.length === 2 && math.args[0].t === 'num' && math.args[1].t === 'var') return sum(Number(math.args[0].q.n));
  return math.t === 'add' ? mul(num(math.args.length), x()) : math;
}

/** Evaluate b^n at d1: inside the times table, never 2^2. */
const EVAL_D1 = Object.freeze([[2, 3], [2, 4], [2, 5], [2, 6], [3, 2], [3, 3], [3, 4], [4, 2], [4, 3], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2]]);
/** Evaluate b^n at d2: up to 256, powers of 10, squares past the times table. */
const EVAL_D2 = Object.freeze([[2, 7], [2, 8], [3, 5], [4, 4], [5, 3], [6, 3], [10, 3], [10, 4], [11, 2], [12, 2], [13, 2], [15, 2]]);

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['twin', 'predict', 'strike', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const p = item(r, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: stackedWidth }) ? p : undefined;
    });
  },
});
