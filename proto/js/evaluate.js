// @ts-check
// Exact evaluation of an AST to a polynomial in x with surd coefficients.
// Anything outside that class (variable in a denominator or radicand, nested radicals,
// non-integer exponents, negative radicands, runaway sizes) is reported, never guessed.
import { q, isInt } from './rational.js';
import { sqrtQ, toQ, SZERO } from './surd.js';
import { padd, pneg, pmul, pdivConst, pq, pmono, isConst, constOf, EvalFail, pbits, MAX_DEGREE } from './poly.js';

/** @typedef {import('./ast.js').Node} Node */
/** @typedef {import('./ast.js').Equation} Equation */
/** @typedef {import('./poly.js').Poly} Poly */
/** @typedef {{ poly: Poly } | { fail: 'divzero' | 'unsupported' | 'toobig' }} EvalResult */

const MAX_EXP = 64;
const MAX_BITS = 20000;

/** @param {Poly} p */
function guard(p) {
  if (pbits(p) > MAX_BITS) throw new EvalFail('toobig');
  return p;
}

/** @param {Node} n @param {string} x @returns {Poly} */
function ev(n, x) {
  switch (n.t) {
    case 'num':
      return pq(n.q);
    case 'var':
      if (n.name !== x) throw new EvalFail('unsupported');
      return pmono(q(1), 1);
    case 'group':
      return ev(n.arg, x);
    case 'neg':
      return pneg(ev(n.arg, x));
    case 'add': {
      let acc = /** @type {Poly} */ ([]);
      for (const a of n.args) acc = guard(padd(acc, ev(a, x)));
      return acc;
    }
    case 'mul': {
      let acc = pq(q(1));
      for (const a of n.args) acc = guard(pmul(acc, ev(a, x)));
      return acc;
    }
    case 'frac':
      return guard(pdivConst(ev(n.num, x), ev(n.den, x)));
    case 'pow': {
      const e = ev(n.exp, x);
      if (!isConst(e)) throw new EvalFail('unsupported');
      const eq = toQ(constOf(e));
      if (!eq || !isInt(eq)) throw new EvalFail('unsupported');
      let k = eq.n;
      if (k > BigInt(MAX_EXP) || k < -BigInt(MAX_EXP)) throw new EvalFail('toobig');
      const base = ev(n.base, x);
      const negExp = k < 0n;
      if (negExp) k = -k;
      if (k === 0n) {
        if (base.length === 0) throw new EvalFail('unsupported'); // 0^0
        return pq(q(1));
      }
      if (base.length - 1 > 0 && (base.length - 1) * Number(k) > MAX_DEGREE) throw new EvalFail('toobig');
      let r = pq(q(1));
      for (let i = 0n; i < k; i++) r = guard(pmul(r, base));
      if (negExp) return guard(pdivConst(pq(q(1)), r));
      return r;
    }
    case 'root': {
      const r = ev(n.radicand, x);
      if (!isConst(r)) throw new EvalFail('unsupported');
      const rq = toQ(constOf(r));
      if (!rq) throw new EvalFail('unsupported'); // nested radical
      if (rq.n < 0n) throw new EvalFail('unsupported'); // negative radicand
      const s = sqrtQ(rq);
      if (!s) throw new EvalFail('toobig');
      return s.terms.length ? [s] : [];
    }
  }
  throw new EvalFail('unsupported');
}

/**
 * @param {Node} n
 * @param {string} [x]
 * @returns {EvalResult}
 */
export function evaluate(n, x = 'x') {
  try {
    return { poly: ev(n, x) };
  } catch (e) {
    if (e instanceof EvalFail) return { fail: /** @type {any} */ (e).reason };
    if (e instanceof RangeError) return { fail: 'divzero' };
    return { fail: 'unsupported' };
  }
}

/**
 * L - R as a polynomial.
 * @param {Equation} e @param {string} [x]
 * @returns {EvalResult}
 */
export function evalEq(e, x = 'x') {
  const l = evaluate(e.lhs, x);
  if ('fail' in l) return l;
  const r = evaluate(e.rhs, x);
  if ('fail' in r) return r;
  try {
    return { poly: padd(l.poly, pneg(r.poly)) };
  } catch {
    return { fail: 'toobig' };
  }
}

/**
 * Numeric value of a variable-free expression, as a Surd.
 * @param {Node} n
 * @returns {{ value: import('./surd.js').Surd } | { fail: string }}
 */
export function evalNumber(n) {
  const r = evaluate(n, '\u0000');
  if ('fail' in r) return r;
  if (!isConst(r.poly)) return { fail: 'unsupported' };
  return { value: r.poly.length ? r.poly[0] : SZERO };
}

