// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { rq, rqNonzero } from './_arb.js';
import { q, add, sub, mul, div, neg, cmp, qeq, gcd, qstr, qparse, qpow, isqrt, exactRoot, ZERO, ONE, MathLimit } from '../../src/math/rational.js';

const N = 5000;

test('q: lowest terms, positive denominator, bigint and number inputs', () => {
  assert.deepEqual(q(6, 8), { n: 3n, d: 4n });
  assert.deepEqual(q(6, -8), { n: -3n, d: 4n });
  assert.deepEqual(q(-6n, -8n), { n: 3n, d: 4n });
  assert.deepEqual(q(0, -5), { n: 0n, d: 1n });
  assert.deepEqual(q(7), { n: 7n, d: 1n });
  assert.deepEqual(q(10n ** 30n, 10n ** 29n), { n: 10n, d: 1n });
});

test('q: rejects zero denominators and non-integers (no floats, ever)', () => {
  assert.throws(() => q(1, 0), RangeError);
  assert.throws(() => q(0.5), TypeError);
  assert.throws(() => q(1, 2.5), TypeError);
  assert.throws(() => q(NaN), TypeError);
  assert.throws(() => q(2 ** 60), TypeError);
  assert.throws(() => div(ONE, ZERO), RangeError);
});

test('invariant: every result is in lowest terms with d > 0', () => {
  forSeeds(N, (rng) => {
    const a = rq(rng, 50); const b = rqNonzero(rng, 50);
    for (const r of [add(a, b), sub(a, b), mul(a, b), div(a, b), neg(a)]) {
      assert.ok(r.d > 0n);
      assert.equal(gcd(r.n, r.d), 1n);
    }
  });
});

test('field axioms on Q', () => {
  forSeeds(N, (rng) => {
    const a = rq(rng); const b = rq(rng); const c = rq(rng);
    assert.ok(qeq(add(a, b), add(b, a)), 'add commutes');
    assert.ok(qeq(mul(a, b), mul(b, a)), 'mul commutes');
    assert.ok(qeq(add(add(a, b), c), add(a, add(b, c))), 'add associates');
    assert.ok(qeq(mul(mul(a, b), c), mul(a, mul(b, c))), 'mul associates');
    assert.ok(qeq(mul(a, add(b, c)), add(mul(a, b), mul(a, c))), 'distributes');
    assert.ok(qeq(add(a, ZERO), a), 'additive identity');
    assert.ok(qeq(mul(a, ONE), a), 'multiplicative identity');
    assert.ok(qeq(add(a, neg(a)), ZERO), 'additive inverse');
    assert.ok(qeq(sub(a, b), add(a, neg(b))), 'sub is add neg');
    if (a.n !== 0n) {
      assert.ok(qeq(mul(a, div(ONE, a)), ONE), 'multiplicative inverse');
      assert.ok(qeq(div(mul(b, a), a), b), 'div undoes mul');
    }
  });
});

test('arithmetic agrees with raw cross-multiplication (independent path)', () => {
  forSeeds(N, (rng) => {
    const an = BigInt(rng.int(-99, 99)); const ad = BigInt(rng.int(1, 99));
    const bn = BigInt(rng.int(-99, 99)); const bd = BigInt(rng.int(1, 99));
    const a = q(an, ad); const b = q(bn, bd);
    const s = add(a, b);
    assert.equal(s.n * ad * bd, (an * bd + bn * ad) * s.d);
    const p = mul(a, b);
    assert.equal(p.n * ad * bd, an * bn * p.d);
    // qeq is cross-multiplied equality
    assert.equal(qeq(a, b), an * bd === bn * ad);
    const want = an * bd < bn * ad ? -1 : an * bd > bn * ad ? 1 : 0;
    assert.equal(cmp(a, b), want);
  });
});

test('order: total, antisymmetric, compatible with the field operations', () => {
  forSeeds(N, (rng) => {
    const a = rq(rng); const b = rq(rng); const c = rq(rng);
    assert.equal(cmp(a, b) + cmp(b, a), 0);
    assert.equal(cmp(a, b) === 0, qeq(a, b));
    assert.equal(cmp(add(a, c), add(b, c)), cmp(a, b), 'translation invariant');
    if (cmp(c, ZERO) > 0) assert.equal(cmp(mul(a, c), mul(b, c)), cmp(a, b));
    if (cmp(c, ZERO) < 0) assert.equal(cmp(mul(a, c), mul(b, c)), cmp(b, a));
    if (cmp(a, b) <= 0 && cmp(b, c) <= 0) assert.ok(cmp(a, c) <= 0, 'transitive');
  });
});

test('qstr / qparse round trip (the "n/d" save format)', () => {
  forSeeds(N, (rng) => {
    const a = rq(rng, 1000);
    assert.match(qstr(a), /^-?\d+\/\d+$/);
    const back = qparse(qstr(a));
    assert.ok(back && qeq(back, a));
  });
  assert.deepEqual(qparse('7'), q(7));
  assert.deepEqual(qparse('6/8'), q(3, 4));
  for (const bad of ['', '1/0', '1.5', 'x', '1/-2', '--1', '1/2/3', ' 1']) assert.equal(qparse(bad), undefined, bad);
});

test('qpow matches repeated multiplication; 0^0 and 0^negative are undefined', () => {
  forSeeds(2000, (rng) => {
    const a = rqNonzero(rng, 7); const e = rng.int(-6, 6);
    let want = ONE;
    for (let i = 0; i < Math.abs(e); i++) want = mul(want, a);
    if (e < 0) want = div(ONE, want);
    const got = qpow(a, e);
    assert.ok(got && qeq(got, want));
  });
  assert.equal(qpow(ZERO, 0), undefined);
  assert.equal(qpow(ZERO, -1), undefined);
  assert.deepEqual(qpow(ZERO, 3), ZERO);
  assert.deepEqual(qpow(q(-1), 10n ** 30n), ONE);
  assert.deepEqual(qpow(q(-1), 10n ** 30n + 1n), q(-1));
  assert.throws(() => qpow(q(2), 10n ** 30n), MathLimit);
  assert.throws(() => qpow(q(3), 100000), MathLimit);
});

test('isqrt and exactRoot are exact', () => {
  forSeeds(N, (rng) => {
    const n = BigInt(rng.int(0, 2 ** 31)) * BigInt(rng.int(1, 2 ** 31)) * BigInt(rng.int(1, 2 ** 31));
    const r = isqrt(n);
    assert.ok(r * r <= n && (r + 1n) * (r + 1n) > n);
    const k = rng.int(1, 5);
    const b = BigInt(rng.int(0, 5000));
    assert.equal(exactRoot(b ** BigInt(k), k), b);
    if (b > 1n && k > 1) assert.equal(exactRoot(b ** BigInt(k) + 1n, k), undefined);
  });
  assert.equal(exactRoot(-8n, 3), undefined);
});
