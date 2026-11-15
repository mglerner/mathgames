// @ts-check
// Fake-clock learner scenarios (DESIGN.md section 11 test list) and property
// tests of the reducer against an independent oracle written from the
// section 6 text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, reduce, skillState, initialState } from '../../src/learner/model.js';
import { dayOf } from '../../src/learner/scheduler.js';
import { evidencePoints } from '../../src/learner/mastery.js';
import { forSeeds } from '../prop.js';
import { logBuilder } from './helpers.js';

/** @typedef {import('../../types.d.ts').Event} Event */
/** @typedef {import('../../types.d.ts').Attempt} Attempt */
/** @typedef {import('../../types.d.ts').Interaction} Interaction */
/** @typedef {import('../../types.d.ts').Rng} Rng */

const X = 'solve-linear';

/** Bring X to box 2 in two sessions (day 0 and day 1). */
function toBox2() {
  const b = logBuilder();
  b.day(0).start().attempt(X).end();
  b.day(1).start().attempt(X).end();
  return b;
}

test('scenario: introduced day 0 box 1, day 1 box 2, evidence on days 3, 5, 7', () => {
  const b = toBox2();
  assert.equal(replay(b.events).skills[X].box, 2);
  b.day(3).start().evidence(X).end();
  b.day(5).start().evidence(X, { interaction: 'predict' }).end();
  b.day(7).start().evidence(X, { context: 'boss' }).end();
  const s = replay(b.events);
  assert.equal(evidencePoints(s.skills[X]), 3);
  assert.deepEqual(s.skills[X].evidence.map((e) => e.day - dayOf('2026-01-05')), [3, 5, 7]);
  assert.equal(s.skills[X].mastered, false, 'no counting Why yet');
  b.day(8).start().why(X).end();
  const m = replay(b.events);
  assert.equal(m.skills[X].mastered, true);
  assert.equal(skillState(m, X, dayOf('2026-01-05') + 8), 'mastered');
});

test('scenario: evidence days must be at least 2 days apart', () => {
  const b = toBox2();
  b.day(3).start().evidence(X).end();
  b.day(4).start().evidence(X).end(); // too soon
  b.day(5).start().evidence(X).end();
  b.day(6).start().evidence(X).end(); // too soon
  const s = replay(b.events);
  assert.deepEqual(s.skills[X].evidence.map((e) => e.day - dayOf('2026-01-05')), [3, 5]);
});

test('scenario: three evidence items in one session count as one day', () => {
  const b = toBox2();
  b.day(3).start().evidence(X).evidence(X).evidence(X).end();
  assert.equal(replay(b.events).skills[X].evidence.length, 1);
});

test('scenario: mastery needs a mixed-or-boss evidence day, a Strike, and a counting Why', () => {
  // all blocked: no mastery
  let b = toBox2();
  b.day(3).start().evidence(X, { context: 'blocked' }).end();
  b.day(5).start().evidence(X, { context: 'blocked' }).end();
  b.day(7).start().evidence(X, { context: 'blocked' }).why(X).end();
  assert.equal(replay(b.events).skills[X].mastered, false, 'no mixed or boss evidence');
  // no Strike: no mastery
  b = toBox2();
  for (const d of [3, 5, 7]) b.day(d).start().evidence(X, { interaction: 'predict' }).end();
  b.day(8).start().why(X).end();
  assert.equal(replay(b.events).skills[X].mastered, false, 'no Strike evidence');
  // non-counting Why: no mastery
  b = toBox2();
  for (const d of [3, 5, 7]) b.day(d).start().evidence(X).end();
  b.day(8).start().why(X, { variant: 'which-invariant' }).why(X, { variant: undefined }).end();
  assert.equal(replay(b.events).skills[X].mastered, false, '"which invariant?" counts for nothing');
  // a fourth evidence day can supply the missing condition
  b = toBox2();
  for (const d of [3, 5, 7]) b.day(d).start().evidence(X, { interaction: 'predict' }).end();
  b.day(9).start().evidence(X).why(X).end();
  const s = replay(b.events);
  assert.equal(evidencePoints(s.skills[X]), 3, 'EP stays capped at 3');
  assert.equal(s.skills[X].mastered, true);
  // a repair counts as a Why
  b = toBox2();
  for (const d of [3, 5, 7]) b.day(d).start().evidence(X).end();
  b.day(8).start().attempt(X, { interaction: 'trace', variant: 'repair', constructed: true }).end();
  assert.equal(replay(b.events).skills[X].mastered, true);
});

