// @ts-check
// Adversarial (M3 review): a kid device whose token is revoked from the teacher
// view (pair.php revoke) gets 401 on every sync. sync.js records
// lastError 'token-rejected', but app.needsPairing() stays false (the store has
// events) and app.backup() keeps reporting a normal "backed up N ago" status,
// so with mounts present nothing ever tells anyone to re-pair, and every new
// event silently stays on the device only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, memFiles } from '../../../scripts/serve.js';
import { memoryStore } from '../../../src/store/idb.js';
import { createApp } from '../../../src/app/boot.js';

test('finding 5: after revocation the app neither asks to re-pair nor says backups stopped', async () => {
  let now = 1794000000000;
  const api = createApi({ files: memFiles(), nowMs: () => now });
  const teacher = api.provision('k1', 'teacher');
  const fetch = async (/** @type {string} */ url, /** @type {any} */ init) => {
    const r = (url.endsWith('pair.php') ? api.pair : api.sync)({ method: 'POST', body: init.body, ip: '1.2.3.4' });
    return { status: r.status, json: async () => JSON.parse(String(r.body)) };
  };
  const code = JSON.parse(String(api.pair({ method: 'POST', body: JSON.stringify({ action: 'mint', token: teacher }), ip: 'p' }).body)).code;
  let b = 0;
  const app = await createApp({ store: memoryStore(), fetch, build: 'abc1234', nowMs: () => now, tzOffsetMin: () => 300,
    randomBytes: (n) => new Uint8Array(n).map(() => (b++ * 37) & 255) });
  assert.equal((await app.pair(code)).ok, true);
  await app.log.append('attempt', { a: 1 });
  assert.equal((await app.sync.now()).ok, true);

  // the teacher revokes this device
  const list = JSON.parse(String(api.pair({ method: 'POST', body: JSON.stringify({ action: 'list', token: teacher }), ip: 'p' }).body));
  const kid = list.devices.find((/** @type {any} */ d) => d.role === 'kid');
  api.pair({ method: 'POST', body: JSON.stringify({ action: 'revoke', token: teacher, id: kid.id }), ip: 'p' });

  now += 3 * 86400000;
  await app.log.append('attempt', { a: 2 });
  const r = await app.sync.now();
  assert.equal(r.ok, false);
  const status = await app.backup();
  const needs = await app.needsPairing();
  assert.ok(needs || /pair|reject|revok/i.test(status.text),
    `sync says ${r.ok ? 'ok' : r.reason}, needsPairing() = ${needs}, backup text = "${status.text}"`);
});
