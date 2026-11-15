// @ts-check
// The 19 mal-rules (DESIGN.md section 5) on hand-built Problems: no
// generator is involved, so rules for skills whose generators do not exist
// yet are tested here against the Problem shape alone.
//   1. registry: 19 rules, one file each, the section 5 names.
//   2. the section 5 examples, number for number (these are the numbers the
//      design says were only checked by hand).
//   3. which rules fire on which fixture: an exact table, so a rule that
//      starts firing somewhere new is noticed.
//   4. properties over random items, against the bug restated in plain
//      BigInt arithmetic (an independent path), 2000 seeds each.
//   5. robustness: no rule throws on any fixture or on malformed Problems.
// Run: node scripts/gen-registry.js && node --test test/misc/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forSeeds } from '../prop.js';
import { malrules, malruleById, outputsOf, outputText, matchesKey, diagnose } from '../../src/misc/diagnose.js';
import { skills } from '../../src/data/skills.js';
import { evaluate } from '../../src/math/evaluate.js';
import { q, qstr } from '../../src/math/rational.js';
import { toQ, seq, smul } from '../../src/math/surd.js';
import { isEquation } from '../../src/math/ast.js';
import * as F from './_fixtures.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every output of rule `id` on p, as keypad text. @param {string} id @param {Problem} p */
const outs = (id, p) => outputsOf(malruleById(id), p).map((o) => outputText(p, o));

/** Exact rational value of an expression at x. @param {Node} n @param {number | bigint} x */
function at(n, x) {
  const v = evaluate(n, { x: q(x) });
  const r = v && toQ(v);
  if (!r) throw new Error('not a rational value');
  return qstr(r);
}

const SECTION5 = [
  ['equals-as-operator', 'the Announcer'], ['form-change-changes-value', 'the Stranger'],
  ['one-sided-operation', 'the Lopsider'], ['one-part-coin', 'the Half-Coin'],
  ['scalar-times-both-parts', 'the Stacker'], ['partial-distribution', 'the Half-Hand'],
  ['neg-distribution', 'the Sign-Thief'], ['transpose-no-sign-change', 'the Carrier'],
  ['transpose-coefficient-as-subtract', 'the Peeler'], ['divide-one-term', 'the Slicer'],
  ['copy-coefficients', 'the Copyist'], ['divide-by-variable-loses-root', 'the Lost Root'],
  ['freshmans-dream-square', 'the Spreader'], ['cancel-across-sum', 'the Crosser'],
  ['sqrt-splits-sum', 'the Splitter'], ['half-power-is-half', 'the Halver'],
  ['sqrt-product-misapplied', 'the Smuggler'], ['root-square-overshoot', 'the Overshoot'],
  ['scalar-into-denominator', 'the Sinker'],
];

test('registry: the 19 section 5 mal-rules, one file each', () => {
  const files = readdirSync(join(ROOT, 'src', 'misc', 'malrules')).filter((f) => f.endsWith('.js')).sort();
  assert.deepEqual(files, SECTION5.map(([id]) => `${id}.js`).sort());
  assert.equal(malrules.length, 19, 'run node scripts/gen-registry.js');
  assert.deepEqual(malrules.map((r) => [r.id, r.haunt]), SECTION5);
  assert.deepEqual(malrules.map((r) => r.n), Array.from({ length: 19 }, (_, i) => i + 1));
  const skillIds = new Set(skills.map((s) => s.id));
  for (const r of malrules) {
    assert.ok(r.standardTerm.length > 0 && /^[\x20-\x7e]+$/.test(r.standardTerm), `${r.id}: standardTerm`);
    assert.ok(/^[\x20-\x7e]+$/.test(r.script), `${r.id}: script is ASCII`);
    assert.ok(r.script.trim().split(/\s+/).length <= 15, `${r.id}: the script is the 15-word line`);
    assert.ok(r.skills.length > 0 && r.skills.every((s) => skillIds.has(s)), `${r.id}: skills`);
    assert.equal(typeof r.apply, 'function');
    assert.equal(typeof r.applyAll, 'function');
  }
});

// ---------------------------------------------------------------- 2. the section 5 examples

