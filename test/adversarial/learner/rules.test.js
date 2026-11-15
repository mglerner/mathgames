// Adversarial review of M2 (src/learner, src/session) against DESIGN.md
// section 6, 8 and the section 11 learner/planner bullets. Uses its own log
// builder (xlog.js) and simulator (xsim.js), never the builder's helpers.
// Reproduced defects are marked { todo } so they report without failing the
// suite; remove the todo once fixed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Log, dateOf } from './xlog.js';
import { xsimulate } from './xsim.js';
import { replay, reduce, initialState, skillState } from '../../../src/learner/model.js';
import { dayOf } from '../../../src/learner/scheduler.js';
import { tierFor, gateStatus, epTotal } from '../../../src/learner/season.js';
import { lowRateTrigger, highRateTrigger, fastWrongTrigger } from '../../../src/learner/fading.js';
import { placementFor, probesForRun } from '../../../src/learner/charting.js';
import { skills } from '../../../src/data/skills.js';

const S = 'solve-linear';
const sk = (L, id = S) => replay(L.events).skills[id];
const D = (d) => dayOf(dateOf(d));

test('boxes move only on constructed responses; choice misses never move a box', () => {
  const L = new Log();
  L.session(0, (l) => l.cr(S, true));
  L.session(1, (l) => l.cr(S, true));
  assert.equal(sk(L).box, 2);
  L.session(3, (l) => { for (const i of ['nextline', 'twin', 'trace', 'cast', 'why']) l.choice(S, false, { interaction: i }); });
  assert.equal(sk(L).box, 2);
  L.session(4, (l) => l.choice(S, true, { interaction: 'nextline', constructed: true })); // mislabelled
  assert.equal(sk(L).box, 2);
});

test('at most one box up per session; one drop per session (floor 0)', () => {
  const L = new Log();
  L.session(0, (l) => { l.cr(S, true); l.cr(S, true); l.cr(S, true); });
  assert.equal(sk(L).box, 1);
  L.session(1, (l) => l.cr(S, true));
  L.session(3, (l) => { l.cr(S, false); l.cr(S, false); l.cr(S, false); });
  assert.equal(sk(L).box, 1);
  L.session(4, (l) => { l.cr(S, false); });
  L.session(5, (l) => { l.cr(S, false); });
  assert.equal(sk(L).box, 0);
});

test('box up requires fresh, hint-free, first-try', () => {
  const L = new Log();
  L.session(0, (l) => l.cr(S, true, { seed: 'A' }));
  L.session(1, (l) => l.cr(S, true, { seed: 'A' }));
  L.session(2, (l) => l.cr(S, true, { hints: 1 }));
  L.session(3, (l) => l.cr(S, true, { firstTry: false }));
  assert.equal(sk(L).box, 1);
});

test('evidence: box >= 2, symbol-only CR, fresh, clean, 2-day gap, 3-in-a-row = one day, EP cap 3', () => {
  const L = new Log();
  L.session(0, (l) => l.cr(S, true));
  L.session(1, (l) => l.ev(S, true)); // box 1 before attempt -> no evidence
  assert.equal(sk(L).evidence.length, 0);
  L.session(2, (l) => { l.ev(S, true, { fade: 2 }); l.ev(S, true, { hints: 1 }); l.ev(S, true, { interaction: 'nextline', constructed: false }); });
  assert.equal(sk(L).evidence.length, 0);
  L.session(3, (l) => { l.ev(S, true); l.ev(S, true); l.ev(S, true); });
  assert.equal(sk(L).evidence.length, 1);
  L.session(4, (l) => l.ev(S, true));
  assert.equal(sk(L).evidence.length, 1);
  L.session(5, (l) => l.ev(S, true));
  L.session(7, (l) => l.ev(S, true));
  L.session(9, (l) => l.ev(S, true));
  const s = replay(L.events);
  assert.equal(epTotal({ skills: { [S]: s.skills[S] } }, skills.filter((d) => d.id === S)), 3);
});

