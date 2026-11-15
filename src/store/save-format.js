// @ts-check
// Save format and event envelope (DESIGN.md section 11, "Persistence and sync").
//
// Two version numbers live here and must not be confused:
//   EVENT_VERSION  the Event envelope schema (Event.v). 1 since the proto.
//   SAVE_VERSION   the whole-save document written by exportSave() and read by
//                  migrations.js. v1 = the proto's export
//                  ({format:'keystone-proto-log', v:1, ...}); v2 = this app's
//                  {format:'keystone-save', v:2, ...}.
//
// validateEvent() is the single client-side gate for an event entering the
// local store or the outbox. api/lib.php ke_valid_event() mirrors it rule for
// rule (with a larger size cap: the client caps an encoded event at
// MAX_EVENT_BYTES = 8192 bytes, the server at 16384, so encoder differences
// between JSON.stringify and PHP json_encode can never make a client-accepted
// event fail on the server). It also refuses what PHP's json_decode refuses for
// the whole request body (an unpaired surrogate, an object key starting with
// NUL) and non-finite numbers: see phpUnsafe(). Keep the two in step.
//
// Event.t is written with the device's LOCAL offset ("...T21:30:00.000-05:00"),
// because learner/scheduler.js dayOf() reads the calendar date from the string
// prefix without applying the offset. A 'Z' timestamp from an evening session
// in Massachusetts would land on the next day.
//
// ULIDs are generated monotonically per factory: two events in the same
// millisecond get increasing ids, so sorting by id preserves append order.

/** @typedef {import('../../types.d.ts').Event} Event */

export const EVENT_VERSION = 1;
export const SAVE_VERSION = 2;
export const SAVE_FORMAT = 'keystone-save';
export const PROTO_FORMAT = 'keystone-proto-log';
export const MAX_EVENT_BYTES = 8192;
export const MAX_DATA_DEPTH = 32;

export const EVENT_TYPES = Object.freeze(['attempt', 'award', 'session-start', 'session-end', 'unlock',
  'placement', 'report', 'paper-bridge', 'setting']);

export const RE_ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const RE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
export const RE_BUILD = /^[A-Za-z0-9._-]{1,64}$/;
export const RE_DEVICE = /^[A-Za-z0-9_-]{1,64}$/;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_TIME = 2n ** 48n - 1n;
const MAX_RAND = 2n ** 80n - 1n;
const ENC = new TextEncoder();

/** @param {unknown} x @returns {number} UTF-8 byte length of JSON.stringify(x) */
export function jsonBytes(x) {
  return ENC.encode(JSON.stringify(x)).length;
}

/**
 * Why an event is not acceptable, or null if it is.
 * @param {unknown} e
 * @returns {string | null}
 */
export function validateEvent(e) {
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return 'not an object';
  const o = /** @type {Record<string, unknown>} */ (e);
  if (typeof o.id !== 'string' || !RE_ULID.test(o.id)) return 'bad id';
  if (typeof o.v !== 'number' || !Number.isInteger(o.v) || o.v < 1 || o.v > 1000) return 'bad v';
  if (typeof o.t !== 'string' || !RE_TIME.test(o.t)) return 'bad t';
  if (typeof o.build !== 'string' || !RE_BUILD.test(o.build)) return 'bad build';
  if (typeof o.device !== 'string' || !RE_DEVICE.test(o.device)) return 'bad device';
  if (typeof o.type !== 'string' || !EVENT_TYPES.includes(o.type)) return 'bad type';
  if (!('data' in o) || o.data === undefined) return 'no data';
  for (const k of Object.keys(o)) {
    if (!['id', 'v', 't', 'build', 'device', 'type', 'data'].includes(k)) return `unknown field ${k}`;
  }
  if (depth(o.data) > MAX_DATA_DEPTH) return 'data nested too deep';
  const unsafe = phpUnsafe(o.data);
  if (unsafe) return unsafe;
  if (jsonBytes(o) > MAX_EVENT_BYTES) return 'too large';
  return null;
}

/** @param {string} s */
function wellFormed(s) {
  try { encodeURIComponent(s); return true; } catch { return false; }
}

/**
 * Why the server could not store a value unchanged, or null. PHP's
 * json_decode($body, false) refuses the WHOLE request body (400 bad-json) for
 * an unpaired UTF-16 surrogate anywhere (JSON.stringify writes one as a
 * "\ud83d" escape) and for an object key starting with NUL (not a valid
 * stdClass property name). A non-finite number would be sent as null by
 * JSON.stringify, a silent value change. Call only on a depth-checked value.
 * Walks the value as given: an object with a toJSON method is checked as it
 * is, not as it serializes (event data is plain JSON-like values).
 * @param {unknown} x
 * @returns {string | null}
 */
