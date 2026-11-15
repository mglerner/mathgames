// @ts-check
// Exact surds: sums of coef x sqrt(rad), rad a squarefree positive integer (rad 1 = rational).
// Square roots of distinct squarefree integers are linearly independent over Q, so the
// canonical form below (sorted by rad, merged, zero terms dropped) makes equality a proof.
import { q, add, mul, div, neg, isZero, qeq, qfloat, ZERO } from './rational.js';

/** @typedef {import('./rational.js').Q} Q */
/** @typedef {{ coef: Q, rad: bigint }} Term */
/** @typedef {{ terms: Term[] }} Surd */

/** Largest radicand we will factor (trial division in Number arithmetic stays exact below 2^53). */
export const MAX_RADICAND = 1000000000000n;

/** @param {Term[]} terms @returns {Surd} */
function canon(terms) {
  /** @type {Map<bigint, Q>} */
  const m = new Map();
  for (const t of terms) {
    const prev = m.get(t.rad);
    m.set(t.rad, prev ? add(prev, t.coef) : t.coef);
  }
  const out = [];
  for (const [rad, coef] of m) if (!isZero(coef)) out.push({ coef, rad });
  out.sort((a, b) => (a.rad < b.rad ? -1 : a.rad > b.rad ? 1 : 0));
  return { terms: out };
}

/** @param {Q} c @returns {Surd} */
export const sq = (c) => canon([{ coef: c, rad: 1n }]);
export const SZERO = /** @type {Surd} */ ({ terms: [] });

/**
 * m = out^2 x inn with inn squarefree. Returns undefined when m is too large to factor.
 * @param {bigint} m nonnegative
 * @returns {{ out: bigint, inn: bigint } | undefined}
 */
export function squarefreeSplit(m) {
  if (m < 0n) throw new RangeError('negative');
  if (m > MAX_RADICAND) return undefined;
  let rest = Number(m);
  let out = 1;
  let inn = 1;
  for (let p = 2; p * p <= rest; p++) {
    let e = 0;
    while (rest % p === 0) {
      rest /= p;
      e++;
    }
    for (let i = 0; i < Math.floor(e / 2); i++) out *= p;
    if (e % 2 === 1) inn *= p;
  }
  inn *= rest; // leftover prime (or 1, or 0 when m = 0)
  return { out: BigInt(out), inn: BigInt(inn) };
}

/** @param {bigint} n */
export function isSquarefree(n) {
  const s = squarefreeSplit(n);
  return !!s && s.out === 1n;
}

/**
 * sqrt of a rational, exactly. Undefined for negative or unfactorable input.
 * @param {Q} a
 * @returns {Surd | undefined}
 */
export function sqrtQ(a) {
  if (a.n < 0n) return undefined;
  if (a.n === 0n) return SZERO;
  // sqrt(n/d) = sqrt(n d) / d
  const s = squarefreeSplit(a.n * a.d);
  if (!s) return undefined;
  return canon([{ coef: q(s.out, a.d), rad: s.inn }]);
}

/** @param {Surd} a @param {Surd} b */
export const sadd = (a, b) => canon([...a.terms, ...b.terms]);
/** @param {Surd} a */
export const sneg = (a) => ({ terms: a.terms.map((t) => ({ coef: neg(t.coef), rad: t.rad })) });
/** @param {Surd} a @param {Surd} b */
export const ssub = (a, b) => sadd(a, sneg(b));

/** @param {bigint} a @param {bigint} b */
function bgcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** @param {Surd} a @param {Surd} b */
export function smul(a, b) {
  /** @type {Term[]} */
  const out = [];
  for (const s of a.terms)
    for (const t of b.terms) {
      // sqrt(r1) sqrt(r2) = g sqrt(r1 r2 / g^2), g = gcd(r1, r2); r1 r2 / g^2 is squarefree
      const g = bgcd(s.rad, t.rad);
      out.push({ coef: mul(mul(s.coef, t.coef), q(g)), rad: (s.rad / g) * (t.rad / g) });
    }
  return canon(out);
}

/** @param {Surd} a */
export const sIsZero = (a) => a.terms.length === 0;

/**
 * a / b. Only single-term divisors are supported (undefined otherwise); throws on b = 0.
 * @param {Surd} a @param {Surd} b
 * @returns {Surd | undefined}
 */
export function sdiv(a, b) {
  if (sIsZero(b)) throw new RangeError('division by zero');
  if (b.terms.length !== 1) return undefined;
  const { coef, rad } = b.terms[0];
  // 1 / (c sqrt r) = sqrt(r) / (c r)
  const inv = canon([{ coef: div(q(1), mul(coef, q(rad))), rad }]);
  return smul(a, inv);
}

/** @param {Surd} a @param {Surd} b */
export function seq(a, b) {
  if (a.terms.length !== b.terms.length) return false;
  for (let i = 0; i < a.terms.length; i++) {
    if (a.terms[i].rad !== b.terms[i].rad || !qeq(a.terms[i].coef, b.terms[i].coef)) return false;
  }
  return true;
}

/** @param {Surd} a */
export const isRational = (a) => a.terms.length === 0 || (a.terms.length === 1 && a.terms[0].rad === 1n);

/** @param {Surd} a @returns {Q | undefined} */
export function toQ(a) {
  if (a.terms.length === 0) return ZERO;
  if (a.terms.length === 1 && a.terms[0].rad === 1n) return a.terms[0].coef;
  return undefined;
}

/** Display only. @param {Surd} a */
export function sfloat(a) {
  let x = 0;
  for (const t of a.terms) x += qfloat(t.coef) * Math.sqrt(Number(t.rad));
  return x;
}

/**
 * Display only: "about" decimal string to 2 places.
 * @param {Surd} a
 */
export function approx(a, places = 2) {
  const x = sfloat(a);
  const s = x.toFixed(places);
  return s === '-0.00' ? '0.00' : s;
}

/** @param {Surd} a @returns {string} debug text like "2 sqrt(3) + 1/2" */
export function sstr(a) {
  if (a.terms.length === 0) return '0';
  return a.terms
    .map((t) => {
      const c = t.coef.d === 1n ? `${t.coef.n}` : `${t.coef.n}/${t.coef.d}`;
      return t.rad === 1n ? c : `${c} sqrt(${t.rad})`;
    })
    .join(' + ');
}
