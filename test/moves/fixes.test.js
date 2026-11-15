// @ts-check
// Regression tests for the M1c review findings fixed in src/moves (see
// test/adversarial/check/findings.test.js), plus real.js, which the fixes use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { classify, classifyDetail, trueSolutions } from '../../src/moves/classify.js';
import { applyMove } from '../../src/moves/apply.js';
import { chipVerdicts } from '../../src/moves/graph.js';
import { realZeros, nonRealPart, provablyUndefined } from '../../src/moves/real.js';
import { evaluateS } from '../../src/math/evaluate.js';
import { checkRoot } from '../../src/math/solve.js';
import { seq, sIsZero } from '../../src/math/surd.js';
import { q, qstr } from '../../src/math/rational.js';
import { P, nz, sQ } from '../check/_items.js';

/** @typedef {import('../../types.d.ts').Move} Move */
/** @typedef {import('../../types.d.ts').Surd} Surd */

/** @param {Move['op']} op @param {string} [operand] @returns {Move} */
const M = (op, operand) => (operand === undefined ? { op } : { op, operand: P(operand) });

test('finding 2: on a solved state every legal chip is legal-idle', () => {
  const isNum = (/** @type {any} */ n) => n.t === 'num' || (n.t === 'neg' && n.arg.t === 'num');
  const isGoal = (/** @type {any} */ e) => e.lhs.t === 'var' && isNum(e.rhs);
  const chips = [M('mul', '1'), M('add', '0'), M('add', '2'), M('div', 'x'), M('mul', '0')];
  const cv = chipVerdicts(P('x = 3'), chips, () => chips, isGoal);
  assert.ok(cv);
  assert.equal(cv.distance, 0);
  assert.deepEqual(cv.chips.map((c) => c.verdict), ['legal-idle', 'legal-idle', 'legal-idle', 'risky', 'illegal']);
});

test('finding 6: provably safe moves are legal, on any equation', () => {
  assert.equal(classify(M('mul', '2'), P('sqrt(x) = 2'), []), 'legal');
  assert.equal(classify(M('div', '-3/4'), P('sqrt(x + 1) = x'), []), 'legal');
  assert.equal(classify(M('add', '5'), P('sqrt(x) = 2'), []), 'legal');
  assert.equal(classify(M('sub', 'sqrt(2)'), P('sqrt(x) = 2'), []), 'legal');
  assert.equal(classify(M('add', '1/(x^2 + 1)'), P('x = 2'), []), 'legal');
  assert.equal(classify(M('add', 'x/(x^2 + 4)'), P('x^2 = 9'), []), 'legal');
  assert.equal(classify(M('add', '1/(x + 1)'), P('x = 2'), [{ name: 'x', rel: 'nonneg' }]), 'legal', 'x >= 0: x + 1 is never 0');
  // Still risky / illegal.
  assert.equal(classify(M('add', '1/(x^2 - 4)'), P('x = 2'), []), 'risky');
  assert.equal(classify(M('add', '1/(x^2 + x)'), P('x = 2'), []), 'risky');
  assert.equal(classify(M('add', 'sqrt(x)'), P('x = 2'), []), 'risky');
  assert.equal(classify(M('mul', 'x^2 + 1'), P('x = 2'), []), 'risky', 'rule 2 unchanged: any undeclared variable');
  assert.equal(classify(M('mul', '0'), P('sqrt(x) = 2'), []), 'illegal');
  assert.equal(classify(M('mul', 'sqrt(-4)'), P('x = 2'), []), 'illegal', 'no real value');
  assert.equal(classify(M('add', 'sqrt(-1)'), P('x = 2'), []), 'illegal');
  assert.equal(classify(M('add', '1/0'), P('x = 2'), []), 'illegal');
  // A constant with a value that cannot be computed exactly is not "x 0".
  assert.equal(classifyDetail(M('mul', '2^(1/3)'), P('x = 2'), []).reason, 'unverifiable');
  assert.equal(classify(M('add', '2^(1/3)'), P('x = 2'), []), 'risky');
});

