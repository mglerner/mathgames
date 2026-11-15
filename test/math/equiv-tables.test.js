// @ts-check
// Hand-checked TRUE / FALSE / CANNOT-VERIFY equivalence tables (DESIGN.md
// section 11 and the M1a acceptance). Every entry was worked by hand; the
// tests also re-check each one through an independent path (exact evaluation
// at points), so a typo in a table fails loudly instead of teaching the
// checker a wrong fact.
//
// Assumption shorthand: 'x>=0' nonneg, 'x>0' pos, 'x!=0' nonzero.
// NOTE marks entries that are equal only where defined (the note must say so).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, show } from './_arb.js';
import { q } from '../../src/math/rational.js';
import { vars } from '../../src/math/ast.js';
import { evaluate } from '../../src/math/evaluate.js';
import { seq } from '../../src/math/surd.js';
import { equivExpr, sameSides, isMultiple, multiplier, sameSolutions, findWitness, WHERE_DEFINED } from '../../src/math/equiv.js';
import { print } from '../../src/math/print.js';
import { surdToNode } from '../../src/math/surd.js';

/** @typedef {import('../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../../types.d.ts').Q} Q */

const NOTE = 'NOTE';

/** @param {string[]} [specs] @returns {Assumption[]} */
function assume(specs = []) {
  return specs.filter((s) => s !== NOTE).map((s) => {
    const m = /^([a-zA-Z])(>=0|>0|!=0)$/.exec(s);
    if (!m) throw new Error(`bad assumption ${s}`);
    return { name: m[1], rel: m[2] === '>=0' ? 'nonneg' : m[2] === '>0' ? 'pos' : 'nonzero' };
  });
}

