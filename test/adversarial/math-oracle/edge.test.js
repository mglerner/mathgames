// Hand-picked domain-policy and edge cases for src/math (M1a), DESIGN.md section 11.
// Expected values were worked by hand by the adversarial reviewer (not the builder).
// Tests marked `todo` record review findings: they show the current (spec-deviating)
// behaviour without failing the suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../../src/math/parse.js';
import { equivExpr, sameSides, isMultiple, sameSolutions, WHERE_DEFINED } from '../../../src/math/equiv.js';
import { solve } from '../../../src/math/solve.js';
import { evaluate } from '../../../src/math/evaluate.js';

const A = (s) => s.split(',').filter(Boolean).map((t) => {
  const m = /^(\w)(>=0|>0|!=0)$/.exec(t);
  return { name: m[1], rel: m[2] === '>=0' ? 'nonneg' : m[2] === '>0' ? 'pos' : 'nonzero' };
});
const P = (s) => { const n = parse(s); if ('error' in n) throw new Error(`${s}: ${n.error}`); return n; };
const eq = (a, b, as = '') => equivExpr(P(a), P(b), A(as));

test('domain policy: x/x, sqrt(x^2), negative radicands, 0^0', () => {
  let r = eq('x/x', '1');
  assert.equal(r.equal, true);
  assert.ok(r.note.startsWith(WHERE_DEFINED));
  r = eq('sqrt(x^2)', 'x');
  assert.equal(r.equal, false);
  assert.deepEqual(r.witness, { x: { n: -2n, d: 1n } });
  assert.equal(eq('sqrt(x^2)', 'x', 'x>=0').equal, true);
  assert.equal(eq('sqrt(x^2)', 'x', 'x!=0').equal, false);       // nonzero is not nonneg
  assert.equal(eq('sqrt(4x^2)', '2x').equal, false);
  assert.equal(eq('(x^2)^(3/2)', 'x^3').equal, false);           // |x|^3
  assert.equal(eq('(x^2)^(3/2)', 'x^3', 'x>=0').equal, true);
  assert.equal(eq('sqrt(x^2y^2)', 'xy', 'x>=0').equal, false);   // y undeclared
  assert.equal(evaluate(P('sqrt(-4)'), {}), undefined);
  assert.equal(eq('sqrt(-x)', 'sqrt(-x)', 'x>=0').equal, undefined);
  assert.equal(eq('sqrt(-4)', '2').equal, undefined);
  assert.equal(evaluate(P('0^0'), {}), undefined);
  for (const [a, b, as] of [['(x+1)^0', '1', ''], ['x^2/x', 'x', ''], ['1/(1/x)', 'x', ''], ['sqrt(x)/sqrt(x)', '1', 'x>=0'], ['x^(-1/2)', '1/sqrt(x)', 'x>=0'], ['0/(x-1)', '0', '']]) {
    r = eq(a, b, as);
    assert.equal(r.equal, true, `${a} vs ${b}`);
    assert.ok((r.note ?? '').startsWith(WHERE_DEFINED), `${a} vs ${b} needs a where-defined note`);
  }
  assert.equal(eq('x^0', '1', 'x!=0').note, undefined);
  assert.equal(eq('sqrt(x/y)', 'sqrt(x)/sqrt(y)', 'x>=0,y>0').equal, true);
});

test('constants: exact rational powers and rationalisation', () => {
  assert.equal(eq('8^(1/3)', '2').equal, true);
  assert.equal(eq('16^(3/4)', '8').equal, true);
  assert.equal(eq('1/(sqrt(3)-sqrt(2))', 'sqrt(3)+sqrt(2)').equal, true);
  assert.equal(eq('sqrt(8)', '2sqrt(2)').equal, true);
  assert.equal(eq('16^(1/2)', '8').equal, false);                // half-power-as-half
});

test('FINDING: b^(p/q) whose exact value is a surd evaluates to undefined', { todo: '4^(1/4) = sqrt(2) is a numeric rational power with an exact surd value' }, () => {
  assert.equal(eq('4^(1/4)', 'sqrt(2)').equal, true);
  assert.equal(eq('4^(3/4)', '2sqrt(2)').equal, true);
  assert.equal(eq('(4x^2)^(1/4)', 'sqrt(2)sqrt(x)', 'x>=0').equal, true);
});

test('FINDING: isMultiple / sameSides say a definite true for a line whose solution set differs', { todo: 'x^2/x = 0 has no solution, x = 0 has {0}; Tri has no room for the where-defined note' }, () => {
  // The two lines do not have the same solution set: the first is never defined at x = 0.
  assert.notEqual(isMultiple(P('x^2/x=0'), P('x=0')), true);
  assert.notEqual(isMultiple(P('x(x-1)/(x-1)=1'), P('x=1')), true);
  assert.notEqual(sameSides(P('x^2/x=0'), P('x=0')), true);
});

test('solve edge cases', () => {
  const S = (s) => solve(P(s), 'x');
  assert.deepEqual(S('2x=2x'), { kind: 'all' });
  assert.deepEqual(S('0x=5'), { kind: 'none' });
  assert.deepEqual(S('x^2=-1'), { kind: 'none' });
  assert.equal(S('x/x=1'), undefined);            // domain restriction: cannot verify
  assert.equal(S('1/x=2'), undefined);
  assert.equal(S('sqrt(x)=2'), undefined);
  const r = S('x^3-x^3+x=1');
  assert.equal(r?.kind, 'finite');
  assert.equal(sameSolutions(P('x^2/x=0'), P('x=0'), 'x').equal, undefined);
});
