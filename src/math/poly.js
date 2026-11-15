// @ts-check
// Multivariate polynomials with rational coefficients, in canonical expanded
// form: a map from monomial key to nonzero coefficient. Two polynomials are
// the same function exactly when their canonical forms match (polyEq), which
// is a proof. Also: rational functions as a pair of polynomials (toRat).
// API (DESIGN.md section 11): toPoly polyEq degree. The rest are extras.

import { q, add, mul, neg, div, qeq, qpow, isZero, ZERO, ONE, MathLimit } from './rational.js';
import { vars } from './ast.js';
import { constQ } from './evaluate.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Env} Env */
/**
 * Canonical polynomial. terms maps a monomial key ("" for the constant,
 * otherwise "x:2,y:1" with variables in ascending name order) to a nonzero Q.
 * @typedef {import('../../types.d.ts').Poly & { readonly terms: Map<string, Q> }} Poly
 */
/** @typedef {[string, number][]} Mono variable/exponent pairs, names ascending, exponents >= 1 */

/** Largest exponent toPoly will expand. */
export const MAX_POLY_EXP = 64;
/** Largest number of terms a polynomial may reach. */
export const MAX_POLY_TERMS = 3000;

/** @param {Mono} m @returns {string} */
function keyOf(m) { return m.map(([name, e]) => `${name}:${e}`).join(','); }
/** @param {string} key @returns {Mono} */
export function monoOf(key) {
  if (key === '') return [];
  return key.split(',').map((part) => {
    const i = part.lastIndexOf(':');
    return /** @type {[string, number]} */ ([part.slice(0, i), Number(part.slice(i + 1))]);
  });
}
/** @param {string} a @param {string} b @returns {string} */
function mulKeys(a, b) {
  if (a === '') return b;
  if (b === '') return a;
  /** @type {Map<string, number>} */
  const m = new Map(monoOf(a));
  for (const [name, e] of monoOf(b)) m.set(name, (m.get(name) ?? 0) + e);
  return keyOf([...m].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)));
}
/** @param {string} key @returns {number} */
function totalDegree(key) { let d = 0; for (const [, e] of monoOf(key)) d += e; return d; }

/**
 * Graded lexicographic order on monomial keys (a monomial order: it is
 * compatible with multiplication). Positive when a is the larger monomial.
 * @param {string} a @param {string} b @returns {number}
 */
export function cmpMono(a, b) {
  const da = totalDegree(a);
  const db = totalDegree(b);
  if (da !== db) return da - db;
  const ma = new Map(monoOf(a));
  const mb = new Map(monoOf(b));
  const names = [...new Set([...ma.keys(), ...mb.keys()])].sort();
  for (const name of names) {
    const ea = ma.get(name) ?? 0;
    const eb = mb.get(name) ?? 0;
    if (ea !== eb) return ea - eb;
  }
  return 0;
}

/** @param {Map<string, Q>} terms @returns {Poly} */
function mk(terms) {
  if (terms.size > MAX_POLY_TERMS) throw new MathLimit('polynomial has too many terms');
  return /** @type {Poly} */ (/** @type {unknown} */ ({ kind: 'poly', terms }));
}

/** @param {Q} c @returns {Poly} */
export function pconst(c) {
  /** @type {Map<string, Q>} */
  const m = new Map();
  if (!isZero(c)) m.set('', c);
  return mk(m);
}
/** @param {string} name @returns {Poly} */
export function pvar(name) {
  if (name.includes(':') || name.includes(',')) throw new RangeError('variable names may not contain ":" or ","');
  return mk(new Map([[`${name}:1`, ONE]]));
}
export const PZERO = pconst(ZERO);
export const PONE = pconst(ONE);

