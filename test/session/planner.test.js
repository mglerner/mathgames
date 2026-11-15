// @ts-check
// Planner simulations (DESIGN.md section 11): cold start; and, over whole
// simulated seasons for several kinds of student, the per-plan invariants.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skills } from '../../src/data/skills.js';
import { initialState } from '../../src/learner/model.js';
import { makeRng } from '../../src/gen/prng.js';
import { isDue } from '../../src/learner/scheduler.js';
import { gapPassed } from '../../src/learner/mastery.js';
import { planRun, makeContext, newSkillCap, predictedPct, DEFAULT_PLANNER_PARAMS, BASE_BY_BOX } from '../../src/session/planner.js';
import { stubRegistry } from './stubs.js';
import { simulate, accurateStudent, guesser } from './sim.js';

/** @typedef {import('../../src/session/planner.js').Plan} Plan */
/** @typedef {import('../../src/session/planner.js').PlanItem} PlanItem */

const REG = stubRegistry();
const SLICE = skills.filter((d) => d.slice);
const ROOMS = ['A', 'B', 'C', 'D'];

test('cold start: plans without error and predicts within band', () => {
  const plan = planRun({ state: initialState(), registry: REG, now: '2026-01-05T16:00:00-05:00', rng: makeRng('cold') });
  const warm = plan.items[0];
  assert.equal(warm.kind, 'warmup');
  assert.equal(skills.find((d) => d.id === warm.skill)?.pre.length, 0, 'a skill with no prerequisites');
  assert.equal(warm.difficulty, 1);
  assert.equal(warm.fadeLevel, 0, 'full visuals');
  assert.equal(warm.evidence, false);
  assert.ok(!plan.belowBand);
  assert.ok(plan.meanPredicted >= 78 && plan.meanPredicted <= 85, `mean ${plan.meanPredicted}`);
  assert.deepEqual(plan.newSkills, [warm.skill]);
  assert.equal(plan.items[plan.items.length - 1].kind, 'closer');
  assert.ok(plan.probes.length <= 2 && plan.probes.length >= 1);
  assert.equal(plan.knots, 10);
  // a slice-only registry (what M1b ships first) also cold-starts
  const slicePlan = planRun({ state: initialState(), registry: stubRegistry(SLICE), now: '2026-01-05T16:00:00-05:00', rng: makeRng('cold2') });
  assert.ok(!slicePlan.belowBand);
  assert.deepEqual(slicePlan.probes.slice().sort(), ['solve-linear', 'sqrt-product-rule']);
});

test('predicted success follows the section 6 tables', () => {
  const s = initialState();
  assert.equal(predictedPct(s, 0, 0, 1), 80, 'box 0, full visuals, d1 predicts 0.80');
  assert.equal(predictedPct(s, 2, 3, 2), 70);
  assert.equal(predictedPct(s, 4, 3, 4), 74);
  assert.equal(predictedPct(s, 4, 0, 1), 97, 'clamped');
  assert.equal(predictedPct(s, 0, 3, 4), 36);
  assert.deepEqual(BASE_BY_BOX, [50, 60, 70, 80, 88]);
  s.cells['2|3|2'] = { n: 30, k: 27 };
  assert.equal(predictedPct(s, 2, 3, 2), 90, 'their observed rate after 30 attempts');
  s.cells['2|3|1'] = { n: 29, k: 29 };
  assert.equal(predictedPct(s, 2, 3, 1), 75);
});

/**
 * All per-plan invariants. Returns counts for reporting.
 * @param {Plan} plan
 * @param {any} state
 * @param {readonly import('../../types.d.ts').SkillDef[]} graph
 */
