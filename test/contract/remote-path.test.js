// @ts-check
// Exercises the contract suite's REMOTE code path (the one deploy step 6 runs
// against staging) end to end, against the mock behind a fake fetch
// (fake-remote.js), on the real clock with the suite's real pacing. Opt-in,
// because the pacing makes it take about a minute:
//   KEYSTONE_CONTRACT_SELFTEST=1 node --test test/contract/remote-path.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const HERE = import.meta.dirname;
const ROOT = join(HERE, '..', '..');

test('the contract suite passes in remote mode against the mock behind fetch', {
  skip: process.env.KEYSTONE_CONTRACT_SELFTEST !== '1' && 'opt-in: set KEYSTONE_CONTRACT_SELFTEST=1 (takes about a minute)',
  timeout: 600000,
}, () => {
  const dist = join(HERE, `.scratch-remote-${process.pid}`);
  try {
    const env = { ...process.env, KEYSTONE_FAKE_DIST: dist };
    delete env.KEYSTONE_CONTRACT_URL;
    delete env.NODE_TEST_CONTEXT; // else the nested runner talks the parent runner protocol, not TAP
    const r = spawnSync(process.execPath, ['--import', join(HERE, 'fake-remote.js'), '--test', '--test-reporter=tap',
      join(HERE, 'api.test.js')], { cwd: ROOT, env, encoding: 'utf8', timeout: 590000 });
    const tap = r.stdout;
    const num = (/** @type {string} */ k) => Number((new RegExp(`^# ${k} (\\d+)`, 'm').exec(tap) ?? [])[1]);
    assert.equal(r.status, 0, tap.slice(-4000) + r.stderr);
    assert.equal(num('fail'), 0);
    assert.equal(num('pass'), 13);
    // Exactly the mock-only tests are skipped in remote mode.
    assert.equal(num('skipped'), 6, tap.split('\n').filter((l) => /# SKIP/.test(l)).join('\n'));
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
