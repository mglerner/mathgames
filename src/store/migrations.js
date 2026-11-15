// @ts-check
// Save-document migrations (DESIGN.md section 11; M3 accept: "A v1 save fixture migrates").
//
// Versions:
//   v1  the proto export: { format: 'keystone-proto-log', v: 1, build, device, events }
//       (proto/js/events.js exportJSON). Its events are already section 11 Events.
//   v2  { format: 'keystone-save', v: 2, build, device, exportedAt, events } (save-format.js).
//
// migrate() walks the chain one step at a time. It refuses (throws) on an
// unrecognised document or one newer than this build: guessing at a save is
// how a log gets silently mangled. Events that fail validateEvent() are not
// kept, and every one of them is reported in `dropped` with its index and
// reason, so the caller can show the count rather than hide it.

import { SAVE_VERSION, SAVE_FORMAT, PROTO_FORMAT, validateEvent, makeSave } from './save-format.js';

/** @typedef {import('../../types.d.ts').Event} Event */
/** @typedef {import('./save-format.js').SaveV2} SaveV2 */
/** @typedef {{ index: number; reason: string; id?: string }} Dropped */

/**
 * Version of a save document, or a reason it is not one.
 * @param {unknown} doc
 * @returns {{ v: number } | { error: string }}
 */
export function saveVersion(doc) {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return { error: 'not a save document' };
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (d.format === PROTO_FORMAT && d.v === 1) return { v: 1 };
  if (d.format === SAVE_FORMAT && typeof d.v === 'number' && Number.isInteger(d.v) && d.v >= 2) return { v: d.v };
  return { error: 'unrecognised save format' };
}

/**
 * @param {unknown} events
 * @param {Dropped[]} dropped
 * @returns {Event[]}
 */
function keepValid(events, dropped) {
  if (!Array.isArray(events)) throw new Error('save has no events array');
  /** @type {Event[]} */
  const out = [];
  const seen = new Set();
  events.forEach((e, index) => {
    const why = validateEvent(e);
    const id = typeof e?.id === 'string' ? e.id : undefined;
    if (why) { dropped.push({ index, reason: why, ...(id ? { id } : {}) }); return; }
    if (seen.has(e.id)) { dropped.push({ index, reason: 'duplicate id', id: e.id }); return; }
    seen.add(e.id);
    out.push(/** @type {Event} */ (structuredClone(e)));
  });
  return out;
}

/** @param {unknown} x @param {RegExp} re @param {string} dflt */
function str(x, re, dflt) {
  return typeof x === 'string' && re.test(x) ? x : dflt;
}

/**
 * One step per source version; each returns a document of version + 1.
 * @type {Record<number, (doc: any, dropped: Dropped[]) => any>}
 */
export const STEPS = {
  1: (doc, dropped) => makeSave({
    build: str(doc.build, /^[A-Za-z0-9._-]{1,64}$/, 'unknown'),
    device: str(doc.device, /^[A-Za-z0-9_-]{1,64}$/, 'unknown'),
    exportedAt: null,
    events: keepValid(doc.events, dropped),
  }),
};

/**
 * Migrate any known save document to the current version.
 * @param {unknown} doc parsed JSON
 * @returns {{ doc: SaveV2; from: number; dropped: Dropped[] }}
 */
export function migrate(doc) {
  const sv = saveVersion(doc);
  if ('error' in sv) throw new Error(sv.error);
  if (sv.v > SAVE_VERSION) throw new Error(`save version ${sv.v} is newer than this build (${SAVE_VERSION})`);
  /** @type {Dropped[]} */
  const dropped = [];
  let cur = /** @type {any} */ (doc);
  for (let v = sv.v; v < SAVE_VERSION; v++) {
    const step = STEPS[v];
    if (!step) throw new Error(`no migration from save version ${v}`);
    cur = step(cur, dropped);
  }
  if (sv.v === SAVE_VERSION) {
    // Already current: still re-validate, since the file may be hand-edited.
    cur = makeSave({
      build: str(cur.build, /^[A-Za-z0-9._-]{1,64}$/, 'unknown'),
      device: str(cur.device, /^[A-Za-z0-9_-]{1,64}$/, 'unknown'),
      exportedAt: typeof cur.exportedAt === 'string' ? cur.exportedAt : null,
      events: keepValid(cur.events, dropped),
    });
  }
  return { doc: cur, from: sv.v, dropped };
}

/**
 * Import an exported save (any known version, including the proto log) into
 * the store. Every kept event is queued for sync; ids already present are
 * not duplicated. Throws on an unreadable or unknown document.
 * @param {{ appendLocal(events: readonly Event[]): Promise<number> }} store
 * @param {string} text
 * @returns {Promise<{ from: number; kept: number; added: number; dropped: Dropped[] }>}
 */
export async function importSave(store, text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('not JSON'); }
  const { doc, from, dropped } = migrate(parsed);
  const added = await store.appendLocal(doc.events);
  return { from, kept: doc.events.length, added, dropped };
}
