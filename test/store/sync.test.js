// @ts-check
// Sync client + retry queue, against the in-process API mock (scripts/serve.js),
// with injected network faults. The mock is checked against the contract in
// test/contract/; here it is the server the client talks to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, memFiles } from '../../scripts/serve.js';
import { memoryStore } from '../../src/store/idb.js';
import {
  createSync, backupStatus, readBackupStatus, redeemCode, mintCode, takeBatch, BACKOFF_MS, KEEPALIVE_BATCH_BYTES,
} from '../../src/store/sync.js';
import { makeUlidFactory, localIso } from '../../src/store/save-format.js';
import { forSeeds } from '../prop.js';
import { makeRng } from '../../src/gen/prng.js';

/** @typedef {import('../../src/store/sync.js').FetchLike} FetchLike */

/** A world: one mock server, a fake clock, devices with memory stores. */
function world(seed = 'w') {
  const rng = makeRng(seed);
  let nowMs = 1794000000000;
  const files = memFiles();
  const api = createApi({ files, nowMs: () => nowMs, randomBytes: (n) => Buffer.from(new Uint8Array(n).map(() => rng.int(0, 255))) });
  const ulid = makeUlidFactory((n) => new Uint8Array(n).map(() => rng.int(0, 255)));
  /** @type {string | null} 'fail-before' | 'fail-after' | status code as string */
  let fault = null;
  const log = /** @type {{ url: string; body: any; keepalive: boolean }[]} */ ([]);
  /** @type {FetchLike} */
  const fetch = async (url, init) => {
    log.push({ url, body: JSON.parse(init.body), keepalive: !!init.keepalive });
    const f = fault;
    if (f === 'fail-before') throw new TypeError('network down');
    if (f && /^\d+$/.test(f)) return { status: Number(f), json: async () => ({ error: 'injected' }) };
    const ep = url === 'api/sync.php' ? 'sync' : url === 'api/pair.php' ? 'pair' : null;
    assert.ok(ep, `relative endpoint expected, got ${url}`);
    const r = api[ep]({ method: init.method, body: init.body, ip: '10.0.0.1' });
    if (f === 'fail-after') throw new TypeError('reply lost');
    return { status: r.status, json: async () => JSON.parse(String(r.body)) };
  };
  return {
    api, files, log, fetch,
    /** @param {string | null} f */
    setFault(f) { fault = f; },
    /** @param {number} ms */
    advance(ms) { nowMs += ms; },
    now: () => nowMs,
    /** @param {string} device @param {unknown} data */
    event(device, data) {
      return { id: ulid(nowMs), v: 1, t: localIso(nowMs, 300), build: 'abc1234', device, type: /** @type {const} */ ('attempt'), data };
    },
    /** server log ids, in order */
    serverIds() {
      const raw = files.read('k1.jsonl') ?? '';
      return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l).id);
    },
  };
}

/** @param {ReturnType<typeof world>} w @param {{ token?: string }} [o] */
async function device(w, o = {}) {
  const store = memoryStore();
  if (o.token !== null) await store.setMeta({ token: o.token ?? w.api.provision('k1', 'kid'), cursor: 0 });
  /** @type {{ fn: () => void; ms: number }[]} */
  const timers = [];
  const sync = createSync({ store, fetch: w.fetch, nowMs: w.now,
    setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    clearTimer: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } });
  return { store, sync, timers };
}

test('two devices converge through the server', async () => {
  const w = world();
  const a = await device(w);
  const b = await device(w);
  await a.store.appendLocal([w.event('a', { n: 1 }), w.event('a', { n: 2 })]);
  await b.store.appendLocal([w.event('b', { n: 3 })]);
  assert.deepEqual(await a.sync.now(), { ok: true, sent: 2, received: 0 });
  assert.deepEqual(await b.sync.now(), { ok: true, sent: 1, received: 2 });
  assert.deepEqual(await a.sync.now(), { ok: true, sent: 0, received: 1 });
  assert.deepEqual(await a.store.allEvents(), await b.store.allEvents());
  assert.equal(await a.store.pendingCount(), 0);
  assert.equal(w.serverIds().length, 3);
  for (const r of w.log) assert.equal(r.url, 'api/sync.php');
});

test('a wiped store pairs by code and restores the whole log', async () => {
  const w = world();
  const a = await device(w);
  const evs = Array.from({ length: 30 }, (_, i) => w.event('a', { i }));
  await a.store.appendLocal(evs);
  await a.sync.now();
  const teacher = w.api.provision('k1', 'teacher');
  const m = await mintCode({ fetch: w.fetch, token: teacher });
  assert.ok(m.ok);
  const fresh = await device(w, { token: /** @type {any} */ (null) });
  assert.deepEqual(await fresh.sync.now(), { ok: false, reason: 'unpaired', sent: 0, received: 0 });
  assert.deepEqual(await redeemCode({ store: fresh.store, fetch: w.fetch, code: m.code }), { ok: true });
  assert.deepEqual(await redeemCode({ store: fresh.store, fetch: w.fetch, code: m.code }), { ok: false, reason: 'bad-code' });
  assert.deepEqual(await redeemCode({ store: fresh.store, fetch: w.fetch, code: '12' }), { ok: false, reason: 'bad-format' });
  const r = await fresh.sync.now();
  assert.deepEqual(r, { ok: true, sent: 0, received: 30 });
  assert.deepEqual(await fresh.store.allEvents(), evs);
  assert.equal(await fresh.store.pendingCount(), 0, 'restored events are not re-queued');
});

