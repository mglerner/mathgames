// @ts-check
// Event envelope, ULIDs, local timestamps, save versions and migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEvent, encodeUlid, makeUlidFactory, localIso, makeEvent, makeSave, exportSave, depth,
  SAVE_VERSION, MAX_EVENT_BYTES,
} from '../../src/store/save-format.js';
import { migrate, saveVersion, importSave } from '../../src/store/migrations.js';
import { memoryStore } from '../../src/store/idb.js';
import { tryDayOf } from '../../src/learner/scheduler.js';
import { replay } from '../../src/learner/model.js';
import { forSeeds } from '../prop.js';
// Independent paths (tests may read proto/; src/ never does).
import { ulid as protoUlid, makeLog as protoMakeLog } from '../../proto/js/events.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const V1 = JSON.parse(readFileSync(join(HERE, 'fixtures', 'saves', 'v1.json'), 'utf8'));

const good = () => ({ id: '01M73XAC405J8ZCPY04P5EYN5S', v: 1, t: '2026-11-10T18:40:00.000-05:00', build: 'abc1234',
  device: '076cd1369b0065ca', type: 'attempt', data: { a: 1 } });

test('validateEvent accepts a well-formed event and names each defect', () => {
  assert.equal(validateEvent(good()), null);
  assert.equal(validateEvent({ ...good(), data: null }), null, 'null data is data');
  assert.equal(validateEvent({ ...good(), t: '2026-11-10T23:40:00Z' }), null);
  /** @type {[string, any][]} */
  const bad = [
    ['not an object', null], ['not an object', []], ['not an object', 'x'],
    ['bad id', { ...good(), id: '01m73xac405j8zcpy04p5eyn5s' }], ['bad id', { ...good(), id: '01M73XAC405J8ZCPY04P5EYN5' }],
    ['bad id', { ...good(), id: '01M73XAC405J8ZCPY04P5EYN5I' }], ['bad id', { ...good(), id: `${good().id}\n` }],
    ['bad v', { ...good(), v: 0 }], ['bad v', { ...good(), v: 1.5 }], ['bad v', { ...good(), v: '1' }],
    ['bad t', { ...good(), t: '2026-11-10' }], ['bad t', { ...good(), t: '2026-11-10T18:40:00-0500' }],
    ['bad build', { ...good(), build: 'has space' }], ['bad build', { ...good(), build: '' }],
    ['bad device', { ...good(), device: 'a.b' }], ['bad type', { ...good(), type: 'chat' }],
    ['no data', (() => { const e = /** @type {any} */ (good()); delete e.data; return e; })()],
    ['unknown field name', { ...good(), name: 'Sam' }],
    ['too large', { ...good(), data: { s: 'x'.repeat(MAX_EVENT_BYTES) } }],
    ['data nested too deep', { ...good(), data: JSON.parse('['.repeat(40) + ']'.repeat(40)) }],
  ];
  for (const [why, e] of bad) assert.equal(validateEvent(e), why, JSON.stringify(e)?.slice(0, 80));
});

test('depth counts containers and stops on cycles', () => {
  assert.equal(depth(1), 0);
  assert.equal(depth({}), 1);
  assert.equal(depth({ a: [1, { b: 2 }] }), 3);
  /** @type {any} */
  const cyc = {}; cyc.self = cyc;
  assert.ok(depth(cyc) > 32);
});

test('encodeUlid matches the proto ULID encoder (independent implementation)', () => {
  forSeeds(3000, (rng) => {
    const t = rng.int(0, 2 ** 31) * 2 ** 16 + rng.int(0, 2 ** 16 - 1);
    const bytes = new Uint8Array(10).map(() => rng.int(0, 255));
    let r = 0n;
    for (const b of bytes) r = (r << 8n) | BigInt(b);
    assert.equal(encodeUlid(BigInt(t), r), protoUlid(t, bytes));
  });
});

test('ULID factory is strictly increasing, even with a stalled or backward clock', () => {
  forSeeds(200, (rng) => {
    const ulid = makeUlidFactory((n) => new Uint8Array(n).map(() => rng.int(0, 255)));
    let t = 1794000000000;
    let last = '';
    for (let i = 0; i < 50; i++) {
      t += rng.pick([0, 0, 1, -5, 1000]);
      const id = ulid(t);
      assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
      assert.ok(id > last, `${id} <= ${last}`);
      last = id;
    }
  });
});

test('localIso keeps the local calendar day and the exact instant', () => {
  forSeeds(5000, (rng) => {
    const ms = 1767225600000 + rng.int(0, 3 * 365 * 86400) * 1000 + rng.int(0, 999);
    const off = rng.pick([300, 240, 0, -60, -330, 480, -840, 720]);
    const s = localIso(ms, off);
    assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    assert.equal(Date.parse(s), ms, 'same instant');
    // Independent: the local wall-clock day is the UTC day of (ms - offset).
    const want = Math.floor((ms - off * 60000) / 86400000);
    assert.equal(tryDayOf(s), want, `${s} lands on the local day`);
    assert.equal(validateEvent({ ...good(), t: s }), null);
  });
  assert.equal(localIso(Date.UTC(2026, 10, 13, 1, 30), 300), '2026-11-12T20:30:00.000-05:00');
});

