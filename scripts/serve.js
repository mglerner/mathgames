// @ts-check
// Dev server (DESIGN.md section 11): regenerates the registries, serves static
// files, and runs a Node mock of api/sync.php and api/pair.php.
//
// THE MOCK MIRRORS THE PHP RULE FOR RULE: same order of checks, same status
// codes, same file names and formats, same limits, same set-union cursor
// logic. When you change api/*.php, change the matching function here (and
// the reverse). JSON goes through JSON.parse/JSON.stringify, wrapped to mirror
// json_decode/json_encode where it matters (phpDecode, phpInt, phpEncode):
// the whole body is bad-json on an unpaired surrogate or a NUL-prefixed object
// key; v and since are ints only when written as integer literals that fit in
// 64 bits (5.0 and 1e2 are PHP floats; since above 2^53 is accepted); an event
// with a non-finite number (1e400 -> INF) is bad-event; stored lines escape
// U+2028/U+2029 as PHP does.
// Known differences that remain (from reading the PHP; PHP is never run here):
//   - float formatting in stored lines (PHP 1.0e+25 / 5.0, JS 1e+25 / 5); same values;
//   - invalid UTF-8 bytes: PHP 400s (JSON_ERROR_UTF8); the dev server decodes the
//     body with replacement characters first, so the mock never sees them;
//   - json_decode depth: the mock's phpDepth() is not proven to count exactly
//     as PHP does (irrelevant to real clients, which cap data depth at 32), and
//     ke_read's depth 16 on the server's own files is not mirrored;
//   - ke_auth skips non-string array keys (is_string($k)); token hashes are
//     64 hex chars, which PHP never turns into int keys, so this cannot differ;
//   - a direct request for api/lib.php gets 403 from .htaccess (404 only if
//     .htaccess is not honoured); the mock's static server answers 404;
//   - the data directory is an injected `files` object instead of
//     ~/keystone-data, and there is no flock (Node runs one handler at a time),
//     so "concurrent POSTs lose no lines" is really tested only against staging.
//
// Everything is a plain function, testable in-process with no socket:
//   createApi({ files, nowMs, randomBytes, randomInt }) -> { sync(req), pair(req) }
//   serveStatic({ root, prefix }, method, urlPath)    -> Res
//   createHandler({ root, prefix, api })              -> (req: Req) => Res
// with Req = { method, url, body: string, ip, contentLength? } and
//      Res = { status, headers, body: string | Buffer }.
// The prefix ('/' or '/staging/') mounts the whole app under a subpath, to
// check that nothing assumes the site root.
//
// Run: node scripts/serve.js [--port 8000] [--host 127.0.0.1] [--prefix /staging/]
//        [--dist DIR | --build HASH] [--data DIR]
//   default root is the repo (dev: boot.js reports build 'dev' and registers no
//   service worker); --build HASH builds dist/ with gen-sw.js and serves it.
//   With no --data the API keeps its files in memory; startup provisions a dev
//   learner and prints a pairing code.

import { createHash, randomBytes as nodeRandomBytes, randomInt as nodeRandomInt } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, sep, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { genRegistry } from './gen-registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const MAX_BODY = 262144;
export const MAX_EVENT = 16384;
export const CODE_TTL = 900;
const RE_LEARNER = /^[a-z0-9][a-z0-9-]{0,31}$/;
const RE_TOKEN = /^[0-9a-f]{32}$/;
const TYPES = ['attempt', 'award', 'session-start', 'session-end', 'unlock', 'placement', 'report', 'paper-bridge', 'setting'];
const FIELDS = ['id', 'v', 't', 'build', 'device', 'type', 'data'];

/** @typedef {{ method: string; url?: string; body: string; ip: string; contentLength?: number }} Req */
/** @typedef {{ status: number; headers: Record<string, string>; body: string | Buffer }} Res */
/**
 * The data directory. Names are constants or `<learner>.jsonl`.
 * @typedef {{ read(name: string): string | undefined; write(name: string, s: string): void;
 *             append(name: string, s: string): void; names(): string[] }} Files
 */

/** @returns {Files} */
export function memFiles() {
  /** @type {Map<string, string>} */
  const m = new Map();
  return {
    read: (n) => m.get(n),
    write: (n, s) => { m.set(n, s); },
    append: (n, s) => { m.set(n, (m.get(n) ?? '') + s); },
    names: () => [...m.keys()].sort(),
  };
}

