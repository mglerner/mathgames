// @ts-check
// Regression tests for the adversarial-review findings (math and UX lenses), as property tests
// over many seeds. Answer keys and Scale readings are checked by an independent path: plain
// BigInt integer polynomials built here and evaluated by substitution, not the poly/surd modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../js/gens/index.js';
import { judge } from '../js/judge.js';
import { buildFeedback } from '../js/feedback.js';
import { print } from '../js/print.js';
import { astEq } from '../js/ast.js';
import { valueOf } from '../js/exact.js';
import { seq } from '../js/surd.js';
import { createRun, current, resolve, advance, done, slot } from '../js/run.js';
import { startApp, NEXT_GUARD_MS } from '../js/app.js';
import { makeDocument, FakeNode, byAct, findAll } from './fakedom.js';
import { makeRng } from '../js/rng.js';

const N = 2000;

/** integer polynomial product, coefficient arrays low -> high @param {bigint[]} a @param {bigint[]} b */
function imul(a, b) {
  const out = Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}
/** @param {bigint[]} c @param {bigint} x */
const ieval = (c, x) => c.reduce((s, k, i) => s + k * x ** BigInt(i), 0n);
/** keypad text for sum c_k x^k = 0, descending @param {bigint[]} c */
function itext(c) {
  let s = '';
  for (let k = c.length - 1; k >= 0; k--) {
    const v = c[k];
    if (v === 0n) continue;
    const abs = v < 0n ? -v : v;
    const sign = v < 0n ? '-' : s ? '+' : '';
    const coef = abs === 1n && k > 0 ? '' : `${abs}`;
    s += `${sign}${coef}${k === 0 ? '' : k === 1 ? 'x' : `x^${k}`}`;
  }
  return `${s}=0`;
}
const lineText = (/** @type {any[]} */ segs) => segs.filter((x) => typeof x === 'string').join('');

test('quad Strike: a line with an EXTRA root is wrong, says so truthfully, and the Scale shows the extra root', () => {
  const rng = makeRng('extra-root');
  for (let s = 0; s < N; s++) {
    const p = generate('quad', `xr${s}`, 'strike');
    const [r1, r2] = p.data.roots;
    const base = imul([-r1, 1n], [-r2, 1n]); // (x - r1)(x - r2), independent of poly.js
    let e = BigInt(rng.int(-9, 9));
    while (e === r1 || e === r2) e += 1n;
    const a = BigInt([1, 2, -1, 3][s % 4]);
    const P = imul(imul(base, [-e, 1n]), [a]);
    const r = judge(p, itext(P));
    assert.equal(r.verdict, 'wrong', `${print(p.prompt.math)}: ${itext(P)}`);
    const fb = buildFeedback(p, r);
    assert.equal(fb.miss, true);
    const line = lineText(fb.line);
    assert.ok(!/Same solutions/.test(line), line);
    // the reported extra root is a root of the student's line and not of the Knot (substitution)
    const x = /** @type {any} */ (r.extraRoot);
    assert.ok(x && x.d === 1n, 'integer extra root found');
    assert.equal(ieval(P, x.n), 0n);
    assert.notEqual(ieval(base, x.n), 0n);
    const ins = /** @type {any} */ (fb.instrument);
    assert.equal(ins.kind, 'scale');
    assert.equal(ins.x, `${x.n}`);
    assert.equal(ins.rows[0].balanced, false, 'the Knot does not balance at the extra root');
    assert.equal(ins.rows[1].balanced, true, "the student's line balances at the extra root");
    // the extra root must be the smallest |x| one; with one extra root it is e itself
    assert.equal(x.n, e);
  }
});

test('quad Strike: same real roots but not a multiple (repeated factor, x^2 + 1 factor) is wrong, never "Same solutions"', () => {
  for (let s = 0; s < N; s++) {
    const p = generate('quad', `nm${s}`, 'strike');
    const [r1, r2] = p.data.roots;
    const base = imul([-r1, 1n], [-r2, 1n]);
    for (const extra of [[-r1, 1n], [1n, 0n, 1n]]) {
      const P = imul(base, extra);
      const r = judge(p, itext(P));
      assert.equal(r.verdict, 'wrong', itext(P));
      assert.equal(r.extraRoot, undefined, 'no rational root outside {r1, r2}');
      const fb = buildFeedback(p, r);
      assert.ok(!/Same solutions/.test(lineText(fb.line)));
      assert.equal(fb.miss, true);
    }
  }
});

