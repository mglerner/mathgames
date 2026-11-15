// @ts-check
// The realistic-learner simulation (M2 follow-up). NOT a gate: it asserts
// only that the learner model behaves as described and that the simulation is
// deterministic and self-consistent. The outcome ("how far do they get in 10
// weeks?") is REPORTED as diagnostics, because it rests on guessed learner
// parameters (sim.js REALISTIC); see realistic-report.js for sensitivity runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skills } from '../../src/data/skills.js';
import { makeRng } from '../../src/gen/prng.js';
import { stubRegistry } from './stubs.js';
import { realisticStudent, weekdaysWithMisses, REALISTIC } from './sim.js';
import { realisticRun, reportLines, sensitivity, sensitivityLines, PAIN_POINTS, CAVEAT, VARIANTS } from './realistic-report.js';

/** @typedef {import('../../src/session/planner.js').PlanItem} PlanItem */

const REG = stubRegistry();

/** @param {string} skill @param {'strike' | 'twin'} interaction @param {0 | 1 | 2 | 3} fade */
function problemFor(skill, interaction, fade) {
  const g = REG.find((x) => x.skill === skill && x.interactions.includes(interaction));
  if (!g) throw new Error(`no stub for ${skill}`);
  return g.generate(makeRng('p'), { difficulty: 2, interaction, fadeLevel: fade });
}
const ITEM = /** @type {PlanItem} */ (/** @type {unknown} */ ({ kind: 'practice' }));
const PROBE = /** @type {PlanItem} */ (/** @type {unknown} */ ({ kind: 'probe' }));

test('realistic learner: a never-taught skill is right about 25% of the time, symbol-only', () => {
  let n = 0; let k = 0;
  for (let i = 0; i < 150; i++) {
    const st = realisticStudent(`m${i}`);
    const rng = makeRng(`m${i}:r`);
    for (const d of skills) { n++; if (st(problemFor(d.id, 'strike', 3), PROBE, rng, 0).verdict === 'correct') k++; }
  }
  const rate = k / n;
  assert.ok(rate > 0.22 && rate < 0.28, `never-taught symbol-only rate ${rate}`);
  // the per-skill starting level stays inside pStart +- pSpread
  const st = realisticStudent('range');
  for (const d of skills) {
    const p = st.pSymbolic(d.id, 0);
    assert.ok(p >= REALISTIC.pStart - REALISTIC.pSpread - 1e-9 && p <= REALISTIC.pStart + REALISTIC.pSpread + 1e-9, `${d.id} ${p}`);
  }
});

test('realistic learner: practice raises a skill toward the ceiling; neglect loses it; spaced practice holds longer', () => {
  const st = realisticStudent('learn');
  const rng = makeRng('learn:r');
  const id = 'distribute';
  const p0 = st.pSymbolic(id, 0);
  let prev = p0;
  for (let day = 0; day < 6; day++) {
    for (let j = 0; j < 3; j++) st(problemFor(id, 'strike', 3), ITEM, rng, day);
    const p = st.pSymbolic(id, day);
    assert.ok(p > prev, 'each day of practice helps');
    prev = p;
  }
  assert.ok(prev > 0.75 && prev <= REALISTIC.pCeil + 1e-9, `18 items over 6 days: ${prev}`);
  assert.ok(st.pSymbolic(id, 5 + 8) === prev, 'no loss inside the stability window');
  const later = st.pSymbolic(id, 5 + 200);
  assert.ok(later < prev && later >= p0 - 1e-9, `long neglect decays toward the start: ${later}`);
  // crammed: the same 18 items in one day are forgotten sooner
  const cram = realisticStudent('learn');
  for (let j = 0; j < 18; j++) cram(problemFor(id, 'strike', 3), ITEM, makeRng('c'), 0);
  assert.ok(cram.pSymbolic(id, 20) < st.pSymbolic(id, 5 + 20), 'spacing lengthens retention');
});

test('realistic learner: visuals and choice items are easier than a symbol-only constructed response', () => {
  /** @param {'strike' | 'twin'} interaction @param {0 | 3} fade */
  const rate = (interaction, fade) => {
    let k = 0;
    for (let i = 0; i < 4000; i++) {
      const st = realisticStudent(`v${i}`);
      if (st(problemFor('distribute', interaction, fade), ITEM, makeRng(`v${i}:r`), 0).verdict === 'correct') k++;
    }
    return k / 4000;
  };
  const sym = rate('strike', 3); const vis = rate('strike', 0); const twin = rate('twin', 0);
  assert.ok(vis > sym + 0.15, `full visuals ${vis} vs symbol-only ${sym}`);
  assert.ok(twin > vis + 0.1, `a 2-way choice ${twin} vs constructed ${vis}`);
});

