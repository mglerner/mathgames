// @ts-check
// Hand-written acceptance cases for judge() (DESIGN.md section 3 per
// interaction; section 11 Domain policy; section 1 teacher examples).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../../src/check/judge.js';
import { validateSpec, answerText, solutionSetText, SCALABLE_TUPLE_VARIANT } from '../../src/check/answer-spec.js';
import { q } from '../../src/math/rational.js';
import { seq } from '../../src/math/surd.js';
import { P, problem, sQ, sPQR } from './_items.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Choice} Choice */

/** @param {Problem} p @param {string} text */
const v = (p, text) => judge(p, text).verdict;

test('teacher examples: 4 x 1/3, sqrt(3) x sqrt(3), 6/sqrt(3)', () => {
  const ftw = problem({ kind: 'expr', expected: P('4/3'), formPredicates: ['lowest-terms'], assumptions: [] });
  assert.equal(v(ftw, '4/3'), 'correct');
  assert.equal(v(ftw, '8/6'), 'form');
  assert.equal(v(ftw, '4/12'), 'wrong');
  assert.equal(v(ftw, '1/12'), 'wrong');
  const sqsq = problem({ kind: 'expr', expected: P('3'), formPredicates: ['integer'], assumptions: [] });
  assert.equal(v(sqsq, '3'), 'correct');
  assert.equal(v(sqsq, '9/3'), 'form');
  assert.equal(v(sqsq, '9'), 'wrong');
  assert.equal(v(sqsq, 'sqrt(9)'), 'form');
  const rat = problem({ kind: 'expr', expected: P('2sqrt(3)'), formPredicates: ['no-radical-in-denominator', 'radical-simplified'], assumptions: [] });
  assert.equal(v(rat, '2sqrt(3)'), 'correct');
  assert.equal(v(rat, '6sqrt(3)/3'), 'correct', 'not in lowest terms, but that predicate was not asked for');
  assert.equal(v(rat, 'sqrt(12)'), 'form');
  assert.equal(v(rat, '6/sqrt(3)'), 'form');
  assert.equal(v(rat, '6'), 'wrong');
});

test('teacher example 6 + 4x = 2x^2: next line, rewrite, solve', () => {
  const orig = P('6 + 4x = 2x^2');
  const sides = problem({ kind: 'equation-sides', expected: P('0 = 2x^2 - 4x - 6'), formPredicates: [], assumptions: [] },
    { interaction: 'predict', prompt: { verb: 'Predict', math: orig, move: { op: 'sub', operand: P('6 + 4x') } } });
  assert.equal(v(sides, '0 = 2x^2 - 4x - 6'), 'correct');
  assert.equal(v(sides, '2x^2 - 4x - 6 = 0'), 'correct', 'section 3: either side order');
  assert.equal(v(sides, '6 + 4x - (6 + 4x) = 2x^2 - (6 + 4x)'), 'correct');
  const r0 = judge(sides, '6 + 4x = 2x^2');
  assert.equal(r0.verdict, 'wrong', 'retyping the original line fails');
  assert.match(r0.note ?? '', /not been applied/);
  assert.equal(v(sides, 'x = 3'), 'wrong', 'jumping ahead fails');
  const half = judge(sides, 'x^2 - 2x - 3 = 0');
  assert.equal(half.verdict, 'wrong', 'an equivalent line that is not this move\'s result');
  assert.match(half.note ?? '', /Same solutions/);
  assert.equal(v(sides, '6 + 4x = 2x^2 - 6 - 4x'), 'wrong', 'one-sided move');

  const rewrite = problem({ kind: 'equation-multiple', expected: orig, formPredicates: ['standard-form'], assumptions: [] }, { prompt: { verb: 'Rewrite', math: orig } });
  assert.equal(v(rewrite, '0 = 2x^2 - 4x - 6'), 'correct');
  assert.equal(v(rewrite, '-2x^2 + 4x + 6 = 0'), 'correct');
  assert.equal(v(rewrite, 'x^2 - 2x - 3 = 0'), 'correct', 'nonzero rational multiple');
  assert.equal(v(rewrite, '0 = -4x - 6 + 2x^2'), 'form', 'not descending');
  assert.equal(v(rewrite, '2x^2 = 4x + 6'), 'form');
  assert.equal(v(rewrite, '2x^2 - 4x + 6 = 0'), 'wrong');
  assert.equal(v(rewrite, 'x(2x^2 - 4x - 6) = 0'), 'wrong', 'x times is not a rational multiple');

  const solveIt = problem({ kind: 'solution-set', expected: { kind: 'finite', roots: [sQ(-1n), sQ(3n)] }, formPredicates: [], assumptions: [] });
  assert.equal(v(solveIt, '3, -1'), 'correct');
  const lost = judge(solveIt, '3');
  const extra = judge(solveIt, '3, -1, 0');
  assert.equal(lost.verdict, 'wrong');
  assert.equal(extra.verdict, 'wrong');
  assert.deepEqual([lost.missing?.length, lost.extra?.length], [1, 0], 'missing root is distinguishable');
  assert.deepEqual([extra.missing?.length, extra.extra?.length], [0, 1], 'extra root is distinguishable');
  assert.ok(lost.missing && seq(lost.missing[0], sQ(-1n)));
  assert.ok(extra.extra && seq(extra.extra[0], sQ(0n)));
  assert.notEqual(lost.note, extra.note);
});