/** @param {Poly} a @param {Poly} b @returns {Poly} */
export function padd(a, b) {
  const m = new Map(a.terms);
  for (const [k, c] of b.terms) {
    const prev = m.get(k);
    const s = prev ? add(prev, c) : c;
    if (isZero(s)) m.delete(k); else m.set(k, s);
  }
  return mk(m);
}
/** @param {Poly} a @param {Q} k @returns {Poly} */
export function pscale(a, k) {
  /** @type {Map<string, Q>} */
  const m = new Map();
  if (!isZero(k)) for (const [key, c] of a.terms) m.set(key, mul(c, k));
  return mk(m);
}
/** @param {Poly} a @returns {Poly} */
export function pneg(a) {
  /** @type {Map<string, Q>} */
  const m = new Map();
  for (const [key, c] of a.terms) m.set(key, neg(c));
  return mk(m);
}
/** @param {Poly} a @param {Poly} b @returns {Poly} */
export function psub(a, b) { return padd(a, pneg(b)); }
/** @param {Poly} a @param {Poly} b @returns {Poly} */
export function pmul(a, b) {
  if (a.terms.size * b.terms.size > MAX_POLY_TERMS * 20) throw new MathLimit('polynomial product too large');
  /** @type {Map<string, Q>} */
  const m = new Map();
  for (const [ka, ca] of a.terms) {
    for (const [kb, cb] of b.terms) {
      const k = mulKeys(ka, kb);
      const prev = m.get(k);
      const s = prev ? add(prev, mul(ca, cb)) : mul(ca, cb);
      if (isZero(s)) m.delete(k); else m.set(k, s);
    }
  }
  return mk(m);
}
/** @param {Poly} a @param {number} e nonnegative integer @returns {Poly} */
export function ppow(a, e) {
  if (!Number.isInteger(e) || e < 0 || e > MAX_POLY_EXP) throw new MathLimit('polynomial exponent out of range');
  let result = PONE;
  for (let i = 0; i < e; i++) result = pmul(result, a);
  return result;
}

/** @param {Poly} a @returns {boolean} */
export function pIsZero(a) { return a.terms.size === 0; }
/** The constant value of a, or undefined if it has a variable. @param {Poly} a @returns {Q | undefined} */
export function pConstValue(a) {
  if (a.terms.size === 0) return ZERO;
  if (a.terms.size === 1) return a.terms.get('');
  return undefined;
}

/**
 * Equality of canonical forms: a proof that the two polynomials are identical.
 * @param {Poly} a @param {Poly} b @returns {boolean}
 */
export function polyEq(a, b) {
  if (a.terms.size !== b.terms.size) return false;
  for (const [k, c] of a.terms) {
    const d = b.terms.get(k);
    if (!d || !qeq(c, d)) return false;
  }
  return true;
}

/**
 * Total degree. The zero polynomial has degree -1 (so "degree + 1 points" is 0 points).
 * @param {Poly} p @returns {number}
 */
export function degree(p) {
  let d = -1;
  for (const k of p.terms.keys()) d = Math.max(d, totalDegree(k));
  return d;
}

/** Degree in one variable (0 if absent; -1 for the zero polynomial). @param {Poly} p @param {string} name @returns {number} */
export function degreeIn(p, name) {
  let d = -1;
  for (const k of p.terms.keys()) {
    let e = 0;
    for (const [nm, ex] of monoOf(k)) if (nm === name) e = ex;
    d = Math.max(d, e);
  }
  return d;
}

/** Sorted variable names that actually occur. @param {Poly} p @returns {string[]} */
export function polyVars(p) {
  /** @type {Set<string>} */
  const s = new Set();
  for (const k of p.terms.keys()) for (const [nm] of monoOf(k)) s.add(nm);
  return [...s].sort();
}

/**
 * Coefficients of a polynomial in the single variable `name`: [c0, c1, ...]
 * (the zero polynomial gives []). undefined if any other variable occurs.
 * @param {Poly} p @param {string} name
 * @returns {Q[] | undefined}
 */
export function coeffsIn(p, name) {
  /** @type {Q[]} */
  const out = [];
  for (const [k, c] of p.terms) {
    const m = monoOf(k);
    if (m.length > 1 || (m.length === 1 && m[0][0] !== name)) return undefined;
    const e = m.length === 0 ? 0 : m[0][1];
    while (out.length <= e) out.push(ZERO);
    out[e] = c;
  }
  return out;
}

/**
 * Terms from the largest monomial down (graded lexicographic order).
 * @param {Poly} p
 * @returns {{ key: string; coef: Q; mono: Mono }[]}
 */
export function polyTerms(p) {
  return [...p.terms].map(([key, coef]) => ({ key, coef, mono: monoOf(key) }))
    .sort((a, b) => cmpMono(b.key, a.key));
}

