// @ts-check
// src/app/boot.js: the app object, the service-worker updater, the stub page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createUpdater, stubHtml, padReduce, buildFromUrl, esc } from '../../src/app/boot.js';
import { memoryStore } from '../../src/store/idb.js';
import { validateEvent } from '../../src/store/save-format.js';
import { createApi, memFiles } from '../../scripts/serve.js';
import { tryDayOf } from '../../src/learner/scheduler.js';
import { replay } from '../../src/learner/model.js';

function env() {
  let nowMs = Date.UTC(2026, 10, 13, 1, 30); // 2026-11-12 20:30 at UTC-5
  let k = 0;
  const api = createApi({ files: memFiles(), nowMs: () => nowMs });
  /** @type {import('../../src/store/sync.js').FetchLike} */
  const fetch = async (url, init) => {
    const r = api[url === 'api/sync.php' ? 'sync' : 'pair']({ method: init.method, body: init.body, ip: '1' });
    return { status: r.status, json: async () => JSON.parse(String(r.body)) };
  };
  return {
    api, fetch,
    advance: (/** @type {number} */ ms) => { nowMs += ms; },
    deps: {
      store: memoryStore(), fetch, build: 'abc1234', nowMs: () => nowMs, tzOffsetMin: () => 300,
      randomBytes: (/** @type {number} */ n) => new Uint8Array(n).map(() => (k++ * 29 + 3) & 255),
    },
  };
}

test('buildFromUrl reads the v/<hash>/ directory, else dev', () => {
  assert.equal(buildFromUrl('https://shadyalexi.com/v/abc1234/src/app/boot.js'), 'abc1234');
  assert.equal(buildFromUrl('https://shadyalexi.com/staging/v/0123456789abcdef/src/app/boot.js'), '0123456789abcdef');
  assert.equal(buildFromUrl('http://localhost:8000/src/app/boot.js'), 'dev');
  assert.equal(buildFromUrl('https://x/v/ABC/src/app/boot.js'), 'dev');
});

test('app.log.append writes valid, ordered events on the local calendar day, and queues them', async () => {
  const e = env();
  const app = await createApp(e.deps);
  assert.match(app.device, /^[0-9a-f]{16}$/);
  const a = await app.log.append('session-start', { knots: 10 });
  const b = await app.log.append('setting', { sound: false });
  e.advance(-5000); // clock steps back
  const c = await app.log.append('session-end', {});
  for (const ev of [a, b, c]) {
    assert.equal(validateEvent(ev), null);
    assert.equal(ev.build, 'abc1234');
    assert.equal(ev.device, app.device);
  }
  assert.ok(a.id < b.id && b.id < c.id, 'ids increase even in one ms and with a backward clock');
  assert.equal(a.t, '2026-11-12T20:30:00.000-05:00');
  assert.equal(tryDayOf(a.t), Date.UTC(2026, 10, 12) / 86400000, 'evening event lands on the local day');
  assert.equal(await app.store.pendingCount(), 3);
  assert.equal(replay(await app.store.allEvents()).rejected, 0);
  // The device id survives a restart on the same store.
  const again = await createApp(e.deps);
  assert.equal(again.device, app.device);
});

test('pairing restores the whole log onto an empty device; backup status follows', async () => {
  const e = env();
  const kid = e.api.provision('k1', 'kid');
  const teacher = e.api.provision('k1', 'teacher');
  const first = await createApp(e.deps);
  await first.store.setMeta({ token: kid, cursor: 0 });
  for (let i = 0; i < 5; i++) await first.log.append('attempt', { i });
  assert.equal((await first.backup()).state, 'never');
  assert.equal((await first.sync.now()).ok, true);
  assert.equal((await first.backup()).text, 'backed up just now');
  e.advance(7 * 60000);
  assert.equal((await first.backup()).text, 'backed up 7 min ago');

  const fresh = await createApp({ ...e.deps, store: memoryStore() });
  assert.equal(await fresh.needsPairing(), true);
  assert.equal((await fresh.backup()).state, 'unpaired');
  const code = JSON.parse(String(e.api.pair({ method: 'POST', body: JSON.stringify({ action: 'mint', token: teacher }), ip: '1' }).body)).code;
  assert.deepEqual(await fresh.pair('1234'), { ok: false, reason: 'bad-format' });
  const r = await fresh.pair(code);
  assert.deepEqual(r, { ok: true, restored: 5 });
  assert.deepEqual(await fresh.store.allEvents(), await first.store.allEvents());
  assert.equal(await fresh.needsPairing(), false);
  assert.equal((await fresh.backup()).state, 'ok');
});

