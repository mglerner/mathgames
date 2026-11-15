// @ts-check
// Exact helpers shared by generators, mal-rules and the judge.
import { evaluate, evalEq, evalNumber } from './evaluate.js';
import { q, sub, mul, div, neg, isZero, cmp } from './rational.js';
import { sq, sqrtQ, sadd, smul, sdiv, seq } from './surd.js';
import { rationalCoefs } from './poly.js';

/** @typedef {import('./ast.js').Node} Node */
/** @typedef {import('./ast.js').Equation} Equation */
/** @typedef {import('./surd.js').Surd} Surd */
/** @typedef {import('./poly.js').Poly} Poly */
/** @typedef {import('./rational.js').Q} Q */
/** @typedef {{ kind: 'all' } | { kind: 'none' } | { kind: 'finite', roots: Surd[] }} SolutionSet */

/** Value of a variable-free node; throws if it has none (generator-side use only). @param {Node} n */
export function valueOf(n) {
  const r = evalNumber(n);
  if ('fail' in r) throw new Error(`no exact value: ${r.fail}`);
  return r.value;
}

/** L - R of an equation; throws on failure (generator-side use only). @param {Equation} e */
export function polyOf(e) {
  const r = evalEq(e);
  if ('fail' in r) throw new Error(`no polynomial: ${r.fail}`);
  return r.poly;
}

/** @param {Node} n */
export function polyOfNode(n) {
  const r = evaluate(n);
  if ('fail' in r) throw new Error(`no polynomial: ${r.fail}`);
  return r.poly;
}

/**
 * Real solution set of p = 0 for rational p of degree <= 2. Undefined otherwise.
 * @param {Poly} p
 * @returns {SolutionSet | undefined}
 */
export function solveUpTo2(p) {
  const c = rationalCoefs(p);
  if (!c) return undefined;
  if (c.length === 0) return { kind: 'all' };
  if (c.length === 1) return { kind: 'none' };
  if (c.length === 2) return { kind: 'finite', roots: [sq(neg(div(c[0], c[1])))] };
  if (c.length === 3) {
    const [C, B, A] = c;
    const D = sub(mul(B, B), mul(q(4), mul(A, C)));
    if (D.n < 0n) return { kind: 'none' };
    const twoA = mul(q(2), A);
    const base = sq(neg(div(B, twoA)));
    if (isZero(D)) return { kind: 'finite', roots: [base] };
    const s = /** @type {Surd} */ (sqrtQ(D));
    const off = /** @type {Surd} */ (sdiv(s, sq(twoA)));
    return { kind: 'finite', roots: [sadd(base, off), sadd(base, smul(off, sq(q(-1))))] };
  }
  return undefined;
}

/** @param {SolutionSet} a @param {SolutionSet} b */
export function sameSet(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind !== 'finite' || b.kind !== 'finite') return true;
  if (a.roots.length !== b.roots.length) return false;
  return a.roots.every((r) => b.roots.some((s) => seq(r, s))) && b.roots.every((r) => a.roots.some((s) => seq(r, s)));
}

/** @param {Q} a @param {Q} b */
export const qlt = (a, b) => cmp(a, b) < 0;
