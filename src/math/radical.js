// @ts-check
// Radical normal form: a sum of (surd coefficient) x (product of variables to
// rational powers), with one term per distinct monomial. Used to compare
// radical and rational-power expressions exactly (DESIGN.md section 11).
//
// What it accepts:
//   - any variable-free subtree that evaluates exactly to a Surd;
//   - sums, differences and products;
//   - division by a single term (a monomial with a nonzero surd coefficient);
//   - integer powers; non-integer powers and roots of a SINGLE term whose
//     coefficient is a nonnegative rational with an exact root and whose
//     variables are all declared nonneg or pos.
// Anything else (a sum under a radical, a sum in a denominator, a radical of
// an undeclared variable, a nested irrational radicand) gives undefined.
//
// Why equality of normal forms is a proof: with every fractional-power
// variable x >= 0, substitute x = t^L (L the common denominator); both sides
// become Laurent polynomials in t over the reals, and two of those agree for
// all t > 0 exactly when their coefficients match.

import { q, add, mul, qeq, isZero, MathLimit } from './rational.js';
import { vars, stripGroups } from './ast.js';
import { toQ, sadd, smul, sneg, sinv, seq, sIsZero, SONE } from './surd.js';
import { constValue, constQ, powSurd } from './evaluate.js';
import { print } from './print.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Assumption} Assumption */
/** @typedef {[string, Q][]} RMono variable / nonzero rational exponent pairs, names ascending */
/** @typedef {{ coef: Surd; mono: RMono }} RTerm */
/**
 * terms: monomial key -> term (coefficient never zero).
 * poles: human-readable conditions ("x != 0") the expression needs in order to
 * be defined, beyond the declared assumptions.
 * @typedef {import('../../types.d.ts').RadNF & { readonly terms: Map<string, RTerm>; readonly poles: string[] }} RadNF
 */

const MAX_TERMS = 2000;
const MAX_EXP = 64;

/** @param {RMono} m @returns {string} */
function keyOf(m) { return m.map(([name, e]) => `${name}:${e.n}/${e.d}`).join(','); }

/** @param {RMono} a @param {RMono} b @returns {RMono} */
function mulMono(a, b) {
  /** @type {Map<string, Q>} */
  const m = new Map(a);
  for (const [name, e] of b) {
    const prev = m.get(name);
    const s = prev ? add(prev, e) : e;
    if (isZero(s)) m.delete(name); else m.set(name, s);
  }
  return [...m].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
}

/** @typedef {Map<string, RTerm>} Terms */

/** @param {Terms} out @param {RTerm} t */
function addTerm(out, t) {
  if (sIsZero(t.coef)) return;
  const k = keyOf(t.mono);
  const prev = out.get(k);
  if (!prev) { out.set(k, t); return; }
  const s = sadd(prev.coef, t.coef);
  if (sIsZero(s)) out.delete(k); else out.set(k, { coef: s, mono: prev.mono });
}

/** @param {Terms} a @param {Terms} b @returns {Terms} */
function mulTerms(a, b) {
  if (a.size * b.size > MAX_TERMS * 10) throw new MathLimit('radical product too large');
  /** @type {Terms} */
  const out = new Map();
  for (const x of a.values()) {
    for (const y of b.values()) addTerm(out, { coef: smul(x.coef, y.coef), mono: mulMono(x.mono, y.mono) });
  }
  if (out.size > MAX_TERMS) throw new MathLimit('radical form has too many terms');
  return out;
}

/** @param {RTerm} t @returns {Terms} */
function single(t) {
  /** @type {Terms} */
  const m = new Map();
  addTerm(m, t);
  return m;
}

/**
 * @typedef {{ nonneg: Set<string>; nonzero: Set<string>; poles: Set<string> }} Ctx
 */

/**
 * Raise one term to a rational power e, or undefined when that is not valid
 * or not representable.
 * @param {RTerm} t @param {Q} e @param {Ctx} ctx
 * @returns {RTerm | undefined}
 */
function powTerm(t, e, ctx) {
  /** @type {Surd | undefined} */
  let coef;
  if (e.d === 1n) {
    coef = powSurd(t.coef, e);
  } else {
    // Non-integer power: the coefficient must be a nonnegative rational and
    // every variable must be declared nonnegative, or (c m)^e = c^e m^e fails.
    const c = toQ(t.coef);
    if (!c || c.n < 0n) return undefined;
    for (const [name] of t.mono) if (!ctx.nonneg.has(name)) return undefined;
    coef = powSurd(t.coef, e);
  }
  if (!coef) return undefined;
  /** @type {RMono} */
  const mono = [];
  for (const [name, x] of t.mono) {
    const ne = mul(x, e);
    if (isZero(ne)) {
      // x^0: 1 only where x is not 0
      if (!ctx.nonzero.has(name)) ctx.poles.add(`${name} != 0`);
      continue;
    }
    if (ne.n < 0n && !ctx.nonzero.has(name)) ctx.poles.add(`${name} != 0`);
    mono.push([name, ne]);
  }
  return { coef, mono };
}

/**
 * @param {Node} n @param {Ctx} ctx
 * @returns {Terms | undefined}
 */