test('session-end triggers a sync; exportJSON/importJSON round trip', async () => {
  const e = env();
  const app = await createApp(e.deps);
  await app.store.setMeta({ token: e.api.provision('k1', 'kid'), cursor: 0 });
  await app.log.append('session-start', {});
  await app.log.append('session-end', {});
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(await app.store.pendingCount(), 0, 'synced without being asked');
  const text = await app.exportJSON();
  const other = await createApp({ ...e.deps, store: memoryStore() });
  const r = await other.importJSON(text);
  assert.equal(r.added, 2);
  assert.deepEqual(await other.store.allEvents(), await app.store.allEvents());
});

/** A fake navigator.serviceWorker with one registration. */
function fakeSw() {
  /** @type {Record<string, (() => void)[]>} */
  const listeners = {};
  const posted = [];
  const reg = {
    active: /** @type {any} */ ({ state: 'activated' }),
    waiting: /** @type {any} */ (null),
    installing: /** @type {any} */ (null),
    updates: 0,
    /** @type {Record<string, (() => void)[]>} */
    l: {},
    addEventListener(/** @type {string} */ t, /** @type {() => void} */ f) { (this.l[t] ??= []).push(f); },
    async update() { this.updates++; },
  };
  const sw = {
    controller: /** @type {any} */ ({}),
    registered: /** @type {any[]} */ ([]),
    addEventListener(/** @type {string} */ t, /** @type {() => void} */ f) { (listeners[t] ??= []).push(f); },
    async register(/** @type {string} */ url, /** @type {any} */ o) { this.registered.push([url, o]); return reg; },
    fire(/** @type {string} */ t) { for (const f of listeners[t] ?? []) f(); },
  };
  /** Simulate a new worker finishing install. */
  function newWaiting() {
    const w = { state: 'installing', l: /** @type {(() => void)[]} */ ([]), postMessage: (/** @type {any} */ m) => posted.push(m),
      addEventListener(/** @type {string} */ _t, /** @type {() => void} */ f) { this.l.push(f); } };
    reg.installing = w;
    for (const f of reg.l.updatefound ?? []) f();
    w.state = 'installed';
    reg.installing = null;
    reg.waiting = w;
    for (const f of w.l) f();
  }
  return { sw, reg, posted, newWaiting };
}

test('updater: registers sw.js relatively, never swaps mid-run, swaps and reloads once at Camp', async () => {
  const f = fakeSw();
  let running = false;
  let reloads = 0;
  const u = createUpdater({ sw: f.sw, isRunActive: () => running, reload: () => { reloads++; } });
  await u.register();
  assert.deepEqual(f.sw.registered, [['sw.js', { scope: './' }]]);

  running = true;
  f.newWaiting();
  assert.deepEqual(f.posted, [], 'a worker that finishes installing mid-run waits');
  await u.check();
  assert.equal(f.reg.updates, 0, 'no update check mid-run');
  assert.deepEqual(f.posted, []);
  f.sw.fire('controllerchange');
  assert.equal(reloads, 0, 'a controller change this page did not ask for never reloads it');

  running = false;
  await u.check();
  assert.equal(f.reg.updates, 1, 'registration.update() on resume at Camp');
  assert.deepEqual(f.posted, [{ type: 'skip-waiting' }]);
  f.sw.fire('controllerchange');
  f.sw.fire('controllerchange');
  assert.equal(reloads, 1, 'reloads exactly once');
});

test('updater: first install (no controller) never posts skip-waiting; no service worker is a no-op', async () => {
  const f = fakeSw();
  f.sw.controller = null;
  const u = createUpdater({ sw: f.sw, isRunActive: () => false, reload: () => { throw new Error('no'); } });
  await u.register();
  f.newWaiting();
  await u.check();
  assert.deepEqual(f.posted, []);
  const none = createUpdater({ sw: null, isRunActive: () => false, reload: () => {} });
  assert.equal(await none.register(), null);
  await none.check();
});

