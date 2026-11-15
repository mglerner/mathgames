// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../../src/gen/prng.js';
import { replay } from '../../src/learner/model.js';
import { planRun } from '../../src/session/planner.js';
import { startRun, nextItem, recordAttempt, chooseDoor, MAX_ECHOES } from '../../src/session/controller.js';
import { stubRegistry } from './stubs.js';
import { simulate, accurateStudent, toAttempt } from './sim.js';

/** @typedef {import('../../src/session/planner.js').PlanItem} PlanItem */

const REG = stubRegistry();
const GEN = new Map(REG.map((g) => [g.id, g]));

/** A mid-season state: 12 days of an 80% student. */
function midState() {
  const r = simulate({ seed: 'ctl', days: 12, student: accurateStudent(0.8), registry: REG });
  return r.state;
}

/**
 * Play a run with a scripted verdict function.
 * @param {any} state
 * @param {(item: PlanItem, i: number) => import('../../types.d.ts').Attempt['verdict']} verdictOf
 * @param {number} [ms]
 */
function play(state, verdictOf, ms = 8000) {
  const plan = planRun({ state, registry: REG, now: '2026-01-21T16:00:00-05:00', rng: makeRng('ctl-plan') });
  let run = startRun(plan, { state, registry: REG, rng: makeRng('ctl-run') });
  /** @type {PlanItem[]} */
  const served = [];
  let item;
  let i = 0;
  while ((item = nextItem(run))) {
    const p = /** @type {any} */ (GEN.get(item.gen)).generate(makeRng(item.seed), { difficulty: item.difficulty, interaction: item.interaction, fadeLevel: item.fadeLevel });
    served.push(item);
    run = recordAttempt(run, toAttempt(p, item, { verdict: item.kind === 'probe' ? 'wrong' : verdictOf(item, i++), ms }));
    assert.ok(served.length < 400);
  }
  return { plan, run, served };
}

test('all correct: the plan is served as planned, plus one Why per marked item', () => {
  const st = midState();
  const { plan, served, run } = play(st, () => 'correct');
  const whys = served.filter((x) => x.kind === 'why');
  assert.equal(whys.length, plan.items.filter((x) => x.whyAfter).length);
  assert.ok(whys.every((w) => !w.evidence && !w.constructed && w.interaction === 'why'));
  assert.deepEqual(served.filter((x) => x.kind !== 'why').map((x) => x.seed), plan.items.map((x) => x.seed));
  assert.ok(run.endedOnWin);
  assert.ok(run.fired.high || plan.items.filter((x) => x.kind !== 'probe').length < 6, 'all-correct fires the harder-room trigger');
});

test('misses queue at most 3 Echoes, each a fresh sibling at the start of the next room, never for probes', () => {
  const st = midState();
  const { served } = play(st, (x) => (x.kind === 'echo' || x.kind === 'closer' ? 'correct' : 'wrong'));
  const echoes = served.filter((x) => x.kind === 'echo');
  assert.equal(echoes.length, MAX_ECHOES);
  const seeds = new Set(served.map((x) => x.seed));
  assert.equal(seeds.size, served.length, 'the same item is never repeated');
  for (const e of echoes) {
    assert.equal(e.context, 'echo');
    assert.equal(e.evidence, false);
  }
});

test('the closer repeats, easier each time, until one is won; the run never ends on a miss', () => {
  const st = midState();
  let closerMisses = 0;
  const { served, run } = play(st, (x) => {
    if (x.kind !== 'closer') return 'correct';
    return closerMisses++ < 5 ? 'wrong' : 'correct';
  });
  const closers = served.filter((x) => x.kind === 'closer');
  assert.equal(closers.length, 6);
  assert.ok(run.endedOnWin);
  assert.equal(served[served.length - 1].kind, 'closer');
  for (let i = 1; i < closers.length; i++) {
    const a = closers[i - 1]; const b = closers[i];
    const easier = b.difficulty < a.difficulty || b.fadeLevel < a.fadeLevel || (a.constructed && !b.constructed) || (b.difficulty === a.difficulty && b.fadeLevel === 0 && !b.constructed);
    assert.ok(easier, `closer ${i} is not easier`);
  }
});

