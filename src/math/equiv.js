// @ts-check
// Exact equivalence checks (DESIGN.md section 11). Proof paths, in order:
//   0. no variables: both sides are evaluated exactly as Surds and compared;
//   1. polynomials: equality of canonical expanded forms;
//   2. rational functions: a/b vs c/d as the polynomial identity ad = bc,
//      "equal where defined", with the poles reported in `note`;
//   3. radicals and rational powers: equality of radical normal forms.
// If no path applies, a search over exact probe points may find a witness of
// INEQUALITY (two different exact values are a proof of "not equal"). Point
// agreement is never used as evidence of equality: with no proof and no
// witness the answer is equal: undefined, "cannot verify".

import { q, div, cmp, isZero, ZERO, ONE, MathLimit } from './rational.js';
import { vars, isEquation } from './ast.js';
import { seq, sq, SZERO } from './surd.js';
import { evaluate } from './evaluate.js';
import { toPoly, toRat, polyEq, pmul, pIsZero, leadTerm, monoOf, polyToNode, polyVars } from './poly.js';
import { toRadicalNormalForm, radEq, radRatio } from './radical.js';
import { solve } from './solve.js';
import { print } from './print.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../../types.d.ts').Env} Env */
/** @typedef {import('../../types.d.ts').Tri} Tri */
/** @typedef {import('./poly.js').Poly} Poly */

/** Every "equal only where both sides are defined" note starts with this. */
export const WHERE_DEFINED = 'equal where defined';

/**
 * Probe values in preference order. The section 3 probes {2, 3, -1, 5, -2}
 * come first (with -2 ahead of -1 so that sqrt(x^2) vs x shows -2), then
 * spares, and 0 and 1 last because they hide the most differences.
 * @type {Q[]}
 */
const PROBES = [q(2), q(3), q(-2), q(5), q(-1), q(4), q(-3), q(7), q(9), q(1, 2), q(-5), q(6), q(10), q(1, 3), q(-4), q(8), q(16), q(1, 4), q(0), q(1)];

const MAX_WITNESS_TRIES = 3000;

/**
 * Probe values for one variable that respect the declared assumptions.
 * @param {string} name @param {Assumption[]} as
 * @returns {Q[]}
 */
function probesFor(name, as) {
  let list = PROBES;
  for (const a of as) {
    if (a.name !== name) continue;
    if (a.rel === 'nonneg') list = list.filter((x) => cmp(x, ZERO) >= 0);
    if (a.rel === 'pos') list = list.filter((x) => cmp(x, ZERO) > 0);
    if (a.rel === 'nonzero') list = list.filter((x) => !isZero(x));
  }
  return list;
}

/**
 * Search the probe set for a point where both sides are defined and their
 * exact values differ. Such a point proves the expressions are not equivalent.
 * @param {Node} a @param {Node} b @param {Assumption[]} [as]
 * @returns {Env | undefined}
 */
export function findWitness(a, b, as = []) {
  const names = [...new Set([...vars(a), ...vars(b)])].sort();
  /** @param {Env} env */
  const differs = (env) => {
    const x = evaluate(a, env);
    const y = evaluate(b, env);
    return x !== undefined && y !== undefined && !seq(x, y);
  };
  if (names.length === 0) return differs({}) ? {} : undefined;
  const lists = names.map((nm) => probesFor(nm, as));
  let tries = 0;
  // Phase 1: shifted diagonals, so different variables get different values first.
  const longest = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    /** @type {Env} */
    const env = {};
    names.forEach((nm, j) => { env[nm] = lists[j][(i + j) % lists[j].length]; });
    tries++;
    if (differs(env)) return env;
  }
  // Phase 2: the full grid, in odometer order.
  const idx = names.map(() => 0);
  for (;;) {
    if (++tries > MAX_WITNESS_TRIES) return undefined;
    /** @type {Env} */
    const env = {};
    names.forEach((nm, j) => { env[nm] = lists[j][idx[j]]; });
    if (differs(env)) return env;
    let k = 0;
    while (k < idx.length && ++idx[k] === lists[k].length) { idx[k] = 0; k++; }
    if (k === idx.length) return undefined;
  }
}

/**
 * @param {Node} a @param {Node} b @param {Assumption[]} as
 * @returns {{ equal: false; witness?: Env }}
 */
function notEqual(a, b, as) {
  const witness = findWitness(a, b, as);
  return witness ? { equal: false, witness } : { equal: false };
}

/**
 * Is this pole harmless under the assumptions? Only the simple case is
 * recognized: a single monomial whose variables are all declared nonzero or pos.
 * @param {Poly} p @param {Set<string>} nonzero
 */
