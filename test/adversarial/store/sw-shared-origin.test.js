// @ts-check
// Adversarial (M3 review): production (scope /) and staging (scope /staging/)
// live on the SAME origin, so they share one CacheStorage. The generated
// sw.js names its cache 'keystone-' + BUILD and, on activate, deletes every
// other 'keystone-*' cache; on a failed install it deletes its own cache name.
// Both rules reach across scopes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { swSource } from '../../../scripts/gen-sw.js';

const ORIGIN = 'https://shadyalexi.com';

/** One shared, same-origin CacheStorage. */
function sharedCaches() {
  /** @type {Map<string, Map<string, string>>} */
  const store = new Map();
  return {
    store,
    caches: {
      open: async (/** @type {string} */ n) => {
        if (!store.has(n)) store.set(n, new Map());
        const m = /** @type {Map<string, string>} */ (store.get(n));
        return {
          put: async (/** @type {any} */ u, /** @type {Response} */ r) => { m.set(String(u), await r.text()); },
          match: async (/** @type {any} */ u) => (m.has(String(u)) ? new Response(m.get(String(u))) : undefined),
        };
      },
      keys: async () => [...store.keys()],
      delete: async (/** @type {string} */ n) => store.delete(n),
    },
  };
}

/**
 * @param {{ caches: any; scope: string; build: string; online: () => boolean; indexOk?: boolean }} o
 */
function worker(o) {
  const swUrl = `${o.scope}sw.js`;
  // cache keys are resolved against the worker URL, as the real Cache API does
  const caches = {
    open: async (/** @type {string} */ n) => {
      const c = await o.caches.open(n);
      return { put: (/** @type {string} */ u, /** @type {Response} */ r) => c.put(new URL(u, swUrl).href, r),
        match: (/** @type {string} */ u) => c.match(new URL(u, swUrl).href) };
    },
    keys: o.caches.keys, delete: o.caches.delete,
  };
  const fetch = async (/** @type {any} */ req) => {
    if (!o.online()) throw new TypeError('offline');
    const url = typeof req === 'string' ? req : req.url;
    if (url.endsWith('/index.html') && o.indexOk === false) return new Response('nope', { status: 404 });
    return new Response(`<script type="module" src="v/${o.build}/src/app/boot.js"></script>`);
  };
  class Req extends Request { constructor(/** @type {string} */ u, /** @type {any} */ i) { super(new URL(u, swUrl), i); } }
  /** @type {Record<string, Function[]>} */
  const h = {};
  const self = {
    location: new URL(swUrl), registration: { scope: o.scope },
    clients: { claim: async () => {} }, skipWaiting: () => {},
    addEventListener: (/** @type {string} */ t, /** @type {Function} */ f) => { (h[t] ??= []).push(f); },
  };
  vm.runInContext(swSource({ build: o.build, precache: ['index.html'] }),
    vm.createContext({ self, caches, fetch, Request: Req, Response, URL, Promise, Set, Error, decodeURIComponent }));
  const life = (/** @type {string} */ t) => { let p; for (const f of h[t] ?? []) f({ waitUntil: (/** @type {any} */ x) => { p = x; } }); return p; };
  return {
    install: () => life('install'),
    activate: () => life('activate'),
    /** navigation to the app root; resolves to the page text or rejects */
    async navigate() {
      let resp = null;
      for (const f of h.fetch ?? []) f({ request: { url: o.scope, method: 'GET', mode: 'navigate' }, respondWith: (/** @type {any} */ x) => { resp = x; } });
      if (!resp) throw new Error('not intercepted');
      return (await /** @type {Promise<Response>} */ (resp)).text();
    },
  };
}

test('control: production alone keeps working offline after install', async () => {
  const { caches } = sharedCaches();
  let online = true;
  const prod = worker({ caches, scope: `${ORIGIN}/`, build: 'aaaaaaa', online: () => online });
  await prod.install(); await prod.activate();
  online = false;
  assert.match(await prod.navigate(), /v\/aaaaaaa\//);
});

test('finding 1: activating a STAGING worker deletes the PRODUCTION cache (same origin), so production breaks offline',
  async () => {
    const { caches, store } = sharedCaches();
    let online = true;
    const prod = worker({ caches, scope: `${ORIGIN}/`, build: 'aaaaaaa', online: () => online });
    await prod.install(); await prod.activate();
    // (fixer: was store.has('keystone-aaaaaaa'), a cache NAME the fix changes; now: whatever production created survives)
    const prodCaches = [...store.keys()];
    // deploy step 4: the next build lands on staging first; the owner opens /staging/
    const stg = worker({ caches, scope: `${ORIGIN}/staging/`, build: 'bbbbbbb', online: () => online });
    await stg.install(); await stg.activate();
    assert.ok(prodCaches.length > 0 && prodCaches.every((n) => store.has(n)), `production cache deleted by staging; caches now ${[...store.keys()]}`);
    online = false;
    assert.match(await prod.navigate(), /v\/aaaaaaa\//, 'production home-screen app must still open offline');
  });

test('finding 1b: a failed STAGING install of the same build hash deletes the PRODUCTION cache of that hash',
  async () => {
    const { caches, store } = sharedCaches();
    const prod = worker({ caches, scope: `${ORIGIN}/`, build: 'ccccccc', online: () => true });
    await prod.install(); await prod.activate();
    const prodCaches = [...store.keys()]; // (fixer: was the literal name 'keystone-ccccccc')
    const stg = worker({ caches, scope: `${ORIGIN}/staging/`, build: 'ccccccc', online: () => true, indexOk: false });
    await assert.rejects(/** @type {Promise<void>} */ (stg.install()));
    assert.ok(prodCaches.length > 0 && prodCaches.every((n) => store.has(n)), 'production cache of ccccccc was deleted by the failed staging install');
  });