test('the low-rate trigger turns the next room into a higher-box review, once; never cancels a Training Room', () => {
  const st = midState();
  const { run, served } = play(st, (x, i) => (x.kind === 'closer' || x.kind === 'echo' ? 'correct' : i % 3 === 0 ? 'correct' : 'wrong'));
  assert.equal(run.fired.low, true);
  assert.equal(run.log.filter((l) => l.startsWith('low rate')).length, 1);
  const reviews = served.filter((x) => x.kind === 'review');
  assert.ok(reviews.length >= 1);
  for (const plan of [run.plan]) for (const t of plan.items.filter((x) => x.kind === 'training')) {
    assert.ok(served.some((s) => s.seed === t.seed), 'training item cancelled');
  }
});

test('three fast wrong taps make the next room a scaffolded Training Room', () => {
  const st = midState();
  const { run, served } = play(st, (x, i) => (i < 3 ? 'wrong' : 'correct'), 900);
  assert.equal(run.fired.fast, true);
  const sc = served.filter((x) => x.kind === 'training' && x.fadeLevel === 0);
  assert.ok(sc.length >= 3);
});

test('chooseDoor swaps in the other door before the room starts, and refuses after', () => {
  const st = midState();
  const plan = planRun({ state: st, registry: REG, now: '2026-01-21T16:00:00-05:00', rng: makeRng('ctl-plan') });
  let run = startRun(plan, { state: st, registry: REG, rng: makeRng('r') });
  run = chooseDoor(run, 0, 1);
  const roomA = run.queue.filter((x) => x.room === plan.forks[0].room).map((x) => x.seed);
  assert.deepEqual(roomA, plan.forks[0].doors[1].items.map((x) => x.seed));
  assert.equal(run.queue.length, plan.items.length);
  // play up to and including the first item of room A
  for (let k = 0; k < 20 && !run.played.some((x) => x.item.room === plan.forks[0].room); k++) {
    const item = /** @type {PlanItem} */ (nextItem(run));
    const p = /** @type {any} */ (GEN.get(item.gen)).generate(makeRng(item.seed), { difficulty: item.difficulty, interaction: item.interaction, fadeLevel: item.fadeLevel });
    run = recordAttempt(run, toAttempt(p, item, { verdict: 'correct' }));
  }
  assert.throws(() => chooseDoor(run, 0, 0), /already started/);
});

test('the controller is pure: recordAttempt does not change the run it is given', () => {
  const st = replay([]);
  const plan = planRun({ state: st, registry: REG, now: '2026-01-05T16:00:00-05:00', rng: makeRng('p') });
  const run = startRun(plan, { state: st, registry: REG, rng: makeRng('r') });
  const item = /** @type {PlanItem} */ (nextItem(run));
  const p = /** @type {any} */ (GEN.get(item.gen)).generate(makeRng(item.seed), { difficulty: item.difficulty, interaction: item.interaction, fadeLevel: item.fadeLevel });
  const q0 = run.queue.length;
  const next = recordAttempt(run, toAttempt(p, item, { verdict: 'wrong' }));
  assert.equal(run.queue.length, q0);
  assert.equal(run.attempts.length, 0);
  assert.notEqual(next, run);
});

test('regression: choice items never exceed 50% of a run as SERVED (Whys, Echoes, closer retries, triggers); Boss Knots are symbol-only', () => {
  const sims = [
    ...Array.from({ length: 6 }, (_, i) => ({ seed: `cap80-${i}`, student: accurateStudent(0.8) })),
    ...Array.from({ length: 6 }, (_, i) => ({ seed: `cap65-${i}`, student: accurateStudent(0.65) })),
    ...Array.from({ length: 4 }, (_, i) => ({ seed: `cap40-${i}`, student: accurateStudent(0.4) })),
  ];
  const bad = [];
  let runs = 0; let bosses = 0;
  for (const s of sims) {
    simulate({
      seed: s.seed, days: 45, student: s.student, registry: REG,
      onRun: ({ day, plan, run }) => {
        runs++;
        const served = run.played;
        const choice = served.filter((/** @type {any} */ p) => !p.attempt.problem.constructed).length;
        if (2 * choice > served.length) bad.push(`${s.seed} d${day} ${choice}/${served.length}`);
        if (run.log.includes('choice cap not met') || plan.notes.includes('choice cap not met')) bad.push(`${s.seed} d${day} cap not met`);
        for (const p of served) {
          if (p.item.kind === 'boss') {
            bosses++;
            if (p.item.fadeLevel !== 3 || p.attempt.fadeLevel !== 3 || !p.attempt.problem.constructed) bad.push(`${s.seed} d${day} boss fade ${p.item.fadeLevel}`);
          }
        }
      },
    });
  }
  assert.deepEqual(bad, []);
  assert.ok(runs > 400 && bosses > 20, `exercised ${runs} runs, ${bosses} boss Knots`);
});
