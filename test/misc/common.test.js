// @ts-check
// src/gen/common.js: the shared generator helpers.
// Run: node scripts/gen-registry.js && node --test test/misc/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { makeRng } from '../../src/gen/prng.js';
import {
  defineGenerator, rejectionSample, MAX_TRIES, constructedFor, fadeVisuals, problemId, makeProblem, followUp, blank,
  separated, malChoices, shuffledChoices, twinChoices, traceChoices, tapTargets, nodeAtPath, probeEnvs, separatingProbe,
  conservativeWidth, fitsDisplay, fitsAll, displayedTrees, DISPLAY_CAP_PX, PROBE_VALUES, TWIN_SAME, TWIN_DIFFERENT, TRACE_NONE, BLANK,
} from '../../src/gen/common.js';
import { malruleById } from '../../src/misc/diagnose.js';
import { expectConstructed } from '../../src/session/planner.js';
import { displayWidth, nodeAtPath as domNodeAtPath, DISPLAY_CAP_PX as DOM_CAP } from '../../src/render/mathdom.js';
import { randomMath, nodesWithPaths } from '../render/arb.js';
import { print } from '../../src/math/print.js';
import { num, mul, frac } from '../../src/math/ast.js';
import { judge } from '../../src/check/judge.js';
import * as F from './_fixtures.js';

/** @typedef {import('../../types.d.ts').Interaction} Interaction */
/** @typedef {import('../../types.d.ts').Problem} Problem */

const GEN = { id: 'test.gen', version: 3, skill: 'test' };

test('constructedFor mirrors the planner for every interaction and fade', () => {
  for (const i of /** @type {Interaction[]} */ (['cast', 'nextline', 'predict', 'forge', 'twin', 'trace', 'why', 'strike'])) {
    for (const f of [0, 1, 2, 3]) assert.equal(constructedFor(i, f), expectConstructed(i, f), `${i} fade ${f}`);
  }
});

test('rejectionSample: deterministic, capped, and the error names the seed', () => {
  const draw = (/** @type {string} */ seed) => rejectionSample('g', makeRng(seed), (r) => { const x = r.int(1, 100); return x % 7 === 0 ? x : undefined; });
  assert.equal(draw('abc'), draw('abc'));
  let tries = 0;
  assert.throws(() => rejectionSample('my.gen', makeRng('seed-42'), () => { tries++; return undefined; }),
    /my\.gen: no valid item in 400 tries for seed "seed-42"/);
  assert.equal(tries, MAX_TRIES);
  // a try does not depend on how much earlier tries drew
  const a = rejectionSample('g', makeRng('k'), (r, i) => { if (i < 3) { r.int(0, 9); r.int(0, 9); return undefined; } return r.int(0, 1e6); });
  const b = rejectionSample('g', makeRng('k'), (r, i) => (i < 3 ? undefined : r.int(0, 1e6)));
  assert.equal(a, b);
});

test('defineGenerator refuses what the generator does not offer', () => {
  const g = defineGenerator({
    ...GEN, difficulty: [2, 3], interactions: ['strike'],
    build: (rng, opts) => makeProblem(GEN, rng.seed, opts, { prompt: { verb: 'Evaluate', math: F.N('1 + 1') }, answer: { kind: 'expr', expected: F.N('2'), formPredicates: [], assumptions: [] } }),
  });
  assert.throws(() => g.generate(makeRng('s'), { difficulty: 1, interaction: 'strike', fadeLevel: 0 }), /difficulty 1 outside/);
  assert.throws(() => g.generate(makeRng('s'), { difficulty: 4, interaction: 'strike', fadeLevel: 0 }), /difficulty 4 outside/);
  assert.throws(() => g.generate(makeRng('s'), { difficulty: 2, interaction: 'twin', fadeLevel: 0 }), /interaction "twin" not offered/);
  assert.throws(() => g.generate(makeRng('s'), { difficulty: 2, interaction: 'strike', fadeLevel: 5 }), /bad fadeLevel/);
  const p = g.generate(makeRng('s'), { difficulty: 2, interaction: 'strike', fadeLevel: 1 });
  assert.equal(p.id, 'test.gen@3/strike/d2/f1/s');
  assert.equal(p.id, problemId(GEN, 's', { difficulty: 2, interaction: 'strike', fadeLevel: 1 }));
  assert.deepEqual([p.gen, p.version, p.seed, p.skill, p.difficulty, p.constructed, p.fadeLevel], ['test.gen', 3, 's', 'test', 2, true, 1]);
  assert.deepEqual([p.assumptions, p.variableKeys, p.probes, p.visuals], [[], [], [], []]);
});

test('fade: all visuals at 0-1, the primary at 2, none at 3', () => {
  assert.deepEqual(fadeVisuals(0, ['numberline', 'bars']), ['numberline', 'bars']);
  assert.deepEqual(fadeVisuals(1, ['numberline', 'bars']), ['numberline', 'bars']);
  assert.deepEqual(fadeVisuals(2, ['numberline', 'bars']), ['numberline']);
  assert.deepEqual(fadeVisuals(3, ['numberline', 'bars']), []);
  const p = makeProblem(GEN, 's', { difficulty: 1, interaction: 'forge', fadeLevel: 3 }, { prompt: { verb: 'v', math: F.N('1') }, answer: { kind: 'expr', expected: F.N('1'), formPredicates: [], assumptions: [] }, visuals: ['coin'] });
  assert.deepEqual(p.visuals, []);
  assert.equal(p.constructed, true);
});