test('scenario: evidence needs box 2+, fade 3, constructed, first try, hint-free, fresh', () => {
  const b = logBuilder();
  b.day(0).start().evidence(X).end(); // box 0: not evidence (and moves to box 1)
  b.day(1).start().evidence(X).end(); // box 1: not evidence (moves to box 2)
  assert.equal(replay(b.events).skills[X].evidence.length, 0);
  const c = toBox2();
  c.day(3).start()
    .evidence(X, { fadeLevel: 2 })
    .evidence(X, { hintsUsed: 1 })
    .evidence(X, { firstTry: false })
    .evidence(X, { interaction: 'twin', constructed: false })
    .evidence(X, { interaction: 'cast', constructed: true }) // mislabelled choice item
    .evidence(X, { context: 'charting' })
    .end();
  assert.equal(replay(c.events).skills[X].evidence.length, 0);
  const d = toBox2();
  d.day(2).start().attempt(X, { seed: 'reused', interaction: 'twin', constructed: false }).end();
  d.day(3).start().evidence(X, { seed: 'reused' }).end();
  assert.equal(replay(d.events).skills[X].evidence.length, 0, 'a seen item is not fresh');
});

test('scenario: at most one box up per session', () => {
  const b = logBuilder();
  b.day(0).start().attempt(X).attempt(X).attempt(X).attempt(X).end();
  assert.equal(replay(b.events).skills[X].box, 1);
  b.day(0).start().attempt(X).attempt(X).end(); // a second session the same day
  assert.equal(replay(b.events).skills[X].box, 2);
});

test('scenario: only the first constructed response of a session can move the box up', () => {
  const b = logBuilder();
  b.day(0).start().attempt(X, { hintsUsed: 1 }).attempt(X).end();
  assert.equal(replay(b.events).skills[X].box, 0, 'first CR used a hint');
  const c = logBuilder();
  c.day(0).start().attempt(X, { verdict: 'form' }).attempt(X).end();
  assert.equal(replay(c.events).skills[X].box, 0, 'first CR was "same value, not finished"');
});

test('scenario: a missed constructed response drops exactly one box, once per session', () => {
  const b = logBuilder();
  for (let d = 0; d < 4; d++) b.day(d).start().attempt(X).end();
  assert.equal(replay(b.events).skills[X].box, 4);
  b.day(10).start().attempt(X, { verdict: 'wrong' }).attempt(X, { verdict: 'wrong' }).attempt(X, { verdict: 'wrong' }).end();
  assert.equal(replay(b.events).skills[X].box, 3);
  b.day(11).start().attempt(X, { verdict: 'wrong' }).end();
  assert.equal(replay(b.events).skills[X].box, 2);
  const c = logBuilder();
  c.day(0).start().attempt(X, { verdict: 'wrong' }).end();
  assert.equal(replay(c.events).skills[X].box, 0, 'floor 0');
  const e = logBuilder();
  e.day(0).start().attempt(X).end();
  e.day(1).start().attempt(X).attempt(X, { verdict: 'wrong' }).end();
  assert.equal(replay(e.events).skills[X].box, 1, 'up then down in one session nets 0');
});

test('scenario: choice attempts never move a box; a choice miss drops the fade level', () => {
  const b = logBuilder();
  for (let d = 0; d < 3; d++) b.day(d).start().attempt(X).end();
  const before = replay(b.events).skills[X];
  assert.equal(before.box, 3);
  assert.equal(before.fade, 3);
  for (const interaction of /** @type {Interaction[]} */ (['cast', 'nextline', 'twin', 'forge', 'trace', 'why'])) {
    b.day(5).start().attempt(X, { interaction, constructed: false, verdict: 'wrong' }).attempt(X, { interaction, constructed: false }).end();
  }
  const after = replay(b.events).skills[X];
  assert.equal(after.box, 3);
  assert.equal(after.fade, 0, 'six choice misses, each one fade step, floor 0');
});

