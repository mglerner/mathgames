// @ts-check
// Guesser simulation (DESIGN.md section 11): a student who taps uniformly at
// random and types garbage gains no box, no EP, no mastery Why, and no shards
// from idle or risky moves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skills } from '../../src/data/skills.js';
import { shardsFor } from '../../src/learner/season.js';
import { stubRegistry, stubGenerator } from './stubs.js';
import { simulate, guesser } from './sim.js';
import { replay } from '../../src/learner/model.js';
import { forSeeds } from '../prop.js';
import { logBuilder } from '../learner/helpers.js';

/** @typedef {import('../../types.d.ts').Attempt} Attempt */

/** Every skill also offers Cast (served from box 2, so a guesser rarely meets it; see the next test). */
const REG = [...stubRegistry(), ...skills.map((d) => stubGenerator(`cast.${d.id}`, d.id, [1, 4], ['cast']))];

test('guesser: 50 seasons of 66 days gain no box, no EP, no counting Why, no mastery', () => {
  let attempts = 0;
  let idleOrRisky = 0;
  for (let i = 0; i < 50; i++) {
    const r = simulate({ seed: `guess${i}`, days: 66, student: guesser(), registry: REG });
    const st = r.state;
    for (const d of skills) {
      const sk = st.skills[d.id];
      assert.equal(sk.box, 0, `${d.id} box`);
      assert.equal(sk.evidence.length, 0, `${d.id} EP`);
      assert.equal(sk.countingWhy, false, `${d.id} Why`);
      assert.equal(sk.mastered, false);
      assert.equal(sk.placed || sk.inferred, false, 'no Charting placement');
    }
    let shards = 0;
    for (const e of r.events) {
      if (e.type !== 'attempt') continue;
      const a = /** @type {Attempt} */ (e.data);
      attempts++;
      const s = shardsFor(a);
      if (a.verdict === 'legal-idle' || a.verdict === 'risky') { idleOrRisky++; assert.equal(s, 0, 'shards for an idle or risky move'); }
      if (a.problem.constructed) assert.notEqual(a.verdict, 'correct');
      shards += s;
    }
    assert.equal(st.shards, shards, 'every shard is accounted for by a correct tap');
    assert.equal(r.endedOnWin, r.runs, 'even a guesser ends every run on a win (the closer escalates to choice items)');
  }
  assert.ok(attempts > 10000);
  // At box 0 the planner serves no Cast, so the season simulation rarely or
  // never meets idle/risky verdicts; the next test covers them directly.
  void idleOrRisky;
});

test('guesser on Cast items through the reducer: idle and risky moves pay nothing, ever', () => {
  forSeeds(2000, (rng) => {
    const b = logBuilder();
    let expected = 0;
    for (let d = 0; d < 5; d++) {
      b.day(d).start();
      for (let i = 0; i < 12; i++) {
        const verdict = rng.pick(/** @type {Attempt['verdict'][]} */ (['correct', 'legal-idle', 'risky', 'wrong']));
        const firstTry = rng.bool(0.7);
        if (verdict === 'correct') expected += firstTry ? 2 : 1;
        b.attempt(rng.pick(['balance-moves', 'solve-linear']), { interaction: 'cast', constructed: rng.bool(0.2), verdict, firstTry, context: rng.pick(['mixed', 'boss', 'echo']) });
      }
      b.end();
    }
    const st = replay(b.events);
    assert.equal(st.shards, expected);
    for (const id of ['balance-moves', 'solve-linear']) {
      assert.equal(st.skills[id].box, 0, 'Cast never moves a box, even mislabelled constructed');
      assert.equal(st.skills[id].evidence.length, 0);
    }
  }, { prefix: 'cast' });
});
