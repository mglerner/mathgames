// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { rq, rsurd, show } from './_arb.js';
import { q, qeq, gcd, isqrt, ZERO } from '../../src/math/rational.js';
import {
  sadd, smul, seq, sqrtQ, approx, sneg, ssub, sinv, sdiv, ssign, scmp, spow, sscale, fromQ, toQ, sq,
  squarePart, surdToNode, SZERO, SONE,
} from '../../src/math/surd.js';
import { evaluate } from '../../src/math/evaluate.js';
import { print } from '../../src/math/print.js';

/** @typedef {import('../../types.d.ts').Surd} Surd */

const N = 5000;

/** @param {bigint} n */
function isSquarefree(n) {
  for (let p = 2n; p * p <= n; p++) if (n % (p * p) === 0n) return false;
  return true;
}

/** Canonical-form invariant. @param {Surd} s */
function assertCanonical(s) {
  let prev = 0n;
  for (const t of s.terms) {
    assert.ok(t.coef.n !== 0n, 'no zero coefficient');
    assert.ok(t.coef.d > 0n && gcd(t.coef.n, t.coef.d) === 1n, 'coefficient in lowest terms');
    assert.ok(t.rad >= 1n && isSquarefree(t.rad), `squarefree radicand, got ${t.rad}`);
    assert.ok(t.rad > prev, 'radicands strictly ascending');
    prev = t.rad;
  }
}

/**
 * Independent sign: integer interval arithmetic on the terms scaled by 10^40.
 * @param {Surd} s
 * @returns {number}
 */
function signByIntervals(s) {
  const S = 10n ** 40n;
  let D = 1n;
  for (const t of s.terms) D = (D * t.coef.d) / gcd(D, t.coef.d);
  let lo = 0n; let hi = 0n;
  for (const t of s.terms) {
    const m = t.coef.n * (D / t.coef.d);
    const r = isqrt(t.rad * S * S);
    const exact = r * r === t.rad * S * S;
    const rl = r; const rh = exact ? r : r + 1n;
    if (m > 0n) { lo += m * rl; hi += m * rh; } else { lo += m * rh; hi += m * rl; }
  }
  if (lo > 0n) return 1;
  if (hi < 0n) return -1;
  assert.ok(lo <= 0n && hi >= 0n);
  return 0; // interval straddles zero: at this precision that means exactly zero for our small inputs
}

test('canonical form survives every operation', () => {
  forSeeds(N, (rng) => {
    const a = rsurd(rng); const b = rsurd(rng);
    for (const s of [a, b, sadd(a, b), ssub(a, b), smul(a, b), sneg(a), sscale(a, rq(rng))]) assertCanonical(s);
    const i = sinv(a);
    if (i) assertCanonical(i);
  });
});

test('field axioms on Surd', () => {
  forSeeds(N, (rng) => {
    const a = rsurd(rng); const b = rsurd(rng); const c = rsurd(rng);
    assert.ok(seq(sadd(a, b), sadd(b, a)), 'add commutes');
    assert.ok(seq(smul(a, b), smul(b, a)), 'mul commutes');
    assert.ok(seq(sadd(sadd(a, b), c), sadd(a, sadd(b, c))), 'add associates');
    assert.ok(seq(smul(smul(a, b), c), smul(a, smul(b, c))), 'mul associates');
    assert.ok(seq(smul(a, sadd(b, c)), sadd(smul(a, b), smul(a, c))), 'distributes');
    assert.ok(seq(sadd(a, SZERO), a), 'additive identity');
    assert.ok(seq(smul(a, SONE), a), 'multiplicative identity');
    assert.ok(seq(sadd(a, sneg(a)), SZERO), 'additive inverse');
    assert.ok(seq(smul(a, SZERO), SZERO), 'zero annihilates');
  });
});

test('sinv: a x (1/a) = 1 for every nonzero a, including multi-radical sums', () => {
  let multi = 0;
  forSeeds(N, (rng) => {
    const a = rsurd(rng, 4);
    const i = sinv(a);
    if (a.terms.length === 0) { assert.equal(i, undefined); return; }
    assert.ok(i, `inverse exists for ${show(a)}`);
    assert.ok(seq(smul(a, i), SONE), `a x 1/a = 1 for ${show(a)}`);
    const b = rsurd(rng);
    const d = sdiv(b, a);
    assert.ok(d && seq(smul(d, a), b), 'division undoes multiplication');
    if (a.terms.length >= 3) multi++;
  });
  assert.ok(multi > 300, `enough three-or-more-term cases exercised (${multi})`);
});