function poleExcluded(p, nonzero) {
  return p.terms.size === 1 && polyVars(p).every((nm) => nonzero.has(nm));
}

/** @param {Assumption[]} as @returns {Set<string>} */
function nonzeroSet(as) {
  return new Set(as.filter((a) => a.rel === 'nonzero' || a.rel === 'pos').map((a) => a.name));
}

/** @param {string[]} conditions @returns {string} */
function poleNote(conditions) {
  return `${WHERE_DEFINED}; needs ${[...new Set(conditions)].join(', ')}`;
}

/**
 * The conditions ("x != 0", "x - 1 != 0") that a rational function's poles put
 * on its domain beyond what `nonzero` already grants. A monomial pole is
 * split into its variables, so x^2 and 2x both give "x != 0".
 * @param {Poly[]} poles monic, from toRat
 * @param {Set<string>} nonzero
 * @returns {string[]}
 */
function ratConditions(poles, nonzero) {
  /** @type {string[]} */
  const out = [];
  for (const p of poles) {
    if (p.terms.size === 1) {
      for (const nm of polyVars(p)) if (!nonzero.has(nm)) out.push(`${nm} != 0`);
    } else {
      out.push(`${print(polyToNode(p))} != 0`);
    }
  }
  return out;
}

/**
 * The domain conditions of one expression, as a list of strings, or
 * undefined when it is outside the rational and radical classes.
 * @param {Node} n @param {Assumption[]} as
 * @returns {string[] | undefined}
 */
function conditionsOf(n, as) {
  const r = toRat(n);
  if (r) return ratConditions(r.poles, nonzeroSet(as));
  const nf = toRadicalNormalForm(n, as);
  return nf ? nf.poles : undefined;
}

/** @param {string[]} a @param {string[]} b @returns {boolean} equal as sets */
function sameSet(a, b) {
  const s = new Set(a);
  const t = new Set(b);
  return s.size === t.size && [...s].every((x) => t.has(x));
}

/**
 * @param {Node} a @param {Node} b @param {Assumption[]} as
 * @returns {{ equal: Tri; witness?: Env; note?: string }}
 */
function equivInner(a, b, as) {
  // 0. Numbers: exact evaluation is a complete decision when both are defined.
  if (vars(a).length === 0 && vars(b).length === 0) {
    const x = evaluate(a, {});
    const y = evaluate(b, {});
    if (x && y) return seq(x, y) ? { equal: true } : { equal: false, witness: {} }; // the empty point
    return { equal: undefined, note: 'cannot evaluate exactly' };
  }
  // 1. Polynomials.
  const pa = toPoly(a);
  const pb = toPoly(b);
  if (pa && pb) return polyEq(pa, pb) ? { equal: true } : notEqual(a, b, as);
  // 2. Rational functions.
  const ra = toRat(a);
  const rb = toRat(b);
  if (ra && rb) {
    if (!polyEq(pmul(ra.num, rb.den), pmul(rb.num, ra.den))) return notEqual(a, b, as);
    const nz = nonzeroSet(as);
    const open = [...ra.poles, ...rb.poles].filter((p) => !poleExcluded(p, nz));
    if (open.length === 0) return { equal: true };
    return { equal: true, note: poleNote(open.map((p) => `${print(polyToNode(p))} != 0`)) };
  }
  // 3. Radical normal form.
  const na = toRadicalNormalForm(a, as);
  const nb = toRadicalNormalForm(b, as);
  if (na && nb) {
    if (!radEq(na, nb)) return notEqual(a, b, as);
    const open = [...na.poles, ...nb.poles];
    return open.length === 0 ? { equal: true } : { equal: true, note: poleNote(open) };
  }
  // 4. No proof available. A witness still proves inequality.
  const witness = findWitness(a, b, as);
  if (witness) return { equal: false, witness };
  return { equal: undefined, note: 'cannot verify' };
}

/**
 * Are two expressions equal as functions (under the assumptions)?
 *   equal: true       proved. If `note` starts with WHERE_DEFINED, the proof
 *                     holds only where both sides are defined (x/x vs 1).
 *   equal: false      proved different; `witness` (when found) is a point
 *                     where both are defined and the exact values differ
 *                     ({} when neither side has a variable).
 *   equal: undefined  cannot verify. Never a guess.
 * @param {Node} a
 * @param {Node} b
 * @param {Assumption[]} [as]
 * @returns {{ equal: Tri; witness?: Env; note?: string }}
 */