test('I3 expression move retyped unchanged: form, "the move has not been applied yet"', () => {
  const dist = problem({ kind: 'expr', expected: P('2x + 6'), formPredicates: ['expanded'], assumptions: [] },
    { interaction: 'predict', prompt: { verb: 'Distribute', math: P('2(x + 3)') } });
  assert.equal(v(dist, '2x + 6'), 'correct');
  assert.equal(v(dist, '6 + 2x'), 'correct');
  const r = judge(dist, '2(x + 3)');
  assert.equal(r.verdict, 'form');
  assert.equal(r.note, 'Same value, not finished: the move has not been applied yet.');
  assert.equal(judge(dist, '2(3 + x)').note, 'Same value, not finished: a product is not multiplied out yet.');
  assert.equal(v(dist, '2x + 3'), 'wrong');
});

test('factored-gcf: a partly factored form gets the GCF note', () => {
  const f = problem({ kind: 'expr', expected: P('6(x + 2)'), formPredicates: ['factored-gcf'], assumptions: [] },
    { prompt: { verb: 'Factor', math: P('6x + 12') } });
  assert.equal(v(f, '6(x + 2)'), 'correct');
  const r = judge(f, '3(2x + 4)');
  assert.equal(r.verdict, 'form');
  assert.equal(r.note, 'Same value, not finished: take out the greatest common factor.');
  assert.equal(v(f, '6(x + 3)'), 'wrong');
});

test('I8 fill the blank, and read a, b, c with a scaled triple', () => {
  const blank = problem({ kind: 'expr', expected: P('5'), formPredicates: ['integer'], assumptions: [] }, { prompt: { verb: 'Fill the blank', math: P('3 + 4 = x + 2') } });
  assert.equal(v(blank, '5'), 'correct');
  assert.equal(v(blank, '7'), 'wrong', 'equals-as-operator answer');
  const abc = problem({ kind: 'tuple', expected: [P('2'), P('-4'), P('-6')], formPredicates: [], assumptions: [] },
    { variant: SCALABLE_TUPLE_VARIANT, prompt: { verb: 'Type a, b, c', math: P('0 = 2x^2 - 4x - 6') } });
  assert.equal(judge(abc, '2, -4, -6').note, undefined);
  const scaled = judge(abc, '1, -2, -3');
  assert.equal(scaled.verdict, 'correct');
  assert.equal(scaled.note, 'That is a, b, c of an equivalent equation.');
  assert.deepEqual(scaled.scale, q(1, 2));
  assert.equal(v(abc, '-2, 4, 6'), 'correct');
  assert.equal(v(abc, '2, 4, -6'), 'wrong');
  assert.equal(v(abc, '2, -4'), 'unparsed');
  assert.equal(v(abc, '2, -4, x'), 'wrong', 'a letter is not a coefficient');
});