test('makeEvent refuses an invalid event instead of storing it', () => {
  assert.throws(() => makeEvent({ id: 'x', t: '2026-11-10T00:00:00Z', build: 'b', device: 'd', type: 'attempt', data: {} }), /bad id/);
});

test('saveVersion recognises v1 (proto) and v2, nothing else', () => {
  assert.deepEqual(saveVersion(V1), { v: 1 });
  assert.deepEqual(saveVersion({ format: 'keystone-save', v: 2, events: [] }), { v: 2 });
  for (const d of [null, [], {}, { format: 'keystone-proto-log', v: 2 }, { format: 'other', v: 1 }, { format: 'keystone-save', v: 1.5 }]) {
    assert.ok('error' in saveVersion(d), JSON.stringify(d));
  }
});

test('the v1 fixture migrates to the current version with every event intact', () => {
  assert.equal(SAVE_VERSION, 2);
  const { doc, from, dropped } = migrate(structuredClone(V1));
  assert.equal(from, 1);
  assert.deepEqual(dropped, []);
  assert.equal(doc.format, 'keystone-save');
  assert.equal(doc.v, 2);
  assert.equal(doc.build, 'proto-0.5.0');
  assert.equal(doc.device, V1.device);
  assert.equal(doc.exportedAt, null);
  const byId = (/** @type {any[]} */ a) => [...a].sort((x, y) => (x.id < y.id ? -1 : 1));
  assert.deepEqual(doc.events, byId(V1.events), 'events are carried over unchanged');
  assert.equal(doc.events.length, 13);
  // Migrating a migrated save is the identity.
  const again = migrate(structuredClone(doc));
  assert.equal(again.from, 2);
  assert.deepEqual(again.doc, doc);
});

test('a migrated v1 log replays through the M2 reducer with nothing rejected', () => {
  const { doc } = migrate(structuredClone(V1));
  const state = replay(doc.events);
  assert.equal(state.rejected, 0);
  assert.equal(state.counts.attempt, 8);
  assert.equal(Object.keys(state.applied).length, 13);
});

test('a live proto export (proto/js/events.js) also migrates: the fixture has not drifted from the proto', () => {
  const mem = new Map();
  let t = 1794000000000;
  let k = 0;
  const log = protoMakeLog({ storage: { getItem: (x) => mem.get(x) ?? null, setItem: (x, v) => { mem.set(x, v); } },
    nowMs: () => (t += 1000), randomBytes: (n) => new Uint8Array(n).map(() => (k++ * 13) & 255) });
  log.append('session-start', { runSeed: 's' });
  log.append('report', { gen: 'rat', version: 1, seed: 'p', interaction: 'forge', build: 'proto-0.5.0' });
  log.append('session-end', {});
  const exported = JSON.parse(log.exportJSON());
  assert.deepEqual(Object.keys(exported).sort(), Object.keys(V1).sort());
  const { doc, dropped } = migrate(exported);
  assert.deepEqual(dropped, []);
  assert.equal(doc.events.length, 3);
});

test('migration drops and reports invalid or duplicate events, never silently', () => {
  const d = structuredClone(V1);
  d.events.push({ ...d.events[0] });
  d.events.push({ ...d.events[1], id: 'nope' });
  d.events.push({ ...d.events[2], type: 'chat' });
  const { doc, dropped } = migrate(d);
  assert.equal(doc.events.length, 13);
  assert.deepEqual(dropped.map((x) => x.reason), ['duplicate id', 'bad id', 'bad type']);
  assert.deepEqual(dropped.map((x) => x.index), [13, 14, 15]);
});

test('migration refuses unknown and future versions', () => {
  assert.throws(() => migrate({ format: 'keystone-save', v: SAVE_VERSION + 1, events: [] }), /newer than this build/);
  assert.throws(() => migrate({ hello: 1 }), /unrecognised/);
  assert.throws(() => migrate({ format: 'keystone-proto-log', v: 1 }), /no events array/);
});

