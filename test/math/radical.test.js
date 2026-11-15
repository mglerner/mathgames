// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { P, show, radSum, POS } from './_arb.js';
import { q, mul as qmul, qpow } from '../../src/math/rational.js';
import { toRadicalNormalForm, radEq, radTerms, radIsZero, radRatio } from '../../src/math/radical.js';
import { evaluate } from '../../src/math/evaluate.js';
import { seq, sadd, smul, fromQ, surdToNode, SZERO } from '../../src/math/surd.js';
import { print } from '../../src/math/print.js';

/** @typedef {import('../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../../types.d.ts').Q} Q */

/** @type {Assumption[]} */
const NONNEG = [{ name: 'x', rel: 'nonneg' }, { name: 'y', rel: 'nonneg' }];

/** Readable normal form: terms sorted, "coef * x^(e) y^(e)". @param {string} text @param {Assumption[]} as */
function nf(text, as) {
  const r = toRadicalNormalForm(P(text), as);
  if (!r) return undefined;
  const terms = radTerms(r).map((t) => {
    const m = t.mono.map(([name, e]) => `${name}^(${e.n}${e.d === 1n ? '' : `/${e.d}`})`).join(' ');
    return `[${print(surdToNode(t.coef))}]${m ? ` ${m}` : ''}`;
  }).sort();
  return { terms, poles: r.poles };
}

test('toRadicalNormalForm: hand-checked normal forms', () => {
  assert.deepEqual(nf('6/sqrt(3)', []), { terms: ['[2sqrt(3)]'], poles: [] });
  assert.deepEqual(nf('sqrt(12)', []), { terms: ['[2sqrt(3)]'], poles: [] });
  assert.deepEqual(nf('sqrt(3)*sqrt(3)', []), { terms: ['[3]'], poles: [] });
  assert.deepEqual(nf('sqrt(2)x+sqrt(2)x', []), { terms: ['[2sqrt(2)] x^(1)'], poles: [] });
  assert.deepEqual(nf('(x+sqrt(2))^2', []), { terms: ['[1] x^(2)', '[2]', '[2sqrt(2)] x^(1)'], poles: [] });
  assert.deepEqual(nf('sqrt(x^2)', NONNEG), { terms: ['[1] x^(1)'], poles: [] });
  assert.deepEqual(nf('sqrt(12x^3)', NONNEG), { terms: ['[2sqrt(3)] x^(3/2)'], poles: [] });
  assert.deepEqual(nf('sqrt(x)sqrt(y)', NONNEG), { terms: ['[1] x^(1/2) y^(1/2)'], poles: [] });
  assert.deepEqual(nf('x^(1/2)*x^(1/3)', NONNEG), { terms: ['[1] x^(5/6)'], poles: [] });
  assert.deepEqual(nf('x/sqrt(x)', NONNEG), { terms: ['[1] x^(1/2)'], poles: ['x != 0'] });
  assert.deepEqual(nf('x/sqrt(x)', POS), { terms: ['[1] x^(1/2)'], poles: [] });
  assert.deepEqual(nf('1/(2x)', []), { terms: ['[1/2] x^(-1)'], poles: ['x != 0'] });
  assert.deepEqual(nf('x/x', []), { terms: ['[1]'], poles: ['x != 0'] });
  assert.deepEqual(nf('x^0', []), { terms: ['[1]'], poles: ['x != 0'] });
  assert.deepEqual(nf('(x+1)^0', []), { terms: ['[1]'], poles: ['x + 1 != 0'] });
  assert.deepEqual(nf('x-x', []), { terms: [], poles: [] });
  assert.deepEqual(nf('sqrt(x-x)', []), { terms: [], poles: [] });
  assert.deepEqual(nf('(4x)^(3/2)', NONNEG), { terms: ['[8] x^(3/2)'], poles: [] });
  assert.deepEqual(nf('(x^(1/2)+1)^2', NONNEG), { terms: ['[1]', '[1] x^(1)', '[2] x^(1/2)'], poles: [] });
  assert.ok(radIsZero(/** @type {any} */ (toRadicalNormalForm(P('sqrt(2)x-sqrt(2)x'), []))));
});

