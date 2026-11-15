// @ts-check
// App entry (DESIGN.md section 11). index.html loads only this module.
//
// boot() (browser only) opens the store, asks for persistent storage, starts
// sync, registers the service worker, builds the `app` object and hands it to
// every mount in mounts.generated.js. With no mounts it shows a stub page:
// build hash, storage status, backup status, pairing pad, JSON export, and a
// link to the proto.
//
// The `app` object every mount(app) receives:
//   app.build          build hash ('dev' when not served from v/<hash>/)
//   app.device         this device's id (meta 'device', random, per store)
//   app.root           the #app element
//   app.storage        { kind: 'indexeddb' | 'memory', note, persisted: boolean | null }
//   app.store          the Store (src/store/idb.js)
//   app.log.append(type, data) -> Promise<Event>   stamps id/v/t/build/device and queues it
//   app.sync.now({ keepalive })                    call after every room with keepalive: true
//   app.run.start() / app.run.end() / app.run.active
//                      a run in progress blocks a service worker swap; run.end()
//                      syncs and then checks for an update
//   app.backup() -> Promise<BackupStatus>          THE "backed up N min ago" text
//   app.needsPairing() -> Promise<boolean>         nothing is being backed up until this device
//                      is paired: no token yet (empty store or not), or the server
//                      refused the token (401: revoked or allowlist lost). Offer pairing.
//   app.pair(code) -> Promise<{ ok, reason?, restored?, syncError? }>  redeem, then restore by sync
//   app.exportJSON() / app.importJSON(text)
//   app.updater                                     see createUpdater
// Logging a 'session-end' event also triggers a sync. visibilitychange ->
// hidden fires a keepalive sync; -> visible checks for a new service worker.
//
// Everything that matters is a plain function over injected dependencies
// (createApp, createUpdater, stubHtml, padReduce) so node tests run it with
// fakes. The module does not boot itself under node (no `document`).
// mounts.generated.js is imported dynamically inside boot(), so importing this
// module in a test never imports a mount.

import { openStore } from '../store/idb.js';
import { createSync, readBackupStatus, redeemCode, tokenState } from '../store/sync.js';
import { makeUlidFactory, localIso, makeEvent, exportSave } from '../store/save-format.js';
import { importSave } from '../store/migrations.js';

/** @typedef {import('../../types.d.ts').Event} Event */
/** @typedef {import('../store/idb.js').Store} Store */
/** @typedef {import('../store/sync.js').FetchLike} FetchLike */

/**
 * The build hash is the v/<hash>/ directory this module was served from.
 * @param {string} url import.meta.url
 */
