// Episode 3's new problems (fractions), checked against arithmetic done independently here,
// and the pure tower-defense rules in game/siege.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { problem, count, SKILLS } from '../episodes/siege3-skills.js';

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const text = (html) => String(html).replace(/<[^>]*>/g, ' ');

test('every fraction problem: right answer, lowest terms, believable distinct slips, grading', () => {
  assert.equal(SKILLS.frac.forms, 2);
  for (const form of [0, 1]) {
    assert.ok(count('frac', form) >= 30, `form ${form} has plenty of number sets`);
    const asks = new Set();
    for (let n = 0; n < count('frac', form); n++) {
      const p = problem('frac', form, n);
      const m = /^(\d+)\/(\d+) ([+-]) (\d+)\/(\d+)$/.exec(p.askTxt);
      assert.ok(m, p.askTxt);
      const [a, b, c, d] = [m[1], m[2], m[4], m[5]].map(Number);
      const sg = m[3] === '+' ? 1 : -1;
      // independent arithmetic: cross-multiply, then reduce
      const top = a * d + sg * c * b, bot = b * d, g = gcd(top, bot);
      assert.deepEqual(p.answer, [top / g, bot / g], p.askTxt);
      assert.equal(p.ansTxt, `${top / g}/${bot / g}`);
      assert.ok(top > 0 && bot / g > 1, 'positive, and not a whole number');
      assert.ok(a < b && c < d && gcd(a, b) === 1 && gcd(c, d) === 1, 'the fractions asked about are proper and already reduced');
      if (form === 0) assert.equal(d % b, 0, 'form 0: one bottom is a multiple of the other');
      else assert.equal(gcd(b, d), 1, 'form 1: the bottoms share no factor');
      assert.ok(!asks.has(p.askTxt), 'no repeats'); asks.add(p.askTxt);

      const right = p.options.filter((o) => o.right);
      const wrong = p.options.filter((o) => !o.right);
      assert.equal(right.length, 1);
      assert.ok(wrong.length >= 3 && wrong.length <= 4, `${p.askTxt}: ${wrong.length} slips`);
      const vals = p.options.map((o) => o.num.toFixed(9));
      assert.equal(new Set(vals).size, vals.length, 'no two choices have the same value');
      assert.equal(new Set(p.options.map((o) => o.txt)).size, p.options.length);
      for (const o of wrong) {
        assert.ok(o.num > 0 && Math.abs(o.num - top / bot) > 1e-9, 'a slip is positive and is not the answer');
        assert.ok(o.slip.length > 20 && o.guess.length >= 2 && /class="bad"/.test(o.guess.join('')), 'each slip shows its working with the slip marked');
        // typing a slip's value is recognised as that slip
        const [sn, sd] = o.txt.includes('/') ? o.txt.split('/').map(Number) : [Number(o.txt), 1];
        assert.equal(p.grade([sn, sd]).id, o.id);
      }
      assert.deepEqual(p.grade(p.answer), { ok: true });
      const un = p.grade([p.answer[0] * 2, p.answer[1] * 2]);
      assert.ok(un.near && !un.ok, 'an unreduced right value is "not finished", not a miss');
      assert.equal(p.grade([p.answer[0] + 1, p.answer[1]]).ok, false);
      assert.equal(p.grade([p.answer[0], 0]).ok, false, 'a zero bottom is just wrong');
      assert.match(p.worked.join(''), /class="good"/);
      assert.ok(!/undefined|NaN|Infinity/.test(text([p.ask, p.typed, ...p.worked, ...wrong.flatMap((o) => [o.slip, ...o.guess])].join(' '))), p.askTxt);
      assert.equal(p.gotTxt([3, 4]), '3/4');
    }
  }
});

test('episode 2 skills are still served, and problem numbers wrap in both directions', () => {
  assert.equal(problem('dist', 0, 0).askTxt, problem('dist', 0, count('dist', 0)).askTxt);
  assert.equal(problem('dist', 0, -1).askTxt, problem('dist', 0, count('dist', 0) - 1).askTxt);
  assert.equal(problem('frac', 1, -1).askTxt, problem('frac', 1, count('frac', 1) - 1).askTxt);
});

// ---------------------------------------------------------------- the corridor rules
const { newWave, answer, front, plateOf } = await import('../game/siege.js');
const one = (skill = 'dist') => ({ plates: [{ skill, form: 0 }] });
const O = { lane: 6, pack: 3, shutters: 3 };
const poss = (w) => w.drones.map((d) => d.pos);

test('corridor: a wave starts with a pack, and nothing moves until an answer is entered', () => {
  const w = newWave([one(), one(), one(), one(), one()], O);
  assert.deepEqual(poss(w), [4, 5, 6]);
  assert.equal(w.queue.length, 2);
  assert.equal(front(w).pos, 4);
  assert.equal(newWave([one()], O).drones[0].pos, 6, 'a lone drone starts at the far end');
});

