// @ts-check
// Form predicates: "has the move been finished?" These run ONLY after exact value (or
// solution-set) equality has been established, so they never decide right vs wrong value;
// they decide "correct" vs "same value, not finished". Each returns { ok } or { ok:false, why }.
import { stripGroups } from './ast.js';
import { gcd } from './rational.js';
import { squarefreeSplit } from './surd.js';

/** @typedef {import('./ast.js').Node} Node */
/** @typedef {import('./ast.js').Equation} Equation */
/** @typedef {{ ok: true } | { ok: false, why: string }} FormResult */

/**
 * Flatten a product/quotient tree into the literal factors on each side of the fraction bar.
 * @typedef {{ ints: { num: bigint[], den: bigint[] }, roots: { num: bigint[], den: bigint[] },
 *             degs: { num: number[], den: number[] }, negs: number, bad: boolean }} Shape
 */

/** @param {Node} node @returns {Shape} */
export function shape(node) {
  /** @type {Shape} */
  const acc = { ints: { num: [], den: [] }, roots: { num: [], den: [] }, degs: { num: [], den: [] }, negs: 0, bad: false };
  /** @param {Node} n @param {'num' | 'den'} side */
  function walk(n, side) {
    const other = side === 'num' ? 'den' : 'num';
    switch (n.t) {
      case 'group':
        return walk(n.arg, side);
      case 'neg':
        acc.negs++;
        return walk(n.arg, side);
      case 'num': {
        const a = n.q.n < 0n ? -n.q.n : n.q.n;
        if (n.q.n < 0n) acc.negs++;
        acc.ints[side].push(a);
        if (n.q.d !== 1n) acc.ints[other].push(n.q.d);
        return;
      }
      case 'root': {
        const r = stripGroups(n.radicand);
        if (r.t === 'num' && r.q.d === 1n && r.q.n >= 0n) acc.roots[side].push(r.q.n);
        else acc.bad = true;
        return;
      }
      case 'mul':
        for (const a of n.args) walk(a, side);
        return;
      case 'frac':
        walk(n.num, side);
        walk(n.den, other);
        return;
      case 'var':
        acc.degs[side].push(1);
        return;
      case 'pow': {
        const b = stripGroups(n.base);
        const e = stripGroups(n.exp);
        if (b.t === 'var' && e.t === 'num' && e.q.d === 1n && e.q.n >= 1n && e.q.n <= 12n) {
          acc.degs[side].push(Number(e.q.n));
        } else acc.bad = true;
        return;
      }
      default:
        acc.bad = true;
    }
  }
  walk(node, 'num');
  return acc;
}

/**
 * Finished rational: an integer, or one fraction p/d in lowest terms with d > 1,
 * with at most one minus sign. ("4/3" yes; "8/6" no; "4/1" no; "2 x 2/3" no.)
 * @param {Node} node @returns {FormResult}
 */
export function finishedRational(node) {
  const s = shape(node);
  if (s.bad || s.roots.num.length || s.roots.den.length || s.degs.num.length || s.degs.den.length)
    return { ok: false, why: 'Not one fraction yet.' };
  if (s.negs > 1) return { ok: false, why: 'Clean up the minus signs.' };
  if (s.ints.num.length !== 1 || s.ints.den.length > 1)
    return { ok: false, why: 'Multiply it through into one fraction.' };
  const p = s.ints.num[0];
  if (s.ints.den.length === 1) {
    const d = s.ints.den[0];
    if (d === 1n) return { ok: false, why: `${p}/1 is just ${p}.` };
    const g = gcd(p, d);
    if (g > 1n) return { ok: false, why: `${p}/${d} reduces: divide numerator and denominator by ${g}.` };
  }
  return { ok: true };
}