/** Leading term in graded lexicographic order, or undefined for the zero polynomial. @param {Poly} p */
export function leadTerm(p) {
  /** @type {{ key: string; coef: Q } | undefined} */
  let best;
  for (const [key, coef] of p.terms) if (!best || cmpMono(key, best.key) > 0) best = { key, coef };
  return best;
}

/**
 * Exact value at rational points. An independent path from evaluate.js: it
 * works on the canonical form, not the tree. undefined if a variable is unbound.
 * @param {Poly} p @param {Env} env
 * @returns {Q | undefined}
 */
export function polyEval(p, env) {
  let total = ZERO;
  for (const [k, c] of p.terms) {
    let t = c;
    for (const [name, e] of monoOf(k)) {
      if (!Object.prototype.hasOwnProperty.call(env, name)) return undefined;
      const pw = qpow(env[name], e);
      if (!pw) return undefined; // cannot happen: e >= 1
      t = mul(t, pw);
    }
    total = add(total, t);
  }
  return total;
}

/**
 * A display tree for p: terms in descending order, e.g. 2x^2 - 4x - 6.
 * toPoly(polyToNode(p)) equals p.
 * @param {Poly} p
 * @returns {Node}
 */
export function polyToNode(p) {
  const terms = polyTerms(p);
  if (terms.length === 0) return { t: 'num', q: ZERO };
  /** @type {Node[]} */
  const parts = terms.map(({ coef, mono }) => {
    const negative = coef.n < 0n;
    const c = negative ? neg(coef) : coef;
    /** @type {Node[]} */
    const factors = [];
    if (!qeq(c, ONE) || mono.length === 0) factors.push({ t: 'num', q: c });
    for (const [name, e] of mono) {
      /** @type {Node} */
      const x = { t: 'var', name };
      factors.push(e === 1 ? x : { t: 'pow', base: x, exp: { t: 'num', q: q(e) } });
    }
    /** @type {Node} */
    const body = factors.length === 1 ? factors[0] : { t: 'mul', args: factors };
    return negative ? { t: 'neg', arg: body } : body;
  });
  return parts.length === 1 ? parts[0] : { t: 'add', args: parts };
}

/** @param {Node} n @returns {boolean} */
function hasVar(n) { return vars(n).length > 0; }

/**
 * @param {Node} n
 * @returns {Poly | undefined}
 */
function toPolyInner(n) {
  if (n.t === 'group') return toPolyInner(n.arg);
  if (n.t === 'num') return pconst(n.q);
  if (n.t === 'var') return pvar(n.name);
  if (!hasVar(n)) {
    // A variable-free subtree is a constant; it is a polynomial only if rational.
    const c = constQ(n);
    return c ? pconst(c) : undefined;
  }
  switch (n.t) {
    case 'neg': { const a = toPolyInner(n.arg); return a && pneg(a); }
    case 'add': {
      let acc = PZERO;
      for (const c of n.args) { const x = toPolyInner(c); if (!x) return undefined; acc = padd(acc, x); }
      return acc;
    }
    case 'mul': {
      let acc = PONE;
      for (const c of n.args) { const x = toPolyInner(c); if (!x) return undefined; acc = pmul(acc, x); }
      return acc;
    }
    case 'frac': {
      if (hasVar(n.den)) return undefined;
      const d = constQ(n.den);
      const a = toPolyInner(n.num);
      if (!a || !d || isZero(d)) return undefined;
      return pscale(a, div(ONE, d));
    }
    case 'pow': {
      if (hasVar(n.exp)) return undefined;
      const e = constQ(n.exp);
      // x^0 is declined here on purpose: it is 1 only where the base is not 0,
      // and the rational-function path (toRat) records that condition.
      if (!e || e.d !== 1n || e.n < 1n || e.n > BigInt(MAX_POLY_EXP)) return undefined;
      const b = toPolyInner(n.base);
      return b && ppow(b, Number(e.n));
    }
    case 'root': return undefined;
  }
}

/**
 * The canonical expanded polynomial of n, or undefined if n is not a
 * polynomial with rational coefficients (variable in a denominator, a radical
 * of a variable, an irrational constant, a non-integer or negative or zero
 * power of a variable expression) or is too large to expand.
 * @param {Node} n
 * @returns {Poly | undefined}
 */
