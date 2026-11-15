// @ts-check
// API contract suite (DESIGN.md section 11, deploy step 6).
//
// Default: runs in-process against the Node mock (scripts/serve.js createApi),
// a fresh mock with a fake clock per test. With KEYSTONE_CONTRACT_URL set
// (e.g. https://shadyalexi.com/staging/) it runs against that server instead,
// using KEYSTONE_CONTRACT_KID_TOKEN and KEYSTONE_CONTRACT_TEACHER_TOKEN for the
// dedicated learner "contract" (scripts/provision.sh contract). Against a real
// server, state is shared, so:
//   - tests that need a fake clock (code expiry) or a chosen client IP
//     (redemption limits, per-IP limit) run on the mock only and are skipped;
//   - "no file created by an unknown token" cannot be seen over HTTP: deploy.sh
//     compares the data directory listing before and after this suite;
//   - the rate-limit test runs LAST, because it leaves this IP limited for up
//     to a minute.
// The remote run leaves events in contract.jsonl and one paired kid token per
// run in tokens.json (learner "contract" only).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createApi, memFiles, cacheControl, MAX_BODY, CODE_TTL } from '../../scripts/serve.js';
import { makeUlidFactory, localIso } from '../../src/store/save-format.js';

const BASE = process.env.KEYSTONE_CONTRACT_URL;
const REMOTE = !!BASE;
if (REMOTE && !(process.env.KEYSTONE_CONTRACT_KID_TOKEN && process.env.KEYSTONE_CONTRACT_TEACHER_TOKEN)) {
  throw new Error('KEYSTONE_CONTRACT_URL is set but KEYSTONE_CONTRACT_KID_TOKEN / KEYSTONE_CONTRACT_TEACHER_TOKEN are not');
}
const mockOnly = REMOTE ? 'needs the mock (fake clock or chosen client IP)' : false;

/** @typedef {{ status: number; headers: Record<string, string>; json: any }} Reply */

/** Remote only: stay under the server's 60-a-minute limits (50 per 61 s). */
const sent = /** @type {number[]} */ ([]);
async function throttle() {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] > 61000) sent.shift();
    if (sent.length < 50) { sent.push(now); return; }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * @param {{ files?: import('../../scripts/serve.js').Files }} [o]
 */
function client(o = {}) {
  let nowMs = 1794000000000;
  const files = o.files ?? memFiles();
  let k = 0;
  const api = createApi({ files, nowMs: () => nowMs, randomBytes: (n) => (REMOTE ? randomBytes(n) : Buffer.from(new Uint8Array(n).map(() => (k++ * 151 + 17) & 255))) });
  const kid = REMOTE ? /** @type {string} */ (process.env.KEYSTONE_CONTRACT_KID_TOKEN) : api.provision('contract', 'kid');
  const teacher = REMOTE ? /** @type {string} */ (process.env.KEYSTONE_CONTRACT_TEACHER_TOKEN) : api.provision('contract', 'teacher');
  const ulid = makeUlidFactory((n) => randomBytes(n));
  return {
    files, kid, teacher,
    /** @param {number} ms */
    advance(ms) { nowMs += ms; },
    /** @param {Record<string, unknown>} [data] */
    event(data = {}) {
      const now = Date.now();
      return { id: ulid(now), v: 1, t: localIso(now, 300), build: 'contract', device: 'contract-dev', type: 'attempt', data };
    },
    /**
     * @param {'sync' | 'pair'} endpoint @param {unknown} body
     * @param {{ method?: string; ip?: string; raw?: boolean; noThrottle?: boolean }} [opt]
     * @returns {Promise<Reply>}
     */
    async call(endpoint, body, opt = {}) {
      const text = opt.raw ? String(body) : JSON.stringify(body);
      const method = opt.method ?? 'POST';
      if (!REMOTE) {
        const r = api[endpoint]({ method, body: method === 'POST' ? text : '', ip: opt.ip ?? '10.0.0.1' });
        let json = null;
        try { json = JSON.parse(String(r.body)); } catch { /* not JSON */ }
        return { status: r.status, headers: Object.fromEntries(Object.entries(r.headers).map(([a, b]) => [a.toLowerCase(), b])), json };
      }
      if (!opt.noThrottle) await throttle();
      const res = await fetch(new URL(`api/${endpoint}.php`, BASE), {
        method, headers: { 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: text } : {}),
      });
      const headers = /** @type {Record<string, string>} */ ({});
      res.headers.forEach((v, key) => { headers[key.toLowerCase()] = v; });
      const t = await res.text();
      let json = null;
      try { json = JSON.parse(t); } catch { /* not JSON */ }
      return { status: res.status, headers, json };
    },
  };
}