test('probes: the section 3 sets, never 0 or 1, distinct per env', () => {
  assert.deepEqual(probeEnvs([]), []);
  assert.deepEqual(probeEnvs(['x']).map((e) => Number(e.x.n)), [2, 3, -1]);
  assert.deepEqual(probeEnvs(['x'], [], { count: 5 }).map((e) => Number(e.x.n)), [...PROBE_VALUES]);
  assert.deepEqual(probeEnvs(['x'], [], { count: 99 }).length, 5);
  assert.deepEqual(probeEnvs(['x'], [{ name: 'x', rel: 'nonneg' }], { count: 5 }).map((e) => Number(e.x.n)), [2, 3, 5]);
  assert.deepEqual(probeEnvs(['x'], [{ name: 'x', rel: 'pos' }], { cleanRoot: true }).map((e) => Number(e.x.n)), [4, 9]);
  assert.deepEqual(probeEnvs(['x'], [{ name: 'x', rel: 'nonzero' }]).map((e) => Number(e.x.n)), [2, 3, -1]);
  for (const env of probeEnvs(['l', 'w', 'h'], [{ name: 'w', rel: 'pos' }], { count: 5 })) {
    const vals = Object.values(env).map((v) => Number(v.n));
    assert.ok(vals.every((v) => v !== 0 && v !== 1));
    assert.equal(new Set(vals).size >= 2, true);
    assert.ok(env.w.n > 0n);
  }
  const witness = separatingProbe(F.N('(x + 3)^2'), F.N('x^2 + 9'), probeEnvs(['x']));
  assert.deepEqual(witness, { x: { n: 2n, d: 1n } }, 'x = 2: 25 vs 13');
  assert.equal(separatingProbe(F.N('2(x + 3)'), F.N('2x + 6'), probeEnvs(['x'], [], { count: 5 })), undefined);
});

test('conservativeWidth: whatever it lets through, mathdom lets through (40000 random trees)', () => {
  assert.equal(DISPLAY_CAP_PX, DOM_CAP);
  forSeeds(40000, (rng, seed) => {
    const x = randomMath(rng, 1 + (Number(seed.slice(1)) % 4));
    const real = displayWidth(x);
    const mine = conservativeWidth(x);
    // An expression: never below. An equation may wrap at "=", where the two
    // estimates can pick different layouts; what must hold is the decision.
    if (x.t !== 'eq') assert.ok(mine >= real, `${print(x)}: conservative ${mine} < mathdom ${real}`);
    if (fitsDisplay(x)) assert.ok(real <= DOM_CAP, `${print(x)}: fits by the conservative estimate (${mine}) but mathdom says ${real}`);
  });
  assert.equal(fitsDisplay(F.N('x'), { estimate: () => 9999 }), false, 'a per-call estimate is used');
  assert.equal(fitsDisplay(F.N('x'), { capPx: 10 }), false);
});

test('nodeAtPath agrees with mathdom on every path of random trees', () => {
  forSeeds(3000, (rng) => {
    const x = randomMath(rng, 3);
    for (const { path } of nodesWithPaths(x)) assert.equal(nodeAtPath(x, path), domNodeAtPath(x, path), path);
    for (const bad of ['', 'q', 'e.99', 'l.x', 'e.0.0.0.0.0.0.0']) assert.equal(nodeAtPath(x, bad), domNodeAtPath(x, bad), bad);
  });
});

