// @ts-check
// Exact arithmetic on sums of coef x sqrt(rad), rad squarefree, rad 1 = rational.
// Canonical form: terms sorted by rad ascending, no zero coefficient, at most one
// term per rad. Square roots of distinct squarefree integers are linearly
// independent over Q, so two Surds are equal exactly when their canonical term
// lists match: seq is a proof, never an approximation.
// API (DESIGN.md section 11): sadd smul seq sqrtQ approx. The rest are extras.

import { q, add, mul, neg, qeq, gcd, isqrt, bitLength, ZERO, ONE, MathLimit, MAX_BITS } from './rational.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').Node} Node */

/** @type {Surd} */
export const SZERO = Object.freeze({ terms: [] });
/** @type {Surd} */
export const SONE = Object.freeze({ terms: [{ coef: ONE, rad: 1n }] });

/**
 * @param {{ coef: Q; rad: bigint }[]} terms any order, repeats allowed, rads already squarefree
 * @returns {Surd}
 */
function canon(terms) {
  /** @type {Map<bigint, Q>} */
  const m = new Map();
  for (const t of terms) {
    const prev = m.get(t.rad);
    m.set(t.rad, prev ? add(prev, t.coef) : t.coef);
  }
  const out = [];
  for (const [rad, coef] of m) if (coef.n !== 0n) out.push({ coef, rad });
  out.sort((a, b) => (a.rad < b.rad ? -1 : a.rad > b.rad ? 1 : 0));
  return { terms: out };
}

/** @param {Q} a @returns {Surd} */
export function fromQ(a) { return a.n === 0n ? SZERO : { terms: [{ coef: a, rad: 1n }] }; }
/** @param {bigint | number} n @param {bigint | number} [d] @returns {Surd} */
export function sq(n, d = 1n) { return fromQ(q(n, d)); }

/** The rational value of a, or undefined if a has an irrational part. @param {Surd} a @returns {Q | undefined} */
export function toQ(a) {
  if (a.terms.length === 0) return ZERO;
  if (a.terms.length === 1 && a.terms[0].rad === 1n) return a.terms[0].coef;
  return undefined;
}
/** @param {Surd} a @returns {boolean} */
export function sIsZero(a) { return a.terms.length === 0; }

/** @param {Surd} a @param {Surd} b @returns {Surd} */
export function sadd(a, b) { return canon([...a.terms, ...b.terms]); }
/** @param {Surd} a @returns {Surd} */
export function sneg(a) { return { terms: a.terms.map((t) => ({ coef: neg(t.coef), rad: t.rad })) }; }
/** @param {Surd} a @param {Surd} b @returns {Surd} */
export function ssub(a, b) { return sadd(a, sneg(b)); }
/** @param {Surd} a @param {Q} k @returns {Surd} */
export function sscale(a, k) {
  if (k.n === 0n) return SZERO;
  return { terms: a.terms.map((t) => ({ coef: mul(t.coef, k), rad: t.rad })) };
}

/** @param {Surd} a @param {Surd} b @returns {Surd} */
export function smul(a, b) {
  const out = [];
  for (const x of a.terms) {
    for (const y of b.terms) {
      // sqrt(r1) sqrt(r2) = g sqrt((r1/g)(r2/g)), g = gcd(r1, r2); the product stays squarefree.
      const g = gcd(x.rad, y.rad);
      out.push({ coef: mul(mul(x.coef, y.coef), q(g)), rad: (x.rad / g) * (y.rad / g) });
    }
  }
  return canon(out);
}

/** Exact equality. @param {Surd} a @param {Surd} b @returns {boolean} */
export function seq(a, b) {
  if (a.terms.length !== b.terms.length) return false;
  for (let i = 0; i < a.terms.length; i++) {
    if (a.terms[i].rad !== b.terms[i].rad || !qeq(a.terms[i].coef, b.terms[i].coef)) return false;
  }
  return true;
}

const TRIAL_LIMIT = 1000000000000n; // 1e12: complete trial division is cheap below this

/**
 * Write m > 0 as out^2 x in with `in` squarefree. Returns undefined when m is
 * too large to factor completely (and is not a perfect square after its small
 * prime factors are removed): the caller then answers "cannot verify".
 * @param {bigint} m
 * @returns {{ out: bigint; in: bigint } | undefined}
 */