test('mastery needs all four conditions; mark never removed; decaying shown', () => {
  const build = (o) => {
    const L = new Log();
    L.session(0, (l) => l.cr(S, true));
    L.session(1, (l) => l.cr(S, true));
    L.session(2, (l) => { if (o.why) l.choice(S, true, { interaction: 'why', variant: 'hidden-1' }); });
    L.session(3, (l) => l.ev(S, true, { interaction: o.strike ? 'strike' : 'predict', context: o.mixed ? 'mixed' : 'blocked' }));
    L.session(5, (l) => l.ev(S, true, { interaction: 'predict', context: 'blocked' }));
    L.session(7, (l) => l.ev(S, true, { interaction: 'predict', context: 'blocked' }));
    return L;
  };
  assert.equal(sk(build({ why: 1, strike: 1, mixed: 1 })).mastered, true);
  assert.equal(sk(build({ why: 0, strike: 1, mixed: 1 })).mastered, false);
  assert.equal(sk(build({ why: 1, strike: 0, mixed: 1 })).mastered, false);
  assert.equal(sk(build({ why: 1, strike: 1, mixed: 0 })).mastered, false);
  const L = build({ why: 1, strike: 1, mixed: 1 });
  L.session(8, (l) => { l.cr(S, false); l.choice(S, false); });
  const s = replay(L.events);
  assert.equal(s.skills[S].mastered, true);
  assert.equal(skillState(s, S, D(8)), 'decaying');
  L.session(9, (l) => l.cr(S, true));
  const s2 = replay(L.events);
  assert.equal(skillState(s2, S, D(9)), 'mastered');
  // box 4, interval 8, reviewed day 9: due 17, decaying when overdue > 16
  assert.equal(skillState(s2, S, D(33)), 'mastered');
  assert.equal(skillState(s2, S, D(34)), 'decaying');
});

test('Charting: miss keeps unseen, descends, no Haunt/repair; branch closes after 2; hit -> box 3 + 1 EP + inferred box 2', () => {
  const shipped = new Set(skills.map((d) => d.id));
  const L = new Log();
  L.goto(0); L.start();
  const probe = (skill, ok) => {
    const e = L.att(skill, { interaction: 'strike', constructed: true, ok, fade: 3, context: 'charting', tags: ok ? [] : ['partial-distribution'] });
    L.push('placement', placementFor(replay(L.events), e.data, shipped));
  };
  probe('solve-linear', false);
  let s = replay(L.events);
  assert.equal(s.skills['solve-linear'].seen, false);
  assert.equal(s.repairs.length, 0);
  assert.ok(probesForRun(s, shipped).includes('balance-moves'));
  probe('balance-moves', false);
  s = replay(L.events);
  assert.ok(!probesForRun(s, shipped).includes('solution-meaning'));
  probe('distribute', true);
  s = replay(L.events);
  assert.equal(s.skills.distribute.box, 3);
  assert.equal(s.skills.distribute.evidence.length, 1);
  assert.equal(s.skills['equivalent-expressions'].box, 2);
  assert.equal(s.skills['equivalent-expressions'].evidence.length, 0);
});

test('live controller thresholds (integer, exact at 65% and 90%)', () => {
  const mk = (k, n, ms = 7000) => Array.from({ length: n }, (_, i) => ({ firstTry: true, context: 'mixed', verdict: i < k ? 'correct' : 'wrong', ms }));
  assert.equal(lowRateTrigger(mk(3, 5)), false); // fewer than 6
  assert.equal(lowRateTrigger(mk(3, 6)), true);
  assert.equal(lowRateTrigger(mk(13, 20)), false); // exactly 65% is not below
  assert.equal(lowRateTrigger(mk(12, 20)), true);
  assert.equal(highRateTrigger(mk(6, 6)), true);
  assert.equal(highRateTrigger(mk(9, 10)), false); // exactly 90% is not above
  assert.equal(fastWrongTrigger(mk(0, 3, 1999)), true);
  assert.equal(fastWrongTrigger(mk(0, 3, 2000)), false);
});

test('season: tier at 10t EP, Gate at 100 EP or day 65', () => {
  assert.deepEqual([0, 9, 10, 99, 100, 120].map(tierFor), [0, 0, 1, 9, 10, 10]);
  const st = { skills: {}, firstDay: D(0) };
  assert.equal(gateStatus(st, D(64)).open, false);
  assert.equal(gateStatus(st, D(65)).open, true);
  assert.equal(skills.filter((d) => d.priority === 'A').length * 3, 120);
});

