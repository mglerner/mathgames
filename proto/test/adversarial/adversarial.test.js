// Adversarial regression tests (math and judging lens). Tests named "DEFECT:" fail on the
// code as reviewed and pass once the defect is fixed.
//
// The heavy independent oracle is oracle.py (Python, fractions only); the last test runs it at
// ADV_N seeds per generator per interaction (default 300; the review ran 20000).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generate } from '../../js/gens/index.js';
import { judge } from '../../js/judge.js';
import { buildFeedback } from '../../js/feedback.js';
import { print } from '../../js/print.js';
import { createRun, current, resolve, advance, done, slot } from '../../js/run.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const teacher = {
  ftw: generate('ftw', 'parent-85', 'strike'),
  sqrtsq: generate('sqrtsq', 'parent-5', 'strike'),
  rat: generate('rat', 'parent-15', 'strike'),
  quad: generate('quad', 'parent-998', 'strike'),
};

test('documented teacher seeds produce the four teacher examples', () => {
  assert.equal(print(teacher.ftw.prompt.math), '4*1/3');
  assert.equal(print(teacher.sqrtsq.prompt.math), 'sqrt3*sqrt3');
  assert.equal(print(teacher.rat.prompt.math), '6/sqrt3');
  const q = teacher.quad.prompt.math;
  assert.equal(`${print(q.lhs)}=${print(q.rhs)}`, '6+4x=2x^2');
});

test('right answers in kid-typeable forms are accepted (spaces, parens, orientations, multiples)', () => {
  const cases = [
    [teacher.ftw, ['4/3', ' 4 / 3 ', '(4)/(3)', '(4/3)']],
    [teacher.sqrtsq, ['3', '(3)']],
    [teacher.rat, ['2sqrt3', '2 sqrt3', '2sqrt(3)', '2*sqrt3', 'sqrt3*2', '2(sqrt3)']],
    [teacher.quad, ['2x^2-4x-6=0', '0=2x^2-4x-6', '-2x^2+4x+6=0', '0=-2x^2+4x+6', 'x^2-2x-3=0', '1/2x^2-x-3/2=0', '2x^2 - 4x - 6 = 0']],
  ];
  for (const [p, list] of cases) for (const t of list) assert.equal(judge(p, t).verdict, 'correct', t);
});

test('same value / same solutions, not finished, is never a miss', () => {
  const cases = [
    [teacher.ftw, ['8/6', '4*1/3', '4/1*1/3']],
    [teacher.sqrtsq, ['sqrt9', 'sqrt3*sqrt3', '6/2']],
    [teacher.rat, ['sqrt12', 'sqrt(12)', '6/sqrt3', '6sqrt3/3', '4sqrt3/2']],
    [teacher.quad, ['6+4x-2x^2=0', '6+4x=2x^2', '2(x^2-2x-3)=0', '(x-3)(x+1)=0']],
  ];
  for (const [p, list] of cases)
    for (const t of list) {
      const r = judge(p, t);
      assert.equal(r.verdict, 'form', t);
      assert.equal(buildFeedback(p, r).miss, false, t);
    }
});

test('copied coefficients are rejected and tagged', () => {
  const r = judge(teacher.quad, '2x^2+4x+6=0');
  assert.equal(r.verdict, 'wrong');
  assert.ok(r.tags.includes('copy-coefficients'));
});

test('DEFECT: a leading + on a right answer is accepted (the keypad has a + key)', () => {
  assert.equal(judge(teacher.ftw, '+4/3').verdict, 'correct');
  assert.equal(judge(teacher.sqrtsq, '+3').verdict, 'correct');
  assert.equal(judge(teacher.rat, '+2sqrt3').verdict, 'correct');
  assert.equal(judge(teacher.quad, '+2x^2-4x-6=0').verdict, 'correct');
});