export function equivExpr(a, b, as = []) {
  try {
    if (isEquation(a) || isEquation(b)) return { equal: undefined, note: 'not an expression' };
    return equivInner(a, b, as);
  } catch (err) {
    if (err instanceof MathLimit || err instanceof RangeError) return { equal: undefined, note: 'too large to verify' };
    throw err;
  }
}

/** @param {Tri} x @param {Tri} y @returns {Tri} */
function and3(x, y) {
  if (x === false || y === false) return false;
  if (x === true && y === true) return true;
  return undefined;
}
/** @param {Tri} x @param {Tri} y @returns {Tri} */
function or3(x, y) {
  if (x === true || y === true) return true;
  if (x === false && y === false) return false;
  return undefined;
}

/**
 * Side-wise equality of two equations, swap allowed: (got.lhs = want.lhs and
 * got.rhs = want.rhs) or (got.lhs = want.rhs and got.rhs = want.lhs), each as
 * expressions. This is the I2/I3 judge: an equivalent equation with different
 * sides (the original line, the solved line) is NOT the same.
 * A Tri has no room for an "equal where defined" note, so true is returned
 * only when the two equations also put the same conditions on their domain:
 * x^2/x = 0 against x = 0 matches side by side but is undefined (cannot
 * verify), because the first has no solution and the second has one.
 * @param {Equation} got
 * @param {Equation} want
 * @param {Assumption[]} [as]
 * @returns {Tri}
 */
export function sameSides(got, want, as = []) {
  if (!isEquation(got) || !isEquation(want)) return false;
  const straight = and3(equivExpr(got.lhs, want.lhs, as).equal, equivExpr(got.rhs, want.rhs, as).equal);
  const swapped = straight === true ? true
    : and3(equivExpr(got.lhs, want.rhs, as).equal, equivExpr(got.rhs, want.lhs, as).equal);
  const res = or3(straight, swapped);
  if (res !== true) return res;
  const cg = equationConditions(got, as);
  const cw = equationConditions(want, as);
  return cg !== undefined && cw !== undefined && sameSet(cg, cw) ? true : undefined;
}

/**
 * The domain conditions of an equation: those of both sides together.
 * @param {Equation} e @param {Assumption[]} as
 * @returns {string[] | undefined}
 */
function equationConditions(e, as) {
  const l = conditionsOf(e.lhs, as);
  const r = conditionsOf(e.rhs, as);
  return l && r ? [...l, ...r] : undefined;
}

/** @param {Equation} e @returns {Node} */
function difference(e) { return { t: 'add', args: [e.lhs, { t: 'neg', arg: e.rhs }] }; }

/**
 * If (got.lhs - got.rhs) = m x (orig.lhs - orig.rhs) for a monomial multiplier
 * m = k x (variables to integer powers), k a nonzero rational, return
 * { k, powers } (powers lists only nonzero exponents). false if provably no
 * such m exists. undefined if either difference is not a rational function.
 * Both differences zero gives { k: 1, powers: {} }; exactly one zero gives false.
 * The cast legality test L1 (section 3) is: a multiplier exists and every
 * variable in `powers` is declared nonzero.
 *
 * Also undefined (cannot verify) when the multiplier exists but the two
 * equations are not defined at the same points, because then the solution
 * sets can differ: x^2/x = 0 is 1 x (x = 0) as rational functions, yet it has
 * no solution. The domains are compared as sets of pole conditions, after
 * dropping "v != 0" for every v declared nonzero in `as` and for every v in
 * `powers` (the L1 test requires those to be declared nonzero anyway, so
 * 1/x = 2 against 1 = 2x still reports { k: 1, powers: { x: 1 } }).
 * @param {Equation} got
 * @param {Equation} orig
 * @param {Assumption[]} [as]
 * @returns {{ k: Q; powers: Record<string, number> } | false | undefined}
 */
export function multiplier(got, orig, as = []) {
  try {
    const g = toRat(difference(got));
    const o = toRat(difference(orig));
    if (!g || !o) return undefined;
    const m = monomialRatio(g, o);
    if (!m) return m;
    const nz = nonzeroSet(as);
    for (const name of Object.keys(m.powers)) nz.add(name);
    return sameSet(ratConditions(g.poles, nz), ratConditions(o.poles, nz)) ? m : undefined;
  } catch (err) {
    if (err instanceof MathLimit || err instanceof RangeError) return undefined;
    throw err;
  }
}

/**
 * g / o as a monomial k x (variables to integer powers), or false.
 * @param {import('./poly.js').Rat} g @param {import('./poly.js').Rat} o
 * @returns {{ k: Q; powers: Record<string, number> } | false}
 */
