// @ts-check
// Tests of the generator harness itself (test/gen/harness.js):
//   1. it runs green, through runGeneratorSuite(), on a toy equation
//      generator, so its side-wise, Cast / BFS and Trace paths are exercised
//      on real items;
//   2. it REJECTS sabotaged items: each case breaks one thing in a valid
//      item and expects checkItem() to say so. A harness that cannot fail
//      proves nothing.
// Run: node scripts/gen-registry.js && node --test test/misc/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, checkItem, checkDeterminism, makeRng, print } from '../gen/harness.js';
import ftw from '../../src/gen/mint/frac-times-whole.core.js';
import toy, { isGoal } from './_toy-linear.js';
import * as F from './_fixtures.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Generator} Generator */
/** @typedef {import('../../types.d.ts').Interaction} Interaction */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../gen/harness.js').SuiteOpts} SuiteOpts */

const TOY_OPTS = { isGoal: (/** @type {import('../../types.d.ts').Equation} */ s) => isGoal(s) };

runGeneratorSuite(toy, {
  seeds: 400,
  separates: ['one-sided-operation', 'transpose-no-sign-change', 'transpose-coefficient-as-subtract', 'divide-one-term'],
  ...TOY_OPTS,
});

// ---- a plain-arithmetic key for the frac-times-whole items used below