/** @type {[string, string, string[]?][]} */
const TRUE = [
  // --- polynomial identities
  ['2(x+3)', '2x+6'],
  ['(x+3)^2', 'x^2+6x+9'],
  ['(a+b)^2', 'a^2+2ab+b^2'],
  ['(a-b)^2', 'a^2-2ab+b^2'],
  ['(a+b)(a-b)', 'a^2-b^2'],
  ['x+x', '2x'],
  ['3x+2x', '5x'],
  ['x*x', 'x^2'],
  ['-(x-2)', '2-x'],
  ['-3(2x-5)', '-6x+15'],
  ['3(x+4)', '3x+12'],
  ['(x+1)(x+2)', 'x^2+3x+2'],
  ['(x-3)(x+1)', 'x^2-2x-3'],
  ['2x^2-4x-6', '2(x-3)(x+1)'],
  ['x^2+6x', 'x^2+6x+9-9'],
  ['x^2+6x+9-9', '(x+3)^2-9'],
  ['(x+6)/3', 'x/3+2'],
  ['(2x+4)/2', 'x+2'],
  ['x/2+x/3', '5x/6'],
  ['(1/2)x', 'x/2'],
  ['1/2x', 'x/2'],
  ['x^2*x^3', 'x^5'],
  ['(x^2)^3', 'x^6'],
  ['(2x)^3', '8x^3'],
  ['(xy)^2', 'x^2y^2'],
  ['x(y+z)', 'xy+xz'],
  ['(a+b)^3', 'a^3+3a^2b+3ab^2+b^3'],
  ['(x+1)^2-(x-1)^2', '4x'],
  ['0x', '0'],
  ['x-x', '0'],
  ['2(l+w)', '2l+2w'],
  ['(x+y+z)^2', 'x^2+y^2+z^2+2xy+2yz+2xz'],
  ['x^1', 'x'],
  ['4x/4', 'x'],
  ['(3/4)(8x-4)', '6x-3'],
  ['(-x)^2', 'x^2'],
  ['(-x)^3', '-x^3'],
  ['x-(y-z)', 'x-y+z'],
  ['(x-2)^2+3', 'x^2-4x+7'],
  ['6+4x-2x^2', '-2(x^2-2x-3)'],
  ['(2l+2w)/2', 'l+w'],
  // --- rational arithmetic
  ['4*1/3', '4/3'],
  ['3/4', '15/20'],
  ['6/9', '2/3'],
  ['1/2+1/3', '5/6'],
  ['2/3-1/6', '1/2'],
  ['(2/3)/(4/9)', '3/2'],
  ['2^3', '8'],
  ['2^(-1)', '1/2'],
  ['5^0', '1'],
  ['(-2)^2', '4'],
  ['-2^2', '-4'],
  ['3+4', '5+2'],
  ['4/1', '4'],
  ['2-3*4', '-10'],
  ['(2/3)^2', '4/9'],
  ['2^(-2)', '1/4'],
  ['(1/2)^(-3)', '8'],
  ['7-(-3)', '10'],
  // --- numeric radicals and rational powers
  ['sqrt(4*9)', 'sqrt(4)*sqrt(9)'],
  ['sqrt(3)*sqrt(3)', '3'],
  ['sqrt(3)^2', '3'],
  ['6/sqrt(3)', '2sqrt(3)'],
  ['sqrt(12)', '2sqrt(3)'],
  ['sqrt(8)', '2sqrt(2)'],
  ['sqrt(2)*sqrt(3)', 'sqrt(6)'],
  ['sqrt(9+16)', '5'],
  ['sqrt(1/4)', '1/2'],
  ['1/sqrt(2)', 'sqrt(2)/2'],
  ['sqrt(18)+sqrt(2)', '4sqrt(2)'],
  ['(1+sqrt(3))^2', '4+2sqrt(3)'],
  ['(1+sqrt(3))(1-sqrt(3))', '-2'],
  ['1/(1+sqrt(2))', 'sqrt(2)-1'],
  ['sqrt(50)', '5sqrt(2)'],
  ['sqrt(3)/sqrt(12)', '1/2'],
  ['sqrt(2/3)', 'sqrt(6)/3'],
  ['2sqrt(3)*3sqrt(3)', '18'],
  ['sqrt(72)', '6sqrt(2)'],
  ['(9^(1/2))^2', '9'],
  ['9^(1/2)', '3'],
  ['8^(1/3)', '2'],
  ['27^(2/3)', '9'],
  ['4^(3/2)', '8'],
  ['4^(-1/2)', '1/2'],
  ['2^(1/2)', 'sqrt(2)'],
  ['2^(1/2)*2^(1/2)', '2'],
  ['(4+sqrt(48))/4', '1+sqrt(3)'],
  ['sqrt(5)*sqrt(5)', '5'],
  ['10/sqrt(5)', '2sqrt(5)'],
  ['sqrt(16)', '4'],
  ['sqrt(0)', '0'],
  ['3/sqrt(6)', 'sqrt(6)/2'],
  ['sqrt(2)+sqrt(2)', 'sqrt(8)'],
  ['16^(1/4)', '2'],
  ['(sqrt(2)+sqrt(3))^2', '5+2sqrt(6)'],
  ['1/(sqrt(3)-sqrt(2))', 'sqrt(3)+sqrt(2)'],
  // --- rational functions: equal where defined
  ['x/x', '1', [NOTE]],
  ['(x^2-1)/(x-1)', 'x+1', [NOTE]],
  ['1/x+1/y', '(x+y)/(xy)', [NOTE]],
  ['(2x)/(4x)', '1/2', [NOTE]],
  ['x^2/x', 'x', [NOTE]],
  ['1/(1/x)', 'x', [NOTE]],
  ['x^(-1)', '1/x', [NOTE]],
  ['x^0', '1', [NOTE]],
  ['(x+1)/(x+1)', '1', [NOTE]],
  ['a/b*b/a', '1', [NOTE]],
  ['1/x-1/(x+1)', '1/(x(x+1))', [NOTE]],
  ['x^2*x^(-2)', '1', [NOTE]],
  ['(x^2+x)/x', 'x+1', [NOTE]],
  // ... and with the pole declared away there is no caveat
  ['x/x', '1', ['x!=0']],
  ['x/x', '1', ['x>0']],
  ['l*w/l', 'w', ['l!=0']],
  ['x^0', '1', ['x!=0']],
  // --- radicals and rational powers with declared variables
  ['sqrt(x^2)', 'x', ['x>=0']],
  ['sqrt(x)*sqrt(x)', 'x', ['x>=0']],
  ['sqrt(x)^2', 'x', ['x>=0']],
  ['sqrt(4x)', '2sqrt(x)', ['x>=0']],
  ['sqrt(xy)', 'sqrt(x)sqrt(y)', ['x>=0', 'y>=0']],
  ['x^(1/2)', 'sqrt(x)', ['x>=0']],
  ['(x^(1/2))^2', 'x', ['x>=0']],
  ['x^(1/2)*x^(1/2)', 'x', ['x>=0']],
  ['x^(3/2)', 'x*sqrt(x)', ['x>=0']],
  ['sqrt(x^3)', 'x*sqrt(x)', ['x>=0']],
  ['x/sqrt(x)', 'sqrt(x)', ['x>0']],
  ['x/sqrt(x)', 'sqrt(x)', ['x>=0', NOTE]],
  ['sqrt(12x^2)', '2x*sqrt(3)', ['x>=0']],
  ['1/sqrt(x)', 'sqrt(x)/x', ['x>0']],
  ['sqrt(9x)', '3sqrt(x)', ['x>=0']],
  ['(x^2)^(1/2)', 'x', ['x>=0']],
  ['x^(1/3)*x^(2/3)', 'x', ['x>=0']],
  // surd coefficients need no declaration
  ['sqrt(2)x+sqrt(2)x', '2sqrt(2)x'],
  ['sqrt(3)(x+sqrt(3))', 'sqrt(3)x+3'],
  ['(x+sqrt(2))(x-sqrt(2))', 'x^2-2'],
  ['x/sqrt(2)', 'sqrt(2)x/2'],
];