function monomialRatio(g, o) {
  {
    const gz = pIsZero(g.num);
    const oz = pIsZero(o.num);
    if (gz && oz) return { k: ONE, powers: {} };
    if (gz || oz) return false;
    // got/orig = P / R with P = g.num o.den and R = g.den o.num. P / R is a
    // monomial exactly when P lt(R) = R lt(P) (lt = leading term; the order is
    // compatible with multiplication), and then it equals lt(P) / lt(R).
    const P = pmul(g.num, o.den);
    const R = pmul(g.den, o.num);
    const lp = /** @type {{ key: string; coef: Q }} */ (leadTerm(P));
    const lr = /** @type {{ key: string; coef: Q }} */ (leadTerm(R));
    /** @param {{ key: string; coef: Q }} t */
    const asPoly = (t) => /** @type {Poly} */ (/** @type {unknown} */ ({ kind: 'poly', terms: new Map([[t.key, t.coef]]) }));
    if (!polyEq(pmul(P, asPoly(lr)), pmul(R, asPoly(lp)))) return false;
    /** @type {Map<string, number>} */
    const pw = new Map(monoOf(lp.key));
    for (const [name, e] of monoOf(lr.key)) pw.set(name, (pw.get(name) ?? 0) - e);
    /** @type {Record<string, number>} */
    const powers = {};
    for (const [name, e] of [...pw].sort((x, y) => (x[0] < y[0] ? -1 : 1))) if (e !== 0) powers[name] = e;
    return { k: div(lp.coef, lr.coef), powers };
  }
}

/**
 * Is got.lhs - got.rhs a nonzero RATIONAL multiple of orig.lhs - orig.rhs?
 * (The Strike "rewrite as ... = 0" judge; a side swap is the multiple -1.)
 * true / false are proofs; undefined = cannot verify. In particular a
 * multiple "where defined" whose domain differs from the original's (x^2/x = 0
 * against x = 0) is undefined, never true: the solution sets can differ.
 * @param {Equation} got
 * @param {Equation} orig
 * @param {Assumption[]} [as]
 * @returns {Tri}
 */
export function isMultiple(got, orig, as = []) {
  if (!isEquation(got) || !isEquation(orig)) return false;
  const gr = toRat(difference(got));
  const or = toRat(difference(orig));
  if (gr && or) {
    try {
      const m = monomialRatio(gr, or);
      if (m === false || Object.keys(m.powers).length > 0) return false;
      const nz = nonzeroSet(as);
      return sameSet(ratConditions(gr.poles, nz), ratConditions(or.poles, nz)) ? true : undefined;
    } catch (err) {
      if (err instanceof MathLimit || err instanceof RangeError) return undefined;
      throw err;
    }
  }
  const g = toRadicalNormalForm(difference(got), as);
  const o = toRadicalNormalForm(difference(orig), as);
  if (!g || !o) return undefined;
  if (radRatio(g, o) === false) return false;
  return sameSet(g.poles, o.poles) ? true : undefined;
}

/**
 * Do two equations in the variable v have the same real solution set? Uses
 * exact root sets from solve.js, so it is undefined whenever solve is.
 * On false, `witness` is a number that solves exactly one of the two.
 * @param {Equation} a
 * @param {Equation} b
 * @param {string} v
 * @returns {{ equal: Tri; witness?: Surd }}
 */
export function sameSolutions(a, b, v) {
  const sa = solve(a, v);
  const sb = solve(b, v);
  if (!sa || !sb) return { equal: undefined };
  if (sa.kind !== 'finite' && sb.kind !== 'finite') {
    // all vs none: every number (0, say) solves exactly one of them.
    return sa.kind === sb.kind ? { equal: true } : { equal: false, witness: SZERO };
  }
  const ra = sa.kind === 'finite' ? sa.roots : [];
  const rb = sb.kind === 'finite' ? sb.roots : [];
  if (sa.kind === 'all' || sb.kind === 'all') {
    // One side is all reals, the other a finite set: any number outside the
    // finite set solves exactly one of them.
    const finite = sa.kind === 'finite' ? ra : rb;
    for (let i = 0n; ; i++) {
      const cand = sq(i);
      if (!finite.some((r) => seq(r, cand))) return { equal: false, witness: cand };
    }
  }
  for (const r of ra) if (!rb.some((x) => seq(x, r))) return { equal: false, witness: r };
  for (const r of rb) if (!ra.some((x) => seq(x, r))) return { equal: false, witness: r };
  return { equal: true };
}
