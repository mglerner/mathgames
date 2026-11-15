// @ts-check
// The PWA shell and build: dist/ layout, relative URLs (works at / and at
// /staging/), precache coverage, the generated service worker run in a vm
// against fake caches, icons, .htaccess <-> dev-server mirror, PHP static checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, crc32 as zcrc32 } from 'node:zlib';
import vm from 'node:vm';
import { buildDist, checkOut, DIST_MARKER, absoluteUrlViolations, reachableModules, importSpecifiers, moduleScripts } from '../../scripts/gen-sw.js';
import { renderIcons, ICONS, crc32 } from '../../scripts/gen-icons.js';
import { createHandler, createApi, memFiles, cacheControl } from '../../scripts/serve.js';
import { RE_ULID, RE_TIME, RE_BUILD, RE_DEVICE, EVENT_TYPES } from '../../src/store/save-format.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRATCH = join(ROOT, 'test', 'store', `.scratch-build-${process.pid}`);
const DIST = join(SCRATCH, 'dist');
const HASH = 'abc1234';
/** @type {ReturnType<typeof buildDist>} */
let built;

before(() => {
  mkdirSync(SCRATCH, { recursive: true });
  built = buildDist({ root: ROOT, out: DIST, hash: HASH });
});
after(() => { rmSync(SCRATCH, { recursive: true, force: true }); });

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const relPosix = (/** @type {string} */ base, /** @type {string} */ p) => relative(base, p).split(sep).join('/');

test('repo index.html loads only src/app/boot.js, as a module, with the section 9 viewport meta', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
  assert.deepEqual(scripts, ['<script type="module" src="src/app/boot.js">']);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon.png">/);
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html, /100dvh/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(html, /[^\x00-\x7f]/, 'ASCII only');
});

test('dist layout: versioned modules, rewritten entry, api, root .htaccess, proto, sw.js', () => {
  const files = new Set(built.files);
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', '.htaccess', 'api/sync.php', 'api/pair.php', 'api/lib.php',
    'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
    'proto/index.html', 'proto/style.css', 'proto/js/main.js', `v/${HASH}/src/app/boot.js`, `v/${HASH}/src/app/mounts.generated.js`,
    `v/${HASH}/src/store/sync.js`]) assert.ok(files.has(f), f);
  assert.ok(!built.files.some((f) => f.startsWith('src/') || f.startsWith('test/') || f.startsWith('proto/test/') || f === 'api/.htaccess'));
  const idx = readFileSync(join(DIST, 'index.html'), 'utf8');
  assert.deepEqual(moduleScripts(idx), [`v/${HASH}/src/app/boot.js`]);
  assert.equal(readFileSync(join(DIST, '.htaccess'), 'utf8'), readFileSync(join(ROOT, 'api', '.htaccess'), 'utf8'));
  assert.throws(() => buildDist({ root: ROOT, out: DIST, hash: 'NOTHEX' }), /bad build hash/);
});

test('precache coverage: every module reachable from boot.js (and teacher.html) is precached', () => {
  const entries = ['index.html', 'teacher.html'].filter((f) => existsSync(join(ROOT, f)))
    .flatMap((f) => moduleScripts(readFileSync(join(ROOT, f), 'utf8')));
  const reach = reachableModules(ROOT, entries);
  assert.ok(reach.includes('src/app/boot.js') && reach.includes('src/app/mounts.generated.js') && reach.includes('src/store/idb.js'));
  const pre = new Set(built.precache);
  for (const m of reach) assert.ok(pre.has(`v/${HASH}/${m}`), m);
  for (const f of ['index.html', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'proto/index.html']) assert.ok(pre.has(f), f);
  assert.ok(!built.precache.some((f) => f.startsWith('api/') || f === 'sw.js' || f === '.htaccess'));
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const list = JSON.parse(/** @type {RegExpExecArray} */ (/const PRECACHE = (\[[\s\S]*?\]);/.exec(sw))[1]);
  assert.deepEqual(list, built.precache);
});