test('a leading + is accepted on every Strike answer key, and changes nothing else', () => {
  for (const gen of ['ftw', 'sqrtsq', 'rat', 'quad']) {
    for (let s = 0; s < N; s++) {
      const p = generate(gen, `lp${s}`, 'strike');
      const key = print(p.answer.display).replace(/\*/g, '');
      const plain = judge(p, key);
      assert.equal(plain.verdict, 'correct', `${gen} ${key}`);
      assert.equal(judge(p, `+${key}`).verdict, 'correct', `${gen} +${key}`);
    }
  }
  const p = generate('quad', 'parent-998', 'strike');
  assert.equal(judge(p, '0=+2x^2-4x-6').verdict, 'correct');
  assert.equal(judge(p, '++2x^2-4x-6=0').verdict, 'unparsed');
});

test('run: the 10 planned Knots never repeat an item (5000 run seeds)', () => {
  for (let r = 0; r < 5000; r++) {
    const run = createRun(`plan${r}`);
    const keys = run.queue.map((s) => `${s.gen}:${generate(s.gen, s.seed, s.interaction).key}`);
    assert.equal(new Set(keys).size, keys.length, `plan${r}: ${keys.join(' | ')}`);
  }
  // the teacher's seeds are not in the rotation, but run seeds stay deterministic
  assert.deepEqual(createRun('alpha').queue, createRun('alpha').queue);
});

test('run: no item the student missed is ever shown again, and an Echo never duplicates a later slot (3000 runs, 60% misses)', () => {
  const rng = makeRng('echo-fresh');
  let echoes = 0;
  let exhausted = 0;
  for (let k = 0; k < 3000; k++) {
    const run = createRun(`ef${k}`);
    /** @type {string[]} */
    const shown = [];
    /** @type {Set<string>} */
    const missed = new Set();
    let steps = 0;
    while (!done(run)) {
      const p = current(run);
      const key = `${p.gen}:${p.key}`;
      if (missed.has(key)) {
        // Only allowed once every item of the pool has been missed: sqrt-squared has 12
        // (squarefree n in 2..19); every other proto generator's pool is far larger.
        const missedOfGen = [...missed].filter((m) => m.startsWith(`${p.gen}:`)).length;
        assert.ok(p.gen === 'sqrtsq' && missedOfGen >= 12, `ef${k}: missed item ${key} shown again`);
        exhausted++;
      }
      shown.push(key);
      const miss = rng.u32() / 4294967296 < 0.6 && steps < 60;
      const echo = resolve(run, { verdict: miss ? 'wrong' : 'correct', firstTry: true, tags: [], ambiguous: false });
      if (miss) missed.add(key);
      if (echo) {
        echoes++;
        const keyOf = (/** @type {any} */ s) => `${s.gen}:${generate(s.gen, s.seed, s.interaction).key}`;
        const later = run.queue.slice(run.pos + 1).filter((s) => s !== echo).map(keyOf);
        const ek = keyOf(echo);
        if (later.includes(ek)) {
          // only when the 12-item sqrt pool is used up by what was shown, missed or queued
          const used = new Set([...shown, ...later].filter((x) => x.startsWith('sqrtsq:')));
          assert.ok(echo.gen === 'sqrtsq' && used.size >= 12, `ef${k}: Echo ${ek} duplicates a later slot`);
          exhausted++;
        }
      }
      advance(run);
      steps++;
    }
  }
  assert.ok(echoes > 10000);
  assert.ok(exhausted <= 300, `${exhausted} pool-exhausted repeats`); // 150 at the time of the fix
  console.log(`# ${echoes} Echoes; ${exhausted} repeats of a missed item, or of a later slot, all after the 12-item sqrt pool was used up`);
});

test('Lantern while the Knot is open never prints the finished answer, and its rows keep the right values', () => {
  /** @type {[string, string, (p: any) => string[]][]} */
  const cases = [
    ['ftw', 'strike', (p) => [`${2n * p.data.n * p.data.a}/${2n * p.data.b}`, `${p.data.n}*${p.data.a}/${p.data.b}`]],
    ['sqrtsq', 'strike', (p) => [`sqrt${p.data.n * p.data.n}`, `sqrt${p.data.n}*sqrt${p.data.n}`]],
    ['rat', 'strike', (p) => [`${p.data.k}/sqrt${p.data.n}`]],
  ];
  let opened = 0;
  for (const [gen, inter, inputs] of cases) {
    for (let s = 0; s < N; s++) {
      const p = generate(gen, `lo${s}`, inter);
      for (const t of inputs(p)) {
        const r = judge(p, t);
        if (r.verdict !== 'form') continue;
        opened++;
        const ins = /** @type {any} */ (buildFeedback(p, r).instrument);
        for (const row of ins.rows) {
          assert.ok(!astEq(row.exact, p.answer.display), `${gen} ${t}: ${row.label} shows the answer ${print(row.exact)}`);
          assert.ok(seq(valueOf(row.exact), p.answer.value), `${gen} ${t}: ${row.label} has the wrong value`);
        }
        assert.equal(ins.same, true);
      }
      // once resolved, the Knot row is the finished answer
      const done1 = buildFeedback(p, judge(p, print(p.answer.display).replace(/\*/g, '')));
      assert.ok(astEq(/** @type {any} */ (done1.instrument).rows[0].exact, p.answer.display));
    }
  }
  // Forge legal-idle (rat): the pick row is prompt x coin, worth the Knot, not the answer key
  for (let s = 0; s < N; s++) {
    const p = generate('rat', `lo${s}`, 'forge');
    for (const c of p.choices.filter((/** @type {any} */ c) => c.verdict === 'legal-idle')) {
      const ins = /** @type {any} */ (buildFeedback(p, judge(p, c.id)).instrument);
      for (const row of ins.rows) {
        assert.ok(!astEq(row.exact, p.answer.display));
        assert.ok(seq(valueOf(row.exact), p.answer.value));
      }
      opened++;
    }
  }
  assert.ok(opened > 5000, `${opened} open-Knot readings checked`);
});

