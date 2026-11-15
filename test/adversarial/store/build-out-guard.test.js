// @ts-check
// Adversarial (M3 review): buildDist() (deploy.sh step 3, which also runs in
// --dry-run) does rmSync(out, {recursive, force}). Its only guard is
// "out is not the repo and does not contain the repo". out = '/' slips past it,
// because '/' + sep is '//', which no path starts with. So
//   scripts/deploy.sh --dry-run --out "$BUILD/"     (BUILD unset)
// would run rm -rf /. rmSync is stubbed here: nothing is deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { buildDist } from '../../../scripts/gen-sw.js';

const require = createRequire(import.meta.url);
const fs = require('node:fs');

/** Run buildDist with rmSync replaced; returns the paths it tried to delete. @param {string} out */
function attemptedRemovals(out) {
  const real = fs.rmSync;
  /** @type {string[]} */
  const calls = [];
  fs.rmSync = (/** @type {string} */ p) => { calls.push(String(p)); throw new Error('STUBBED rmSync'); };
  syncBuiltinESMExports();
  try {
    try { buildDist({ out, hash: 'abc1234' }); } catch (err) { if (!/STUBBED|out would contain/.test(String(err))) throw err; }
  } finally { fs.rmSync = real; syncBuiltinESMExports(); }
  return calls;
}

test('control: the guard refuses an --out that contains the repo (e.g. the home directory)', () => {
  assert.deepEqual(attemptedRemovals('/Users'), []);
});

test('finding 4: --out / is not refused; buildDist calls rm -rf on /', () => {
  // Safety first: prove the stub intercepts before ever passing '/'.
  const probe = new URL('./.scratch-guard-never-created', import.meta.url).pathname;
  const seen = attemptedRemovals(probe);
  if (seen.length !== 1 || seen[0] !== probe) throw new Error('rmSync stub not effective; refusing to try "/"');
  const calls = attemptedRemovals('/');
  assert.deepEqual(calls, [], `buildDist tried rmSync(${JSON.stringify(calls)}, {recursive: true, force: true})`);
});