/** @param {ReturnType<typeof client>} c @param {string} token */
async function cursorOf(c, token) {
  const r = await c.call('sync', { token, since: 0, events: [] });
  assert.equal(r.status, 200);
  return /** @type {number} */ (r.json.cursor);
}

/** Values PHP json_decode/json_encode could plausibly mangle. */
const TRICKY = { empty: {}, list: [], nested: { a: [1, { b: null }] }, slash: 'a/b', pm: '\u00b1', quote: 'say "hi"',
  zero: 0, neg: -1, frac: 1.5, big: 123456789012, t: true, f: false, nul: null, key0: { 0: 'zero' } };

test('round trip: what one device sends, another receives, exactly once and value-equal', async () => {
  const c = client();
  const start = await cursorOf(c, c.kid);
  const a = [c.event({ n: 1, ...TRICKY }), c.event({ n: 2 })];
  const r1 = await c.call('sync', { token: c.kid, since: start, events: a });
  assert.equal(r1.status, 200);
  assert.equal(r1.json.cursor, start + 2);
  assert.deepEqual(r1.json.events, [], 'the sender is not sent its own events back');
  assert.match(r1.headers['content-type'], /application\/json/);
  const b = [c.event({ n: 3 })];
  const r2 = await c.call('sync', { token: c.kid, since: start, events: b });
  assert.equal(r2.status, 200);
  assert.deepEqual(r2.json.events, a, 'a second device pulls the first device\'s events unchanged');
  assert.equal(r2.json.cursor, start + 3);
  const r3 = await c.call('sync', { token: c.kid, since: r1.json.cursor, events: [] });
  assert.deepEqual(r3.json.events, b);
  const r4 = await c.call('sync', { token: c.kid, since: r2.json.cursor, events: [] });
  assert.deepEqual(r4.json.events, []);
});

test('idempotent re-POST: the same events again append nothing', async () => {
  const c = client();
  const start = await cursorOf(c, c.kid);
  const a = [c.event({ n: 1 }), c.event({ n: 2 })];
  const r1 = await c.call('sync', { token: c.kid, since: start, events: a });
  const r2 = await c.call('sync', { token: c.kid, since: start, events: [...a, a[0]] });
  assert.equal(r2.status, 200);
  assert.equal(r2.json.cursor, r1.json.cursor, 'no new lines');
  const pull = await c.call('sync', { token: c.kid, since: start, events: [] });
  assert.deepEqual(pull.json.events, a, 'each event once');
});

test('a cursor beyond the log restarts from the beginning (set union makes that safe)', { skip: REMOTE && 'would pull the whole remote log' }, async () => {
  const c = client();
  const a = [c.event()];
  await c.call('sync', { token: c.kid, since: 0, events: a });
  const r = await c.call('sync', { token: c.kid, since: 999, events: [] });
  assert.deepEqual(r.json.events, a);
  assert.equal(r.json.cursor, 1);
});

test('401 on an unknown, malformed or missing token', async () => {
  const c = client();
  for (const token of [randomBytes(16).toString('hex'), 'abc', c.kid.toUpperCase(), undefined, 42]) {
    const r = await c.call('sync', { token, since: 0, events: [c.event()] });
    assert.equal(r.status, 401, String(token));
    assert.equal(r.json.error, 'token');
  }
  const p = await c.call('pair', { action: 'mint', token: randomBytes(16).toString('hex') });
  assert.equal(p.status, 401);
});

test('an unknown token creates nothing (no log, no token; only the per-IP counter moves)', { skip: REMOTE && 'checked by deploy.sh via the data directory listing' }, async () => {
  const c = client();
  const tokensBefore = c.files.read('tokens.json');
  const before = c.files.names().filter((n) => n !== 'ratelimit.json');
  for (let i = 0; i < 5; i++) {
    const r = await c.call('sync', { token: randomBytes(16).toString('hex'), since: 0, events: [c.event()] }, { ip: `10.1.0.${i}` });
    assert.equal(r.status, 401);
  }
  assert.deepEqual(c.files.names().filter((n) => n !== 'ratelimit.json'), before);
  assert.equal(c.files.read('tokens.json'), tokensBefore);
  assert.ok(!c.files.names().some((n) => n.endsWith('.jsonl')));
});

