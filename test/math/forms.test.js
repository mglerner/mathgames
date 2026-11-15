// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { P, wildAst } from './_arb.js';
import { num, numQ, v, add, mul, neg, pow, eq, group } from '../../src/math/ast.js';
import { q } from '../../src/math/rational.js';
import { forms, formNames, getForm, hasForm, failedForms } from '../../src/math/forms.js';
import { toPoly, polyToNode, degree } from '../../src/math/poly.js';
import { polyAst } from './_arb.js';

/** name -> [texts that pass, texts that fail] -- each judged by hand */
/** @type {Record<string, [string[], string[]]>} */
const TABLE = {
  'lowest-terms': [
    ['3/4', '4/3', '4/1', '-3/4', '(-3)/4', '2', 'x', '(x+6)/3', 'x/2', '2sqrt(3)', 'sqrt(3)/2', '3x/4', '(2x+3)/4', '1/2+1/3', '2/3 = x', 'sqrt(8)/3', '2^3/3', 'a/b'],
    ['6/8', '15/20', '4/12', '2/2', '0/5', '3/(-4)', '3/0', '6sqrt(3)/3', '(2x+4)/2', '2x/4', '6/(3x)', '(6x+9)/3', '1/2+2/4', 'x = 6/4', '2^2/4', '(4x)/(2y)', '-(6/8)'],
  ],
  'no-radical-in-denominator': [
    ['2sqrt(3)', 'sqrt(3)/3', '6sqrt(3)/3', '3/4', 'x/2', 'sqrt(2)/2', '1/2', 'sqrt(x)/x', 'x^(1/2)/2', '2^(-1)', 'sqrt(3)', '(1+sqrt(2))/3'],
    ['6/sqrt(3)', '1/sqrt(2)', '1/(1+sqrt(2))', '1/(2sqrt(3))', 'x/sqrt(x)', '3/x^(1/2)', '1/9^(1/2)', 'sqrt(2)/sqrt(3)', '1/sqrt(4)', 'sqrt(3)^(-1)', 'x = 1/sqrt(2)', '2/(3sqrt(5))+1'],
  ],
  'no-radical': [
    ['3', '3/4', 'x^2+1', '2^3', 'x^(-2)', 'x = 3'],
    ['sqrt(3)', '2sqrt(3)', 'sqrt(4)', '9^(1/2)', 'x^(3/2)', '1/sqrt(2)', 'x = sqrt(3)', '2^(-1/2)'],
  ],
  'radical-simplified': [
    ['2sqrt(3)', 'sqrt(2)', 'sqrt(6)', 'sqrt(30)', '5', '3/4', 'sqrt(3)/3', 'sqrt(x)', 'sqrt(2x)', 'sqrt(xy)', 'x^2', '1 + sqrt(3)', 'sqrt(x+1)', '2^(1/2)', 'x = 2sqrt(3)', 'sqrt(15)sqrt(2)'],
    ['sqrt(12)', 'sqrt(8)', 'sqrt(4)', 'sqrt(1)', 'sqrt(0)', 'sqrt(18)+sqrt(2)', 'sqrt(1/2)', 'sqrt(2/3)', 'sqrt(x^2)', 'sqrt(x^3)', 'sqrt(4x)', 'sqrt(12x)', '2sqrt(50)', '8^(1/2)', '9^(1/2)', 'x = sqrt(12)', 'sqrt(4*9)', 'sqrt(9+16)', 'sqrt(72)/2'],
  ],
  'expanded': [
    ['3x+12', '2x^2-4x-6', 'x', '5', '-x+2', 'x^2+6x+9', 'xy+xz', '3x/4+1', 'x/(x+1)', 'sqrt(x+1)', '2^(x+1)', '-6x+15', 'x^2 = 3x'],
    ['3(x+4)', '(x+3)^2', '(x+1)(x+2)', '-(x-2)', 'x(y+z)', '2(x+3)+1', '(x+6)/3', '-3(2x-5)', '(x+1)^2 = 4', '2x+(x+1)3'],
  ],
  'combined': [
    ['5x', '2x+3', '2x^2-4x-6', 'x+y', 'xy+x+y+1', '3', 'sqrt(2)+sqrt(3)', '2sqrt(3)+1', 'x^2+x', 'x+sqrt(x)', '3x = 6', '2(x+3)', 'x^(1/2)+x'],
    ['3x+2x', '3+4', 'x+x', '2x+3+x', '5x-3x', 'x^2+6x+9-9', 'sqrt(18)+sqrt(2)', 'sqrt(3)+2sqrt(3)', 'xy+yx', 'x+(2+x)', '1/2+1/3', '3x+5-5 = 11-5', 'x-x', '2x+0', '2x-(x+1)', 'sqrt(4)+1'],
  ],
  'descending-order': [
    ['2x^2-4x-6', 'x^2', '-x^2+4', 'x', '5', '3x-1', 'x^3+x', 'x^2/2-3', '(1/2)x^2-x', '-2x^2+4x+6', 'x^2+xy+y^2', '(3/4)x'],
    ['6+4x', '-4x+2x^2-6', '2x^2-6-4x', 'x+x^2', 'x^2+x^2', '2x+3x', '(x-3)(x+1)', '2(x^2-2x-3)', 'x*x-1', '0x^2+1', 'x^2-0', '2x^2-4x-6+0', 'sqrt(x)', '1/x', 'x^2+2x^2-1'],
  ],
  'standard-form': [
    ['2x^2-4x-6 = 0', '0 = 2x^2-4x-6', '-2x^2+4x+6 = 0', 'x^2-2x-3 = 0', '0 = -x^2+2x+3', 'x^2-9 = 0', 'x^2 = 0', '3x-6 = 0', '(1/2)x^2-x-3/2 = 0'],
    ['6+4x = 2x^2', '2x^2-4x = 6', '2x^2 = 4x+6', '6+4x-2x^2 = 0', '-4x+2x^2-6 = 0', '2(x^2-2x-3) = 0', '(x-3)(x+1) = 0', '0 = 0', '2x^2-4x-6', 'x = 3', '2x^2-4x-6 = 0+0', '2x^2+x^2-6 = 0', '0 = 6+4x-2x^2'],
  ],
  'single-number': [
    ['3', '-3', '3/4', '-3/4', '(-3)/4', '0', '4/1', '(7)'],
    ['3+4', '2*3', '4*1/3', 'sqrt(4)', 'x', '2^3', '3/x', '1/2/3', '--3', 'x = 3', '3/0', '3/(-4)'],
  ],
  'integer': [
    ['3', '-3', '0', '(12)'],
    ['3/4', '3+4', 'x', 'sqrt(9)', '6/2', '--3'],
  ],
  'integer-fraction': [
    ['3/4', '-3/4', '4/1', '6/8', '(-3)/4'],
    ['3', 'x/2', '3/x', '(1+2)/3', 'sqrt(3)/3', '3/0'],
  ],
  'isolated': [
    ['x = 3', '3 = x', 'x = 1 + sqrt(3)', 'w = A/l', 'A = lw', 'x = y'],
    ['2x = 6', 'x = x', 'x + 1 = 4', 'x = 3 - x', 'x', '3', '-x = 3', 'x^2 = 9'],
  ],
  'factored-gcf': [
    ['3(x + 2)', '-3(x + 2)', '2x(x - 3)', '-2x(x + 3)', 'x(x + 1)', 'x^2(x + 1)', '5(2x + 3y)', '3(2x + 3)',
      '-(x + 2)', '4(x^2 - 2x + 3)', '(x + 2)3', '6xy(x + 2y)', '3x(2x^2 + 5)', '3(-x + 2)', '(2x)(x + 1)',
      '(1/2)(x + 4)', '2(3 + x)', '7(2x - 3) = 7(2x - 3)', 'x(y + 1)', '3(x + x + 1)'],
    ['3x + 6', '3(2x + 4)', '2(x^2 + x)', 'x(x^2 + x)', '3(x + 2) + 1', '(x + 1)(x + 2)', '3(x)', '3x', '6',
      '0(x + 1)', '3(x + 2)(x + 1)', 'sqrt(2)(x + 1)', '3(x/2 + 1)', '3(x + x)', 'x + 2', '(x + 2)', '3(sqrt(x) + 1)',
      '3(2 + 4)', '3(2 - 1)', '2(x + 1) = 4', 'xy(xy + x)', '3(x(x + 1) + 2)', '-(2x + 4)', '--3(x + 2)', '(x + 2)/3',
      '(x + 2)^2', '3(6x - 9)', 'x(x + 1) = 0', '-(-3)(x + 2)', '-(-x)(x + 1)'],
  ],
};