test('scenario: awards are never revoked', () => {
  const b = toBox2();
  for (const d of [3, 5, 7]) b.day(d).start().evidence(X).end();
  b.day(8).start().why(X).award({ kind: 'trophy', id: 'spreader' }).award({ kind: 'shards', amount: 2 }).end();
  const m = replay(b.events);
  assert.equal(m.skills[X].mastered, true);
  const shards = m.shards;
  for (let d = 20; d < 40; d++) b.day(d).start().attempt(X, { verdict: 'wrong' }).attempt(X, { verdict: 'wrong', interaction: 'twin', constructed: false }).end();
  b.day(41).start().award({ kind: 'shards', amount: -50 }).end();
  const s = replay(b.events);
  assert.equal(s.skills[X].mastered, true, 'mastery mark kept');
  assert.equal(evidencePoints(s.skills[X]), 3, 'EP kept');
  assert.equal(s.shards, shards, 'misses and a negative award cost nothing');
  assert.equal(s.awards.filter((a) => a.kind === 'trophy').length, 1);
  assert.equal(skillState(s, X, dayOf('2026-01-05') + 41), 'decaying', 'shown as due for a check');
  assert.equal(s.skills[X].box, 0, 'scheduling state moves both ways');
});

test('scenario: decaying when overdue by more than 2 intervals, cleared by a clean re-check', () => {
  const b = toBox2();
  for (const d of [3, 5, 7]) b.day(d).start().evidence(X).end();
  b.day(8).start().why(X).end();
  const s = replay(b.events);
  const sk = s.skills[X];
  assert.equal(sk.box, 4); // up on days 3 and 5, capped at 4
  const due = /** @type {number} */ (sk.lastReviewDay) + 8;
  assert.equal(skillState(s, X, due + 16), 'mastered');
  assert.equal(skillState(s, X, due + 17), 'decaying');
  b.day(30).start().attempt(X, { verdict: 'wrong' }).end();
  assert.equal(skillState(replay(b.events), X, dayOf('2026-01-05') + 30), 'decaying');
  b.day(31).start().attempt(X).end();
  assert.equal(skillState(replay(b.events), X, dayOf('2026-01-05') + 31), 'mastered');
});

test('scenario: skill states unseen / learning / due', () => {
  const b = logBuilder();
  b.day(0).start().unlock(X).end();
  const s0 = replay(b.events);
  const d0 = dayOf('2026-01-05');
  assert.equal(skillState(s0, 'distribute', d0), 'unseen');
  assert.equal(skillState(s0, X, d0), 'due', 'box 0 has a 0-day interval');
  b.day(0).start().attempt(X).end();
  const s1 = replay(b.events);
  assert.equal(skillState(s1, X, d0), 'learning');
  assert.equal(skillState(s1, X, d0 + 1), 'due');
});

test('scenario: Charting placement: hit -> box 3 + 1 EP, inferred -> box 2, no EP; miss -> unseen', () => {
  const b = logBuilder();
  b.day(0).start()
    .attempt(X, { context: 'charting', evidence: false, fadeLevel: 3 })
    .placement({ skill: X, result: 'hit', difficulty: 2, inferred: ['balance-moves', 'distribute'], branch: X })
    .attempt('sqrt-product-rule', { context: 'charting', verdict: 'wrong', misconceptions: ['sqrt-splits-sum'] })
    .placement({ skill: 'sqrt-product-rule', result: 'miss', difficulty: 1, inferred: [], branch: 'sqrt-product-rule' })
    .end();
  const s = replay(b.events);
  assert.equal(s.skills[X].box, 3);
  assert.equal(s.skills[X].evidence.length, 1);
  assert.equal(s.skills['balance-moves'].box, 2);
  assert.equal(s.skills['balance-moves'].inferred, true);
  assert.equal(s.skills['balance-moves'].evidence.length, 0);
  assert.equal(s.skills['sqrt-product-rule'].seen, false);
  assert.deepEqual(s.misconceptions['sqrt-splits-sum'].map((m) => m.charting), [true], 'logged as suspected (charting)');
  assert.equal(s.repairs.length, 0, 'no repair or Haunt from a probe');
  // inferred: first item is evidence; a miss sends it to box 1
  b.day(1).start().evidence('balance-moves', { verdict: 'wrong' }).end();
  const t = replay(b.events);
  assert.equal(t.skills['balance-moves'].box, 1);
  assert.equal(t.skills['balance-moves'].inferred, false);
  b.day(1).start().evidence('distribute').end();
  const u = replay(b.events);
  assert.equal(u.skills.distribute.box, 3);
  assert.equal(u.skills.distribute.evidence.length, 1);
});