test('retry queue: a failed sync keeps the outbox, backs off 5 s, 15 s, 60 s, 300 s, 300 s, then succeeds', async () => {
  const w = world();
  const a = await device(w);
  await a.store.appendLocal([w.event('a', { n: 1 })]);
  w.setFault('fail-before');
  const delays = [];
  let r = await a.sync.now();
  assert.deepEqual(r, { ok: false, reason: 'offline', sent: 0, received: 0 });
  for (let i = 0; i < 5; i++) {
    assert.equal(a.timers.length, 1, 'exactly one retry armed');
    delays.push(a.timers[0].ms);
    const t = /** @type {any} */ (a.timers.shift());
    t.fn();
    await new Promise((res) => setImmediate(res));
    await new Promise((res) => setImmediate(res));
  }
  assert.deepEqual(delays, [...BACKOFF_MS, 300000]);
  assert.equal(await a.store.pendingCount(), 1);
  assert.equal((await readBackupStatus(a.store, w.now())).state, 'never');
  w.setFault(null);
  r = await a.sync.now();
  assert.equal(r.ok, true);
  assert.equal(a.timers.length, 0, 'success clears the retry');
  assert.equal(await a.store.pendingCount(), 0);
  assert.equal(await a.store.getMeta('lastOkMs'), w.now());
  assert.equal(a.sync.retryState().failures, 0);
});

test('a lost reply is retried without duplicating anything on the server', async () => {
  const w = world();
  const a = await device(w);
  const e = w.event('a', { n: 1 });
  await a.store.appendLocal([e]);
  w.setFault('fail-after');
  assert.equal((await a.sync.now()).ok, false);
  assert.deepEqual(w.serverIds(), [e.id], 'the server did store it');
  assert.equal(await a.store.pendingCount(), 1, 'but the device does not know that');
  w.setFault(null);
  assert.equal((await a.sync.now()).ok, true);
  assert.deepEqual(w.serverIds(), [e.id], 'still exactly once');
});

test('429 and 5xx are retried; 401 and 400 are not', async () => {
  for (const [code, reason, retried] of /** @type {[string, string, boolean][]} */ ([
    ['429', 'http-429', true], ['500', 'http-500', true], ['503', 'http-503', true],
    ['401', 'token-rejected', false], ['400', 'rejected', false], ['403', 'rejected', false]])) {
    const w = world();
    const a = await device(w);
    await a.store.appendLocal([w.event('a', {})]);
    w.setFault(code);
    const r = await a.sync.now();
    assert.equal(r.ok, false);
    assert.equal(/** @type {any} */ (r).reason, reason, code);
    assert.equal(a.timers.length, retried ? 1 : 0, code);
    assert.equal(await a.store.pendingCount(), 1);
    assert.equal(await a.store.getMeta('lastError'), reason);
  }
});

test('keepalive sends one batch under 60000 bytes; a plain sync drains everything in batches', async () => {
  const w = world();
  const a = await device(w);
  const evs = Array.from({ length: 400 }, (_, i) => w.event('a', { i, pad: 'p'.repeat(1000) }));
  await a.store.appendLocal(evs);
  const r1 = await a.sync.now({ keepalive: true });
  assert.equal(r1.ok, true);
  assert.equal(w.log.length, 1);
  assert.equal(w.log[0].keepalive, true);
  assert.ok(Buffer.byteLength(JSON.stringify(w.log[0].body)) <= KEEPALIVE_BATCH_BYTES);
  assert.ok(r1.sent > 10 && r1.sent < 400);
  assert.equal(await a.store.pendingCount(), 400 - r1.sent);
  assert.equal(await a.store.getMeta('lastOkMs'), undefined, 'not backed up while events remain');
  const r2 = await a.sync.now();
  assert.equal(r2.ok, true);
  assert.equal(await a.store.pendingCount(), 0);
  assert.ok(w.log.length >= 3, 'several batches');
  for (const req of w.log) assert.ok(Buffer.byteLength(JSON.stringify(req.body)) <= 200000);
  assert.deepEqual(w.serverIds(), evs.map((e) => e.id));
  assert.equal(await a.store.getMeta('lastOkMs'), w.now());
});

test('413 halves the batch until it fits', async () => {
  const w = world();
  const store = memoryStore();
  await store.setMeta({ token: w.api.provision('k1', 'kid'), cursor: 0 });
  const evs = Array.from({ length: 50 }, (_, i) => w.event('a', { i, pad: 'q'.repeat(500) }));
  await store.appendLocal(evs);
  /** @type {FetchLike} */
  const small = async (url, init) => (Buffer.byteLength(init.body) > 9000
    ? { status: 413, json: async () => ({ error: 'too-large' }) } : w.fetch(url, init));
  const s = createSync({ store, fetch: small, nowMs: w.now });
  const r = await s.now();
  assert.equal(r.ok, true);
  assert.equal(await store.pendingCount(), 0);
  assert.deepEqual(w.serverIds(), evs.map((e) => e.id));
});

