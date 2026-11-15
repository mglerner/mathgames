// @ts-check
// diagnose(): tagging, ambiguity, unclassified; the round trip through
// judge(); simulate(); and the section 5 status rules.
// Run: node scripts/gen-registry.js && node --test test/misc/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { diagnose, diagnoseJudged, simulate, malrules, malruleById, statusOfHits, misconceptionStatus, sameOutput, matchesKey } from '../../src/misc/diagnose.js';
import { judge } from '../../src/check/judge.js';
import * as F from './_fixtures.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Attempt} Attempt */

/** judge, then diagnose: what the game does. @param {Problem} p @param {string} raw @param {boolean} [tapped] */
function tags(p, raw, tapped = false) {
  const j = judge(p, raw, { tapped });
  return { verdict: j.verdict, ...diagnoseJudged(p, j) };
}

test('one match: tagged', () => {
  const p = F.exprItem('4(1/3)', '4/3', ['single-number', 'lowest-terms']);
  assert.deepEqual(tags(p, '4/12'), { verdict: 'wrong', misconceptions: ['scalar-times-both-parts'], ambiguous: false });
  assert.deepEqual(tags(p, '1/3'), { verdict: 'wrong', misconceptions: ['scalar-times-both-parts'], ambiguous: false }, 'by value, not by form');
  assert.deepEqual(tags(p, '1/12'), { verdict: 'wrong', misconceptions: ['scalar-into-denominator'], ambiguous: false });
  assert.deepEqual(tags(F.solveItem('x + 5 = 12', ['7']), '17'), { verdict: 'wrong', misconceptions: ['transpose-no-sign-change'], ambiguous: false });
  assert.deepEqual(tags(F.solveItem('x + 5 = 12', ['7']), 'x = 17'), { verdict: 'wrong', misconceptions: ['transpose-no-sign-change'], ambiguous: false });
  assert.deepEqual(tags(F.solveItem('x^2 = 3x', ['0', '3']), '3'), { verdict: 'wrong', misconceptions: ['divide-by-variable-loses-root'], ambiguous: false });
  assert.deepEqual(tags(F.exprItem('(x + 3)^2', 'x^2 + 6x + 9'), '9 + x^2'), { verdict: 'wrong', misconceptions: ['freshmans-dream-square'], ambiguous: false });
});

test('no match: unclassified; a correct, unfinished or unreadable answer: never tagged', () => {
  const p = F.exprItem('4(1/3)', '4/3', ['single-number', 'lowest-terms']);
  assert.deepEqual(tags(p, '7/3'), { verdict: 'wrong', misconceptions: [], ambiguous: false });
  assert.deepEqual(tags(p, '4/3'), { verdict: 'correct', misconceptions: [], ambiguous: false });
  assert.deepEqual(tags(p, '8/6'), { verdict: 'form', misconceptions: [], ambiguous: false });
  assert.deepEqual(tags(p, '4/'), { verdict: 'unparsed', misconceptions: [], ambiguous: false });
  assert.deepEqual(diagnose(p, /** @type {any} */ (undefined)), { misconceptions: [], ambiguous: false });
  assert.deepEqual(diagnose(/** @type {any} */ (null), F.N('1')), { misconceptions: [], ambiguous: false });
});

test('two matches: ambiguous, both listed, never tagged to one', () => {
  // 2x + 1 = 4: the Peeler gives (4 - 1) - 2 = 1 and the Slicer gives 4/2 - 1 = 1.
  const p = F.solveItem('2x + 1 = 4', ['3/2']);
  assert.deepEqual(tags(p, '1'), { verdict: 'wrong', misconceptions: ['transpose-coefficient-as-subtract', 'divide-one-term'], ambiguous: true });
  // the same answer with only one of the two rules in play is a clean tag
  assert.deepEqual(diagnose(p, { kind: 'finite', roots: [F.evalConst('1')] }, { rules: [malruleById('divide-one-term')] }),
    { misconceptions: ['divide-one-term'], ambiguous: false });
});