/** @type {[string, string, string[]?][]} */
const FALSE = [
  // --- polynomial non-identities (most are the section 5 mal-rules)
  ['(a+b)^2', 'a^2+b^2'],
  ['(x+3)^2', 'x^2+9'],
  ['3(x+4)', '3x+4'],
  ['-3(2x-5)', '-6x-15'],
  ['(x+6)/3', 'x+2'],
  ['2(x+3)', '2x+3'],
  ['x+x', 'x^2'],
  ['x*x', '2x'],
  ['(x^2)^3', 'x^5'],
  ['x^2*x^3', 'x^6'],
  ['(2x)^3', '2x^3'],
  ['(a-b)^2', 'a^2-b^2'],
  ['-(x-2)', '-x-2'],
  ['x-(y-z)', 'x-y-z'],
  ['2x+3', '5x'],
  ['x^2', '2x'],
  ['(x+1)(x+2)', 'x^2+2'],
  ['(a+b)^3', 'a^3+b^3'],
  ['x/2+x/3', '2x/5'],
  ['x/2+x/3', 'x/5'],
  ['3x+2x', '5x^2'],
  ['(x+y)/2', 'x+y/2'],
  ['2(l+w)', '2l+w'],
  ['x^2+6x', '(x+3)^2'],
  ['x^2+6x+9', '(x+3)^2+9'],
  ['-x^2', '(-x)^2'],
  ['(xy)^2', 'xy^2'],
  ['x', '-x'],
  ['x+1', 'x'],
  ['2x^2-4x-6', '2x^2+4x+6'],
  ['6+4x', '2x^2'],
  ['x^3', '3x'],
  ['4x', 'x^4'],
  ['(3x)^2', '3x^2'],
  ['x(y+z)', 'xy+z'],
  ['(x-3)(x+1)', 'x^2-3'],
  ['1/2x', '1/(2x)'],
  ['x^2-9', '(x-3)^2'],
  ['(x+2)^2', 'x^2+2x+4'],
  ['5x-3x', '2'],
  // --- arithmetic
  ['sqrt(9+16)', 'sqrt(9)+sqrt(16)'],
  ['4*1/3', '4/12'],
  ['4*1/3', '1/12'],
  ['1/2+1/3', '2/5'],
  ['1/2+1/3', '1/5'],
  ['3/4', '4/3'],
  ['2^3', '6'],
  ['2^3', '9'],
  ['-2^2', '4'],
  ['2^(-1)', '-2'],
  ['5^0', '0'],
  ['5^0', '5'],
  ['3+4', '7+2'],
  ['6/9', '3/2'],
  ['(2/3)^2', '4/3'],
  ['(2/3)/(4/9)', '8/27'],
  ['2-3*4', '-4'],
  ['7-(-3)', '4'],
  // --- numeric radicals and rational powers
  ['9^(1/2)', '9/2'],
  ['9^(1/2)', '81'],
  ['(9^(1/2))^2', '81'],
  ['(9^(1/2))^2', '3'],
  ['sqrt(3)*sqrt(3)', '9'],
  ['sqrt(3)*sqrt(3)', 'sqrt(3)'],
  ['6/sqrt(3)', '6'],
  ['6/sqrt(3)', '2'],
  ['6/sqrt(3)', '6sqrt(3)'],
  ['sqrt(12)', '4sqrt(3)'],
  ['2sqrt(3)', 'sqrt(6)'],
  ['sqrt(12)', '6'],
  ['sqrt(8)', '4'],
  ['sqrt(2)+sqrt(3)', 'sqrt(5)'],
  ['sqrt(2)*sqrt(3)', 'sqrt(5)'],
  ['sqrt(16)', '8'],
  ['sqrt(4+9)', '5'],
  ['sqrt(18)+sqrt(2)', 'sqrt(20)'],
  ['1/sqrt(2)', 'sqrt(2)'],
  ['1/sqrt(2)', '1/2'],
  ['(1+sqrt(3))^2', '4'],
  ['(1+sqrt(3))^2', '4+sqrt(3)'],
  ['8^(1/3)', '8/3'],
  ['4^(3/2)', '6'],
  ['4^(-1/2)', '-2'],
  ['27^(2/3)', '18'],
  ['sqrt(50)', '25'],
  ['sqrt(1/4)', '1/8'],
  ['sqrt(2/3)', 'sqrt(2)/3'],
  ['2^(1/2)', '1'],
  ['sqrt(72)', '36'],
  ['10/sqrt(5)', '2'],
  ['(4+sqrt(48))/4', '1+sqrt(48)'],
  ['sqrt(5)*sqrt(5)', '25'],
  ['sqrt(3)^2', '9'],
  ['sqrt(100)', '50'],
  // --- rational functions
  ['(x+6)/x', '7'],
  ['(x+6)/x', '6'],
  ['1/x+1/y', '1/(x+y)'],
  ['1/x+1/y', '2/(x+y)'],
  ['(x^2-1)/(x-1)', 'x-1'],
  ['x/x', '0'],
  ['x/x', 'x'],
  ['1/(1/x)', '1/x'],
  ['x^(-1)', '-x'],
  ['x^0', '0'],
  ['x^0', 'x'],
  ['(2x)/(4x)', '2'],
  ['x^2/x', 'x^2'],
  ['1/(x+1)', '1/x+1'],
  ['(a+b)/(a+c)', 'b/c'],
  ['x^(-2)', '-x^2'],
  // --- radicals and rational powers with variables
  ['sqrt(a+b)', 'sqrt(a)+sqrt(b)'],
  ['sqrt(a+b)', 'sqrt(a)+sqrt(b)', ['a>=0', 'b>=0']],
  ['sqrt(x^2)', 'x'],
  ['a^(1/2)', 'a/2'],
  ['a^(1/2)', 'a/2', ['a>=0']],
  ['sqrt(x)', 'x/2', ['x>=0']],
  ['sqrt(4x)', '4sqrt(x)', ['x>=0']],
  ['sqrt(4x)', '2x', ['x>=0']],
  ['sqrt(x)*sqrt(x)', 'x^2', ['x>=0']],
  ['sqrt(x^2+9)', 'x+3'],
  ['sqrt(x^2+y^2)', 'x+y'],
  ['x^(1/2)*x^(1/2)', 'x^(1/4)', ['x>=0']],
  ['(x^(1/2))^2', 'x^2', ['x>=0']],
  ['sqrt(xy)', 'x*sqrt(y)', ['x>=0', 'y>=0']],
  ['x^(3/2)', '3x/2', ['x>=0']],
  ['sqrt(2)x', '2x'],
  ['sqrt(x^3)', 'x^3/2', ['x>=0']],
  ['1/sqrt(x)', 'sqrt(x)', ['x>0']],
  ['sqrt(16x)', '8sqrt(x)', ['x>=0']],
  ['(x+sqrt(2))^2', 'x^2+2'],
];