test('no absolute-path or absolute URL anywhere in the shipped files', () => {
  const texts = walk(DIST).map((p) => relPosix(DIST, p)).filter((f) => /\.(html|css|js|webmanifest)$/.test(f))
    .map((f) => ({ path: f, text: readFileSync(join(DIST, f), 'utf8'),
      strict: f === 'sw.js' || f === `v/${HASH}/src/app/boot.js` || f.startsWith(`v/${HASH}/src/store/`) }));
  assert.ok(texts.length > 20);
  assert.deepEqual(absoluteUrlViolations(texts), []);
  // And the sources themselves (the dist check above runs at every build, too).
  const src = [join(ROOT, 'index.html'), join(ROOT, 'manifest.webmanifest'), ...walk(join(ROOT, 'src')).filter((p) => p.endsWith('.js'))]
    .map((p) => { const f = relPosix(ROOT, p); return { path: f, text: readFileSync(p, 'utf8'), strict: f === 'src/app/boot.js' || f.startsWith('src/store/') }; });
  assert.deepEqual(absoluteUrlViolations(src), []);
});

test('the absolute-URL checker catches each kind of absolute URL (self-test)', () => {
  /** @type {[string, string][]} */
  const planted = [
    ['a.html', '<script type="module" src="/src/app/boot.js"></script>'],
    ['a.html', '<link rel="manifest" href="/manifest.webmanifest">'],
    ['a.html', '<a href="https://shadyalexi.com/">x</a>'],
    ['a.html', '<div style="background:url(/icons/x.png)"></div>'],
    ['a.html', "<img src='//cdn.example/x.png'>"],
    ['m.webmanifest', '{"start_url":"/","scope":"./","icons":[]}'],
    ['m.webmanifest', '{"start_url":"./","scope":"/","icons":[]}'],
    ['m.webmanifest', '{"start_url":"./","scope":"./","icons":[{"src":"/icons/a.png"}]}'],
    ['m.webmanifest', '{"start_url":"./","icons":[]}'],
    ['x.js', "fetch('/api/sync.php', {});"],
    ['x.js', "navigator.serviceWorker.register('/sw.js');"],
    ['x.js', "import { a } from '/src/x.js';"],
    ['x.js', "const m = await import('https://cdn/x.js');"],
    ['x.js', "const u = new URL('/api/pair.php', location.href);"],
    ['sw.js', 'const PRECACHE = ["index.html","/v/abc1234/src/app/boot.js"];'],
  ];
  for (const [path, text] of planted) assert.equal(absoluteUrlViolations([{ path, text }]).length, 1, text);
  assert.equal(absoluteUrlViolations([{ path: 's.js', text: "const base = '/staging/';", strict: true }]).length, 1);
  assert.equal(absoluteUrlViolations([{ path: 's.js', text: "const base = '/staging/';" }]).length, 0, 'non-strict ignores plain strings');
  assert.deepEqual(absoluteUrlViolations([{ path: 'ok.html', text: '<a href="proto/">p</a><script type="module" src="v/abc1234/src/app/boot.js"></script>' },
    { path: 'ok.js', text: "fetch('api/sync.php'); import('./mounts.generated.js'); const r = /\\/v\\//;", strict: true }]), []);
});

/**
 * Fetch through the dev server's handler, mounted at `prefix`.
 * @param {string} prefix
 */
function server(prefix) {
  const h = createHandler({ root: DIST, prefix, api: createApi({ files: memFiles() }) });
  return (/** @type {string} */ url, /** @type {string} */ method = 'GET') => {
    const u = new URL(url);
    return h({ method, url: u.pathname + u.search, body: '', ip: '1' });
  };
}

