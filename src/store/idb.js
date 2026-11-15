// @ts-check
// Local store (DESIGN.md section 11): IndexedDB as the primary store, with an
// in-memory fallback of the same interface. The fallback is what node tests
// use, and what the app runs on when IndexedDB is missing or will not open
// (then `kind` is 'memory' and the stub/Camp shows that nothing persists).
//
// Three object stores:
//   events  keyPath 'id'  every Event this device knows (its own + restored)
//   outbox  keyPath 'id'  ids of local events the server has not acknowledged
//   meta    out-of-line   small records: device, token, cursor, lastOkMs, ...
// The outbox IS the sync retry queue: an id leaves it only when a sync
// response acknowledges it (sync.js). Each multi-store write is one
// transaction, so a crash cannot store an event without queueing it, or move
// the cursor without storing the events it covers.
//
// Values are structured-cloned on the way in and out in both implementations,
// so a caller can never mutate stored state by reference.

/** @typedef {import('../../types.d.ts').Event} Event */

/**
 * @typedef {{
 *   kind: 'indexeddb' | 'memory';
 *   note: string;
 *   getMeta(key: string): Promise<any>;
 *   setMeta(patch: Record<string, unknown>): Promise<void>;
 *   appendLocal(events: readonly Event[]): Promise<number>;
 *   mergeRemote(events: readonly Event[], metaPatch: Record<string, unknown>): Promise<number>;
 *   outbox(): Promise<Event[]>;
 *   ack(ids: readonly string[], metaPatch: Record<string, unknown>): Promise<void>;
 *   pendingCount(): Promise<number>;
 *   allEvents(): Promise<Event[]>;
 *   count(): Promise<number>;
 *   clearAll(): Promise<void>;
 * }} Store
 *
 * appendLocal: store events this device created (or imported) and queue them;
 *   returns how many ids were new to the store. An id already stored is still
 *   (re)queued, which is harmless: the server deduplicates by id.
 * mergeRemote: store events that came from the server (not queued) and apply
 *   metaPatch in the same transaction; returns how many ids were new.
 * ack: drop ids from the outbox and apply metaPatch in one transaction.
 * A metaPatch value of undefined deletes that key.
 */

export const DB_NAME = 'keystone-deep';
export const DB_VERSION = 1;

/** @param {string} a @param {string} b */
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {string} [note]
 * @returns {Store}
 */
export function memoryStore(note = 'in-memory: nothing is saved when the page closes') {
  /** @type {Map<string, Event>} */
  const events = new Map();
  /** @type {Set<string>} */
  const outbox = new Set();
  /** @type {Map<string, unknown>} */
  const meta = new Map();
  /** @param {Record<string, unknown>} patch */
  const patchMeta = (patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) meta.delete(k); else meta.set(k, structuredClone(v));
    }
  };
  /** @param {readonly Event[]} evs @param {boolean} queue */
  const put = (evs, queue) => {
    const copies = evs.map((e) => structuredClone(e));
    let added = 0;
    for (const e of copies) {
      if (!events.has(e.id)) added++;
      events.set(e.id, e);
      if (queue) outbox.add(e.id);
    }
    return added;
  };
  return {
    kind: 'memory',
    note,
    async getMeta(key) { return structuredClone(meta.get(key)); },
    async setMeta(patch) { patchMeta(patch); },
    async appendLocal(evs) { return put(evs, true); },
    async mergeRemote(evs, patch) { const n = put(evs, false); patchMeta(patch); return n; },
    async outbox() {
      return [...outbox].sort(byStr).flatMap((id) => (events.has(id) ? [structuredClone(/** @type {Event} */ (events.get(id)))] : []));
    },
    async ack(ids, patch) { for (const id of ids) outbox.delete(id); patchMeta(patch); },
    async pendingCount() { return outbox.size; },
    async allEvents() { return [...events.keys()].sort(byStr).map((id) => structuredClone(/** @type {Event} */ (events.get(id)))); },
    async count() { return events.size; },
    async clearAll() { events.clear(); outbox.clear(); meta.clear(); },
  };
}

/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {IDBTransaction} tx @returns {Promise<void>} */
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

/**
 * @param {IDBDatabase} db
 * @returns {Store}
 */
