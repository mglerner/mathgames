// Adversarial: judge() on 50000 fuzzed strings across every AnswerSpec kind
// and a choice item. It must never throw, must always return a known verdict,
// and must not hide an internal exception (result.error set) on keypad text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../../../src/check/judge.js';
import { parse } from '../../../src/math/parse.js';
import { rng } from './_oracle.js';

function node(s) { const r = parse(s); if ('error' in r) throw new Error(s); return r; }
function problem(answer, over = {}) {
  return {
    id: 't', gen: 'adv', version: 1, seed: 's', skill: 'adv', difficulty: 1, interaction: 'strike', constructed: true, fadeLevel: 2,
    prompt: { verb: 'Solve', math: node('6 + 4x = 2x^2') }, assumptions: [], variableKeys: ['x'], answer, visuals: [], probes: [], ...over,
  };
}
const S = (n) => ({ terms: [{ coef: { n: BigInt(n), d: 1n }, rad: 1n }] });
const ITEMS = [
  problem({ kind: 'expr', expected: node('4/3'), formPredicates: ['lowest-terms'], assumptions: [] }),
  problem({ kind: 'expr', expected: node('(x+1)/(x-1)'), formPredicates: [], assumptions: [] }),
  problem({ kind: 'expr', expected: node('2sqrt(3)'), formPredicates: ['radical-simplified', 'no-radical-in-denominator'], assumptions: [] }),
  problem({ kind: 'equation-sides', expected: node('0 = 2x^2 - 4x - 6'), formPredicates: [], assumptions: [] }, { prompt: { verb: 'Predict', math: node('6 + 4x = 2x^2'), move: { op: 'sub', operand: node('6 + 4x') } } }),
  problem({ kind: 'equation-multiple', expected: node('6 + 4x = 2x^2'), formPredicates: ['standard-form'], assumptions: [] }),
  problem({ kind: 'solution-set', expected: { kind: 'finite', roots: [S(3), S(-1)] }, formPredicates: ['radical-simplified'], assumptions: [] }),
  problem({ kind: 'form-of-1', expected: node('sqrt(3)/sqrt(3)'), formPredicates: ['no-radical-in-denominator'], assumptions: [] }, { prompt: { verb: 'Forge', math: node('6/sqrt(3)') } }),
  problem({ kind: 'form-of-0', expected: node('9 - 9'), formPredicates: [], assumptions: [] }, { prompt: { verb: 'Forge', math: node('x^2 + 6x') } }),
  problem({ kind: 'tuple', expected: [node('2'), node('-4'), node('-6')], formPredicates: [], assumptions: [] }, { variant: 'read-abc' }),
  problem({ kind: 'expr', expected: node('w'), formPredicates: [], assumptions: [{ name: 'l', rel: 'nonzero' }] }, { variableKeys: ['l', 'w', 'A'] }),
];
const ALPH = ['0', '1', '2', '3', '9', 'x', 'l', 'w', 'A', '+', '-', '*', '/', '^', '(', ')', '=', ',', ' ', 'sqrt', 'sqrt(', '±', '+-', '+/-', '.', 'no solution', 'all reals', '1/0', '0^0', '^(1/2)', '^-1', '99999999999', 'x^64', '((', '))', '−', '·', 'e', '\t'];
const VERDICTS = new Set(['correct', 'form', 'legal-idle', 'risky', 'wrong', 'unparsed', 'unverifiable']);

test('judge never throws on 50000 fuzzed keypad strings, and hides no internal error', () => {
  const R = rng(777);
  const errors = [];
  let slow = 0; let worst = 0; let worstText = '';
  for (let i = 0; i < 50000; i++) {
    const len = R.int(0, 14);
    let s = '';
    for (let j = 0; j < len; j++) s += R.pick(ALPH);
    const p = ITEMS[i % ITEMS.length];
    const t = performance.now();
    let r;
    try { r = judge(p, s); } catch (err) { assert.fail(`judge threw on ${JSON.stringify(s)}: ${err}`); }
    const dt = performance.now() - t;
    if (dt > worst) { worst = dt; worstText = s; }
    if (dt > 2000) slow++;
    assert.ok(VERDICTS.has(r.verdict), `bad verdict ${r.verdict} on ${JSON.stringify(s)}`);
    if (r.error) errors.push(`${p.answer.kind} ${JSON.stringify(s)}: ${r.error}`);
  }
  // eslint-disable-next-line no-console
  console.log(`fuzz: worst ${worst.toFixed(1)} ms on ${JSON.stringify(worstText)}, ${slow} over 2000 ms, ${errors.length} hidden errors`);
  assert.equal(errors.length, 0, errors.slice(0, 10).join('\n'));
  assert.equal(slow, 0);
});