for (const prefix of ['/', '/staging/']) {
  test(`the built app resolves completely when served at ${prefix}`, () => {
    const get = server(prefix);
    const base = `https://shadyalexi.com${prefix}`;
    const idx = get(base);
    assert.equal(idx.status, 200);
    const html = String(idx.body);
    const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => new URL(m[1], base).href);
    assert.ok(refs.length >= 4);
    for (const r of refs) assert.equal(get(r).status, 200, r);
    // Manifest: start_url and scope are the app directory; icons resolve.
    const manUrl = new URL('manifest.webmanifest', base).href;
    const man = JSON.parse(String(get(manUrl).body));
    assert.equal(new URL(man.start_url, manUrl).href, base);
    assert.equal(new URL(man.scope, manUrl).href, base);
    for (const ic of man.icons) assert.equal(get(new URL(ic.src, manUrl).href).status, 200, ic.src);
    // Service worker: registered as 'sw.js' with scope './' from the page.
    const swUrl = new URL('sw.js', base).href;
    assert.equal(get(swUrl).status, 200);
    assert.equal(new URL('./', swUrl).href, base, 'default scope of sw.js is the app directory');
    for (const p of built.precache) assert.equal(get(new URL(p, swUrl).href).status, 200, p);
    // Module graph by URL resolution (as the browser does it), from the entry script.
    const entry = new URL(`v/${HASH}/src/app/boot.js`, base).href;
    const seen = new Set();
    const stack = [entry];
    while (stack.length) {
      const u = /** @type {string} */ (stack.pop());
      if (seen.has(u)) continue;
      seen.add(u);
      const r = get(u);
      assert.equal(r.status, 200, u);
      assert.match(r.headers['Content-Type'], /text\/javascript/);
      for (const s of importSpecifiers(String(r.body))) stack.push(new URL(s, u).href);
    }
    assert.ok(seen.size >= 6);
    // API endpoints, relative to the page.
    const api = createHandler({ root: DIST, prefix, api: createApi({ files: memFiles() }) });
    const sync = api({ method: 'POST', url: new URL('api/sync.php', base).pathname, body: '{}', ip: '1' });
    assert.equal(sync.status, 401);
    // Outside the prefix nothing is served.
    if (prefix !== '/') assert.equal(get('https://shadyalexi.com/index.html').status, 404);
  });
}