test('corridor: right answers hold the line, wrong answers give ground', () => {
  const w = newWave(Array.from({ length: 8 }, () => one()), O);
  // all right, always the front one: the front never gets closer than where it started
  for (let i = 0; i < 4; i++) {
    const ev = answer(w, front(w).id, true);
    assert.equal(ev[0].t, 'down');
    assert.equal(front(w).pos, 4);
  }
  // each miss lets the whole line take one step, for good
  for (let i = 1; i <= 3; i++) {
    const d = front(w);
    d.ref = { n: 1 };
    const ev = answer(w, d.id, false);
    assert.equal(ev[0].t, 'miss');
    assert.equal(d.ref, null, 'a missed drone needs new numbers');
    assert.equal(front(w).pos, 4 - i);
  }
  // the next miss walks the front drone into the case
  const ev = answer(w, w.drones.at(-1).id, false);
  assert.ok(ev.some((e) => e.t === 'breach'));
  assert.equal(w.shutters, 2);
  assert.equal(w.breaches, 1);
});

test('corridor: a wave is won when nothing is left, lost when the shutters run out', () => {
  const w = newWave([one(), one()], O);
  answer(w, w.drones[0].id, true);
  assert.equal(w.over, '');
  answer(w, w.drones[0].id, true);
  assert.equal(w.over, 'won');
  assert.deepEqual(answer(w, 99, true), [], 'nothing happens after the end');

  const l = newWave(Array.from({ length: 12 }, () => one()), { ...O, shutters: 2 });
  let n = 0;
  while (!l.over) { answer(l, l.drones.at(-1).id, false); assert.ok(++n < 30); }
  assert.equal(l.over, 'lost');
  assert.equal(l.breaches, 2);
  // a wave can also end on a miss that walks the last drone into the case with shutters to spare
  const e = newWave([one()], { lane: 1, pack: 1, shutters: 3 });
  answer(e, e.drones[0].id, false);
  assert.equal(e.over, 'won');
});

test('corridor: glue holds a drone one extra move, once; the fan blows back on a solve', () => {
  const g = newWave([one(), one()], { lane: 6, pack: 1, shutters: 3 });
  const d = g.drones[0];
  // drive with misses on the drone itself, so only movement is being tested
  const miss = () => answer(g, d.id, false, { 5: 'glue' });
  assert.ok(miss().some((e) => e.t === 'held'));
  assert.equal(d.pos, 5);
  miss();
  assert.equal(d.pos, 5, 'held for one extra move');
  miss();
  assert.equal(d.pos, 4);
  assert.deepEqual(d.glued, [5]);

  const f = newWave([one(), one(), one()], O);
  const [a, b] = f.drones; // at 4 and 5
  const ev = answer(f, b.id, true, { 4: 'fan' });
  assert.ok(ev.some((e) => e.t === 'blown' && e.id === a.id));
  assert.equal(a.pos, 5, 'blown back two, then one step forward');
});

test('corridor: the big one has several plates and moves on every second answer', () => {
  const w = newWave([{ boss: true, plates: [{ skill: 'dist', form: 2 }, { skill: 'solve', form: 2 }, { skill: 'frac', form: 1 }] }], O);
  const d = w.drones[0];
  assert.equal(plateOf(d).skill, 'dist');
  assert.equal(answer(w, d.id, true)[0].t, 'crack');
  assert.equal(plateOf(d).skill, 'solve');
  assert.equal(d.pos, 6, 'no step on the first answer');
  answer(w, d.id, false);
  assert.equal(d.pos, 5);
  answer(w, d.id, true);
  assert.equal(w.over, '');
  answer(w, d.id, true);
  assert.equal(w.over, 'won');
  assert.equal(w.kills, 1);
});

test('corridor: a wave is plain data and survives a save and reload half-way', () => {
  const w = newWave([one(), one('solve'), one(), one()], O);
  answer(w, w.drones[0].id, true, { 4: 'glue' });
  const copy = JSON.parse(JSON.stringify(w));
  answer(w, w.drones[0].id, false, { 4: 'glue' });
  answer(copy, copy.drones[0].id, false, { 4: 'glue' });
  assert.deepEqual(copy, w);
});

// ---------------------------------------------------------------- what a wave sends
const { makePlan } = await import('../ep3.js');
const { content, TUNING } = await import('../episodes/siege3.js');
const att = (oks, days = ['2026-11-01']) => oks.map((ok, i) => ({ d: days[i % days.length], ok, ms: 1, where: 't' }));
const SOLID = att([true, true, true, true, true], ['2026-11-01', '2026-11-02']);
const FLUENT = att([true, true, true]);
const SHAKY = att([true, false, false]);