export function squarePart(m) {
  if (m <= 0n) throw new RangeError('squarePart needs a positive integer');
  let out = 1n;
  let inn = 1n;
  if (m > TRIAL_LIMIT) {
    const r = isqrt(m);
    if (r * r === m) return { out: r, in: 1n };
    for (let p = 2n; p < 1000n && m > TRIAL_LIMIT; p++) {
      const pp = p * p;
      while (m % pp === 0n) { out *= p; m /= pp; }
      if (m % p === 0n) { inn *= p; m /= p; }
    }
    if (m > TRIAL_LIMIT) {
      const r2 = isqrt(m);
      if (r2 * r2 === m) return { out: out * r2, in: inn };
      return undefined;
    }
  }
  // m <= 1e12 < 2^53: plain integer arithmetic is exact here (no fractions involved).
  let k = Number(m);
  let o = 1;
  let i = 1;
  for (let p = 2; p * p <= k; p += (p === 2 ? 1 : 2)) {
    const pp = p * p;
    while (k % pp === 0) { o *= p; k /= pp; }
    if (k % p === 0) { i *= p; k /= p; }
  }
  i *= k; // what is left is 1 or a prime
  // inn (from the big-number stage) and i can share a prime only if that prime
  // was already removed from m completely, which leaves it out of k; so the
  // product is squarefree.
  return { out: out * BigInt(o), in: inn * BigInt(i) };
}

/**
 * sqrt of a rational, as an exact Surd. undefined for a negative input or one
 * too large to factor (see squarePart).
 * @param {Q} a
 * @returns {Surd | undefined}
 */
export function sqrtQ(a) {
  if (a.n < 0n) return undefined;
  if (a.n === 0n) return SZERO;
  // sqrt(n/d) = sqrt(n d) / d
  const sp = squarePart(a.n * a.d);
  if (!sp) return undefined;
  return { terms: [{ coef: q(sp.out, a.d), rad: sp.in }] };
}

/**
 * Split a (two or more terms, or one irrational term) as A + B sqrt(g) where
 * g > 1 and no radical in A, B is divisible by g or shares a factor with it.
 * @param {Surd} a
 * @returns {{ g: bigint; A: Surd; B: Surd }}
 */
function split(a) {
  let g = 0n;
  for (const t of a.terms) if (t.rad > 1n && (g === 0n || t.rad < g)) g = t.rad;
  // Refine g until every rad is either a multiple of g or coprime to it.
  for (let changed = true; changed;) {
    changed = false;
    for (const t of a.terms) {
      const h = gcd(g, t.rad);
      if (h !== 1n && h !== g) { g = h; changed = true; }
    }
  }
  const A = [];
  const B = [];
  for (const t of a.terms) {
    if (t.rad % g === 0n) B.push({ coef: t.coef, rad: t.rad / g });
    else A.push(t);
  }
  return { g, A: canon(A), B: canon(B) };
}

/**
 * Exact sign of a Surd: -1, 0 or 1. No floating point.
 * @param {Surd} a
 * @returns {-1 | 0 | 1}
 */
export function ssign(a) {
  if (a.terms.length === 0) return 0;
  if (a.terms.length === 1) return a.terms[0].coef.n < 0n ? -1 : 1;
  const { g, A, B } = split(a);
  const sa = ssign(A);
  const sb = ssign(B);
  if (sa === 0) return sb;
  if (sb === 0 || sa === sb) return sa;
  // Opposite signs: |A| vs |B| sqrt(g)  <=>  A^2 vs g B^2 (neither involves sqrt(g)).
  const d = ssign(ssub(smul(A, A), sscale(smul(B, B), q(g))));
  return /** @type {-1 | 0 | 1} */ (sa * d);
}

/** @param {Surd} a @param {Surd} b @returns {-1 | 0 | 1} */
export function scmp(a, b) { return ssign(ssub(a, b)); }

/**
 * 1 / a, exactly (repeated conjugates). undefined for a = 0.
 * @param {Surd} a
 * @returns {Surd | undefined}
 */
export function sinv(a) {
  if (a.terms.length === 0) return undefined;
  if (a.terms.length === 1) {
    const t = a.terms[0];
    // 1 / (c sqrt(r)) = sqrt(r) / (c r)
    return { terms: [{ coef: q(t.coef.d, t.coef.n * t.rad), rad: t.rad }] };
  }
  const { g, A, B } = split(a);
  // 1 / (A + B sqrt(g)) = (A - B sqrt(g)) / (A^2 - g B^2); the denominator is
  // nonzero because sqrt(g) is not in the field that A and B live in.
  const den = sinv(ssub(smul(A, A), sscale(smul(B, B), q(g))));
  if (!den) return undefined;
  const sqrtG = { terms: [{ coef: ONE, rad: g }] };
  return smul(ssub(A, smul(B, sqrtG)), den);
}