/** True statements (or meaningless ones) that the checker must NOT claim to verify. */
/** @type {[string, string, string[]?][]} */
const CANNOT_VERIFY = [
  ['sqrt(x)^2', 'x'], // equal where defined, but x is undeclared
  ['sqrt(x)sqrt(y)', 'sqrt(xy)'], // same
  ['sqrt(x^2+2x+1)', 'x+1', ['x>=0']], // a sum under a radical
  ['sqrt(x+1)^2', 'x+1', ['x>=0']],
  ['1/(sqrt(x)+1)', '(sqrt(x)-1)/(x-1)', ['x>=0']], // a sum in a denominator with a radical
  ['sqrt(1+sqrt(2))', 'sqrt(1+sqrt(2))'], // nested radical
  ['sqrt(3+2sqrt(2))', '1+sqrt(2)'], // true, but nested
  ['2^(1/3)', '2^(1/3)'], // cube root of a non-cube
  ['1/0', '1'],
  ['0^0', '1'],
  ['sqrt(-4)', '2'],
  ['2^x', '2^x'], // variable exponent
  ['x^x', 'x^x'],
  ['(x+1)^100', '(x+1)^100'], // beyond the expansion cap
  ['x^(1/2)', 'sqrt(x)'], // undeclared
  ['2^(10^30)', '2^(10^30)'],
];