/** Value of printed products of whole numbers and fractions ("4(1/3)", "(5/8)(4/1)", "4/12"). @param {string} text @returns {string} */
function value(text) {
  let n = 1n; let d = 1n;
  for (const f of text.match(/\d+(?:\/\d+)?/g) ?? []) { const [x, y] = f.split('/'); n *= BigInt(x); d *= BigInt(y ?? '1'); }
  let g = n; let h = d;
  while (h) [g, h] = [h, g % h];
  return d / g === 1n ? `${n / g}` : `${n / g}/${d / g}`;
}
/** @param {Problem} p */
const whole = (p) => /** @type {RegExpExecArray} */ (/^(\d+)\(/.exec(print(/** @type {Node} */ (p.prompt.math))))[1];

/** @param {Problem} p @returns {string | undefined} */
function ftwKey(p) {
  const text = print(/** @type {Node} */ (p.prompt.math));
  if (p.interaction === 'why') {
    // the hidden 1 is the factor (k/k) of the shown product
    const w = /^\((\d+)\/(\d+)\)/.exec(text);
    return w && w[1] === w[2] ? 'e.0' : 'e.1';
  }
  if (p.interaction === 'forge') return `${whole(p)}/1`;
  if (p.interaction === 'twin') {
    const a = value(text);
    const b = value(print(/** @type {Node} */ (p.prompt.twin)));
    return a === b ? a : `${a}, ${b}`;
  }
  return value(text);
}
/** @type {SuiteOpts} */
const FTW_OPTS = {
  independentKey: ftwKey,
  reference: (p) => (p.interaction === 'forge' ? F.N(whole(p)) : undefined),
};

/**
 * @param {Generator} gen @param {Interaction} interaction @param {number} fadeLevel
 * @param {string} [seed] @param {number} [difficulty]
 */
function make(gen, interaction, fadeLevel, seed = 's7', difficulty = 1) {
  const o = { difficulty, interaction, fadeLevel };
  return { o, seed, p: structuredClone(gen.generate(makeRng(seed), o)) };
}

/**
 * Break a valid item and expect the harness to object.
 * @param {Generator} gen @param {SuiteOpts} opts @param {Interaction} interaction @param {number} fade
 * @param {(p: Problem) => void} sabotage @param {RegExp} re
 * @param {string} [seed] @param {number} [difficulty]
 */
function rejects(gen, opts, interaction, fade, sabotage, re, seed, difficulty) {
  const { o, seed: s, p } = make(gen, interaction, fade, seed, difficulty);
  assert.doesNotThrow(() => checkItem(gen, p, o, s, opts), 'the untouched item must pass');
  sabotage(p);
  assert.throws(() => checkItem(gen, p, o, s, opts), re);
}

test('selftest: untouched items pass, for every interaction of both generators', () => {
  for (const i of ftw.interactions) { const { o, seed, p } = make(ftw, i, 0); checkItem(ftw, p, o, seed, FTW_OPTS); }
  for (const i of toy.interactions) { const { o, seed, p } = make(toy, i, 0); checkItem(toy, p, o, seed, TOY_OPTS); }
});

test('selftest: a wrong answer key is caught', () => {
  rejects(ftw, FTW_OPTS, 'strike', 3, (p) => { p.answer.expected = F.N('7/2'); }, /does not have the value/);
  rejects(toy, TOY_OPTS, 'strike', 3, (p) => { p.answer.expected = { kind: 'finite', roots: [F.evalConst('11')] }; }, /does not satisfy the equation/);
  rejects(toy, TOY_OPTS, 'strike', 3, (p) => { p.answer.expected = { kind: 'none' }; }, /solve\.js disagrees/);
  rejects(toy, TOY_OPTS, 'predict', 3, (p) => { p.answer.expected = F.E('x = 2'); }, /not the stated move/);
});

test('selftest: a key the judge would not accept as finished is caught', () => {
  // 6 x 1/10 keyed as 6/10 with 'lowest-terms': the key itself is judged "form"
  rejects(ftw, FTW_OPTS, 'strike', 3, (p) => {
    const text = print(/** @type {Node} */ (p.prompt.math));
    const m = /^(\d+)\((\d+)\/(\d+)\)$/.exec(text);
    assert.ok(m);
    p.answer.expected = F.N(`${BigInt(m[1]) * BigInt(m[2])}/${m[3]}`);
  }, /judged form/, 's1', 3);
  rejects(ftw, FTW_OPTS, 'strike', 3, (p) => { p.answer.formPredicates = ['no-such-form']; }, /invalid AnswerSpec/);
});

test('selftest: no independent path to the key is a failure', () => {
  const { o, seed, p } = make(ftw, 'strike', 3);
  assert.throws(() => checkItem(ftw, p, o, seed, {}), /no independent path/);
  const why = make(ftw, 'why', 0);
  assert.throws(() => checkItem(ftw, why.p, why.o, why.seed, {}), /no independent path/);
  assert.throws(() => checkItem(ftw, p, o, seed, { independentKey: () => '99/7' }), /independentKey gave "99\/7", judged wrong/);
});

test('selftest: bad choices are caught', () => {
  /** @param {Problem} p @param {string} verdict */
  const pick = (p, verdict) => { const c = (p.choices ?? []).find((x) => x.verdict === verdict); assert.ok(c); return c; };
  /** @param {Problem} p @param {string} tag */
  const tagged = (p, tag) => { const c = (p.choices ?? []).find((x) => x.malrule === tag); assert.ok(c); return c; };
  // labels swapped
  rejects(ftw, FTW_OPTS, 'nextline', 0, (p) => { const a = pick(p, 'correct'); const b = tagged(p, 'scalar-times-both-parts'); a.verdict = 'wrong'; b.verdict = 'correct'; delete b.malrule; }, /judged unverifiable|label disagrees/);
  // tags swapped
  rejects(ftw, FTW_OPTS, 'nextline', 0, (p) => { const a = tagged(p, 'scalar-times-both-parts'); const b = tagged(p, 'scalar-into-denominator'); a.malrule = 'scalar-into-denominator'; b.malrule = 'scalar-times-both-parts'; }, /tag honesty/);
  // an unknown tag
  rejects(ftw, FTW_OPTS, 'nextline', 0, (p) => { tagged(p, 'scalar-times-both-parts').malrule = 'the-gremlin'; }, /unknown mal-rule/);
  // a tag removed
  rejects(ftw, FTW_OPTS, 'nextline', 0, (p) => { delete tagged(p, 'scalar-times-both-parts').malrule; }, /has no tag but is the output of/);
  // a made-up distractor (not a mal-rule output)
  rejects(ftw, FTW_OPTS, 'nextline', 0, (p) => { const c = tagged(p, 'scalar-into-denominator'); c.display = F.N('99/7'); delete c.malrule; }, /distractors are only mal-rule outputs/);
  // a made-up distractor that keeps a tag
  rejects(ftw, FTW_OPTS, 'nextline', 0, (p) => { tagged(p, 'scalar-into-denominator').display = F.N('99/7'); }, /tag honesty/);
  // two distractors with the same value (the Sinker's slot holds the Stacker's value again)
  rejects(ftw, FTW_OPTS, 'nextline', 0, (p) => {
    const a = tagged(p, 'scalar-times-both-parts');
    const b = tagged(p, 'scalar-into-denominator');
    b.display = structuredClone(a.display); b.malrule = a.malrule;
  }, /not provably different/);
  // a "wrong" choice that is in fact the answer
  rejects(ftw, FTW_OPTS, 'nextline', 0, (p) => { const k = pick(p, 'correct'); tagged(p, 'scalar-into-denominator').display = structuredClone(k.display); }, /judged unverifiable|label disagrees/);
  // two correct choices
  rejects(ftw, FTW_OPTS, 'forge', 0, (p) => { for (const c of p.choices ?? []) { c.verdict = 'correct'; delete c.malrule; } }, /exactly one choice must be correct/);
  // duplicate ids
  rejects(ftw, FTW_OPTS, 'forge', 0, (p) => { for (const c of p.choices ?? []) c.id = 'a'; }, /ids are not unique/);
});

test('selftest: a mislabelled Twin and a wrong Why target are caught', () => {
  rejects(ftw, FTW_OPTS, 'twin', 0, (p) => { for (const c of p.choices ?? []) c.verdict = c.verdict === 'correct' ? 'wrong' : 'correct'; }, /Twin label says/);
  rejects(ftw, FTW_OPTS, 'why', 0, (p) => {
    const cs = p.choices ?? [];
    const other = cs.find((c) => c.verdict !== 'correct');
    assert.ok(other);
    for (const c of cs) c.verdict = 'wrong';
    other.verdict = 'correct';
  }, /is not worth 1|independentKey names target/);
  rejects(ftw, FTW_OPTS, 'why', 0, (p) => { (p.choices ?? [])[0].display = F.N('77'); }, /not the sub-expression at that data-path/);
  rejects(ftw, FTW_OPTS, 'why', 0, (p) => { delete p.variant; }, /a Why needs variant/);
});

test('selftest: bookkeeping errors are caught', () => {
  rejects(ftw, FTW_OPTS, 'strike', 3, (p) => { p.constructed = false; }, /constructed is false/);
  rejects(ftw, FTW_OPTS, 'strike', 3, (p) => { p.seed = 'other'; }, /problem\.seed/);
  rejects(ftw, FTW_OPTS, 'strike', 3, (p) => { p.visuals = ['numberline']; }, /symbol-only/);
  rejects(ftw, FTW_OPTS, 'strike', 0, (p) => { p.visuals = ['hologram']; }, /unknown visual/);
  rejects(ftw, FTW_OPTS, 'strike', 3, (p) => { p.skill = 'distribute'; }, /do not match the generator/);
  rejects(toy, TOY_OPTS, 'strike', 3, (p) => { p.probes = [{ x: { n: 0n, d: 1n } }]; }, /outside the section 3 set/);
  rejects(toy, TOY_OPTS, 'strike', 3, (p) => { p.probes = [{ x: { n: 1n, d: 1n } }]; }, /outside the section 3 set/);
  rejects(toy, TOY_OPTS, 'strike', 3, (p) => { p.variableKeys = []; }, /one variable/);
  rejects(ftw, FTW_OPTS, 'strike', 3, (p) => { p.prompt.verb = 'Multiply \u00d7'; }, /plain ASCII/);
});

test('selftest: display problems are caught', () => {
  rejects(ftw, FTW_OPTS, 'predict', 0, (p) => { (p.steps ?? [])[1].line = F.N('1 + 22222222222 + 33333333333 + 44444444444 + 55555555555 + 66666666666 + 77777777777'); }, /does not fit|not equivalent/);
  rejects(ftw, FTW_OPTS, 'predict', 0, (p) => { (p.steps ?? [])[1].line = F.N('sqrt(-4)'); }, /radicand/);
});

test('selftest: a broken worked chain is caught', () => {
  rejects(ftw, FTW_OPTS, 'predict', 0, (p) => { (p.steps ?? [])[2].line = F.N('5/7'); }, /marked legal but is not equivalent/);
  rejects(ftw, FTW_OPTS, 'predict', 0, (p) => { (p.steps ?? [])[2].legal = false; }, /planted bad line but changes nothing/);
  // toy Trace: seed chosen per case below
  /** @param {boolean} wantBad */
  const traceSeed = (wantBad) => {
    for (let i = 0; i < 200; i++) {
      const p = toy.generate(makeRng(`t${i}`), { difficulty: 1, interaction: 'trace', fadeLevel: 0 });
      if ((p.steps ?? []).some((s) => !s.legal) === wantBad) return `t${i}`;
    }
    throw new Error('no such trace seed');
  };
  rejects(toy, TOY_OPTS, 'trace', 0, (p) => { for (const s of p.steps ?? []) s.legal = true; }, /Trace marks|marked legal but is not equivalent/, traceSeed(true));
  rejects(toy, TOY_OPTS, 'trace', 0, (p) => { for (const c of p.choices ?? []) c.verdict = c.id === 'L2' ? 'correct' : 'wrong'; }, /Trace marks/, traceSeed(true));
  rejects(toy, TOY_OPTS, 'trace', 0, (p) => { (p.steps ?? [])[1].line = F.E('x = 2'); }, /not its stated move/, traceSeed(false));
  rejects(toy, TOY_OPTS, 'trace', 0, (p) => { const s = (p.steps ?? [])[2]; s.legal = false; for (const c of p.choices ?? []) c.verdict = c.id === 'L2' ? 'correct' : 'wrong'; }, /planted bad line but changes nothing/, traceSeed(false));
});

test('selftest: Cast mislabels and a bad move graph are caught', () => {
  /** @param {Problem} p @param {string} verdict */
  const chip = (p, verdict) => { const c = (p.choices ?? []).find((x) => x.verdict === verdict); assert.ok(c, verdict); return c; };
  rejects(toy, TOY_OPTS, 'cast', 0, (p) => { chip(p, 'legal-idle').verdict = 'progress'; }, /judged unverifiable|labelled progress/);
  rejects(toy, TOY_OPTS, 'cast', 0, (p) => { chip(p, 'risky').verdict = 'legal-idle'; }, /judged unverifiable|classify\(\) says risky/);
  rejects(toy, TOY_OPTS, 'cast', 0, (p) => { chip(p, 'illegal').verdict = 'risky'; }, /judged unverifiable|classify\(\) says illegal/);
  rejects(toy, TOY_OPTS, 'cast', 0, (p) => { chip(p, 'progress').distance = 0; }, /a fresh search gives/);
  rejects(toy, TOY_OPTS, 'cast', 0, (p) => { if (p.moveGraph) p.moveGraph.distance += 1; }, /moveGraph\.distance|judged unverifiable/);
  rejects(toy, TOY_OPTS, 'cast', 0, (p) => { if (p.moveGraph) p.moveGraph.minPath = [p.moveGraph.minPath[0], p.moveGraph.minPath[0]]; }, /does not reach the goal|is not legal/);
  const { o, seed, p } = make(toy, 'cast', 0);
  assert.throws(() => checkItem(toy, p, o, seed, {}), /need opts\.isGoal/);
});

test('selftest: side-wise judging is really checked', () => {
  // An item whose key IS the original line would accept a retyped line.
  const { o, seed, p } = make(toy, 'predict', 3);
  p.answer.expected = structuredClone(/** @type {import('../../types.d.ts').Equation} */ (p.prompt.math));
  assert.throws(() => checkItem(toy, p, o, seed, TOY_OPTS), /not the stated move|retyping the original line/);
});

test('selftest: a mal-rule that lands on the key (2x + 6 = 10, the Peeler) fails separation', () => {
  const { o, seed, p } = make(toy, 'strike', 3);
  p.prompt.math = F.E('2x + 6 = 10');
  p.answer.expected = { kind: 'finite', roots: [F.evalConst('2')] };
  assert.throws(() => checkItem(toy, p, o, seed, TOY_OPTS), /the correct answer is tagged transpose-coefficient-as-subtract|transpose-coefficient-as-subtract gives the answer/);
});

test('selftest: two mal-rules with one output (2x + 1 = 4) fail separation', () => {
  const { o, seed, p } = make(toy, 'strike', 3);
  p.prompt.math = F.E('2x + 1 = 4');
  p.answer.expected = { kind: 'finite', roots: [F.evalConst('3/2')] };
  assert.throws(() => checkItem(toy, p, o, seed, TOY_OPTS), /mal-rule separation: transpose-coefficient-as-subtract and divide-one-term give the same result/);
});

test('selftest: a generator that is not deterministic is caught', () => {
  let calls = 0;
  /** @type {Generator} */
  const flaky = { ...ftw, generate: (rng, o) => ftw.generate(makeRng(`${rng.seed}/${calls++}`), o) };
  assert.throws(() => checkDeterminism(flaky, { difficulty: 2, interaction: 'strike', fadeLevel: 0 }, 's1'), /not deterministic/);
  assert.doesNotThrow(() => checkDeterminism(ftw, { difficulty: 2, interaction: 'strike', fadeLevel: 0 }, 's1'));
});