test('plan: a wave sends more drones, and re-teaches, where a skill is not solid', () => {
  const [w1, w2, w3, w4] = content.waves;
  const cold = makePlan(w1, {});
  assert.deepEqual(cold.levels, { dist: 'none', solve: 'none' });
  assert.equal(cold.specs.length, 6);
  assert.deepEqual(cold.scouts.map((s) => `${s.skill}${s.form}`), ['dist0', 'dist1', 'dist2', 'solve0', 'solve1', 'solve2']);
  assert.deepEqual(cold.specs.slice(0, 2).map((s) => s.plates[0].skill), ['dist', 'solve'], 'skills are mixed, not in blocks');

  const mixed = makePlan(w1, { dist: SOLID, solve: SHAKY });
  assert.deepEqual(mixed.levels, { dist: 'mastered', solve: 'practicing' });
  assert.equal(mixed.specs.filter((s) => s.plates[0].skill === 'dist').length, 1);
  assert.equal(mixed.specs.filter((s) => s.plates[0].skill === 'solve').length, 3);
  assert.ok(mixed.scouts.every((s) => s.skill === 'solve'), 'only the shaky skill is re-taught');
  assert.deepEqual(mixed.specs.find((s) => s.plates[0].skill === 'dist').plates[0], { skill: 'dist', form: 2 }, 'one drone: the hardest shape');

  const done = makePlan(w1, { dist: SOLID, solve: SOLID });
  assert.equal(done.scouts.length, 0);
  assert.equal(done.specs.length, TUNING.minWave, 'a student who has mastered everything still gets a wave');

  const fl = makePlan(w2, { simplify: FLUENT, rationalize: FLUENT });
  assert.equal(fl.specs.length, 4);
  assert.equal(fl.scouts.length, 0);

  const nw = makePlan(w3, { dist: SOLID });
  assert.deepEqual(nw.scouts, [{ skill: 'frac', form: 0 }, { skill: 'frac', form: 1 }]);
  assert.equal(nw.specs.length, TUNING.fresh);

  // last wave: the three weakest skills, at most two escorts each, then the Chairman carrying one plate from each
  const last = makePlan(w4, { dist: SOLID, solve: SHAKY, simplify: SOLID, rationalize: FLUENT, frac: FLUENT });
  assert.deepEqual(Object.keys(last.levels), ['solve', 'rationalize', 'frac']);
  const boss = last.specs.at(-1);
  assert.ok(boss.boss);
  assert.deepEqual(boss.plates.map((p) => p.skill), ['solve', 'rationalize', 'frac']);
  assert.ok(last.specs.slice(0, -1).filter((s) => s.plates[0].skill === 'solve').length <= 2);
});

test('plan: TUNING.force overrides the log, and a wave with nothing to send is passed over', () => {
  const [w1] = content.waves;
  TUNING.force = { dist: 5, solve: 0 };
  try {
    const p = makePlan(w1, { dist: SOLID });
    assert.equal(p.specs.length, 5);
    assert.ok(p.specs.every((s) => s.plates[0].skill === 'dist'));
    TUNING.force = { dist: 0, solve: 0 };
    assert.equal(makePlan(w1, {}).specs.length, 0);
  } finally {
    TUNING.force = {};
  }
});

test('fractions: the size of an answer does not give it away', () => {
  for (const form of [0, 1]) {
    let big = 0, small = 0;
    const N = count('frac', form);
    for (let n = 0; n < N; n++) {
      const p = problem('frac', form, n);
      const nums = p.options.map((o) => o.num);
      const right = p.options.find((o) => o.right).num;
      if (right === Math.max(...nums)) big++;
      if (right === Math.min(...nums)) small++;
    }
    assert.ok(big / N < 0.5, `form ${form}: the right answer is the largest choice in ${big} of ${N}`);
    assert.ok(small / N < 0.5, `form ${form}: the right answer is the smallest choice in ${small} of ${N}`);
  }
});

test('dealing: episode 3 never hands out numbers episode 2 used, and says so when a short list runs out', async () => {
  const { dealIndex } = await import('../ep3.js');
  // a list of 8, form 1, episode 2 used the first 3: five are free, dealt from the back
  const got = Array.from({ length: 7 }, (_, k) => dealIndex(8, 1, 3, k));
  assert.deepEqual(got.map((g) => g.n), [7, 6, 5, 4, 3, 7, 6]);
  assert.deepEqual(got.map((g) => g.again), [false, false, false, false, false, true, true]);
  // form 0 also keeps clear of the last problem, which episode 2 showed on a demo card
  assert.deepEqual([0, 1, 2].map((k) => dealIndex(11, 0, 4, k).n), [9, 8, 7]);
  assert.ok(Array.from({ length: 40 }, (_, k) => dealIndex(11, 0, 4, k).n).every((n) => n >= 4 && n <= 9));
  // everything already used: still deals something, flagged
  assert.deepEqual(dealIndex(8, 1, 8, 0), { n: 7, again: false });
  assert.equal(dealIndex(8, 1, 8, 1).again, true);
});

test('plan: the big drone only carries skills this wave is sending', () => {
  const w4 = content.waves[3];
  TUNING.force = { dist: 0 };
  try {
    const p = makePlan(w4, {});
    assert.ok(Object.keys(p.levels).includes('dist'), 'dist is among the weakest');
    assert.ok(p.specs.at(-1).boss);
    assert.ok(p.specs.at(-1).plates.every((pl) => pl.skill !== 'dist'), 'but with no drones and no scout, it is not on the big drone');
  } finally {
    TUNING.force = {};
  }
});