function wrapIdb(db) {
  /**
   * Run fn inside one transaction and resolve with its value once committed.
   * @template T
   * @param {string[]} names @param {IDBTransactionMode} mode
   * @param {(tx: IDBTransaction) => Promise<T>} fn
   */
  async function inTx(names, mode, fn) {
    const tx = db.transaction(names, mode);
    const done = txDone(tx);
    let value;
    try {
      value = await fn(tx);
    } catch (err) {
      try { tx.abort(); } catch { /* already finished */ }
      await done.catch(() => {});
      throw err;
    }
    await done;
    return value;
  }
  /** @param {IDBObjectStore} m @param {Record<string, unknown>} patch */
  function patchMeta(m, patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) m.delete(k); else m.put(v, k);
    }
  }
  /**
   * Requests are issued synchronously (no await between them) so the
   * transaction cannot auto-commit halfway.
   * @param {IDBTransaction} tx @param {readonly Event[]} evs @param {boolean} queue
   */
  async function put(tx, evs, queue) {
    const es = tx.objectStore('events');
    const keys = new Set(/** @type {string[]} */ (await reqP(es.getAllKeys())));
    let added = 0;
    const ob = queue ? tx.objectStore('outbox') : null;
    for (const e of evs) {
      if (!keys.has(e.id)) { added++; keys.add(e.id); }
      es.put(e);
      if (ob) ob.put({ id: e.id });
    }
    return added;
  }
  return {
    kind: 'indexeddb',
    note: 'IndexedDB',
    getMeta: (key) => inTx(['meta'], 'readonly', (tx) => reqP(tx.objectStore('meta').get(key))),
    setMeta: (patch) => inTx(['meta'], 'readwrite', async (tx) => { patchMeta(tx.objectStore('meta'), patch); }),
    appendLocal: (evs) => inTx(['events', 'outbox'], 'readwrite', (tx) => put(tx, evs, true)),
    mergeRemote: (evs, patch) => inTx(['events', 'meta'], 'readwrite', async (tx) => {
      const n = await put(tx, evs, false);
      patchMeta(tx.objectStore('meta'), patch);
      return n;
    }),
    outbox: () => inTx(['events', 'outbox'], 'readonly', async (tx) => {
      const ids = /** @type {string[]} */ (await reqP(tx.objectStore('outbox').getAllKeys())).sort(byStr);
      const es = tx.objectStore('events');
      const got = await Promise.all(ids.map((id) => reqP(es.get(id))));
      return /** @type {Event[]} */ (got.filter((e) => e !== undefined));
    }),
    ack: (ids, patch) => inTx(['outbox', 'meta'], 'readwrite', async (tx) => {
      const ob = tx.objectStore('outbox');
      for (const id of ids) ob.delete(id);
      patchMeta(tx.objectStore('meta'), patch);
    }),
    pendingCount: () => inTx(['outbox'], 'readonly', (tx) => reqP(tx.objectStore('outbox').count())),
    allEvents: () => inTx(['events'], 'readonly', async (tx) => {
      const all = /** @type {Event[]} */ (await reqP(tx.objectStore('events').getAll()));
      return all.sort((a, b) => byStr(a.id, b.id));
    }),
    count: () => inTx(['events'], 'readonly', (tx) => reqP(tx.objectStore('events').count())),
    clearAll: () => inTx(['events', 'outbox', 'meta'], 'readwrite', async (tx) => {
      tx.objectStore('events').clear();
      tx.objectStore('outbox').clear();
      tx.objectStore('meta').clear();
    }),
  };
}

/**
 * Open the IndexedDB store, falling back to memory (never throwing).
 * @param {{ indexedDB?: IDBFactory | null; name?: string; timeoutMs?: number;
 *           setTimeout?: (fn: () => void, ms: number) => unknown; clearTimeout?: (h: any) => void }} [opts]
 * @returns {Promise<Store>}
 */
export async function openStore(opts = {}) {
  const factory = opts.indexedDB === undefined ? globalThis.indexedDB : opts.indexedDB;
  if (!factory) return memoryStore('in-memory: IndexedDB is not available here');
  const timer = opts.setTimeout ?? globalThis.setTimeout;
  const untimer = opts.clearTimeout ?? globalThis.clearTimeout;
  /** @type {any} */
  let handle;
  try {
    const db = await new Promise((resolve, reject) => {
      const req = factory.open(opts.name ?? DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('events')) d.createObjectStore('events', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('open failed'));
      req.onblocked = () => reject(new Error('open blocked by another tab'));
      handle = timer(() => reject(new Error('open timed out')), opts.timeoutMs ?? 5000);
    });
    untimer(handle);
    return wrapIdb(/** @type {IDBDatabase} */ (db));
  } catch (err) {
    untimer(handle);
    const msg = err instanceof Error ? err.message : String(err);
    return memoryStore(`in-memory: IndexedDB failed (${msg})`);
  }
}