test('dev server: no path traversal, no dotfiles, no PHP source, mirrored Cache-Control', () => {
  const get = server('/staging/');
  for (const p of ['/staging/../index.html', '/staging/%2e%2e/index.html', '/staging/.htaccess', '/staging/api/lib.php',
    '/staging/api/sync.php.bak', '/staging/v/../../etc/passwd']) {
    assert.ok(get(`https://h${p}`).status >= 400, p);
  }
  assert.equal(get('https://h/staging/sw.js').headers['Cache-Control'], 'no-cache');
  assert.equal(get('https://h/staging/index.html').headers['Cache-Control'], 'no-cache');
  assert.equal(get('https://h/staging/manifest.webmanifest').headers['Cache-Control'], 'no-cache');
  assert.match(get(`https://h/staging/v/${HASH}/src/app/boot.js`).headers['Cache-Control'], /immutable/);
  assert.equal(get('https://h/staging/icons/icon-192.png').headers['Cache-Control'], undefined);
  assert.equal(get('https://h/staging/proto').status, 301);
  assert.equal(get('https://h/staging/proto').headers.Location, 'proto/');
  // The .htaccess says the same thing the mirror does.
  const ht = readFileSync(join(ROOT, 'api', '.htaccess'), 'utf8');
  assert.match(ht, /<FilesMatch "\^\(sw\\\.js\|index\\\.html\|teacher\\\.html\|manifest\\\.webmanifest\)\$">\s*Header set Cache-Control "no-cache"/);
  assert.match(ht, /m#\/v\/\[0-9a-f\]\{7,40\}\/#">\s*Header set Cache-Control "public, max-age=31536000, immutable"/);
  assert.match(ht, /<Files "lib\.php">\s*Require all denied/);
  assert.equal(cacheControl('proto/index.html'), 'no-cache', 'FilesMatch matches the basename in any directory');
});

/**
 * Run the generated sw.js in a vm with fake caches and a fetch that hits the
 * dev server at /staging/.
 * @param {{ fetchOverride?: (url: string) => Response | null }} [o]
 */
function runSw(o = {}) {
  const origin = 'https://shadyalexi.com';
  const scope = `${origin}/staging/`;
  const swUrl = `${scope}sw.js`;
  const get = server('/staging/');
  /** @type {Map<string, Map<string, Response>>} */
  const store = new Map();
  /** @param {string} name */
  const open = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = /** @type {Map<string, Response>} */ (store.get(name));
    return {
      put: async (/** @type {string} */ u, /** @type {Response} */ r) => { m.set(new URL(u, swUrl).href, r); },
      match: async (/** @type {string} */ u) => { const r = m.get(new URL(u, swUrl).href); return r ? r.clone() : undefined; },
    };
  };
  const caches = {
    open: async (/** @type {string} */ n) => open(n),
    keys: async () => [...store.keys()],
    delete: async (/** @type {string} */ n) => store.delete(n),
  };
  const fetched = [];
  /** @param {any} req */
  const fetch = async (req) => {
    const url = typeof req === 'string' ? new URL(req, swUrl).href : req.url;
    fetched.push(url);
    const ov = o.fetchOverride?.(url);
    if (ov) return ov;
    const r = get(url);
    return new Response(r.status === 301 || r.status === 304 ? null : r.body, { status: r.status, headers: r.headers });
  };
  class Req extends Request { constructor(/** @type {string} */ u, /** @type {any} */ init) { super(new URL(u, swUrl), init); } }
  /** @type {Record<string, ((e: any) => void)[]>} */
  const handlers = {};
  let skipped = 0;
  let claimed = 0;
  const self = {
    location: new URL(swUrl),
    registration: { scope },
    clients: { claim: async () => { claimed++; } },
    skipWaiting: () => { skipped++; },
    addEventListener: (/** @type {string} */ t, /** @type {(e: any) => void} */ f) => { (handlers[t] ??= []).push(f); },
  };
  const ctx = vm.createContext({ self, caches, fetch, Request: Req, Response, URL, Promise, Set, Error, decodeURIComponent, console });
  vm.runInContext(readFileSync(join(DIST, 'sw.js'), 'utf8'), ctx, { filename: 'sw.js' });
  /** @param {string} t @param {any} ev */
  const dispatch = (t, ev) => { for (const f of handlers[t] ?? []) f(ev); return ev; };
  return {
    store, fetched, scope, get skipped() { return skipped; }, get claimed() { return claimed; },
    async install() { /** @type {any} */ let p; dispatch('install', { waitUntil: (/** @type {any} */ x) => { p = x; } }); return p; },
    async activate() { /** @type {any} */ let p; dispatch('activate', { waitUntil: (/** @type {any} */ x) => { p = x; } }); return p; },
    message: (/** @type {any} */ data) => dispatch('message', { data }),
    /** @param {string} url @param {{ method?: string; mode?: string }} [r] */
    fetchEvent(url, r = {}) {
      /** @type {any} */ let resp = null;
      dispatch('fetch', { request: { url, method: r.method ?? 'GET', mode: r.mode ?? 'cors' }, respondWith: (/** @type {any} */ x) => { resp = x; } });
      return resp;
    },
  };
}

