// @ts-check
// Event log in the DESIGN.md section 11 Event / Attempt shape, kept in localStorage.
// Every storage access is guarded: a private window or blocked storage must not break play.

export const BUILD = 'proto-0.5.0';
export const EVENT_VERSION = 1;
const KEY_EVENTS = 'keystone-proto.events';
const KEY_DEVICE = 'keystone-proto.device';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * ULID: 48-bit ms timestamp + 80 random bits, Crockford base32, 26 chars, sortable.
 * @param {number} timeMs @param {Uint8Array} rand at least 10 bytes
 */
export function ulid(timeMs, rand) {
  let t = BigInt(Math.floor(timeMs));
  let ts = '';
  for (let i = 0; i < 10; i++) {
    ts = CROCKFORD[Number(t % 32n)] + ts;
    t /= 32n;
  }
  let r = 0n;
  for (let i = 0; i < 10; i++) r = (r << 8n) | BigInt(rand[i]);
  let rs = '';
  for (let i = 0; i < 16; i++) {
    rs = CROCKFORD[Number(r % 32n)] + rs;
    r /= 32n;
  }
  return ts + rs;
}

/**
 * @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} StorageLike
 * @typedef {{ storage: StorageLike | null, nowMs(): number, randomBytes(n: number): Uint8Array }} LogEnv
 */

/** @param {LogEnv} env @returns {any[]} */
export function loadEvents(env) {
  try {
    if (!env.storage) return [];
    const raw = env.storage.getItem(KEY_EVENTS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** @param {LogEnv} env */
export function deviceId(env) {
  const fresh = () => Array.from(env.randomBytes(8), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    if (!env.storage) return fresh();
    const d = env.storage.getItem(KEY_DEVICE);
    if (d) return d;
    const n = fresh();
    env.storage.setItem(KEY_DEVICE, n);
    return n;
  } catch {
    return fresh();
  }
}

/**
 * The log keeps an in-memory copy, so a failed write never loses this session's events
 * from the export.
 * @param {LogEnv} env
 */
export function makeLog(env) {
  const events = loadEvents(env);
  const device = deviceId(env);
  let persisted = true;
  return {
    /** @param {string} type @param {unknown} data */
    append(type, data) {
      const now = env.nowMs();
      const ev = {
        id: ulid(now, env.randomBytes(10)),
        v: EVENT_VERSION,
        t: new Date(now).toISOString(),
        build: BUILD,
        device,
        type,
        data,
      };
      events.push(ev);
      try {
        if (!env.storage) throw new Error('no storage');
        env.storage.setItem(KEY_EVENTS, JSON.stringify(events));
        persisted = true;
      } catch {
        persisted = false;
      }
      return ev;
    },
    all: () => events.slice(),
    get persisted() {
      return persisted;
    },
    exportJSON() {
      return JSON.stringify({ format: 'keystone-proto-log', v: EVENT_VERSION, build: BUILD, device, events }, null, 1);
    },
  };
}

/**
 * Section 11 Attempt.
 * @param {any} p problem
 * @param {{ response: string, verdict: string, firstTry: boolean, context: string,
 *   misconceptions: string[], ambiguous: boolean, ms: number }} a
 */
export function makeAttempt(p, a) {
  return {
    problem: {
      gen: p.gen,
      version: p.version,
      seed: p.seed,
      skill: p.skill,
      difficulty: p.difficulty,
      interaction: p.interaction,
      ...(p.variant ? { variant: p.variant } : {}),
      constructed: p.constructed,
    },
    response: a.response,
    verdict: a.verdict,
    firstTry: a.firstTry,
    hintsUsed: 0,
    fadeLevel: p.fadeLevel,
    evidence: false,
    context: a.context,
    misconceptions: a.misconceptions,
    ambiguous: a.ambiguous,
    ms: Math.max(0, Math.round(a.ms)),
  };
}
