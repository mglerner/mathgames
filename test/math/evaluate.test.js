// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { P, show, polyAst, rsurd, renv } from './_arb.js';
import { q } from '../../src/math/rational.js';
import { num, numQ, v, add, mul, neg, frac, pow, sqrt, root } from '../../src/math/ast.js';
import { evaluate, evaluateS, constValue, constQ, powSurd } from '../../src/math/evaluate.js';
import { seq, sq, sadd, smul, sneg, sinv, sqrtQ, sscale, fromQ, surdToNode, SZERO } from '../../src/math/surd.js';
import { print } from '../../src/math/print.js';

/** @typedef {import('../../types.d.ts').Surd} Surd */

const s = (/** @type {number} */ n) => /** @type {Surd} */ (sqrtQ(q(n)));

/** [expression, env as text pairs, expected Surd] -- hand-computed */
/** @type {[string, Record<string, [number, number]>, Surd][]} */
const VALUES = [
  ['4*1/3', {}, sq(4, 3)],
  ['sqrt(3)*sqrt(3)', {}, sq(3)],
  ['6/sqrt(3)', {}, sscale(s(3), q(2))],
  ['6/sqrt(3)*sqrt(3)/1', {}, sq(6)],
  ['sqrt(9+16)', {}, sq(5)],
  ['sqrt(9)+sqrt(16)', {}, sq(7)],
  ['sqrt(4*9)', {}, sq(6)],
  ['sqrt(12)', {}, sscale(s(3), q(2))],
  ['(4sqrt(3))^2', {}, sq(48)],
  ['(9^(1/2))^2', {}, sq(9)],
  ['(9^2)^2', {}, sq(6561)],
  ['(9^1)^2', {}, sq(81)],
  ['(9^(-1))^2', {}, sq(1, 81)],
  ['9/2*9/2', {}, sq(81, 4)],
  ['8^(1/3)', {}, sq(2)],
  ['27^(2/3)', {}, sq(9)],
  ['4^(-3/2)', {}, sq(1, 8)],
  ['2^(1/2)', {}, s(2)],
  ['2^(3/2)', {}, sscale(s(2), q(2))],
  ['(1/4)^(1/2)', {}, sq(1, 2)],
  ['0^(1/2)', {}, SZERO],
  ['0^3', {}, SZERO],
  ['-2^2', {}, sq(-4)],
  ['(-2)^2', {}, sq(4)],
  ['(-2)^3', {}, sq(-8)],
  ['(-2)^(-3)', {}, sq(-1, 8)],
  ['2^3^2', {}, sq(512)],
  ['1/(1+sqrt(2))', {}, sadd(s(2), sq(-1))],
  ['(1+sqrt(3))^2', {}, sadd(sq(4), sscale(s(3), q(2)))],
  ['sqrt(2)sqrt(3)', {}, s(6)],
  ['sqrt(2/3)', {}, sscale(s(6), q(1, 3))],
  ['sqrt(sqrt(16))', {}, sq(2)],
  ['sqrt(sqrt(3)sqrt(3)+1)', {}, sq(2)],
  ['3(x+4)', { x: [2, 1] }, sq(18)],
  ['3x+4', { x: [2, 1] }, sq(10)],
  ['-3(2x-5)', { x: [2, 1] }, sq(3)],
  ['-6x-15', { x: [2, 1] }, sq(-27)],
  ['(x+3)^2', { x: [2, 1] }, sq(25)],
  ['x^2+9', { x: [2, 1] }, sq(13)],
  ['(x+6)/3', { x: [3, 1] }, sq(3)],
  ['x+2', { x: [3, 1] }, sq(5)],
  ['6+4x', { x: [3, 1] }, sq(18)],
  ['2x^2', { x: [3, 1] }, sq(18)],
  ['2x^2+4x+6', { x: [3, 1] }, sq(36)],
  ['sqrt(x^2)', { x: [-2, 1] }, sq(2)],
  ['x/x', { x: [5, 1] }, sq(1)],
  ['x^0', { x: [5, 1] }, sq(1)],
  ['xy^2', { x: [2, 1], y: [3, 1] }, sq(18)],
  ['sqrt(x)', { x: [1, 2] }, sscale(s(2), q(1, 2))],
  ['x^(1/2)', { x: [9, 4] }, sq(3, 2)],
];