test('toRadicalNormalForm: outside the class -> undefined', () => {
  /** @type {[string, Assumption[]][]} */
  const table = [
    ['sqrt(x)', []], // undeclared
    ['sqrt(x^2)', []],
    ['sqrt(x^2)', [{ name: 'x', rel: 'nonzero' }]], // nonzero is not nonneg
    ['x^(1/2)', []],
    ['sqrt(xy)', [{ name: 'x', rel: 'nonneg' }]], // y undeclared
    ['sqrt(x+1)', NONNEG], // a sum under a radical
    ['sqrt(x^2+2x+1)', NONNEG],
    ['1/(x+1)', NONNEG], // a sum in a denominator
    ['1/(sqrt(x)+1)', NONNEG],
    ['(x+1)^(-1)', NONNEG],
    ['(x+1)^(1/2)', NONNEG],
    ['sqrt(-x)', NONNEG], // negative radicand
    ['sqrt(-4x^2)', NONNEG],
    ['(-x)^(1/2)', NONNEG],
    ['sqrt(sqrt(2)x)', NONNEG], // irrational coefficient under a radical
    ['sqrt(2x)^(1/2)', NONNEG], // 2^(1/4)
    ['(2x)^(1/3)', NONNEG], // cube root of 2
    ['x^x', NONNEG],
    ['2^x', NONNEG],
    ['x^sqrt(2)', NONNEG],
    ['x/0', NONNEG],
    ['x+1/0', NONNEG],
    ['x/(x-x)', NONNEG],
    ['(x-x)^0', NONNEG],
    ['(x-x)^(-1/2)', NONNEG],
    ['sqrt(1+sqrt(2))x', []],
    ['(x+1)^65', []],
    ['(x+y+1)^64', []],
  ];
  for (const [text, as] of table) assert.equal(toRadicalNormalForm(P(text), as), undefined, text);
});

test('normal form agrees with exact evaluation at perfect-square points (independent evaluator)', () => {
  let checked = 0;
  forSeeds(5000, (rng) => {
    const tree = radSum(rng);
    const form = toRadicalNormalForm(tree, POS);
    assert.ok(form, `${print(tree)} is in the class`);
    assert.deepEqual(form.poles, [], 'pos variables leave no poles');
    for (let i = 0; i < 3; i++) {
      // x = sx^2, y = sy^2 with sx, sy positive rationals, so x^(k/2) = sx^k exactly
      const s = { x: q(rng.int(1, 7), rng.int(1, 4)), y: q(rng.int(1, 7), rng.int(1, 4)) };
      const env = { x: qmul(s.x, s.x), y: qmul(s.y, s.y) };
      const direct = evaluate(tree, env);
      assert.ok(direct, `${print(tree)} at ${show(env)}`);
      let viaForm = SZERO;
      for (const t of radTerms(form)) {
        let m = q(1);
        for (const [name, e] of t.mono) {
          assert.ok(e.d === 1n || e.d === 2n, 'this generator only makes half-integer powers');
          const base = /** @type {Q} */ (s[/** @type {'x' | 'y'} */ (name)]);
          const half = e.d === 1n ? e.n * 2n : e.n; // exponent of s
          m = qmul(m, /** @type {Q} */ (qpow(base, half)));
        }
        viaForm = sadd(viaForm, smul(t.coef, fromQ(m)));
      }
      assert.ok(seq(direct, viaForm), `${print(tree)} at ${show(env)}`);
      checked++;
    }
  });
  assert.equal(checked, 15000);
});

test('radEq / radRatio', () => {
  const A = (/** @type {string} */ s) => /** @type {any} */ (toRadicalNormalForm(P(s), NONNEG));
  assert.ok(radEq(A('sqrt(4x)'), A('2sqrt(x)')));
  assert.ok(!radEq(A('sqrt(4x)'), A('4sqrt(x)')));
  assert.ok(!radEq(A('sqrt(x)'), A('x')));
  assert.deepEqual(radRatio(A('2sqrt(2)x-4'), A('sqrt(2)x-2')), q(2));
  assert.equal(radRatio(A('2x-2sqrt(2)'), A('sqrt(2)x-2')), false);
  assert.equal(radRatio(A('x-x'), A('x')), false);
  assert.equal(radRatio(A('x'), A('x-x')), false);
  assert.deepEqual(radRatio(A('x-x'), A('y-y')), q(1));
  assert.equal(radRatio(A('x+1'), A('x+2')), false);
  assert.equal(radRatio(A('x+1'), A('x')), false);
});
