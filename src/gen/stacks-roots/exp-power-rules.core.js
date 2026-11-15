// @ts-check
// exp-power-rules (skill 19, DESIGN.md section 4): (x^m)^n = x^(mn) and
// (k x)^n = k^n x^n, DERIVED from the meaning of the exponent (section 7
// "Derivations over rules"): (x^3)^4 is x^3 x^3 x^3 x^3, so the exponents
// add four times; (3x)^2 is (3x)(3x). And the boundary of the rule: a power
// of a SUM does not spread, (x + 3)^2 is (x + 3)(x + 3), four pieces, not
// x^2 + 9 (mal-rule 13, the Spreader). Built on the recipe in ../common.js.
//
// Documented seeds (pinned by test/gen/exp-power-rules.test.js):
//   EXAMPLE_SEED at d1, predict: "x^3x^3x^3x^3 = x^_", the expansion of
//     (x^3)^4 (key 12).
//   SPREADER_SEED at d3, twin: (x + 3)^2 against x^2 + 9 (Different; "same"
//     is tagged freshmans-dream-square), the section 5 example.
//
// Difficulty (my reading, reported):
//   d1  (x^m)^n, m, n in 2..5, m n <= 15 (never (x^2)^2: 2 + 2 = 2 x 2).
//   d2  a power of a product: (k x)^n with k^n <= 81; (x^a y^b)^n in strike
//       and predict.
//   d3  a power of a sum against a power of a product: (x + k)^2 has four
//       pieces, (k x)^2 has one; numbers (a + b)^2 inside the times table.
//   d4  (k x^m)^n: the coefficient is powered, the exponents multiply.
//
// Interactions (I2 Next Line is not offered: the only section 5 rule that
// applies here is the Spreader, and its two outputs beside the key make the
// key the only option with a middle term, a surface tell; see the report):
//   twin      I5, box 0-1, with visuals. d1 (x^m)^n against x^e: Same for
//             e = m n; Different for e = m + n (exponents added) or m n +- 1,
//             written the same way. d2 (k x)^n against c x^n: Same for
//             c = k^n; Different for c = k (the coefficient not powered), k n,
//             or the exponent off by one. d3 (x + k)^2 against its expansion
//             (Same), the Spreader's x^2 + k^2 (Different, tagged), or the
//             near miss x^2 + k x + k^2 (Different, untagged, written like the
//             Same partner); and (k x)^2 against k^2 x^2 (Same) or k x^2. d4
//             (k x^m)^n against c x^e. No form of 1 joins any pair: the
//             follow-up key is the first form's value at the x in the goal.
//   predict   I3 (constructed): the derivation step from the expansion:
//             "x^3x^3x^3x^3 = x^_", "(3x)(3x) = _x^2",
//             "(x + 3)(x + 3) = x^2 + _x + 9".
//   strike    I8 (constructed): "(x^3)^4 = x^_", "(3x)^2 = _x^2"; d3
//             "Evaluate (2 + 3)^2" or "Expand (x + 3)^2" (the Spreader is
//             diagnosed on both: 13, x^2 + 9).
//   why       I7 'hidden-1' (counting): two fractions of the same shape,
//             exactly one worth 1, e.g. (x^2)^3/x^6 and (x^3)^2/x^5: with the
//             add-the-exponents bug the second one looks like the 1. d3:
//             (2 + 3)^2/25 and (1 + 4)^2/17 (the Spreader's 1).
//
// Mal-rules separated here: freshmans-dream-square (13),
// form-change-changes-value (2).

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, twinChoices, tapTargets,
  probeEnvs, blank, V_FILL_BLANK, DISPLAY_CAP_PX, TWIN_SAME,
} from '../common.js';
import { num, mul, frac, add, neg, pow, group, v, eq, isEquation } from '../../math/ast.js';
import { q } from '../../math/rational.js';
import { evaluate } from '../../math/evaluate.js';
import { toQ } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { qNode, int } from '../../misc/kit.js';
import { diagnose } from '../../misc/diagnose.js';
import spreader from '../../misc/malrules/freshmans-dream-square.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../common.js').GenOpts} GenOpts */