test('1 equals-as-operator: 3 + 4 = [ ] + 2 -> 7', () => {
  assert.deepEqual(outs('equals-as-operator', F.blankItem('3 + 4 = z + 2', '5')), ['7']);
  assert.deepEqual(outs('equals-as-operator', F.blankItem('z + 2 = 3 + 4', '5')), [], 'blank on the left: not this reading');
  assert.deepEqual(outs('equals-as-operator', F.solveItem('3 + 4 = x + 2', ['5'])), [], 'only the fill-the-blank variant');
});

test('2 form-change-changes-value: "Different" on an equivalent Twin', () => {
  const r = malruleById('form-change-changes-value');
  assert.ok(r.picks);
  assert.deepEqual(r.picks(F.twinItem('6/9', '2/3', true)), ['different']);
  assert.deepEqual(r.picks(F.twinItem('2(x + 3)', '2x + 6', true)), ['different']);
  assert.deepEqual(r.picks(F.twinItem('(x + 3)^2', 'x^2 + 9', false)), [], 'a truly different pair');
  assert.deepEqual(r.picks(F.exprItem('6/9', '2/3')), [], 'not a Twin');
  assert.equal(r.apply(F.twinItem('6/9', '2/3', true)), undefined);
});

test('3 one-sided-operation: x/3 = 5 -> 5', () => {
  assert.deepEqual(outs('one-sided-operation', F.solveItem('x/3 = 5', ['15'])), ['5']);
  assert.deepEqual(outs('one-sided-operation', F.solveItem('5 = x/3', ['15'])), ['5']);
  assert.deepEqual(outs('one-sided-operation', F.lineItem('3x + 5 = 11', F.mv('sub', '5'), '3x = 6')), ['3x = 11', '3x + 5 = 6']);
  assert.deepEqual(outs('one-sided-operation', F.rewriteItem('6 + 4x = 2x^2')), ['0 = 2x^2', '6 + 4x = 0']);
  assert.deepEqual(outs('one-sided-operation', F.solveItem('x = 5', ['5'])), [], 'nothing to undo');
});

test('4 one-part-coin: 6/sqrt(3) -> 6, or -> 2', () => {
  assert.deepEqual(outs('one-part-coin', F.exprItem('6/sqrt(3)', '2sqrt(3)', ['no-radical-in-denominator'])), ['6', '2']);
  assert.deepEqual(outs('one-part-coin', F.exprItem('(6/sqrt(3))(sqrt(3)/sqrt(3))', '2sqrt(3)')), ['6', '2']);
  assert.deepEqual(outs('one-part-coin', F.exprItem('(3/4)(5/5)', '15/20')), ['15/4', '3/20']);
  const forge = F.problem(F.N('6/sqrt(3)'), { kind: 'form-of-1', expected: F.N('sqrt(3)/sqrt(3)'), formPredicates: ['no-radical-in-denominator'], assumptions: [] }, { interaction: 'forge' });
  assert.deepEqual(outs('one-part-coin', forge), ['sqrt(3)/1', '1/sqrt(3)']);
  assert.deepEqual(outs('one-part-coin', F.exprItem('6/sqrt(3)', '2sqrt(3)')), [], 'no goal, no implied coin');
});

test('5 scalar-times-both-parts and 19 scalar-into-denominator: 4 x 1/3 -> 4/12, 1/12', () => {
  const p = F.exprItem('4(1/3)', '4/3');
  assert.deepEqual(outs('scalar-times-both-parts', p), ['4/12']);
  assert.deepEqual(outs('scalar-into-denominator', p), ['1/12']);
  const swapped = F.exprItem('(3/8)(4)', '3/2');
  assert.deepEqual(outs('scalar-times-both-parts', swapped), ['12/32']);
  assert.deepEqual(outs('scalar-into-denominator', swapped), ['3/32']);
  const forge = F.exprItem('4(1/3)', '4/1', ['integer-fraction'], { interaction: 'forge', variant: 'whole-as-fraction' });
  assert.deepEqual(outs('scalar-times-both-parts', forge), ['4/4']);
  assert.deepEqual(outs('scalar-into-denominator', forge), ['1/4']);
  assert.deepEqual(outs('scalar-times-both-parts', F.exprItem('(2/3)(1/3)', '2/9')), [], 'no whole number');
});