function checkPlan(plan, state, graph) {
  const ctx = makeContext(state, REG.filter((g) => graph.some((d) => d.id === g.skill)), graph);
  const items = plan.items;
  const main = items.filter((x) => x.kind !== 'probe');
  const closer = items[items.length - 1];
  assert.equal(items[0].kind, 'warmup');
  assert.equal(closer.kind, 'closer');
  for (const x of main) assert.ok(closer.predicted >= x.predicted, `closer ${closer.predicted} < ${x.kind} ${x.predicted}`);
  assert.equal(items[0].evidence, false);
  assert.equal(closer.evidence, false);
  // warm-up: the highest predicted success among box 3+ skills (section 6)
  const high = graph.filter((d) => state.skills[d.id].seen && state.skills[d.id].box >= 3 && ctx.range(d.id));
  for (const d of high) {
    const sk = state.skills[d.id];
    const lo = /** @type {[number, number]} */ (ctx.range(d.id))[0];
    assert.ok(items[0].predicted >= predictedPct(state, sk.box, sk.fade, lo), `warm-up ${items[0].skill} ${items[0].predicted} < ${d.id}`);
  }
  for (const x of items.filter((y) => y.kind === 'boss')) assert.equal(x.fadeLevel, 3, 'a Boss Knot is symbol-only');
  // choice <= 50% for every door combination
  const combos = plan.forks.length === 0 ? [[]] : plan.forks.reduce((acc, f) => acc.flatMap((c) => f.doors.map((_, i) => [...c, i])), /** @type {number[][]} */ ([[]]));
  for (const combo of combos) {
    let xs = items.slice();
    combo.forEach((door, f) => {
      const fork = plan.forks[f];
      xs = xs.flatMap((x) => (x.room === fork.room ? [] : [x]));
      const at = items.findIndex((x) => x.room === fork.room);
      xs.splice(at, 0, ...fork.doors[door].items);
    });
    // each Why follow-up the controller will serve counts as one more choice item
    const whys = xs.filter((x) => x.whyAfter && (ctx.bySkill.get(x.skill) ?? []).some((g) => g.interactions.includes('why'))).length;
    const choice = xs.filter((x) => !x.constructed).length + whys;
    assert.ok(2 * choice <= xs.length + whys, `choice ${choice}/${xs.length + whys} (Whys counted)`);
    for (const fork of plan.forks) for (const d of fork.doors) for (const [i, x] of d.items.entries()) {
      const y = fork.doors[0].items[i];
      assert.equal(x.skill, y.skill, 'doors carry the same skills');
      assert.equal(x.evidence, y.evidence);
    }
  }
  // interleave
  if (!plan.notes.some((n) => n.startsWith('interleave relaxed'))) {
    for (let i = 0; i + 1 < ROOMS.length; i++) {
      const a = new Set(items.filter((x) => x.room === ROOMS[i] && x.kind !== 'training').map((x) => x.skill));
      const b = items.filter((x) => x.room === ROOMS[i + 1] && x.kind !== 'training').map((x) => x.skill);
      for (const s of b) assert.ok(!a.has(s), `rooms ${ROOMS[i]} and ${ROOMS[i + 1]} share ${s}`);
    }
  }
  // zones
  const seenZones = new Set(graph.filter((d) => state.skills[d.id].seen && ctx.range(d.id)).map((d) => d.zone));
  const planZones = new Set(main.map((x) => /** @type {any} */ (graph.find((d) => d.id === x.skill)).zone));
  if (seenZones.size >= 2) assert.ok(planZones.size >= 2, 'a run draws from 2 zones once 2 exist');
  // evidence items
  for (const x of items.filter((y) => y.evidence)) {
    const sk = state.skills[x.skill];
    assert.ok(x.constructed, 'evidence is constructed');
    assert.equal(x.fadeLevel, 3, 'evidence is symbol-only');
    assert.ok(sk.box >= 2, 'evidence needs box 2+');
    assert.ok(gapPassed(sk, plan.day, DEFAULT_PLANNER_PARAMS.evidenceGap), 'evidence gap');
    assert.ok(!['warmup', 'closer', 'probe', 'training'].includes(x.kind));
  }
  // probes
  assert.ok(plan.probes.length <= 2);
  for (const x of items.filter((y) => y.kind === 'probe')) {
    assert.equal(state.skills[x.skill].seen, false, 'probe on a skill they have not unlocked');
    assert.equal(x.interaction, 'strike');
    assert.equal(x.fadeLevel, 3);
    assert.equal(x.context, 'charting');
  }
  // new skills
  const cap = newSkillCap(ctx, DEFAULT_PLANNER_PARAMS);
  assert.ok(plan.newSkills.length <= Math.max(cap, items[0].kind === 'warmup' && !state.skills[items[0].skill].seen ? 1 : 0), 'new-skill cap');
  for (const id of plan.newSkills) {
    assert.equal(state.skills[id].seen, false);
    const tr = items.filter((x) => x.kind === 'training' && x.skill === id);
    assert.equal(tr.length, 3);
    assert.ok(tr[0].workedExample);
    assert.ok(tr[2].constructed, 'the burst ends on a constructed response');
    assert.ok(!tr[0].constructed && !tr[1].constructed, 'the burst\'s earlier items are choice, so its last item decides the box');
    for (const x of tr) assert.equal(x.fadeLevel, 0);
  }
  // the session's first item on a skill is constructed (Training Room skills: the burst's last)
  const firstSeen = new Set();
  const trainingSkills = new Set(plan.newSkills);
  for (const x of items) {
    if (x.kind === 'probe' || trainingSkills.has(x.skill) || firstSeen.has(x.skill)) continue;
    firstSeen.add(x.skill);
    assert.ok(x.constructed, `first item on ${x.skill} is a ${x.interaction}`);
  }
  // slice gates
  for (const x of items) {
    const def = /** @type {any} */ (graph.find((d) => d.id === x.skill));
    if (def.sliceGate && !def.pre.every((/** @type {string} */ p) => state.skills[p]?.seen && state.skills[p].box >= 1) && !state.skills[x.skill].placed) {
      assert.ok(x.difficulty <= def.sliceGate.maxDifficulty, `${x.skill} d${x.difficulty} above its slice gate`);
    }
  }
  // band
  const mean = main.reduce((t, x) => t + x.predicted, 0) / main.length;
  if (plan.belowBand) assert.ok(mean < 78);
  else assert.ok(mean >= 78, `mean ${mean}`);
  if (mean > DEFAULT_PLANNER_PARAMS.bandHigh) {
    assert.ok(plan.notes.some((n) => n.startsWith('above band')), `mean ${mean} above band without the note`);
    // and nothing adjustable could have been made harder
    for (const x of items) {
      if (['probe', 'training', 'warmup', 'closer'].includes(x.kind)) continue;
      const hi = /** @type {[number, number]} */ (ctx.range(x.skill))[1];
      const harder = x.difficulty < hi && ctx.genFor(x.skill, x.interaction, x.difficulty + 1);
      const p = predictedPct(state, state.skills[x.skill].box, x.fadeLevel, x.difficulty + 1);
      assert.ok(!harder || p >= x.predicted, `${x.skill} could have been harder`);
    }
  }
  // due skills not served and not deferred would be a bug: every due skill is in the plan or listed as deferred
  return { belowBand: plan.belowBand ? 1 : 0 };
}