test('export -> import round trip, through the store, is lossless and idempotent', async () => {
  const a = memoryStore();
  const r1 = await importSave(a, JSON.stringify(V1));
  assert.deepEqual({ from: r1.from, kept: r1.kept, added: r1.added, dropped: r1.dropped.length }, { from: 1, kept: 13, added: 13, dropped: 0 });
  assert.equal(await a.pendingCount(), 13, 'imported events are queued for sync');
  const text = await exportSave(a, { build: 'abc1234', device: 'dev1', exportedAt: '2026-11-12T20:00:00.000-05:00' });
  const parsed = JSON.parse(text);
  assert.equal(parsed.v, 2);
  assert.ok(!('token' in parsed) && !text.includes('token'), 'an export never carries the sync token');
  const b = memoryStore();
  const r2 = await importSave(b, text);
  assert.equal(r2.from, 2);
  assert.deepEqual(await b.allEvents(), await a.allEvents());
  const r3 = await importSave(b, text);
  assert.equal(r3.added, 0, 're-import adds nothing');
  assert.equal(await b.count(), 13);
  assert.deepEqual(makeSave({ build: 'b', device: 'd', exportedAt: null, events: [] }).events, []);
  await assert.rejects(importSave(b, '{not json'), /not JSON/);
});

test('validateEvent refuses what PHP json_decode would refuse for the whole body, and non-finite numbers', () => {
  /** @type {[string, unknown][]} */
  const bad = [
    ['lone high surrogate', { response: 'ab\ud83d' }],
    ['lone low surrogate', ['\ude00x']],
    ['reversed pair', { s: '\ude00\ud83d' }],
    ['surrogate in a key', { ['k\ud800']: 1 }],
    ['NUL-prefixed key', { '\u0000k': 1 }],
    ['nested NUL key', { a: [{ b: { '\u0000': 0 } }] }],
    ['Infinity', { x: Infinity }],
    ['-Infinity', [-Infinity]],
    ['NaN', NaN],
  ];
  for (const [label, data] of bad) assert.notEqual(validateEvent({ ...good(), data }), null, label);
  /** @type {[string, unknown][]} */
  const ok = [
    ['surrogate pair', { s: '\ud83d\ude00' }],
    ['NUL inside a value', { s: 'a\u0000b' }],
    ['NUL later in a key', { 'k\u0000': 1 }],
    ['empty key', { '': 1 }],
    ['U+2028', { s: '\u2028\u2029' }],
    ['array with NUL string', ['\u0000']],
  ];
  for (const [label, data] of ok) assert.equal(validateEvent({ ...good(), data }), null, label);
});

test('property: validateEvent agrees with an independent PHP-decodability oracle, and the mock accepts what it accepts', async () => {
  const { createApi, memFiles } = await import('../../scripts/serve.js');
  let now = 1794000000000;
  const api = createApi({ files: memFiles(), nowMs: () => now });
  const kid = api.provision('k1', 'kid');
  const units = [0x61, 0x7a, 0x30, 0x00, 0x20, 0xd83d, 0xde00, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0x2028, 0xe9];
  /** @param {import('../prop.js').Rng} rng */
  const str = (rng) => String.fromCharCode(...Array.from({ length: rng.int(0, 4) }, () => rng.pick(units)));
  /** @param {import('../prop.js').Rng} rng @param {number} d @returns {unknown} */
  const value = (rng, d) => {
    const k = rng.int(0, d > 3 ? 3 : 5);
    if (k === 0) return str(rng);
    if (k === 1) return rng.pick([0, -1, 1.5, 1e300, Infinity, -Infinity, NaN]);
    if (k === 2) return rng.pick([true, false, null]);
    if (k === 3) return rng.pick(['plain', 7]);
    if (k === 4) return Array.from({ length: rng.int(0, 3) }, () => value(rng, d + 1));
    return Object.fromEntries(Array.from({ length: rng.int(0, 3) }, () => [str(rng), value(rng, d + 1)]));
  };
  /** Independent oracle: built-in isWellFormed, NUL-first object keys, finite numbers. @param {unknown} x @returns {boolean} */
  const phpSafe = (x) => {
    if (typeof x === 'string') return x.isWellFormed();
    if (typeof x === 'number') return Number.isFinite(x);
    if (Array.isArray(x)) return x.every(phpSafe);
    if (x && typeof x === 'object') return Object.entries(x).every(([k, v]) => k.isWellFormed() && k[0] !== '\u0000' && phpSafe(v));
    return true;
  };
  const counts = { ok: 0, bad: 0 };
  let n = 0;
  forSeeds(3000, (rng) => {
    const data = value(rng, 0);
    const e = { ...good(), id: encodeUlid(1794000000000n + BigInt(n++), 0n), data };
    const accepted = validateEvent(e) === null;
    assert.equal(accepted, phpSafe(data), JSON.stringify(data));
    counts[accepted ? 'ok' : 'bad']++;
    if (accepted) {
      now += 61000; // stay clear of the rate limits
      const r = api.sync({ method: 'POST', body: JSON.stringify({ token: kid, since: 0, events: [e] }), ip: '1.2.3.4' });
      assert.equal(r.status, 200, `the mock refuses a client-accepted event: ${JSON.stringify(data)} -> ${String(r.body).slice(0, 200)}`);
    }
  }, { prefix: 'php-safe-' });
  assert.ok(counts.ok > 300 && counts.bad > 300, JSON.stringify(counts));
});
