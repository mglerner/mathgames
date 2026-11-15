// @ts-check
// Small exact facts about real values, shared by classify.js and the judge.
//
//   nonRealPart(n)       a sub-expression of variable-free n that proves n is
//                        not a real number: an even root, or a power with an
//                        even-denominator exponent, of a constant that is
//                        exactly negative (sqrt(-4), (-1)^(1/2)).
//   provablyUndefined(n) variable-free n provably has no real value: a
//                        non-real part, or a division by / negative power of
//                        a constant exactly 0. Real arithmetic is strict (no
//                        0 x undefined = 0), so one undefined part suffices.
//                        false means "not proved", not "defined".
//   realZeros(p, as)     the exact real zeros of a one-variable polynomial
//                        node, minus those the declared assumptions exclude
//                        (x pos drops x <= 0, nonneg drops x < 0, nonzero
//                        drops 0). Rational zeros are found by the rational
//                        root theorem and divided out (any degree); what is
//                        left must have degree <= 2 and goes to solve.js.
//                        undefined if p is not a polynomial in at most one
//                        variable, is identically 0, has a leftover factor
//                        of degree > 2, or has coefficients too large to
//                        enumerate divisors of (> 10^10).
// No floating point anywhere: values are exact Surds (evaluate.js).

import { some, vars } from '../math/ast.js';
import { evaluateS } from '../math/evaluate.js';
import { solve } from '../math/solve.js';
import { ssign, toQ, seq, fromQ } from '../math/surd.js';
import { toPoly, coeffsIn } from '../math/poly.js';
import { q, add, mul, isZero, ZERO } from '../math/rational.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').Assumption} Assumption */

/** @param {Node} n @returns {-1 | 0 | 1 | undefined} exact sign of a variable-free node, if computable */
function signOf(n) {
  if (vars(n).length > 0) return undefined;
  const v = evaluateS(n, {});
  return v ? ssign(v) : undefined;
}

/**
 * @param {Node} n
 * @returns {Node | undefined}
 */
export function nonRealPart(n) {
  /** @type {Node | undefined} */
  let hit;
  some(n, (m) => {
    if (m.t === 'root' && m.index % 2 === 0 && signOf(m.radicand) === -1) { hit = m; return true; }
    if (m.t === 'pow' && vars(m.exp).length === 0) {
      const e = evaluateS(m.exp, {});
      const eq = e && toQ(e);
      if (eq && eq.d % 2n === 0n && signOf(m.base) === -1) { hit = m; return true; }
    }
    return false;
  });
  return hit;
}

/**
 * @param {Node} n
 * @returns {boolean}
 */
export function provablyUndefined(n) {
  if (vars(n).length > 0) return false;
  if (nonRealPart(n)) return true;
  return some(n, (m) => {
    if (m.t === 'frac') return signOf(m.den) === 0;
    if (m.t === 'pow' && signOf(m.base) === 0) {
      const e = vars(m.exp).length === 0 ? evaluateS(m.exp, {}) : undefined;
      return !!e && ssign(e) === -1;
    }
    return false;
  });
}

/**
 * @param {Surd} x @param {string} v @param {Assumption[]} as
 * @returns {boolean} x is allowed for v by every declared assumption
 */
function admissible(x, v, as) {
  const s = ssign(x);
  return (as ?? []).every((a) => a.name !== v
    || (a.rel === 'nonzero' && s !== 0) || (a.rel === 'pos' && s === 1) || (a.rel === 'nonneg' && s !== -1));
}

const MAX_DIVISOR_INPUT = 10n ** 10n;

/** Positive divisors of |n| (n != 0), or undefined if |n| is too large. @param {bigint} n @returns {bigint[] | undefined} */
function divisors(n) {
  const a = n < 0n ? -n : n;
  if (a > MAX_DIVISOR_INPUT) return undefined;
  /** @type {bigint[]} */
  const out = [];
  for (let d = 1n; d * d <= a; d++) {
    if (a % d === 0n) { out.push(d); if (d * d !== a) out.push(a / d); }
  }
  return out;
}

/** c0 + c1 r + ... exactly. @param {import('../../types.d.ts').Q[]} cs @param {import('../../types.d.ts').Q} r */
function horner(cs, r) {
  let acc = ZERO;
  for (let i = cs.length - 1; i >= 0; i--) acc = add(mul(acc, r), cs[i]);
  return acc;
}

/** Divide by (x - r), r a root: the quotient's coefficients. @param {import('../../types.d.ts').Q[]} cs @param {import('../../types.d.ts').Q} r */
function deflate(cs, r) {
  const n = cs.length - 1;
  /** @type {import('../../types.d.ts').Q[]} */
  const out = new Array(n);
  let carry = ZERO;
  for (let i = n; i >= 1; i--) { carry = add(mul(carry, r), cs[i]); out[i - 1] = carry; }
  return out;
}

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcdB(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }

/**
 * @param {Node} p
 * @param {Assumption[]} [as]
 * @returns {{ v: string | undefined; roots: Surd[] } | undefined}
 */
export function realZeros(p, as = []) {
  const vs = vars(p);
  if (vs.length > 1) return undefined;
  if (vs.length === 0) {
    const s = signOf(p);
    return s === undefined || s === 0 ? undefined : { v: undefined, roots: [] };
  }
  const v = vs[0];
  const poly = toPoly(p);
  let cs = poly && coeffsIn(poly, v);
  if (!cs || cs.length === 0) return undefined;
  /** @type {Surd[]} */
  const found = [];
  // Zero roots.
  if (isZero(cs[0])) { found.push(fromQ(ZERO)); while (cs.length > 1 && isZero(cs[0])) cs = cs.slice(1); }
  // Rational roots (rational root theorem on the integer-cleared coefficients).
  if (cs.length > 3) {
    let l = 1n;
    for (const c of cs) l = (l / gcdB(l, c.d)) * c.d;
    const ints = cs.map((c) => (c.n * l) / c.d);
    const ps = divisors(ints[0]);
    const qs = divisors(ints[ints.length - 1]);
    if (!ps || !qs) return undefined;
    for (const pp of ps) {
      for (const qq of qs) {
        for (const r of [q(pp, qq), q(-pp, qq)]) {
          while (cs.length > 1 && isZero(horner(cs, r))) {
            if (!found.some((y) => seq(y, fromQ(r)))) found.push(fromQ(r));
            cs = deflate(cs, r);
          }
        }
      }
    }
  }
  if (cs.length > 3) return undefined;
  /** @type {Node} */
  const x = { t: 'var', name: v };
  /** @type {Node[]} */
  const terms = [];
  cs.forEach((c, i) => {
    if (isZero(c)) return;
    /** @type {Node} */
    const k = { t: 'num', q: c };
    terms.push(i === 0 ? k : { t: 'mul', args: [k, i === 1 ? x : { t: 'pow', base: x, exp: { t: 'num', q: q(2) } }] });
  });
  /** @type {Node} */
  const rest = terms.length === 0 ? { t: 'num', q: ZERO } : { t: 'add', args: terms };
  const s = solve({ t: 'eq', lhs: rest, rhs: { t: 'num', q: ZERO } }, v);
  if (!s || s.kind === 'all') return undefined;
  if (s.kind === 'finite') for (const x of s.roots) if (!found.some((y) => seq(x, y))) found.push(x);
  return { v, roots: found.filter((x) => admissible(x, v, as)) };
}
