// Adversarial regression tests for defects found in src/check and src/moves
// (M1c review). Each test that shows an unfixed defect is marked
// { todo: 'finding N' } so the suite stays green; the fixer removes the todo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../../../src/check/judge.js';
import { classify } from '../../../src/moves/classify.js';
import { chipVerdicts } from '../../../src/moves/graph.js';
import { parse } from '../../../src/math/parse.js';

function node(s) { const r = parse(s); if ('error' in r) throw new Error(s); return r; }
function problem(answer, over = {}) {
  return {
    id: 't', gen: 'adv', version: 1, seed: 's', skill: 'adv', difficulty: 1, interaction: 'strike', constructed: true, fadeLevel: 2,
    prompt: { verb: 'Solve', math: node('x^2 = -4') }, assumptions: [], variableKeys: ['x'], answer, visuals: [], probes: [], ...over,
  };
}
const S = (n) => ({ terms: [{ coef: { n: BigInt(n), d: 1n }, rad: 1n }] });

test('finding 1: a non-real value typed into a solution set is wrong, not unverifiable', () => {
  const none = problem({ kind: 'solution-set', expected: { kind: 'none' }, formPredicates: [], assumptions: [] });
  for (const t of ['sqrt(-4)', '± 2sqrt(-1)', 'x = ±sqrt(-4)']) assert.equal(judge(none, t).verdict, 'wrong', t);
  const two = problem({ kind: 'solution-set', expected: { kind: 'finite', roots: [S(3), S(-1)] }, formPredicates: [], assumptions: [] });
  assert.equal(judge(two, '3, -1, sqrt(-1)').verdict, 'wrong');
});

test('finding 2: on a solved state, a legal chip that stays solved is not progress', () => {
  const isNum = (n) => n.t === 'num' || (n.t === 'neg' && n.arg.t === 'num');
  const isGoal = (e) => e.lhs.t === 'var' && isNum(e.rhs);
  const chips = [{ op: 'mul', operand: node('1') }, { op: 'add', operand: node('0') }];
  const cv = chipVerdicts(node('x = 3'), chips, () => chips, isGoal);
  assert.equal(cv.distance, 0);
  for (const c of cv.chips) assert.notEqual(c.verdict, 'progress', 'distance 0 -> 0 did not drop');
});

test('finding 3: equal domains written differently are recognised (correct / form, not unverifiable)', () => {
  const p1 = problem({ kind: 'expr', expected: node('1/(x(x+1))'), formPredicates: [], assumptions: [] });
  assert.equal(judge(p1, '1/x - 1/(x+1)').verdict, 'correct');
  const p2 = problem({ kind: 'expr', expected: node('(x+1)/(x-1)'), formPredicates: [], assumptions: [] });
  assert.equal(judge(p2, '(x^2+3x+2)/((x-1)(x+2))').verdict, 'form', 'extra restriction x != -2, like (x^2-1)/(x-1) for x+1');
});

test('finding 4: a solution typed with the wrong letter is not "cannot compute exactly"', () => {
  const p = problem({ kind: 'solution-set', expected: { kind: 'finite', roots: [S(3)] }, formPredicates: [], assumptions: [] });
  for (const t of ['y = 3', 'x = 3, y = 4']) assert.notEqual(judge(p, t).verdict, 'unverifiable', t);
});

test('finding 5: typed text on a constructed item is not captured by a choice id', () => {
  const p = problem({ kind: 'form-of-1', expected: node('sqrt(3)/sqrt(3)'), formPredicates: ['no-radical-in-denominator'], assumptions: [] }, {
    interaction: 'forge', prompt: { verb: 'Forge', math: node('6/sqrt(3)') },
    choices: [{ id: '1', display: node('sqrt(3)/sqrt(3)'), verdict: 'correct' }, { id: '2', display: node('3/3'), verdict: 'legal-idle' }],
  });
  // Typed "1" is a form of 1 that misses the goal: legal-idle, not the choice with id "1".
  assert.equal(judge(p, '1').verdict, 'legal-idle');
});

test('finding 6: provably safe moves are not refused as risky', () => {
  assert.equal(classify({ op: 'mul', operand: node('2') }, node('sqrt(x) = 2'), []), 'legal');
  assert.equal(classify({ op: 'add', operand: node('1/(x^2 + 1)') }, node('x = 2'), []), 'legal');
});