test('service worker: install precaches everything (no skipWaiting), serves cache-first, passes the API through', async () => {
  const sw = runSw();
  await sw.install();
  assert.equal(sw.skipped, 0, 'never skips waiting on its own');
  const cache = /** @type {Map<string, Response>} */ (sw.store.get(`keystone:/staging/:${HASH}`));
  assert.equal(cache.size, built.precache.length);
  for (const p of built.precache) assert.ok(cache.has(new URL(p, `${sw.scope}sw.js`).href), p);
  for (const u of sw.fetched) assert.ok(u.startsWith(sw.scope), u);

  // Offline from here on: cached responses still come back.
  const nav = sw.fetchEvent(sw.scope, { mode: 'navigate' });
  assert.ok(nav, 'navigation to the app directory is answered');
  assert.match(await (await nav).text(), new RegExp(`v/${HASH}/src/app/boot\\.js`));
  const navQ = sw.fetchEvent(`${sw.scope}?utm=x`, { mode: 'navigate' });
  assert.ok(navQ, 'query strings on navigation are ignored');
  const mod = sw.fetchEvent(`${sw.scope}v/${HASH}/src/store/sync.js`);
  assert.match(await (await mod).text(), /createSync/);
  const proto = sw.fetchEvent(`${sw.scope}proto/`, { mode: 'navigate' });
  assert.ok(proto, 'the proto is available offline too');
  assert.equal(sw.fetchEvent(`${sw.scope}api/sync.php`, { method: 'POST' }), null, 'API POST not intercepted');
  assert.equal(sw.fetchEvent(`${sw.scope}api/sync.php`), null, 'API GET not intercepted');
  assert.equal(sw.fetchEvent('https://shadyalexi.com/index.html', { mode: 'navigate' }), null, 'outside the scope');
  assert.equal(sw.fetchEvent('https://elsewhere.example/staging/index.html'), null, 'other origin');
  assert.equal(sw.fetchEvent(`${sw.scope}v/0000000/src/app/boot.js`), null, 'other builds go to the network');

  sw.message({ type: 'skip-waiting' });
  assert.equal(sw.skipped, 1, 'skips waiting only when the page asks');
  sw.message({ type: 'other' });
  assert.equal(sw.skipped, 1);
});

test('service worker: activate deletes only older keystone caches and claims clients', async () => {
  const sw = runSw();
  sw.store.set('keystone:/staging/:0000000', new Map());
  sw.store.set('someone-else', new Map());
  // Production (scope /) shares this origin's CacheStorage: never touched from /staging/.
  sw.store.set(`keystone:/:${HASH}`, new Map());
  sw.store.set('keystone:/:0000000', new Map());
  sw.store.set('keystone:/staging/x/:0000000', new Map());
  await sw.install();
  await sw.activate();
  assert.deepEqual([...sw.store.keys()].sort(), ['keystone:/:0000000', `keystone:/:${HASH}`,
    `keystone:/staging/:${HASH}`, 'keystone:/staging/x/:0000000', 'someone-else']);
  assert.equal(sw.claimed, 1);
});

test('service worker: install fails, and leaves no cache, if index.html is from another build or a file is missing', async () => {
  const other = runSw({ fetchOverride: (u) => (u.endsWith('/index.html') ? new Response('<script type="module" src="v/fffffff/src/app/boot.js"></script>') : null) });
  other.store.set(`keystone:/:${HASH}`, new Map()); // production's cache of the same build
  await assert.rejects(other.install(), /index\.html is not build/);
  assert.equal(other.store.has(`keystone:/staging/:${HASH}`), false);
  assert.equal(other.store.has(`keystone:/:${HASH}`), true, 'a failed staging install leaves production alone');
  const missing = runSw({ fetchOverride: (u) => (u.endsWith('/icons/icon-512.png') ? new Response('no', { status: 404 }) : null) });
  await assert.rejects(missing.install(), /HTTP 404/);
  assert.equal(missing.store.has(`keystone:/staging/:${HASH}`), false);
});

/**
 * Independent PNG reader: chunk walk, CRC via node:zlib's crc32, inflate, filter bytes.
 * @param {Buffer} png
 */
function readPng(png) {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let off = 8;
  /** @type {Buffer[]} */
  const idat = [];
  let ihdr = null;
  const types = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.subarray(off + 4, off + 8).toString('latin1');
    const data = png.subarray(off + 8, off + 8 + len);
    assert.equal(png.readUInt32BE(off + 8 + len), zcrc32(png.subarray(off + 4, off + 8 + len)), `${type} CRC`);
    types.push(type);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
  const h = /** @type {Buffer} */ (ihdr);
  const w = h.readUInt32BE(0);
  const ht = h.readUInt32BE(4);
  assert.deepEqual([...h.subarray(8)], [8, 2, 0, 0, 0], '8-bit RGB, no interlace');
  const raw = inflateSync(Buffer.concat(idat));
  assert.equal(raw.length, ht * (1 + 3 * w));
  for (let y = 0; y < ht; y++) assert.equal(raw[y * (1 + 3 * w)], 0);
  return { w, h: ht, raw };
}