test('the teacher token reads but cannot write', async () => {
  const c = client();
  const start = await cursorOf(c, c.kid);
  const kidEvents = [c.event({ who: 'kid' })];
  await c.call('sync', { token: c.kid, since: start, events: kidEvents });
  const w = await c.call('sync', { token: c.teacher, since: start, events: [c.event({ who: 'teacher' })] });
  assert.equal(w.status, 403);
  assert.equal(w.json.error, 'read-only');
  const r = await c.call('sync', { token: c.teacher, since: start, events: [] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.events, kidEvents, 'teacher sees the kid log, and its own write is not in it');
});

test('400 on a bad body or any invalid event, and nothing from that batch is appended', async () => {
  const c = client();
  const start = await cursorOf(c, c.kid);
  const ok = c.event();
  /** @type {unknown[]} */
  const bodies = [
    { token: c.kid, since: -1, events: [] }, { token: c.kid, since: '0', events: [] }, { token: c.kid, since: 0 },
    { token: c.kid, since: 0, events: [ok, { ...c.event(), id: 'bad' }] },
    { token: c.kid, since: 0, events: [ok, { ...c.event(), name: 'Sam' }] },
    { token: c.kid, since: 0, events: [ok, { ...c.event(), type: 'chat' }] },
  ];
  for (const b of bodies) assert.equal((await c.call('sync', b)).status, 400, JSON.stringify(b).slice(0, 120));
  assert.equal((await c.call('sync', '{"token":', { raw: true })).status, 400);
  assert.equal((await c.call('sync', '[1,2]', { raw: true })).status, 400);
  assert.equal(await cursorOf(c, c.kid), start, 'no line was appended');
});

test('405 on GET', async () => {
  const c = client();
  assert.equal((await c.call('sync', null, { method: 'GET' })).status, 405);
  assert.equal((await c.call('pair', null, { method: 'GET' })).status, 405);
});

test('413 on a body over 256 KB; a body of exactly 256 KB is not refused for size', async () => {
  const c = client();
  const head = JSON.stringify({ token: c.kid, since: 0, events: [] });
  const exact = head.slice(0, -1) + ' '.repeat(MAX_BODY - head.length) + '}';
  assert.equal(exact.length, MAX_BODY);
  const over = head.slice(0, -1) + ' '.repeat(MAX_BODY - head.length + 1) + '}';
  assert.equal((await c.call('sync', over, { raw: true })).status, 413);
  assert.notEqual((await c.call('sync', exact, { raw: true })).status, 413);
  assert.equal((await c.call('pair', over, { raw: true })).status, 413);
});

test('pairing: teacher mints, the code works exactly once, and the new token syncs', async () => {
  const c = client();
  const m = await c.call('pair', { action: 'mint', token: c.teacher });
  assert.equal(m.status, 200);
  assert.match(m.json.code, /^[0-9]{8}$/);
  assert.equal(m.json.expiresIn, CODE_TTL);
  const r1 = await c.call('pair', { action: 'redeem', code: m.json.code });
  assert.equal(r1.status, 200);
  assert.match(r1.json.token, /^[0-9a-f]{32}$/);
  const r2 = await c.call('pair', { action: 'redeem', code: m.json.code });
  assert.equal(r2.status, 404, 'single use');
  const start = await cursorOf(c, r1.json.token);
  const s = await c.call('sync', { token: r1.json.token, since: start, events: [c.event({ paired: true })] });
  assert.equal(s.status, 200, 'the redeemed token is a kid token that can write');
  // The paired device can then be listed and revoked by the teacher.
  const list = await c.call('pair', { action: 'list', token: c.teacher });
  assert.equal(list.status, 200);
  const id = list.json.devices.map((/** @type {any} */ d) => d.id).find((/** @type {string} */ x) => x === sha16(r1.json.token));
  assert.ok(id, 'the new device is listed');
  assert.equal((await c.call('pair', { action: 'revoke', token: r1.json.token, id })).status, 403, 'a kid cannot revoke');
  assert.equal((await c.call('pair', { action: 'revoke', token: c.teacher, id })).status, 200);
  assert.equal((await c.call('sync', { token: r1.json.token, since: 0, events: [] })).status, 401, 'revoked');
  assert.equal((await c.call('pair', { action: 'revoke', token: c.teacher, id })).status, 404);
});

/** @param {string} token */
function sha16(token) {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

test('pairing: a kid token cannot mint, list or revoke; bad codes are 404', async () => {
  const c = client();
  for (const action of ['mint', 'list', 'revoke']) {
    assert.equal((await c.call('pair', { action, token: c.kid, id: '0000000000000000' })).status, 403, action);
  }
  // Every redemption try counts against 5 per IP per 15 minutes, so a remote run
  // spends at most 4 (2 here, 2 in the pairing test) and can run once per 15 minutes.
  const codes = REMOTE ? ['1234567', 'abcdefgh'] : ['1234567', '123456789', 12345678, 'abcdefgh', undefined];
  for (const code of codes) {
    assert.equal((await c.call('pair', { action: 'redeem', code })).status, 404, String(code));
  }
  assert.equal((await c.call('pair', { action: 'dance', token: c.teacher })).status, 400);
});

test('pairing: a code expires after 15 minutes (accepted just before)', { skip: mockOnly }, async () => {
  const c = client();
  const m1 = await c.call('pair', { action: 'mint', token: c.teacher });
  const m2 = await c.call('pair', { action: 'mint', token: c.teacher });
  c.advance((CODE_TTL - 1) * 1000);
  assert.equal((await c.call('pair', { action: 'redeem', code: m1.json.code })).status, 200);
  c.advance(1000);
  assert.equal((await c.call('pair', { action: 'redeem', code: m2.json.code })).status, 404, 'expired at exactly 15 minutes');
  const tokens = JSON.parse(String(c.files.read('tokens.json')));
  assert.equal(Object.values(tokens).filter((v) => v.role === 'kid').length, 2, 'the expired code allowlisted nothing');
});

test('pairing: redemption is limited to 5 tries per IP and 20 globally per 15 minutes', { skip: mockOnly }, async () => {
  const c = client();
  const m = await c.call('pair', { action: 'mint', token: c.teacher });
  for (let i = 0; i < 5; i++) assert.equal((await c.call('pair', { action: 'redeem', code: '00000000' }, { ip: 'a' })).status, 404);
  assert.equal((await c.call('pair', { action: 'redeem', code: m.json.code }, { ip: 'a' })).status, 429, '6th try from one IP, even with the right code');
  for (let i = 0; i < 15; i++) {
    assert.equal((await c.call('pair', { action: 'redeem', code: '00000000' }, { ip: `b${Math.floor(i / 5)}` })).status, 404);
  }
  assert.equal((await c.call('pair', { action: 'redeem', code: m.json.code }, { ip: 'fresh' })).status, 429, '21st try globally');
  c.advance(CODE_TTL * 1000);
  const m2 = await c.call('pair', { action: 'mint', token: c.teacher });
  assert.equal((await c.call('pair', { action: 'redeem', code: m2.json.code }, { ip: 'a' })).status, 200, 'the window resets');
});

test('per-IP limit: 60 a minute across tokens, then 429; the next minute is fresh', { skip: mockOnly }, async () => {
  const c = client();
  for (let i = 0; i < 60; i++) {
    assert.equal((await c.call('sync', { token: randomBytes(16).toString('hex'), since: 0, events: [] }, { ip: 'x' })).status, 401);
  }
  assert.equal((await c.call('sync', { token: c.kid, since: 0, events: [] }, { ip: 'x' })).status, 429);
  assert.equal((await c.call('sync', { token: c.kid, since: 0, events: [] }, { ip: 'y' })).status, 200);
  c.advance(60000);
  assert.equal((await c.call('sync', { token: c.kid, since: 0, events: [] }, { ip: 'x' })).status, 200);
});

test('PHP json_decode/json_encode edges: float-written ints, bad surrogates, NUL keys, INF', async () => {
  const c = client();
  const start = await cursorOf(c, c.kid);
  const ev = () => JSON.stringify(c.event());
  /** @param {string} raw @param {number} status @param {string} error */
  const expect = async (raw, status, error) => {
    const r = await c.call('sync', raw, { raw: true });
    assert.equal(r.status, status, raw.slice(0, 200));
    assert.equal(r.json?.error, error, raw.slice(0, 200));
  };
  // json_decode makes 5.0 and 1e2 floats, so is_int() fails.
  await expect(`{"token":"${c.kid}","since":${start}.0,"events":[]}`, 400, 'bad-body');
  await expect(`{"token":"${c.kid}","since":1e2,"events":[]}`, 400, 'bad-body');
  await expect(`{"token":"${c.kid}","since":${start},"events":[${ev().replace('"v":1', '"v":1.0')}]}`, 400, 'bad-event');
  // An unpaired surrogate anywhere, or a NUL-prefixed object key, fails the whole body.
  await expect(`{"token":"${c.kid}","since":${start},"events":[${ev().replace('"data":{}', '"data":{"s":"ab\\ud83d"}')}]}`, 400, 'bad-json');
  await expect(`{"token":"${c.kid}","since":${start},"x":"\\udc00","events":[]}`, 400, 'bad-json');
  await expect(`{"token":"${c.kid}","since":${start},"events":[${ev().replace('"data":{}', '"data":{"\\u0000k":1}')}]}`, 400, 'bad-json');
  // 1e400 decodes to INF, which json_encode cannot write: refused, never stored as an empty line.
  await expect(`{"token":"${c.kid}","since":${start},"events":[${ev().replace('"data":{}', '"data":{"x":1e400}')}]}`, 400, 'bad-event');
  // Well-formed edges are fine: a surrogate PAIR written as escapes, NUL inside a key or value, U+2028.
  const ok = c.event({ emoji: '\ud83d\ude00', 'k\u0000': 'a\u0000b', ls: 'a\u2028b\u2029c' });
  const r = await c.call('sync', { token: c.kid, since: start, events: [ok] });
  assert.equal(r.status, 200);
  const pull = await c.call('sync', { token: c.kid, since: start, events: [] });
  assert.deepEqual(pull.json.events, [ok], 'nothing refused above was stored; the edge event round-trips value-equal');
  if (!REMOTE) assert.match(String(c.files.read('contract.jsonl')), /a\\u2028b\\u2029c/, 'stored as PHP json_encode writes it');
});

test('since above 2^53 is an int to PHP: accepted, and (beyond the log) restarts from 0', { skip: REMOTE && 'would pull the whole remote log' }, async () => {
  const c = client();
  const a = [c.event()];
  await c.call('sync', { token: c.kid, since: 0, events: a });
  const r = await c.call('sync', `{"token":"${c.kid}","since":9007199254740993,"events":[]}`, { raw: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.events, a);
  const big = await c.call('sync', `{"token":"${c.kid}","since":9223372036854775808,"events":[]}`, { raw: true });
  assert.equal(big.status, 400, 'past 2^63-1 json_decode gives a float');
});

test('concurrent POSTs lose no lines and duplicate none', async () => {
  const c = client();
  const start = await cursorOf(c, c.kid);
  const batches = Array.from({ length: 12 }, (_, i) => Array.from({ length: 4 }, (_, j) => c.event({ i, j })));
  const replies = await Promise.all(batches.map((events) => c.call('sync', { token: c.kid, since: start, events })));
  for (const r of replies) assert.equal(r.status, 200);
  const pull = await c.call('sync', { token: c.teacher, since: start, events: [] });
  const ids = pull.json.events.map((/** @type {any} */ e) => e.id).sort();
  assert.deepEqual(ids, batches.flat().map((e) => e.id).sort());
  assert.equal(pull.json.cursor, start + 48);
});

test('sw.js and the entry pages are served with no-cache; v/<hash>/ is immutable', async () => {
  if (!REMOTE) {
    for (const f of ['sw.js', 'index.html', 'teacher.html', 'manifest.webmanifest']) assert.equal(cacheControl(f), 'no-cache', f);
    assert.match(cacheControl('v/abc1234/src/app/boot.js'), /immutable/);
    assert.equal(cacheControl('api/sync.php'), 'no-store');
    return;
  }
  const res = await fetch(new URL('sw.js', BASE), { cache: 'no-store' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control') ?? '', /no-cache/);
  const idx = await fetch(new URL('index.html', BASE), { cache: 'no-store' });
  assert.match(idx.headers.get('cache-control') ?? '', /no-cache/);
  const m = /v\/([0-9a-f]{7,40})\/src\/app\/boot\.js/.exec(await idx.text());
  assert.ok(m, 'index.html loads a versioned boot.js');
  const boot = await fetch(new URL(`v/${m[1]}/src/app/boot.js`, BASE), { cache: 'no-store' });
  assert.equal(boot.status, 200);
  assert.match(boot.headers.get('cache-control') ?? '', /immutable/);
  assert.equal((await fetch(new URL('api/lib.php', BASE))).status >= 400, true, 'lib.php is not an endpoint');
});

// LAST: leaves this client IP rate-limited for up to a minute on a real server.
test('per-token limit: over 60 requests a minute gets 429', async () => {
  const c = client();
  const statuses = [];
  // 125 sequential requests: however a minute boundary splits them, one
  // window holds at least 63 (as long as they finish within two minutes).
  const n = REMOTE ? 125 : 61;
  for (let i = 0; i < n; i++) {
    statuses.push((await c.call('sync', { token: c.kid, since: 0, events: [] },
      { ip: `10.9.${Math.floor(i / 50)}.${i % 50}`, noThrottle: true })).status);
  }
  assert.ok(statuses.includes(429), 'some request was limited');
  if (!REMOTE) {
    assert.deepEqual(statuses.slice(0, 60), Array(60).fill(200));
    assert.equal(statuses[60], 429);
  }
});