test('equation lines: side-wise for a stated move, up to a multiple for a rewrite', () => {
  const line = F.lineItem('3x + 5 = 11', F.mv('sub', '5'), '3x = 6');
  assert.deepEqual(tags(line, '3x = 16').misconceptions, ['transpose-no-sign-change']);
  assert.deepEqual(tags(line, '16 = 3x').misconceptions, ['transpose-no-sign-change'], 'sides swapped');
  assert.deepEqual(tags(line, '3x = 11').misconceptions, ['one-sided-operation']);
  assert.deepEqual(tags(line, '3x + 5 = 11'), { verdict: 'wrong', misconceptions: [], ambiguous: false }, 'the original line retyped');
  assert.deepEqual(tags(line, 'x = 2'), { verdict: 'wrong', misconceptions: [], ambiguous: false }, 'the solved line');
  assert.equal(tags(line, '3x = 6').verdict, 'correct');

  const rewrite = F.rewriteItem('6 + 4x = 2x^2');
  assert.equal(tags(rewrite, '0 = 2x^2 - 4x - 6').verdict, 'correct');
  assert.equal(tags(rewrite, '2x^2 - 4x - 6 = 0').verdict, 'correct');
  assert.deepEqual(tags(rewrite, '2x^2 + 4x + 6 = 0').misconceptions, ['transpose-no-sign-change']);
  assert.deepEqual(tags(rewrite, '0 = x^2 + 2x + 3').misconceptions, ['transpose-no-sign-change'], 'a multiple, sides swapped');
  assert.deepEqual(tags(rewrite, '2x^2 + 4x - 6 = 0').misconceptions, ['copy-coefficients']);
  assert.deepEqual(tags(rewrite, '0 = 2x^2').misconceptions, ['one-sided-operation']);
});

test('read a, b, c: the Copyist, and never for keeping x^2 on the right', () => {
  const p = F.abcItem('6 + 4x = 2x^2', ['2', '-4', '-6']);
  assert.equal(tags(p, '2, -4, -6').verdict, 'correct');
  assert.equal(tags(p, '-2, 4, 6').verdict, 'correct', 'a, b, c of an equivalent equation');
  assert.deepEqual(tags(p, '2, 4, 6'), { verdict: 'wrong', misconceptions: ['copy-coefficients'], ambiguous: false });
  assert.deepEqual(tags(p, '1, 2, 3').misconceptions, ['copy-coefficients']);
  assert.deepEqual(tags(p, '2, 4, -6').misconceptions, ['copy-coefficients']);
  assert.deepEqual(tags(p, '2, 5, 6').misconceptions, []);
});

test('fill the blank: the Announcer', () => {
  const p = F.blankItem('3 + 4 = z + 2', '5');
  assert.equal(tags(p, '5').verdict, 'correct');
  assert.deepEqual(tags(p, '7'), { verdict: 'wrong', misconceptions: ['equals-as-operator'], ambiguous: false });
  assert.deepEqual(tags(p, '9').misconceptions, []);
});

test('choice ids: a displayed line, a Twin tap, a one-way chip', () => {
  const next = F.exprItem('4(1/3)', '4/3', ['single-number'], {
    interaction: 'nextline', constructed: false,
    choices: [
      { id: 'a', display: F.N('4/3'), verdict: 'correct' },
      { id: 'b', display: F.N('4/12'), verdict: 'wrong', malrule: 'scalar-times-both-parts' },
      { id: 'c', display: F.N('1/12'), verdict: 'wrong', malrule: 'scalar-into-denominator' },
    ],
  });
  assert.deepEqual(tags(next, 'b', true), { verdict: 'wrong', misconceptions: ['scalar-times-both-parts'], ambiguous: false });
  assert.deepEqual(tags(next, 'a', true), { verdict: 'correct', misconceptions: [], ambiguous: false });
  assert.deepEqual(diagnose(next, 'zzz'), { misconceptions: [], ambiguous: false });

  // section 3 I5 named pairs
  const splitter = F.twinItem('sqrt(9 + 16)', 'sqrt(9) + sqrt(16)', false);
  assert.deepEqual(tags(splitter, 'same', true), { verdict: 'wrong', misconceptions: ['sqrt-splits-sum'], ambiguous: false });
  assert.deepEqual(tags(splitter, 'different', true), { verdict: 'correct', misconceptions: [], ambiguous: false });
  const flipped = F.twinItem('sqrt(9) + sqrt(16)', 'sqrt(9 + 16)', false);
  assert.deepEqual(tags(flipped, 'same', true).misconceptions, ['sqrt-splits-sum'], 'either form may come first');
  const spreader = F.twinItem('(x + 3)^2', 'x^2 + 9', false);
  assert.deepEqual(tags(spreader, 'same', true).misconceptions, ['freshmans-dream-square']);
  const product = F.twinItem('sqrt(4(9))', 'sqrt(4)sqrt(9)', true);
  assert.deepEqual(tags(product, 'different', true), { verdict: 'wrong', misconceptions: ['form-change-changes-value'], ambiguous: false });
  assert.deepEqual(tags(product, 'same', true), { verdict: 'correct', misconceptions: [], ambiguous: false });

  const cast = F.problem(F.E('x^2 = 3x'), { kind: 'solution-set', expected: { kind: 'finite', roots: [F.evalConst('0'), F.evalConst('3')] }, formPredicates: [], assumptions: [] }, {
    interaction: 'cast', constructed: false, variant: 'one-way',
    choices: [{ id: 'a', display: F.mv('div', 'x'), verdict: 'risky' }, { id: 'b', display: F.mv('sub', '3x'), verdict: 'progress' }],
  });
  assert.deepEqual(tags(cast, 'a', true), { verdict: 'risky', misconceptions: ['divide-by-variable-loses-root'], ambiguous: false });
  assert.deepEqual(tags({ ...cast, variant: undefined }, 'a', true), { verdict: 'risky', misconceptions: [], ambiguous: false }, 'elsewhere a caution, not a miss');
});