test('form hints never print the finished answer', () => {
  for (let s = 0; s < N; s++) {
    const p = generate('sqrtsq', `fh${s}`, 'strike');
    const r = judge(p, `sqrt${p.data.n * p.data.n}`);
    assert.equal(r.verdict, 'form');
    assert.ok(!new RegExp(`\\b${p.data.n}\\b`).test(r.why || ''), r.why);
  }
});

test('Strike: an unclassified wrong value does not claim they made a move', () => {
  const p = generate('sqrtsq', 'parent-5', 'strike');
  const fb = buildFeedback(p, judge(p, '6'));
  assert.equal(fb.miss, true);
  assert.ok(!/move/.test(lineText(fb.line)), lineText(fb.line));
});

/** Boot with a manual clock. @param {string} search */
function bootClock(search) {
  const doc = makeDocument();
  const root = new FakeNode('div');
  const clock = { t: 1700000000000 };
  let rb = 3;
  const app = startApp(root, {
    doc,
    storage: null,
    nowMs: () => clock.t,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => (rb = (rb * 73 + 41) % 256)),
    search,
    download: () => true,
  });
  const tap = (/** @type {string} */ act) => {
    const b = byAct(root, act);
    assert.ok(b.length >= 1, `no button ${act} on ${app.ui.screen}`);
    b[0].dispatch('pointerdown');
  };
  return { root, app, tap, clock };
}

test('Next ignores the second tap of a double tap, and works once the guard has passed', () => {
  const { app, tap, clock } = bootClock('?item=sqrtsq:parent-5:strike,ftw:parent-85:strike');
  tap('descend');
  tap('key-9');
  tap('key-commit');
  assert.ok(app.ui.locked);
  clock.t += 80; // a fast double tap
  tap('next');
  assert.equal(app.ui.run.pos, 0, 'feedback must not be skipped');
  clock.t += NEXT_GUARD_MS;
  tap('next');
  assert.equal(app.ui.run.pos, 1);
});

test('Haul reports real counts: planned Knots vs Echoes, first try split', () => {
  const { root, app, tap, clock } = bootClock('?item=ftw:a:forge,rat:b:forge,ftw:c:forge');
  tap('descend');
  // miss Knot 1, untie its Echo; untie Knot 2 and Knot 3 first try
  for (let g = 0; app.ui.screen === 'encounter' && g < 20; g++) {
    const p = app.ui.problem;
    const sl = app.ui.run.queue[app.ui.run.pos];
    const want = sl.context !== 'echo' && sl.seed === 'a' ? 'wrong' : 'correct';
    tap(`choice-${p.choices.find((/** @type {any} */ c) => c.verdict === want).id}`);
    tap('commit');
    clock.t += NEXT_GUARD_MS + 1;
    tap('next');
  }
  assert.equal(app.ui.screen, 'haul');
  const lines = findAll(root, (n) => n.tagName === 'LI').map((n) => n.textContent);
  assert.ok(lines.includes('Knots untied: 2 of 3'), lines.join(' | '));
  assert.ok(lines.includes('Knots missed: 1 (each one sent an Echo)'), lines.join(' | '));
  assert.ok(lines.includes('Echoes worked: 1 (1 untied)'), lines.join(' | '));
  assert.ok(lines.includes('Clean on the first try: 2 of 3 Knots, 1 of 1 Echoes'), lines.join(' | '));
});

test('report confirms on screen in every state, including after a "form" answer', () => {
  const { root, app, tap } = bootClock('?item=ftw:parent-85:strike');
  tap('descend');
  for (const k of ['8', '/', '6']) tap(`key-${k}`);
  tap('key-commit');
  assert.equal(app.ui.fb.verdict, 'form');
  tap('report');
  assert.equal(byAct(root, 'report')[0].textContent, 'reported');
  assert.equal(app.log.all().filter((e) => e.type === 'report').length, 1);
  void slot;
});