test('the tables are big enough and contain the required named cases', () => {
  assert.ok(TRUE.length >= 100, `TRUE has ${TRUE.length}`);
  assert.ok(FALSE.length >= 100, `FALSE has ${FALSE.length}`);
  /** @param {[string, string, string[]?][]} table @param {string} a @param {string} b @param {string[]} [as] */
  const has = (table, a, b, as = []) => table.some((e) => e[0] === a && e[1] === b && JSON.stringify(e[2] ?? []) === JSON.stringify(as));
  assert.ok(has(FALSE, 'sqrt(a+b)', 'sqrt(a)+sqrt(b)'));
  assert.ok(has(FALSE, '(a+b)^2', 'a^2+b^2'));
  assert.ok(has(TRUE, 'x/x', '1', [NOTE]));
  assert.ok(has(FALSE, 'sqrt(x^2)', 'x'));
  assert.ok(has(TRUE, 'sqrt(x^2)', 'x', ['x>=0']));
  assert.ok(has(FALSE, '(x+6)/3', 'x+2'));
  assert.ok(has(TRUE, '6/sqrt(3)', '2sqrt(3)'));
  assert.ok(has(TRUE, '(9^(1/2))^2', '9'));
  assert.ok(has(FALSE, 'a^(1/2)', 'a/2'));
});

/** A few exact points that respect the assumptions (independent of equiv.js's probe list). */
/** @param {string[]} names @param {Assumption[]} as @returns {Record<string, Q>[]} */
function checkPoints(names, as) {
  const pools = [[4, 9, 2, 7, 1], [9, 4, 3, 5, 16], [-3, 5, -1, 2, 11], [3, -2, 6, -5, 8]];
  /** @type {Record<string, Q>[]} */
  const out = [];
  for (let k = 0; k < 5; k++) {
    /** @type {Record<string, Q>} */
    const env = {};
    names.forEach((nm, j) => {
      const restricted = as.some((a) => a.name === nm && (a.rel === 'nonneg' || a.rel === 'pos'));
      const pool = restricted ? pools[j % 2] : pools[2 + (j % 2)];
      env[nm] = q(pool[(k + j) % pool.length]);
    });
    out.push(env);
  }
  return out;
}