test('6 partial-distribution: 3(x + 4) at x = 2 is 18; the bug gives 10', () => {
  const p = F.exprItem('3(x + 4)', '3x + 12');
  assert.deepEqual(outs('partial-distribution', p), ['3x + 4']);
  assert.equal(at(/** @type {Node} */ (p.prompt.math), 2), '18/1');
  assert.equal(at(/** @type {Node} */ (malruleById('partial-distribution').apply(p)), 2), '10/1');
  assert.deepEqual(outs('partial-distribution', F.exprItem('2 + 3(x + 4)', '3x + 14')), ['3x + 6']);
  assert.deepEqual(outs('partial-distribution', F.solveItem('3(x + 4) = 18', ['2'])), ['14/3']);
  // A bare minus reaching only the first term IS partial distribution, and it is
  // also the Sign-Thief's line: both rules fire, so the diagnosis is ambiguous
  // (generators therefore do not plant it; see test/gen/distribute.test.js).
  const bare = F.exprItem('-(x + 4)', '-x - 4');
  assert.deepEqual(outs('partial-distribution', bare), ['-x + 4']);
  const dx = diagnose(bare, F.N('-x + 4'));
  assert.equal(dx.ambiguous, true);
  assert.ok(dx.misconceptions.includes('partial-distribution') && dx.misconceptions.includes('neg-distribution'), dx.misconceptions.join());
});

test('7 neg-distribution: -3(2x - 5) at x = 2 is 3; the bug gives -27', () => {
  const p = F.exprItem('-3(2x - 5)', '-6x + 15');
  assert.deepEqual(outs('neg-distribution', p), ['-6x - 15']);
  assert.equal(at(/** @type {Node} */ (p.prompt.math), 2), '3/1');
  assert.equal(at(/** @type {Node} */ (malruleById('neg-distribution').apply(p)), 2), '-27/1');
  assert.deepEqual(outs('neg-distribution', F.exprItem('-(x - 4)', '-x + 4')), ['-x - 4']);
  assert.deepEqual(outs('neg-distribution', F.exprItem('7 - 2(x + 3)', '-2x + 1')), ['-2x + 13']);
  assert.deepEqual(outs('neg-distribution', F.exprItem('3(x - 4)', '3x - 12')), [], 'a positive multiplier');
});

test('8 transpose-no-sign-change: x + 5 = 12 -> 17', () => {
  assert.deepEqual(outs('transpose-no-sign-change', F.solveItem('x + 5 = 12', ['7'])), ['17']);
  assert.deepEqual(outs('transpose-no-sign-change', F.solveItem('12 = x + 5', ['7'])), ['17']);
  assert.deepEqual(outs('transpose-no-sign-change', F.solveItem('5x + 3 = 2x + 12', ['3'])), ['15/7', '9/7', '5']);
  assert.deepEqual(outs('transpose-no-sign-change', F.lineItem('3x + 5 = 11', F.mv('sub', '5'), '3x = 6')), ['3x = 16', '3x + 10 = 6']);
  assert.deepEqual(outs('transpose-no-sign-change', F.rewriteItem('6 + 4x = 2x^2')), ['2x^2 + 4x + 6 = 0']);
  assert.deepEqual(outs('transpose-no-sign-change', F.solveItem('3x = 12', ['4'])), [], 'no term to carry');
});

test('9 transpose-coefficient-as-subtract: 3x = 12 -> 9', () => {
  assert.deepEqual(outs('transpose-coefficient-as-subtract', F.solveItem('3x = 12', ['4'])), ['9']);
  assert.deepEqual(outs('transpose-coefficient-as-subtract', F.solveItem('3x + 2 = 14', ['4'])), ['9']);
  assert.deepEqual(outs('transpose-coefficient-as-subtract', F.lineItem('3x = 12', F.mv('div', '3'), 'x = 4')), ['x = 9']);
  assert.deepEqual(outs('transpose-coefficient-as-subtract', F.solveItem('x + 5 = 12', ['7'])), [], 'coefficient 1');
});