const GEN = Object.freeze({ id: 'exp-power-rules.core', version: 1, skill: 'exp-power-rules' });

/** makeRng(EXAMPLE_SEED) at d1 predict gives "x^3x^3x^3x^3 = x^_". Pinned by the test. */
export const EXAMPLE_SEED = 's2';
/** makeRng(SPREADER_SEED) at d3 twin gives (x + 3)^2 against x^2 + 9. Pinned by the test. */
export const SPREADER_SEED = 's7';

const VISUALS = ['squareplot', 'numberline'];
/** @type {Assumption[]} */
const NONZERO = [{ name: 'x', rel: 'nonzero' }];

// ---------------------------------------------------------------- small trees

const x = () => v('x');
const y = () => v('y');
/** x^n (x for n = 1). @param {number} n @returns {Node} */
function xp(n) { return n === 1 ? x() : pow(x(), num(n)); }
/** c x^n (x^n for c = 1). @param {number} c @param {number} n @returns {Node} */
function cxp(c, n) { return c === 1 ? xp(n) : mul(num(c), xp(n)); }
/** n copies of f() multiplied (one for n = 1). @param {() => Node} f @param {number} n @returns {Node} */
function times(f, n) { return n === 1 ? f() : mul(...Array.from({ length: n }, f)); }
/** x + k or x - k (k > 0 either way). @param {number} k signed @returns {Node} */
function xPlus(k) { return add(x(), int(BigInt(k))); }
/** a x^2 + b x + c, descending, signs written as a student writes them. @param {number} b @param {number} c */
function quad(b, c) {
  /** @type {Node[]} */
  const terms = [pow(x(), num(2))];
  if (b !== 0) terms.push(b < 0 ? neg(b === -1 ? x() : mul(num(-b), x())) : b === 1 ? x() : mul(num(b), x()));
  terms.push(int(BigInt(c)));
  return add(...terms);
}

