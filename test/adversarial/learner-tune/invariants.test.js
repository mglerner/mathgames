// Adversarial regression tests for the M2 tuning change (planner rules 1-4).
// They drive the planner/controller/reducer with an independent simulator
// (./xsim.js: own PRNG, students, registry option and event writer) and check
// the section 6 rules on every run as served:
//   - boxes move only on constructed responses, at most one box per session
//   - evidence only from a correct, constructed, symbol-only evidence item at box >= 2
//   - evidence days at least 2 apart, at most 3 per skill
//   - choice items never more than 50% of a run as served
//   - new skills within the section 6 cap (recomputed independently),
//     prerequisites at box >= 1, first item a worked example
// plus an independent reproduction of the section 11 timeline gate on seeds
// the builder's test does not use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xsim, accurate, realistic, attendance, by } from './xsim.js';

test('checker self-test: a planner forced past the new-skill cap is caught', () => {
  const r = xsim({ seed: 'self', student: accurate(0.8), registry: 'stubs', days: 10, params: { newSkillBase: 2, newSkillHigh: 3, reserveTraining: 3, newRateMin: 0 } });
  assert.ok(r.violations.some((v) => /spec cap/.test(v)), 'checker did not flag an over-cap plan');
});

for (const registry of ['stubs', 'own']) {
  test(`section 6 invariants hold for 40 80%-accurate students (${registry} registry)`, () => {
    const bad = [];
    for (let i = 0; i < 40; i++) {
      const r = xsim({ seed: `inv-${registry}-${i}`, student: accurate(0.8), registry });
      bad.push(...r.violations.map((v) => `${i} ${v}`));
    }
    assert.deepEqual(bad.slice(0, 10), []);
  });
  test(`section 6 invariants hold for 40 realistic learners, 15% weekdays missed (${registry} registry)`, () => {
    const bad = [];
    for (let i = 0; i < 40; i++) {
      const seed = `invr-${registry}-${i}`;
      const r = xsim({ seed, student: realistic(seed, { choiceLearns: 0.5, supportScale: 0.5 }), registry, playDay: attendance(seed, 0.15) });
      bad.push(...r.violations.map((v) => `${i} ${v}`));
    }
    assert.deepEqual(bad.slice(0, 10), []);
  });
}

test('independent timeline gate: 500 80%-accurate students on fresh seeds meet each target at >= 95%', (t) => {
  const rs = [];
  for (let i = 0; i < 500; i++) rs.push(xsim({ seed: `ltA${i}`, student: accurate(0.8), registry: 'stubs', check: false }));
  const gate = by(rs.map((r) => r.gate), 65);
  const bal = by(rs.map((r) => r.balPlanned), 21);
  const spr = by(rs.map((r) => r.firstEv['sqrt-product-rule']), 35);
  const qf = by(rs.map((r) => r.firstEv['quadratic-formula']), 35);
  t.diagnostic(`gate ${gate} warden ${bal} spr ${spr} qf ${qf}`);
  for (const [k, v] of Object.entries({ gate, bal, spr, qf })) assert.ok(v >= 0.95, `${k} ${v}`);
});
