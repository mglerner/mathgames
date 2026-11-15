// Adversarial regression tests for defects found in src/gen, src/misc/malrules
// and src/misc/diagnose.js (M1b review). Each test that demonstrates an
// unfixed defect is marked { todo: 'finding N' } so the suite stays green;
// the fixer removes the todo. Numbers match the review report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { judge } from '../../../src/check/judge.js';
import { diagnoseJudged, misconceptionStatus } from '../../../src/misc/diagnose.js';
import { print } from '../../../src/math/print.js';
import { runStudents } from './_detect.js';
import { solveEq, sameSet, applyMove, sStr } from './_oracle.js';
import { parse } from '../../../src/math/parse.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const gen = (id) => generators.find((g) => g.id === id);
const item = (id, seed, difficulty, interaction, fadeLevel) => gen(id).generate(makeRng(seed), { difficulty, interaction, fadeLevel });
const tagsOf = (p, text) => { const j = judge(p, text); return { verdict: j.verdict, ...diagnoseJudged(p, j) }; };

test('finding 1: audit.js does not pass while four spec\'d checks are unimplemented', () => {
  const r = spawnSync(process.execPath, [resolve(ROOT, 'scripts/audit.js')], { encoding: 'utf8' });
  const out = r.stdout + r.stderr;
  // Section 11: audit.js FAILS on a mal-rule with no separating generator, an
  // unverifiable answer, a negative radicand, or no counting Why. Today it
  // prints "not checked yet" for all four and still exits OK.
  assert.ok(!/not checked yet/.test(out), out.split('\n').filter((l) => /not checked|audit:/.test(l)).join('\n'));
});

test('finding 2: the Half-Coin typed on a frac-equivalence / identity-moves Strike is tagged', () => {
  const p = item('frac-equivalence.core', 'st0', 1, 'strike', 2); // 1/2, "Write it with denominator 4."
  assert.equal(print(p.prompt.math), '1/2');
  for (const t of ['1/4', '2/2']) {
    const d = tagsOf(p, t);
    assert.equal(d.verdict, 'wrong');
    assert.deepEqual(d.misconceptions, ['one-part-coin'], `${t} on 1/2 -> denominator 4`);
  }
  const res = runStudents({ seeds: 60, only: (rid, q) => rid === 'one-part-coin' && q.interaction === 'strike' && (q.gen === 'frac-equivalence.core' || q.gen === 'identity-moves.core') });
  assert.ok(res.length > 100);
  assert.deepEqual(res.filter((r) => !r.ok).slice(0, 5).map((r) => r.msg), []);
});

test('finding 3: a real bug typed as a NUMBER on the equivalent-expressions Lantern item is tagged', () => {
  const res = runStudents({ seeds: 60, only: (rid, q) => q.gen === 'equivalent-expressions.core' && q.interaction === 'predict' });
  assert.ok(res.length > 100);
  // e.g. (x + 4)^2 at x = 5: the Spreader types 41 (25 + 16): judged wrong, no tag
  assert.deepEqual(res.filter((r) => !r.ok).slice(0, 5).map((r) => r.msg), []);
});

test('finding 4: on -(bx + c) the Half-Hand and the Sign-Thief give the same line, so it is ambiguous', () => {
  // (fixer edit) The pinned seed 'st2' no longer gives -(5x - 1): the fix makes the generator stop
  // serving a bare -(sum) (it cannot separate rules 6 and 7). The assertion is kept, on the same
  // prompt put by hand into a real d3 predict item; and the pool is scanned for bare minus items.
  const base = item('distribute.core', 'st2', 3, 'predict', 2);
  const p = { ...base, prompt: { ...base.prompt, math: parse('-(5x - 1)') }, answer: { ...base.answer, expected: parse('-5x + 1') } };
  assert.equal(print(p.prompt.math), '-(5x - 1)');
  assert.equal(judge(p, '-5x + 1').verdict, 'correct');
  // "distributed to the first term only" (rule 6) on -(5x - 1) is -5x - 1,
  // which is also the Sign-Thief's line. Section 5: two matching rules ->
  // ambiguous, never tagged to one.
  const d = tagsOf(p, '-5x - 1');
  assert.equal(d.verdict, 'wrong');
  assert.equal(d.ambiguous, true, JSON.stringify(d));
  assert.deepEqual([...d.misconceptions].sort(), ['neg-distribution', 'partial-distribution']);
  for (const it of ['predict', 'strike', 'nextline', 'twin']) for (let s = 0; s < 300; s++) {
    const q = item('distribute.core', 'st' + s, 3, it, 2);
    assert.ok(!(q.prompt.math.t === 'neg' && q.prompt.math.arg.t === 'group'), `seed st${s} ${it}: ${print(q.prompt.math)} cannot separate rules 6 and 7`);
  }
});

test('finding 5: "x 0" on an all-reals line keeps the solution set, so it is not Illegal', () => {
  // (fixer edit) The pinned seed 'adv-1' no longer offers "x 0" on 18x - 24 = 18x - 24: the fix
  // drops that chip on a line every number solves. The claim is now checked over the pool, by the
  // independent solver: no chip labelled 'illegal' leaves the solution set as it was.
  let allReals = 0; let illegal = 0;
  for (const [id, lo, hi] of [['solve-linear.core', 1, 4], ['balance-moves.core', 1, 3]]) for (let d = lo; d <= hi; d++) for (let s = 0; s < 300; s++) {
    const p = item(id, 'adv-' + s, d, 'cast', s % 2);
    const before = solveEq(p.prompt.math);
    if (before.kind === 'all') allReals++;
    for (const c of p.choices) {
      if (c.verdict !== 'illegal') continue;
      illegal++;
      assert.ok(!sameSet(before, solveEq(applyMove(c.display, p.prompt.math))), `${id} d${d} seed adv-${s}: ${print(p.prompt.math)} chip ${c.display.op} ${print(c.display.operand)} is labelled illegal but keeps the solution set`);
      assert.equal(judge(p, c.id, { tapped: true }).verdict, 'wrong');
    }
  }
  assert.ok(allReals > 30, `only ${allReals} all-reals Cast lines seen`);
  assert.ok(illegal > 300, `only ${illegal} illegal chips seen`);
});

