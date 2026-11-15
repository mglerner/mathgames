// @ts-check
// Property test for the 'factored-gcf' form predicate (src/math/forms.js).
// The hand-judged table is in forms.test.js with the other predicates.
// The expected verdict is computed from the DRAW (the integer coefficients and
// monomials chosen), never from forms.js or poly.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { num, v, add, mul, neg, pow, group } from '../../src/math/ast.js';
import { forms } from '../../src/math/forms.js';
import { toPoly, polyToNode } from '../../src/math/poly.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Rng} Rng */

/** Monomials in x, y up to degree 2, as [x exponent, y exponent]. */
const MONOS = /** @type {[number, number][]} */ ([[0, 0], [1, 0], [0, 1], [2, 0], [1, 1], [0, 2]]);

/** @param {[number, number]} m @returns {Node[]} the variable factors */
function monoFactors([ex, ey]) {
  /** @type {Node[]} */
  const out = [];
  if (ex) out.push(ex === 1 ? v('x') : pow(v('x'), num(ex)));
  if (ey) out.push(ey === 1 ? v('y') : pow(v('y'), num(ey)));
  return out;
}
/** A term as a generator would build it: c, x, -x, 3x^2, -2xy. @param {number} c nonzero @param {[number, number]} m @returns {Node} */
function term(c, m) {
  const fs = monoFactors(m);
  if (fs.length === 0) return num(c);
  if (c === 1) return fs.length === 1 ? fs[0] : mul(...fs);
  if (c === -1) return neg(fs.length === 1 ? fs[0] : mul(...fs));
  return mul(num(c), ...fs);
}
/** @param {number} a @param {number} b @returns {number} */
function igcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
/** @param {Rng} rng @returns {number} a nonzero integer in [-9, 9] */
function coef(rng) { const c = rng.int(1, 9); return rng.bool() ? c : -c; }

test('factored-gcf: factor x (sum) passes exactly when the drawn sum is primitive (3000 seeds)', () => {
  const f = forms['factored-gcf'];
  let yes = 0;
  let no = 0;
  forSeeds(3000, (rng) => {
    const k = rng.int(2, 4);
    const monos = rng.shuffle(MONOS).slice(0, k);
    const coefs = monos.map(() => coef(rng));
    const g = coefs.reduce((a, c) => igcd(a, c), 0);
    const sharedVar = [0, 1].some((i) => monos.every((m) => m[i] > 0));
    const primitive = g === 1 && !sharedVar;
    const sum = add(...monos.map((m, i) => term(coefs[i], m)));
    const fm = rng.pick(MONOS);
    const fc = coef(rng);
    const factor = term(fc, fm);
    const tree = rng.bool(0.2) ? mul(group(sum), factor) : mul(factor, group(sum));

    assert.equal(f(tree), primitive, 'factor x (sum)');
    if (primitive) yes++; else no++;
    // one leading minus is allowed (not on a factor already written negative); parentheses change nothing
    assert.equal(f(neg(tree)), primitive && fc > 0, 'minus in front (one minus only)');
    assert.equal(f(group(tree)), primitive, 'parentheses around it');
    // the same value multiplied out is never a GCF factoring
    const expanded = polyToNode(/** @type {any} */ (toPoly(tree)));
    assert.equal(f(expanded), false, 'expanded form');
    // a common integer factor left inside fails
    const s = rng.int(2, 5);
    assert.equal(f(mul(factor, group(add(...monos.map((m, i) => term(coefs[i] * s, m)))))), false, 'integer factor left inside');
    // a common variable factor left inside fails
    const shifted = monos.map(([ex, ey]) => /** @type {[number, number]} */ ([ex + 1, ey]));
    assert.equal(f(mul(factor, group(add(...shifted.map((m, i) => term(coefs[i], m)))))), false, 'variable factor left inside');
    // two factors in parentheses is not a GCF factoring
    assert.equal(f(mul(factor, group(sum), group(sum))), false, 'two sums');
    // a zero factor
    assert.equal(f(mul(num(0), group(sum))), false, 'zero factor');
  });
  assert.ok(yes > 500 && no > 500, `both verdicts must be exercised: ${yes} pass, ${no} fail`);
});
