// @ts-check
// Cast classification (DESIGN.md section 3 I1, section 11 tests): hand cases
// from the spec, the one-way root-set changes, and a 5000-seed property whose
// expected verdict comes from the move family (a theorem), not from classify.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { applyMove } from '../../src/moves/apply.js';
import { classify, classifyDetail, rootSetChange, trueSolutions } from '../../src/moves/classify.js';
import { checkRoot } from '../../src/math/solve.js';
import { seq } from '../../src/math/surd.js';
import { vars } from '../../src/math/ast.js';
import { P, nz, polyText, sQ } from '../check/_items.js';

/** @typedef {import('../../types.d.ts').Move} Move */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').Equation} Equation */

/** @param {Move['op']} op @param {string} [operand] @returns {Move} */
const M = (op, operand) => (operand === undefined ? { op } : { op, operand: P(operand) });
const L_NZ = [{ name: 'l', rel: /** @type {const} */ ('nonzero') }];

test('section 3 I1 examples', () => {
  const e = P('6 + 4x = 2x^2');
  assert.equal(classify(M('sub', '6 + 4x'), e, []), 'legal');
  assert.equal(classify(M('sub', '2x^2'), e, []), 'legal');
  assert.equal(classify(M('div', '2'), e, []), 'legal');
  const d = classifyDetail(M('div', 'x'), e, []);
  assert.equal(d.verdict, 'risky', '"/ x" is risky although 0 is not a root');
  assert.equal(d.reason, 'possibly-zero');
  assert.equal(classify(M('mul', '0'), P('x = 2'), []), 'illegal', '"x 0"');
  assert.equal(classify(M('div', '0'), P('x = 2'), []), 'illegal');
  assert.equal(classify(M('div', '1/0'), P('x = 2'), []), 'illegal');
});

test('risky: any mul/div by an expression with an undeclared variable, whatever it simplifies to', () => {
  const e = P('3x + 5 = 11');
  for (const o of ['x', '2x', 'x + 1', 'x^2 + 1', 'x - x + 2', '1/x', 'x/x', 'l']) {
    assert.equal(classify(M('mul', o), e, []), 'risky', `x ${o}`);
    assert.equal(classify(M('div', o), e, []), 'risky', `/ ${o}`);
  }
});

test('literal equations: division by a declared-nonzero symbol is legal; by a sum of them is risky', () => {
  const e = P('A = lw');
  assert.equal(classify(M('div', 'l'), e, L_NZ), 'legal');
  assert.equal(classify(M('mul', '2l^2'), e, L_NZ), 'legal');
  assert.equal(classify(M('div', 'l'), e, []), 'risky', 'not declared');
  assert.equal(classify(M('div', 'w'), e, L_NZ), 'risky', 'w not declared');
  const both = [...L_NZ, { name: 'w', rel: /** @type {const} */ ('nonzero') }];
  assert.equal(classify(M('div', 'l + w'), e, both), 'risky');
  assert.equal(classify(M('div', 'lw'), e, both), 'legal');
});

test('one-way moves: squaring and roots are risky; the root set really changes', () => {
  assert.equal(classify(M('square'), P('x = 3'), []), 'risky');
  assert.equal(classify(M('sqrt'), P('x^2 = 9'), []), 'risky');
  const lose = P('x^2 = 3x');
  assert.equal(classify(M('div', 'x'), lose, []), 'risky');
  const ch1 = rootSetChange(lose, applyMove(M('div', 'x'), lose), 'x');
  assert.ok(ch1);
  assert.equal(ch1.lost.length, 1);
  assert.ok(seq(ch1.lost[0], sQ(0n)), '"/ x" on x^2 = 3x loses 0');
  assert.equal(ch1.added.length, 0);
  const add = P('x = 2');
  const ch2 = rootSetChange(add, applyMove(M('mul', 'x'), add), 'x');
  assert.ok(ch2);
  assert.equal(ch2.added.length, 1);
  assert.ok(seq(ch2.added[0], sQ(0n)), '"x x" on x = 2 adds 0');
  const sq = rootSetChange(P('x = 3'), applyMove(M('square'), P('x = 3')), 'x');
  assert.ok(sq && sq.added.length === 1 && seq(sq.added[0], sQ(-3n)), 'squaring adds -3');
});

test('domain: adding 1/x is risky; surd coefficients fall back to the exact root-set comparison', () => {
  assert.equal(classify(M('add', '1/x'), P('x = 2'), []), 'risky');
  assert.equal(classify(M('add', '1/l'), P('x = 2'), L_NZ), 'legal');
  const d = classifyDetail(M('div', 'sqrt(2)'), P('sqrt(2)x = 2'), []);
  assert.equal(d.verdict, 'legal');
  assert.equal(d.reason, 'root-set');
});

test('trueSolutions drops a root that is a pole', () => {
  const s = trueSolutions(P('x^2/x = (3x)/x'), 'x');
  assert.ok(s && s.kind === 'finite' && s.roots.length === 1 && seq(s.roots[0], sQ(3n)));
  assert.equal(trueSolutions(P('x/x = 1'), 'x'), undefined, '"all reals except 0" is not a SolutionSet');
  assert.deepEqual(trueSolutions(P('x + 1 = x + 1'), 'x'), { kind: 'all' });
});

