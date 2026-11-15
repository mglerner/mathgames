// Adversarial review gen2-oracle-a: answer keys, distractors and tags of the
// gen2 mint / scales generators (frac-add-sub, frac-mult-div, signed-arith,
// order-of-ops, combine-like-terms, factor-gcf, clear-fractions,
// literal-equations), recomputed by an independent oracle (./_oracle.js:
// own parser of the PRINTED text, own BigInt rationals and polynomials;
// nothing from src/math).
//
// Run: node --test test/adversarial/gen2-oracle-a/oracle.test.js
// Seeds per difficulty x interaction cell: GEN2_ORACLE_SEEDS (default 400;
// the review ran 20000 with `node test/adversarial/gen2-oracle-a/_sweep.mjs
// <generator-id> 20000`, which prints every issue with replayable seeds).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { print } from '../../../src/math/print.js';
import { checkItem } from './_check.js';

const IDS = ['frac-add-sub.core', 'frac-mult-div.core', 'signed-arith.core', 'order-of-ops.core',
  'combine-like-terms.core', 'factor-gcf.core', 'clear-fractions.core', 'literal-equations.core'];
const env = Number(process.env.GEN2_ORACLE_SEEDS);
const SEEDS = Number.isInteger(env) && env > 0 ? env : 400;
const gen = (id) => generators.find((g) => g.id === id);
const make = (id, seed, difficulty, interaction, fadeLevel = 0) => gen(id).generate(makeRng(seed), { difficulty, interaction, fadeLevel });
const clone = (p) => JSON.parse(JSON.stringify(p, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)), (_k, v) => (typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v));
// issue codes that demonstrate an open finding; each has its own { todo } test below
// (finding 1, trace-untagged-but-rule, fixed in clear-fractions.core: now checked by the sweep)
const KNOWN = /** @type {Set<string>} */ (new Set());
const codes = (p) => checkItem(p).map((i) => i.code);

describe('gen2-oracle-a: every cell, every seed, no oracle issue', () => {
  for (const id of IDS) {
    test(`${id}: ${SEEDS} seeds per cell`, () => {
      const g = gen(id);
      assert.ok(g, `${id} is not registered`);
      const found = [];
      for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < SEEDS; s++) {
        const seed = `s${s}`;
        const p = g.generate(makeRng(seed), { difficulty: d, interaction: it, fadeLevel: s % 4 });
        for (const i of checkItem(p)) if (!KNOWN.has(i.code) && found.length < 10) found.push(`d${d} ${it} ${seed} f${s % 4}: ${i.code} ${i.msg}`);
      }
      assert.deepEqual(found, []);
    });
  }
});

describe('gen2-oracle-a: the oracle is not vacuous (mutations are caught)', () => {
  test('a wrong numeric key', () => {
    const p = clone(make('frac-add-sub.core', 's264', 3, 'strike', 3));
    p.answer.expected = { t: 'frac', num: { t: 'num', q: { n: 14n, d: 1n } }, den: { t: 'num', q: { n: 12n, d: 1n } } };
    assert.ok(codes(p).includes('key-wrong-value'));
  });
  test('a flipped Twin label', () => {
    const p = clone(make('combine-like-terms.core', 's621', 2, 'twin', 0));
    for (const c of p.choices) c.verdict = c.verdict === 'correct' ? 'wrong' : 'correct';
    assert.ok(codes(p).includes('twin-label-wrong'));
  });
  test('a mistagged Next Line distractor', () => {
    const p = clone(make('combine-like-terms.core', 's0', 3, 'nextline', 0));
    const w = p.choices.find((c) => c.verdict === 'wrong');
    w.malrule = w.malrule === 'neg-distribution' ? 'partial-distribution' : 'neg-distribution';
    assert.ok(codes(p).includes('nextline-tag-not-reproduced'));
  });
  test('a wrong Trace key', () => {
    const p = clone(make('clear-fractions.core', 's0', 2, 'trace', 0));
    for (const c of p.choices) c.verdict = c.id === 'L1' ? 'correct' : 'wrong';
    assert.ok(codes(p).includes('trace-key'));
  });
  test('a risky Cast chip labelled progress', () => {
    const p = clone(make('clear-fractions.core', 's0', 1, 'cast', 0));
    const c = p.choices.find((x) => x.verdict === 'risky');
    c.verdict = 'legal-idle';
    assert.ok(codes(p).includes('cast-verdict'));
  });
  test('a dropped nonzero declaration', () => {
    const p = clone(make('literal-equations.core', 's0', 3, 'strike', 0));
    assert.match(print(p.answer.expected), /\/h/);
    p.assumptions = [];
    assert.ok(codes(p).includes('undeclared-divisor-key'));
  });
  test('a non-least LCD multiplier', () => {
    const p = clone(make('clear-fractions.core', 's112', 2, 'predict', 0));
    p.prompt.move = { op: 'mul', operand: { t: 'num', q: { n: 12n, d: 1n } } };
    p.prompt.goal = 'Multiply both sides by 12.';
    p.answer.expected = { t: 'eq', lhs: { t: 'add', args: [{ t: 'mul', args: [{ t: 'num', q: { n: 6n, d: 1n } }, { t: 'var', name: 'x' }] }, { t: 'mul', args: [{ t: 'num', q: { n: 4n, d: 1n } }, { t: 'var', name: 'x' }] }] }, rhs: { t: 'num', q: { n: 60n, d: 1n } } };
    assert.ok(codes(p).includes('clear-not-lcd'));
  });
});

