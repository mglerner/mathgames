// @ts-check
// Preload for remote-path.test.js: makes the contract suite's REMOTE code path
// (fetch to KEYSTONE_CONTRACT_URL) talk to the in-process mock and a freshly
// built dist/, mounted at /staging/ on a fake origin, on the real clock. No
// socket is opened and nothing leaves the process.
import { join } from 'node:path';
import { createApi, memFiles, createHandler } from '../../scripts/serve.js';
import { buildDist } from '../../scripts/gen-sw.js';

const out = /** @type {string} */ (process.env.KEYSTONE_FAKE_DIST);
const root = join(import.meta.dirname, '..', '..');
buildDist({ root, out, hash: 'abc1234' });
const api = createApi({ files: memFiles() });
process.env.KEYSTONE_CONTRACT_URL = 'https://staging.invalid/staging/';
process.env.KEYSTONE_CONTRACT_KID_TOKEN = api.provision('contract', 'kid');
process.env.KEYSTONE_CONTRACT_TEACHER_TOKEN = api.provision('contract', 'teacher');
const handler = createHandler({ root: out, prefix: '/staging/', api });
const realFetch = globalThis.fetch;
/** @type {typeof fetch} */
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (u.origin !== 'https://staging.invalid') return realFetch(input, init);
  const body = typeof init.body === 'string' ? init.body : '';
  const r = handler({ method: init.method ?? 'GET', url: u.pathname, body, ip: '203.0.113.7' });
  return new Response(r.status === 301 ? null : r.body, { status: r.status, headers: r.headers });
};