/** @param {string} dir @returns {Files} */
export function dirFiles(dir) {
  mkdirSync(dir, { recursive: true });
  /** @param {string} n */
  const p = (n) => {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(n) || n.includes('..')) throw new Error(`bad data file name ${n}`);
    return join(dir, n);
  };
  return {
    read: (n) => (existsSync(p(n)) ? readFileSync(p(n), 'utf8') : undefined),
    write: (n, s) => { const t = `${p(n)}.tmp${process.pid}`; writeFileSync(t, s); renameSync(t, p(n)); },
    append: (n, s) => { writeFileSync(p(n), s, { flag: 'a' }); },
    names: () => readdirSync(dir).filter((n) => !n.includes('.tmp')).sort(),
  };
}

/** @param {string} s */
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** @param {number} status @param {unknown} body @returns {Res} */
function out(status, body) {
  return { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    body: JSON.stringify(body) };
}

/** Thrown to end a request early, like PHP's exit in ke_out. */
class Exit { /** @param {Res} res */ constructor(res) { this.res = res; } }
/** @param {number} status @param {unknown} body @returns {never} */
function exit(status, body) { throw new Exit(out(status, body)); }

/** @param {unknown} x @returns {x is Record<string, any>} */
const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

/** PHP json_decode depth: nesting levels including the outer container. @param {unknown} x @returns {number} */
function phpDepth(x) {
  if (typeof x !== 'object' || x === null) return 1;
  let d = 0;
  for (const v of Object.values(x)) d = Math.max(d, phpDepth(v));
  return d + 1;
}

/**
 * Number source texts recorded while parsing a request body, so the mock can
 * tell PHP's int from float: json_decode gives an int only for a literal with
 * no '.', 'e' or 'E' that fits in 64 bits ("5.0" and "1e2" are floats there).
 * @typedef {WeakMap<object, Map<string, string>>} NumSources
 */

/** @param {string} s */
function wellFormed(s) {
  try { encodeURIComponent(s); return true; } catch { return false; }
}

/**
 * json_decode($body, false, 64) in ke_begin: null where PHP fails the whole
 * body (bad JSON, an unpaired UTF-16 surrogate in any string or key, an object
 * key starting with NUL), else the value and its number sources.
 * @param {string} body @returns {{ value: unknown; nums: NumSources } | null}
 */
export function phpDecode(body) {
  /** @type {NumSources} */
  const nums = new WeakMap();
  let bad = false;
  let value;
  try {
    value = JSON.parse(body, function (k, v, ctx) {
      if (!Array.isArray(this) && (!wellFormed(k) || k.startsWith('\0'))) bad = true;
      if (typeof v === 'string' && !wellFormed(v)) bad = true;
      if (typeof v === 'number' && ctx && typeof ctx.source === 'string') {
        let m = nums.get(this);
        if (!m) nums.set(this, (m = new Map()));
        m.set(k, ctx.source);
      }
      return v;
    });
  } catch { return null; }
  return bad ? null : { value, nums };
}

/**
 * PHP is_int($holder->key): the value as a BigInt, or null. Without recorded
 * sources (a direct call on a JS object) a safe integer counts as an int.
 * @param {Record<string, any>} holder @param {string} key @param {NumSources} [nums]
 * @returns {bigint | null}
 */
export function phpInt(holder, key, nums) {
  const v = holder[key];
  if (typeof v !== 'number') return null;
  const src = nums?.get(holder)?.get(key);
  if (src === undefined) return Number.isSafeInteger(v) ? BigInt(v) : null;
  if (/[.eE]/.test(src)) return null;
  const b = BigInt(src);
  return b >= -(2n ** 63n) && b <= 2n ** 63n - 1n ? b : null;
}

/**
 * json_encode($e, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE): false (here
 * null) on a non-finite number; U+2028 and U+2029 are still escaped (PHP leaves
 * them raw only with JSON_UNESCAPED_LINE_TERMINATORS). Float formatting is NOT
 * mirrored (PHP writes 1.0e+25 and 5.0 where JS writes 1e+25 and 5).
 * @param {unknown} x @returns {string | null}
 */
export function phpEncode(x) {
  let finite = true;
  const s = JSON.stringify(x, (_k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) finite = false; return v; });
  return finite ? s.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') : null;
}