test('icons: valid PNGs of the declared sizes, committed files match the generator, deterministic', () => {
  const r1 = renderIcons();
  const r2 = renderIcons();
  const man = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (let i = 0; i < ICONS.length; i++) {
    const { file, size } = ICONS[i];
    assert.ok(r1[i].png.equals(r2[i].png), `${file} deterministic`);
    const p = readPng(r1[i].png);
    assert.equal(p.w, size);
    assert.equal(p.h, size);
    assert.ok(r1[i].png.equals(readFileSync(join(ROOT, 'icons', file))), `icons/${file} is up to date (run node scripts/gen-icons.js)`);
    assert.ok(r1[i].png.equals(readFileSync(join(DIST, 'icons', file))), `dist/icons/${file}`);
    // Corners are the background (opaque, dark), the art is bright somewhere.
    const px = (/** @type {number} */ x, /** @type {number} */ y) => [...p.raw.subarray(y * (1 + 3 * size) + 1 + 3 * x, y * (1 + 3 * size) + 4 + 3 * x)];
    const c0 = px(0, 0);
    assert.ok(c0[0] < 0x20 && c0[1] < 0x28 && c0[2] < 0x30, `${file} corner is the dark background: ${c0}`);
    let bright = 0;
    for (let y = 0; y < size; y += 4) for (let x = 0; x < size; x += 4) if (px(x, y)[2] > 0xf0) bright++;
    assert.ok(bright > 20, `${file} has line art`);
  }
  assert.equal(ICONS.find((x) => x.file === 'apple-touch-icon.png')?.size, 180);
  for (const ic of man.icons) {
    const def = ICONS.find((x) => `icons/${x.file}` === ic.src);
    assert.ok(def, ic.src);
    assert.equal(ic.sizes, `${def.size}x${def.size}`);
  }
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926, 'CRC-32 check value');
});