test('10 divide-one-term: 2x + 6 = 10 -> x + 6 = 5', () => {
  assert.deepEqual(outs('divide-one-term', F.lineItem('2x + 6 = 10', F.mv('div', '2'), 'x + 3 = 5')), ['x + 6 = 5']);
  assert.deepEqual(outs('divide-one-term', F.solveItem('2x + 6 = 10', ['2'])), ['-1'], 'the solution of x + 6 = 5');
  assert.deepEqual(outs('divide-one-term', F.solveItem('3x = 12', ['4'])), [], 'one term only');
});

test('11 copy-coefficients: 6 + 4x = 2x^2 read as 2, 4, 6', () => {
  const abc = F.abcItem('6 + 4x = 2x^2', ['2', '-4', '-6']);
  assert.deepEqual(outs('copy-coefficients', abc), ['2, 4, 6', '2, 4, -6', '2, -4, 6']);
  // their 2x^2 + 4x + 6 gives 36 at the root x = 3, not 0
  assert.equal(at(F.N('2x^2 + 4x + 6'), 3), '36/1');
  assert.equal(at(F.N('6 + 4x'), 3), at(F.N('2x^2'), 3));
  // the rewrite task: L + R = 0 is left to the Carrier (documented deviation)
  assert.deepEqual(outs('copy-coefficients', F.rewriteItem('6 + 4x = 2x^2')), ['2x^2 + 4x - 6 = 0', '2x^2 - 4x + 6 = 0']);
  // NOT triggered by keeping x^2 on the right
  assert.deepEqual(outs('copy-coefficients', F.abcItem('0 = 2x^2 - 4x - 6', ['2', '-4', '-6'])), []);
  for (const o of outputsOf(malruleById('copy-coefficients'), abc)) assert.equal(matchesKey(abc, o), false);
});

test('12 divide-by-variable-loses-root: x^2 = 3x -> 3 only', () => {
  assert.deepEqual(outs('divide-by-variable-loses-root', F.solveItem('x^2 = 3x', ['0', '3'])), ['3']);
  assert.deepEqual(outs('divide-by-variable-loses-root', F.solveItem('2x^2 = -8x', ['-4', '0'])), ['-4']);
  assert.deepEqual(outs('divide-by-variable-loses-root', F.solveItem('x^2 - 3x = 0', ['0', '3'])), ['3']);
  assert.deepEqual(outs('divide-by-variable-loses-root', F.solveItem('x^2 = 9', ['-3', '3'])), []);
  const cast = F.problem(F.E('x^2 = 3x'), { kind: 'solution-set', expected: { kind: 'finite', roots: [F.evalConst('0'), F.evalConst('3')] }, formPredicates: [], assumptions: [] }, {
    interaction: 'cast', constructed: false, variant: 'one-way',
    choices: [
      { id: 'a', display: F.mv('div', 'x'), verdict: 'risky' },
      { id: 'b', display: F.mv('sub', '3x'), verdict: 'progress' },
      { id: 'c', display: F.mv('div', '3'), verdict: 'legal-idle' },
    ],
  });
  const r = malruleById('divide-by-variable-loses-root');
  assert.deepEqual(r.picks && r.picks(cast), ['a']);
  assert.deepEqual(r.picks && r.picks({ ...cast, variant: undefined }), [], 'elsewhere risky is a caution, not a miss');
});

test('13 freshmans-dream-square: (x + 3)^2 at x = 2 is 25; the bug gives 13', () => {
  const p = F.exprItem('(x + 3)^2', 'x^2 + 6x + 9');
  assert.deepEqual(outs('freshmans-dream-square', p), ['x^2 + 9']);
  assert.equal(at(/** @type {Node} */ (p.prompt.math), 2), '25/1');
  assert.equal(at(/** @type {Node} */ (malruleById('freshmans-dream-square').apply(p)), 2), '13/1');
  assert.deepEqual(outs('freshmans-dream-square', F.exprItem('(x - 3)^2', 'x^2 - 6x + 9')), ['x^2 + 9', 'x^2 - 9']);
  assert.deepEqual(outs('freshmans-dream-square', F.exprItem('(2x + 1)^3', '8x^3 + 12x^2 + 6x + 1')), ['8x^3 + 1']);
  assert.deepEqual(outs('freshmans-dream-square', F.exprItem('(3x)^2', '9x^2')), [], 'a product, not a sum');
});

