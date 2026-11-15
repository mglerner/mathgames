// @ts-check
// A small in-process stand-in for IndexedDB, enough to exercise src/store/idb.js
// under node: open/upgrade, transactions over named stores, put/get/getAll/
// getAllKeys/delete/count/clear, async request events, auto-commit when a
// transaction has no pending requests, abort rolling back.
// It models the spec as this file's author understands it; it is NOT a real
// IndexedDB, so passing here does not prove Safari behaves the same.

/** @param {any} v */
const clone = (v) => structuredClone(v);
/** @param {any} a @param {any} b */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

class Req {
  constructor() {
    /** @type {any} */ this.result = undefined;
    /** @type {any} */ this.error = null;
    /** @type {null | (() => void)} */ this.onsuccess = null;
    /** @type {null | (() => void)} */ this.onerror = null;
    /** @type {null | (() => void)} */ this.onupgradeneeded = null;
    /** @type {null | (() => void)} */ this.onblocked = null;
  }
}

/**
 * @param {{ failOpen?: boolean }} [opts]
 */
export function fakeIndexedDB(opts = {}) {
  /** @type {Map<string, { version: number; stores: Map<string, { keyPath: string | null; data: Map<any, any> }> }>} */
  const dbs = new Map();
  return {
    /** @param {string} name @param {number} version */
    open(name, version) {
      const req = new Req();
      setImmediate(() => {
        if (opts.failOpen) { req.error = new Error('fake open failure'); req.onerror?.(); return; }
        let rec = dbs.get(name);
        const upgrade = !rec || rec.version < version;
        if (!rec) { rec = { version: 0, stores: new Map() }; dbs.set(name, rec); }
        const r = rec;
        const db = makeDb(r);
        req.result = db;
        if (upgrade) { r.version = version; req.onupgradeneeded?.(); }
        req.onsuccess?.();
      });
      return req;
    },
    _dbs: dbs,
  };
}

/** @param {{ stores: Map<string, { keyPath: string | null; data: Map<any, any> }> }} rec */
function makeDb(rec) {
  return {
    objectStoreNames: { contains: (/** @type {string} */ n) => rec.stores.has(n) },
    /** @param {string} n @param {{ keyPath?: string }} [o] */
    createObjectStore(n, o = {}) { rec.stores.set(n, { keyPath: o.keyPath ?? null, data: new Map() }); },
    /** @param {string[]} names @param {string} mode */
    transaction(names, mode) {
      for (const n of names) if (!rec.stores.has(n)) throw new Error(`NotFoundError: ${n}`);
      // Copy-on-write: work on snapshots, publish on commit, discard on abort.
      const work = new Map(names.map((n) => [n, new Map(/** @type {any} */ (rec.stores.get(n)).data)]));
      let pending = 0;
      let finished = false;
      const tx = {
        /** @type {any} */ error: null,
        /** @type {null | (() => void)} */ oncomplete: null,
        /** @type {null | (() => void)} */ onerror: null,
        /** @type {null | (() => void)} */ onabort: null,
        abort() {
          if (finished) throw new Error('InvalidStateError');
          finished = true;
          tx.error = new Error('AbortError');
          setImmediate(() => tx.onabort?.());
        },
        /** @param {string} n */
        objectStore(n) {
          if (!work.has(n)) throw new Error(`NotFoundError: ${n} not in transaction`);
          const data = /** @type {Map<any, any>} */ (work.get(n));
          const keyPath = /** @type {any} */ (rec.stores.get(n)).keyPath;
          /** @param {() => any} fn @param {boolean} [write] */
          const op = (fn, write = false) => {
            if (finished) throw new Error('TransactionInactiveError');
            if (write && mode !== 'readwrite') throw new Error('ReadOnlyError');
            const req = new Req();
            pending++;
            let value;
            try { value = fn(); } catch (err) { value = err; }
            setImmediate(() => {
              pending--;
              if (!finished) {
                req.result = value;
                req.onsuccess?.();
              }
              setImmediate(() => {
                if (pending === 0 && !finished) {
                  finished = true;
                  if (mode === 'readwrite') for (const [k, v] of work) /** @type {any} */ (rec.stores.get(k)).data = v;
                  tx.oncomplete?.();
                }
              });
            });
            return req;
          };
          return {
            /** @param {any} v @param {any} [key] */
            put: (v, key) => op(() => { const k = keyPath ? v[keyPath] : key; data.set(k, clone(v)); return k; }, true),
            /** @param {any} k */
            get: (k) => op(() => clone(data.get(k))),
            getAll: () => op(() => [...data.keys()].sort(cmp).map((k) => clone(data.get(k)))),
            getAllKeys: () => op(() => [...data.keys()].sort(cmp)),
            /** @param {any} k */
            delete: (k) => op(() => { data.delete(k); }, true),
            count: () => op(() => data.size),
            clear: () => op(() => { data.clear(); }, true),
          };
        },
      };
      // A transaction with no requests at all still completes.
      setImmediate(() => {
        if (pending === 0 && !finished) { finished = true; tx.oncomplete?.(); }
      });
      return tx;
    },
  };
}