for (const [name, student, n] of /** @type {[string, any, number][]} */ ([
  ['80%-accurate', accurateStudent(0.8), 25],
  ['60%-accurate', accurateStudent(0.6), 15],
  ['95%-accurate', accurateStudent(0.95), 15],
  ['80%, no prior knowledge', accurateStudent(0.8, 0), 15],
])) {
  test(`planner simulation (${name}): every plan keeps the run rules; no session ends on a miss`, () => {
    let runs = 0;
    let below = 0;
    for (let i = 0; i < n; i++) {
      let prev = initialState();
      const r = simulate({
        seed: `plan-${name}-${i}`, days: 66, student, registry: REG,
        onRun: ({ plan, run, state }) => {
          assert.ok(run.endedOnWin, 'session ended on a miss');
          checkPlan(plan, prev, skills);
          prev = state;
        },
      });
      runs += r.runs;
      below += r.belowBand;
      assert.equal(r.endedOnWin, r.runs);
    }
    assert.ok(runs > 0);
    if (name.startsWith('80%-')) assert.ok(below <= runs * 0.05, `below band in ${below} of ${runs} runs`);
  });
}

test('planner simulation: per-plan invariants hold against the state each plan was made from', () => {
  for (const [graphName, graph] of /** @type {[string, readonly import('../../types.d.ts').SkillDef[]][]} */ ([['full', skills], ['slice', SLICE]])) {
    for (let i = 0; i < 20; i++) {
      const reg = graphName === 'full' ? REG : stubRegistry(SLICE);
      // planRun is pure: re-plan from the pre-run state and compare
      let prevState = initialState(graph);
      simulate({
        seed: `inv-${graphName}-${i}`, days: 66, student: accurateStudent([0.8, 0.6, 0.95][i % 3], i % 2 ? 0.8 : 0.2), registry: reg, graph,
        onRun: ({ day, plan, state }) => {
          checkPlan(plan, prevState, graph);
          const again = planRun({ state: prevState, registry: reg, now: `${new Date(Date.UTC(2026, 0, 5) + day * 86400000).toISOString().slice(0, 10)}T15:59:00-05:00`, rng: makeRng(`inv-${graphName}-${i}:plan:${day}`), graph });
          assert.deepEqual(again, plan, 'planRun is deterministic');
          // due skills are served or deferred, never silently dropped
          const inPlan = new Set(plan.items.map((x) => x.skill));
          const deferred = plan.notes.filter((s) => s.startsWith('deferred') || s.startsWith('closer review deferred')).join(' ');
          for (const d of graph) {
            const sk = prevState.skills[d.id];
            if (isDue(sk, plan.day) && !inPlan.has(d.id)) assert.ok(deferred.includes(d.id), `due skill ${d.id} dropped silently`);
          }
          prevState = state;
        },
      });
    }
  }
});