export function buildFromUrl(url) {
  const m = /\/v\/([0-9a-f]{7,40})\/src\/app\/boot\.js(?:[?#].*)?$/.exec(url);
  return m ? m[1] : 'dev';
}

/** @param {Uint8Array} b */
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/**
 * @param {{
 *   store: Store; fetch: FetchLike; build: string;
 *   nowMs: () => number; tzOffsetMin: () => number; randomBytes: (n: number) => Uint8Array;
 *   setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: any) => void;
 *   persisted?: boolean | null; root?: any; onChange?: () => void;
 * }} env
 */
export async function createApp(env) {
  const { store } = env;
  let device = await store.getMeta('device');
  if (typeof device !== 'string' || !/^[0-9a-f]{16}$/.test(device)) {
    device = hex(env.randomBytes(8));
    await store.setMeta({ device });
  }
  const ulid = makeUlidFactory(env.randomBytes);
  const sync = createSync({ store, fetch: env.fetch, nowMs: env.nowMs, setTimer: env.setTimer,
    clearTimer: env.clearTimer, onChange: env.onChange });
  let active = false;
  /** @type {{ check(): Promise<void> } | null} */
  let updater = null;

  const app = {
    build: env.build,
    device: /** @type {string} */ (device),
    root: env.root ?? null,
    storage: { kind: store.kind, note: store.note, persisted: env.persisted ?? null },
    store,
    sync,
    log: {
      /** @param {Event['type']} type @param {unknown} data @returns {Promise<Event>} */
      async append(type, data) {
        const now = env.nowMs();
        const e = makeEvent({ id: ulid(now), t: localIso(now, env.tzOffsetMin()), build: env.build,
          device: app.device, type, data });
        await store.appendLocal([e]);
        if (type === 'session-end') void sync.now();
        env.onChange?.();
        return e;
      },
    },
    run: {
      get active() { return active; },
      start() { active = true; },
      async end() {
        active = false;
        await sync.now();
        if (updater) await updater.check();
      },
    },
    /** @param {{ check(): Promise<void> }} u */
    setUpdater(u) { updater = u; },
    backup: () => readBackupStatus(store, env.nowMs()),
    async needsPairing() { return (await tokenState(store)) !== 'ok'; },
    /** @param {string} code */
    async pair(code) {
      const r = await redeemCode({ store, fetch: env.fetch, code });
      if (!r.ok) return r;
      const before = await store.count();
      const s = await sync.now();
      const restored = (await store.count()) - before;
      // The token is stored either way; a failed restore is retried by the sync queue.
      return s.ok ? { ok: true, restored } : { ok: true, restored, syncError: s.reason };
    },
    exportJSON: () => exportSave(store, { build: env.build, device: app.device,
      exportedAt: localIso(env.nowMs(), env.tzOffsetMin()) }),
    /** @param {string} text */
    importJSON: (text) => importSave(store, text),
  };
  return app;
}

/**
 * Service worker updates (DESIGN.md section 11, "Service worker and updates").
 * check() runs registration.update(); a waiting worker is activated only when
 * no run is in progress and a worker already controls the page, and the page
 * reloads only after a swap THIS page asked for. A version never changes mid-run.
 * @param {{
 *   sw: any;                 // navigator.serviceWorker, or null when unsupported
 *   isRunActive: () => boolean;
 *   reload: () => void;
 * }} env
 */
export function createUpdater(env) {
  /** @type {any} */
  let reg = null;
  let requested = false;
  let reloaded = false;

  function tryActivate() {
    if (!reg || !reg.waiting || !reg.active || !env.sw?.controller || env.isRunActive()) return false;
    requested = true;
    reg.waiting.postMessage({ type: 'skip-waiting' });
    return true;
  }
  return {
    async register() {
      if (!env.sw) return null;
      env.sw.addEventListener('controllerchange', () => {
        if (requested && !reloaded) { reloaded = true; env.reload(); }
      });
      reg = await env.sw.register('sw.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') tryActivate(); });
      });
      tryActivate();
      return reg;
    },
    async check() {
      if (!reg || env.isRunActive()) return;
      try { await reg.update(); } catch { /* offline: keep the cached version */ }
      tryActivate();
    },
    tryActivate,
  };
}

/** @param {unknown} s */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Pairing pad reducer: digits append (8 max), 'back' deletes.
 * @param {string} code @param {string} key
 */
export function padReduce(code, key) {
  if (/^[0-9]$/.test(key)) return code.length < 8 ? code + key : code;
  if (key === 'back') return code.slice(0, -1);
  return code;
}

/**
 * The stub page (no mounts yet), as an HTML string. Pure.
 * @param {{ build: string; storage: { kind: string; note: string; persisted: boolean | null };
 *           events: number; backup: { text: string; state: string }; code: string; message: string;
 *           showPad: boolean; exported: string | null }} s
 */