test('choice builders', () => {
  const base = F.exprItem('4(1/3)', '4/3', ['single-number'], { interaction: 'nextline', constructed: false });
  const wrong = malChoices(base, [malruleById('scalar-times-both-parts'), malruleById('scalar-into-denominator'), malruleById('freshmans-dream-square')]);
  assert.deepEqual(wrong && wrong.map((c) => [print(/** @type {any} */ (c.display)), c.verdict, c.malrule]),
    [['4/12', 'wrong', 'scalar-times-both-parts'], ['1/12', 'wrong', 'scalar-into-denominator']], 'a rule that does not apply is skipped');
  // a distractor that IS the answer rejects the seed: 2x + 6 = 10 solved by the Peeler... as an expression twin: 1 x 2/3
  assert.equal(malChoices(F.exprItem('1(2/3)', '2/3'), [malruleById('scalar-times-both-parts')]), undefined, 'n = 1: the Stacker lands on the key');
  // two rules, one value
  const same = F.exprItem('4(0/3)', '0');
  assert.equal(malChoices(same, [malruleById('scalar-times-both-parts'), malruleById('scalar-into-denominator')]), undefined);

  const cs = shuffledChoices(makeRng('c'), [{ display: F.N('1'), verdict: 'correct' }, { display: F.N('2'), verdict: 'wrong' }, { display: F.N('3'), verdict: 'wrong' }]);
  assert.deepEqual(cs.map((c) => c.id), ['a', 'b', 'c']);
  assert.deepEqual(cs.map((c) => print(/** @type {any} */ (c.display))).sort(), ['1', '2', '3']);
  assert.deepEqual(shuffledChoices(makeRng('c'), cs.map(({ id: _id, ...c }) => c)), shuffledChoices(makeRng('c'), cs.map(({ id: _id, ...c }) => c)));
  assert.throws(() => shuffledChoices(makeRng('c'), Array.from({ length: 7 }, () => ({ display: F.N('1'), verdict: /** @type {const} */ ('wrong') }))));

  const prompt = { verb: 'Same value?', math: F.N('sqrt(9 + 16)'), twin: F.N('sqrt(9) + sqrt(16)') };
  assert.deepEqual(twinChoices(prompt, false, 'sqrt-splits-sum').map((c) => [c.id, c.verdict, c.malrule]),
    [[TWIN_SAME, 'wrong', 'sqrt-splits-sum'], [TWIN_DIFFERENT, 'correct', undefined]]);
  assert.deepEqual(twinChoices(prompt, true).map((c) => [c.id, c.verdict, c.malrule]),
    [[TWIN_SAME, 'correct', undefined], [TWIN_DIFFERENT, 'wrong', 'form-change-changes-value']]);
  assert.throws(() => twinChoices({ verb: 'v', math: F.N('1') }, true));

  const steps = [{ line: F.E('3x + 5 = 11'), legal: true }, { line: F.E('3x = 16'), legal: false }, { line: F.E('x = 16/3'), legal: true }];
  assert.deepEqual(traceChoices(steps).map((c) => [c.id, c.verdict]), [['L1', 'correct'], ['L2', 'wrong'], [TRACE_NONE, 'wrong']]);
  assert.deepEqual(traceChoices(steps.map((s) => ({ ...s, legal: true }))).map((c) => [c.id, c.verdict]), [['L1', 'wrong'], ['L2', 'wrong'], [TRACE_NONE, 'correct']]);

  const math = mul(frac(num(4), num(1)), frac(num(1), num(3))); // built, not parsed: no group nodes in the paths
  const taps = tapTargets(math, ['e.0.0', 'e.0.1', 'e.1.0', 'e.1.1'], 'e.0.1');
  assert.deepEqual(taps.map((c) => [c.id, print(/** @type {any} */ (c.display)), c.verdict]),
    [['e.0.0', '4', 'wrong'], ['e.0.1', '1', 'correct'], ['e.1.0', '1', 'wrong'], ['e.1.1', '3', 'wrong']]);
  assert.throws(() => tapTargets(math, ['e.0.0'], 'e.0.1'));
  assert.throws(() => tapTargets(math, ['e.7'], 'e.7'));
});

test('separated: the generator contract over every registered rule', () => {
  assert.deepEqual(separated(F.exprItem('4(1/3)', '4/3')), { ok: true });
  assert.deepEqual(separated(F.solveItem('x + 5 = 12', ['7'])), { ok: true });
  assert.match(String(separated(F.solveItem('2x + 6 = 10', ['2'])).why), /transpose-coefficient-as-subtract gives the answer/);
  assert.match(String(separated(F.solveItem('2x + 1 = 4', ['3/2'])).why), /transpose-coefficient-as-subtract and divide-one-term give the same result/);
  assert.equal(separated(F.exprItem('sqrt(4)', '2')).ok, false, 'the Halver: 4/2 is 2');
  assert.deepEqual(separated(F.twinItem('sqrt(9 + 16)', 'sqrt(9) + sqrt(16)', false)), { ok: true });
  assert.deepEqual(separated(F.twinItem('6/9', '2/3', true)), { ok: true });
  // "same" on this different pair is explained by two rules at once: 4/2 = 2 is sqrt(4) read as half, and ... only one rule here
  assert.equal(separated(F.twinItem('sqrt(4)', '2', true)).ok, false, 'an equivalent pair that a mal-rule also produces');
});

test('followUp makes the typed item of a tap item; blank() is the fill-the-blank node', () => {
  const twin = F.twinItem('6/9', '2/3', true);
  twin.answer = { kind: 'expr', expected: F.N('2/3'), formPredicates: ['single-number'], assumptions: [] };
  assert.equal(judge(twin, '2/3').verdict, 'unparsed', 'the tap item only takes a choice id');
  const typed = followUp(twin);
  assert.equal(typed.constructed, true);
  assert.equal(typed.choices, undefined);
  assert.equal(judge(typed, '2/3').verdict, 'correct');
  assert.deepEqual(blank(), { t: 'var', name: BLANK });
});

test('displayedTrees and fitsAll', () => {
  const p = F.lineItem('3x + 5 = 11', F.mv('sub', '5'), '3x = 6');
  assert.deepEqual(displayedTrees(p).map((x) => print(x)), ['3x + 5 = 11', '5', '3x = 6']);
  assert.equal(fitsAll(p), true);
  const wide = F.exprItem('1 + 22222222222 + 33333333333 + 44444444444 + 55555555555', '1');
  assert.equal(fitsAll(wide), false);
});
