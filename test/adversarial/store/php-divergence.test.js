// @ts-check
// Adversarial (M3 review): events the client accepts (validateEvent) and the
// Node mock stores, but that PHP 8.3's json_decode($body, false, 64) in
// api/lib.php ke_begin() refuses for the WHOLE body (-> 400 bad-json):
//   - a lone UTF-16 surrogate: JSON.stringify writes "\ud800"; PHP fails with
//     JSON_ERROR_UTF16 ("Single unpaired UTF-16 surrogate").
//   - an object key starting with NUL ("\u0000x"): decoding into stdClass fails
//     with JSON_ERROR_INVALID_PROPERTY_NAME.
// sync.js treats 400 as 'rejected' and sends the oldest outbox events first,
// so one such event blocks every later event from ever being backed up.
// phpRejects() below encodes just those two documented PHP rules (no PHP here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, memFiles } from '../../../scripts/serve.js';
import { validateEvent } from '../../../src/store/save-format.js';
import { memoryStore } from '../../../src/store/idb.js';
import { createSync } from '../../../src/store/sync.js';

/** PHP json_decode($s, false) failure modes the mock does not mirror. @param {string} s */
function phpRejects(s) {
  // unpaired \uD800-\uDBFF escape, or \uDC00-\uDFFF not preceded by a high escape
  if (/\\u[dD][89abAB][0-9a-fA-F]{2}(?!\\u[dD][c-fC-F][0-9a-fA-F]{2})/.test(s)) return 'JSON_ERROR_UTF16';
  if (/(?<!\\u[dD][89abAB][0-9a-fA-F]{2})\\u[dD][c-fC-F][0-9a-fA-F]{2}/.test(s)) return 'JSON_ERROR_UTF16';
  let bad = false;
  JSON.parse(s, function (k) { if (k.startsWith('\0')) bad = true; return arguments[1]; });
  return bad ? 'JSON_ERROR_INVALID_PROPERTY_NAME' : null;
}

let n = 0;
const ev = (/** @type {unknown} */ data) => ({ id: `01JD0000000000000000000${String(n++).padStart(3, '0')}`.slice(0, 26),
  v: 1, t: '2026-11-12T21:30:00.000-05:00', build: 'abc1234', device: 'dev1', type: 'attempt', data });

for (const [label, data] of /** @type {[string, unknown][]} */ ([
  ['lone surrogate', { response: '\ud83d' }],
  ['NUL-prefixed key', { '\u0000k': 1 }],
])) {
  test(`finding 2 (${label}): client accepts and mock stores an event PHP would 400`, () => {
    const e = ev(data);
    // (fixer: the original precondition `validateEvent(e) === null` asserted the defect itself;
    // after the fix the client refuses it, and the mock now 400s it as PHP does.)
    const api = createApi({ files: memFiles() });
    const kid = api.provision('k1', 'kid');
    const body = JSON.stringify({ token: kid, since: 0, events: [e] });
    const r = api.sync({ method: 'POST', body, ip: '1.2.3.4' });
    const php = phpRejects(body);
    // Either the client must refuse it, or mock and PHP must agree. Today: client ok, mock 200, PHP 400.
    assert.ok(validateEvent(e) !== null || (php === null) === (r.status === 200),
      `client accepts, mock says ${r.status}, PHP json_decode fails with ${php}`);
    assert.notEqual(validateEvent(e), null, 'client refuses it');
    assert.equal((php === null), (r.status === 200), `mock says ${r.status}, PHP json_decode fails with ${php}`);
  });
}

test('finding 2: one such event in the outbox stops every later event from ever being backed up',
  async () => {
    const api = createApi({ files: memFiles() });
    const kid = api.provision('k1', 'kid');
    const store = memoryStore();
    await store.setMeta({ token: kid, cursor: 0 });
    // a "PHP" server: the mock, plus the json_decode rules it does not mirror
    const fetch = async (/** @type {string} */ _u, /** @type {any} */ init) => {
      const bad = phpRejects(init.body);
      const r = bad ? { status: 400, body: '{"error":"bad-json"}' } : api.sync({ method: 'POST', body: init.body, ip: '1.2.3.4' });
      return { status: r.status, json: async () => JSON.parse(String(r.body)) };
    };
    const sync = createSync({ store, fetch, nowMs: () => 0 });
    await store.appendLocal([ev({ response: 'ab\ud83d' })]); // e.g. a string cut mid-emoji
    const later = [ev({ ok: 1 }), ev({ ok: 2 }), ev({ ok: 3 })];
    await store.appendLocal(later);
    for (let i = 0; i < 5; i++) await sync.now();
    const onServer = api.sync({ method: 'POST', body: JSON.stringify({ token: kid, since: 0, events: [] }), ip: '9.9.9.9' });
    const got = JSON.parse(String(onServer.body)).events.map((/** @type {any} */ x) => x.id);
    assert.deepEqual(got, later.map((e) => e.id), `server has ${got.length} of the 3 later valid events; outbox ${await store.pendingCount()}`);
  });

test('finding 3: a non-finite number (1e400) in data is accepted; the mock silently stores it as null',
  () => {
    const api = createApi({ files: memFiles() });
    const kid = api.provision('k1', 'kid');
    const e = JSON.stringify(ev(0)).replace('"data":0', '"data":1e400');
    const body = `{"token":"${kid}","since":0,"events":[${e}]}`;
    const r = api.sync({ method: 'POST', body, ip: '1.2.3.4' });
    const back = api.sync({ method: 'POST', body: JSON.stringify({ token: kid, since: 0, events: [] }), ip: '1.2.3.4' });
    // PHP: json_decode gives INF, json_encode(INF) is false, so ke_valid_event's
    // strlen((string) false) = 0 passes and sync.php appends an EMPTY line (event lost,
    // re-appended as another empty line on every re-POST). The mock instead stores "data":null.
    assert.equal(r.status, 400, `accepted (${r.status}); stored as ${String(back.body)}`);
  });