/** ke_valid_event @param {unknown} e @param {NumSources} [nums] */
export function validEventServer(e, nums) {
  if (!isObj(e)) return false;
  if (Object.keys(e).some((k) => !FIELDS.includes(k)) || !('data' in e)) return false;
  const v = phpInt(e, 'v', nums);
  if (!(typeof e.id === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(e.id)
    && v !== null && v >= 1n && v <= 1000n
    && typeof e.t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(e.t)
    && typeof e.build === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(e.build)
    && typeof e.device === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.device)
    && TYPES.includes(e.type))) return false;
  const s = phpEncode(e);
  return s !== null && Buffer.byteLength(s) <= MAX_EVENT;
}

/**
 * @param {{ files: Files; nowMs?: () => number; randomBytes?: (n: number) => Buffer | Uint8Array;
 *           randomInt?: (lo: number, hiExclusive: number) => number }} env
 */
export function createApi(env) {
  const { files } = env;
  const nowMs = env.nowMs ?? Date.now;
  const randomBytes = env.randomBytes ?? nodeRandomBytes;
  const randomInt = env.randomInt ?? nodeRandomInt;

  /** ke_read @param {string} name @returns {Record<string, any>} */
  const read = (name) => {
    const s = files.read(name);
    if (s === undefined) return {};
    try { const j = JSON.parse(s); return isObj(j) || Array.isArray(j) ? { ...j } : {}; } catch { return {}; }
  };
  /** ke_write @param {string} name @param {Record<string, any>} data */
  const write = (name, data) => files.write(name, JSON.stringify(data));

  /** ke_rate @param {string} key @param {number} limit @param {number} window @param {number} now */
  function rate(key, limit, window, now) {
    const all = read('ratelimit.json');
    for (const [k, e] of Object.entries(all)) {
      if (!isObj(e) || !Number.isInteger(e.s) || e.s < 1 || Math.floor(now / e.s) !== e.w) delete all[k];
    }
    const e = all[key] ?? { w: Math.floor(now / window), n: 0, s: window };
    e.n++;
    all[key] = e;
    write('ratelimit.json', all);
    return e.n <= limit;
  }

  /** ke_begin @param {Req} req */
  function begin(req) {
    if (req.method !== 'POST') exit(405, { error: 'method' });
    const len = req.contentLength ?? Buffer.byteLength(req.body);
    if (len > MAX_BODY) exit(413, { error: 'too-large' });
    if (Buffer.byteLength(req.body) > MAX_BODY) exit(413, { error: 'too-large' });
    const now = Math.floor(nowMs() / 1000);
    if (!rate(`ip:${sha256(req.ip)}`, 60, 60, now)) exit(429, { error: 'rate' });
    const dec = phpDecode(req.body);
    const input = dec?.value;
    if (!dec || !isObj(input) || phpDepth(input) > 64) exit(400, { error: 'bad-json' });
    return { input, now, nums: dec.nums };
  }

  /** ke_auth @param {Record<string, any>} input @param {number} now */
  function auth(input, now) {
    const t = input.token;
    /** @type {Record<string, any> | null} */
    let found = null;
    if (typeof t === 'string' && RE_TOKEN.test(t)) {
      const h = sha256(t);
      for (const [k, v] of Object.entries(read('tokens.json'))) if (k === h && isObj(v)) found = { hash: k, ...v };
    }
    if (found === null || typeof found.learner !== 'string' || !RE_LEARNER.test(found.learner)
      || !['kid', 'teacher'].includes(found.role)) exit(401, { error: 'token' });
    const who = /** @type {{ learner: string; role: string; hash: string }} */ (found);
    if (!rate(`t:${who.hash}`, 60, 60, now)) exit(429, { error: 'rate' });
    return who;
  }

  /** ke_add_token */
  function addToken(/** @type {string} */ hash, /** @type {string} */ learner, /** @type {string} */ role, /** @type {number} */ now) {
    const all = read('tokens.json');
    all[hash] = { learner, role, created: new Date(now * 1000).toISOString().slice(0, 10) };
    write('tokens.json', all);
  }

  /** @param {(req: Req) => Res} fn @returns {(req: Req) => Res} */
  const guard = (fn) => (req) => {
    try { return fn(req); } catch (err) { if (err instanceof Exit) return err.res; throw err; }
  };

  /** sync.php */
  const sync = guard((req) => {
    const { input, now, nums } = begin(req);
    const who = auth(input, now);
    const since = phpInt(input, 'since', nums);
    const { events } = input;
    if (since === null || since < 0n || !Array.isArray(events)) exit(400, { error: 'bad-body' });
    for (const e of events) if (!validEventServer(e, nums)) exit(400, { error: 'bad-event' });
    if (who.role !== 'kid' && events.length > 0) exit(403, { error: 'read-only' });

    const name = `${who.learner}.jsonl`;
    const raw = files.read(name) ?? '';
    const lines = raw === '' ? [] : raw.replace(/\n+$/, '').split('\n');
    /** @type {Set<string>} */
    const have = new Set();
    for (const line of lines) {
      let o; try { o = JSON.parse(line); } catch { o = null; }
      if (isObj(o) && typeof o.id === 'string') have.add(o.id);
    }
    const sent = new Set();
    const fresh = [];
    for (const e of events) {
      sent.add(e.id);
      if (have.has(e.id)) continue;
      have.add(e.id);
      fresh.push(/** @type {string} */ (phpEncode(e)));
    }
    if (fresh.length) {
      files.append(name, (raw !== '' && !raw.endsWith('\n') ? '\n' : '') + fresh.join('\n') + '\n');
      lines.push(...fresh);
    }
    const n = lines.length;
    const from = since <= BigInt(n) ? Number(since) : 0;
    const outLines = [];
    for (let i = from; i < n; i++) {
      let o; try { o = JSON.parse(lines[i]); } catch { o = null; }
      if (isObj(o) && typeof o.id === 'string' && !sent.has(o.id)) outLines.push(lines[i]);
    }
    return { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      body: `{"cursor":${n},"events":[${outLines.join(',')}]}` };
  });

  /** pair.php */
  const pair = guard((req) => {
    const { input, now } = begin(req);
    const action = input.action;
    if (action === 'redeem') {
      if (!rate(`redeem-ip:${sha256(req.ip)}`, 5, CODE_TTL, now) || !rate('redeem-all', 20, CODE_TTL, now)) exit(429, { error: 'rate' });
      const code = input.code;
      if (typeof code !== 'string' || !/^[0-9]{8}$/.test(code)) exit(404, { error: 'bad-code' });
      const all = read('pairing.json');
      let hit = null;
      for (const [k, e] of Object.entries(all)) {
        if (!isObj(e) || !Number.isInteger(e.exp) || e.exp <= now) { delete all[k]; continue; }
        if (k === `c${code}`) { hit = e; delete all[k]; }
      }
      write('pairing.json', all);
      if (hit === null || typeof hit.token !== 'string' || !RE_TOKEN.test(hit.token)
        || typeof hit.learner !== 'string' || !RE_LEARNER.test(hit.learner)) exit(404, { error: 'bad-code' });
      addToken(sha256(hit.token), hit.learner, 'kid', now);
      return out(200, { token: hit.token });
    }
    const who = auth(input, now);
    if (who.role !== 'teacher') exit(403, { error: 'teacher-only' });
    if (action === 'mint') {
      const token = Buffer.from(randomBytes(16)).toString('hex');
      const all = read('pairing.json');
      for (const [k, e] of Object.entries(all)) if (!isObj(e) || !Number.isInteger(e.exp) || e.exp <= now) delete all[k];
      let code;
      do { code = String(randomInt(0, 100000000)).padStart(8, '0'); } while (`c${code}` in all);
      all[`c${code}`] = { token, learner: who.learner, exp: now + CODE_TTL };
      write('pairing.json', all);
      return out(200, { code, expiresIn: CODE_TTL });
    }
    if (action === 'list') {
      const devices = [];
      for (const [k, v] of Object.entries(read('tokens.json'))) {
        if (isObj(v) && v.learner === who.learner) devices.push({ id: k.slice(0, 16), role: String(v.role ?? ''), created: String(v.created ?? '') });
      }
      return out(200, { devices });
    }
    if (action === 'revoke') {
      const id = input.id;
      if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) exit(404, { error: 'no-device' });
      const all = read('tokens.json');
      let done = false;
      for (const [k, v] of Object.entries(all)) {
        if (isObj(v) && k.slice(0, 16) === id && v.learner === who.learner && v.role === 'kid') { delete all[k]; done = true; }
      }
      if (done) write('tokens.json', all);
      if (!done) exit(404, { error: 'no-device' });
      return out(200, { revoked: true });
    }
    return out(400, { error: 'bad-action' });
  });

  return {
    sync,
    pair,
    /** Test/dev provisioning (what scripts/provision.sh does on the host). @param {string} learner @param {'kid' | 'teacher'} role */
    provision(learner, role) {
      if (!RE_LEARNER.test(learner)) throw new Error('bad learner id');
      const token = Buffer.from(randomBytes(16)).toString('hex');
      addToken(sha256(token), learner, role, Math.floor(nowMs() / 1000));
      return token;
    },
  };
}

