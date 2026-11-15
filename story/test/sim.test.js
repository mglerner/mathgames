// Checks the running sections: every level can be cleared, is fairly spaced,
// stumbling works, and the drawing code runs without throwing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, tick, jump, slide, resume, STEP, SHAPES, PLAYER_W } from '../game/sim.js';
import { levels } from '../game/levels.js';
import { levels2 } from '../game/levels2.js';
import { drawRun } from '../game/draw.js';
import { episode } from '../episodes/pilot.js';

/** Play a level with a simple rule: act when the next obstacle is `lead` units away. */
function play(level, lead, maxSeconds = 120) {
  const r = createRun(level);
  for (let n = 0; n < maxSeconds / STEP && !r.done; n++) {
    if (r.paused) resume(r);
    const next = level.obstacles.find((o) => o.x + (SHAPES[o.kind].w + PLAYER_W) / 2 > r.x);
    if (next && next.x - r.x <= lead) (next.kind === 'low' ? jump : slide)(r);
    tick(r);
  }
  return r;
}

test('one running section per lock, plus the getaway', () => {
  assert.equal(levels.length, episode.problems.length + 1);
  assert.equal(new Set(levels.map((l) => l.id)).size, levels.length);
});

for (const level of [...levels, ...levels2]) {
  test(`${level.id}: clearable with no stumbles across a range of timings`, () => {
    // A player who reacts anywhere from early to late still gets through clean.
    for (const lead of [32, 45, 55, 62]) {
      const r = play(level, lead);
      assert.ok(r.done, `lead ${lead} finishes`);
      assert.equal(r.hits, 0, `lead ${lead} clean`);
    }
  });

  test(`${level.id}: doing nothing stumbles but never ends or breaks the run`, () => {
    const r = createRun(level);
    for (let n = 0; n < 30 / STEP; n++) { if (r.paused) resume(r); tick(r); }
    assert.ok(r.hits > 0);
    assert.ok(!r.done);
    assert.ok(r.x >= 0 && r.x < level.obstacles[0].x);
  });

  test(`${level.id}: fair spacing`, () => {
    const xs = level.obstacles.map((o) => o.x);
    assert.ok(xs[0] >= 250, 'room before the first obstacle');
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 160, `gap before obstacle ${i}`);
    assert.ok(level.length - xs.at(-1) >= 100, 'room after the last obstacle');
    // at least 1.1 seconds of warning between obstacles at this level's speed
    for (let i = 1; i < xs.length; i++) assert.ok((xs[i] - xs[i - 1]) / level.speed >= 1.0);
    for (const b of level.beats) {
      const next = xs.find((x) => x > b.x);
      assert.ok(next === undefined || next - b.x >= 150, 'a beat never pauses right on top of an obstacle');
      assert.ok(!xs.some((x) => Math.abs(x - b.x) < 40));
    }
  });

  test(`${level.id}: a stumble puts you back with a fair run-up, and you can then clear it`, () => {
    const r = createRun(level);
    while (r.hits === 0) { if (r.paused) resume(r); tick(r); }
    const first = level.obstacles[0];
    assert.ok(first.x - r.x >= 150);
    // now play properly from the stumble
    for (let n = 0; n < 120 / STEP && !r.done; n++) {
      if (r.paused) resume(r);
      const next = level.obstacles.find((o) => o.x + 20 > r.x);
      if (next && next.x - r.x <= 45) (next.kind === 'low' ? jump : slide)(r);
      tick(r);
    }
    assert.ok(r.done);
    assert.equal(r.hits, 1);
  });

  test(`${level.id}: wrong move is punished (jumping a high one, sliding a low one)`, () => {
    const r = createRun(level);
    for (let n = 0; n < 20 / STEP && r.hits === 0; n++) {
      if (r.paused) resume(r);
      const next = level.obstacles.find((o) => o.x + 20 > r.x);
      if (next && next.x - r.x <= 45) (next.kind === 'low' ? slide : jump)(r);
      tick(r);
    }
    assert.equal(r.hits, 1);
  });

  test(`${level.id}: every frame draws without throwing`, () => {
    const calls = { n: 0 };
    const grad = { addColorStop() {} };
    const ctx = new Proxy({}, {
      get: (_, k) => (k === 'createLinearGradient' ? () => grad : () => { calls.n++; }),
      set: () => true,
    });
    const r = createRun(level);
    for (let n = 0; n < 60 / STEP && !r.done; n++) {
      if (r.paused) { drawRun(ctx, r); resume(r); }
      const next = level.obstacles.find((o) => o.x + 20 > r.x);
      // alternate right and wrong moves so stumbles, slides and jumps all get drawn
      if (next && next.x - r.x <= 45) (((next.kind === 'low') === (r.hits % 2 === 0)) ? slide : jump)(r);
      tick(r);
      if (n % 7 === 0) drawRun(ctx, r);
    }
    assert.ok(calls.n > 1000);
  });
}
