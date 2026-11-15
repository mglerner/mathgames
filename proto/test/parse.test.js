// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../js/parse.js';
import { print } from '../js/print.js';
import { astEq } from '../js/ast.js';
import { evaluate, evalNumber } from '../js/evaluate.js';
import { peq } from '../js/poly.js';
import { seq, sqrtQ, sq, smul } from '../js/surd.js';
import { q } from '../js/rational.js';
import { makeRng } from '../js/rng.js';
import { renderMath } from '../js/mathview.js';
import { textOf } from '../js/vnode.js';

const KEYPAD = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '/', '-', '+', '^', 'sqrt', '(', ')', '=', 'x'];

test('precedence: implicit products, "/" binds primaries, sqrt takes one atom', () => {
  const v = (/** @type {string} */ t) => {
    const r = parse(t, []);
    assert.ok('kind' in r && r.kind === 'expr', t);
    const e = evalNumber(/** @type {any} */ (r).node);
    assert.ok('value' in e, t);
    return e.value;
  };
  const s2 = /** @type {any} */ (sqrtQ(q(2)));
  const s3 = /** @type {any} */ (sqrtQ(q(3)));
  assert.ok(seq(v('2sqrt3'), smul(sq(q(2)), s3)));
  assert.ok(seq(v('3/2sqrt2'), smul(sq(q(3, 2)), s2)));
  assert.ok(seq(v('3sqrt2/2'), smul(sq(q(3, 2)), s2)));
  assert.ok(seq(v('sqrt3^2'), sq(q(3))));
  assert.ok(seq(v('sqrt(3^2)'), sq(q(3))));
  assert.ok(seq(v('2^3^2'), sq(q(512))));
  assert.ok(seq(v('2^-1'), sq(q(1, 2))));
  assert.ok(seq(v('-2^2'), sq(q(-4))));
  assert.ok(seq(v('1-2-3'), sq(q(-4))));
  assert.ok(seq(v('8/4/2'), sq(q(1))));
  assert.ok(seq(v('2(3+4)'), sq(q(14))));
  assert.ok(seq(v('sqrt32'), /** @type {any} */ (sqrtQ(q(32)))));
});

test('round trip: print(parse(s)) re-parses to the same tree, over 20000 random keypad strings', () => {
  const rng = makeRng('roundtrip');
  let parsed = 0;
  for (let i = 0; i < 20000; i++) {
    const len = rng.int(1, 14);
    let s = '';
    for (let j = 0; j < len; j++) s += rng.pick(KEYPAD);
    const a = parse(s);
    if ('error' in a) continue;
    parsed++;
    const tree = a.kind === 'eq' ? a.eq : a.node;
    const text = print(tree);
    const b = parse(text);
    assert.ok(!('error' in b), `${s} -> ${text}`);
    const tree2 = /** @type {any} */ (b).kind === 'eq' ? /** @type {any} */ (b).eq : /** @type {any} */ (b).node;
    assert.ok(astEq(tree, tree2), `${s} -> ${text}`);
    assert.ok(!textOf(renderMath(tree)).includes('?'), s);
  }
  assert.ok(parsed > 2000, `only ${parsed} parsed`);
});

test('robustness: 30000 random strings never throw', () => {
  const rng = makeRng('fuzz');
  const junk = [...KEYPAD, '*', ' ', 'q', 'sqr', '\u00d7', '.', ',', '%', 'xx', '((((', '))))', '9999999999999', '^^'];
  for (let i = 0; i < 30000; i++) {
    let s = '';
    const len = rng.int(0, 30);
    for (let j = 0; j < len; j++) s += rng.pick(junk);
    const r = parse(s);
    assert.ok(typeof r === 'object' && r !== null);
    if (!('error' in r)) {
      const tree = r.kind === 'eq' ? r.eq : r.node;
      if (tree.t === 'eq') {
        evaluate(tree.lhs);
        evaluate(tree.rhs);
      } else evaluate(tree);
    }
  }
  // explicit nasties
  for (const s of ['', '=', '==', '1==1', '(', ')', 'sqrt', 'sqrtsqrt', '9^9^9^9', '99^999', '(x+1)^60', '0^0', '0^-1', '1/0', 'sqrt-4', '('.repeat(200), 'x'.repeat(200), /** @type {any} */ (null), /** @type {any} */ (42)]) {
    const r = parse(s);
    if (!('error' in r)) {
      const tree = r.kind === 'eq' ? r.eq : r.node;
      if (tree.t !== 'eq') {
        const e = evaluate(tree);
        assert.ok('poly' in e || 'fail' in e, s);
      }
    }
  }
  const huge = parse('9^9^9');
  assert.ok(!('error' in huge));
  assert.ok('fail' in evaluate(/** @type {any} */ (huge).node));
  const dz = parse('1/(2-2)');
  assert.deepEqual(evaluate(/** @type {any} */ (dz).node), { fail: 'divzero' });
});

test('polynomial evaluation: expansion identities', () => {
  const P = (/** @type {string} */ t) => /** @type {any} */ (evaluate(/** @type {any} */ (parse(t)).node)).poly;
  assert.ok(peq(P('(x-3)(x+1)'), P('x^2-2x-3')));
  assert.ok(peq(P('2(x^2-2x-3)'), P('2x^2-4x-6')));
  assert.ok(peq(P('(x+1)^2'), P('x^2+2x+1')));
  assert.ok(!peq(P('(x+3)^2'), P('x^2+9')));
  assert.deepEqual(evaluate(/** @type {any} */ (parse('1/x')).node), { fail: 'unsupported' });
  assert.deepEqual(evaluate(/** @type {any} */ (parse('sqrtx')).node), { fail: 'unsupported' });
});
