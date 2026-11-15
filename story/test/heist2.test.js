// Checks every generated episode 2 problem against math done a different way:
// the plain-text form of each problem and answer is evaluated numerically here,
// independently of the algebra the generator used to build it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { problem, count, SKILLS } from '../episodes/heist2-skills.js';
import { content } from '../episodes/heist2.js';
import { levels2 } from '../game/levels2.js';
import { status } from '../mastery.js';
import { createRun, tick, jump, resume, STEP } from '../game/sim.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;
/** Evaluate plain-text math like "7 - 2(x - 3)" or "12/(2 sqrt(3))" at a value of x. */
function ev(txt, x = 0) {
  const js = txt.replace(/sqrt/g, 'Math.sqrt')
    .replace(/(\d)\s*(x|\(|Math)/g, '$1*$2')
    .replace(/-\(/g, '-1*(')
    .replace(/(^|[^\w.])-x/g, '$1-1*x');
  return new Function('x', `return (${js});`)(x);
}
const XS = [-3, 0, 2, 7];
const isRight = {
  dist: (p, o) => XS.every((x) => near(ev(p.askTxt, x), ev(o.txt, x))),
  solve: (p, o) => {
    const [l, r] = p.askTxt.split('=');
    const x = ev(o.txt.split('=')[1]);
    return near(ev(l, x), ev(r, x));
  },
  simplify: (p, o) => near(ev(p.askTxt), ev(o.txt)),
  rationalize: (p, o) => near(ev(p.askTxt), ev(o.txt)),
};
/** The typed entry that should be accepted, read off the plain-text answer. */
function rightVals(p) {
  if (p.skill === 'dist') return p.options.find((o) => o.right).vals;
  if (p.skill === 'solve') return [Number(p.ansTxt.split('=')[1])];
  const m = /^(\d+) sqrt\((\d+)\)$/.exec(p.ansTxt);
  return [Number(m[1]), Number(m[2])];
}
const squareFree = (n) => { for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) return false; return true; };

test('sanity: the evaluator itself', () => {
  assert.equal(ev('7 - 2(x - 3)', 5), 3);
  assert.equal(ev('-(3x - 4)', 2), -2);
  assert.equal(ev('-x + 5', 2), 3);
  assert.ok(near(ev('12/(2 sqrt(3))'), 2 * Math.sqrt(3)));
  assert.equal(ev(' -7/2'), -3.5);
});

for (const [skill, info] of Object.entries(SKILLS)) {
  for (let form = 0; form < info.forms; form++) {
    test(`${skill} form ${form}: every problem (${count(skill, form)}) is right, and its wrong answers are wrong`, () => {
      assert.ok(count(skill, form) >= 8, 'enough fresh number sets');
      const asks = new Set();
      for (let n = 0; n < count(skill, form); n++) {
        const p = problem(skill, form, n);
        asks.add(p.askTxt);
        const right = p.options.filter((o) => o.right);
        assert.equal(right.length, 1, p.askTxt);
        assert.ok(isRight[skill](p, right[0]), `${p.askTxt} -> ${right[0].txt}`);
        assert.equal(right[0].txt, p.ansTxt);
        const wrong = p.options.filter((o) => !o.right);
        assert.ok(wrong.length >= 3 && wrong.length <= 4, `${p.askTxt}: ${wrong.length} wrong options`);
        for (const o of wrong) {
          assert.ok(!isRight[skill](p, o), `${p.askTxt}: ${o.txt} must be wrong`);
          assert.ok(o.slip && o.guess.length, o.txt);
          assert.ok(o.guess.join('').includes('class="bad"'), `${p.askTxt}: ${o.txt} marks the slip`);
        }
        assert.equal(new Set(p.options.map((o) => o.txt)).size, p.options.length, p.askTxt);
        assert.equal(new Set(p.options.map((o) => o.html)).size, p.options.length, p.askTxt);
        assert.ok(p.worked.join('').includes('class="good"'));
        const all = [p.ask, p.typed, ...p.worked, p.quick || '', ...p.options.flatMap((o) => [o.html, o.slip || '', ...(o.guess || [])])].join(' ');
        assert.ok(!/NaN|undefined|Infinity|--|\+ -/.test(all.replace(/<[^>]*>/g, '')), p.askTxt);
        // typed answers
        assert.equal((p.typed.match(/\{\d\}/g) || []).length, p.boxes);
        const rv = rightVals(p);
        assert.deepEqual(p.grade(rv), { ok: true }, `${p.askTxt} accepts ${rv}`);
        if (skill === 'simplify' || skill === 'rationalize') assert.ok(squareFree(rv[1]), `${p.ansTxt} is fully simplified`);
        for (const o of wrong) {
          if (!o.vals) continue;
          const g = p.grade(o.vals);
          assert.equal(g.ok, false);
          assert.equal(g.slip, o.slip, 'a typed slip gets the same explanation as the matching choice');
        }
        const junk = p.grade(Array(p.boxes).fill(999));
        assert.ok(junk.ok === false && junk.slip);
      }
      assert.equal(asks.size, count(skill, form), 'no repeated problems within a form');
    });
  }
}

test('distributing: the lone-minus slip is offered, and typed boxes carry their own sign', () => {
  for (let n = 0; n < count('dist', 1); n++) {
    const p = problem('dist', 1, n);
    assert.ok(p.options.some((o) => /applies to every term inside/.test(o.slip || '')), p.askTxt);
  }
  for (let f = 0; f < 3; f++) {
    const p = problem('dist', f, 0);
    assert.deepEqual(p.signed, [1]);
    assert.ok(/\{s1\}\{1\}/.test(p.typed), 'the second term has a sign slot, then a box for the size');
    assert.ok(!/(^|[^\d])[01]x/.test(p.gotTxt([1, -4]) + p.gotTxt([-1, 4])));
  }
});

test('typed answers with the right value but the wrong form are not accepted', () => {
  for (let n = 0; n < count('simplify', 1); n++) {
    const p = problem('simplify', 1, n);
    const [s, m] = rightVals(p);
    const g = p.grade([s / 2, 4 * m]); // e.g. sqrt(72) typed as 3 sqrt(8)
    assert.equal(g.ok, false);
    assert.equal(g.near, true, 'flagged so the game can hand the same problem back without a miss');
    assert.match(g.slip, /Right value/);
  }
});

test('episode structure: four floors, a door for every shape its lock can ask, valid skills and levels', () => {
  assert.equal(content.floors.length, 4);
  const ids = new Set(levels2.map((l) => l.id));
  for (const f of content.floors) {
    assert.ok(SKILLS[f.skill]);
    assert.deepEqual(f.doors.map((d) => d.form).sort(), Array.from({ length: SKILLS[f.skill].forms }, (_, i) => i), `${f.name}: every form is taught at a door`);
    assert.equal(new Set(f.doors.map((d) => d.id)).size, f.doors.length);
    for (const d of f.doors) {
      assert.ok(d.form < SKILLS[f.skill].forms);
      assert.ok(d.story.length && d.win.length && d.setbacks.length >= 4);
    }
    assert.ok(f.lock.story.length && f.lock.open.length && f.lock.bypass.length);
    for (const r of f.runs) assert.ok(ids.has(r), r);
  }
  assert.ok(ids.has('getaway2'));
  assert.equal(new Set(content.floors.map((f) => f.skill)).size, 4);
});

test('mastery rule', () => {
  const e = (d, ok) => ({ d, ok, ms: 1, where: 't' });
  assert.equal(status([]).code, 'none');
  assert.equal(status([e('a', true), e('a', false)]).code, 'practicing');
  assert.equal(status([e('a', false), e('a', true), e('a', true), e('a', true)]).code, 'fluent');
  // five right in one day is fluent, not mastered
  assert.equal(status(Array(5).fill(e('a', true))).code, 'fluent');
  // 4 of the last 5, over two days
  assert.equal(status([e('a', true), e('a', false), e('a', true), e('a', true), e('b', true)]).code, 'mastered');
  // a later miss streak takes it away again
  assert.equal(status([e('a', true), e('a', true), e('a', true), e('b', true), e('b', false), e('b', false)]).code, 'practicing');
});

test('gear: spring boots give one extra jump, dampers soak up one stumble per run', () => {
  const level = levels2[0];
  const air = (gear) => {
    const r = createRun({ ...level, obstacles: [], beats: [] }, gear);
    jump(r);
    let peak = 0, n = 0;
    for (; n < 40; n++) tick(r);
    jump(r); // second press in mid-air
    for (; n < 600 && (r.h > 0 || n < 45); n++) { tick(r); peak = Math.max(peak, r.h); }
    jump(r); jump(r); // back on the ground: a normal jump works again
    return { peak, vy: r.vy };
  };
  assert.ok(air(['boots']).peak > air([]).peak + 20);
  assert.ok(air(['boots']).vy > 0);
  const idle = (gear) => {
    const r = createRun(level, gear);
    let passedFirst = false;
    for (let n = 0; n < 12 / STEP && r.hits === 0; n++) {
      if (r.paused) resume(r);
      tick(r);
      if (r.x > level.obstacles[0].x + 40) passedFirst = true;
    }
    return { passedFirst, hits: r.hits };
  };
  assert.deepEqual(idle([]), { passedFirst: false, hits: 1 });
  assert.deepEqual(idle(['dampers']), { passedFirst: true, hits: 1 });
});