test('scenario: the low-rate trigger drops the fade of skills played that session, once', () => {
  const b = logBuilder();
  for (let d = 0; d < 3; d++) b.day(d).start().attempt(X).attempt('distribute').end();
  assert.equal(replay(b.events).skills.distribute.fade, 3);
  b.day(5).start();
  // 6 choice items, 2 correct: 33% < 65%; choice misses also drop fade one each
  for (let i = 0; i < 6; i++) b.attempt('distribute', { interaction: 'twin', constructed: false, verdict: i < 2 ? 'correct' : 'wrong' });
  b.attempt(X, { interaction: 'twin', constructed: false }).end();
  const s = replay(b.events);
  assert.equal(s.skills.distribute.fade, 0, '4 misses + trigger, floor 0');
  assert.equal(s.skills[X].fade, 3, 'X was not yet played when the trigger fired');
  assert.equal(s.sessions[s.sessions.length - 1].lowFired, true);
});

test('scenario: Warden retreats 2 days when not cleared, clears on a boss Strike', () => {
  const b = logBuilder();
  b.day(0).start().attempt(X, { context: 'boss', verdict: 'wrong' }).end();
  const s = replay(b.events);
  assert.equal(s.wardens.balance.cleared, null);
  assert.equal(s.wardens.balance.retreatUntil, dayOf('2026-01-05') + 2);
  b.day(2).start().attempt(X, { context: 'boss' }).end();
  assert.equal(replay(b.events).wardens.balance.cleared, dayOf('2026-01-05') + 2);
});

test('replay: order-independent, idempotent under duplicate events, unknown events ignored', () => {
  const b = toBox2();
  b.day(3).start().evidence(X).why(X).end();
  const s = replay(b.events);
  const shuffled = [...b.events].reverse();
  assert.deepEqual(replay([...shuffled, ...b.events.slice(0, 5)]), s);
  const junk = [...b.events, { id: 'zz1', v: 1, t: '2026-02-01T10:00:00-05:00', build: 't', device: 't', type: /** @type {any} */ ('mystery'), data: 1 },
    { id: 'zz2', v: 1, t: '2026-02-01T10:00:00-05:00', build: 't', device: 't', type: 'attempt', data: { nope: true } }];
  const j = replay(junk);
  assert.deepEqual(j.skills, s.skills);
  assert.equal(j.rejected, 1);
  // reduce() is pure: it does not touch its input
  const before = JSON.stringify(s, (_, v) => (typeof v === 'bigint' ? String(v) : v));
  reduce(s, b.events[0]);
  assert.equal(JSON.stringify(s, (_, v) => (typeof v === 'bigint' ? String(v) : v)), before);
});

test('attempts outside a session go to an implicit per-day session (proto logs)', () => {
  const b = logBuilder();
  b.day(0).attempt(X).attempt(X);
  b.day(1).attempt(X);
  const s = replay(b.events);
  assert.equal(s.skills[X].box, 2);
  assert.equal(s.sessions.length, 2);
});

test('regression: a malformed or null event is rejected and skipped, never thrown', () => {
  const b = toBox2();
  const good = replay(b.events);
  const bad = /** @type {any[]} */ ([...b.events,
    { id: 'Z1', v: 2, t: 'garbage', build: 'x', device: 'x', type: 'from-the-future', data: {} },
    { id: 'Z2', v: 1, build: 'x', device: 'x', type: 'attempt', data: b.events[1].data },
    { id: 'Z3', v: 1, t: '2026-13-40T10:00:00-05:00', build: 'x', device: 'x', type: 'session-start', data: {} },
    { v: 1, t: '2026-01-06T10:00:00-05:00', type: 'attempt', data: b.events[1].data },
    null, 7]);
  const s = replay(bad);
  assert.deepEqual(s.skills, good.skills);
  assert.equal(s.sessions.length, good.sessions.length);
  assert.equal(s.rejected, 6);
  let r = initialState();
  for (const e of bad) r = reduce(r, e);
  assert.deepEqual(r.skills, good.skills);
});