test('ssign: exact sign agrees with independent integer interval arithmetic', () => {
  let nonTrivial = 0;
  forSeeds(N, (rng) => {
    const a = rsurd(rng, 4);
    assert.equal(ssign(a), signByIntervals(a), show(a));
    assert.equal(ssign(sneg(a)) + ssign(a), 0);
    assert.equal(ssign(a) === 0, a.terms.length === 0);
    const b = rsurd(rng, 4);
    assert.equal(ssign(smul(a, b)), ssign(a) * ssign(b) + 0, 'sign is multiplicative');
    assert.equal(scmp(a, b) + scmp(b, a), 0);
    if (a.terms.length >= 2) nonTrivial++;
  });
  assert.ok(nonTrivial > 1000);
});

test('ssign: near-cancellations are decided exactly', () => {
  // 140/99 < sqrt(2) < 99/70 (99^2 = 9801 > 2 x 70^2 = 9800; 140^2 = 19600 < 2 x 99^2 = 19602)
  // 265/153 < sqrt(3) < 1351/780 (1351^2 = 1825201 > 3 x 780^2 = 1825200; 265^2 = 70225 < 3 x 153^2 = 70227)
  const s2 = /** @type {Surd} */ (sqrtQ(q(2)));
  const s3 = /** @type {Surd} */ (sqrtQ(q(3)));
  assert.equal(scmp(s2, sq(99, 70)), -1);
  assert.equal(scmp(s2, sq(140, 99)), 1);
  assert.equal(scmp(s3, sq(1351, 780)), -1);
  assert.equal(scmp(s3, sq(265, 153)), 1);
  // sqrt(2) + sqrt(3) vs sqrt(5 + 2 sqrt(6)) cannot be written, but (sqrt2+sqrt3)^2 = 5 + 2 sqrt6 exactly:
  const sum = sadd(s2, s3);
  assert.ok(seq(smul(sum, sum), sadd(sq(5), sscale(/** @type {Surd} */ (sqrtQ(q(6))), q(2)))));
  // sqrt(2) + sqrt(3) - sqrt(10) is about -0.016
  assert.equal(ssign(ssub(sum, /** @type {Surd} */ (sqrtQ(q(10))))), -1);
  // sqrt(6) + sqrt(7) - sqrt(26) is about -0.0037 ; sqrt(5) + sqrt(6) - sqrt(22) is about -0.0048
  assert.equal(ssign(ssub(sadd(/** @type {Surd} */ (sqrtQ(q(6))), /** @type {Surd} */ (sqrtQ(q(7)))), /** @type {Surd} */ (sqrtQ(q(26))))), -1);
});

test('sqrtQ: squares back exactly, squarefree radicand, undefined for negatives', () => {
  forSeeds(N, (rng) => {
    const a = q(rng.int(0, 5000), rng.int(1, 400));
    const s = sqrtQ(a);
    assert.ok(s);
    assertCanonical(s);
    assert.ok(s.terms.length <= 1);
    assert.ok(seq(smul(s, s), fromQ(a)), `sqrt(${a.n}/${a.d})^2`);
    assert.ok(ssign(s) >= 0, 'principal root is nonnegative');
    if (a.n > 0n) assert.equal(sqrtQ(q(-a.n, a.d)), undefined);
  });
  assert.deepEqual(sqrtQ(q(12)), { terms: [{ coef: q(2), rad: 3n }] });
  assert.deepEqual(sqrtQ(q(1, 4)), { terms: [{ coef: q(1, 2), rad: 1n }] });
  assert.deepEqual(sqrtQ(q(2, 3)), { terms: [{ coef: q(1, 3), rad: 6n }] });
  assert.deepEqual(sqrtQ(ZERO), SZERO);
});

test('squarePart: out^2 x in = m with in squarefree; big inputs', () => {
  forSeeds(N, (rng) => {
    const m = BigInt(rng.int(1, 2 ** 31)) * BigInt(rng.int(1, 1000));
    const sp = squarePart(m);
    assert.ok(sp);
    assert.equal(sp.out * sp.out * sp.in, m);
    if (sp.in < 10n ** 9n) assert.ok(isSquarefree(sp.in));
  });
  // perfect square far beyond the trial-division limit
  const big = 10n ** 40n + 3n;
  assert.deepEqual(squarePart(big * big), { out: big, in: 1n });
  // 2^101 = (2^50)^2 x 2
  assert.deepEqual(squarePart(2n ** 101n), { out: 2n ** 50n, in: 2n });
  // a huge non-square with no small factors cannot be factored: undefined, not a guess
  assert.equal(squarePart((10n ** 20n + 39n) * (10n ** 20n + 129n)), undefined);
  assert.equal(sqrtQ(q((10n ** 20n + 39n) * (10n ** 20n + 129n))), undefined);
});