/**
 * A random equation in x with known roots: c (x - r1)(x - r2) = 0 (or linear
 * a (x - r1) = 0) rearranged by moving a random polynomial to both sides.
 * @param {import('../../types.d.ts').Rng} rng
 * @returns {{ e: Equation; roots: Surd[] }}
 */
function randomEquation(rng) {
  const quad = rng.bool();
  const c = nz(rng, -3, 3);
  const r1 = BigInt(rng.int(-6, 6));
  let r2 = BigInt(rng.int(-6, 6));
  /** @type {bigint[]} */
  let P0;
  if (quad) {
    if (r2 === r1) r2 += 1n;
    P0 = [c * r1 * r2, -c * (r1 + r2), c];
  } else {
    P0 = [-c * r1, c];
  }
  const S = [BigInt(rng.int(-9, 9)), BigInt(rng.int(-9, 9)), BigInt(rng.int(-2, 2))];
  const L = S;
  const R = S.map((s, i) => s - (P0[i] ?? 0n)); // L - R = P0
  const e = /** @type {Equation} */ (P(`${polyText(L)} = ${polyText(R)}`));
  const roots = quad ? [sQ(r1), sQ(r2)] : [sQ(r1)];
  return { e, roots };
}

const zeroOnlyAt0 = ['x', '2x', '-x'];

test('property: every move family gets the verdict its theorem predicts, and legal moves keep the root set', () => {
  forSeeds(5000, (rng) => {
    const { e, roots } = randomEquation(rng);
    for (const r of roots) assert.equal(checkRoot(e, 'x', r), true, 'construction');
    const family = rng.int(0, 4);
    /** @type {Move} */
    let m;
    /** @type {string} */
    let want;
    let opText = '';
    if (family === 0) {
      m = { op: rng.bool() ? 'add' : 'sub', operand: P(polyText([BigInt(rng.int(-9, 9)), BigInt(rng.int(-9, 9)), BigInt(rng.int(-3, 3))])) };
      want = 'legal';
    } else if (family === 1) {
      const n = nz(rng, -9, 9);
      const d = BigInt(rng.int(1, 5));
      m = { op: rng.bool() ? 'mul' : 'div', operand: P(d === 1n ? `${n}` : `${n}/${d}`) };
      want = 'legal';
    } else if (family === 2) {
      m = { op: rng.bool() ? 'mul' : 'div', operand: P(rng.pick(['0', '0/5', '3 - 3', '2(1 - 1)'])) };
      want = 'illegal';
    } else if (family === 3) {
      opText = rng.pick(['x', '2x', '-x', 'x + 1', 'x - 3', 'x^2', 'x^2 + 1', 'x - x + 1', '(x + 2)/3']);
      m = { op: rng.bool() ? 'mul' : 'div', operand: P(opText) };
      want = 'risky';
    } else {
      m = { op: rng.bool() ? 'square' : 'sqrt' };
      want = 'risky';
    }
    const got = classify(m, e, []);
    assert.equal(got, want, `${m.op} on family ${family}`);
    if (m.op === 'mul' || m.op === 'div') {
      if (m.operand && vars(m.operand).length > 0) assert.notEqual(got, 'legal', 'no mul/div by an undeclared variable is ever legal');
    }
    if (got === 'legal') {
      const e1 = applyMove(m, e);
      for (const r of roots) assert.equal(checkRoot(e1, 'x', r), true, 'legal: known roots still satisfy the new line');
      const ch = rootSetChange(e, e1, 'x');
      if (ch) assert.deepEqual([ch.lost.length, ch.added.length], [0, 0], 'legal: root set unchanged');
    }
    if (family === 3 && m.op === 'mul' && zeroOnlyAt0.includes(opText) && roots.length === 1 && !seq(roots[0], sQ(0n))) {
      // One-way: multiplying a linear equation by x (or 2x, -x) adds the root 0.
      const ch = rootSetChange(e, applyMove(m, e), 'x');
      assert.ok(ch, 'comparable');
      assert.equal(ch.lost.length, 0);
      assert.equal(ch.added.length, 1);
      assert.ok(seq(ch.added[0], sQ(0n)), 'adds 0');
    }
    if (family === 3 && m.op === 'div' && opText === 'x' && roots.some((r) => seq(r, sQ(0n)))) {
      const ch = rootSetChange(e, applyMove(m, e), 'x');
      if (ch) assert.ok(ch.lost.some((r) => seq(r, sQ(0n))), '/ x loses the root 0');
    }
  });
});

test('property: declared-nonzero literal equations: divide by k l^n is legal, by l + k is risky', () => {
  forSeeds(5000, (rng) => {
    const a = nz(rng, -5, 5);
    const b = BigInt(rng.int(-5, 5));
    const e = /** @type {Equation} */ (P(`A = ${a}lw + ${b}`));
    const k = nz(rng, -4, 4);
    const n = rng.int(1, 3);
    const mono = `${k}l${n > 1 ? `^${n}` : ''}`;
    assert.equal(classify({ op: rng.bool() ? 'div' : 'mul', operand: P(mono) }, e, L_NZ), 'legal', mono);
    assert.equal(classify({ op: 'div', operand: P(`l + ${nz(rng, 1, 5)}`) }, e, L_NZ), 'risky');
    assert.equal(classify({ op: 'div', operand: P(mono) }, e, []), 'risky', 'undeclared');
  });
});
