// @ts-check
// The four scheduling rules added after the timeline diagnosis (see the header
// of src/session/planner.js): a reserved Training Room, Warden focus,
// relative lateness, and Training Rooms in Room C. Each test builds a learner
// state by hand and compares the plan with the rule on and off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skills } from '../../src/data/skills.js';
import { initialState } from '../../src/learner/model.js';
import { makeRng } from '../../src/gen/prng.js';
import { dayOf } from '../../src/learner/scheduler.js';
import { planRun, focusCluster } from '../../src/session/planner.js';
import { stubRegistry } from './stubs.js';

/** @typedef {import('../../src/learner/model.js').LearnerState} LearnerState */

const REG = stubRegistry();
const NOW = '2026-03-02T16:00:00-05:00';
const T = dayOf(NOW);
const BALANCE = skills.filter((d) => d.cluster === 'balance').map((d) => d.id);

/**
 * Evidence days, the last one `ago` days back, complete for mastery when k = 3.
 * @param {number} k @param {number} [ago]
 */
function ev(k, ago = 10) {
  return Array.from({ length: k }, (_, i) => ({ day: T - ago - 2 * (k - 1 - i), context: /** @type {const} */ ('mixed'), interaction: /** @type {const} */ ('strike') }));
}

/**
 * @param {LearnerState} s @param {string} id
 * @param {{ box: number; ago: number; ep?: number; evAgo?: number }} o `ago` = days since the last review
 */
function put(s, id, o) {
  Object.assign(s.skills[id], {
    seen: true, box: o.box, fade: Math.min(3, o.box), unlockDay: T - 30, lastReviewDay: T - o.ago,
    evidence: ev(o.ep ?? 0, o.evAgo), countingWhy: true,
  });
}

/** @param {LearnerState} state @param {object} [params] */
function plan(state, params) {
  return planRun({ state, registry: REG, now: NOW, rng: makeRng('sched'), params });
}

/** A state with every slice skill but solve-linear long overdue and wanting evidence. */
function backlogState() {
  const s = initialState();
  for (const d of skills.filter((x) => x.slice && x.id !== 'solve-linear')) put(s, d.id, { box: 3, ago: 10 });
  return s;
}

test('a new skill gets its Training Room although the due list could fill the run', () => {
  const s = backlogState();
  const on = plan(s);
  assert.equal(on.newSkills.length, 1, 'exactly one reserved Training Room');
  const training = on.items.filter((x) => x.kind === 'training');
  assert.equal(training.length, 3);
  assert.ok(training.every((x) => x.skill === on.newSkills[0]));
  assert.ok(training[training.length - 1].constructed, 'the burst ends on a constructed response');
  assert.ok(on.notes.some((n) => n.startsWith('deferred:')), 'the due list really was longer than the run');
  const off = plan(s, { reserveTraining: 0 });
  assert.deepEqual(off.newSkills, [], 'the old rule: no room left over, so nothing new');
});

test('reserveTraining never exceeds the new-skill cap, and newSkillBacklogMax can withhold the room', () => {
  const s = backlogState();
  assert.equal(plan(s, { reserveTraining: 2 }).newSkills.length, 1, 'cold-start cap is 1');
  assert.equal(plan(s, { reserveTraining: 2, newSkillBase: 0 }).newSkills.length, 0, 'cap 0: nothing new');
  assert.deepEqual(plan(s, { newSkillBacklogMax: 5 }).newSkills, [], '11 skills due > 5');
  assert.equal(plan(s, { newSkillBacklogMax: 50 }).newSkills.length, 1);
});

test('Training Rooms go to Room C first', () => {
  const on = plan(backlogState());
  assert.deepEqual([...new Set(on.items.filter((x) => x.kind === 'training').map((x) => x.room))], ['C']);
  // and the rooms before it hold the most urgent work
  assert.ok(on.items.filter((x) => x.room === 'A').every((x) => x.kind === 'evidence' || x.kind === 'due'));
});

test('focusCluster follows section 8 order and skips eligible Wardens', () => {
  const s = initialState();
  assert.equal(focusCluster(s, skills), 'balance');
  for (const id of BALANCE) put(s, id, { box: 3, ago: 1, ep: 2 });
  assert.equal(focusCluster(s, skills), 'mint');
  for (const d of skills.filter((x) => x.cluster !== 'none')) put(s, d.id, { box: 3, ago: 1, ep: 2 });
  assert.equal(focusCluster(s, skills), undefined);
  assert.equal(focusCluster(initialState(), skills.filter((d) => d.cluster === 'root')), 'root', 'a partial graph');
});

/**
 * 14 non-balance skills at box 4, far overdue and still wanting evidence;
 * the balance cluster at 2 evidence days each, except as the caller sets.
 */