test('solution sets: no solution and all reals are typeable; the +- key is U+00B1; typed "+-" is plus-negative', () => {
  const none = problem({ kind: 'solution-set', expected: { kind: 'none' }, formPredicates: [], assumptions: [] });
  assert.equal(v(none, 'no solution'), 'correct');
  assert.equal(v(none, '2'), 'wrong');
  const all = problem({ kind: 'solution-set', expected: { kind: 'all' }, formPredicates: [], assumptions: [] });
  assert.equal(v(all, 'all reals'), 'correct');
  assert.equal(v(all, 'no solution'), 'wrong');
  const pm = problem({ kind: 'solution-set', expected: { kind: 'finite', roots: [sPQR(1n, -1n, 3n), sPQR(1n, 1n, 3n)] }, formPredicates: ['radical-simplified'], assumptions: [] });
  assert.equal(v(pm, '1 \u00b1 sqrt(3)'), 'correct');
  assert.equal(v(pm, '1 +/- sqrt(3)'), 'correct');
  assert.equal(v(pm, '1 + sqrt(3), 1 - sqrt(3)'), 'correct');
  assert.equal(v(pm, '1 \u00b1 sqrt(12)/2'), 'form');
  const typed = judge(pm, '1 +- sqrt(3)');
  assert.equal(typed.verdict, 'wrong', '"+-" means 1 + (-sqrt(3)), one value');
  assert.equal(typed.missing?.length, 1);
  assert.equal(v(pm, '1+-sqrt(3)'), 'wrong');
  assert.equal(solutionSetText({ kind: 'none' }), 'no solution');
  assert.equal(solutionSetText({ kind: 'all' }), 'all reals');
  assert.equal(v(pm, answerText(pm.answer)), 'correct');
});

test('domain policy: x/x vs 1, sqrt(x^2) vs x, cannot verify', () => {
  const one = problem({ kind: 'expr', expected: P('1'), formPredicates: [], assumptions: [] });
  const xx = judge(one, 'x/x');
  assert.equal(xx.verdict, 'form', 'equal where defined: not a miss, not correct');
  assert.match(xx.note ?? '', /x != 0/);
  const oneNz = problem({ kind: 'expr', expected: P('1'), formPredicates: [], assumptions: [{ name: 'x', rel: 'nonzero' }] });
  assert.equal(v(oneNz, 'x/x'), 'correct', 'x declared nonzero');
  const ab = problem({ kind: 'expr', expected: P('x'), formPredicates: [], assumptions: [] });
  const r = judge(ab, 'sqrt(x^2)');
  assert.notEqual(r.verdict, 'correct');
  assert.notEqual(r.verdict, 'form');
  if (r.verdict === 'wrong') assert.ok(r.witness && r.witness.x && r.witness.x.n < 0n, 'witness is negative');
  const abNn = problem({ kind: 'expr', expected: P('x'), formPredicates: [], assumptions: [{ name: 'x', rel: 'nonneg' }] });
  assert.equal(v(abNn, 'sqrt(x^2)'), 'correct');
  // A variable radicand with no declaration is outside the math core: never wrong.
  const rad = problem({ kind: 'expr', expected: P('sqrt(x)'), formPredicates: [], assumptions: [] });
  assert.equal(v(rad, 'sqrt(x)'), 'unverifiable');
  assert.equal(v(rad, 'x^(1/2)'), 'unverifiable');
  // Nested radicals are not computable exactly: unverifiable, not wrong.
  const set = problem({ kind: 'solution-set', expected: { kind: 'finite', roots: [sPQR(1n, 1n, 2n)] }, formPredicates: [], assumptions: [] });
  assert.equal(v(set, 'sqrt(3 + 2sqrt(2))'), 'unverifiable');
  // A form of 1 that is 1 only where x != 0 is risky, not legal.
  const coin = problem({ kind: 'form-of-1', expected: P('sqrt(3)/sqrt(3)'), formPredicates: ['no-radical-in-denominator'], assumptions: [] },
    { interaction: 'forge', prompt: { verb: 'Forge', math: P('6/sqrt(3)') } });
  assert.equal(v(coin, 'x/x'), 'risky');
});