test('finding 6 property: a legal verdict on a radical or rational-pole move keeps the root set (3000 seeds)', () => {
  let checked = 0;
  forSeeds(3000, (rng) => {
    // sqrt(x + a) = b with b >= 0 has the one root b^2 - a.
    const a = rng.int(-9, 9);
    const b = rng.int(0, 6);
    const e = P(`sqrt(x + ${a}) = ${b}`);
    const root = sQ(BigInt(b * b - a));
    assert.equal(checkRoot(e, 'x', root), true, 'construction');
    const k = nz(rng, -9, 9);
    const c = rng.int(1, 9);
    const m = rng.pick([M('mul', `${k}`), M('div', `${k}/${c}`), M('add', `${k}`), M('sub', `${c}sqrt(${c + 1})`), M('add', `1/(x^2 + ${c})`)]);
    assert.equal(classify(m, e, []), 'legal', `${m.op} on sqrt(x + ${a}) = ${b}`);
    // Independent check that the move kept the root: substitute into the moved equation.
    assert.equal(checkRoot(applyMove(m, e), 'x', root), true);
    // And on a linear equation the exact root set is unchanged where it can be computed.
    const lin = P(`${nz(rng, -5, 5)}x = ${rng.int(-9, 9)}`);
    const before = trueSolutions(lin, 'x');
    const after = trueSolutions(applyMove(m, lin), 'x');
    if (before && after) {
      checked++;
      assert.equal(before.kind, after.kind);
      if (before.kind === 'finite' && after.kind === 'finite') assert.ok(before.roots.every((r, i) => seq(r, after.roots[i])));
    }
  });
  assert.ok(checked > 1000, `root sets compared on ${checked} seeds`);
});

test('real.js: realZeros finds exactly the constructed zeros (2000 seeds)', () => {
  forSeeds(2000, (rng) => {
    const n = rng.int(0, 4);
    /** @type {{ n: number; d: number }[]} */
    const rs = [];
    for (let i = 0; i < n; i++) rs.push({ n: rng.int(-9, 9), d: rng.int(1, 4) });
    const quad = rng.pick(['', '(x^2 + 1)', '(x^2 - 2)', '(x^2 + x + 5)', '(2x^2 - 3)']);
    const factors = rs.map((r) => `(${r.d}x - ${r.n})`);
    if (quad) factors.push(quad);
    const text = factors.length ? `${nz(rng, -3, 3)}${factors.join('')}` : `${nz(rng, -3, 3)}`;
    const z = realZeros(P(text));
    assert.ok(z, text);
    // Every returned zero makes the polynomial exactly 0, and every constructed zero is returned.
    for (const r of z.roots) {
      const val = evaluateS(P(text), { x: r });
      assert.ok(val && sIsZero(val), `${text}: not a zero`);
    }
    for (const r of rs) assert.ok(z.roots.some((y) => seq(y, sQ(BigInt(r.n), BigInt(r.d)))), `${text}: missed ${r.n}/${r.d}`);
    const fromQuad = quad === '(x^2 - 2)' || quad === '(2x^2 - 3)' ? 2 : 0;
    const distinct = new Set(rs.map((r) => qstr(q(r.n, r.d)))).size;
    assert.equal(z.roots.length, distinct + fromQuad, `${text}: count`);
  });
  assert.equal(realZeros(P('x^3 - 2')), undefined, 'irreducible cubic: not decided');
  assert.equal(realZeros(P('x + y')), undefined);
  const pos = realZeros(P('(x + 1)(x - 2)x'), [{ name: 'x', rel: 'pos' }]);
  assert.ok(pos && pos.roots.length === 1 && seq(pos.roots[0], sQ(2n)));
});

test('real.js: nonRealPart / provablyUndefined', () => {
  for (const t of ['sqrt(-4)', '3 + sqrt(-1)', '(-2)^(1/2)', 'sqrt(1 - 5)', '(-9)^(3/2)']) {
    assert.ok(nonRealPart(P(t)), t);
    assert.equal(provablyUndefined(P(t)), true, t);
  }
  for (const t of ['sqrt(4)', '(-8)^(1/3)', '2^(1/3)', '(-2)^2', 'sqrt(0)']) assert.equal(nonRealPart(P(t)), undefined, t);
  for (const t of ['1/0', '0^(-1)', '1/(3 - 3) + 2']) assert.equal(provablyUndefined(P(t)), true, t);
  for (const t of ['2^(1/3)', '(-8)^(1/3)', '0^2', 'x/0']) assert.equal(provablyUndefined(P(t)), false, t);
});
