// @ts-check
// Exact evaluation of a Node at rational (or surd) values of its variables.
// The result is a Surd, or undefined when the value is not defined (division
// by zero, negative radicand, 0^0, unbound variable) or not representable as a
// sum of rational multiples of square roots (nested radicals, cube roots of
// non-cubes, ...), or too large. Never a float, never a guess.

import { q, qpow, exactRoot, MathLimit } from './rational.js';
import { fromQ, toQ, sadd, smul, sneg, sinv, spow, sqrtQ, SZERO, SONE, sIsZero } from './surd.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Env} Env */

/** Largest |integer exponent| evaluated on a non-rational base. */
const MAX_EXP = 4096;

/**
 * base^(e) for a Surd base and a rational exponent e, exactly, or undefined.
 * Non-integer exponents need a nonnegative rational base (radicands are never
 * negative in v1) with an exact root.
 * @param {Surd} base
 * @param {Q} e
 * @returns {Surd | undefined}
 */
export function powSurd(base, e) {
  const b = toQ(base);
  if (e.d === 1n) {
    if (b) { const r = qpow(b, e.n); return r ? fromQ(r) : undefined; }
    if (e.n > BigInt(MAX_EXP) || e.n < -BigInt(MAX_EXP)) throw new MathLimit('exponent too large');
    return spow(base, Number(e.n));
  }
  if (!b || b.n < 0n) return undefined;
  if (b.n === 0n) return e.n > 0n ? SZERO : undefined;
  if (e.d > 64n) return undefined;
  const k = Number(e.d);
  if (k === 2) {
    const r = sqrtQ(b);
    if (!r) return undefined;
    if (e.n > BigInt(MAX_EXP) || e.n < -BigInt(MAX_EXP)) throw new MathLimit('exponent too large');
    return spow(r, Number(e.n));
  }
  const rn = exactRoot(b.n, k);
  const rd = exactRoot(b.d, k);
  if (rn !== undefined && rd !== undefined) {
    const r = qpow(q(rn, rd), e.n);
    return r ? fromQ(r) : undefined;
  }
  // No rational k-th root. For k = 2m the value can still be a surd:
  // b^(p/2m) = sqrt(b^(1/m))^p when b has an exact m-th root (4^(1/4) = sqrt(2)).
  // This is complete: b^(1/2m) = sqrt(s) with s rational forces b = s^m.
  if (k % 2 !== 0) return undefined;
  const mn = exactRoot(b.n, k / 2);
  const md = exactRoot(b.d, k / 2);
  if (mn === undefined || md === undefined) return undefined;
  const s = sqrtQ(q(mn, md));
  if (!s) return undefined;
  if (e.n > BigInt(MAX_EXP) || e.n < -BigInt(MAX_EXP)) throw new MathLimit('exponent too large');
  return spow(s, Number(e.n));
}

/**
 * @param {Node} n
 * @param {Record<string, Surd>} env
 * @returns {Surd | undefined}
 */
function ev(n, env) {
  switch (n.t) {
    case 'num': return fromQ(n.q);
    case 'var': return Object.prototype.hasOwnProperty.call(env, n.name) ? env[n.name] : undefined;
    case 'group': return ev(n.arg, env);
    case 'neg': { const a = ev(n.arg, env); return a && sneg(a); }
    case 'add': {
      let acc = SZERO;
      for (const c of n.args) { const x = ev(c, env); if (!x) return undefined; acc = sadd(acc, x); }
      return acc;
    }
    case 'mul': {
      let acc = SONE;
      for (const c of n.args) { const x = ev(c, env); if (!x) return undefined; acc = smul(acc, x); }
      return acc;
    }
    case 'frac': {
      const a = ev(n.num, env);
      const b = ev(n.den, env);
      if (!a || !b || sIsZero(b)) return undefined;
      const inv = sinv(b);
      return inv && smul(a, inv);
    }
    case 'pow': {
      const b = ev(n.base, env);
      const e = ev(n.exp, env);
      if (!b || !e) return undefined;
      const eq = toQ(e);
      if (!eq) return undefined;
      return powSurd(b, eq);
    }
    case 'root': {
      const r = ev(n.radicand, env);
      if (!r) return undefined;
      if (!Number.isSafeInteger(n.index) || n.index < 2) return undefined;
      return powSurd(r, q(1, n.index));
    }
  }
}

/**
 * Evaluate with Surd-valued variables (used to substitute exact roots).
 * @param {Node} n
 * @param {Record<string, Surd>} env
 * @returns {Surd | undefined}
 */
export function evaluateS(n, env) {
  try {
    return ev(n, env);
  } catch (err) {
    if (err instanceof MathLimit || err instanceof RangeError) return undefined;
    throw err;
  }
}

/**
 * Evaluate a Node at rational values. API of DESIGN.md section 11.
 * @param {Node} n
 * @param {Env} env
 * @returns {Surd | undefined}
 */
export function evaluate(n, env) {
  /** @type {Record<string, Surd>} */
  const senv = {};
  for (const k of Object.keys(env)) senv[k] = fromQ(env[k]);
  return evaluateS(n, senv);
}

/**
 * The exact value of a variable-free Node, or undefined.
 * @param {Node} n
 * @returns {Surd | undefined}
 */
export function constValue(n) { return evaluateS(n, {}); }

/**
 * The rational value of a variable-free Node, or undefined (also undefined when irrational).
 * @param {Node} n
 * @returns {Q | undefined}
 */
export function constQ(n) {
  const s = evaluateS(n, {});
  return s && toQ(s);
}
