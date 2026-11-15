// @ts-check
// Adversarial (M3 review): scripts/provision.sh only honours --dry-run as the
// FIRST argument. Anywhere else it is silently ignored and the script runs for
// real (ssh to the host; for `contract`, also overwrites the local token file).
// deploy.sh accepts its flags in any position, so the habit transfers.
// Fake ssh/openssl-free: ssh, rsync, scp, curl are replaced by recorders that fail.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const SCRATCH = join(HERE, `.scratch-provision-${process.pid}`);
const BIN = join(SCRATCH, 'bin');
const MARK = join(SCRATCH, 'network-was-touched');

before(() => {
  mkdirSync(BIN, { recursive: true });
  for (const tool of ['ssh', 'rsync', 'scp', 'sftp', 'curl']) {
    const p = join(BIN, tool);
    writeFileSync(p, `#!/bin/sh\necho "${tool} $*" >> "${MARK}"\ncat >/dev/null\nexit 97\n`);
    chmodSync(p, 0o755);
  }
});
after(() => { rmSync(SCRATCH, { recursive: true, force: true }); });

/** @param {string[]} args */
function provision(args) {
  rmSync(MARK, { force: true });
  const r = spawnSync('bash', [join(ROOT, 'scripts', 'provision.sh'), ...args], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PATH: `${BIN}:${process.env.PATH}`, KEYSTONE_SSH_HOST: 'fake.invalid',
      KEYSTONE_CONTRACT_ENV: join(SCRATCH, 'contract.env') },
  });
  return { code: r.status, out: r.stdout + r.stderr, touched: existsSync(MARK) ? readFileSync(MARK, 'utf8') : '' };
}

test('control: provision.sh --dry-run init never calls ssh', () => {
  const r = provision(['--dry-run', 'init']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.touched, '');
});

for (const args of [['init', '--dry-run'], ['teacher', 'k1', '--dry-run'], ['contract', '--dry-run']]) {
  test(`finding 6: provision.sh ${args.join(' ')} ignores --dry-run and calls ssh`, () => {
    const r = provision(args);
    assert.equal(r.touched, '', `ssh was called: ${r.touched.trim()} (exit ${r.code})`);
  });
}