test('Forge typed forms of 1 and 0 (section 3 I4 examples)', () => {
  const coin = problem({ kind: 'form-of-1', expected: P('sqrt(3)/sqrt(3)'), formPredicates: ['no-radical-in-denominator'], assumptions: [] },
    { interaction: 'forge', prompt: { verb: 'Forge', math: P('6/sqrt(3)'), goal: 'no root in the denominator' } });
  assert.equal(v(coin, 'sqrt(3)/sqrt(3)'), 'correct');
  assert.equal(v(coin, 'sqrt(3)/1'), 'wrong', 'not 1: the Lantern jumps 3.46 -> 6');
  assert.equal(v(coin, '1/sqrt(3)'), 'wrong');
  const idle = judge(coin, '3/3');
  assert.equal(idle.verdict, 'legal-idle');
  assert.match(idle.note ?? '', /^Legal\. Not closer/);
  const zp = problem({ kind: 'form-of-0', expected: P('9 - 9'), formPredicates: [], assumptions: [] },
    { interaction: 'forge', prompt: { verb: 'Forge', math: P('x^2 + 6x'), goal: 'make a perfect square' } });
  assert.equal(v(zp, '+9 - 9'), 'correct');
  assert.equal(v(zp, '+9'), 'wrong');
  assert.equal(v(zp, '+3 - 3'), 'legal-idle');
  assert.equal(v(zp, '+36 - 36'), 'legal-idle');
  // With no goal predicate the coin's resulting denominator must match the reference's.
  const den = problem({ kind: 'form-of-1', expected: P('3/3'), formPredicates: [], assumptions: [] },
    { interaction: 'forge', prompt: { verb: 'Forge', math: P('2/7'), goal: 'denominator 21' } });
  assert.equal(v(den, '3/3'), 'correct');
  assert.equal(v(den, '2/2'), 'legal-idle');
});

/**
 * @param {Choice[]} choices @param {Partial<Problem>} over @param {import('../../types.d.ts').AnswerSpec} answer
 * @returns {Problem}
 */
function choiceProblem(choices, over, answer) {
  return problem(answer, { constructed: false, choices, ...over });
}

test('choice items: Next Line candidates are recomputed; a mislabeled candidate is unverifiable', () => {
  const orig = P('6 + 4x = 2x^2');
  const answer = /** @type {const} */ ({ kind: 'equation-sides', expected: P('0 = 2x^2 - 4x - 6'), formPredicates: [], assumptions: [] });
  const good = { id: 'a', display: P('2x^2 - 4x - 6 = 0'), verdict: /** @type {const} */ ('correct') };
  const mal = { id: 'b', display: P('0 = 2x^2 + 4x + 6'), verdict: /** @type {const} */ ('wrong'), malrule: 'sign-error' };
  const lie = { id: 'c', display: P('0 = 2x^2 + 4x - 6'), verdict: /** @type {const} */ ('correct') };
  const p = choiceProblem([good, mal, lie], { interaction: 'nextline', prompt: { verb: 'Next line', math: orig, move: { op: 'sub', operand: P('6 + 4x') } } }, answer);
  assert.equal(v(p, 'a'), 'correct');
  const rb = judge(p, 'b');
  assert.equal(rb.verdict, 'wrong');
  assert.equal(rb.choice?.malrule, 'sign-error');
  const rc = judge(p, 'c');
  assert.equal(rc.verdict, 'unverifiable');
  assert.equal(rc.labelMismatch, true);
  assert.equal(v(p, 'zzz'), 'unparsed', 'not a choice id');
  // An expression move: right value, form predicate fails -> wrong in a choice (I2).
  const ftw = choiceProblem([
    { id: 'a', display: P('4/3'), verdict: 'correct' },
    { id: 'b', display: P('8/6'), verdict: 'wrong' },
  ], { interaction: 'nextline' }, { kind: 'expr', expected: P('4/3'), formPredicates: ['lowest-terms'], assumptions: [] });
  assert.equal(v(ftw, 'a'), 'correct');
  assert.equal(v(ftw, 'b'), 'wrong');
});