test('a Why tap is never diagnosed from the value of the tapped place', () => {
  const math = F.N('(4/1)(1/12)');
  const why = F.problem(math, { kind: 'expr', expected: F.N('1'), formPredicates: [], assumptions: [] }, {
    interaction: 'why', variant: 'hidden-1', constructed: false,
    choices: [{ id: 'e.0.1', display: F.N('1'), verdict: 'correct' }, { id: 'e.1.1', display: F.N('12'), verdict: 'wrong' }],
  });
  assert.deepEqual(tags(why, 'e.1.1', true), { verdict: 'wrong', misconceptions: [], ambiguous: false });
});

test('simulate: what a student with the bug answers', () => {
  const strike = F.exprItem('4(1/3)', '4/3', ['single-number', 'lowest-terms']);
  assert.deepEqual(simulate(malruleById('scalar-times-both-parts'), strike), [{ response: '4/12', tapped: false }]);
  assert.deepEqual(simulate(malruleById('freshmans-dream-square'), strike), []);
  assert.deepEqual(simulate(malruleById('one-part-coin'), F.exprItem('6/sqrt(3)', '2sqrt(3)', ['no-radical-in-denominator'])),
    [{ response: '6', tapped: false }, { response: '2', tapped: false }]);
  assert.deepEqual(simulate(malruleById('copy-coefficients'), F.abcItem('6 + 4x = 2x^2', ['2', '-4', '-6'])).map((s) => s.response),
    ['2, 4, 6', '2, 4, -6', '2, -4, 6']);
  assert.deepEqual(simulate(malruleById('sqrt-splits-sum'), F.twinItem('sqrt(9 + 16)', 'sqrt(9) + sqrt(16)', false)), [{ response: 'same', tapped: true }]);
});

test('detector round trip on the hand-built items: tagged M and nothing else', () => {
  const items = [
    F.blankItem('3 + 4 = z + 2', '5'),
    F.exprItem('4(1/3)', '4/3', ['single-number']),
    F.exprItem('6/sqrt(3)', '2sqrt(3)', ['no-radical-in-denominator']),
    F.exprItem('3(x + 4)', '3x + 12'), F.exprItem('-3(2x - 5)', '-6x + 15'),
    F.solveItem('x + 5 = 12', ['7']), F.solveItem('3x = 12', ['4']), F.solveItem('5x + 3 = 2x + 12', ['3']),
    F.lineItem('3x + 5 = 11', F.mv('sub', '5'), '3x = 6'), F.lineItem('2x + 6 = 10', F.mv('div', '2'), 'x + 3 = 5'),
    F.rewriteItem('6 + 4x = 2x^2'), F.abcItem('6 + 4x = 2x^2', ['2', '-4', '-6']),
    F.solveItem('x^2 = 3x', ['0', '3']), F.exprItem('(x + 3)^2', 'x^2 + 6x + 9'), F.exprItem('(x + 6)/3', '(x + 6)/3'),
    F.exprItem('sqrt(9 + 16)', '5'), F.exprItem('9^(1/2)', '3'), F.exprItem('sqrt(12)', '2sqrt(3)', ['radical-simplified']),
    F.exprItem('sqrt(3)sqrt(3)', '3'), F.twinItem('6/9', '2/3', true), F.twinItem('(x + 3)^2', 'x^2 + 9', false),
  ];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const p of items) {
    for (const rule of malrules) {
      for (const s of simulate(rule, p)) {
        const j = judge(p, s.response, { tapped: s.tapped });
        assert.equal(j.verdict, 'wrong', `${rule.id} on ${p.prompt.verb}: ${s.response}`);
        assert.deepEqual(diagnoseJudged(p, j), { misconceptions: [rule.id], ambiguous: false }, `${rule.id}: ${s.response}`);
        seen.add(rule.id);
      }
    }
  }
  // every rule but the Lost Root's chip form shows up as a clean tag somewhere above
  assert.deepEqual([...seen].sort(), malrules.map((r) => r.id).sort());
});

