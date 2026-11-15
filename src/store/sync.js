// @ts-check
// Sync client, retry queue, backup status and pairing client
// (DESIGN.md section 11, "Persistence and sync").
//
// Wire protocol (api/sync.php; the Node mock in scripts/serve.js mirrors it):
//   POST api/sync.php   body {"token": t, "since": cursor, "events": [Event...]}
//        (the token rides in the JSON body, not an Authorization header: PHP under
//        FastCGI often never sees that header, and bodies are not written to access logs)
//   200 {"cursor": n, "events": [...]}   the server's log lines from `since` on that the device
//        did not just send; cursor is the server's line count. Sync is a set union by
//        event id, so a repeated or overlapping POST is harmless.
//   400 bad body, 401 unknown token, 403 teacher token with events, 405 not POST,
//   413 body over 256 KB, 429 rate limited. Every error body is {"error": "..."}.
//   POST api/pair.php  {"action":"redeem","code":"12345678"}  -> 200 {"token"} | 404 | 429
//                      {"action":"mint","token":teacher}    -> 200 {"code","expiresIn"}
//                      {"action":"list"|"revoke","token":teacher,"id"?}
// Endpoints are RELATIVE URLs, resolved against the page, so the app works
// identically at / and at /staging/.
//
// The retry queue is the store's outbox (idb.js). A sync sends the oldest
// outbox events in a batch under the byte cap (60000 bytes with keepalive,
// whose bodies browsers cap at 64 KiB; 200000 otherwise, under the server's
// 256 KB), and an event leaves the outbox only when a 200 acknowledges it.
// Failures back off 5 s, 15 s, 60 s, then every 300 s; success resets the backoff.
// 401 stops retrying and reports 'token-rejected' (the device must re-pair);
// it also records meta.rejectedToken = that token, cleared by the next 200, so
// tokenState() says 'rejected' until the device is paired again (a new token);
// 400 stops retrying and reports 'rejected' (a client bug, not retried in a loop).
//
// "backed up N min ago" comes from ONE place: meta.lastOkMs, written only in
// the same transaction that acknowledges a batch and leaves the outbox empty.
// backupStatus() is the only function that turns it into text.

import { validateEvent } from './save-format.js';

/** @typedef {import('../../types.d.ts').Event} Event */
/** @typedef {import('./idb.js').Store} Store */

export const SYNC_ENDPOINT = 'api/sync.php';
export const PAIR_ENDPOINT = 'api/pair.php';
export const KEEPALIVE_BATCH_BYTES = 60000;
export const BATCH_BYTES = 200000;
export const BACKOFF_MS = Object.freeze([5000, 15000, 60000, 300000]);
export const RE_TOKEN = /^[0-9a-f]{32}$/;
export const RE_CODE = /^[0-9]{8}$/;

const ENC = new TextEncoder();

/**
 * @typedef {(url: string, init: { method: string; headers: Record<string, string>; body: string;
 *            keepalive?: boolean }) => Promise<{ status: number; json(): Promise<any> }>} FetchLike
 */
/**
 * @typedef {{ ok: true; sent: number; received: number }
 *         | { ok: false; reason: 'unpaired' | 'token-rejected' | 'rejected' | 'offline' | 'busy' | 'bad-response'
 *             | `http-${number}`; sent: number; received: number }} SyncResult
 */

/**
 * Largest prefix of events whose request body stays within maxBytes. Always
 * at least one event when any exist (a single event is capped far below any limit).
 * @param {readonly Event[]} events @param {number} since @param {number} maxBytes
 */
export function takeBatch(events, since, maxBytes) {
  let bytes = ENC.encode(JSON.stringify({ token: '0'.repeat(32), since, events: [] })).length;
  const out = [];
  for (const e of events) {
    const b = ENC.encode(JSON.stringify(e)).length + 1;
    if (out.length > 0 && bytes + b > maxBytes) break;
    out.push(e);
    bytes += b;
  }
  return out;
}

/**
 * @param {{
 *   store: Store;
 *   fetch: FetchLike;
 *   nowMs: () => number;
 *   setTimer?: (fn: () => void, ms: number) => unknown;
 *   clearTimer?: (h: any) => void;
 *   endpoint?: string;
 *   onChange?: () => void;
 * }} env
 */
