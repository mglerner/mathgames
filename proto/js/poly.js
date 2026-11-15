// @ts-check
// Polynomials in one variable with exact Surd coefficients. p[k] is the coefficient of x^k.
// Trailing zero coefficients are always trimmed, so the zero polynomial is [].
import { SZERO, sadd, sneg, smul, sdiv, seq, sIsZero, sq, toQ, isRational } from './surd.js';
import { q, mul as qmul } from './rational.js';

/** @typedef {import('./surd.js').Surd} Surd */
/** @typedef {import('./rational.js').Q} Q */
/** @typedef {Surd[]} Poly */

export const MAX_DEGREE = 12;

/** @param {Poly} p @returns {Poly} */
function trim(p) {
  let n = p.length;
  while (n > 0 && sIsZero(p[n - 1])) n--;
  return p.slice(0, n);
}

/** @param {Surd} c @returns {Poly} */
export const pconst = (c) => trim([c]);
/** @param {Q} c @returns {Poly} */
export const pq = (c) => trim([sq(c)]);
/** x^k with coefficient c */
export function pmono(/** @type {Q} */ c, /** @type {number} */ k) {
  /** @type {Poly} */
  const p = [];
  for (let i = 0; i < k; i++) p.push(SZERO);
  p.push(sq(c));
  return trim(p);
}

/** @param {Poly} a @param {Poly} b */
export function padd(a, b) {
  const n = Math.max(a.length, b.length);
  /** @type {Poly} */
  const out = [];
  for (let i = 0; i < n; i++) out.push(sadd(a[i] || SZERO, b[i] || SZERO));
  return trim(out);
}
/** @param {Poly} a */
export const pneg = (a) => a.map(sneg);
/** @param {Poly} a @param {Poly} b */
export const psub = (a, b) => padd(a, pneg(b));

/** @param {Poly} a @param {Poly} b */
export function pmul(a, b) {
  if (a.length === 0 || b.length === 0) return [];
  const deg = a.length - 1 + b.length - 1;
  if (deg > MAX_DEGREE) throw new EvalFail('toobig');
  /** @type {Poly} */
  const out = [];
  for (let i = 0; i <= deg; i++) out.push(SZERO);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) out[i + j] = sadd(out[i + j], smul(a[i], b[j]));
  return trim(out);
}

/** @param {Poly} p */
export const degree = (p) => p.length - 1; // -1 for the zero polynomial
/** @param {Poly} p */
export const isConst = (p) => p.length <= 1;
/** @param {Poly} p @returns {Surd} */
export const constOf = (p) => p[0] || SZERO;

/** @param {Poly} a @param {Poly} b */
export function peq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!seq(a[i], b[i])) return false;
  return true;
}

/** Scale every coefficient by a surd. @param {Poly} p @param {Surd} k */
export const pscale = (p, k) => trim(p.map((c) => smul(c, k)));

/**
 * Is a = k x b for some nonzero constant k? Returns k (a Surd) or undefined.
 * @param {Poly} a @param {Poly} b
 * @returns {Surd | undefined}
 */
export function multipleOf(a, b) {
  if (b.length === 0 || a.length !== b.length) return undefined;
  const top = b.length - 1;
  const k = sdiv(a[top], b[top]);
  if (!k || sIsZero(k)) return undefined;
  return peq(a, pscale(b, k)) ? k : undefined;
}

/**
 * Exact value at x = r (r rational).
 * @param {Poly} p @param {Q} r
 * @returns {Surd}
 */
export function pevalQ(p, r) {
  let acc = SZERO;
  let pow = q(1);
  for (let i = 0; i < p.length; i++) {
    acc = sadd(acc, smul(p[i], sq(pow)));
    pow = qmul(pow, r);
  }
  return acc;
}

/** @param {Poly} p @returns {Q[] | undefined} rational coefficients, or undefined */
export function rationalCoefs(p) {
  /** @type {Q[]} */
  const out = [];
  for (const c of p) {
    if (!isRational(c)) return undefined;
    out.push(/** @type {Q} */ (toQ(c)));
  }
  return out;
}

/** Thrown inside evaluation; caught at the module boundary. */
export class EvalFail extends Error {
  /** @param {'divzero' | 'unsupported' | 'toobig'} reason */
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

/** @param {Poly} a @param {Poly} b divisor must be a nonzero constant with one term */
export function pdivConst(a, b) {
  if (!isConst(b)) throw new EvalFail('unsupported');
  const c = constOf(b);
  if (sIsZero(c)) throw new EvalFail('divzero');
  /** @type {Poly} */
  const out = [];
  for (const t of a) {
    const r = sdiv(t, c);
    if (!r) throw new EvalFail('unsupported');
    out.push(r);
  }
  return trim(out);
}

/** Sum of the coefficients' absolute bit sizes; guards against runaway BigInt growth. */
export function pbits(/** @type {Poly} */ p) {
  let bits = 0;
  for (const c of p)
    for (const t of c.terms) bits += t.coef.n.toString(16).length + t.coef.d.toString(16).length + t.rad.toString(16).length;
  return bits * 4;
}