test('realistic learner: the pessimistic knobs each lower what they learn or how much support helps; defaults leave the model as it was', () => {
  const id = 'distribute';
  /** Latent level after 6 items, alternating choice and constructed. @param {object} params */
  const after = (params) => {
    const st = realisticStudent('knob', params);
    const rng = makeRng('knob:r');
    for (let j = 0; j < 6; j++) st(problemFor(id, j % 2 ? 'strike' : 'twin', 3), ITEM, rng, 0);
    return st.knowledge(id, 0);
  };
  const base = after({});
  assert.equal(after({ supportScale: 1, choiceLearns: 1, wrongLearns: 1, prereqDrag: 0 }), base, 'defaults are the neutral values');
  assert.ok(Math.abs(base - (1 - 0.8 ** 6)) < 1e-12, `6 items at learnRate 0.2: ${base}`);
  assert.ok(Math.abs(after({ choiceLearns: 0.5 }) - (1 - 0.8 ** 3 * 0.9 ** 3)) < 1e-12, 'a choice item teaches half');
  assert.ok(Math.abs(after({ choiceLearns: 0 }) - (1 - 0.8 ** 3)) < 1e-12, 'choiceLearns 0: only the 3 constructed items teach');
  assert.ok(after({ wrongLearns: 0.5 }) < base, 'wrong answers teach less');
  assert.ok(after({ wrongLearns: 0 }) < after({ wrongLearns: 0.5 }));
  // supportScale: full visuals plus a worked example are worth 35 points at 1, 17.5 at 0.5, 0 at 0
  /** @param {number} scale */
  const rate = (scale) => {
    let k = 0;
    const worked = /** @type {PlanItem} */ (/** @type {unknown} */ ({ kind: 'practice', workedExample: true }));
    for (let i = 0; i < 4000; i++) {
      const st = realisticStudent(`s${i}`, { supportScale: scale });
      if (st(problemFor(id, 'strike', 0), worked, makeRng(`s${i}:r`), 0).verdict === 'correct') k++;
    }
    return k / 4000;
  };
  const r1 = rate(1); const rh = rate(0.5); const r0 = rate(0);
  assert.ok(Math.abs(r1 - 0.60) < 0.04 && Math.abs(rh - 0.425) < 0.04 && Math.abs(r0 - 0.25) < 0.04, `support at 1 / 0.5 / 0: ${r1} / ${rh} / ${r0}`);
  // prereqDrag: a skill practiced without its prerequisites is capped
  const d = skills.find((x) => x.pre.length > 0);
  assert.ok(d);
  /** @param {number} drag */
  const lone = (drag) => {
    const st = realisticStudent('drag', { prereqDrag: drag });
    for (let j = 0; j < 12; j++) st(problemFor(d.id, 'strike', 3), ITEM, makeRng('d'), 0);
    return st.pSymbolic(d.id, 0);
  };
  const p0 = realisticStudent('drag').pSymbolic(d.id, 0);
  assert.ok(lone(0) > 0.7, `no drag: ${lone(0)}`);
  assert.ok(lone(0.5) < lone(0) && lone(0.5) > p0, `drag 0.5: ${lone(0.5)}`);
  assert.ok(Math.abs(lone(1) - p0) < 1e-12, 'drag 1 with untaught prerequisites: nothing usable');
});

test('sensitivity table: every variant runs, the baseline row equals the plain report, the caveat and range are printed', () => {
  const table = sensitivity(12);
  assert.equal(table.length, VARIANTS.length);
  const rows = realisticRun({ n: 12 });
  assert.equal(table[0].group, 'baseline');
  assert.equal(table[0].gate, rows.filter((r) => r.ep >= 100).length / 12);
  for (const r of table) assert.ok(r.medianEP >= 0 && r.medianEP <= 120 && r.gate >= 0 && r.gate <= 1 && r.runs >= 20);
  const less = table.find((r) => r.label === 'sessions -10%'); const more = table.find((r) => r.label === 'sessions +10%');
  assert.ok(less && more && less.runs < table[0].runs && table[0].runs < more.runs, 'the attendance rows move the session count both ways');
  const lines = sensitivityLines(table);
  assert.equal(lines[0], CAVEAT);
  assert.ok(lines.some((l) => l.startsWith('range, baseline and the pessimistic rows')));
});

test('attendance: weekdays only, about 15% of them missed, day 0 always played', () => {
  let played = 0; let weekdays = 0;
  for (let i = 0; i < 200; i++) {
    const f = weekdaysWithMisses(`a${i}`, 0.15, 66);
    assert.equal(f(0), true);
    for (let d = 0; d < 66; d++) {
      if (d % 7 >= 5) assert.equal(f(d), false, 'no weekend sessions');
      else { weekdays++; if (f(d)) played++; }
    }
  }
  const share = played / weekdays;
  assert.ok(share > 0.82 && share < 0.88, `share of weekdays played ${share}`);
});

test('realistic timeline: 300 students, 66 days (REPORT, not a gate)', (t) => {
  const rows = realisticRun({ n: 300 });
  t.diagnostic('REALISTIC-LEARNER SIMULATION. Learner parameters are guesses, generators are stubs; this is an estimate, not a promise.');
  t.diagnostic(CAVEAT);
  t.diagnostic('For the range, run: node test/session/realistic-report.js sensitivity 300');
  for (const l of reportLines(rows)) t.diagnostic(l);
  // self-consistency only
  for (const r of rows) {
    assert.ok(r.ep >= 0 && r.ep <= 120);
    assert.ok(r.mastered <= r.ep3 && r.ep3 <= r.box2 + 40 && r.box2 <= r.seen && r.seen <= 40);
    assert.ok(r.ep >= 3 * r.ep3);
    assert.ok(r.runs >= 20 && r.runs <= 48, `runs ${r.runs}`);
    for (const id of PAIN_POINTS) {
      const seen = r.firstSeen[id]; const first = r.firstEvidence[id];
      if (first !== null) assert.ok(seen !== undefined && seen !== null && seen <= first, 'evidence only after the skill is unlocked');
    }
  }
  const probes = rows.reduce((a, r) => a + r.probes, 0);
  const hits = rows.reduce((a, r) => a + r.probeHits, 0);
  assert.ok(hits / probes > 0.15 && hits / probes < 0.35, `most Charting probes miss: hit rate ${hits / probes}`);
  // deterministic: the same seeds give the same season
  const again = realisticRun({ n: 3 });
  assert.deepEqual(again.map((r) => [r.ep, r.mastered, r.balancePlanned]), rows.slice(0, 3).map((r) => [r.ep, r.mastered, r.balancePlanned]));
});