test('determinism: same log same state; shuffled + duplicated (set union) == original', () => {
  const r = xsimulate({ seed: 'det', p: 0.8, days: 20 });
  const a = replay(r.events);
  const b = replay(r.events);
  assert.deepEqual(a, b);
  const shuffled = [...r.events].reverse();
  const dup = [...r.events.slice(0, 50), ...r.events, ...r.events.slice(100, 200)].reverse();
  assert.deepEqual(replay(shuffled), a);
  assert.deepEqual(replay(dup), a);
  // fold with reduce over the sorted log == replay at once
  let s = initialState();
  for (const e of r.events) s = reduce(s, e);
  assert.deepEqual(s, a);
  // unknown event types with valid timestamps are ignored
  const extra = [...r.events, { id: 'zzzz', v: 9, t: '2026-03-03T10:00:00-05:00', build: 'x', device: 'x', type: 'from-the-future', data: { q: 1 } }];
  assert.deepEqual(replay(extra).skills, a.skills);
});

test('DEFECT: one event with a malformed timestamp makes replay throw (whole state lost)', () => {
  const L = new Log();
  L.session(0, (l) => l.cr(S, true));
  L.events.push({ id: 'Z1', v: 2, t: 'garbage', build: 'x', device: 'x', type: 'from-the-future', data: {} });
  assert.doesNotThrow(() => replay(L.events));
});

test('DEFECT: reduce() is not idempotent on a duplicate event (sync is a set union)', () => {
  const L = new Log();
  L.session(0, (l) => { l.cr(S, true); l.choice(S, true); });
  let s = initialState();
  for (const e of [...L.events, ...L.events]) s = reduce(s, e);
  assert.equal(s.shards, replay(L.events).shards);
});

/** Run 20 seasons of an 80% student, collecting per-run violations. */
function seasons(n, check) {
  const out = [];
  for (let i = 0; i < n; i++) xsimulate({ seed: `adv-inv${i}`, p: 0.8, onRun: (r) => { const v = check(r); if (v) out.push(`s${i}d${r.day} ${v}`); } });
  return out;
}

test('per-run invariants that hold: no run ends on a miss, warm-up/closer never evidence, evidence symbol-only at box >= 2, unlock rule, new skills <= 2, box +-1 per session, nothing revoked', () => {
  const def = new Map(skills.map((d) => [d.id, d]));
  const bad = seasons(20, ({ plan, served, before, after }) => {
    if (served[served.length - 1].a.verdict !== 'correct') return 'ends on miss';
    for (const { it, a } of served) {
      if ((it.context === 'warmup' || it.context === 'closer') && it.evidence) return 'warm/closer evidence';
      if (it.evidence && (it.fadeLevel !== 3 || !a.problem.constructed)) return 'evidence not symbol-only CR';
      if (it.evidence && before.skills[it.skill].box < 2) return 'evidence below box 2';
    }
    let intro = 0;
    for (const id of Object.keys(after.skills)) {
      const b0 = before.skills[id]; const b1 = after.skills[id];
      if (b0.seen && Math.abs(b1.box - b0.box) > 1) return `box jump ${id}`;
      if (b0.mastered && !b1.mastered) return 'mastery revoked';
      if (b1.evidence.length < b0.evidence.length) return 'EP revoked';
      for (let k = 1; k < b1.evidence.length; k++) if (b1.evidence[k].day - b1.evidence[k - 1].day < 2) return 'gap';
      if (!b0.seen && b1.seen && !b1.placed && !b1.inferred) {
        intro++;
        const d = def.get(id);
        const ok = (ps) => ps.every((p) => before.skills[p].seen && before.skills[p].box >= 1);
        if (!ok(d.pre) && !(d.sliceGate && ok(d.sliceGate.pre))) return `unlock without prereqs ${id}`;
      }
    }
    if (intro > 2 || intro !== plan.newSkills.length) return `new skills ${intro}`;
    if (after.shards < before.shards) return 'shards fell';
    return null;
  });
  assert.deepEqual(bad, []);
});

test('DEFECT: choice items exceed 50% of the run as served (Whys, Echoes, closer retries)', () => {
  const bad = seasons(20, ({ served }) => {
    const ch = served.filter((x) => !x.a.problem.constructed).length;
    return 2 * ch > served.length ? `${ch}/${served.length}` : null;
  });
  assert.deepEqual(bad, []);
});

test('DEFECT: Boss Knot is not always symbol-only (section 8)', () => {
  const bad = seasons(20, ({ served }) => {
    const b = served.find((x) => x.it.kind === 'boss');
    return b && b.it.fadeLevel !== 3 ? `${b.it.skill} fade ${b.it.fadeLevel}` : null;
  });
  assert.deepEqual(bad, []);
});
