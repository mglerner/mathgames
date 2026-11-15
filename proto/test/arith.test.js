// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { q, add, sub, mul, div, qeq, cmp } from '../js/rational.js';
import { sq, sqrtQ, sadd, smul, sdiv, seq, squarefreeSplit, isSquarefree, toQ } from '../js/surd.js';
import { makeRng } from '../js/rng.js';
import { solveUpTo2, sameSet } from '../js/exact.js';
import { pq, pmono, padd, pmul, pevalQ } from '../js/poly.js';

const rng = makeRng('arith-tests');
const rq = () => q(rng.int(-40, 40), rng.int(1, 30));

test('rationals: normal form and field axioms on 3000 random triples', () => {
  assert.deepEqual(q(8, 6), { n: 4n, d: 3n });
  assert.deepEqual(q(3, -6), { n: -1n, d: 2n });
  assert.deepEqual(q(0, -5), { n: 0n, d: 1n });
  assert.throws(() => q(1, 0));
  for (let i = 0; i < 3000; i++) {
    const a = rq();
    const b = rq();
    const c = rq();
    assert.ok(qeq(add(a, b), add(b, a)));
    assert.ok(qeq(mul(add(a, b), c), add(mul(a, c), mul(b, c))));
    assert.ok(qeq(sub(add(a, b), b), a));
    if (b.n !== 0n) assert.ok(qeq(mul(div(a, b), b), a));
    assert.equal(cmp(a, a), 0);
  }
});

test('squarefree split agrees with brute force for 1..5000', () => {
  for (let m = 1; m <= 5000; m++) {
    const s = /** @type {{out: bigint, inn: bigint}} */ (squarefreeSplit(BigInt(m)));
    assert.equal(s.out * s.out * s.inn, BigInt(m));
    // inn squarefree by brute force
    for (let p = 2; p * p <= Number(s.inn); p++) assert.notEqual(Number(s.inn) % (p * p), 0, `m=${m}`);
  }
  assert.equal(isSquarefree(12n), false);
  assert.equal(isSquarefree(15n), true);
});

test('surds: sqrt(n) x sqrt(n) = n, products and quotients exact', () => {
  for (let n = 1n; n <= 400n; n++) {
    const r = /** @type {any} */ (sqrtQ(q(n)));
    assert.ok(seq(smul(r, r), sq(q(n))), `n=${n}`);
  }
  const s2 = /** @type {any} */ (sqrtQ(q(2)));
  const s3 = /** @type {any} */ (sqrtQ(q(3)));
  const s6 = /** @type {any} */ (sqrtQ(q(6)));
  assert.ok(seq(smul(s2, s3), s6));
  assert.ok(seq(/** @type {any} */ (sqrtQ(q(12))), smul(sq(q(2)), s3)));
  assert.ok(seq(/** @type {any} */ (sdiv(sq(q(6)), s3)), smul(sq(q(2)), s3)));
  assert.ok(!seq(sadd(s2, s3), /** @type {any} */ (sqrtQ(q(5)))));
  assert.equal(sqrtQ(q(-1)), undefined);
  assert.ok(seq(/** @type {any} */ (sqrtQ(q(1, 4))), sq(q(1, 2))));
  assert.deepEqual(toQ(smul(s2, s2)), q(2));
});

test('quadratic solution sets: built from roots, checked by substitution', () => {
  for (let i = 0; i < 2000; i++) {
    const r1 = q(rng.int(-9, 9), rng.int(1, 4));
    const r2 = q(rng.int(-9, 9), rng.int(1, 4));
    const a = q(rng.int(1, 5) * (rng.bool() ? 1 : -1));
    // a (x - r1)(x - r2)
    const p = pmul(pmul(pq(a), padd(pmono(q(1), 1), pq(q(-r1.n, r1.d)))), padd(pmono(q(1), 1), pq(q(-r2.n, r2.d))));
    const set = /** @type {any} */ (solveUpTo2(p));
    assert.equal(set.kind, 'finite');
    assert.equal(set.roots.length, qeq(r1, r2) ? 1 : 2);
    for (const r of [r1, r2]) assert.ok(set.roots.some((/** @type {any} */ s) => seq(s, sq(r))));
    for (const r of [r1, r2]) assert.equal(pevalQ(p, r).terms.length, 0);
    assert.ok(sameSet(set, /** @type {any} */ (solveUpTo2(pmul(p, pq(q(3)))))));
  }
  assert.equal(/** @type {any} */ (solveUpTo2(padd(pmono(q(1), 2), pq(q(1))))).kind, 'none');
  assert.equal(/** @type {any} */ (solveUpTo2([])).kind, 'all');
});