function phpUnsafe(x) {
  if (typeof x === 'string') return wellFormed(x) ? null : 'unpaired surrogate in a string';
  if (typeof x === 'number') return Number.isFinite(x) ? null : 'non-finite number';
  if (typeof x !== 'object' || x === null) return null;
  const arr = Array.isArray(x);
  for (const [k, v] of Object.entries(x)) {
    if (!arr && !wellFormed(k)) return 'unpaired surrogate in a key';
    if (!arr && k.startsWith('\0')) return 'key starts with NUL';
    const why = phpUnsafe(v);
    if (why) return why;
  }
  return null;
}

/**
 * Container nesting depth (a scalar is 0, [] or {} is 1). The server decodes a
 * request body with PHP's depth limit of 64; capping event data at 32 keeps
 * every client-accepted event far inside it.
 * Stops counting past `limit`, so a cyclic value cannot recurse forever.
 * @param {unknown} x
 * @param {number} [limit]
 * @returns {number}
 */
export function depth(x, limit = MAX_DATA_DEPTH + 1) {
  if (typeof x !== 'object' || x === null) return 0;
  if (limit <= 0) return 1;
  let d = 0;
  for (const v of Object.values(x)) { const c = depth(v, limit - 1); if (c > d) d = c; if (d >= limit) break; }
  return d + 1;
}

/**
 * Encode a ULID from a ms time and an 80-bit random part.
 * @param {bigint} t @param {bigint} r
 */
export function encodeUlid(t, r) {
  if (t < 0n || t > MAX_TIME || r < 0n || r > MAX_RAND) throw new RangeError('ulid out of range');
  let s = '';
  for (let i = 0; i < 10; i++) { s = CROCKFORD[Number(t % 32n)] + s; t /= 32n; }
  let rs = '';
  for (let i = 0; i < 16; i++) { rs = CROCKFORD[Number(r % 32n)] + rs; r /= 32n; }
  return s + rs;
}

/**
 * Monotonic ULID source. A clock that stalls or steps back reuses the last
 * time and increments the random part, so ids from one factory strictly increase.
 * @param {(n: number) => Uint8Array} randomBytes
 * @returns {(nowMs: number) => string}
 */
export function makeUlidFactory(randomBytes) {
  let lastT = -1n;
  let lastR = 0n;
  return (nowMs) => {
    let t = BigInt(Math.floor(nowMs));
    if (t <= lastT) {
      t = lastT;
      if (lastR === MAX_RAND) { t += 1n; lastR = 0n; } else lastR += 1n;
    } else {
      const b = randomBytes(10);
      let r = 0n;
      for (let i = 0; i < 10; i++) r = (r << 8n) | BigInt(b[i]);
      // Leave headroom so a burst within one ms cannot overflow 80 bits.
      lastR = r >> 1n;
    }
    lastT = t;
    return encodeUlid(t, lastR);
  };
}

/** @param {number} n */
function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * ISO-8601 with an explicit local offset, e.g. "2026-11-12T21:30:00.000-05:00".
 * @param {number} nowMs epoch ms
 * @param {number} tzOffsetMin minutes WEST of UTC, as Date#getTimezoneOffset returns (300 for UTC-5)
 */
export function localIso(nowMs, tzOffsetMin) {
  const local = new Date(nowMs - tzOffsetMin * 60000);
  const s = local.toISOString().slice(0, 23);
  const east = -tzOffsetMin;
  const sign = east >= 0 ? '+' : '-';
  const a = Math.abs(east);
  return `${s}${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
}

/**
 * @param {{ id: string; t: string; build: string; device: string; type: Event['type']; data: unknown }} p
 * @returns {Event}
 */
export function makeEvent(p) {
  /** @type {Event} */
  const e = { id: p.id, v: EVENT_VERSION, t: p.t, build: p.build, device: p.device, type: p.type, data: p.data };
  const why = validateEvent(e);
  if (why) throw new Error(`makeEvent: ${why}`);
  return e;
}

/**
 * @typedef {{ format: 'keystone-save'; v: 2; build: string; device: string;
 *             exportedAt: string | null; events: Event[] }} SaveV2
 */

/**
 * The current save document. Holds no token and no sync cursor: an export may
 * be shared, and importing it re-queues every event (the server deduplicates).
 * @param {{ build: string; device: string; exportedAt: string | null; events: readonly Event[] }} p
 * @returns {SaveV2}
 */
export function makeSave(p) {
  const events = [...p.events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { format: SAVE_FORMAT, v: SAVE_VERSION, build: p.build, device: p.device, exportedAt: p.exportedAt, events };
}

/**
 * The JSON export (DESIGN.md section 11: "A JSON export button").
 * @param {{ allEvents(): Promise<Event[]> }} store
 * @param {{ build: string; device: string; exportedAt: string }} p
 * @returns {Promise<string>}
 */
export async function exportSave(store, p) {
  return JSON.stringify(makeSave({ ...p, events: await store.allEvents() }), null, 1);
}