test('PHP: each file under 150 lines, strict types, flock + hash_equals, no client-named paths', () => {
  const php = Object.fromEntries(['lib.php', 'sync.php', 'pair.php'].map((f) => [f, readFileSync(join(ROOT, 'api', f), 'utf8')]));
  for (const [f, s] of Object.entries(php)) {
    const lines = s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
    assert.ok(lines < 150, `${f} has ${lines} lines`);
    assert.match(s, /^<\?php\n/);
    assert.match(s, /declare\(strict_types=1\);/);
    assert.doesNotMatch(s, /\$_(GET|REQUEST|COOKIE|FILES|POST)\b|\beval\(|\bunserialize\(|\bshell_exec|\bexec\(|\bsystem\(|`/, f);
    assert.doesNotMatch(s, /[^\x00-\x7f]/, `${f} ASCII`);
    // Every path is "$dir/<constant>" or the server-mapped learner file.
    for (const m of s.matchAll(/"\$dir\/([^"]*)"/g)) {
      assert.match(m[1], /^(tokens\.json|pairing\.json|ratelimit\.json|\$name\.lock)$/, `${f}: path ${m[1]}`);
    }
  }
  assert.match(php['sync.php'], /\$path = \$dir \. '\/' \. \$who\['learner'\] \. '\.jsonl';/);
  assert.match(php['sync.php'], /flock\(\$fh, LOCK_EX\)/);
  assert.match(php['lib.php'], /flock\(\$fh, LOCK_EX\)/);
  assert.match(php['lib.php'], /hash_equals\(\$k, \$h\)/);
  assert.match(php['pair.php'], /hash_equals\(\$k, 'c' \. \$code\)/);
  assert.match(php['pair.php'], /random_bytes\(16\)/);
  assert.match(php['lib.php'], /preg_match\(KE_RE_LEARNER/);
  assert.match(php['sync.php'], /require __DIR__ \. '\/lib\.php';/);
  assert.match(php['pair.php'], /require __DIR__ \. '\/lib\.php';/);
});

test('PHP <-> JS mirror: the validation patterns and limits are the same strings', () => {
  const lib = readFileSync(join(ROOT, 'api', 'lib.php'), 'utf8');
  const serve = readFileSync(join(ROOT, 'scripts', 'serve.js'), 'utf8');
  const phpRes = [...lib.matchAll(/preg_match\('\/(\^[^']*\$)\/D'/g)].map((m) => m[1]);
  for (const re of [RE_ULID, RE_TIME, RE_BUILD, RE_DEVICE]) {
    assert.ok(phpRes.includes(re.source), `lib.php has ${re.source}`);
    assert.ok(serve.includes(`/${re.source}/`), `serve.js has ${re.source}`);
  }
  const types = /const KE_TYPES = \[([^\]]*)\]/.exec(lib);
  assert.deepEqual(JSON.parse(`[${(/** @type {RegExpExecArray} */ (types))[1].replace(/'/g, '"')}]`), [...EVENT_TYPES]);
  assert.match(lib, /const KE_MAX_BODY = 262144;/);
  assert.match(lib, /const KE_MAX_EVENT = 16384;/);
  assert.match(lib, /const KE_RE_LEARNER = '\/\^\[a-z0-9\]\[a-z0-9-\]\{0,31\}\$\/D';/);
  assert.match(serve, /const RE_LEARNER = \/\^\[a-z0-9\]\[a-z0-9-\]\{0,31\}\$\/;/);
  assert.match(lib, /'ip:' \. hash\('sha256'[^\n]*60, 60, \$now/);
  assert.match(lib, /'t:' \. \$found\['hash'\], 60, 60, \$now/);
  const pair = readFileSync(join(ROOT, 'api', 'pair.php'), 'utf8');
  assert.match(pair, /const KE_CODE_TTL = 900;/);
  assert.match(pair, /ke_rate\(\$dir, \$ip, 5, KE_CODE_TTL, \$now\) \|\| !ke_rate\(\$dir, 'redeem-all', 20, KE_CODE_TTL, \$now\)/);
  assert.match(serve, /rate\(`redeem-ip:\$\{sha256\(req\.ip\)\}`, 5, CODE_TTL, now\) \|\| !rate\('redeem-all', 20, CODE_TTL, now\)/);
});

test('buildDist only ever deletes a missing, empty or previously built out directory', () => {
  const t = join(SCRATCH, 'guard');
  mkdirSync(t, { recursive: true });
  assert.throws(() => checkOut('/', ROOT), /contain the source tree/);
  assert.throws(() => checkOut(resolve(ROOT, '..'), ROOT), /contain the source tree/);
  assert.throws(() => checkOut(ROOT, ROOT), /contain the source tree/);
  checkOut(join(t, 'missing'), ROOT);
  mkdirSync(join(t, 'empty'));
  checkOut(join(t, 'empty'), ROOT);
  mkdirSync(join(t, 'theirs'));
  writeFileSync(join(t, 'theirs', 'notes.txt'), 'keep me');
  assert.throws(() => checkOut(join(t, 'theirs'), ROOT), /not made by a build/);
  assert.throws(() => buildDist({ root: ROOT, out: join(t, 'theirs'), hash: HASH }), /not made by a build/);
  assert.equal(readFileSync(join(t, 'theirs', 'notes.txt'), 'utf8'), 'keep me', 'nothing deleted');
  writeFileSync(join(t, 'afile'), 'x');
  assert.throws(() => checkOut(join(t, 'afile'), ROOT), /not a directory/);
  // A built directory carries the marker, so building again over it works.
  assert.ok(existsSync(join(DIST, DIST_MARKER)));
  assert.ok(!built.files.includes(DIST_MARKER) && !built.precache.includes(DIST_MARKER), 'the marker is neither shipped nor precached');
  checkOut(DIST, ROOT);
});
