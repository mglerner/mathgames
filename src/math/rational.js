// @ts-check
// Exact rationals on BigInt. A Q is always in lowest terms with d > 0.
// Floats never appear here. API (DESIGN.md section 11): q add sub mul div neg cmp qeq.
// Extras used by the rest of src/math are exported too (see the bottom half).

/** @typedef {import('../../types.d.ts').Q} Q */

/**
 * Thrown inside src/math when a computation would exceed a size cap (huge
 * exponents, runaway expansion). Every public entry point that takes
 * user-typed input catches it and answers "undefined = cannot verify".
 */
export class MathLimit extends Error {
  /** @param {string} what */
  constructor(what) {
    super(`math limit: ${what}`);
    this.name = 'MathLimit';
  }
}

/** Largest bit length any single integer is allowed to reach in a power. */
export const MAX_BITS = 20000;

/**
 * @param {bigint | number} x
 * @returns {bigint}
 */
function toBig(x) {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'number' && Number.isSafeInteger(x)) return BigInt(x);
  throw new TypeError(`rational: need a bigint or a safe integer, got ${String(x)}`);
}

/**
 * Nonnegative gcd; gcd(0, 0) = 0.
 * @param {bigint} a @param {bigint} b
 * @returns {bigint}
 */
export function gcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b !== 0n) { const t = a % b; a = b; b = t; }
  return a;
}

/**
 * Build n/d in lowest terms with d > 0. Throws on d = 0 or a non-integer.
 * @param {bigint | number} n
 * @param {bigint | number} [d]
 * @returns {Q}
 */
export function q(n, d = 1n) {
  let nn = toBig(n);
  let dd = toBig(d);
  if (dd === 0n) throw new RangeError('rational: zero denominator');
  if (dd < 0n) { nn = -nn; dd = -dd; }
  const g = gcd(nn, dd);
  return g === 1n ? { n: nn, d: dd } : { n: nn / g, d: dd / g };
}

/** @type {Q} */
export const ZERO = Object.freeze({ n: 0n, d: 1n });
/** @type {Q} */
export const ONE = Object.freeze({ n: 1n, d: 1n });

/** @param {Q} a @param {Q} b @returns {Q} */
export function add(a, b) { return q(a.n * b.d + b.n * a.d, a.d * b.d); }
/** @param {Q} a @param {Q} b @returns {Q} */
export function sub(a, b) { return q(a.n * b.d - b.n * a.d, a.d * b.d); }
/** @param {Q} a @param {Q} b @returns {Q} */
export function mul(a, b) { return q(a.n * b.n, a.d * b.d); }
/**
 * Throws RangeError on division by zero.
 * @param {Q} a @param {Q} b @returns {Q}
 */
export function div(a, b) {
  if (b.n === 0n) throw new RangeError('rational: division by zero');
  return q(a.n * b.d, a.d * b.n);
}
/** @param {Q} a @returns {Q} */
export function neg(a) { return { n: -a.n, d: a.d }; }
/** @param {Q} a @param {Q} b @returns {-1 | 0 | 1} */
export function cmp(a, b) {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}
/** @param {Q} a @param {Q} b @returns {boolean} */
export function qeq(a, b) { return a.n === b.n && a.d === b.d; }

// ---------------------------------------------------------------- extras

/** @param {Q} a @returns {boolean} */
export function isZero(a) { return a.n === 0n; }
/** @param {Q} a @returns {boolean} */
export function isInt(a) { return a.d === 1n; }
/** @param {Q} a @returns {-1 | 0 | 1} */
export function sign(a) { return a.n < 0n ? -1 : a.n > 0n ? 1 : 0; }
/** @param {Q} a @returns {Q} */
export function abs(a) { return a.n < 0n ? { n: -a.n, d: a.d } : a; }

/** Save format "n/d" (always with the slash). @param {Q} a @returns {string} */
export function qstr(a) { return `${a.n}/${a.d}`; }
/**
 * Inverse of qstr; also accepts a bare integer. Returns undefined on anything else.
 * @param {string} s
 * @returns {Q | undefined}
 */
export function qparse(s) {
  const m = /^(-?\d+)(?:\/(\d+))?$/.exec(s);
  if (!m) return undefined;
  const d = m[2] === undefined ? 1n : BigInt(m[2]);
  if (d === 0n) return undefined;
  return q(BigInt(m[1]), d);
}

/** Upper bound on the bit length of |x| (exact to within 3 bits). @param {bigint} x @returns {number} */
export function bitLength(x) {
  if (x < 0n) x = -x;
  return x === 0n ? 0 : x.toString(16).length * 4;
}

/**
 * a^e for an integer e, exactly. Returns undefined for 0^0 and 0^negative.
 * Throws MathLimit if the result would be enormous.
 * @param {Q} a
 * @param {bigint | number} e
 * @returns {Q | undefined}
 */
export function qpow(a, e) {
  let ee = toBig(e);
  if (a.n === 0n) return ee > 0n ? ZERO : undefined;
  let base = a;
  if (ee < 0n) { base = q(a.d, a.n); ee = -ee; }
  if (ee > BigInt(MAX_BITS)) {
    if ((base.n === 1n || base.n === -1n) && base.d === 1n) return (base.n === 1n || ee % 2n === 0n) ? ONE : q(-1n);
    throw new MathLimit('exponent too large');
  }
  const k = Number(ee);
  if (Math.max(bitLength(base.n), bitLength(base.d)) * k > MAX_BITS) throw new MathLimit('power too large');
  return { n: base.n ** ee, d: base.d ** ee };
}

/**
 * floor(sqrt(n)) for n >= 0.
 * @param {bigint} n
 * @returns {bigint}
 */
export function isqrt(n) {
  if (n < 0n) throw new RangeError('isqrt of a negative number');
  if (n < 2n) return n;
  let x = 1n << BigInt((bitLength(n) >> 1) + 2);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/**
 * Exact integer k-th root of n >= 0 (k >= 1), or undefined if n is not a perfect k-th power.
 * @param {bigint} n
 * @param {number} k
 * @returns {bigint | undefined}
 */
export function exactRoot(n, k) {
  if (n < 0n || k < 1) return undefined;
  if (n < 2n || k === 1) return n;
  if (k === 2) { const r = isqrt(n); return r * r === n ? r : undefined; }
  const kk = BigInt(k);
  let lo = 1n;
  let hi = 1n << BigInt(Math.ceil(bitLength(n) / k) + 1);
  while (lo < hi) {
    const mid = (lo + hi + 1n) >> 1n;
    if (mid ** kk <= n) lo = mid; else hi = mid - 1n;
  }
  return lo ** kk === n ? lo : undefined;
}