test('DEFECT: an equation with an EXTRA root is not shown as "Same solutions"', () => {
  // x^3 - 2x^2 - 3x = 0 has roots {0, -1, 3}; the Knot 6 + 4x = 2x^2 has {-1, 3}.
  for (const t of ['x^3-2x^2-3x=0', '(x-3)(x+1)(x-5)=0']) {
    const r = judge(teacher.quad, t);
    const fb = buildFeedback(teacher.quad, r);
    const line = fb.line.filter((s) => typeof s === 'string').join('');
    assert.ok(!/^Same solutions/.test(line), `${t}: verdict ${r.verdict}, line "${line}"`);
  }
});

test('garbage never crashes the judge or the feedback builder', () => {
  const T = ['0', '1', '2', '3', '9', '(', ')', '+', '-', '^', 'sqrt', 'x', '=', '/'];
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const ps = Object.values(teacher);
  for (let i = 0; i < 20000; i++) {
    const p = ps[i % 4];
    let t = '';
    for (let j = 1 + Math.floor(rnd() * 14); j > 0; j--) t += T[Math.floor(rnd() * T.length)];
    buildFeedback(p, judge(p, t));
  }
  for (const t of ['9^9^9', '(x+1)^99', '(sqrt2+sqrt3)^64', 'x^64^64', '0^-1', '1/(x-x)', 'sqrt(-1)', '(999999999999^64)^64'])
    for (const p of ps) buildFeedback(p, judge(p, t));
});

test('a run never ends on a miss, and an Echo is never the missed item', () => {
  for (let r = 0; r < 500; r++) {
    const run = createRun(`adv${r}`);
    let last = null;
    let k = 0;
    while (!done(run) && k++ < 300) {
      const p = current(run);
      const s = slot(run);
      if (s.context === 'echo') {
        const missed = generate(s.gen, s.echoOf, s.interaction);
        assert.notEqual(p.key, missed.key);
      }
      last = (r * 7 + k) % 3 === 0 ? 'correct' : 'wrong';
      resolve(run, { verdict: last, firstTry: true, tags: [], ambiguous: false });
      advance(run);
    }
    assert.equal(last, 'correct', `run adv${r} ended on a miss`);
  }
});

test('DEFECT: a missed item is never shown again later in the same run', () => {
  // run32: slot 3 is sqrt10 x sqrt10; slot 7 is the same item. Miss slot 3 only.
  const run = createRun('run32');
  const shown = [];
  let missedKey = null;
  while (!done(run)) {
    const p = current(run);
    shown.push(`${p.gen}:${p.key}`);
    const miss = run.pos === 2;
    if (miss) missedKey = `${p.gen}:${p.key}`;
    resolve(run, { verdict: miss ? 'wrong' : 'correct', firstTry: true, tags: [], ambiguous: false });
    advance(run);
  }
  assert.equal(shown.filter((k) => k === missedKey).length, 1, shown.join(' | '));
});

test('DEFECT: the fixed 10-Knot rotation does not repeat an item within a run', () => {
  let dup = 0;
  for (let r = 0; r < 1000; r++) {
    const run = createRun(`run${r}`);
    const keys = run.queue.map((s) => `${s.gen}:${generate(s.gen, s.seed, s.interaction).key}`);
    if (new Set(keys).size !== keys.length) dup++;
  }
  assert.equal(dup, 0, `${dup} of 1000 runs repeat an item among their 10 planned Knots`);
});

test('independent Python oracle (fractions only) agrees with generators, judge and feedback', { timeout: 600000 }, (t) => {
  const py = spawnSync('python3', ['-c', 'import fractions'], { encoding: 'utf8' });
  if (py.status !== 0) {
    t.skip('python3 not available');
    return;
  }
  const n = process.env.ADV_N || '300';
  const r = spawnSync('python3', ['-I', join(HERE, 'oracle.py'), n], { encoding: 'utf8', maxBuffer: 1 << 26 });
  // leading-plus is reported by its own DEFECT test above; everything else must be clean
  const fails = (r.stdout.match(/^FAIL .*$/gm) || []).filter((l) => !l.startsWith('FAIL leading-plus-not-accepted'));
  assert.deepEqual(fails, [], r.stdout.slice(-4000) + r.stderr.slice(-2000));
  assert.match(r.stdout, /judge requests: \d+/);
});