const MIME = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
});

/**
 * Cache-Control as api/.htaccess sets it (mirror; keep in step).
 * @param {string} rel path relative to the app root
 */
export function cacheControl(rel) {
  if (/\.php$/.test(rel)) return 'no-store';
  if (/^(sw\.js|index\.html|teacher\.html|manifest\.webmanifest)$/.test(basename(rel))) return 'no-cache';
  if (/(^|\/)v\/[0-9a-f]{7,40}\//.test(rel)) return 'public, max-age=31536000, immutable';
  return '';
}

/**
 * @param {{ root: string; prefix?: string }} opts
 * @param {string} method @param {string} urlPath path part of the request URL
 * @returns {Res}
 */
export function serveStatic(opts, method, urlPath) {
  const prefix = opts.prefix ?? '/';
  const text = (/** @type {number} */ status, /** @type {string} */ msg) => ({ status, headers: { 'Content-Type': 'text/plain' }, body: msg });
  if (method !== 'GET' && method !== 'HEAD') return text(405, 'method');
  const path = urlPath.split('?')[0].split('#')[0];
  if (!path.startsWith(prefix)) return text(404, 'not found');
  let rel;
  try { rel = decodeURIComponent(path.slice(prefix.length)); } catch { return text(400, 'bad path'); }
  if (rel.includes('\0') || rel.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) return text(404, 'not found');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  if (/\.(lock|php)$/.test(rel) || /\.tmp\d*$/.test(rel)) return text(404, 'not found');
  const root = resolve(opts.root);
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) return text(404, 'not found');
  if (!existsSync(abs)) return text(404, 'not found');
  if (statSync(abs).isDirectory()) return { status: 301, headers: { Location: `${basename(abs)}/` }, body: '' };
  const headers = /** @type {Record<string, string>} */ ({ 'Content-Type': MIME[extname(abs)] ?? 'application/octet-stream' });
  const cc = cacheControl(rel);
  if (cc) headers['Cache-Control'] = cc;
  return { status: 200, headers, body: method === 'HEAD' ? '' : readFileSync(abs) };
}