function build(n, ctx) {
  if (n.t === 'group') return build(n.arg, ctx);
  if (n.t === 'var') return single({ coef: SONE, mono: [[n.name, q(1)]] });
  if (vars(n).length === 0) {
    const c = constValue(n);
    return c ? single({ coef: c, mono: [] }) : undefined;
  }
  switch (n.t) {
    case 'num': return undefined; // unreachable: a num has no variables
    case 'neg': {
      const a = build(n.arg, ctx);
      if (!a) return undefined;
      /** @type {Terms} */
      const out = new Map();
      for (const [k, t] of a) out.set(k, { coef: sneg(t.coef), mono: t.mono });
      return out;
    }
    case 'add': {
      /** @type {Terms} */
      const out = new Map();
      for (const c of n.args) {
        const x = build(c, ctx);
        if (!x) return undefined;
        for (const t of x.values()) addTerm(out, t);
      }
      return out;
    }
    case 'mul': {
      /** @type {Terms} */
      let acc = single({ coef: SONE, mono: [] });
      for (const c of n.args) {
        const x = build(c, ctx);
        if (!x) return undefined;
        acc = mulTerms(acc, x);
      }
      return acc;
    }
    case 'frac': {
      const a = build(n.num, ctx);
      const b = build(n.den, ctx);
      if (!a || !b || b.size !== 1) return undefined; // zero or multi-term denominator
      const inv = powTerm([...b.values()][0], q(-1), ctx);
      return inv && mulTerms(a, single(inv));
    }
    case 'pow':
    case 'root': {
      /** @type {Q | undefined} */
      let e;
      /** @type {Node} */
      let baseNode;
      if (n.t === 'root') {
        if (!Number.isSafeInteger(n.index) || n.index < 2) return undefined;
        e = q(1, n.index);
        baseNode = n.radicand;
      } else {
        if (vars(n.exp).length > 0) return undefined;
        e = constQ(n.exp);
        baseNode = n.base;
      }
      if (!e) return undefined;
      const b = build(baseNode, ctx);
      if (!b) return undefined;
      if (b.size === 0) return e.n > 0n ? b : undefined; // 0^e
      if (b.size === 1) {
        const t = powTerm([...b.values()][0], e, ctx);
        return t && single(t);
      }
      // A sum: only nonnegative integer powers can be expanded.
      if (e.d !== 1n || e.n < 0n || e.n > BigInt(MAX_EXP)) return undefined;
      if (e.n === 0n) {
        ctx.poles.add(`${print(stripGroups(baseNode))} != 0`);
        return single({ coef: SONE, mono: [] });
      }
      let acc = b;
      for (let i = 1; i < Number(e.n); i++) acc = mulTerms(acc, b);
      return acc;
    }
  }
}

/**
 * The radical normal form of n under the declared assumptions, or undefined
 * when n is outside the class described at the top of this file.
 * @param {Node} n
 * @param {Assumption[]} a
 * @returns {RadNF | undefined}
 */
export function toRadicalNormalForm(n, a) {
  /** @type {Ctx} */
  const ctx = { nonneg: new Set(), nonzero: new Set(), poles: new Set() };
  for (const as of a ?? []) {
    if (as.rel === 'nonneg' || as.rel === 'pos') ctx.nonneg.add(as.name);
    if (as.rel === 'nonzero' || as.rel === 'pos') ctx.nonzero.add(as.name);
  }
  try {
    const terms = build(n, ctx);
    if (!terms) return undefined;
    return /** @type {RadNF} */ (/** @type {unknown} */ ({ kind: 'radnf', terms, poles: [...ctx.poles].sort() }));
  } catch (err) {
    if (err instanceof MathLimit || err instanceof RangeError) return undefined;
    throw err;
  }
}

/**
 * Equality of normal forms (a proof, given the same assumptions on both sides).
 * @param {RadNF} a @param {RadNF} b
 * @returns {boolean}
 */
export function radEq(a, b) {
  if (a.terms.size !== b.terms.size) return false;
  for (const [k, t] of a.terms) {
    const u = b.terms.get(k);
    if (!u || !seq(t.coef, u.coef)) return false;
  }
  return true;
}

/** @param {RadNF} a @returns {boolean} */
export function radIsZero(a) { return a.terms.size === 0; }

/**
 * Terms of a normal form, for inspection: [{ coef, mono }] with mono a list of
 * [variable, exponent] pairs.
 * @param {RadNF} a
 * @returns {RTerm[]}
 */
export function radTerms(a) { return [...a.terms.values()]; }

/**
 * If a = k x b for a nonzero rational k, return k; if provably not, false.
 * (Both zero gives 1; exactly one zero gives false.)
 * @param {RadNF} a @param {RadNF} b
 * @returns {Q | false}
 */
export function radRatio(a, b) {
  if (a.terms.size === 0 && b.terms.size === 0) return q(1);
  if (a.terms.size !== b.terms.size || a.terms.size === 0) return false;
  /** @type {Q | undefined} */
  let k;
  for (const [key, t] of a.terms) {
    const u = b.terms.get(key);
    if (!u) return false;
    const inv = sinv(u.coef);
    if (!inv) return false;
    const r = toQ(smul(t.coef, inv));
    if (!r || isZero(r)) return false;
    if (k === undefined) k = r; else if (!qeq(k, r)) return false;
  }
  return k ?? false;
}