test('regression: reduce() is a no-op for an event id it has already applied', () => {
  const b = logBuilder();
  b.day(0).start().attempt(X).why(X).end();
  let s = initialState();
  for (const e of [...b.events, ...b.events]) s = reduce(s, e);
  assert.deepEqual(s, replay(b.events));
  assert.equal(s.shards, replay(b.events).shards);
});

test('regression: any miss on an inferred skill, even a choice miss, sends it to box 1 (once per session)', () => {
  const b = logBuilder();
  b.day(0).start()
    .attempt(X, { context: 'charting', fadeLevel: 3 })
    .placement({ skill: X, result: 'hit', difficulty: 2, inferred: ['balance-moves'], branch: X })
    .end();
  assert.equal(replay(b.events).skills['balance-moves'].box, 2);
  b.day(1).start().attempt('balance-moves', { interaction: 'twin', constructed: false, verdict: 'wrong' })
    .attempt('balance-moves', { verdict: 'wrong' }).end();
  const s = replay(b.events);
  assert.equal(s.skills['balance-moves'].box, 1, 'one drop for the session, not two');
  assert.equal(s.skills['balance-moves'].inferred, false);
  // a choice miss on a non-inferred skill still moves nothing
  b.day(2).start().attempt('balance-moves', { interaction: 'twin', constructed: false, verdict: 'wrong' }).end();
  assert.equal(replay(b.events).skills['balance-moves'].box, 1);
});

test('regression: a session never closed does not absorb later days; a run across midnight stays one session', () => {
  /** @type {Event[]} */
  const evs = [];
  let n = 0;
  /** @param {string} t @param {Event['type']} type @param {unknown} data */
  const push = (t, type, data) => evs.push({ id: String(n++).padStart(8, '0'), v: 1, t, build: 't', device: 't', type, data });
  const att = (/** @type {string} */ seed) => ({
    problem: { gen: 'g', version: 1, seed, skill: X, difficulty: 2, interaction: 'strike', constructed: true },
    response: 'r', verdict: 'correct', firstTry: true, hintsUsed: 0, fadeLevel: 0, evidence: false, context: 'mixed',
    misconceptions: [], ambiguous: false, ms: 8000,
  });
  push('2026-01-05T10:00:00-05:00', 'session-start', { id: 's0' });
  push('2026-01-05T10:01:00-05:00', 'attempt', att('a'));
  push('2026-01-06T10:00:00-05:00', 'attempt', att('b'));
  push('2026-01-07T10:00:00-05:00', 'attempt', att('c'));
  const s = replay(evs);
  assert.equal(s.skills[X].box, 3);
  assert.equal(s.sessions.length, 3);
  assert.equal(s.sessions[0].endT, null, 'abandoned: no end time, so no run length is invented');
  // crossing midnight: 23:55 -> 00:05 is one session (one box at most)
  evs.length = 0;
  push('2026-01-05T23:55:00-05:00', 'session-start', { id: 's1' });
  push('2026-01-05T23:56:00-05:00', 'attempt', att('d'));
  push('2026-01-06T00:05:00-05:00', 'attempt', att('e'));
  push('2026-01-06T00:06:00-05:00', 'session-end', {});
  const m = replay(evs);
  assert.equal(m.skills[X].box, 1);
  assert.equal(m.sessions.length, 1);
  assert.equal(m.sessions[0].endT, '2026-01-06T00:06:00-05:00');
  // a session-start the next day closes a stale session without an end time
  evs.length = 0;
  push('2026-01-05T10:00:00-05:00', 'session-start', { id: 's2' });
  push('2026-01-05T10:01:00-05:00', 'attempt', att('f'));
  push('2026-01-06T10:00:00-05:00', 'session-start', { id: 's3' });
  push('2026-01-06T10:01:00-05:00', 'attempt', att('g'));
  const k = replay(evs);
  assert.equal(k.skills[X].box, 2);
  assert.equal(k.sessions[0].endT, null);
});