/**
 * @param {{ root: string; prefix?: string; api: ReturnType<typeof createApi> }} opts
 * @returns {(req: Req) => Res}
 */
export function createHandler(opts) {
  const prefix = opts.prefix ?? '/';
  return (req) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path === `${prefix}api/sync.php`) return opts.api.sync(req);
    if (path === `${prefix}api/pair.php`) return opts.api.pair(req);
    return serveStatic({ root: opts.root, prefix }, req.method, path);
  };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (/** @type {string} */ k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const r = genRegistry(ROOT);
  console.log(`serve: registries: ${r.generators.length} generators, ${r.malrules.length} mal-rules, ${r.mounts.length} mounts`);
  let root = ROOT;
  const hash = get('--build');
  if (hash) {
    const { buildDist } = await import('./gen-sw.js');
    const b = buildDist({ root: ROOT, out: join(ROOT, 'dist'), hash });
    root = join(ROOT, 'dist');
    console.log(`serve: built dist/ for ${b.hash} (${b.files.length} files)`);
  } else if (get('--dist')) root = resolve(/** @type {string} */ (get('--dist')));
  let prefix = get('--prefix') ?? '/';
  if (!prefix.startsWith('/')) prefix = `/${prefix}`;
  if (!prefix.endsWith('/')) prefix += '/';
  const dataDir = get('--data');
  const api = createApi({ files: dataDir ? dirFiles(resolve(dataDir)) : memFiles() });
  const teacher = api.provision('dev', 'teacher');
  const mint = JSON.parse(String(api.pair({ method: 'POST', body: JSON.stringify({ action: 'mint', token: teacher }), ip: 'startup' }).body));
  const handler = createHandler({ root, prefix, api });
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= MAX_BODY + 1) chunks.push(c); });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const r2 = handler({ method: req.method ?? 'GET', url: req.url ?? '/', body, ip: req.socket.remoteAddress ?? '',
        contentLength: Math.max(size, Number(req.headers['content-length'] ?? 0) || 0) });
      res.writeHead(r2.status, r2.headers);
      res.end(r2.body);
    });
  });
  const port = Number(get('--port') ?? 8000);
  const host = get('--host') ?? '127.0.0.1';
  server.listen(port, host, () => {
    console.log(`serve: http://${host}:${port}${prefix}  (root ${root}, API data ${dataDir ?? 'in memory'})`);
    console.log(`serve: dev teacher token ${teacher}; pairing code ${mint.code} (15 min, single use)`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