describe('gen2-oracle-a: documented example seeds', () => {
  const cases = [
    ['frac-add-sub.core', 's264', 3, 'strike', '1/4 + 5/6', '13/12'],
    ['frac-mult-div.core', 's86', 3, 'strike', '(2/3)/(4/5)', '5/6'],
    ['signed-arith.core', 's604', 2, 'strike', '5 - (-3)', '8'],
    ['order-of-ops.core', 's35', 3, 'strike', '-3^2', '-9'],
    ['combine-like-terms.core', 's621', 2, 'strike', '6x - 9 - 3x + 4', '3x - 5'],
    ['factor-gcf.core', 's130', 1, 'strike', '12x + 18', '6, 2x + 3'],
    ['literal-equations.core', 's1', 2, 'strike', 'P = 2l + 2w', '(P - 2l)/2'],
  ];
  for (const [id, seed, d, it, math, key] of cases) {
    test(`${id} ${seed} d${d} ${it}: ${math} -> ${key}`, () => {
      const p = make(id, seed, d, it, 3);
      assert.equal(print(p.prompt.math), math);
      const k = Array.isArray(p.answer.expected) ? p.answer.expected.map(print).join(', ') : print(p.answer.expected);
      assert.equal(k, key);
      assert.deepEqual(checkItem(p), []);
    });
  }
  test('clear-fractions.core s112 d2: x/2 + x/3 = 5, multiply by 6, x = 6', () => {
    const p = make('clear-fractions.core', 's112', 2, 'predict', 3);
    assert.equal(print(p.prompt.math), 'x/2 + x/3 = 5');
    assert.equal(print(p.prompt.move.operand), '6');
    const s = make('clear-fractions.core', 's112', 2, 'strike', 3);
    assert.equal(s.answer.expected.roots[0].terms[0].coef.n, 6n);
    assert.deepEqual(checkItem(p), []);
    assert.deepEqual(checkItem(s), []);
  });
});

describe('gen2-oracle-a: open findings (finding 1 fixed; kept as regressions)', () => {
  // finding 1: clear-fractions Trace plants the "whole number not multiplied" x LCD line untagged, but
  // when the only whole-number term is the whole other side that line IS the Lopsider's (one side
  // multiplied, the other not), which the same generator tags one-sided-operation on identical shapes
  // ((x + 6)/3 = -1 -> x + 6 = -1 is tagged at d1 s24; (x + 9)/2 = 6 -> x + 9 = 6 is untagged at d1 s10).
  test('clear-fractions Trace: a planted line that is a mal-rule output carries that tag', () => {
    const p = make('clear-fractions.core', 's10', 1, 'trace', 2);
    const bad = p.steps.find((s) => !s.legal);
    assert.equal(print(bad.line), 'x + 9 = 6');
    assert.equal(bad.malrule, 'one-sided-operation');
  });
  test('clear-fractions Trace: no untagged plant is a modelled rule output (200 seeds per difficulty)', () => {
    const hits = [];
    for (let d = 1; d <= 4; d++) for (let s = 0; s < 200; s++) {
      const p = make('clear-fractions.core', `s${s}`, d, 'trace', s % 4);
      for (const i of checkItem(p)) if (i.code === 'trace-untagged-but-rule') hits.push(`d${d} s${s}: ${i.msg}`);
    }
    assert.deepEqual(hits, []);
  });
});
