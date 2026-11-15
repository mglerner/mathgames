// @ts-check
// Timeline simulation, the M2 gate (DESIGN.md section 11): an 80%-accurate
// student playing 5 days a week, with all content available, reaches the
// Gate (100 EP) by day 65, the Balance Warden by day 21, and first evidence
// on sqrt-product-rule and quadratic-formula by day 35.
//
// "80%-accurate" is read literally: every first try, including Charting
// probes on skills they have not been taught, is right with probability 0.8.
// "Reaches the Balance Warden" = the first day a plan schedules it.
// Pass criterion: each target met by at least 95% of 200 simulated students.
// MARGIN (adversarial review, m2tune): Gate-by-65 and the two evidence
// targets have room, but Balance-Warden-by-21 sits at 95-97% across
// independent seeds and registries (one 500-student set was exactly 475/500).
// After ANY planner or controller change, also rerun
// test/adversarial/learner-tune/invariants.test.js (independent gate).
// DO NOT weaken this test to make it pass; tune in the spec's order
// (new-skills cap, evidence gap, Gate threshold) and report.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubRegistry } from './stubs.js';
import { simulate, accurateStudent } from './sim.js';

const N = 200;
const REQUIRED = 0.95;

/** @param {(number | null)[]} xs */
function dist(xs) {
  const s = xs.map((x) => (x === null ? Infinity : x)).sort((a, b) => a - b);
  /** @param {number} f */
  const at = (f) => s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))];
  return `min ${at(0)} p10 ${at(0.1)} median ${at(0.5)} p90 ${at(0.9)} max ${at(1)} (Infinity = never)`;
}

test('timeline: 80%-accurate student, 5 days a week, all content (200 students)', (t) => {
  const reg = stubRegistry();
  const res = [];
  for (let i = 0; i < N; i++) {
    res.push(simulate({ seed: `timeline${i}`, days: 66, student: accurateStudent(0.8), registry: reg, watch: ['sqrt-product-rule', 'quadratic-formula'] }));
  }
  const gate = res.map((r) => r.gateDay);
  const bal = res.map((r) => r.balancePlannedDay);
  const spr = res.map((r) => r.firstEvidence['sqrt-product-rule']);
  const qf = res.map((r) => r.firstEvidence['quadratic-formula']);
  /** @param {(number | null)[]} xs @param {number} by */
  const frac = (xs, by) => xs.filter((x) => x !== null && x <= by).length / xs.length;
  const lines = [
    `Gate (100 EP) day: ${dist(gate)}; by day 65: ${frac(gate, 65)}`,
    `EP on day 65: ${dist(res.map((r) => r.epByDay[65]))}`,
    `Balance Warden first planned: ${dist(bal)}; by day 21: ${frac(bal, 21)}`,
    `sqrt-product-rule first evidence: ${dist(spr)}; by day 35: ${frac(spr, 35)}`,
    `quadratic-formula first evidence: ${dist(qf)}; by day 35: ${frac(qf, 35)}`,
    `all four targets: ${res.filter((r, i) => (gate[i] ?? 99) <= 65 && (bal[i] ?? 99) <= 21 && (spr[i] ?? 99) <= 35 && (qf[i] ?? 99) <= 35).length / N}`,
  ];
  for (const l of lines) t.diagnostic(l);
  const fails = [];
  if (frac(gate, 65) < REQUIRED) fails.push('Gate by day 65');
  if (frac(bal, 21) < REQUIRED) fails.push('Balance Warden by day 21');
  if (frac(spr, 35) < REQUIRED) fails.push('sqrt-product-rule evidence by day 35');
  if (frac(qf, 35) < REQUIRED) fails.push('quadratic-formula evidence by day 35');
  assert.deepEqual(fails, [], `timeline targets missed by more than ${100 * (1 - REQUIRED)}% of students:\n${lines.join('\n')}`);
});