test(`TRUE table: ${TRUE.length} hand-checked equivalences are proved, in both orders`, () => {
  for (const [a, b, spec] of TRUE) {
    const as = assume(spec);
    const label = `${a}  ==  ${b}  ${spec ? `[${spec.join(', ')}]` : ''}`;
    const A = P(a); const B = P(b);
    for (const r of [equivExpr(A, B, as), equivExpr(B, A, as)]) {
      assert.equal(r.equal, true, `${label}: got ${show(r)}`);
      assert.equal(r.witness, undefined, label);
      if (spec && spec.includes(NOTE)) assert.ok(r.note && r.note.startsWith(WHERE_DEFINED), `${label}: needs a where-defined note, got ${show(r)}`);
      else assert.equal(r.note, undefined, `${label}: unexpected note ${r.note}`);
    }
    // independent re-check of the table entry itself
    let checked = 0;
    for (const env of checkPoints([...new Set([...vars(A), ...vars(B)])].sort(), as)) {
      const x = evaluate(A, env); const y = evaluate(B, env);
      if (!x || !y) continue;
      checked++;
      assert.ok(seq(x, y), `TABLE ERROR? ${label} differs at ${show(env)}`);
    }
    assert.ok(checked >= 1, `${label}: no check point was defined`);
  }
});

test(`FALSE table: ${FALSE.length} hand-checked non-equivalences are refuted with a real witness, in both orders`, () => {
  for (const [a, b, spec] of FALSE) {
    const as = assume(spec);
    const label = `${a}  !=  ${b}  ${spec ? `[${spec.join(', ')}]` : ''}`;
    const A = P(a); const B = P(b);
    for (const [L, R] of [[A, B], [B, A]]) {
      const r = equivExpr(L, R, as);
      assert.equal(r.equal, false, `${label}: got ${show(r)}`);
      const names = [...new Set([...vars(A), ...vars(B)])];
      if (names.length === 0) {
        const x = evaluate(L, {}); const y = evaluate(R, {});
        assert.ok(x && y && !seq(x, y), `TABLE ERROR? ${label}`);
        continue;
      }
      assert.ok(r.witness, `${label}: a witness should be found`);
      const w = r.witness;
      assert.deepEqual(Object.keys(w).sort(), names.sort(), `${label}: witness covers exactly the variables`);
      const x = evaluate(L, w); const y = evaluate(R, w);
      assert.ok(x && y && !seq(x, y), `${label}: witness ${show(w)} does not separate them`);
      // the witness respects the declared assumptions
      for (const s of as) {
        const val = w[s.name];
        if (s.rel === 'nonneg') assert.ok(val.n >= 0n, label);
        if (s.rel === 'pos') assert.ok(val.n > 0n, label);
        if (s.rel === 'nonzero') assert.ok(val.n !== 0n, label);
      }
    }
  }
});

test('named witnesses from DESIGN.md', () => {
  const w1 = equivExpr(P('sqrt(x^2)'), P('x')).witness;
  assert.deepEqual(w1, { x: q(-2) }, 'sqrt(x^2) vs x: witness -2 (section 11 domain policy)');
  assert.deepEqual(equivExpr(P('(x+3)^2'), P('x^2+9')).witness, { x: q(2) }, 'x = 2: 25 vs 13');
  assert.deepEqual(equivExpr(P('3(x+4)'), P('3x+4')).witness, { x: q(2) }, 'x = 2: 18 vs 10');
  assert.deepEqual(equivExpr(P('-3(2x-5)'), P('-6x-15')).witness, { x: q(2) }, 'x = 2: 3 vs -27');
  // probes for a variable declared x >= 0 are never negative and start 2, 3, 5
  assert.deepEqual(equivExpr(P('sqrt(x)'), P('x/2'), assume(['x>=0'])).witness, { x: q(2) });
  // (x-2)(x-3)(x-5) vs 0: 2, 3 and 5 all agree, so the witness search must go on
  assert.deepEqual(findWitness(P('(x-2)(x-3)(x-5)'), P('0'), assume(['x>=0'])), { x: q(4) });
  assert.equal(findWitness(P('2(x+3)'), P('2x+6')), undefined);
});

test(`CANNOT-VERIFY table: ${CANNOT_VERIFY.length} entries return equal: undefined, never a guess`, () => {
  for (const [a, b, spec] of CANNOT_VERIFY) {
    const as = assume(spec);
    for (const r of [equivExpr(P(a), P(b), as), equivExpr(P(b), P(a), as)]) {
      assert.equal(r.equal, undefined, `${a} ?= ${b}: got ${show(r)}`);
      assert.equal(r.witness, undefined);
      assert.equal(typeof r.note, 'string');
    }
  }
});

