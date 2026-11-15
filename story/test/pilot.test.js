// Checks the pilot episode's math and structure against independent computations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { episode } from '../episodes/pilot.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;
const byId = Object.fromEntries(episode.problems.map((p) => [p.id, p]));

// Independent "is this option actually correct?" predicate per lock.
const correct = {
  cable: (o) => near(o.num, 4 * (1 / 3)),
  door: (o) => near(-3 * (o.num - 4), 18),
  // 6 + 4x = 2x^2 has roots 3 and -1; an equivalent monic form must vanish at both.
  elevator: (o) => [3, -1].every((x) => near(6 + 4 * x, 2 * x * x) && near(x * x + o.bc[0] * x + o.bc[1], 0)),
  dial: (o) => near(o.num * o.num, 50) && o.num > 0,
  case: (o) => near(o.num * Math.SQRT2, 6),
};

test('every lock has a checker and the episode has five locks', () => {
  assert.equal(episode.problems.length, 5);
  for (const p of episode.problems) assert.ok(correct[p.id], p.id);
});

for (const p of episode.problems) {
  test(`${p.id}: exactly one right option, and it is mathematically right`, () => {
    const right = p.options.filter((o) => o.right);
    assert.equal(right.length, 1);
    assert.ok(correct[p.id](right[0]));
  });

  test(`${p.id}: every plain wrong option is mathematically wrong`, () => {
    for (const o of p.options.filter((x) => !x.right && !x.near)) assert.ok(!correct[p.id](o), o.id);
  });

  test(`${p.id}: "near" options have the right value but are not the final form`, () => {
    for (const o of p.options.filter((x) => x.near)) assert.ok(correct[p.id](o) && !o.right, o.id);
  });

  test(`${p.id}: option ids unique, values distinct, wrong options explain themselves`, () => {
    const ids = p.options.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
    const labels = p.options.map((o) => o.html);
    assert.equal(new Set(labels).size, labels.length);
    for (const o of p.options.filter((x) => !x.right)) {
      assert.ok(o.setback && o.why, o.id);
      assert.ok(o.guess?.length && o.fix?.length, `${o.id} work lines`);
      assert.ok(o.near || o.guess.join('').includes('class="bad"'), `${o.id} marks the slip`);
      assert.ok(o.fix.join('').includes('class="good"'), `${o.id} marks the fix`);
    }
    assert.ok(p.similar && p.story.length && p.win.length && p.ask);
  });
}

test('numbers quoted in the explanations', () => {
  // door checks
  assert.equal(-3 * (-10 - 4), 42);
  assert.ok(near(-3 * (-22 / 3 - 4), 34));
  assert.equal(-3 * (2 - 4), 6);
  assert.equal(-3 * (10 - 4), -18);
  // door similar: -2(x - 5) = 14 at x = -2
  assert.equal(-2 * (-2 - 5), 14);
  // elevator sticky-note values at x = 3
  const at3 = (b, c) => 9 + 3 * b + c;
  assert.deepEqual([at3(2, 3), at3(-4, -6), at3(-2, -6), at3(-2, 3), at3(-2, -3)], [18, -9, -3, 6, 0]);
  // elevator similar: 8 + 6x = 2x^2 -> x^2 - 3x - 4 = 0, x = 4
  assert.equal(8 + 6 * 4, 2 * 16);
  assert.equal(16 - 12 - 4, 0);
  // dial rough checks
  assert.ok(near(Math.sqrt(48), 4 * Math.sqrt(3)));
  assert.equal(Math.round(25 * Math.SQRT2), 35);
  assert.equal((2 * Math.sqrt(5)).toFixed(1), '4.5');
  // case rough checks and similar
  assert.equal((6 / Math.SQRT2).toFixed(1), '4.2');
  assert.equal((6 * Math.SQRT2).toFixed(1), '8.5');
  assert.ok(near(6 * Math.SQRT2, 2 * (6 / Math.SQRT2))); // "twice what I asked for"
  assert.ok(near(10 / Math.sqrt(5), 2 * Math.sqrt(5)));
  assert.equal(byId.cable.options.find((o) => o.id === 'e').num.toFixed(3), (13 / 3).toFixed(3));
});

// ---- lockout variants ----
import { variants, variant } from '../episodes/pilot-variants.js';

const vCorrect = {
  cable: ([n, d], o) => near(o.num * d, n),
  door: ([a, b, c], o) => near(-a * (o.num - b), c),
  elevator: ([k, p, q], o) => {
    // roots of k x^2 - kp x - kq = 0 by the quadratic formula
    const disc = Math.sqrt((k * p) ** 2 + 4 * k * (k * q));
    const roots = [(k * p + disc) / (2 * k), (k * p - disc) / (2 * k)];
    return roots.every((x) => near(k * q + k * p * x, k * x * x) && near(x * x + o.bc[0] * x + o.bc[1], 0));
  },
  dial: ([s, m], o) => near(o.num * o.num, s * s * m) && o.num > 0,
  case: ([a, m], o) => near(o.num * Math.sqrt(m), a),
};

test('every lock has lockout variants, none repeating the original problem', () => {
  for (const p of episode.problems) {
    assert.ok(variants[p.id].params.length >= 4, p.id);
    for (let k = 0; k < variants[p.id].params.length; k++) assert.notEqual(variant(p.id, k).ask, p.ask);
  }
});

for (const p of episode.problems) {
  variants[p.id].params.forEach((params, k) => {
    test(`${p.id} variant ${k} (${params}): one right answer, wrong ones wrong, all distinct`, () => {
      const v = variant(p.id, k);
      const right = v.options.filter((o) => o.right);
      assert.equal(right.length, 1);
      assert.ok(vCorrect[p.id](params, right[0]));
      const wrong = v.options.filter((o) => !o.right);
      assert.ok(wrong.length >= 3);
      for (const o of wrong) {
        assert.ok(!vCorrect[p.id](params, o), o.html);
        assert.ok(o.slip, o.html);
      }
      assert.equal(new Set(v.options.map((o) => o.html)).size, v.options.length);
      assert.ok(v.worked.length >= 2 && v.worked.at(-1).includes(right[0].html.replace(/^x = /, '').replace(/^= /, '')) || p.id === 'cable');
      assert.ok(!v.options.some((o) => /NaN|undefined|Infinity/.test(o.html)));
    });
  });
}