test('choice items: Cast chips are reclassified; progress vs legal-idle is checked against the move graph', () => {
  const math = P('6 + 4x = 2x^2');
  /** @type {Choice[]} */
  const chips = [
    { id: 'p', display: { op: 'sub', operand: P('6 + 4x') }, verdict: 'progress', distance: 0 },
    { id: 'i', display: { op: 'div', operand: P('2') }, verdict: 'legal-idle', distance: 1 },
    { id: 'r', display: { op: 'div', operand: P('x') }, verdict: 'risky' },
    { id: 'z', display: { op: 'mul', operand: P('0') }, verdict: 'illegal' },
  ];
  const p = choiceProblem(chips, { interaction: 'cast', prompt: { verb: 'Cast', math }, moveGraph: { distance: 1, minPath: [] } },
    { kind: 'equation-multiple', expected: math, formPredicates: ['standard-form'], assumptions: [] });
  assert.equal(v(p, 'p'), 'correct');
  assert.equal(v(p, 'i'), 'legal-idle');
  const risky = judge(p, 'r');
  assert.equal(risky.verdict, 'risky');
  assert.equal(risky.note, 'Risky: only safe if x is not 0.');
  assert.equal(v(p, 'z'), 'wrong');
  // Mislabels are caught.
  const bad = choiceProblem([
    { id: 'r', display: { op: 'div', operand: P('x') }, verdict: 'progress', distance: 0 },
    { id: 'i', display: { op: 'div', operand: P('2') }, verdict: 'progress', distance: 1 },
  ], { interaction: 'cast', prompt: { verb: 'Cast', math }, moveGraph: { distance: 1, minPath: [] } },
  { kind: 'equation-multiple', expected: math, formPredicates: ['standard-form'], assumptions: [] });
  assert.equal(judge(bad, 'r').labelMismatch, true, '/ x is never legal');
  assert.equal(judge(bad, 'i').labelMismatch, true, 'distance 1 from distance 1 is not progress');
});

test('judge never throws on broken items or non-string input', () => {
  const ok = problem({ kind: 'expr', expected: P('1'), formPredicates: [], assumptions: [] });
  assert.equal(v(ok, /** @type {any} */ (undefined)), 'unparsed');
  assert.equal(v(ok, /** @type {any} */ (42)), 'unparsed');
  assert.equal(v(ok, ''), 'unparsed');
  assert.equal(v(ok, 'x'.repeat(1000)), 'unparsed');
  const unknownForm = problem({ kind: 'expr', expected: P('1'), formPredicates: ['no-such-form'], assumptions: [] });
  assert.equal(v(unknownForm, '1'), 'unverifiable');
  assert.deepEqual(validateSpec(unknownForm.answer), ['unknown form predicate "no-such-form"']);
  const wrongShape = problem(/** @type {any} */ ({ kind: 'solution-set', expected: P('1'), formPredicates: [], assumptions: [] }));
  assert.equal(v(wrongShape, '1'), 'unverifiable');
  assert.equal(judge(/** @type {any} */ ({}), '1').verdict, 'unverifiable', 'an item with no answer spec is broken');
  assert.equal(judge(/** @type {any} */ (null), '1').verdict, 'unverifiable');
  const huge = problem({ kind: 'expr', expected: P('2'), formPredicates: ['integer'], assumptions: [] });
  for (const s of ['9^9^9^9', '(x+1)^64^64', 'sqrt(2)^4097', '0^0', '1/0', '0^(-1)', 'sqrt(-4)', '2^(1/3)']) {
    const r = judge(huge, s);
    assert.ok(['unverifiable', 'wrong', 'unparsed'].includes(r.verdict), `${s}: ${r.verdict}`);
    assert.equal(r.error, undefined, `${s}: no internal error`);
  }
});