test('equivExpr never throws on odd input', () => {
  assert.equal(equivExpr(P('x=1'), P('x')).equal, undefined);
  assert.equal(equivExpr(P('x'), P('x=1')).equal, undefined);
  assert.equal(equivExpr(P('x'), P('x'), undefined).equal, true);
  assert.equal(equivExpr(P('(x+1)^60'), P('(x+1)^60')).equal, true);
  assert.equal(equivExpr(P('(x+y+z+a+b)^30'), P('(x+y+z+a+b)^30')).equal, undefined, 'too large to expand: cannot verify');
});

test('sameSides: side-wise, swap allowed (the I2/I3 judge)', () => {
  /** @type {[string, string, boolean][]} */
  const table = [
    ['0=2x^2-4x-6', '2x^2-4x-6=0', true],
    ['2x^2-4x-6=0', '6+4x-(6+4x)=2x^2-(6+4x)', true],
    ['0=2x^2-4x-6', '6+4x-(6+4x)=2x^2-(6+4x)', true],
    ['3x=6', '3x+5-5=11-5', true],
    ['6=3x', '3x=6', true],
    ['3x+0=6', '3x=6', true],
    ['3x+5=11', '3x=6', false], // retyping the original line
    ['x=2', '3x=6', false], // jumping to the solved line
    ['3x=11', '3x=6', false], // one-sided operation
    ['3x=16', '3x=6', false], // transposed without the sign change
    ['-2x^2+4x+6=0', '0=2x^2-4x-6', false], // a multiple, but not these sides
    ['x^2-2x-3=0', '2x^2-4x-6=0', false],
    ['x=5', 'x/3*3=5*3', false], // x/3 = 5 times 3 on one side only
    ['x=15', 'x/3*3=5*3', true],
    ['2sqrt(3)x=6', 'sqrt(12)x=6', true],
    ['x=x', '0=0', false],
  ];
  for (const [got, want, expected] of table) {
    assert.equal(sameSides(P(got), P(want)), expected, `${got}  vs  ${want}`);
    assert.equal(sameSides(P(want), P(got)), expected, `${want}  vs  ${got} (symmetric)`);
  }
  assert.equal(sameSides(P('sqrt(x)^2=1'), P('x=1')), undefined, 'cannot verify stays undefined');
  assert.equal(sameSides(P('sqrt(x)^2=1'), P('x=2')), false, 'one provably different side is enough for false');
  // Review fix (m1a oracle finding): "equal where defined" is NOT a definite
  // true when the two equations have different domains. x/x = 1 fails at 0, 1 = 1 never fails.
  assert.equal(sameSides(P('x/x=1'), P('1=1')), undefined, 'equal where defined, different domain: cannot verify');
  assert.equal(sameSides(P('x/x=1'), P('1=x/x')), true, 'same domain on both equations');
  assert.equal(sameSides(P('x/x=1'), P('1=1'), [{ name: 'x', rel: 'nonzero' }]), true, 'the declaration removes the pole');
  assert.equal(sameSides(/** @type {any} */ (P('x')), P('x=1')), false);
});