test('every registered predicate has a hand-judged pass/fail table', () => {
  assert.deepEqual([...formNames].sort(), Object.keys(TABLE).sort());
  for (const name of formNames) assert.equal(typeof forms[name], 'function');
  assert.ok(Object.isFrozen(forms));
});

for (const name of Object.keys(TABLE)) {
  test(`form "${name}"`, () => {
    const [pass, fail] = TABLE[name];
    for (const text of pass) assert.equal(forms[name](P(text)), true, `${name} should accept ${text}`);
    for (const text of fail) assert.equal(forms[name](P(text)), false, `${name} should reject ${text}`);
  });
}

test('the three teacher examples: value-right-but-unfinished answers are caught by form, finished ones pass', () => {
  // 6/sqrt(3) -> 2sqrt(3)
  const goal = ['no-radical-in-denominator', 'radical-simplified', 'lowest-terms'];
  assert.deepEqual(failedForms(goal, P('2sqrt(3)')), []);
  assert.deepEqual(failedForms(goal, P('6/sqrt(3)')), ['no-radical-in-denominator']);
  assert.deepEqual(failedForms(goal, P('6sqrt(3)/3')), ['lowest-terms']);
  assert.deepEqual(failedForms(goal, P('sqrt(12)')), ['radical-simplified']);
  // 4 x 1/3 -> 4/3
  assert.deepEqual(failedForms(['single-number', 'lowest-terms'], P('4/3')), []);
  assert.deepEqual(failedForms(['single-number', 'lowest-terms'], P('8/6')), ['lowest-terms']);
  assert.deepEqual(failedForms(['single-number', 'lowest-terms'], P('4*1/3')), ['single-number']);
  // 6 + 4x = 2x^2 -> standard form, either side zero
  assert.deepEqual(failedForms(['standard-form'], P('0 = 2x^2 - 4x - 6')), []);
  assert.deepEqual(failedForms(['standard-form'], P('2x^2 - 4x - 6 = 0')), []);
  assert.deepEqual(failedForms(['standard-form'], P('2x^2 - 4x = 6')), ['standard-form']);
  // distribute
  assert.deepEqual(failedForms(['expanded', 'combined'], P('3x + 12')), []);
  assert.deepEqual(failedForms(['expanded', 'combined'], P('3(x+4)')), ['expanded']);
  assert.deepEqual(failedForms(['expanded', 'combined'], P('3x + 6 + 6')), ['combined']);
});

