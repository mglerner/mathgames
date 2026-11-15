// @ts-check
// Exact solver for one equation in one variable, over the reals.
// Scope (DESIGN.md section 11): after moving everything to one side the
// equation must be a polynomial of degree <= 2 in v with no other variable.
// Coefficients are rational, or (a small superset of the spec, so that lines
// like x = sqrt(3) and sqrt(2) x = 2 can be compared) exact Surd constants.
// Everything else returns undefined ("cannot verify").
//   degree 0: 0 = 0 -> { kind: 'all' };  c = 0 with c != 0 -> { kind: 'none' }
//   degree 1: one root
//   degree 2: discriminant < 0 -> { kind: 'none' }; = 0 -> one root; > 0 -> two
//             (undefined if the discriminant is positive but irrational: its
//             square root would be a nested radical)
// Roots are exact Surds (rational, or p + q sqrt(n)), in ascending order.

import { q } from './rational.js';
import { sadd, ssub, smul, sneg, sdiv, sscale, sqrtQ, scmp, ssign, seq, toQ, SZERO } from './surd.js';
import { toRadicalNormalForm, radTerms } from './radical.js';
import { evaluateS } from './evaluate.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').SolutionSet} SolutionSet */
/** @typedef {import('../../types.d.ts').Tri} Tri */

/**
 * Coefficients [c0, c1, c2] of lhs - rhs as a polynomial in v, or undefined
 * if it is not a polynomial of degree <= 2 in v alone.
 * @param {Equation} e @param {string} v
 * @returns {Surd[] | undefined}
 */
function coefficients(e, v) {
  // No assumptions are passed, so no radical of a variable is accepted.
  const nf = toRadicalNormalForm({ t: 'add', args: [e.lhs, { t: 'neg', arg: e.rhs }] }, []);
  if (!nf || nf.poles.length > 0) return undefined;
  const cs = [SZERO, SZERO, SZERO];
  for (const t of radTerms(nf)) {
    if (t.mono.length === 0) { cs[0] = t.coef; continue; }
    if (t.mono.length > 1 || t.mono[0][0] !== v) return undefined; // another variable
    const ex = t.mono[0][1];
    if (ex.d !== 1n || ex.n < 1n || ex.n > 2n) return undefined; // not degree 1 or 2
    cs[Number(ex.n)] = t.coef;
  }
  return cs;
}

/**
 * @param {Equation} e
 * @param {string} v
 * @returns {SolutionSet | undefined}
 */
export function solve(e, v) {
  const cs = coefficients(e, v);
  if (!cs) return undefined;
  const [c, b, a] = cs;
  if (ssign(a) === 0) {
    if (ssign(b) === 0) return ssign(c) === 0 ? { kind: 'all' } : { kind: 'none' };
    const r = sdiv(sneg(c), b);
    return r && { kind: 'finite', roots: [r] };
  }
  const disc = ssub(smul(b, b), sscale(smul(a, c), q(4)));
  const sd = ssign(disc);
  if (sd < 0) return { kind: 'none' };
  const twoA = sscale(a, q(2));
  const mid = sdiv(sneg(b), twoA);
  if (!mid) return undefined;
  if (sd === 0) return { kind: 'finite', roots: [mid] };
  const dq = toQ(disc);
  const s = dq && sqrtQ(dq);
  if (!s) return undefined; // irrational discriminant, or too large to factor
  const half = sdiv(s, twoA);
  if (!half) return undefined;
  const roots = [ssub(mid, half), sadd(mid, half)];
  roots.sort(scmp);
  return { kind: 'finite', roots };
}

/**
 * Substitute an exact value for v and compare the two sides exactly.
 * true: both sides are defined and equal. false: both defined and different.
 * undefined: a side could not be evaluated (other variables, undefined value).
 * @param {Equation} e
 * @param {string} v
 * @param {Surd} value
 * @returns {Tri}
 */
export function checkRoot(e, v, value) {
  const l = evaluateS(e.lhs, { [v]: value });
  const r = evaluateS(e.rhs, { [v]: value });
  if (!l || !r) return undefined;
  return seq(l, r);
}

/**
 * Exact equality of two solution sets.
 * @param {SolutionSet} a @param {SolutionSet} b
 * @returns {boolean}
 */
export function sameSolutionSet(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind !== 'finite' || b.kind !== 'finite') return true;
  const ra = dedupe(a.roots);
  const rb = dedupe(b.roots);
  return ra.length === rb.length && ra.every((x) => rb.some((y) => seq(x, y)));
}

/** @param {Surd[]} roots @returns {Surd[]} */
function dedupe(roots) {
  /** @type {Surd[]} */
  const out = [];
  for (const r of roots) if (!out.some((x) => seq(x, r))) out.push(r);
  return out;
}