test('app.run.end syncs and then checks for an update; run.active blocks the swap', async () => {
  const e = env();
  const app = await createApp(e.deps);
  const f = fakeSw();
  const u = createUpdater({ sw: f.sw, isRunActive: () => app.run.active, reload: () => {} });
  await u.register();
  app.setUpdater(u);
  app.run.start();
  f.newWaiting();
  assert.deepEqual(f.posted, []);
  await app.run.end();
  assert.equal(f.reg.updates, 1);
  assert.deepEqual(f.posted, [{ type: 'skip-waiting' }]);
});

test('stub page: build hash, storage status, backup text, proto link, escaping, no absolute URLs', () => {
  const base = { build: 'abc1234', storage: { kind: 'memory', note: 'in-memory: <x>', persisted: false }, events: 3,
    backup: { text: 'backed up 2 min ago', state: 'ok' }, code: '123', message: '', showPad: true, exported: null };
  const h = stubHtml(base);
  assert.match(h, /build abc1234/);
  assert.match(h, /in-memory: &#60;x&#62;; not persistent/);
  assert.match(h, /events on this device: 3/);
  assert.match(h, /backed up 2 min ago/);
  assert.match(h, /<a href="proto\/">/);
  assert.match(h, /1 2 3 - - - - -/);
  assert.equal((h.match(/data-key="\d"/g) ?? []).length, 10);
  assert.doesNotMatch(h, /(href|src)="\//);
  assert.doesNotMatch(stubHtml({ ...base, showPad: false }), /data-key="pair"/);
  assert.match(stubHtml({ ...base, exported: '{"a":"</textarea>"}' }), /&#60;\/textarea&#62;/);
  assert.equal(esc(`<&>"'`), '&#60;&#38;&#62;&#34;&#39;');
  // ASCII only.
  assert.doesNotMatch(h, /[^\x00-\x7f]/);
});

test('padReduce: digits up to 8, delete, nothing else', () => {
  let c = '';
  for (const k of '1234567890') c = padReduce(c, k);
  assert.equal(c, '12345678');
  assert.equal(padReduce(c, 'back'), '1234567');
  assert.equal(padReduce('', 'back'), '');
  assert.equal(padReduce('12', 'x'), '12');
  assert.equal(padReduce('12', '+'), '12');
});

test('a revoked (401) token: needsPairing and the backup text say so; re-pairing clears it and backs up the waiting events', async () => {
  const e = env();
  const teacher = e.api.provision('k1', 'teacher');
  const app = await createApp(e.deps);
  const mint = () => JSON.parse(String(e.api.pair({ method: 'POST', body: JSON.stringify({ action: 'mint', token: teacher }), ip: 'p' }).body)).code;
  // Events logged before the device was ever paired: pairing is still needed.
  await app.log.append('attempt', { a: 0 });
  assert.equal(await app.needsPairing(), true, 'events but no token');
  assert.equal((await app.pair(mint())).ok, true);
  assert.equal(await app.needsPairing(), false);
  assert.equal((await app.backup()).state, 'ok');

  const list = JSON.parse(String(e.api.pair({ method: 'POST', body: JSON.stringify({ action: 'list', token: teacher }), ip: 'p' }).body));
  const kid = list.devices.find((/** @type {any} */ d) => d.role === 'kid');
  e.api.pair({ method: 'POST', body: JSON.stringify({ action: 'revoke', token: teacher, id: kid.id }), ip: 'p' });
  e.advance(3 * 86400000);
  await app.log.append('attempt', { a: 1 });
  assert.deepEqual(await app.sync.now(), { ok: false, reason: 'token-rejected', sent: 0, received: 0 });
  assert.equal(await app.needsPairing(), true);
  assert.deepEqual(await app.backup(), { state: 'unpaired', minutes: 3 * 24 * 60, pending: 1,
    text: 'not backed up: this device must be paired again (1 event waiting)' });
  // A transient failure afterwards does not hide it.
  const offline = await createApp({ ...e.deps, fetch: async () => { throw new TypeError('offline'); } });
  assert.equal((await offline.sync.now()).reason, 'offline');
  assert.equal(await app.needsPairing(), true);

  const r = await app.pair(mint());
  assert.equal(r.ok, true);
  assert.equal(await app.needsPairing(), false);
  assert.equal((await app.backup()).text, 'backed up just now');
  assert.equal(await app.store.pendingCount(), 0);
});