test('evaluate: hand-computed exact values (including the DESIGN.md Lantern numbers)', () => {
  for (const [text, envText, want] of VALUES) {
    /** @type {Record<string, import('../../types.d.ts').Q>} */
    const env = {};
    for (const k of Object.keys(envText)) env[k] = q(envText[k][0], envText[k][1]);
    const got = evaluate(P(text), env);
    assert.ok(got && seq(got, want), `${text} at ${show(env)}: got ${got ? print(surdToNode(got)) : 'undefined'}, want ${print(surdToNode(want))}`);
  }
});

const UNDEFINED = [
  '1/0', 'x/0', '0/0', '1/(2-2)', '1/(sqrt(2)sqrt(2)-2)', 'sqrt(-1)', 'sqrt(2-3)', '(-4)^(1/2)', '(-8)^(1/3)', '0^0', '0^(-1)', '0^(-1/2)',
  'sqrt(1+sqrt(2))', 'sqrt(sqrt(2))', '2^(1/3)', '2^sqrt(2)', 'sqrt(2)^(1/2)', 'x', 'x+1', 'y^2',
  '9^9^9', '2^(10^30)', '((2^999)^999)^999', 'sqrt(2)^99999', '10^(-99999)', '3^(1/999)',
];

test('evaluate: undefined values, unrepresentable values and size limits give undefined (never throw)', () => {
  for (const text of UNDEFINED) assert.equal(evaluate(P(text), {}), undefined, text);
  assert.equal(evaluate(root(1, num(4)), {}), undefined);
  assert.equal(evaluate(root(2.5, num(4)), {}), undefined);
  assert.ok(seq(/** @type {Surd} */ (evaluate(root(3, num(27)), {})), sq(3)));
  assert.equal(evaluate(v('toString'), {}), undefined, 'no prototype leak through the env');
  assert.equal(evaluate(v('__proto__'), {}), undefined);
  assert.ok(seq(/** @type {Surd} */ (evaluate(P('1^(10^30)'), {})), sq(1)));
});

test('evaluate is a homomorphism: node operations match Surd operations', () => {
  forSeeds(5000, (rng) => {
    const a = rsurd(rng); const b = rsurd(rng);
    const A = surdToNode(a); const B = surdToNode(b);
    const ev = (/** @type {import('../../types.d.ts').Node} */ n) => evaluate(n, {});
    assert.ok(seq(/** @type {Surd} */ (ev(add(A, B))), sadd(a, b)));
    assert.ok(seq(/** @type {Surd} */ (ev(mul(A, B))), smul(a, b)));
    assert.ok(seq(/** @type {Surd} */ (ev(neg(A))), sneg(a)));
    const fr = ev(frac(A, B));
    if (b.terms.length === 0) assert.equal(fr, undefined);
    else assert.ok(fr && seq(smul(fr, b), a), 'a/b x b = a');
    const sqd = ev(pow(A, num(2)));
    assert.ok(sqd && seq(sqd, smul(a, a)));
    const inv = ev(pow(A, num(-1)));
    if (a.terms.length === 0) assert.equal(inv, undefined);
    else assert.ok(inv && seq(inv, /** @type {Surd} */ (sinv(a))));
  });
});

test('sqrt and the 1/2 power agree and square back; evaluateS substitutes surds', () => {
  forSeeds(3000, (rng) => {
    const a = q(rng.int(0, 400), rng.int(1, 30));
    const r1 = evaluate(sqrt(numQ(a)), {});
    const r2 = evaluate(pow(numQ(a), numQ(q(1, 2))), {});
    const r3 = powSurd(fromQ(a), q(1, 2));
    assert.ok(r1 && r2 && r3 && seq(r1, r2) && seq(r1, r3));
    assert.ok(seq(smul(r1, r1), fromQ(a)));
    // x^2 at x = sqrt(a) is a
    const back = evaluateS(P('x^2'), { x: r1 });
    assert.ok(back && seq(back, fromQ(a)));
  });
});

test('constValue / constQ', () => {
  assert.deepEqual(constQ(P('6/8')), q(3, 4));
  assert.deepEqual(constQ(P('sqrt(16)/2')), q(2));
  assert.equal(constQ(P('sqrt(2)')), undefined);
  assert.equal(constQ(P('x')), undefined);
  assert.ok(seq(/** @type {Surd} */ (constValue(P('sqrt(8)'))), sscale(s(2), q(2))));
});

test('evaluate on random polynomial trees is defined at every point', () => {
  forSeeds(3000, (rng) => {
    const tree = polyAst(rng, ['x', 'y'], 3);
    const got = evaluate(tree, renv(rng, ['x', 'y']));
    assert.ok(got && got.terms.length <= 1, print(tree));
  });
});