export function createSync(env) {
  const endpoint = env.endpoint ?? SYNC_ENDPOINT;
  /** @type {Promise<SyncResult> | null} */
  let inFlight = null;
  let again = false;
  let failures = 0;
  /** @type {unknown} */
  let timer = null;
  let capBytes = BATCH_BYTES;
  /** @type {string | null} */
  let lastError = null;

  function clearRetry() {
    if (timer !== null && env.clearTimer) env.clearTimer(timer);
    timer = null;
  }
  function scheduleRetry() {
    clearRetry();
    if (!env.setTimer) return;
    const ms = BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)];
    timer = env.setTimer(() => { timer = null; void run(false); }, ms);
  }

  /** @param {boolean} keepalive @returns {Promise<SyncResult>} */
  async function once(keepalive) {
    let sent = 0;
    let received = 0;
    const token = await env.store.getMeta('token');
    if (typeof token !== 'string' || !RE_TOKEN.test(token)) return { ok: false, reason: 'unpaired', sent, received };
    for (;;) {
      const c = await env.store.getMeta('cursor');
      const since = Number.isSafeInteger(c) && c >= 0 ? c : 0;
      const pending = (await env.store.outbox()).filter((e) => validateEvent(e) === null);
      const batch = takeBatch(pending, since, keepalive ? Math.min(KEEPALIVE_BATCH_BYTES, capBytes) : capBytes);
      let res;
      try {
        res = await env.fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, since, events: batch }),
          ...(keepalive ? { keepalive: true } : {}),
        });
      } catch {
        return { ok: false, reason: 'offline', sent, received };
      }
      if (res.status === 401) {
        await env.store.setMeta({ rejectedToken: token });
        return { ok: false, reason: 'token-rejected', sent, received };
      }
      if (res.status === 400 || res.status === 403) return { ok: false, reason: 'rejected', sent, received };
      if (res.status === 413 && batch.length > 1) {
        capBytes = Math.max(1, Math.floor(capBytes / 2));
        continue;
      }
      if (res.status !== 200) return { ok: false, reason: `http-${res.status}`, sent, received };
      /** @type {any} */
      let body;
      try { body = await res.json(); } catch { return { ok: false, reason: 'bad-response', sent, received }; }
      if (!body || !Number.isSafeInteger(body.cursor) || body.cursor < 0 || !Array.isArray(body.events)) {
        return { ok: false, reason: 'bad-response', sent, received };
      }
      const incoming = body.events.filter((/** @type {unknown} */ e) => validateEvent(e) === null);
      received += await env.store.mergeRemote(incoming, { cursor: body.cursor });
      const remaining = (await env.store.pendingCount()) - batch.length;
      const ids = batch.map((e) => e.id);
      await env.store.ack(ids, remaining <= 0 ? { lastOkMs: env.nowMs(), rejectedToken: undefined } : { rejectedToken: undefined });
      sent += batch.length;
      // A poisoned outbox entry (fails validateEvent) is never sent; it would
      // otherwise block "backed up" forever, so it is surfaced, not hidden.
      const left = await env.store.pendingCount();
      if (left === 0 || keepalive) return { ok: true, sent, received };
      if (batch.length === 0) return { ok: false, reason: 'rejected', sent, received };
    }
  }

  /** @param {boolean} keepalive @returns {Promise<SyncResult>} */
  function run(keepalive) {
    if (inFlight) { again = true; return inFlight; }
    clearRetry();
    inFlight = (async () => {
      /** @type {SyncResult} */
      let r;
      do {
        again = false;
        r = await once(keepalive).catch(() => /** @type {SyncResult} */ ({ ok: false, reason: 'offline', sent: 0, received: 0 }));
      } while (again && r.ok);
      if (r.ok) { failures = 0; lastError = null; capBytes = BATCH_BYTES; } else {
        lastError = r.reason;
        if (r.reason === 'offline' || r.reason === 'bad-response' || r.reason.startsWith('http-')) {
          failures++;
          scheduleRetry();
        }
      }
      await env.store.setMeta({ lastAttemptMs: env.nowMs(), lastError: lastError ?? undefined });
      return r;
    })().finally(() => { inFlight = null; env.onChange?.(); });
    return inFlight;
  }

  return {
    /**
     * Sync now. keepalive: one batch only, fired with fetch keepalive (for
     * visibilitychange -> hidden and after each room).
     * @param {{ keepalive?: boolean }} [opts]
     */
    now(opts = {}) { return run(!!opts.keepalive); },
    /** For tests and the stub: is a retry timer armed, and after how many failures. */
    retryState() { return { armed: timer !== null, failures, lastError }; },
    stop() { clearRetry(); },
  };
}

/**
 * @typedef {{ state: 'unpaired' | 'never' | 'ok' | 'pending'; text: string;
 *             minutes: number | null; pending: number }} BackupStatus
 */