test('generator-built trees (negative and rational literals) are judged like typed ones', () => {
  const x = v('x');
  const std = eq(add(mul(num(2), pow(x, num(2))), mul(num(-4), x), num(-6)), num(0));
  assert.equal(forms['standard-form'](std), true);
  assert.equal(forms['standard-form'](eq(num(0), add(mul(num(-2), pow(x, num(2))), mul(num(4), x), num(6)))), true);
  assert.equal(forms['single-number'](numQ(q(-4, 3))), true);
  assert.equal(forms['integer-fraction'](numQ(q(4, 3))), true);
  assert.equal(forms['integer'](num(-7)), true);
  assert.equal(forms['lowest-terms'](numQ(q(4, 3))), true);
  assert.equal(forms['descending-order'](add(mul(numQ(q(1, 2)), pow(x, num(2))), neg(x))), true);
  assert.equal(forms['expanded'](group(add(mul(num(-6), x), num(15)))), true);
});

test('parametric denominator:N, getForm, hasForm, failedForms', () => {
  assert.equal(/** @type {any} */ (getForm('denominator:21'))(P('15/21')), true);
  assert.equal(/** @type {any} */ (getForm('denominator:21'))(P('5/7')), false);
  assert.equal(/** @type {any} */ (getForm('denominator:21'))(P('15')), false);
  assert.equal(/** @type {any} */ (getForm('denominator:1'))(P('4/1')), true);
  assert.ok(hasForm('denominator:12') && hasForm('lowest-terms'));
  for (const bad of ['denominator:', 'denominator:x', 'denominator:-2', 'nope', '', 'toString', '__proto__', 'constructor']) {
    assert.equal(getForm(bad), undefined, bad);
    assert.equal(hasForm(bad), false, bad);
  }
  assert.throws(() => failedForms(['nope'], P('x')), RangeError);
  assert.deepEqual(failedForms([], P('x')), []);
  assert.deepEqual(failedForms(['integer', 'lowest-terms', 'no-radical'], P('sqrt(4)/2')), ['integer', 'no-radical']);
});

test('predicates return booleans and never throw on arbitrary trees (5000 seeds)', () => {
  forSeeds(5000, (rng) => {
    const a = wildAst(rng, 4); const b = wildAst(rng, 3);
    for (const name of formNames) {
      assert.equal(typeof forms[name](a), 'boolean', name);
      assert.equal(typeof forms[name](eq(a, b)), 'boolean', name);
    }
  });
});

test('canonical polynomial output is expanded, combined and in descending order (3000 seeds)', () => {
  forSeeds(3000, (rng) => {
    const p = /** @type {any} */ (toPoly(polyAst(rng, ['x'], 3)));
    const tree = polyToNode(p);
    for (const name of ['expanded', 'combined']) assert.equal(forms[name](tree), true, name);
    if (p.terms.size > 0) assert.equal(forms['descending-order'](tree), true);
    // Review fix: a constant equation (6 = 0) is not a polynomial in standard form.
    if (p.terms.size > 0) assert.equal(forms['standard-form'](eq(tree, num(0))), degree(p) > 0);
    // group nodes never change a verdict
    for (const name of formNames) assert.equal(forms[name](group(tree)), forms[name](tree), name);
  });
});
