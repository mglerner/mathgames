// @ts-check
// Regression tests for the M1c review findings fixed in judge.js (see
// test/adversarial/check/findings.test.js): non-real solution values, domains
// written differently, the wrong variable letter, and tap vs typed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { judge } from '../../src/check/judge.js';
import { seq } from '../../src/math/surd.js';
import { P, problem, sQ, nz } from './_items.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Surd} Surd */

/** @param {Surd[]} roots @returns {Problem} */
const solveFor = (roots) => problem({
  kind: 'solution-set', expected: roots.length ? { kind: 'finite', roots } : { kind: 'none' }, formPredicates: [], assumptions: [],
});

test('finding 1: a typed non-real value makes a solution set wrong; 1/0 stays unverifiable', () => {
  const none = solveFor([]);
  for (const t of ['sqrt(-4)', '± 2sqrt(-1)', 'x = ±sqrt(-4)', '+/- 2sqrt(-1)', '(-4)^(1/2)', 'x = 3 + sqrt(-1)', 'sqrt(0 - 9)']) {
    const r = judge(none, t);
    assert.equal(r.verdict, 'wrong', t);
    assert.ok(r.nonReal && r.nonReal.length > 0, t);
    assert.match(r.note ?? '', /is not a real number\.$/, t);
  }
  const two = solveFor([sQ(3n), sQ(-1n)]);
  const r = judge(two, '3, -1, sqrt(-1)');
  assert.equal(r.verdict, 'wrong');
  assert.deepEqual([r.missing?.length, r.extra?.length], [0, 0], 'the real values typed are exactly the key');
  const r2 = judge(two, '3, sqrt(-1)');
  assert.equal(r2.verdict, 'wrong');
  assert.ok(r2.missing?.length === 1 && seq(r2.missing[0], sQ(-1n)));
  // Not provably non-real: still unverifiable, never wrong.
  for (const t of ['1/0', '3, 1/0', '(-8)^(1/3)', '2^(1/3)']) assert.equal(judge(two, t).verdict, 'unverifiable', t);
  // "+-" typed together is plus, negative: 3 +- 1 is the single value 2, and nothing is non-real.
  assert.equal(judge(solveFor([sQ(2n)]), '3 +- 1').verdict, 'correct');
});

test('finding 1 property: any key plus a non-real item is wrong (2000 seeds)', () => {
  forSeeds(2000, (rng) => {
    const k = rng.int(0, 2);
    /** @type {bigint[]} */
    const ints = [];
    while (ints.length < k) { const x = BigInt(rng.int(-9, 9)); if (!ints.includes(x)) ints.push(x); }
    const p = solveFor(ints.map((x) => sQ(x)));
    const c = rng.int(1, 30);
    const a = rng.int(-5, 5);
    const bad = rng.pick([`sqrt(-${c})`, `${a} ± sqrt(-${c})`, `${a} + ${rng.int(1, 4)}sqrt(-${c})`, `(-${c})^(1/2)`, `sqrt(${a} - ${Math.abs(a) + c})`]);
    const parts = [...ints.map(String), bad];
    rng.shuffle(parts);
    const r = judge(p, parts.join(', '));
    assert.equal(r.verdict, 'wrong', parts.join(', '));
    assert.equal(r.missing?.length, 0);
    assert.equal(r.extra?.length, 0);
  });
});

test('finding 3: domains compared by the real zeros of the poles', () => {
  const p1 = problem({ kind: 'expr', expected: P('1/(x(x+1))'), formPredicates: [], assumptions: [] });
  assert.equal(judge(p1, '1/x - 1/(x+1)').verdict, 'correct');
  assert.equal(judge(p1, '1/(x^2 + x)').verdict, 'correct');
  const p2 = problem({ kind: 'expr', expected: P('(x+1)/(x-1)'), formPredicates: [], assumptions: [] });
  const r = judge(p2, '(x^2+3x+2)/((x-1)(x+2))');
  assert.equal(r.verdict, 'form');
  assert.match(r.note ?? '', /x != -2/);
  assert.equal(judge(p2, '((x+1)(x^2+1))/((x-1)(x^2+1))').verdict, 'correct', 'x^2 + 1 is never 0');
  const p3 = problem({ kind: 'expr', expected: P('x + 1'), formPredicates: [], assumptions: [] });
  assert.equal(judge(p3, '(x^2-1)/(x-1)').verdict, 'form', 'unchanged: the classic extra restriction');
  const pos = problem({ kind: 'expr', expected: P('1/(x-1)'), formPredicates: [], assumptions: [{ name: 'x', rel: 'pos' }] });
  assert.equal(judge(pos, '(x+1)/((x-1)(x+1))').verdict, 'correct', 'x > 0 already excludes -1');
});

