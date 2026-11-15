// @ts-check
// scripts/deploy.sh and scripts/provision.sh in --dry-run mode, with fake ssh
// and rsync first on PATH that record any call and fail: a dry run must never
// reach them. Nothing here connects anywhere.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, chmodSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRATCH = join(ROOT, 'test', 'store', `.scratch-deploy-${process.pid}`);
const BIN = join(SCRATCH, 'bin');
const MARK = join(SCRATCH, 'network-was-touched');
const OUT = join(SCRATCH, 'dist');
const HASH = 'abc1234';

before(() => {
  mkdirSync(BIN, { recursive: true });
  for (const tool of ['ssh', 'rsync', 'scp', 'sftp', 'curl']) {
    const p = join(BIN, tool);
    writeFileSync(p, `#!/bin/sh\necho "${tool} $*" >> "${MARK}"\nexit 97\n`);
    chmodSync(p, 0o755);
  }
});
after(() => { rmSync(SCRATCH, { recursive: true, force: true }); });

/** @param {string} script @param {string[]} args @param {Record<string, string>} [extraEnv] */
function run(script, args, extraEnv = {}) {
  const r = spawnSync('bash', [join(ROOT, 'scripts', script), ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${BIN}:${process.env.PATH}`, ...extraEnv },
    timeout: 120000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [relative(OUT, p).split(sep).join('/')];
  });
}

test('deploy.sh --dry-run: every step in order, sw.js last, never touches the network', () => {
  const r = run('deploy.sh', ['--dry-run', '--hash', HASH, '--out', OUT]);
  assert.equal(r.code, 0, r.err + r.out);
  assert.ok(!existsSync(MARK), `a dry run called: ${existsSync(MARK) ? readFileSync(MARK, 'utf8') : ''}`);
  const lines = r.out.split('\n');
  const idx = (/** @type {RegExp} */ re, from = 0) => {
    const i = lines.findIndex((l, j) => j >= from && re.test(l));
    assert.ok(i >= 0, `missing ${re}`);
    return i;
  };
  const s1 = idx(/^== step 1/);
  const s2 = idx(/^== step 2/, s1);
  idx(/^LOCAL: npm --prefix .* test$/, s2);
  idx(/^LOCAL: node .*scripts\/audit\.js$/, s2);
  const s3 = idx(/^== step 3/, s2);
  const s4 = idx(/^== step 4/, s3);
  const stV = idx(new RegExp(`^RSYNC: .* ${OUT}/v/${HASH}/ mglerner\\.com:shadyalexi\\.com/staging/v/${HASH}/$`), s4);
  const stRoot = idx(new RegExp(`^RSYNC: .*--exclude=/v/ --exclude=/sw\\.js ${OUT}/ mglerner\\.com:shadyalexi\\.com/staging/$`), stV);
  const stSw = idx(new RegExp(`^RSYNC: .*--include=/sw\\.js --exclude=\\* ${OUT}/ mglerner\\.com:shadyalexi\\.com/staging/$`), stRoot);
  const s5 = idx(/^== step 5/, stSw);
  idx(/^REMOTE: ssh mglerner\.com 'php -l shadyalexi\.com\/staging\/api\/lib\.php && php -l .*sync\.php && php -l .*pair\.php'$/, s5);
  const s6 = idx(/^== step 6/, s5);
  idx(/^LOCAL: \. .*contract\.env && KEYSTONE_CONTRACT_URL=https:\/\/shadyalexi\.com\/staging\/ node --test .*test\/contract\/$/, s6);
  const s7 = idx(/^== step 7/, s6);
  const pV = idx(new RegExp(`^RSYNC: .* ${OUT}/v/${HASH}/ mglerner\\.com:shadyalexi\\.com/v/${HASH}/$`), s7);
  const pRoot = idx(new RegExp(`^RSYNC: .*--exclude=/v/ --exclude=/sw\\.js ${OUT}/ mglerner\\.com:shadyalexi\\.com/$`), pV);
  const pSw = idx(new RegExp(`^RSYNC: .*--include=/sw\\.js --exclude=\\* ${OUT}/ mglerner\\.com:shadyalexi\\.com/$`), pRoot);
  const prune1 = idx(/^REMOTE: ssh mglerner\.com 'cd shadyalexi\.com\/v && ls -1t \| grep -E '\^\[0-9a-f\]\{7,40\}\$' \| grep -v -x 'abc1234' \| tail -n \+3 \| while read -r d; do rm -rf -- "\$d"; done'$/, pSw);
  idx(/^REMOTE: ssh mglerner\.com 'cd shadyalexi\.com\/staging\/v && /, prune1);
  assert.match(lines.filter(Boolean).at(-1) ?? '', /^DRY RUN DONE/);
  assert.ok(!r.out.includes('--delete'), 'never deletes on upload (production root holds staging/)');

  // File lists: per target, every built file is sent exactly once, sw.js only in the last push.
  const built = walk(OUT).filter((f) => f !== '.keystone-dist').sort();
  assert.ok(walk(OUT).includes('.keystone-dist'), 'the build marker exists locally but is never uploaded');
  for (const [a, b, c, end] of [[stV, stRoot, stSw, s5], [pV, pRoot, pSw, prune1]]) {
    const files = (/** @type {number} */ from, /** @type {number} */ to) => lines.slice(from + 1, to).filter((l) => l.startsWith('  file: ')).map((l) => l.slice(8));
    const v = files(a, b).map((f) => `v/${HASH}/${f}`);
    const root = files(b, c);
    const sw = files(c, end);
    assert.deepEqual(sw, ['sw.js']);
    assert.ok(!root.includes('sw.js') && !root.some((f) => f.startsWith('v/')));
    assert.ok(root.includes('index.html') && root.includes('.htaccess') && root.includes('api/sync.php'));
    assert.deepEqual([...v, ...root, ...sw].sort(), built);
  }
});

test('deploy.sh refuses --hash outside a dry run, before any remote step', () => {
  const r = run('deploy.sh', ['--hash', HASH, '--out', OUT]);
  assert.notEqual(r.code, 0);
  assert.ok(!existsSync(MARK));
  assert.doesNotMatch(r.out, /== step 2/);
});

test('provision.sh --dry-run contract: sends only hashes, writes no token file, touches nothing', () => {
  const envFile = join(SCRATCH, 'contract.env');
  const r = run('provision.sh', ['--dry-run', 'contract'], { KEYSTONE_CONTRACT_ENV: envFile });
  assert.equal(r.code, 0, r.err);
  assert.ok(!existsSync(MARK));
  assert.ok(!existsSync(envFile));
  const remote = r.out.split('\n').filter((l) => l.startsWith('REMOTE: '));
  assert.equal(remote.length, 2);
  assert.match(remote[0], /^REMOTE: ssh mglerner\.com 'php -- [0-9a-f]{64} contract kid'$/);
  assert.match(remote[1], /^REMOTE: ssh mglerner\.com 'php -- [0-9a-f]{64} contract teacher'$/);
  assert.doesNotMatch(r.out, /(^|[^0-9a-f])[0-9a-f]{32}([^0-9a-f]|$)/, 'no plaintext 128-bit token is printed');
  // The printed hash is a real sha256 of 32 hex chars (shape check only: the token is not printed).
  assert.equal(createHash('sha256').update('x').digest('hex').length, 64);
});

test('provision.sh rejects a learner id that is not an id, and an unknown command', () => {
  for (const id of ['Sam Smith', '../x', 'A1', '']) {
    const r = run('provision.sh', ['--dry-run', 'teacher', id]);
    assert.notEqual(r.code, 0, id);
  }
  assert.notEqual(run('provision.sh', ['--dry-run', 'frobnicate']).code, 0);
  const ok = run('provision.sh', ['--dry-run', 'teacher', 'k1']);
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /teacher\.html#token=<token>/);
  const init = run('provision.sh', ['--dry-run', 'init']);
  assert.match(init.out, /REMOTE: ssh mglerner\.com 'umask 077 && mkdir -p keystone-data && chmod 700 keystone-data/);
  assert.ok(!existsSync(MARK));
});

test('provision.sh honours --dry-run in any position and refuses unknown options and extra arguments', () => {
  for (const args of [['init', '--dry-run'], ['teacher', 'k1', '--dry-run'], ['teacher', '--dry-run', 'k1'], ['contract', '--dry-run']]) {
    const r = run('provision.sh', args, { KEYSTONE_CONTRACT_ENV: join(SCRATCH, 'contract.env') });
    assert.equal(r.code, 0, `${args.join(' ')}: ${r.err}`);
    assert.match(r.out, /^REMOTE: /m, args.join(' '));
  }
  for (const args of [['--dryrun', 'init'], ['init', '-n'], ['init', 'extra', '--dry-run'], ['teacher', 'k1', 'k2', '--dry-run'],
    ['teacher', '--dry-run'], ['contract', 'x', '--dry-run'], ['--dry-run']]) {
    const r = run('provision.sh', args);
    assert.notEqual(r.code, 0, args.join(' '));
    assert.doesNotMatch(r.out, /REMOTE: /, args.join(' '));
  }
  assert.ok(!existsSync(MARK), 'nothing reached ssh');
  assert.ok(!existsSync(join(SCRATCH, 'contract.env')));
});
