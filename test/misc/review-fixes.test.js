// @ts-check
// Regression tests for the defects the M1b adversarial reviews found in
// src/misc (diagnose.js, kit.js, the mal-rules) and src/gen/common.js.
// Run: node scripts/gen-registry.js && node --test test/misc/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../../src/gen/prng.js';
import { diagnose, diagnoseJudged, isHit, misconceptionStatus, malrules, malruleById, outputsOf, outputText } from '../../src/misc/diagnose.js';
import { voteFindsKey, voteProofChoices, V_LANTERN, TWIN_SAME } from '../../src/gen/common.js';
import { judge } from '../../src/check/judge.js';
import { q } from '../../src/math/rational.js';
import { print } from '../../src/math/print.js';
import * as F from './_fixtures.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Equation} Equation */

/** @param {string} id @param {Problem} p */
const outs = (id, p) => outputsOf(malruleById(id), p).map((o) => outputText(p, o)).sort();

/** @param {Problem} p @param {string} raw */
function tags(p, raw) {
  const j = judge(p, raw);
  return { verdict: j.verdict, ...diagnoseJudged(p, j) };
}

test('a tagged Risky tap counts toward suspected / active (the Lost Root is only ever Risky)', () => {
  const hit = (/** @type {string} */ seed, /** @type {object} */ over = {}) => ({
    problem: { gen: 'balance-moves.one-way', seed }, verdict: 'risky', misconceptions: ['divide-by-variable-loses-root'], ambiguous: false, context: 'mixed', ...over,
  });
  assert.equal(isHit(/** @type {any} */ (hit('a'))), true);
  assert.equal(isHit(/** @type {any} */ (hit('a', { verdict: 'wrong' }))), true);
  for (const verdict of ['correct', 'form', 'legal-idle', 'illegal', 'unverifiable', 'progress']) {
    // 'illegal' carries no tag in this game; were one attached it would still not be a miss of a modelled rule
    assert.equal(isHit(/** @type {any} */ (hit('a', { verdict }))), false, verdict);
  }
  assert.equal(isHit(/** @type {any} */ (hit('a', { ambiguous: true }))), false);
  assert.equal(isHit(/** @type {any} */ (hit('a', { misconceptions: [] }))), false);
  assert.deepEqual(misconceptionStatus(/** @type {any} */ ([hit('a')])), { 'divide-by-variable-loses-root': 'suspected' });
  assert.deepEqual(misconceptionStatus(/** @type {any} */ ([hit('a'), hit('b')])), { 'divide-by-variable-loses-root': 'active' });
  assert.deepEqual(misconceptionStatus(/** @type {any} */ ([hit('a'), hit('a')])), { 'divide-by-variable-loses-root': 'suspected' }, 'the same item twice is one item');
});

test('the Half-Coin on a typed "rewrite with denominator T" and "lowest terms" Strike', () => {
  const p = F.exprItem('1/2', '2/4', ['denominator:4'], { prompt: { verb: 'Rewrite', math: F.N('1/2'), goal: 'Write it with denominator 4.' } });
  assert.deepEqual(outs('one-part-coin', p), ['1/4', '2/2']);
  assert.deepEqual(tags(p, '1/4'), { verdict: 'wrong', misconceptions: ['one-part-coin'], ambiguous: false });
  assert.deepEqual(tags(p, '2/2'), { verdict: 'wrong', misconceptions: ['one-part-coin'], ambiguous: false });
  assert.deepEqual(tags(p, '3/4').misconceptions, [], 'another wrong answer is unclassified');
  const low = F.exprItem('6/8', '3/4', ['lowest-terms']);
  assert.deepEqual(outs('one-part-coin', low), ['3/8', '6/4']);
  assert.deepEqual(outs('one-part-coin', F.exprItem('3/4', '3/4', ['lowest-terms'])), [], 'already in lowest terms: nothing to divide');
});

test('the Half-Coin on a Twin: one part of the fraction multiplied, the other copied', () => {
  for (const [a, b] of [['3/4', '15/4'], ['3/4', '3/20'], ['2x/3', '10x/3'], ['2x/3', '2x/15']]) {
    assert.deepEqual(diagnose(F.twinItem(a, b, false), TWIN_SAME), { misconceptions: ['one-part-coin'], ambiguous: false }, `${a} ~ ${b}`);
  }
  // both parts multiplied by different numbers, or a part divided: not this rule
  assert.deepEqual(diagnose(F.twinItem('3/4', '15/8', false), TWIN_SAME).misconceptions, []);
  assert.deepEqual(diagnose(F.twinItem('3/4', '4/5', false), TWIN_SAME).misconceptions, []);
});

test('a typed answer on a Twin is the follow-up, never a rule output', () => {
  // sqrt(2)/sqrt(2) has the Halver's value of 1/sqrt(2) read as 1/(2/2); it must not be tagged
  const p = F.twinItem('1/sqrt(2)', 'sqrt(2)/2', true);
  p.answer = { kind: 'form-of-1', expected: F.N('sqrt(2)/sqrt(2)'), formPredicates: ['no-radical-in-denominator'], assumptions: [] };
  assert.deepEqual(diagnose(p, F.N('sqrt(2)/sqrt(2)')), { misconceptions: [], ambiguous: false });
  assert.deepEqual(diagnose(p, F.N('1')), { misconceptions: [], ambiguous: false });
});

