// @ts-check
// Store semantics, run identically against the in-memory store and against
// the IndexedDB adapter driven by a fake IndexedDB (test/store/fake-idb.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, openStore } from '../../src/store/idb.js';
import { fakeIndexedDB } from './fake-idb.js';
import { forSeeds } from '../prop.js';
import { encodeUlid } from '../../src/store/save-format.js';

/** @typedef {import('../../src/store/idb.js').Store} Store */

/** @param {number} i */
const ev = (i) => ({ id: encodeUlid(1794000000000n + BigInt(i), BigInt(i)), v: 1, t: '2026-11-12T20:00:00.000-05:00',
  build: 'abc1234', device: 'd1', type: /** @type {const} */ ('attempt'), data: { i } });

/** @type {[string, () => Promise<Store>][]} */
const impls = [
  ['memory', async () => memoryStore()],
  ['indexeddb (fake)', async () => {
    const s = await openStore({ indexedDB: /** @type {any} */ (fakeIndexedDB()), setTimeout: () => 0, clearTimeout: () => {} });
    assert.equal(s.kind, 'indexeddb');
    return s;
  }],
];

for (const [name, make] of impls) {
  test(`${name}: meta set/get/delete and clone isolation`, async () => {
    const s = await make();
    assert.equal(await s.getMeta('x'), undefined);
    const v = { a: [1, 2] };
    await s.setMeta({ x: v, y: 3 });
    v.a.push(99);
    assert.deepEqual(await s.getMeta('x'), { a: [1, 2] }, 'stored by value');
    const got = await s.getMeta('x');
    got.a.push(5);
    assert.deepEqual(await s.getMeta('x'), { a: [1, 2] }, 'read by value');
    await s.setMeta({ x: undefined });
    assert.equal(await s.getMeta('x'), undefined);
    assert.equal(await s.getMeta('y'), 3);
  });

  test(`${name}: appendLocal queues, mergeRemote does not, ack drains`, async () => {
    const s = await make();
    assert.equal(await s.appendLocal([ev(2), ev(1)]), 2);
    assert.equal(await s.appendLocal([ev(1)]), 0, 'known id is not new');
    assert.deepEqual((await s.outbox()).map((e) => e.data), [{ i: 1 }, { i: 2 }], 'outbox in id order');
    assert.equal(await s.mergeRemote([ev(3), ev(2)], { cursor: 7 }), 1);
    assert.equal(await s.getMeta('cursor'), 7);
    assert.equal(await s.pendingCount(), 2);
    assert.equal(await s.count(), 3);
    await s.ack([ev(1).id], { lastOkMs: 5 });
    assert.deepEqual((await s.outbox()).map((e) => e.id), [ev(2).id]);
    assert.equal(await s.getMeta('lastOkMs'), 5);
    assert.deepEqual((await s.allEvents()).map((e) => e.id), [ev(1).id, ev(2).id, ev(3).id]);
    await s.clearAll();
    assert.equal(await s.count(), 0);
    assert.equal(await s.pendingCount(), 0);
    assert.equal(await s.getMeta('cursor'), undefined);
  });
}

test('memory and fake-IndexedDB stores agree on random operation sequences', async () => {
  const seeds = [];
  forSeeds(1000, (_r, seed) => { seeds.push(seed); });
  const { makeRng } = await import('../../src/gen/prng.js');
  for (const seed of seeds) {
    const rng = makeRng(seed);
    const a = memoryStore();
    const b = await openStore({ indexedDB: /** @type {any} */ (fakeIndexedDB()), setTimeout: () => 0, clearTimeout: () => {} });
    for (let step = 0; step < 25; step++) {
      const op = rng.int(0, 3);
      const evs = Array.from({ length: rng.int(0, 4) }, () => ev(rng.int(0, 30)));
      if (op === 0) assert.equal(await a.appendLocal(evs), await b.appendLocal(evs), `seed ${seed}`);
      else if (op === 1) assert.equal(await a.mergeRemote(evs, { cursor: step }), await b.mergeRemote(evs, { cursor: step }));
      else if (op === 2) { const ids = evs.map((e) => e.id); await a.ack(ids, { lastOkMs: step }); await b.ack(ids, { lastOkMs: step }); }
      else assert.deepEqual(await a.outbox(), await b.outbox());
    }
    assert.deepEqual(await a.allEvents(), await b.allEvents(), `seed ${seed}`);
    assert.deepEqual(await a.outbox(), await b.outbox(), `seed ${seed}`);
    assert.equal(await a.getMeta('cursor'), await b.getMeta('cursor'));
  }
});

test('the IndexedDB adapter persists across reopen (same fake factory)', async () => {
  const f = /** @type {any} */ (fakeIndexedDB());
  const o = { indexedDB: f, setTimeout: () => 0, clearTimeout: () => {} };
  const s1 = await openStore(o);
  await s1.appendLocal([ev(1)]);
  await s1.setMeta({ device: 'abc' });
  const s2 = await openStore(o);
  assert.equal(await s2.count(), 1);
  assert.equal(await s2.pendingCount(), 1);
  assert.equal(await s2.getMeta('device'), 'abc');
});

test('openStore falls back to memory, with a reason, when IndexedDB is missing or fails', async () => {
  const none = await openStore({ indexedDB: null });
  assert.equal(none.kind, 'memory');
  assert.match(none.note, /not available/);
  const bad = await openStore({ indexedDB: /** @type {any} */ (fakeIndexedDB({ failOpen: true })), setTimeout: () => 0, clearTimeout: () => {} });
  assert.equal(bad.kind, 'memory');
  assert.match(bad.note, /fake open failure/);
  /** @type {(() => void) | null} */
  let fire = null;
  const hang = { open: () => ({}) };
  const p = openStore({ indexedDB: /** @type {any} */ (hang), setTimeout: (fn) => { fire = fn; return 1; }, clearTimeout: () => {} });
  await Promise.resolve();
  assert.ok(fire);
  /** @type {any} */ (fire)();
  const timed = await p;
  assert.equal(timed.kind, 'memory');
  assert.match(timed.note, /timed out/);
});