/** Exact value of n at x = p, or undefined. @param {Node} n @param {number} p @returns {Q | undefined} */
function valueAt(n, p) {
  const s = evaluate(n, { x: q(p), y: q(3) });
  return s ? toQ(s) : undefined;
}
/** Easy to read and not a guess: not 0 or +-1, at most 256. @param {Q | undefined} a */
function goodValue(a) {
  if (!a) return false;
  const mag = a.n < 0n ? -a.n : a.n;
  return mag <= 256n && a.d <= 256n && !(a.d === 1n && mag <= 1n);
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

// ---------------------------------------------------------------- the families

/** (x^m)^n and its chain. @param {number} m @param {number} n */
function powerOfPower(m, n) {
  const math = pow(group(xp(m)), num(n));
  return { math, coef: 1, exp: m * n, lines: [math, times(() => xp(m), n), pow(x(), add(...Array.from({ length: n }, () => num(m)))), xp(m * n)] };
}
/** (k x^m)^n and its chain (m = 1: (k x)^n). @param {number} k @param {number} m @param {number} n */
function powerOfProduct(k, m, n) {
  const math = pow(group(cxp(k, m)), num(n));
  const lines = [math, times(() => group(cxp(k, m)), n), mul(group(times(() => num(k), n)), group(times(() => xp(m), n))), cxp(k ** n, m * n)];
  return { math, coef: k ** n, exp: m * n, lines };
}
/** (x + k)^2 and its chain: (x + k)(x + k), four pieces, the middle terms combined. @param {number} k signed */
function powerOfSum(k) {
  const math = pow(group(xPlus(k)), num(2));
  const kx = () => (k < 0 ? neg(mul(num(-k), x())) : mul(num(k), x()));
  const lines = [math, mul(group(xPlus(k)), group(xPlus(k))), add(pow(x(), num(2)), kx(), kx(), num(k * k)), quad(2 * k, k * k)];
  return { math, lines };
}

/**
 * The Twin pair: [first form, second form, Spreader tag or undefined, worked lines].
 * @param {Rng} r @param {number} d
 * @param {boolean} want a Same pair; drawn once per seed so that rejection does not skew the half (section 3 I5)
 * @returns {[Node, Node, string | undefined, Node[]] | undefined}
 */
function twinPair(r, d, want) {
  if (d === 3 && r.bool(0.6)) {
    const k = r.int(2, 9) * (r.bool(0.3) ? -1 : 1);
    const f = powerOfSum(k);
    if (want) return [f.math, quad(2 * k, k * k), undefined, f.lines];
    if (r.bool(1 / 3)) return [f.math, quad(0, k * k), spreader.id, f.lines]; // the Spreader: x^2 + k^2
    return [f.math, quad(k, k * k), undefined, f.lines]; // a near miss: the middle term not doubled
  }
  /** @type {{ math: Node; coef: number; exp: number; lines: Node[] }} */
  let f;
  /** @type {[number, number][]} */
  let wrong;
  if (d === 1) {
    const m = r.int(2, 5);
    const n = r.int(2, 5);
    if (m * n > 15 || (m === 2 && n === 2)) return undefined;
    f = powerOfPower(m, n);
    wrong = r.bool(0.6) ? [[1, m + n]] : [[1, m * n - 1], [1, m * n + 1]];
  } else if (d === 2 || d === 3) {
    const n = d === 3 ? 2 : r.int(2, 3);
    const k = n === 2 ? r.int(2, 9) : r.int(2, 4);
    f = powerOfProduct(k, 1, n);
    const pool = d === 3 || r.bool(0.5) ? [[k, n]] : r.bool(0.5) ? [[k * n, n]] : [[k ** n, n - 1], [k ** n, n + 1]];
    wrong = /** @type {[number, number][]} */ (pool);
  } else {
    const k = r.int(2, 3);
    const m = r.int(2, 4);
    const n = r.int(2, 3);
    if (k ** n > 27) return undefined;
    f = powerOfProduct(k, m, n);
    wrong = r.pick([[[k, m * n]], [[k ** n, m + n]], [[k * n, m * n]]]);
  }
  const ok = wrong.filter(([c, e]) => e >= 2 && !(c === f.coef && e === f.exp)); // x^1 would be the only bare x: a tell
  if (!want && ok.length === 0) return undefined;
  const [c, e] = want ? [f.coef, f.exp] : r.pick(ok);
  const pair = /** @type {[Node, Node]} */ ([f.math, cxp(c, e)]);
  if (d === 1 && r.bool()) pair.reverse();
  return [...pair, undefined, f.lines];
}

/**
 * The hidden-1 Why: [the fraction worth 1, the near miss of the same shape].
 * @param {Rng} r @param {number} d @returns {[Node, Node] | undefined}
 */
function whyPair(r, d) {
  if (d === 1) {
    const m = r.int(2, 4); const n = r.int(2, 4);
    const s = r.int(2, 4); const t = r.int(2, 4);
    if (m * n > 12 || s * t > 12 || s * t === s + t || m * n === m + n) return undefined; // (x^2)^2: 2 + 2 = 2 x 2
    return [frac(pow(group(xp(m)), num(n)), xp(m * n)), frac(pow(group(xp(s)), num(t)), xp(s + t))];
  }
  if (d === 3) {
    // numbers: (a + b)^2 over its value, and (c + e)^2 over c^2 + e^2 (the Spreader's 1)
    const a = r.int(1, 5); const b = r.int(2, 5);
    const c = r.int(1, 5); const e = r.int(2, 5);
    if (a + b > 9 || c + e > 9) return undefined;
    const sq = (/** @type {number} */ u, /** @type {number} */ w) => pow(group(add(num(u), num(w))), num(2));
    return [frac(sq(a, b), num((a + b) ** 2)), frac(sq(c, e), num(c * c + e * e))];
  }
  const m = d === 2 ? 1 : r.int(2, 3);
  const k = r.int(2, 3); const n = r.int(2, 3);
  const j = r.int(2, 3); const t = r.int(2, 3);
  const p = d === 2 ? 1 : r.int(2, 3);
  const one = frac(pow(group(cxp(k, m)), num(n)), cxp(k ** n, m * n));
  const near = d === 2 || r.bool()
    ? frac(pow(group(cxp(j, p)), num(t)), cxp(j, p * t)) // the coefficient not powered
    : frac(pow(group(cxp(j, p)), num(t)), cxp(j ** t, p + t)); // the exponents added
  return [one, near];
}

// ---------------------------------------------------------------- items

/**
 * @param {Rng} r @param {GenOpts} opts @param {string} seed
 * @param {boolean} wantSame (twin only: a Same pair; drawn once per seed)
 * @returns {Problem | undefined}
 */
function item(r, opts, seed, wantSame) {
  const d = opts.difficulty;
  const env = { variableKeys: ['x'], probes: probeEnvs(['x']) };
  switch (opts.interaction) {
    case 'strike': case 'predict': {
      const strike = opts.interaction === 'strike';
      if (d === 3) {
        if (strike && r.bool()) {
          // Evaluate (a + b)^2 or (a - b)^2: the Spreader gives a^2 + b^2
          const minus = r.bool(0.3);
          const a = minus ? r.int(4, 9) : r.int(2, 7);
          const b = minus ? r.int(2, a - 2) : r.int(2, 9 - a);
          if (b < 2 || (a === 2 && b === 2)) return undefined;
          const s = minus ? a - b : a + b;
          const math = pow(group(add(num(a), minus ? neg(num(b)) : num(b))), num(2));
          return makeProblem(GEN, seed, opts, {
            prompt: { verb: 'Evaluate', math },
            answer: { kind: 'expr', expected: num(s * s), formPredicates: ['integer'], assumptions: [] },
            steps: chain([math, pow(num(s), num(2)), num(s * s)]), visuals: VISUALS,
          });
        }
        const k = r.int(2, 9) * (r.bool(0.3) ? -1 : 1);
        const f = powerOfSum(k);
        if (strike) {
          return makeProblem(GEN, seed, opts, {
            prompt: { verb: 'Expand', math: f.math, goal: 'Multiply it out and combine like terms.' },
            answer: { kind: 'expr', expected: quad(2 * k, k * k), formPredicates: ['expanded', 'combined'], assumptions: [] },
            steps: chain(f.lines), visuals: VISUALS, ...env,
          });
        }
        const lhs = mul(group(xPlus(k)), group(xPlus(k)));
        const mid = k < 0 ? neg(mul(blank(), x())) : mul(blank(), x());
        return makeProblem(GEN, seed, opts, {
          variant: V_FILL_BLANK,
          prompt: { verb: 'Fill the blank', math: eq(lhs, add(pow(x(), num(2)), mid, num(k * k))), goal: 'Multiply every term by every term. Combine like terms.' },
          answer: { kind: 'expr', expected: num(2 * Math.abs(k)), formPredicates: ['integer'], assumptions: [] },
          steps: chain(f.lines.slice(1)), visuals: VISUALS, ...env,
        });
      }
      if (d === 2 && r.bool(0.35)) {
        // (x^a y^b)^n: every factor inside is powered
        const a = r.int(1, 3); const b = r.int(1, 3); const n = r.int(2, 3);
        if (a === b) return undefined;
        const inside = () => mul(xp(a), b === 1 ? y() : pow(y(), num(b)));
        const math = pow(group(inside()), num(n));
        const onX = r.bool();
        const lhs = strike ? math : times(() => group(inside()), n);
        const rhs = mul(onX ? pow(x(), blank()) : xp(a * n), onX ? pow(y(), num(b * n)) : pow(y(), blank()));
        return makeProblem(GEN, seed, opts, {
          variant: V_FILL_BLANK,
          prompt: { verb: 'Fill the blank', math: eq(lhs, rhs), goal: strike ? 'Write it with one power of x and one of y.' : 'Count the factors of x and of y.' },
          answer: { kind: 'expr', expected: num(onX ? a * n : b * n), formPredicates: ['integer'], assumptions: [] },
          steps: chain([math, times(() => group(inside()), n), mul(xp(a * n), pow(y(), num(b * n)))]),
          visuals: VISUALS, variableKeys: ['x', 'y'], probes: probeEnvs(['x', 'y']),
        });
      }
      /** @type {{ math: Node; coef: number; exp: number; lines: Node[] }} */
      let f;
      if (d === 1) {
        const m = r.int(2, 5); const n = r.int(2, 5);
        if (m * n > 15 || (m === 2 && n === 2)) return undefined;
        f = powerOfPower(m, n);
      } else if (d === 2) {
        const n = r.int(2, 3);
        f = powerOfProduct(n === 2 ? r.int(2, 9) : r.int(2, 4), 1, n);
      } else {
        const k = r.int(2, 3); const m = r.int(2, 4); const n = r.int(2, 3);
        if (k ** n > 27 || (strike === false && m * n > 9)) return undefined;
        f = powerOfProduct(k, m, n);
      }
      const onCoef = f.coef > 1 && (d === 2 ? r.bool(0.8) : r.bool());
      const rhs = onCoef ? mul(blank(), xp(f.exp)) : f.coef > 1 ? mul(num(f.coef), pow(x(), blank())) : pow(x(), blank());
      const lhs = strike ? f.math : f.lines[1];
      return makeProblem(GEN, seed, opts, {
        variant: V_FILL_BLANK,
        prompt: { verb: 'Fill the blank', math: eq(lhs, rhs), goal: strike ? 'Write it as one power of x.' : d === 1 ? 'Add the exponents of the factors.' : 'Multiply the coefficients; count the factors of x.' },
        answer: { kind: 'expr', expected: num(onCoef ? f.coef : f.exp), formPredicates: ['integer'], assumptions: [] },
        steps: chain(strike ? f.lines : f.lines.slice(1)), visuals: VISUALS, ...env,
      });
    }
    case 'twin': {
      const pair = twinPair(r.fork('pair'), d, wantSame);
      if (!pair) return undefined;
      const [math, twin, tag, lines] = pair;
      const want = equivExpr(math, twin).equal;
      if (want === undefined) return undefined;
      const goods = r.shuffle([2, -2, 3, 5, -1]).filter((p) => {
        const a = valueAt(math, p);
        const b = valueAt(twin, p);
        return goodValue(a) && b !== undefined && (want || !qsame(/** @type {Q} */ (a), b));
      });
      // the smallest arithmetic that does the job: a value of at most 64 when some x gives one
      const p0 = goods.find((p) => { const a = /** @type {Q} */ (valueAt(math, p)); return (a.n < 0n ? -a.n : a.n) <= 64n && a.d <= 64n; }) ?? goods[0];
      if (p0 === undefined) return undefined;
      const prompt = { verb: 'Same value?', math, twin, goal: `Find the first form's value at x = ${p0}.` };
      const p = makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, tag),
        answer: { kind: 'expr', expected: qNode(/** @type {Q} */ (valueAt(math, p0))), formPredicates: ['single-number'], assumptions: [] },
        steps: chain(lines), visuals: VISUALS, ...env,
      });
      // an untagged near miss must be one no rule models; a tagged one, exactly its rule
      const dg = diagnose(p, TWIN_SAME).misconceptions;
      if (!want && (tag ? dg.length !== 1 || dg[0] !== tag : dg.length > 0)) return undefined;
      return p;
    }
    case 'why': {
      const pair = whyPair(r.fork('pair'), d);
      if (!pair) return undefined;
      const [one, near] = pair;
      const numeric = d === 3;
      if (equivExpr(near, num(1), NONZERO).equal !== false) return undefined;
      const oneFirst = r.bool();
      const shown = oneFirst ? mul(one, near) : mul(near, one);
      const at = oneFirst ? 0 : 1;
      const f = r.bool() ? at : 1 - at;
      const value = numeric ? qNode(/** @type {Q} */ (valueAt(near, 2))) : near;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: `One factor is worth exactly 1. Tap it.${numeric ? '' : ' x is not 0.'}` },
        choices: tapTargets(shown, ['e.0', 'e.1', `e.${f}.0`, `e.${f}.1`].sort(), `e.${at}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: numeric ? [] : NONZERO },
        steps: chain([shown, value]), visuals: ['coin', ...VISUALS],
        ...(numeric ? {} : { ...env, assumptions: NONZERO }),
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
    const want = rng.fork('same').bool();
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const p = item(r, opts, seed, want);
      return p && separated(p).ok && fitsAll(p, { estimate: stackedWidth }) ? p : undefined;
    });
  },
});