/** a / b, or undefined when b = 0. @param {Surd} a @param {Surd} b @returns {Surd | undefined} */
export function sdiv(a, b) {
  const i = sinv(b);
  return i ? smul(a, i) : undefined;
}

/** @param {Surd} a */
function checkSize(a) {
  for (const t of a.terms) {
    if (bitLength(t.coef.n) > MAX_BITS || bitLength(t.coef.d) > MAX_BITS) throw new MathLimit('surd too large');
  }
}

/**
 * a^e for an integer e. undefined for 0^0 and 0^negative. Throws MathLimit on a huge result.
 * @param {Surd} a
 * @param {number} e
 * @returns {Surd | undefined}
 */
export function spow(a, e) {
  if (!Number.isSafeInteger(e)) throw new MathLimit('exponent too large');
  if (a.terms.length === 0) return e > 0 ? SZERO : undefined;
  /** @type {Surd | undefined} */
  let base = a;
  if (e < 0) { base = sinv(a); e = -e; }
  if (!base) return undefined;
  if (seq(base, SONE)) return SONE;
  if (e > MAX_BITS) throw new MathLimit('exponent too large');
  let result = SONE;
  let b = base;
  while (e > 0) {
    if (e & 1) { result = smul(result, b); checkSize(result); }
    e >>= 1;
    if (e > 0) { b = smul(b, b); checkSize(b); }
  }
  return result;
}

/**
 * Decimal string rounded to `places` digits. DISPLAY ONLY: never use the
 * result in a correctness check. Rationals are rounded exactly (half away from
 * zero); irrational values are computed with 12 guard digits.
 * @param {Surd} a
 * @param {number} places
 * @returns {string}
 */
export function approx(a, places) {
  const p = Math.max(0, Math.min(60, Math.trunc(places) || 0));
  const P = 10n ** BigInt(p);
  /** @type {bigint} */
  let r; // |value| x 10^p, rounded
  let negative = false;
  const rat = toQ(a);
  if (rat) {
    negative = rat.n < 0n;
    const n = negative ? -rat.n : rat.n;
    r = (2n * n * P + rat.d) / (2n * rat.d);
  } else {
    const guard = 10n ** 12n;
    const S = P * guard;
    let total = 0n;
    for (const t of a.terms) {
      const root = t.rad === 1n ? S : isqrt(t.rad * S * S);
      total += (t.coef.n * root) / t.coef.d;
    }
    negative = total < 0n;
    if (negative) total = -total;
    r = (total + guard / 2n) / guard;
  }
  if (r === 0n) negative = false;
  const digits = r.toString().padStart(p + 1, '0');
  const body = p === 0 ? digits : `${digits.slice(0, digits.length - p)}.${digits.slice(digits.length - p)}`;
  return negative ? `-${body}` : body;
}

/**
 * A Surd as a display tree: rational part first, then radicals by ascending
 * radicand, e.g. 1 - 2sqrt(3), sqrt(3)/2, -1/2. evaluate(surdToNode(s), {}) is s.
 * @param {Surd} a
 * @returns {Node}
 */
export function surdToNode(a) {
  if (a.terms.length === 0) return { t: 'num', q: ZERO };
  /** @param {bigint} n @returns {Node} */
  const int = (n) => ({ t: 'num', q: { n, d: 1n } });
  /** @type {Node[]} */
  const parts = a.terms.map((t) => {
    const negative = t.coef.n < 0n;
    const n = negative ? -t.coef.n : t.coef.n;
    const d = t.coef.d;
    /** @type {Node} */
    let body;
    if (t.rad === 1n) {
      body = d === 1n ? int(n) : { t: 'frac', num: int(n), den: int(d) };
    } else {
      /** @type {Node} */
      const rt = { t: 'root', index: 2, radicand: int(t.rad) };
      /** @type {Node} */
      const top = n === 1n ? rt : { t: 'mul', args: [int(n), rt] };
      body = d === 1n ? top : { t: 'frac', num: top, den: int(d) };
    }
    return negative ? { t: 'neg', arg: body } : body;
  });
  return parts.length === 1 ? parts[0] : { t: 'add', args: parts };
}