function crowdedState() {
  const s = initialState();
  const others = skills.filter((d) => d.cluster !== 'balance' && d.cluster !== 'none').slice(0, 14);
  for (const d of others) put(s, d.id, { box: 4, ago: 20, ep: 1, evAgo: 20 });
  for (const id of BALANCE) put(s, id, { box: 4, ago: 1, ep: 2, evAgo: 1 });
  return s;
}

test('Warden focus: a due box-1 skill of the focus cluster is served ahead of a long overdue list', () => {
  const s = crowdedState();
  put(s, 'distribute', { box: 1, ago: 1 }); // due today, no evidence yet
  assert.equal(focusCluster(s, skills), 'balance');
  const on = plan(s);
  const mine = on.items.filter((x) => x.skill === 'distribute');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].kind, 'due');
  assert.equal(mine[0].evidence, false, 'box 1 cannot take an evidence item');
  assert.ok(mine[0].constructed, 'a constructed response, so the box can move');
  const off = plan(s, { wardenFocus: false, overdueOrder: 'absolute' });
  assert.equal(off.items.filter((x) => x.skill === 'distribute').length, 0, 'without focus it is deferred');
  assert.ok(off.notes.some((n) => n.startsWith('deferred:') && n.includes('distribute')));
});

test('Warden focus: an evidence item ahead of the due date once the 2-day gap has passed, never inside it', () => {
  const s = crowdedState();
  put(s, 'balance-moves', { box: 3, ago: 2, ep: 1, evAgo: 2 }); // not due (4-day interval); gap passed
  const on = plan(s);
  const mine = on.items.filter((x) => x.skill === 'balance-moves');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].kind, 'evidence');
  assert.ok(mine[0].evidence && mine[0].constructed && mine[0].fadeLevel === 3, 'symbol-only constructed response');
  assert.equal(plan(s, { wardenFocus: false }).items.filter((x) => x.skill === 'balance-moves' && x.evidence).length, 0);
  put(s, 'balance-moves', { box: 3, ago: 1, ep: 1, evAgo: 1 }); // gap not passed
  assert.equal(plan(s).items.filter((x) => x.skill === 'balance-moves' && x.evidence).length, 0, 'the evidence gap is never relaxed');
});

test('Warden focus leaves a skill alone once it has its 2 evidence days', () => {
  const s = crowdedState();
  put(s, 'distribute', { box: 3, ago: 2, ep: 2, evAgo: 2 }); // could take a third, but eligibility needs 2
  assert.equal(focusCluster(s, skills), 'mint', 'balance is eligible; focus has moved on');
  assert.equal(plan(s).items.filter((x) => x.skill === 'distribute' && x.kind === 'evidence').length, 0);
});

test('most overdue first is measured against the interval: box 1 one day late beats box 4 three days late', () => {
  const s = initialState();
  const done = skills.filter((d) => d.cluster !== 'balance' && d.cluster !== 'none' && d.id !== 'frac-times-whole').slice(0, 12);
  for (const d of done) put(s, d.id, { box: 4, ago: 11, ep: 3 }); // 3 days past an 8-day interval; evidence complete
  put(s, 'frac-times-whole', { box: 1, ago: 2 }); // 1 day past a 1-day interval
  const rel = plan(s, { wardenFocus: false, reserveTraining: 0 });
  assert.equal(rel.items.filter((x) => x.skill === 'frac-times-whole' && x.kind === 'due').length, 1);
  const abs = plan(s, { wardenFocus: false, reserveTraining: 0, overdueOrder: 'absolute' });
  assert.equal(abs.items.filter((x) => x.skill === 'frac-times-whole').length, 0);
  assert.ok(abs.notes.some((n) => n.startsWith('deferred:') && n.includes('frac-times-whole')));
});

test('no item of a new skill is planned before its worked example (the first-run warm-up aside); at most the cap is taught', async () => {
  const { simulate, accurateStudent, realisticStudent, weekdaysWithMisses } = await import('./sim.js');
  let plans = 0; let withNew = 0;
  for (let i = 0; i < 24; i++) {
    const seed = `order${i}`;
    const student = i % 2 ? accurateStudent(0.8) : realisticStudent(seed);
    const r = simulate({ seed, days: 66, student, registry: REG, playDay: weekdaysWithMisses(seed, 0.15, 66) });
    for (const pl of r.plans) {
      plans++;
      assert.ok(pl.newSkills.length <= 2);
      if (pl.newSkills.length) withNew++;
      for (const id of pl.newSkills) {
        const at = pl.items.findIndex((x) => x.skill === id && x.workedExample);
        assert.ok(at >= 0, `${id} has a worked example`);
        const before = pl.items.slice(0, at).filter((x) => x.skill === id);
        assert.ok(before.every((x) => x.kind === 'warmup' && plans > 0 && pl === r.plans[0]), `${seed} day ${pl.day}: ${id} served before its worked example`);
        assert.equal(pl.items.filter((x) => x.skill === id && x.kind === 'training').length, 3);
      }
    }
  }
  assert.ok(withNew > 200, `new skills were actually introduced (${withNew} of ${plans} plans)`);
});