export function toPoly(n) {
  try {
    return toPolyInner(n);
  } catch (err) {
    if (err instanceof MathLimit || err instanceof RangeError) return undefined;
    throw err;
  }
}

// ---------------------------------------------------------------- rational functions

/**
 * num / den with den not the zero polynomial. poles lists every polynomial
 * that had to be nonzero for the original expression to be defined
 * (denominators, bases of zero or negative powers); constants are not listed.
 * @typedef {{ num: Poly; den: Poly; poles: Poly[] }} Rat
 */

/** @param {Poly[]} list @param {Poly} p */
function addPole(list, p) {
  if (pConstValue(p) !== undefined) return;
  const lt = leadTerm(p);
  if (!lt) return;
  const monic = pscale(p, div(ONE, lt.coef));
  if (!list.some((x) => polyEq(x, monic))) list.push(monic);
}

/**
 * @param {Node} n
 * @returns {Rat | undefined}
 */
function toRatInner(n) {
  if (n.t === 'group') return toRatInner(n.arg);
  if (n.t === 'num') return { num: pconst(n.q), den: PONE, poles: [] };
  if (n.t === 'var') return { num: pvar(n.name), den: PONE, poles: [] };
  if (!hasVar(n)) {
    const c = constQ(n);
    return c ? { num: pconst(c), den: PONE, poles: [] } : undefined;
  }
  switch (n.t) {
    case 'neg': { const a = toRatInner(n.arg); return a && { num: pneg(a.num), den: a.den, poles: a.poles }; }
    case 'add': {
      /** @type {Rat} */
      let acc = { num: PZERO, den: PONE, poles: [] };
      for (const c of n.args) {
        const x = toRatInner(c);
        if (!x) return undefined;
        const poles = acc.poles.slice();
        for (const p of x.poles) addPole(poles, p);
        acc = polyEq(acc.den, x.den)
          ? { num: padd(acc.num, x.num), den: acc.den, poles }
          : { num: padd(pmul(acc.num, x.den), pmul(x.num, acc.den)), den: pmul(acc.den, x.den), poles };
      }
      return acc;
    }
    case 'mul': {
      /** @type {Rat} */
      let acc = { num: PONE, den: PONE, poles: [] };
      for (const c of n.args) {
        const x = toRatInner(c);
        if (!x) return undefined;
        const poles = acc.poles.slice();
        for (const p of x.poles) addPole(poles, p);
        acc = { num: pmul(acc.num, x.num), den: pmul(acc.den, x.den), poles };
      }
      return acc;
    }
    case 'frac': {
      const a = toRatInner(n.num);
      const b = toRatInner(n.den);
      if (!a || !b || pIsZero(b.num)) return undefined;
      const poles = a.poles.slice();
      for (const p of b.poles) addPole(poles, p);
      addPole(poles, b.num);
      return { num: pmul(a.num, b.den), den: pmul(a.den, b.num), poles };
    }
    case 'pow': {
      if (hasVar(n.exp)) return undefined;
      const e = constQ(n.exp);
      if (!e || e.d !== 1n || e.n > BigInt(MAX_POLY_EXP) || e.n < -BigInt(MAX_POLY_EXP)) return undefined;
      const b = toRatInner(n.base);
      if (!b) return undefined;
      const k = Number(e.n);
      if (k > 0) return { num: ppow(b.num, k), den: ppow(b.den, k), poles: b.poles };
      if (pIsZero(b.num)) return undefined; // 0^0 or 0^negative: defined nowhere
      const poles = b.poles.slice();
      addPole(poles, b.num);
      if (k === 0) return { num: PONE, den: PONE, poles };
      return { num: ppow(b.den, -k), den: ppow(b.num, -k), poles };
    }
    case 'root': return undefined;
  }
}

/**
 * n as a quotient of polynomials with rational coefficients, or undefined if
 * it is not one (radicals of variables, irrational constants, non-integer
 * powers) or is defined nowhere, or is too large.
 * @param {Node} n
 * @returns {Rat | undefined}
 */
export function toRat(n) {
  try {
    return toRatInner(n);
  } catch (err) {
    if (err instanceof MathLimit || err instanceof RangeError) return undefined;
    throw err;
  }
}
