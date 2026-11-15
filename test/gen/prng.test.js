// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../../src/gen/prng.js';
import { forSeeds } from '../prop.js';

/** @param {import('../../types.d.ts').Rng} r @param {number} k */
const draws = (r, k) => Array.from({ length: k }, () => r.next());

test('golden sequence: the algorithm must never change (seeds are saved)', () => {
  const r = makeRng('keystone');
  assert.deepEqual(draws(r, 5), GOLDEN_KEYSTONE);
  const s = makeRng('keystone');
  assert.deepEqual([s.int(1, 6), s.int(-10, 10), s.int(0, 0)], GOLDEN_INTS);
});

test('determinism: same seed, same stream, for every method', () => {
  forSeeds(500, (_rng, seed) => {
    /** @param {import('../../types.d.ts').Rng} r */
    const run = (r) => [r.next(), r.int(-50, 50), r.pick(['a', 'b', 'c']), r.shuffle([1, 2, 3, 4, 5]).join(''), r.bool(0.3), r.fork('x').next()];
    assert.deepEqual(run(makeRng(seed)), run(makeRng(seed)));
  });
});

test('different seeds give different streams', () => {
  const firsts = new Set();
  forSeeds(5000, (_r, seed) => { firsts.add(draws(makeRng(seed), 2).join(',')); });
  assert.equal(firsts.size, 5000);
});

test('fork depends only on (seed, label), not on prior draws, and labels differ', () => {
  forSeeds(500, (_r, seed) => {
    const a = makeRng(seed);
    const b = makeRng(seed);
    draws(b, 17);
    assert.deepEqual(draws(a.fork('alpha'), 4), draws(b.fork('alpha'), 4));
    assert.notDeepEqual(draws(a.fork('alpha'), 4), draws(a.fork('beta'), 4));
    assert.notDeepEqual(draws(makeRng(seed), 4), draws(a.fork('alpha'), 4));
    assert.equal(a.fork('alpha').seed, `${seed}#fork:alpha`);
  });
});

test('next() is a uint32', () => {
  const r = makeRng('u32');
  for (let i = 0; i < 10000; i++) {
    const x = r.next();
    assert.ok(Number.isInteger(x) && x >= 0 && x < 4294967296);
  }
});

test('int is inclusive, in range, and roughly uniform (chi-square)', () => {
  const r = makeRng('chi');
  const N = 60000;
  const counts = new Array(6).fill(0);
  for (let i = 0; i < N; i++) {
    const x = r.int(1, 6);
    assert.ok(Number.isInteger(x) && x >= 1 && x <= 6);
    counts[x - 1]++;
  }
  const e = N / 6;
  const chi2 = counts.reduce((acc, c) => acc + ((c - e) ** 2) / e, 0);
  // df = 5; P(chi2 > 20.5) ~ 0.001. Seed is fixed, so this is not flaky.
  assert.ok(chi2 < 20.5, `chi2 = ${chi2}, counts ${counts}`);
  // Edge ranges.
  assert.equal(r.int(7, 7), 7);
  const wide = new Set(Array.from({ length: 2000 }, () => r.int(-3, 3)));
  assert.deepEqual([...wide].sort((a, b) => a - b), [-3, -2, -1, 0, 1, 2, 3]);
  const full = r.int(0, 4294967295);
  assert.ok(full >= 0 && full <= 4294967295);
});

test('int rejects bad ranges', () => {
  const r = makeRng('bad');
  assert.throws(() => r.int(3, 2), RangeError);
  assert.throws(() => r.int(0.5, 2), RangeError);
  assert.throws(() => r.int(0, 4294967296), RangeError);
  assert.throws(() => r.pick([]), RangeError);
  assert.throws(() => r.bool(1.5), RangeError);
  assert.throws(() => r.bool(NaN), RangeError);
  assert.throws(() => makeRng(/** @type {any} */ (42)), TypeError);
});

test('shuffle is a permutation, does not mutate, and is roughly uniform over 3! orders', () => {
  const r = makeRng('shuf');
  const src = Object.freeze([1, 2, 3]);
  /** @type {Map<string, number>} */
  const counts = new Map();
  const N = 30000;
  for (let i = 0; i < N; i++) {
    const s = r.shuffle(src);
    assert.deepEqual([...s].sort(), [1, 2, 3]);
    counts.set(s.join(''), (counts.get(s.join('')) ?? 0) + 1);
  }
  assert.equal(counts.size, 6);
  const e = N / 6;
  const chi2 = [...counts.values()].reduce((acc, c) => acc + ((c - e) ** 2) / e, 0);
  assert.ok(chi2 < 20.5, `chi2 = ${chi2}`);
  assert.deepEqual(r.shuffle([]), []);
});

test('pick covers every element; bool tracks p', () => {
  const r = makeRng('pick');
  const seen = new Set(Array.from({ length: 1000 }, () => r.pick(['a', 'b', 'c', 'd'])));
  assert.equal(seen.size, 4);
  const N = 40000;
  let t = 0;
  for (let i = 0; i < N; i++) if (r.bool(0.3)) t++;
  // sd = sqrt(N p q) ~ 92; allow ~5 sd.
  assert.ok(Math.abs(t - 0.3 * N) < 460, `bool(0.3) gave ${t}/${N}`);
  for (let i = 0; i < 1000; i++) {
    assert.equal(r.bool(0), false);
    assert.equal(r.bool(1), true);
  }
});

test('forSeeds reports the failing seed', () => {
  assert.equal(forSeeds(10, () => {}), 10);
  assert.throws(() => forSeeds(10, (_r, seed) => seed !== 'p7'), /seed "p7".*returned false/);
  assert.throws(() => forSeeds(10, (_r, seed) => { if (seed === 'q3') throw new Error('boom'); }, { prefix: 'q' }), /seed "q3": boom/);
});

// Pinned from the first run of this implementation (xmur3 + sfc32, 12 warm-up draws).
const GOLDEN_KEYSTONE = [3365366678, 2298848848, 4178342866, 1902367026, 1407718250];
// int checked by hand from the raw draws: 1 + 3365366678 % 6 = 3; -10 + 2298848848 % 21 = 6.
const GOLDEN_INTS = [3, 6, 0];
