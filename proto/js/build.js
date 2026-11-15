// @ts-check
// Canonical display trees for exact values: a Surd as (p/q) sqrt(n) terms, a rational
// polynomial in descending powers. Used for "the answer" and for Lantern/Scale readouts.
import { num, v, add, mul, neg, frac, pow, root } from './ast.js';
import { q, neg as qneg } from './rational.js';

/** @typedef {import('./ast.js').Node} Node */
/** @typedef {import('./rational.js').Q} Q */
/** @typedef {import('./surd.js').Surd} Surd */

/** @param {Q} c @param {bigint} rad @returns {Node} nonnegative c only */
function posTerm(c, rad) {
  if (rad === 1n) return c.d === 1n ? num(c.n) : frac(num(c.n), num(c.d));
  const r = root(num(rad));
  const top = c.n === 1n ? r : mul(num(c.n), r);
  return c.d === 1n ? top : frac(top, num(c.d));
}

/** @param {Surd} s @returns {Node} */
export function surdToNode(s) {
  if (s.terms.length === 0) return num(0);
  // irrational terms first, then the rational part: "2sqrt3 + 1"
  const ts = s.terms.slice().sort((a, b) => (a.rad === 1n ? 1 : 0) - (b.rad === 1n ? 1 : 0));
  /** @type {Node[]} */
  const parts = ts.map((t) => {
    const negative = t.coef.n < 0n;
    const body = posTerm(negative ? qneg(t.coef) : t.coef, t.rad);
    return negative ? neg(body) : body;
  });
  return parts.length === 1 ? parts[0] : add(...parts);
}

/**
 * @param {Q[]} coefs coefs[k] is the coefficient of x^k
 * @param {string} [x]
 * @returns {Node}
 */
export function polyToNode(coefs, x = 'x') {
  /** @type {Node[]} */
  const parts = [];
  for (let k = coefs.length - 1; k >= 0; k--) {
    const c = coefs[k];
    if (c.n === 0n) continue;
    const negative = c.n < 0n;
    const a = negative ? q(-c.n, c.d) : c;
    const xpart = k === 0 ? null : k === 1 ? v(x) : pow(v(x), num(k));
    /** @type {Node} */
    let body;
    if (!xpart) body = a.d === 1n ? num(a.n) : frac(num(a.n), num(a.d));
    else if (a.n === 1n && a.d === 1n) body = xpart;
    else if (a.d === 1n) body = mul(num(a.n), xpart);
    else body = mul(frac(num(a.n), num(a.d)), xpart);
    parts.push(negative ? neg(body) : body);
  }
  if (parts.length === 0) return num(0);
  return parts.length === 1 ? parts[0] : add(...parts);
}
