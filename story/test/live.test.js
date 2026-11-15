// Rules of episode 3's live corridor (game/live.js), with no page and no math.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newLive, step, answerPlate, reach, pointAt, PATH, PATH_LEN, SOCKETS } from '../game/live.js';
import { drawLive, squadAt, socketAt } from '../game/drawlive.js';

const O = { size: 3, hp: 4, bossHp: 10, speed: 24, gap: 12, lives: 6, surge: 140, range: 80, rate: 0.8, slow: 0.45, fanPush: 160 };
const plain = (n) => Array.from({ length: n }, () => ({ plates: [{ skill: 'dist', form: 0 }] }));
const run = (w, secs, towers = {}) => { const ev = []; for (let i = 0; i < secs * 20 && !w.over; i++) ev.push(...step(w, 0.05, towers)); return ev; };

test('live: the path is measured correctly and every spot covers some of it', () => {
  assert.deepEqual(pointAt(0), { x: PATH[0][0], y: PATH[0][1] });
  const end = pointAt(PATH_LEN);
  assert.deepEqual([end.x, end.y], PATH.at(-1));
  for (const [sx, sy] of SOCKETS) {
    let covered = 0;
    for (let d = 0; d < PATH_LEN; d += 2) { const p = pointAt(d); if (Math.hypot(p.x - sx, p.y - sy) <= O.range) covered += 2; }
    assert.ok(covered > 120, `spot at ${sx},${sy} covers ${covered} of path`);
  }
});

test('live: a shielded formation cannot be hurt, and walks to the case', () => {
  const w = newLive(plain(1), O);
  const towers = { 0: 'launcher', 1: 'launcher', 2: 'launcher', 3: 'launcher', 4: 'launcher', 5: 'launcher' };
  const ev = run(w, 80, towers);
  assert.ok(!ev.some((e) => e.t === 'shot'), 'nothing fires at a shield');
  assert.equal(w.breaches, 3);
  assert.equal(w.lives, O.lives - 3);
  assert.equal(w.over, 'won', 'the wave ends when nothing is left, and three got through of six allowed');
});

test('live: a right answer drops the shield and launchers finish the job; no launcher, no kill', () => {
  const w = newLive(plain(1), O);
  run(w, 2);
  const id = w.squads[0].id;
  answerPlate(w, id, true);
  assert.equal(w.squads[0].shield, false);
  const ev = run(w, 80, { 0: 'launcher', 3: 'launcher' });
  assert.equal(ev.filter((e) => e.t === 'shot').length, 3 * O.hp);
  assert.deepEqual([w.kills, w.breaches, w.over], [3, 0, 'won']);

  const w2 = newLive(plain(1), O);
  run(w2, 2);
  answerPlate(w2, w2.squads[0].id, true);
  run(w2, 80, { 0: 'wax', 3: 'fan' });
  assert.deepEqual([w2.kills, w2.breaches], [0, 3], 'wax and fans do no damage');
  // and no set of them can hold a drone forever
  const w3 = newLive(plain(1), O);
  run(w3, 400, { 0: 'fan', 1: 'fan', 2: 'fan', 3: 'wax', 4: 'fan', 5: 'fan' });
  assert.equal(w3.breaches, 3);
});

test('live: a wrong answer surges the formation forward, keeps the shield, and asks for a new problem', () => {
  const w = newLive(plain(1), O);
  run(w, 5);
  const s = w.squads[0];
  s.ref = { any: 1 };
  const before = reach(s);
  answerPlate(w, s.id, false);
  assert.equal(reach(s), before + O.surge);
  assert.equal(s.shield, true);
  assert.equal(s.ref, null);
  // a surge never jumps past the end without a step being taken
  for (let i = 0; i < 20; i++) answerPlate(w, s.id, false);
  assert.ok(reach(s) < PATH_LEN);
  assert.equal(w.breaches, 0);
});