test('isMultiple and multiplier: L - R is a nonzero rational multiple of L0 - R0', () => {
  /** @type {[string, string, boolean][]} */
  const table = [
    ['0=2x^2-4x-6', '6+4x=2x^2', true],
    ['2x^2-4x-6=0', '6+4x=2x^2', true],
    ['x^2-2x-3=0', '6+4x=2x^2', true],
    ['0=-x^2+2x+3', '6+4x=2x^2', true],
    ['2x^2-4x=6', '6+4x=2x^2', true], // a multiple; standard-form (forms.js) is what rejects it
    ['(1/2)x^2-x-3/2=0', '6+4x=2x^2', true],
    ['6+4x=2x^2', '6+4x=2x^2', true],
    ['2x^2+4x+6=0', '6+4x=2x^2', false], // copy-coefficients
    ['2x^2-4x+6=0', '6+4x=2x^2', false],
    ['x=3', '6+4x=2x^2', false],
    ['0=0', '6+4x=2x^2', false], // times zero
    ['x(2x^2-4x-6)=0', '6+4x=2x^2', false], // times x: not a rational multiple
    ['(2x^2-4x-6)/x=0', '6+4x=2x^2', false],
    ['x=3', 'x^2=3x', false],
    ['0=0', 'x=x', true],
    ['1=1', '2=2', true],
    ['x=1', 'x=x', false],
    ['2sqrt(2)x=4', 'sqrt(2)x=2', true],
    ['2x=2sqrt(2)', 'sqrt(2)x=2', false], // equivalent equation, but the multiplier sqrt(2) is not rational
    ['3x+3y=6', 'x+y=2', true],
    ['3x+3y=5', 'x+y=2', false],
  ];
  for (const [got, orig, expected] of table) assert.equal(isMultiple(P(got), P(orig)), expected, `${got}  vs  ${orig}`);
  assert.equal(isMultiple(P('sqrt(x+1)=2'), P('2sqrt(x+1)=4')), undefined);
  assert.deepEqual(multiplier(P('0=2x^2-4x-6'), P('6+4x=2x^2')), { k: q(1), powers: {} });
  assert.deepEqual(multiplier(P('x^2-2x-3=0'), P('6+4x=2x^2')), { k: q(-1, 2), powers: {} });
  assert.deepEqual(multiplier(P('x=3'), P('x^2=3x')), { k: q(1), powers: { x: -1 } }, '"/ x" on x^2 = 3x');
  assert.deepEqual(multiplier(P('x^2=2x'), P('x=2')), { k: q(1), powers: { x: 1 } }, '"x x" on x = 2');
  assert.deepEqual(multiplier(P('A/l=w'), P('A=lw')), { k: q(1), powers: { l: -1 } });
  assert.deepEqual(multiplier(P('6xy^2=4x^2y'), P('3y=2x')), { k: q(2), powers: { x: 1, y: 1 } });
  assert.deepEqual(multiplier(P('x+1=3'), P('x=2')), { k: q(1), powers: {} }, 'adding 1 to both sides');
  assert.equal(multiplier(P('x=3'), P('x=2')), false);
  assert.equal(multiplier(P('x^2=4'), P('x=2')), false, 'squaring both sides is not a monomial multiple');
  assert.equal(multiplier(P('sqrt(x)=1'), P('x=1')), undefined);
});

test('sameSolutions: exact root sets', () => {
  /** @type {[string, string, boolean | undefined, string?][]} */
  const table = [
    ['3x+5=11', 'x=2', true],
    ['6+4x=2x^2', 'x^2-2x-3=0', true],
    ['6+4x=2x^2', '(x-3)(x+1)=0', true],
    ['4+4x=2x^2', 'x^2-2x-2=0', true],
    ['4+4x=2x^2', 'x^2-2x-3=0', false, '1 - sqrt(3)'],
    ['x^2=3x', 'x=3', false, '0'], // dividing by x lost the root 0
    ['x=2', 'x^2=2x', false, '0'], // multiplying by x added the root 0
    ['2x+3=2x+5', 'x=x+1', true], // none and none
    ['2(x+1)=2x+2', 'x=x', true], // all and all
    ['x=x', 'x=1', false, '0'],
    ['x=x', 'x=x+1', false, '0'],
    ['x^2=-1', 'x=x+1', true],
    ['x^2=-1', 'x=0', false, '0'],
    ['x^2=4', 'x=2', false, '-2'],
    ['x^2=3', 'x=sqrt(3)', false, '-sqrt(3)'],
    ['x^3=x', 'x=1', undefined],
    ['sqrt(x)=2', 'x=4', undefined],
    ['xy=1', 'x=1', undefined],
  ];
  for (const [a, b, expected, witness] of table) {
    const r = sameSolutions(P(a), P(b), 'x');
    assert.equal(r.equal, expected, `${a}  vs  ${b}: ${show(r)}`);
    assert.equal(sameSolutions(P(b), P(a), 'x').equal, expected);
    if (witness !== undefined) assert.equal(r.witness && print(surdToNode(r.witness)), witness, `${a} vs ${b}`);
    else assert.equal(r.witness, undefined);
  }
});