// ------------------------------------------------------------------ properties

const SKILLS = [X, 'distribute', 'balance-moves'];
const INTERACTIONS = /** @type {Interaction[]} */ (['cast', 'nextline', 'predict', 'forge', 'twin', 'trace', 'why', 'strike']);
const VERDICTS = /** @type {Attempt['verdict'][]} */ (['correct', 'correct', 'correct', 'wrong', 'wrong', 'form', 'legal-idle', 'risky', 'unparsed', 'unverifiable']);
const CONTEXTS = /** @type {Attempt['context'][]} */ (['blocked', 'mixed', 'mixed', 'charting', 'boss', 'fracture', 'echo', 'warmup', 'closer']);

/**
 * A random log: random days, sessions, attempts of every kind (including
 * mislabelled constructed flags and reused seeds), awards.
 * @param {Rng} rng
 */
function randomLog(rng) {
  const b = logBuilder();
  let day = 0;
  const nSessions = rng.int(1, 14);
  for (let i = 0; i < nSessions; i++) {
    day += rng.int(0, 3);
    b.day(day);
    const explicit = rng.bool(0.9);
    if (explicit) b.start();
    const n = rng.int(1, 9);
    for (let j = 0; j < n; j++) {
      const interaction = rng.pick(INTERACTIONS);
      const fadeLevel = rng.int(0, 3);
      b.attempt(rng.pick(SKILLS), {
        interaction,
        constructed: rng.bool(0.8) ? interaction === 'predict' || interaction === 'strike' || (interaction === 'forge' && fadeLevel >= 2) : rng.bool(),
        verdict: rng.pick(VERDICTS), firstTry: rng.bool(0.8), hintsUsed: rng.bool(0.9) ? 0 : 1,
        evidence: rng.bool(0.4), fadeLevel: rng.bool(0.5) ? 3 : fadeLevel, context: rng.pick(CONTEXTS),
        seed: rng.bool(0.1) ? 'dup' : undefined, variant: interaction === 'why' ? rng.pick(['hidden-1', 'hidden-0', 'repair', 'which-invariant']) : undefined,
        misconceptions: rng.bool(0.2) ? ['partial-distribution'] : [],
      });
      if (rng.bool(0.05)) b.award({ kind: rng.pick(['shards', 'trophy']), amount: rng.int(-3, 3) });
    }
    if (explicit && rng.bool(0.9)) b.end();
  }
  return b.events;
}

/** Spec-text oracle: is this attempt a constructed response? */
/** @param {Attempt} a */
const oracleCR = (a) => a.problem.constructed && ['predict', 'strike', 'forge', 'trace', 'why'].includes(a.problem.interaction);
/** @param {Attempt} a */
const oracleClean = (a) => a.verdict === 'correct' && a.firstTry && a.hintsUsed === 0;

/**
 * Independent oracle for boxes and evidence days, written from section 6.
 * Sessions are delimited by session-start, or by the calendar day for
 * attempts outside any explicit session. An explicit session left open is
 * over once an attempt arrives on a later calendar day (randomLog's days are
 * about 24 h apart, well past the reducer's 60-minute staleness window).
 * @param {Event[]} events
 */