test('14 cancel-across-sum: (x + 6)/3 at x = 3 is 3; the bug gives 5', () => {
  const p = F.exprItem('(x + 6)/3', '(x + 6)/3');
  assert.deepEqual(outs('cancel-across-sum', p), ['x + 2']);
  assert.equal(at(/** @type {Node} */ (p.prompt.math), 3), '3/1');
  assert.equal(at(/** @type {Node} */ (malruleById('cancel-across-sum').apply(p)), 3), '5/1');
  assert.deepEqual(outs('cancel-across-sum', F.exprItem('(x + 3)/x', '(x + 3)/x')), ['4', '3']);
  assert.deepEqual(outs('cancel-across-sum', F.exprItem('x/(x + 3)', 'x/(x + 3)')), ['1/4', '1/3']);
  assert.deepEqual(outs('cancel-across-sum', F.exprItem('(6x)/3', '2x')), [], 'a factor really cancels');
});

test('15 sqrt-splits-sum: sqrt(9 + 16) is 5; the bug gives 7', () => {
  const p = F.exprItem('sqrt(9 + 16)', '5');
  const o = /** @type {Node} */ (malruleById('sqrt-splits-sum').apply(p));
  assert.equal(at(o, 0), '7/1');
  assert.equal(at(/** @type {Node} */ (p.prompt.math), 0), '5/1');
  assert.deepEqual(outs('sqrt-splits-sum', F.exprItem('sqrt(25 - 9)', '4')), ['5 - 3']);
  assert.deepEqual(outs('sqrt-splits-sum', F.exprItem('sqrt(2 + 7)', '3')), ['sqrt(2) + sqrt(7)']);
  assert.deepEqual(outs('sqrt-splits-sum', F.exprItem('sqrt(9(16))', '12')), [], 'a product splits correctly');
});

test('16 half-power-is-half: 9^(1/2) -> 4.5, and 4.5 x 4.5 is 20.25, not 9', () => {
  assert.deepEqual(outs('half-power-is-half', F.exprItem('9^(1/2)', '3')), ['9/2']);
  assert.deepEqual(outs('half-power-is-half', F.exprItem('sqrt(9)', '3')), ['9/2']);
  assert.equal(at(F.N('(9/2)(9/2)'), 0), '81/4');
  assert.deepEqual(outs('half-power-is-half', F.exprItem('9^2', '81')), []);
});

test('17 sqrt-product-misapplied: sqrt(12) -> 4 sqrt(3) (square 48, not 12); 2 sqrt(3) -> sqrt(6)', () => {
  const p = F.exprItem('sqrt(12)', '2sqrt(3)', ['radical-simplified']);
  assert.deepEqual(outs('sqrt-product-misapplied', p), ['4sqrt(3)']);
  const o = evaluate(/** @type {Node} */ (malruleById('sqrt-product-misapplied').apply(p)), {});
  assert.ok(o && seq(smul(o, o), F.evalConst('48')));
  assert.deepEqual(outs('sqrt-product-misapplied', F.exprItem('sqrt(72)', '6sqrt(2)')), ['36sqrt(2)', '9sqrt(8)', '4sqrt(18)']);
  assert.deepEqual(outs('sqrt-product-misapplied', F.exprItem('2sqrt(3)', 'sqrt(12)')), ['sqrt(6)']);
  assert.deepEqual(outs('sqrt-product-misapplied', F.exprItem('sqrt(7)', 'sqrt(7)')), []);
  // k sqrt(m) with a square in m: both section 5 patterns (factor leaves un-rooted; k enters un-squared)
  assert.deepEqual(outs('sqrt-product-misapplied', F.exprItem('3sqrt(54)', '9sqrt(6)')), ['3(9sqrt(6))', 'sqrt(162)']);
});

test('18 root-square-overshoot: sqrt(3) x sqrt(3) -> 9', () => {
  assert.deepEqual(outs('root-square-overshoot', F.exprItem('sqrt(3)sqrt(3)', '3')), ['9']);
  assert.deepEqual(outs('root-square-overshoot', F.exprItem('(sqrt(3))^2', '3')), ['9']);
  assert.deepEqual(outs('root-square-overshoot', F.exprItem('6/sqrt(3)', '2sqrt(3)', ['no-radical-in-denominator'])), ['2sqrt(3)/3']);
  assert.deepEqual(outs('root-square-overshoot', F.exprItem('sqrt(3)sqrt(5)', 'sqrt(15)')), []);
});