test('the Copyist still reads a line whose x^2 terms cancel in L + R', () => {
  const p = F.abcItem('4x + x^2 = -x^2 + 30', ['2', '4', '-30']);
  const got = outs('copy-coefficients', p);
  assert.ok(got.length > 0, 'the rule applies');
  assert.deepEqual(tags(p, '2, 4, -30').verdict, 'correct');
  assert.ok(['1, 4, 30', '-1, 4, 30', '0, 4, 30'].some((t) => tags(p, t).misconceptions.includes('copy-coefficients')), got.join(' | '));
});

test('Lantern items: a rule\'s rewritten form is diagnosed by its value at the named x', () => {
  const lantern = (/** @type {string} */ text, /** @type {number} */ x, /** @type {string} */ key) => F.exprItem(text, key, ['single-number'], {
    variant: V_LANTERN, interaction: 'predict', prompt: { verb: 'Lantern', math: F.N(text), goal: `Find its value at x = ${x}.` }, probes: [{ x: q(x) }],
  });
  const sq = lantern('(x + 4)^2', 5, '81');
  assert.equal(tags(sq, '81').verdict, 'correct');
  assert.deepEqual(tags(sq, '41'), { verdict: 'wrong', misconceptions: ['freshmans-dream-square'], ambiguous: false }); // 25 + 16
  const pr = lantern('3(x + 4)', 2, '18');
  assert.deepEqual(tags(pr, '10'), { verdict: 'wrong', misconceptions: ['partial-distribution'], ambiguous: false }); // 3(2) + 4
  assert.deepEqual(tags(pr, '11').misconceptions, []);
  // without the variant the same typed number is not a rewritten form
  const plain = F.exprItem('3(x + 4)', '3x + 12');
  assert.deepEqual(diagnose(plain, F.N('10')).misconceptions, []);
});

test('scripts are static: no digit and no direction a particular item could contradict', () => {
  for (const r of malrules) {
    assert.doesNotMatch(r.script, /\d/, `${r.id}: ${r.script}`);
    assert.doesNotMatch(r.script, /\b(Subtract|Add|added|subtracted)\b/, `${r.id}: names one direction of a move`);
    assert.doesNotMatch(r.script, /^[\x20-\x7e]*[^\x20-\x7e]/, `${r.id}: not ASCII`);
    assert.ok(r.script.split(/\s+/).length <= 15, `${r.id}: ${r.script}`);
  }
  // the Smuggler's line must hold both for a factor going in (k sqrt(m)) and coming out (sqrt(k m))
  assert.doesNotMatch(malruleById('sqrt-product-misapplied').script, /\b(came out|comes out|went in|goes in|enters|leaves)\b/);
});

test('voteFindsKey: the majority-vote attack on an equation Next Line', () => {
  const E = F.E;
  // key shares its left side with one distractor and its right side with another: the vote finds it
  assert.equal(voteFindsKey([E('3x = 15'), E('3x = 9'), E('3x - 6 = 15')]), true);
  // every candidate has the same left side: nothing to vote on
  assert.equal(voteFindsKey([E('3x = 15'), E('3x = 9'), E('3x = 3')]), false);
  // the vote lands on a wrong line
  assert.equal(voteFindsKey([E('x + 1 = 10'), E('x + 1 = -50'), E('x + 1 = -45')]), false);
  assert.equal(voteFindsKey([F.N('3x'), F.N('4x')]), false, 'not equations: no attack');
});

test('voteProofChoices: tagged, distinct, 2-3 wrong lines, and the vote never finds the key', () => {
  const rules = ['one-sided-operation', 'transpose-no-sign-change'].map(malruleById);
  const div = ['one-sided-operation', 'transpose-coefficient-as-subtract', 'divide-one-term'].map(malruleById);
  let n = 0;
  for (const [text, move, key, rs] of /** @type {[string, any, string, any[]][]} */ ([
    ['3x - 6 = 9', F.mv('add', '6'), '3x = 15', rules],
    ['5x + 3 = 2x + 9', F.mv('sub', '2x'), '3x + 3 = 9', rules],
    ['-5x - 5 = -50', F.mv('div', '-5'), 'x + 1 = 10', div],
    ['4x = 20', F.mv('div', '4'), 'x = 5', div],
  ])) {
    const p = F.lineItem(text, move, key);
    for (let s = 0; s < 20; s++) {
      const wrong = voteProofChoices(makeRng(`v${s}`), p, rs);
      if (!wrong) continue;
      n++;
      assert.ok(wrong.length >= 2 && wrong.length <= 3);
      const lines = wrong.map((c) => print(/** @type {Equation} */ (c.display)));
      assert.equal(new Set(lines).size, lines.length);
      assert.ok(!lines.includes(key));
      for (const c of wrong) {
        assert.equal(c.verdict, 'wrong');
        assert.deepEqual(diagnose(p, /** @type {Equation} */ (c.display)), { misconceptions: [c.malrule], ambiguous: false }, `${text}: ${print(/** @type {Equation} */ (c.display))}`);
      }
      assert.equal(voteFindsKey([F.E(key), ...wrong.map((c) => /** @type {Equation} */ (c.display))]), false, `${text}: ${lines.join(' | ')}`);
    }
  }
  assert.ok(n >= 40, `only ${n} sets drawn`);
});