test('live: wax slows, a fan blows back, and six drones through loses the wave', () => {
  const a = newLive(plain(1), O), b = newLive(plain(1), O), c = newLive(plain(1), O);
  run(a, 20); run(b, 20, { 0: 'wax' }); run(c, 20, { 0: 'fan' });
  assert.ok(reach(b.squads[0]) < reach(a.squads[0]) - 30, 'wax');
  assert.ok(reach(c.squads[0]) < reach(a.squads[0]) - 100, 'fan');
  const w = newLive(plain(3), O);
  run(w, 200);
  assert.equal(w.over, 'lost');
  assert.equal(w.lives, 0);
});

test('live: formations arrive a gap apart, or at once when the path is empty', () => {
  const w = newLive(plain(3), O);
  step(w, 0.05, {});
  assert.equal(w.squads.length, 1);
  run(w, O.gap - 1);
  assert.equal(w.squads.length, 1);
  run(w, 2);
  assert.equal(w.squads.length, 2);
});

test('live: the big one takes one plate of damage at a time, then puts its shield back', () => {
  const w = newLive([{ boss: true, plates: [{ skill: 'a', form: 0 }, { skill: 'b', form: 0 }, { skill: 'c', form: 0 }] }], O);
  const towers = { 0: 'launcher', 1: 'launcher', 2: 'launcher', 3: 'launcher', 4: 'launcher', 5: 'launcher' };
  run(w, 1);
  const s = w.squads[0];
  assert.equal(s.drones[0].hp, 3 * O.bossHp);
  for (let plate = 1; plate <= 3; plate++) {
    assert.equal(s.shield, true, `shield is up before plate ${plate}`);
    answerPlate(w, s.id, true);
    let guard = 0;
    while (!s.shield && !w.over && guard++ < 4000) step(w, 0.05, towers);
    if (plate < 3) assert.equal(s.drones[0].hp, 3 * O.bossHp - plate * O.bossHp);
  }
  assert.deepEqual([w.over, w.kills, w.breaches], ['won', 1, 0]);
});

test('live: a wave is plain data and survives being saved', () => {
  const w = newLive(plain(2), O);
  run(w, 14, { 0: 'launcher' });
  const copy = JSON.parse(JSON.stringify(w));
  assert.deepEqual(copy, w);
  run(copy, 5, { 0: 'launcher' }); run(w, 5, { 0: 'launcher' });
  assert.deepEqual(copy, w);
});

test('live: every frame draws without throwing, and taps find formations and spots', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (...a) => { calls.push(k); return a; }, set: () => true });
  const w = newLive([...plain(2), { boss: true, plates: [{ skill: 'frac', form: 0 }, { skill: 'solve', form: 0 }] }], O);
  const towers = { 0: 'launcher', 1: 'wax', 2: 'fan' };
  drawLive(ctx, null, towers, { lives: 6, range: O.range });
  const fx = [];
  for (let i = 0; i < 1200 && !w.over; i++) {
    if (i === 100) answerPlate(w, w.squads[0].id, true);
    for (const e of step(w, 0.05, towers)) fx.push({ ...e, at: i * 50 });
    drawLive(ctx, w, towers, { lives: w.lives, now: i * 50, target: w.squads[0]?.id, fx });
  }
  assert.ok(calls.length > 1000);
  const w2 = newLive(plain(1), O);
  for (let i = 0; i < 100; i++) step(w2, 0.05, {});
  const p = pointAt(reach(w2.squads[0]));
  assert.equal(squadAt(w2, p.x, p.y)?.id, w2.squads[0].id);
  assert.equal(squadAt(w2, p.x, p.y + 120), null);
  answerPlate(w2, w2.squads[0].id, true);
  assert.equal(squadAt(w2, p.x, p.y), null, 'a formation with its shield down has no plate to open');
  assert.equal(socketAt(...SOCKETS[4]), 4);
  assert.equal(socketAt(5, 5), null);
});