// ---------------------------------------------------------------- 3. the firing table

/** @type {Record<string, [Problem, number[]]>} fixture -> the rule numbers that have an output on it */
const TABLE = {
  blank: [F.blankItem('3 + 4 = z + 2', '5'), [1]],
  ftw: [F.exprItem('4(1/3)', '4/3'), [5, 19]],
  coin: [F.exprItem('6/sqrt(3)', '2sqrt(3)', ['no-radical-in-denominator']), [4, 16, 18]],
  distribute: [F.exprItem('3(x + 4)', '3x + 12'), [6]],
  negDistribute: [F.exprItem('-3(2x - 5)', '-6x + 15'), [6, 7]],
  oneStep: [F.solveItem('x + 5 = 12', ['7']), [3, 8]],
  coefficient: [F.solveItem('3x = 12', ['4']), [3, 9]],
  twoStep: [F.solveItem('2x + 6 = 10', ['2']), [3, 8, 9, 10]],
  bothSides: [F.solveItem('5x + 3 = 2x + 12', ['3']), [8]],
  lineSub: [F.lineItem('3x + 5 = 11', F.mv('sub', '5'), '3x = 6'), [3, 8]],
  lineDiv: [F.lineItem('2x + 6 = 10', F.mv('div', '2'), 'x + 3 = 5'), [3, 9, 10]],
  rewrite: [F.rewriteItem('6 + 4x = 2x^2'), [3, 8, 11]],
  readAbc: [F.abcItem('6 + 4x = 2x^2', ['2', '-4', '-6']), [11]],
  lostRoot: [F.solveItem('x^2 = 3x', ['0', '3']), [12]],
  square: [F.exprItem('(x + 3)^2', 'x^2 + 6x + 9'), [13]],
  cancel: [F.exprItem('(x + 6)/3', '(x + 6)/3'), [14]],
  splits: [F.exprItem('sqrt(9 + 16)', '5'), [15, 16]],
  halfPower: [F.exprItem('9^(1/2)', '3'), [16]],
  simplify: [F.exprItem('sqrt(12)', '2sqrt(3)', ['radical-simplified']), [16, 17]],
  rootSquared: [F.exprItem('sqrt(3)sqrt(3)', '3'), [16, 18]],
  plain: [F.exprItem('2x + 3x', '5x'), []],
  plainSolve: [F.solveItem('x = 4', ['4']), []],
};

test('which rules fire on which item (exact table)', () => {
  for (const [name, [p, want]] of Object.entries(TABLE)) {
    const got = malrules.filter((r) => outputsOf(r, p).length > 0).map((r) => r.n);
    assert.deepEqual(got, want, `fixture ${name}`);
    for (const r of malrules) {
      const all = outputsOf(r, p);
      assert.deepEqual(r.apply(p), all[0], `${r.id}: apply is the first of applyAll`);
    }
  }
});

test('on each fixture no rule gives the key, except the one known coincidence', () => {
  for (const [name, [p]] of Object.entries(TABLE)) {
    for (const r of malrules) {
      for (const o of outputsOf(r, p)) {
        const coincidence = name === 'twoStep' && r.n === 9; // (10 - 6) - 2 = 2 is also the root of 2x + 6 = 10
        assert.equal(matchesKey(p, o), coincidence, `${name} / ${r.id} / ${outputText(p, o)}`);
      }
    }
  }
});

// ---------------------------------------------------------------- 4. properties

/** @param {import('../../types.d.ts').Rng} rng @param {number} lo @param {number} hi */
function nz(rng, lo, hi) { for (;;) { const x = rng.int(lo, hi); if (x !== 0) return x; } }

/** @param {number | bigint} n @param {number | bigint} [d] */
const frac = (n, d = 1) => qstr(q(n, d));

/** The single rational root of a one-root solution set. @param {unknown} o */
function root(o) {
  const s = /** @type {import('../../types.d.ts').SolutionSet} */ (o);
  assert.ok(s && s.kind === 'finite' && s.roots.length === 1);
  const r = toQ(s.roots[0]);
  assert.ok(r);
  return qstr(r);
}