/** @param {Node} node @returns {FormResult} */
export function finishedInteger(node) {
  const s = shape(node);
  if (!s.bad && s.roots.num.length + s.roots.den.length === 1 && s.ints.num.length + s.ints.den.length === 0) {
    const r = s.roots.num[0] ?? s.roots.den[0];
    const sp = squarefreeSplit(r);
    if (sp && sp.inn === 1n) return { ok: false, why: 'That root is a whole number. Write the whole number.' };
  }
  if (s.bad || s.roots.num.length || s.roots.den.length || s.degs.num.length || s.degs.den.length)
    return { ok: false, why: 'The move has not been applied yet.' };
  if (s.negs > 1) return { ok: false, why: 'Clean up the minus signs.' };
  if (s.ints.num.length !== 1 || s.ints.den.length !== 0) return { ok: false, why: 'Write it as one whole number.' };
  return { ok: true };
}

/**
 * Finished radical: (p/d) sqrt(r) with no root in any denominator, one root, r squarefree,
 * p/d in lowest terms. ("2sqrt3", "sqrt2/2", "1/2sqrt2" yes; "6/sqrt3", "6sqrt3/3", "sqrt12" no.)
 * @param {Node} node @returns {FormResult}
 */
export function finishedRadical(node) {
  const s = shape(node);
  if (s.bad || s.degs.num.length || s.degs.den.length) return { ok: false, why: 'Not one term yet.' };
  if (s.roots.den.length) return { ok: false, why: 'A root is still in the denominator.' };
  if (s.roots.num.length !== 1) return { ok: false, why: 'Combine the roots into one.' };
  const r = s.roots.num[0];
  const sp = squarefreeSplit(r);
  if (sp && sp.out > 1n) return { ok: false, why: `${r} still hides a square.` };
  if (s.negs > 1) return { ok: false, why: 'Clean up the minus signs.' };
  if (s.ints.num.length > 1 || s.ints.den.length > 1)
    return { ok: false, why: 'Multiply the whole numbers into one coefficient.' };
  const p = s.ints.num[0] ?? 1n;
  if (s.ints.den.length === 1) {
    const d = s.ints.den[0];
    if (d === 1n) return { ok: false, why: 'Over 1 changes nothing. Drop it.' };
    const g = gcd(p, d);
    if (g > 1n) return { ok: false, why: `${p}/${d} reduces: divide both by ${g}.` };
  }
  return { ok: true };
}

/** @param {Node} n */
const isZeroLit = (n) => {
  const s = stripGroups(n);
  return s.t === 'num' && s.q.n === 0n;
};

/**
 * Standard form: one side is the literal 0 (either side), the other is a sum of monomials
 * c x^k in strictly descending powers, no parentheses, no zero terms.
 * @param {Equation} e @returns {FormResult}
 */
export function standardForm(e) {
  const lz = isZeroLit(e.lhs);
  const rz = isZeroLit(e.rhs);
  if (!lz && !rz) return { ok: false, why: 'Same solutions. Now make one side 0.' };
  const side = stripGroups(lz ? e.rhs : e.lhs);
  const terms = side.t === 'add' ? side.args : [side];
  /** @type {number[]} */
  const degs = [];
  for (const t of terms) {
    const s = shape(t);
    const clean =
      !s.bad &&
      s.roots.num.length === 0 &&
      s.roots.den.length === 0 &&
      s.degs.num.length <= 1 &&
      s.degs.den.length === 0 &&
      s.negs <= 1 &&
      s.ints.num.length <= 1 &&
      s.ints.den.length <= 1;
    if (!clean) return { ok: false, why: 'Same solutions. Expand and combine: no parentheses.' };
    if (s.ints.num.length === 1 && s.ints.num[0] === 0n) return { ok: false, why: 'Same solutions. Drop the 0 term.' };
    degs.push(s.degs.num[0] ?? 0);
  }
  for (let i = 1; i < degs.length; i++) {
    if (degs[i] === degs[i - 1] || degs.indexOf(degs[i]) !== i)
      return { ok: false, why: 'Same solutions. Combine like terms.' };
  }
  for (let i = 1; i < degs.length; i++) {
    if (degs[i] > degs[i - 1]) return { ok: false, why: 'Same solutions. Put the powers in descending order.' };
  }
  return { ok: true };
}

/** Named predicates, as section 11's forms.js. */
export const FORMS = {
  'lowest-terms': finishedRational,
  integer: finishedInteger,
  'radical-finished': finishedRadical,
};