test('sameOutput and matchesKey: kinds never mix; undefined is not a match', () => {
  const p = F.exprItem('4(1/3)', '4/3');
  assert.equal(sameOutput(p, F.N('4/12'), F.N('1/3')), true);
  assert.equal(sameOutput(p, F.N('4/12'), F.E('x = 1')), false);
  assert.equal(sameOutput(p, F.N('4/12'), { kind: 'none' }), false);
  assert.equal(matchesKey(p, F.N('8/6')), true);
  assert.equal(matchesKey(p, F.N('4/12')), false);
  const s = F.solveItem('x^2 = 3x', ['0', '3']);
  assert.equal(matchesKey(s, { kind: 'finite', roots: [F.evalConst('3'), F.evalConst('0')] }), true);
  assert.equal(matchesKey(s, { kind: 'finite', roots: [F.evalConst('3')] }), false);
});

// ---------------------------------------------------------------- status

/** @param {Partial<Attempt> & { seed: string; gen?: string }} o @returns {Attempt} */
function attempt(o) {
  return /** @type {Attempt} */ ({
    problem: { gen: o.gen ?? 'g', version: 1, seed: o.seed, skill: 's', difficulty: 1, interaction: 'strike', constructed: true },
    response: 'r', verdict: 'wrong', firstTry: true, hintsUsed: 0, fadeLevel: 0, evidence: false, context: 'blocked',
    misconceptions: ['m'], ambiguous: false, ms: 1000, ...o,
  });
}

test('status: 1 hit suspected; 2 hits on 2 different separating items active', () => {
  assert.equal(statusOfHits([]), 'none');
  assert.equal(statusOfHits([{ gen: 'g', seed: 'a' }]), 'suspected');
  assert.equal(statusOfHits([{ gen: 'g', seed: 'a' }, { gen: 'g', seed: 'a' }]), 'suspected', 'the same item twice is one item');
  assert.equal(statusOfHits([{ gen: 'g', seed: 'a' }, { gen: 'g', seed: 'b' }]), 'active');
  assert.equal(statusOfHits([{ gen: 'g', seed: 'a' }, { gen: 'h', seed: 'a' }]), 'active', 'another generator is another item');
  assert.equal(statusOfHits([{ gen: 'g', seed: 'a', charting: true }, { gen: 'g', seed: 'b', charting: true }]), 'suspected', 'no Haunt from probes');
  assert.equal(statusOfHits([{ gen: 'g', seed: 'a', charting: true }, { gen: 'g', seed: 'b' }]), 'suspected');
});

test('status from attempts: ambiguous, correct and charting attempts do not activate', () => {
  assert.deepEqual(misconceptionStatus([]), {});
  assert.deepEqual(misconceptionStatus([attempt({ seed: 'a' })]), { m: 'suspected' });
  assert.deepEqual(misconceptionStatus([attempt({ seed: 'a' }), attempt({ seed: 'b' })]), { m: 'active' });
  assert.deepEqual(misconceptionStatus([attempt({ seed: 'a' }), attempt({ seed: 'b', ambiguous: true, misconceptions: ['m', 'k'] })]), { m: 'suspected' });
  assert.deepEqual(misconceptionStatus([attempt({ seed: 'a' }), attempt({ seed: 'b', verdict: 'correct' })]), { m: 'suspected' });
  assert.deepEqual(misconceptionStatus([attempt({ seed: 'a' }), attempt({ seed: 'b', context: 'charting' })]), { m: 'suspected' });
  assert.deepEqual(misconceptionStatus([attempt({ seed: 'a', misconceptions: ['m'] }), attempt({ seed: 'b', misconceptions: ['k'] })]), { m: 'suspected', k: 'suspected' });
});

test('status property: active exactly when 2 distinct non-charting items were hit', () => {
  forSeeds(2000, (rng) => {
    const hits = Array.from({ length: rng.int(0, 6) }, () => ({ gen: rng.pick(['g', 'h']), seed: rng.pick(['a', 'b']), charting: rng.bool(0.3) }));
    const distinct = new Set(hits.filter((h) => !h.charting).map((h) => h.gen + h.seed)).size;
    const want = hits.length === 0 ? 'none' : distinct >= 2 ? 'active' : 'suspected';
    assert.equal(statusOfHits(hits), want);
    assert.equal(statusOfHits(rng.shuffle(hits)), want, 'order does not matter');
  });
});