test('takeBatch: always at least one event, never over the cap otherwise', () => {
  const w = world();
  const evs = Array.from({ length: 20 }, (_, i) => w.event('a', { i }));
  assert.equal(takeBatch(evs, 0, 1).length, 1);
  assert.equal(takeBatch([], 0, 1).length, 0);
  const b = takeBatch(evs, 0, 1000);
  assert.ok(Buffer.byteLength(JSON.stringify({ token: '0'.repeat(32), since: 0, events: b })) <= 1000);
  assert.ok(Buffer.byteLength(JSON.stringify({ token: '0'.repeat(32), since: 0, events: evs.slice(0, b.length + 1) })) > 1000);
});

test('backupStatus: the one source of "backed up N min ago"', () => {
  const now = 1794000000000;
  const m = 60000;
  /** @type {[Parameters<typeof backupStatus>[0], string, string][]} */
  const table = [
    [{ paired: false, lastOkMs: null, pending: 3, nowMs: now }, 'unpaired', 'not backed up: this device is not paired'],
    [{ paired: true, lastOkMs: null, pending: 0, nowMs: now }, 'never', 'not backed up yet'],
    [{ paired: true, lastOkMs: undefined, pending: 1, nowMs: now }, 'never', 'not backed up yet (1 event waiting)'],
    [{ paired: true, lastOkMs: now - 59999, pending: 0, nowMs: now }, 'ok', 'backed up just now'],
    [{ paired: true, lastOkMs: now - m, pending: 0, nowMs: now }, 'ok', 'backed up 1 min ago'],
    [{ paired: true, lastOkMs: now - 59 * m, pending: 0, nowMs: now }, 'ok', 'backed up 59 min ago'],
    [{ paired: true, lastOkMs: now - 60 * m, pending: 0, nowMs: now }, 'ok', 'backed up 1 h ago'],
    [{ paired: true, lastOkMs: now - 47 * 60 * m, pending: 0, nowMs: now }, 'ok', 'backed up 47 h ago'],
    [{ paired: true, lastOkMs: now - 48 * 60 * m, pending: 0, nowMs: now }, 'ok', 'backed up 2 days ago'],
    [{ paired: true, lastOkMs: now - 12 * m, pending: 3, nowMs: now }, 'pending', 'backed up 12 min ago; 3 events newer not yet'],
    [{ paired: true, lastOkMs: now + 5 * m, pending: 0, nowMs: now }, 'ok', 'backed up just now'],
    [{ paired: true, rejected: true, lastOkMs: now - 3 * 24 * 60 * m, pending: 1, nowMs: now }, 'unpaired',
      'not backed up: this device must be paired again (1 event waiting)'],
    [{ paired: true, rejected: true, lastOkMs: null, pending: 0, nowMs: now }, 'unpaired', 'not backed up: this device must be paired again'],
  ];
  for (const [input, state, text] of table) {
    const s = backupStatus(input);
    assert.equal(s.state, state, text);
    assert.equal(s.text, text);
  }
  assert.equal(backupStatus({ paired: true, lastOkMs: now - 12 * m, pending: 0, nowMs: now }).minutes, 12);
});

test('property: random appends, syncs and faults on 3 devices always converge, each event once on the server', async () => {
  const seeds = [];
  forSeeds(1500, (_r, s) => { seeds.push(s); }, { prefix: 'sync' });
  for (const seed of seeds) {
    const rng = makeRng(seed);
    const w = world(seed);
    const devs = [await device(w), await device(w), await device(w)];
    const made = new Set();
    for (let step = 0; step < 20; step++) {
      w.advance(1500);
      const d = rng.pick(devs);
      const op = rng.int(0, 2);
      if (op === 0) {
        const evs = Array.from({ length: rng.int(1, 3) }, () => w.event(`d${devs.indexOf(d)}`, { step }));
        for (const e of evs) made.add(e.id);
        await d.store.appendLocal(evs);
      } else {
        w.setFault(rng.pick([null, null, null, 'fail-before', 'fail-after', '429', '500']));
        await d.sync.now({ keepalive: rng.bool(0.3) });
        w.setFault(null);
      }
    }
    // Quiet network: two rounds of sync on every device reach a fixed point.
    for (let round = 0; round < 2; round++) for (const d of devs) { w.advance(1500); assert.equal((await d.sync.now()).ok, true, seed); }
    const server = w.serverIds();
    assert.equal(new Set(server).size, server.length, `${seed}: no duplicate lines`);
    assert.deepEqual([...server].sort(), [...made].sort(), `${seed}: every event reached the server`);
    for (const d of devs) {
      assert.deepEqual((await d.store.allEvents()).map((e) => e.id), [...made].sort(), `${seed}: device has the union`);
      assert.equal(await d.store.pendingCount(), 0);
      assert.equal((await readBackupStatus(d.store, w.now())).state, 'ok', seed);
    }
  }
});