test('spow matches repeated multiplication, negative exponents invert', () => {
  forSeeds(2000, (rng) => {
    const a = rsurd(rng, 2); const e = rng.int(-4, 5);
    const got = spow(a, e);
    if (a.terms.length === 0) { assert.deepEqual(got, e > 0 ? SZERO : undefined); return; }
    let want = SONE;
    for (let i = 0; i < Math.abs(e); i++) want = smul(want, a);
    if (e < 0) want = /** @type {Surd} */ (sinv(want));
    assert.ok(got && seq(got, want));
  });
});

test('toQ / fromQ', () => {
  forSeeds(1000, (rng) => {
    const a = rq(rng);
    const back = toQ(fromQ(a));
    assert.ok(back && qeq(back, a));
  });
  assert.equal(toQ(/** @type {Surd} */ (sqrtQ(q(2)))), undefined);
});

test('approx: display rounding (hand-checked values)', () => {
  const s = (/** @type {number} */ n) => /** @type {Surd} */ (sqrtQ(q(n)));
  assert.equal(approx(s(2), 2), '1.41');
  assert.equal(approx(s(2), 5), '1.41421');
  assert.equal(approx(s(3), 2), '1.73');
  assert.equal(approx(/** @type {Surd} */ (sdiv(sq(6), s(3))), 2), '3.46');
  assert.equal(approx(sscale(s(3), q(4)), 2), '6.93');
  assert.equal(approx(sadd(sq(1), s(3)), 2), '2.73');
  assert.equal(approx(ssub(sq(1), s(3)), 2), '-0.73');
  assert.equal(approx(sq(2, 3), 3), '0.667');
  assert.equal(approx(sq(1, 8), 2), '0.13');
  assert.equal(approx(sq(-1, 8), 2), '-0.13');
  assert.equal(approx(sq(-1, 1000), 2), '0.00');
  assert.equal(approx(sq(5), 0), '5');
  assert.equal(approx(sq(7, 2), 0), '4');
  assert.equal(approx(sq(4), 2), '4.00');
  assert.equal(approx(SZERO, 2), '0.00');
  assert.equal(approx(sq(-81, 4), 2), '-20.25');
  assert.equal(approx(s(2), 30), '1.414213562373095048801688724210');
});

test('approx: brackets the exact value (rationals) and never yields "-0"', () => {
  forSeeds(2000, (rng) => {
    const a = rq(rng, 200); const places = rng.int(0, 6);
    const text = approx(fromQ(a), places);
    assert.match(text, places === 0 ? /^-?\d+$/ : new RegExp(`^-?\\d+\\.\\d{${places}}$`));
    assert.ok(!/^-0(\.0*)?$/.test(text), text);
    // |text - a| <= 1/2 x 10^-places, checked exactly
    const digits = BigInt(text.replace('.', ''));
    const P = 10n ** BigInt(places);
    const diff = digits * a.d - a.n * P; // (text - a) x P x a.d
    assert.ok((diff < 0n ? -diff : diff) * 2n <= a.d, `${text} vs ${a.n}/${a.d}`);
  });
});

test('surdToNode: evaluates back to the same Surd and prints readably', () => {
  forSeeds(N, (rng) => {
    const a = rsurd(rng);
    const back = evaluate(surdToNode(a), {});
    assert.ok(back && seq(back, a), print(surdToNode(a)));
  });
  const s3 = /** @type {Surd} */ (sqrtQ(q(3)));
  assert.equal(print(surdToNode(sadd(sq(1), s3))), '1 + sqrt(3)');
  assert.equal(print(surdToNode(ssub(sq(1), s3))), '1 - sqrt(3)');
  assert.equal(print(surdToNode(sscale(s3, q(2)))), '2sqrt(3)');
  assert.equal(print(surdToNode(sscale(s3, q(-1, 2)))), '-sqrt(3)/2');
  assert.equal(print(surdToNode(sq(-3, 4))), '-3/4');
  assert.equal(print(surdToNode(SZERO)), '0');
});