export function stubHtml(s) {
  const persist = s.storage.persisted === true ? 'persistent' : s.storage.persisted === false ? 'not persistent (may be evicted)' : 'persistence unknown';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'pair'];
  const label = (/** @type {string} */ k) => (k === 'back' ? 'Del' : k === 'pair' ? 'Pair' : k);
  const shown = (s.code + '--------').slice(0, 8).split('').join(' ');
  const pad = !s.showPad ? '' : `
<section class="pair">
<h2>Pair this device</h2>
<p>Type the 8-digit code from the teacher page.</p>
<div class="code" aria-live="polite">${esc(shown)}</div>
<div class="pad">${keys.map((k) => `<button type="button" data-key="${k}">${label(k)}</button>`).join('')}</div>
</section>`;
  return `<main class="stub">
<h1>Keystone Deep</h1>
<p class="build">build ${esc(s.build)}</p>
<ul class="status">
<li>storage: ${esc(s.storage.note)}; ${esc(persist)}</li>
<li>events on this device: ${esc(s.events)}</li>
<li>${esc(s.backup.text)}</li>
</ul>
<p class="msg" aria-live="polite">${esc(s.message)}</p>${pad}
<p><a href="proto/">Play the proto</a></p>
<p><button type="button" data-key="export">Export log (JSON)</button></p>
${s.exported === null ? '' : `<textarea readonly rows="8">${esc(s.exported)}</textarea>`}
</main>`;
}

/** Browser entry. Never runs under node. */
export async function boot() {
  const doc = document;
  const root = doc.getElementById('app');
  const build = buildFromUrl(import.meta.url);
  /** @type {boolean | null} */
  let persisted = null;
  try {
    persisted = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : null;
  } catch { persisted = null; }
  const store = await openStore();
  /** @type {() => void} */
  let refresh = () => {};
  const app = await createApp({
    store, build, persisted, root,
    fetch: (url, init) => fetch(url, init),
    nowMs: () => Date.now(),
    tzOffsetMin: () => new Date().getTimezoneOffset(),
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h),
    onChange: () => refresh(),
  });
  const updater = createUpdater({
    sw: build !== 'dev' && 'serviceWorker' in navigator ? navigator.serviceWorker : null,
    isRunActive: () => app.run.active,
    reload: () => location.reload(),
  });
  app.setUpdater(updater);
  updater.register().catch(() => {});
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') void app.sync.now({ keepalive: true });
    else { void updater.check(); void app.sync.now(); refresh(); }
  });
  doc.addEventListener('gesturestart', (e) => e.preventDefault());

  const { mounts, mountFiles } = await import('./mounts.generated.js');
  if (mounts.length > 0) {
    mounts.forEach((m, i) => {
      try { m(app); } catch (err) { console.error(`mount ${mountFiles[i]} failed`, err); }
    });
    void app.sync.now();
    return app;
  }

  // Stub page.
  const ui = { code: '', message: '', exported: /** @type {string | null} */ (null), showPad: await app.needsPairing() };
  let rendering = false;
  refresh = async () => {
    if (rendering || !root) return;
    rendering = true;
    try {
      ui.showPad = ui.showPad || (await app.needsPairing());
      root.innerHTML = stubHtml({ build, storage: app.storage, events: await store.count(),
        backup: await app.backup(), ...ui });
    } finally { rendering = false; }
  };
  root?.addEventListener('pointerdown', async (ev) => {
    const t = /** @type {HTMLElement | null} */ (ev.target instanceof Element ? ev.target.closest('[data-key]') : null);
    if (!t) return;
    ev.preventDefault();
    const key = t.dataset.key ?? '';
    if (key === 'export') {
      ui.exported = await app.exportJSON();
      try {
        const a = doc.createElement('a');
        a.href = URL.createObjectURL(new Blob([ui.exported], { type: 'application/json' }));
        a.download = `keystone-${app.device}.json`;
        a.click();
      } catch { /* the text box below is the fallback */ }
    } else if (key === 'pair') {
      ui.message = 'pairing...';
      await refresh();
      const r = await app.pair(ui.code);
      ui.message = !r.ok ? `pairing failed: ${r.reason}`
        : 'syncError' in r ? `paired; restore not finished (${r.syncError}), retrying`
          : `paired; restored ${r.restored} events`;
      if (r.ok) { ui.code = ''; ui.showPad = false; }
    } else {
      ui.code = padReduce(ui.code, key);
    }
    await refresh();
  });
  await refresh();
  void app.sync.now();
  setInterval(() => { void refresh(); }, 30000);
  return app;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot().catch((err) => {
    const root = document.getElementById('app');
    if (root) root.textContent = `Keystone Deep failed to start: ${err instanceof Error ? err.message : String(err)}`;
  });
}