/** Signed term text for building prompts: " + 3", " - 3". @param {number} k */
const signed = (k) => (k < 0 ? ` - ${-k}` : ` + ${k}`);

test('property: linear solve bugs 3, 8, 9, 10 equal their plain-arithmetic formulas', () => {
  forSeeds(2000, (rng) => {
    const a = nz(rng, -9, 9);
    const b = nz(rng, -9, 9);
    const d = rng.int(-12, 12);
    const flip = rng.bool();
    const left = `${a}x${signed(b)}`;
    const p = F.solveItem(flip ? `${d} = ${left}` : `${left} = ${d}`, ['0']); // the key is not used by the rules
    assert.equal(root(malruleById('one-sided-operation').apply(p)), frac(d));
    assert.equal(root(malruleById('transpose-no-sign-change').apply(p)), frac(d + b, a));
    const whole = Math.abs(a) >= 2;
    const peel = malruleById('transpose-coefficient-as-subtract').apply(p);
    const slice = malruleById('divide-one-term').apply(p);
    if (whole) {
      assert.equal(root(peel), frac(d - b - a));
      assert.equal(root(slice), frac(d - b * a, a)); // d/a - b
    } else {
      assert.equal(peel, undefined);
      assert.equal(slice, undefined);
    }
  });
});

test('property: both-sides Carrier outputs are (d +- b)/(a +- c) with at least one sign kept', () => {
  forSeeds(2000, (rng) => {
    const a = nz(rng, -9, 9);
    const c = nz(rng, -9, 9);
    const b = nz(rng, -9, 9);
    const d = nz(rng, -9, 9);
    const p = F.solveItem(`${a}x${signed(b)} = ${c}x${signed(d)}`, ['0']);
    const got = outputsOf(malruleById('transpose-no-sign-change'), p).map(root);
    /** @type {string[]} */
    const want = [];
    for (const [A, D] of [[a + c, d + b], [a + c, d - b], [a - c, d + b]]) {
      if (A !== 0 && !want.includes(frac(D, A))) want.push(frac(D, A));
    }
    assert.deepEqual(got, want);
  });
});

test('property: distribution bugs 6 and 7 at exact points', () => {
  forSeeds(2000, (rng) => {
    const a = nz(rng, -9, 9);
    const m = nz(rng, -6, 6);
    const c = nz(rng, -9, 9);
    if (Math.abs(a) === 1) return;
    const p = F.exprItem(`${a < 0 ? '-' : ''}${Math.abs(a)}(${m}x${signed(c)})`, '0');
    const x = rng.pick([2, 3, -1, 5, -2]);
    const half = malruleById('partial-distribution').apply(p);
    assert.equal(at(/** @type {Node} */ (half), x), frac(a * m * x + c), 'first term only');
    const thief = malruleById('neg-distribution').apply(p);
    if (a < 0) assert.equal(at(/** @type {Node} */ (thief), x), frac(a * m * x + Math.abs(a) * c), 'the later term keeps its sign');
    else assert.equal(thief, undefined);
  });
});

test('property: 13 (x + c)^2 -> x^2 + c^2, 14 (x + kd)/d -> x + k, at exact points', () => {
  forSeeds(2000, (rng) => {
    const c = rng.int(1, 9);
    const x = rng.pick([2, 3, -1, 5, -2]);
    const sq = malruleById('freshmans-dream-square').apply(F.exprItem(`(x + ${c})^2`, '0'));
    assert.equal(at(/** @type {Node} */ (sq), x), frac(x * x + c * c));
    const d = rng.int(2, 9);
    const k = rng.int(1, 9);
    const cancel = malruleById('cancel-across-sum').apply(F.exprItem(`(x + ${k * d})/${d}`, '0'));
    assert.equal(at(/** @type {Node} */ (cancel), x), frac(x + k));
  });
});

