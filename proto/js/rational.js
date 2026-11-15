// @ts-check
// Exact rationals over BigInt. Q is always in lowest terms with d > 0.

/** @typedef {{ n: bigint, d: bigint }} Q */

/** @param {bigint} a @param {bigint} b @returns {bigint} */
export function gcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/**
 * @param {bigint | number} n
 * @param {bigint | number} [d]
 * @returns {Q}
 */
export function q(n, d = 1n) {
  let N = BigInt(n);
  let D = BigInt(d);
  if (D === 0n) throw new RangeError('zero denominator');
  if (D < 0n) {
    N = -N;
    D = -D;
  }
  const g = gcd(N, D);
  if (g > 1n) {
    N /= g;
    D /= g;
  }
  return { n: N, d: D };
}

export const ZERO = q(0);
export const ONE = q(1);

/** @param {Q} a @param {Q} b */
export const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
/** @param {Q} a @param {Q} b */
export const sub = (a, b) => q(a.n * b.d - b.n * a.d, a.d * b.d);
/** @param {Q} a @param {Q} b */
export const mul = (a, b) => q(a.n * b.n, a.d * b.d);
/** @param {Q} a @param {Q} b */
export function div(a, b) {
  if (b.n === 0n) throw new RangeError('division by zero');
  return q(a.n * b.d, a.d * b.n);
}
/** @param {Q} a */
export const neg = (a) => ({ n: -a.n, d: a.d });
/** @param {Q} a @param {Q} b @returns {-1 | 0 | 1} */
export function cmp(a, b) {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
}
/** @param {Q} a @param {Q} b */
export const qeq = (a, b) => a.n === b.n && a.d === b.d;
/** @param {Q} a */
export const isZero = (a) => a.n === 0n;
/** @param {Q} a */
export const isInt = (a) => a.d === 1n;

/** @param {Q} a @returns {string} "4/3", "-2" */
export function qstr(a) {
  return a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`;
}

/**
 * Display only: a float approximation. Never used in a check.
 * @param {Q} a
 */
export function qfloat(a) {
  return Number(a.n) / Number(a.d);
}