test('finding 6: a Lost Root tag on a one-way Cast "/ x" tap ever reaches suspected / active', () => {
  const mk = (seed) => {
    const p = item('balance-moves.one-way', seed, 1, 'cast', 0);
    const c = p.choices.find((x) => x.malrule === 'divide-by-variable-loses-root');
    const j = judge(p, c.id, { tapped: true });
    const dg = diagnoseJudged(p, j);
    assert.deepEqual(dg.misconceptions, ['divide-by-variable-loses-root']); // diagnoseJudged does tag it ...
    return { problem: { gen: p.gen, seed: p.seed }, verdict: j.verdict, misconceptions: dg.misconceptions, ambiguous: dg.ambiguous, context: 'mixed' };
  };
  const attempts = [mk('a1'), mk('a2')];
  assert.equal(attempts[0].verdict, 'risky');
  // ... but misconceptionStatus (same file) and learner/model.js keep only verdict 'wrong'.
  // This Cast is the ONLY separating item for rule 12, so it can never become active.
  assert.deepEqual(misconceptionStatus(attempts), { 'divide-by-variable-loses-root': 'active' });
});

test('finding 7: every planted Trace has a true root the number-evidence step can use', () => {
  // Section 3 I6: "The game gives the true root; they supply the left and right
  // values of the tapped line at that root"; the Truth Trace runs each true
  // root down the lines. A no-solution equation has no root, so neither can
  // expose the planted line.
  // (fixer edit) The pinned seed 'tr4' now gives another equation (a d4 Trace always has one
  // solution), so the claim is checked over the pool instead of on one seed.
  let planted = 0;
  for (let d = 1; d <= 4; d++) for (let s = 0; s < 400; s++) {
    const p = item('solve-linear.core', 'tr' + s, d, 'trace', 0);
    if (!p.steps.some((st) => !st.legal)) continue;
    planted++;
    assert.equal(p.answer.expected.kind, 'finite', `d${d} seed tr${s}: ${print(p.prompt.math)}`);
    assert.equal(solveEq(p.prompt.math).kind, 'finite');
    assert.equal(solveEq(p.prompt.math).roots.length, 1);
  }
  assert.ok(planted > 800, `only ${planted} planted chains`);
});

test('finding 8: a Twin joined by a form of 1 asks for that form of 1 (section 3 I5)', () => {
  const p = item('frac-equivalence.core', 's66', 1, 'twin', 2); // the EXAMPLE_SEED: 3/4 ~ 15/20
  assert.equal(`${print(p.prompt.math)} ~ ${print(p.prompt.twin)}`, '3/4 ~ 15/20');
  // "Where a form of 1 or 0 connects them (3/4 and 15/20 ...), they pick it at fade 0-1 and type it at fade 2+."
  // The follow-up key is the common value 3/4 instead of the coin 5/5.
  assert.equal(p.answer.kind, 'form-of-1', `key is ${p.answer.kind} ${print(p.answer.expected)}`);
});

test('finding 9: a planted Trace chain never lands on the coincidence roots 0 or 1', () => {
  // (fixer edit) The pinned seed 'adv-48' now gives another chain; the claim is checked over the
  // pool of every generator with a Trace instead of on one seed.
  let planted = 0;
  for (const g of generators.filter((x) => x.interactions.includes('trace'))) for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (let s = 0; s < 300; s++) {
    const p = g.generate(makeRng('adv-' + s), { difficulty: d, interaction: 'trace', fadeLevel: 0 });
    if (!p.steps.some((st) => !st.legal)) continue;
    planted++;
    const last = solveEq(p.steps[p.steps.length - 1].line);
    const roots = last.kind === 'finite' ? last.roots.map((r) => sStr(r)) : [];
    assert.deepEqual(roots.filter((r) => r === '0' || r === '1'), [], `${g.id} d${d} seed adv-${s}: final line ${print(p.steps[p.steps.length - 1].line)}`);
  }
  assert.ok(planted > 1500, `only ${planted} planted chains`);
});

test('finding 10: read-abc whose x^2 terms cancel in L + R still detects the Copyist', () => {
  const p = item('quadratic-to-standard.core', 'st212', 2, 'strike', 2);
  assert.equal(print(p.prompt.math), '4x + x^2 = -x^2 + 30');
  // The Copyist rule reads L + R per power: a = 1 - 1 = 0, and then it returns
  // nothing. Every coefficient-copying answer goes unclassified here.
  const hit = ['1, 4, 30', '-1, 4, 30', '1, 4, -30', '0, 4, 30'].some((t) => tagsOf(p, t).misconceptions.includes('copy-coefficients'));
  assert.ok(hit);
});

test('finding 11: Next Line offers 3-4 candidates (section 3 I2)', { todo: 'finding 11' }, () => {
  const p = item('distribute.core', 's498', 1, 'nextline', 0); // HALF_HAND_SEED: 3(x + 4)
  assert.equal(print(p.prompt.math), '3(x + 4)');
  assert.ok(p.choices.length >= 3, `${p.choices.length} candidates: ${p.choices.map((c) => print(c.display))}`);
});