test('finding 3 property: partial fractions are correct, an extra factor is form (1500 seeds)', () => {
  forSeeds(1500, (rng) => {
    const r1 = rng.int(-6, 6);
    let r2 = rng.int(-6, 6);
    if (r2 === r1) r2 = r1 + 1;
    let r3 = rng.int(-6, 6);
    while (r3 === r1 || r3 === r2) r3++;
    const f = (/** @type {number} */ r) => (r === 0 ? 'x' : r > 0 ? `(x - ${r})` : `(x + ${-r})`);
    const d = r1 - r2;
    const p = problem({ kind: 'expr', expected: P(`1/(${f(r1)}${f(r2)})`), formPredicates: [], assumptions: [] });
    const coef = d > 0 ? `1/${d}` : `-1/${-d}`;
    const pf = `${coef}(1/${f(r1)} - 1/${f(r2)})`;
    assert.equal(judge(p, pf).verdict, 'correct', pf);
    const ex = `${f(r3)}/(${f(r1)}${f(r2)}${f(r3)})`;
    const r = judge(p, ex);
    assert.equal(r.verdict, 'form', ex);
    assert.ok((r.note ?? '').includes(`x != ${r3}`), `${ex}: ${r.note}`);
    const k = nz(rng, 1, 9);
    const ok = `(x^2 + ${k})/(${f(r1)}${f(r2)}(x^2 + ${k}))`;
    assert.equal(judge(p, ok).verdict, 'correct', ok);
  });
});

test('finding 4: the wrong variable letter is unparsed and names the letter', () => {
  const p = solveFor([sQ(3n)]);
  for (const t of ['y = 3', 'x = 3, y = 4', 't = 3', 'y = sqrt(-1)']) {
    const r = judge(p, t);
    assert.equal(r.verdict, 'unparsed', t);
    assert.equal(r.note, 'Write each solution as x = a number.', t);
  }
  const free = problem({ kind: 'solution-set', expected: { kind: 'finite', roots: [sQ(3n)] }, formPredicates: [], assumptions: [] }, { variableKeys: [] });
  assert.equal(judge(free, 'y = 3').verdict, 'correct', 'no single variable: any letter is accepted, as parseSolutions does');
});

test('finding 5: typed text on a constructed item is typed math; a tap must say so', () => {
  const p = problem({ kind: 'form-of-1', expected: P('sqrt(3)/sqrt(3)'), formPredicates: ['no-radical-in-denominator'], assumptions: [] }, {
    interaction: 'forge', prompt: { verb: 'Forge', math: P('6/sqrt(3)') },
    choices: [{ id: '1', display: P('sqrt(3)/sqrt(3)'), verdict: 'correct' }, { id: '2', display: P('3/3'), verdict: 'legal-idle' }],
  });
  assert.equal(judge(p, '1').verdict, 'legal-idle');
  assert.equal(judge(p, '2').verdict, 'wrong');
  assert.equal(judge(p, 'sqrt(3)/sqrt(3)').verdict, 'correct');
  const t1 = judge(p, '1', { tapped: true });
  assert.equal(t1.verdict, 'correct');
  assert.equal(t1.kind, 'choice');
  assert.equal(judge(p, '2', { tapped: true }).verdict, 'legal-idle');
  assert.equal(judge(p, 'sqrt(3)/sqrt(3)', { tapped: true }).verdict, 'unparsed', 'a tap must be a choice id');
  const offered = { ...p, constructed: false };
  assert.equal(judge(offered, '1').verdict, 'correct', 'not constructed: the two-argument form matches choice ids');
  assert.equal(judge(offered, 'sqrt(3)/sqrt(3)').verdict, 'unparsed');
});

test('same root cause as finding 3: a form of 1 / 0 whose pole is never 0 is exact, not risky', () => {
  const one = problem({ kind: 'form-of-1', expected: P('sqrt(3)/sqrt(3)'), formPredicates: ['no-radical-in-denominator'], assumptions: [] },
    { interaction: 'forge', prompt: { verb: 'Forge', math: P('6/sqrt(3)') } });
  assert.equal(judge(one, '(x^2 + 1)/(x^2 + 1)').verdict, 'legal-idle');
  const xx = judge(one, 'x/x');
  assert.equal(xx.verdict, 'risky');
  assert.equal(xx.note, 'Risky: worth 1 only if x != 0.');
  assert.equal(judge(one, '(x - 1)/(x - 1)').note, 'Risky: worth 1 only if x != 1.');
  const zero = problem({ kind: 'form-of-0', expected: P('9 - 9'), formPredicates: [], assumptions: [] },
    { interaction: 'forge', prompt: { verb: 'Forge', math: P('x^2 + 6x') } });
  assert.equal(judge(zero, '1/(x^2 + 1) - 1/(x^2 + 1)').verdict, 'legal-idle');
  assert.equal(judge(zero, '1/x - 1/x').verdict, 'risky');
});