test('run length: 10 Knots, dropping to 9 then 8 when the median of the last 3 runs exceeds 10 minutes', async () => {
  const { knotsForRun } = await import('../../src/session/planner.js');
  const { replay } = await import('../../src/learner/model.js');
  /** @param {number[]} minutes @param {number[]} knots */
  const log = (minutes, knots) => minutes.flatMap((m, i) => [
    { id: `${i}a`, v: 1, t: `2026-01-${String(5 + i).padStart(2, '0')}T16:00:00-05:00`, build: 't', device: 't', type: /** @type {const} */ ('session-start'), data: { id: `s${i}`, knots: knots[i] } },
    { id: `${i}b`, v: 1, t: `2026-01-${String(5 + i).padStart(2, '0')}T16:${String(m).padStart(2, '0')}:00-05:00`, build: 't', device: 't', type: /** @type {const} */ ('session-end'), data: {} },
  ]);
  assert.equal(knotsForRun(replay([])), 10);
  assert.equal(knotsForRun(replay(log([8, 9, 12], [10, 10, 10]))), 10, 'median 9 min');
  assert.equal(knotsForRun(replay(log([11, 12, 9], [10, 10, 10]))), 9, 'median 11 min');
  assert.equal(knotsForRun(replay(log([11, 12, 13], [10, 10, 9]))), 8);
  assert.equal(knotsForRun(replay(log([11, 12, 13], [10, 9, 8]))), 8, 'floor 8');
  assert.equal(knotsForRun(replay(log([5, 5, 5], [10, 9, 9]))), 9, 'no recovery rule in the spec: stays');
  const plan9 = planRun({ state: replay(log([11, 12, 9], [10, 10, 10])), registry: REG, now: '2026-01-09T16:00:00-05:00', rng: makeRng('k9') });
  assert.equal(plan9.knots, 9);
});