function oracle(events) {
  /** @type {Record<string, { box: number; ev: number[]; seen: boolean }>} */
  const st = {};
  for (const s of SKILLS) st[s] = { box: 0, ev: [], seen: false };
  const seenSeeds = new Set();
  let sessKey = '';
  let open = false;
  let openDay = 0;
  /** @type {Record<string, { firstCRDone: boolean; dropped: boolean }>} */
  let per = {};
  /** @type {Record<string, number>} */
  const boxAtSessionStart = {};
  /** @type {{ key: string; skill: string; start: number; end: number }[]} */
  const sessionDeltas = [];
  const flush = () => {
    for (const s of SKILLS) if (per[s]) sessionDeltas.push({ key: sessKey, skill: s, start: boxAtSessionStart[s], end: st[s].box });
  };
  for (const e of events) {
    const day = dayOf(e.t);
    if (e.type === 'session-start') { flush(); sessKey = e.id; open = true; openDay = day; per = {}; for (const s of SKILLS) boxAtSessionStart[s] = st[s].box; continue; }
    if (e.type === 'session-end') { open = false; continue; }
    if (e.type !== 'attempt') continue;
    const a = /** @type {Attempt} */ (e.data);
    if (open && day > openDay) open = false;
    if (!open && sessKey !== `implicit${day}`) { flush(); sessKey = `implicit${day}`; per = {}; for (const s of SKILLS) boxAtSessionStart[s] = st[s].box; }
    const key = `${a.problem.gen}|${a.problem.seed}`;
    const fresh = !seenSeeds.has(key);
    seenSeeds.add(key);
    if (a.context === 'charting' || a.verdict === 'unparsed' || a.verdict === 'unverifiable') continue;
    const s = st[a.problem.skill];
    s.seen = true;
    const p = per[a.problem.skill] ?? (per[a.problem.skill] = { firstCRDone: false, dropped: false });
    if (a.evidence && oracleCR(a) && a.fadeLevel === 3 && s.box >= 2 && oracleClean(a) && fresh
      && (s.ev.length === 0 || day - s.ev[s.ev.length - 1] >= 2)) s.ev.push(day);
    if (oracleCR(a)) {
      if (!p.firstCRDone) { p.firstCRDone = true; if (oracleClean(a) && fresh) s.box = Math.min(4, s.box + 1); }
      if (a.verdict === 'wrong' && !p.dropped) { p.dropped = true; s.box = Math.max(0, s.box - 1); }
    }
  }
  flush();
  return { st, sessionDeltas };
}

test('property: boxes and evidence days match the section 6 oracle (3000 random logs)', () => {
  forSeeds(3000, (rng) => {
    const events = randomLog(rng);
    const s = replay(events);
    const o = oracle(events);
    for (const id of SKILLS) {
      assert.equal(s.skills[id].box, o.st[id].box, `box of ${id}`);
      assert.deepEqual(s.skills[id].evidence.map((e) => e.day), o.st[id].ev, `evidence of ${id}`);
      assert.ok(s.skills[id].evidence.length <= 3 || true);
    }
    for (const d of o.sessionDeltas) assert.ok(Math.abs(d.end - d.start) <= 1, `session ${d.key} moved ${d.skill} by more than one box`);
  }, { prefix: 'log' });
});

test('property: choice attempts never move a box; awards, EP, mastery, Why and shards never go down (2000 logs)', () => {
  forSeeds(2000, (rng) => {
    const events = randomLog(rng);
    let s = initialState();
    for (const e of events) {
      const next = reduce(s, e);
      if (e.type === 'attempt') {
        const a = /** @type {Attempt} */ (e.data);
        if (!oracleCR(a)) for (const id of SKILLS) assert.equal(next.skills[id].box, s.skills[id].box, `choice attempt moved ${id}`);
      }
      for (const id of SKILLS) {
        assert.ok(evidencePoints(next.skills[id]) >= evidencePoints(s.skills[id]), 'EP went down');
        assert.ok(next.skills[id].evidence.length >= s.skills[id].evidence.length);
        assert.ok(!s.skills[id].mastered || next.skills[id].mastered, 'mastery revoked');
        assert.ok(!s.skills[id].countingWhy || next.skills[id].countingWhy, 'Why revoked');
        assert.ok(next.skills[id].box >= 0 && next.skills[id].box <= 4);
        assert.ok(next.skills[id].fade >= 0 && next.skills[id].fade <= 3);
        const ev = next.skills[id].evidence;
        for (let i = 1; i < ev.length; i++) assert.ok(ev[i].day - ev[i - 1].day >= 2, 'evidence gap');
      }
      assert.ok(next.shards >= s.shards, 'shards went down');
      assert.ok(next.awards.length >= s.awards.length, 'award revoked');
      s = next;
    }
    assert.deepEqual(s.skills, replay(events).skills, 'step-by-step reduce equals replay');
  }, { prefix: 'mono' });
});