test('property: radical bugs 15, 16, 17, 18 as exact numbers', () => {
  forSeeds(2000, (rng) => {
    const u = rng.int(1, 12);
    const w = rng.int(1, 12);
    const split = malruleById('sqrt-splits-sum').apply(F.exprItem(`sqrt(${u * u} + ${w * w})`, '0'));
    assert.equal(at(/** @type {Node} */ (split), 0), frac(u + w));

    const n = rng.int(2, 60);
    assert.equal(at(/** @type {Node} */ (malruleById('half-power-is-half').apply(F.exprItem(`${n}^(1/2)`, '0'))), 0), frac(n, 2));
    assert.equal(at(/** @type {Node} */ (malruleById('root-square-overshoot').apply(F.exprItem(`sqrt(${n})sqrt(${n})`, '0'))), 0), frac(n * n));

    const s = rng.int(2, 6);
    const m = rng.pick([2, 3, 5, 6, 7, 10]);
    const smug = evaluate(/** @type {Node} */ (malruleById('sqrt-product-misapplied').apply(F.exprItem(`sqrt(${s * s * m})`, '0'))), {});
    assert.ok(smug);
    const squared = toQ(smul(smug, smug));
    assert.ok(squared);
    assert.equal(qstr(squared), frac(s * s * s * s * m), 'the factor left un-rooted: (s^2 sqrt(m))^2');
  });
});

test('property: 5, 19 on n x a/b; 12 on x^2 = kx; 11 on a split quadratic', () => {
  forSeeds(2000, (rng) => {
    const n = rng.int(2, 12);
    const b = rng.int(2, 12);
    const a = rng.int(1, 11);
    const p = F.exprItem(rng.bool() ? `${n}(${a}/${b})` : `(${a}/${b})(${n})`, '0');
    assert.equal(at(/** @type {Node} */ (malruleById('scalar-times-both-parts').apply(p)), 0), frac(a, b), 'the value is still a/b');
    assert.equal(at(/** @type {Node} */ (malruleById('scalar-into-denominator').apply(p)), 0), frac(a, n * b));

    const k = nz(rng, -9, 9);
    assert.equal(root(malruleById('divide-by-variable-loses-root').apply(F.solveItem(`x^2 = ${k}x`, ['0']))), frac(k));

    // 6 + 4x = 2x^2 style: constant and x on the left, x^2 on the right
    const c0 = nz(rng, -9, 9);
    const c1 = nz(rng, -9, 9);
    const c2 = nz(rng, 1, 5);
    const item = F.abcItem(`${c0}${signed(c1)}x = ${c2}x^2`, [`${c2}`, `${-c1}`, `${-c0}`]);
    const read = outputsOf(malruleById('copy-coefficients'), item).map((o) => outputText(item, o));
    assert.equal(read[0], `${c2}, ${c1}, ${c0}`, 'read straight off, signs as displayed');
    for (const o of outputsOf(malruleById('copy-coefficients'), item)) {
      assert.ok(isEquation(o));
      assert.equal(matchesKey(item, o), false, 'never the true a, b, c or a multiple of them');
    }
  });
});

// ---------------------------------------------------------------- 5. robustness

test('no rule throws: fixtures, malformed Problems, wrong shapes', () => {
  const junk = /** @type {Problem[]} */ (/** @type {unknown} */ ([
    undefined, null, {}, { prompt: {} }, { prompt: { math: null }, answer: { kind: 'expr' } },
    { prompt: { math: F.N('1/0') }, answer: { kind: 'expr', expected: F.N('1'), formPredicates: [], assumptions: [] }, interaction: 'strike' },
    F.exprItem('sqrt(-4)', '2'), F.exprItem('(x + 1)^99', '1'), F.exprItem('0(1/0)', '0'),
    F.solveItem('x/0 = 3', ['1']), F.solveItem('x^3 = 8', ['2']), F.solveItem('x + y = 3', ['1']),
    F.lineItem('3x = 12', { op: 'div' }, 'x = 4'), F.lineItem('3x = 12', F.mv('div', '0'), 'x = 4'),
    F.abcItem('x = 2', ['0', '1', '-2']), F.twinItem('1/0', '2', false),
  ]));
  for (const p of [...junk, ...Object.values(TABLE).map(([x]) => x)]) {
    for (const r of malrules) {
      assert.doesNotThrow(() => { r.apply(p); r.applyAll(p); if (r.picks) r.picks(p); }, `${r.id}`);
    }
  }
});