/** @param {number} ms @returns {string} */
function ago(ms) {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/**
 * THE source of "backed up N min ago" (Camp, Haul, stub, teacher view).
 * rejected: the server refused this device's token (401: revoked, or the
 * allowlist was lost). Reported as state 'unpaired' with its own text.
 * @param {{ paired: boolean; rejected?: boolean; lastOkMs: number | null | undefined; pending: number; nowMs: number }} s
 * @returns {BackupStatus}
 */
export function backupStatus(s) {
  const last = typeof s.lastOkMs === 'number' && Number.isFinite(s.lastOkMs) ? s.lastOkMs : null;
  const minutes = last === null ? null : Math.floor(Math.max(0, s.nowMs - last) / 60000);
  const plural = (/** @type {number} */ n) => `${n} event${n === 1 ? '' : 's'}`;
  if (!s.paired) {
    return { state: 'unpaired', minutes, pending: s.pending, text: 'not backed up: this device is not paired' };
  }
  if (s.rejected) {
    return { state: 'unpaired', minutes, pending: s.pending,
      text: `not backed up: this device must be paired again${s.pending > 0 ? ` (${plural(s.pending)} waiting)` : ''}` };
  }
  if (last === null) {
    return { state: 'never', minutes, pending: s.pending,
      text: s.pending > 0 ? `not backed up yet (${plural(s.pending)} waiting)` : 'not backed up yet' };
  }
  const base = `backed up ${ago(s.nowMs - last)}`;
  if (s.pending > 0) return { state: 'pending', minutes, pending: s.pending, text: `${base}; ${plural(s.pending)} newer not yet` };
  return { state: 'ok', minutes, pending: 0, text: base };
}

/**
 * 'none': no well-formed token; 'rejected': the server's last answer to this
 * token was 401; 'ok' otherwise.
 * @param {Store} store @returns {Promise<'none' | 'rejected' | 'ok'>}
 */
export async function tokenState(store) {
  const token = await store.getMeta('token');
  if (typeof token !== 'string' || !RE_TOKEN.test(token)) return 'none';
  return (await store.getMeta('rejectedToken')) === token ? 'rejected' : 'ok';
}

/**
 * Read the backup status straight from the store.
 * @param {Store} store @param {number} nowMs
 */
export async function readBackupStatus(store, nowMs) {
  const t = await tokenState(store);
  return backupStatus({
    paired: t !== 'none',
    rejected: t === 'rejected',
    lastOkMs: await store.getMeta('lastOkMs'),
    pending: await store.pendingCount(),
    nowMs,
  });
}

/**
 * Redeem an 8-digit pairing code. On success the token is stored with cursor 0,
 * so the next sync restores the whole server log.
 * @param {{ store: Store; fetch: FetchLike; code: string; endpoint?: string }} p
 * @returns {Promise<{ ok: true } | { ok: false; reason: 'bad-format' | 'bad-code' | 'rate-limited' | 'offline' | `http-${number}` }>}
 */
export async function redeemCode(p) {
  if (!RE_CODE.test(p.code)) return { ok: false, reason: 'bad-format' };
  let res;
  try {
    res = await p.fetch(p.endpoint ?? PAIR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', code: p.code }),
    });
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (res.status === 404) return { ok: false, reason: 'bad-code' };
  if (res.status === 429) return { ok: false, reason: 'rate-limited' };
  if (res.status !== 200) return { ok: false, reason: `http-${res.status}` };
  let body;
  try { body = await res.json(); } catch { return { ok: false, reason: 'http-200' }; }
  if (!body || typeof body.token !== 'string' || !RE_TOKEN.test(body.token)) return { ok: false, reason: 'http-200' };
  await p.store.setMeta({ token: body.token, cursor: 0, lastOkMs: undefined, lastError: undefined, rejectedToken: undefined });
  return { ok: true };
}

/**
 * Teacher side: mint a pairing code (teacher token required; M6 calls this).
 * @param {{ fetch: FetchLike; token: string; endpoint?: string }} p
 * @returns {Promise<{ ok: true; code: string; expiresIn: number } | { ok: false; reason: string }>}
 */
export async function mintCode(p) {
  let res;
  try {
    res = await p.fetch(p.endpoint ?? PAIR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mint', token: p.token }),
    });
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (res.status !== 200) return { ok: false, reason: `http-${res.status}` };
  const body = await res.json().catch(() => null);
  if (!body || typeof body.code !== 'string' || !RE_CODE.test(body.code)) return { ok: false, reason: 'bad-response' };
  return { ok: true, code: body.code, expiresIn: Number(body.expiresIn) };
}
