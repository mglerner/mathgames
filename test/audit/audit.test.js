// @ts-check
// Tests for the sampled content checks of scripts/audit.js (DESIGN.md
// section 11 "audit.js" bullet; section 12 M8: "audit rejects a planted
// negative-radicand generator"). Each failure condition gets a planted bad
// generator: a real generator wrapped so that its items carry the defect,
// next to the unwrapped generator as the clean control.
// Run: node scripts/gen-registry.js && node --test test/audit/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit, auditItems, radicandProblems, loadDeps } from '../../scripts/audit.js';
import { skills } from '../../src/data/skills.js';
import { generators } from '../../src/gen/registry.generated.js';
import { malrules } from '../../src/misc/diagnose.js';
import { parse } from '../../src/math/parse.js';

/** @typedef {import('../../types.d.ts').Generator} Generator */
/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEEDS = 12; // fixture runs only; the CLI default is 300

/** @param {string} id @returns {Generator} */
function real(id) {
  const g = generators.find((x) => x.id === id);
  assert.ok(g, `generator ${id} is not registered (run node scripts/gen-registry.js)`);
  return g;
}
/** @param {string} id @returns {import('../../types.d.ts').MalRule} */
function rule(id) {
  const r = malrules.find((x) => x.id === id);
  assert.ok(r, `mal-rule ${id} is not registered`);
  return r;
}
/** @param {string} s @returns {Node} */
function P(s) {
  const x = parse(s);
  assert.ok(!('error' in x) && x.t !== 'eq', s);
  return /** @type {Node} */ (x);
}

/**
 * A real generator whose items are rewritten by `mutate` (return undefined to keep the item).
 * @param {Generator} base @param {string} id @param {string} skill
 * @param {(p: Problem) => Problem | undefined} mutate
 * @returns {Generator}
 */
function planted(base, id, skill, mutate) {
  return { ...base, id, skill, generate(rng, o) { const p = base.generate(rng, o); return mutate(p) ?? p; } };
}

/** @param {{ failures: string[] }} r @param {RegExp} re */
function failuresMatching(r, re) { return r.failures.filter((f) => re.test(f)); }

test('clean controls: the unwrapped generators pass every sampled check', async () => {
  const gens = [real('sqrt-squared.core'), real('frac-times-whole.core')];
  const r = await auditItems(skills, gens, malrules, { seeds: SEEDS });
  // the rules these two do not separate fail as "no separating generator" here, nothing else may
  const other = r.failures.filter((f) => !/^mal-rule [a-z-]+: no separating generator/.test(f));
  assert.deepEqual(other, []);
  assert.ok(r.items > 0);
});

test('planted negative radicand: audit rejects a generator that shows sqrt(-4)sqrt(-9)', async () => {
  const bad = planted(real('sqrt-squared.core'), 'sqrt-squared.planted', 'sqrt-squared', (p) =>
    (p.interaction === 'strike' ? { ...p, prompt: { ...p.prompt, math: P('sqrt(-4)sqrt(-9)') } } : undefined));
  const r = await auditItems(skills, [bad], malrules, { seeds: SEEDS });
  assert.equal(r.ok, false);
  const hits = failuresMatching(r, /^sqrt-squared\.planted: negative radicand/);
  assert.equal(hits.length, 1, r.failures.join('\n'));
  assert.match(hits[0], /prompt: negative radicand/);
  assert.match(hits[0], /seed "s\d+"/, 'the failure names a replayable seed');
  const clean = await auditItems(skills, [real('sqrt-squared.core')], malrules, { seeds: SEEDS });
  assert.deepEqual(failuresMatching(clean, /negative radicand/), []);
});

test('negative radicands: every place an item can show one, and the >= 0 proof rule', async () => {
  const D = await loadDeps();
  const base = real('sqrt-squared.core').generate(D.makeRng('s0'), { difficulty: 1, interaction: 'strike', fadeLevel: 2 });
  /** @param {Partial<Problem>} over @returns {string[]} */
  const probs = (over) => radicandProblems(/** @type {Problem} */ ({ ...base, ...over }), D);
  const nonneg = [{ name: 'x', rel: /** @type {const} */ ('nonneg') }];
  assert.deepEqual(radicandProblems(base, D), []);
  // places
  assert.match(probs({ prompt: { ...base.prompt, twin: P('sqrt(-2)') } }).join(), /twin: negative/);
  assert.match(probs({ prompt: { ...base.prompt, move: { op: 'mul', operand: P('sqrt(3 - 5)') } } }).join(), /prompt move operand: negative/);
  assert.match(probs({ choices: [{ id: 'a', display: { op: 'div', operand: P('sqrt(-2)') }, verdict: 'wrong' }] }).join(), /choice a operand: negative/);
  assert.match(probs({ choices: [{ id: 'b', display: P('2sqrt(-3)'), verdict: 'wrong' }] }).join(), /choice b: negative/);
  assert.match(probs({ answer: { ...base.answer, expected: P('sqrt(-1)') } }).join(), /answer: negative/);
  assert.match(probs({ steps: [{ line: P('1'), legal: true }, { line: P('sqrt(-7)'), legal: true }] }).join(), /step 1: negative/);
  assert.match(probs({ moveGraph: { distance: 1, minPath: [{ op: 'add', operand: P('sqrt(-5)') }] } }).join(), /moveGraph\[0\] operand: negative/);
  assert.match(probs({ answer: { ...base.answer, kind: 'solution-set', expected: { kind: 'finite', roots: [{ terms: [{ coef: { n: 1n, d: 1n }, rad: -3n }] }] } } }).join(), /answer: root with radicand -3/);
  // rational powers are radicals too
  assert.match(probs({ prompt: { ...base.prompt, math: P('(-8)^(1/2)') } }).join(), /negative radicand/);
  assert.deepEqual(probs({ prompt: { ...base.prompt, math: P('(-8)^2') } }), [], 'an integer power is not a radical');
  // variables: proof that the radicand is >= 0, or a failure
  assert.match(probs({ prompt: { ...base.prompt, math: P('sqrt(x)') } }).join(), /x \(not declared x >= 0\) to an odd power/);
  assert.match(probs({ prompt: { ...base.prompt, math: P('x^(1/2)') } }).join(), /odd power/);
  assert.deepEqual(probs({ prompt: { ...base.prompt, math: P('sqrt(x)') }, assumptions: nonneg }), []);
  assert.deepEqual(probs({ prompt: { ...base.prompt, math: P('sqrt(3x^3)') }, answer: { ...base.answer, assumptions: nonneg } }), [], 'answer.assumptions count too');
  assert.deepEqual(probs({ prompt: { ...base.prompt, math: P('sqrt(x^2)') } }), [], 'x^2 >= 0 for every x');
  assert.match(probs({ prompt: { ...base.prompt, math: P('sqrt(x - 1)') }, assumptions: nonneg }).join(), /negative coefficient/);
  assert.match(probs({ prompt: { ...base.prompt, math: P('sqrt(1/x)') }, assumptions: nonneg }).join(), /not a polynomial/);
  // the fill-the-blank placeholder is checked with the key and each choice in it
  const blank = { t: 'var', name: D.BLANK };
  const rootPair = /** @type {Node} */ ({ t: 'mul', args: [{ t: 'root', index: 2, radicand: blank }, { t: 'root', index: 2, radicand: blank }] });
  const fb = { prompt: { ...base.prompt, math: rootPair }, answer: { ...base.answer, expected: P('13') } };
  assert.deepEqual(probs({ ...fb, choices: [{ id: 'a', display: P('13'), verdict: 'correct' }, { id: 'b', display: P('169'), verdict: 'wrong' }] }), []);
  assert.match(probs({ ...fb, choices: [{ id: 'a', display: P('13'), verdict: 'correct' }, { id: 'b', display: P('-13'), verdict: 'wrong' }] }).join(), /blank filled\): negative radicand/);
});

test('planted unverifiable answer: audit rejects a key the math core cannot check', async () => {
  const bad = planted(real('frac-times-whole.core'), 'frac-times-whole.planted', 'frac-times-whole', (p) => {
    if (p.interaction !== 'strike') return undefined;
    const e = P('sqrt(x + 1)'); // a sum under a radical with an undeclared variable: unverifiable by design
    return { ...p, prompt: { ...p.prompt, math: e }, variableKeys: ['x'], assumptions: [{ name: 'x', rel: 'nonneg' }], answer: { ...p.answer, expected: e, formPredicates: [] } };
  });
  const r = await auditItems(skills, [bad], malrules, { seeds: SEEDS });
  const hits = failuresMatching(r, /^frac-times-whole\.planted: unverifiable or misjudged answer/);
  assert.equal(hits.length, 1, r.failures.join('\n'));
  assert.match(hits[0], /is judged unverifiable/);
});

test('planted mislabelled choice: audit rejects a correct choice the judge does not accept', async () => {
  const bad = planted(real('frac-times-whole.core'), 'frac-times-whole.planted', 'frac-times-whole', (p) => {
    if (p.interaction !== 'nextline' || !p.choices) return undefined;
    // swap the labels: the key is now labelled wrong and a distractor correct
    const wrong = p.choices.find((c) => c.verdict === 'wrong');
    if (!wrong) return undefined;
    return { ...p, choices: p.choices.map((c) => (c.verdict === 'correct' ? { ...c, verdict: /** @type {const} */ ('wrong') } : c === wrong ? { ...c, verdict: /** @type {const} */ ('correct'), malrule: undefined } : c)) };
  });
  const r = await auditItems(skills, [bad], malrules, { seeds: SEEDS });
  const hits = failuresMatching(r, /^frac-times-whole\.planted: unverifiable or misjudged answer/);
  assert.equal(hits.length, 1, r.failures.join('\n'));
  assert.match(hits[0], /choice \w+ is (labelled correct but judged|judged unverifiable)/);
});

test('mal-rule separation: separated, failing, and pending content', async () => {
  const ftw = real('frac-times-whole.core');
  // a clone of a real rule under a new id: a student applying it is tagged with
  // the ORIGINAL id (the registry's), never with the clone alone -> not separated
  const clone = { ...rule('scalar-into-denominator'), id: 'planted-clone' };
  const rules = [rule('scalar-into-denominator'), clone, rule('sqrt-splits-sum')];
  const r = await auditItems(skills, [ftw], rules, { seeds: SEEDS });
  assert.deepEqual(r.failures, ['mal-rule planted-clone: no separating generator (its served skills: frac-times-whole)']);
  assert.deepEqual(r.pending, ['sqrt-splits-sum'], 'its skills have no generator in this fixture: pending, not a failure');
  assert.ok(r.lines.some((l) => /^ +scalar-into-denominator +frac-times-whole\.core$/.test(l)), r.lines.join('\n'));
  assert.equal(r.ok, false);
  // once one of its skills is served by a generator that never shows the bug, it fails
  const fake = planted(ftw, 'sqrt-product-rule.planted', 'sqrt-product-rule', () => undefined);
  const r2 = await auditItems(skills, [ftw, fake], [rule('scalar-into-denominator'), rule('sqrt-splits-sum')], { seeds: SEEDS });
  assert.deepEqual(r2.pending, []);
  assert.deepEqual(failuresMatching(r2, /^mal-rule/), ['mal-rule sqrt-splits-sum: no separating generator (its served skills: sqrt-product-rule)']);
});

test('planted Why with no counting form: audit rejects a skill whose Why is only which-invariant', async () => {
  const base = real('frac-times-whole.core');
  const bad = planted(base, 'frac-times-whole.planted', 'frac-times-whole', (p) =>
    (p.interaction === 'why' ? { ...p, variant: 'which-invariant' } : undefined));
  const r = await auditItems(skills, [bad], [], { seeds: SEEDS });
  assert.deepEqual(failuresMatching(r, /counting Why/), [`skill frac-times-whole: no counting Why form (hidden-1 / hidden-0 / repair) in ${SEEDS} seeds per cell; a which-invariant Why does not count`]);
  const clean = await auditItems(skills, [base], [], { seeds: SEEDS });
  assert.deepEqual(failuresMatching(clean, /counting Why/), []);
});

test('a generator that throws on a cell it offers fails the audit', async () => {
  const base = real('sqrt-squared.core');
  const bad = { ...base, id: 'sqrt-squared.planted', generate: /** @type {Generator['generate']} */ ((rng, o) => {
    if (o.difficulty === 2 && o.interaction === 'twin') throw new Error('rejection sampling gave up');
    return base.generate(rng, o);
  }) };
  const r = await auditItems(skills, [bad], [], { seeds: SEEDS });
  assert.deepEqual(failuresMatching(r, /throws/).map((f) => f.replace(/ \(.*$/, '')), ['sqrt-squared.planted d2 twin: generate() throws']);
});

test('structural audit() no longer claims "not checked yet"', () => {
  assert.ok(!audit(skills, [], [], { allowMissing: true }).lines.some((l) => /not checked/.test(l)));
});

test('audit CLI: runs the sampled checks, exit code matches the verdict', () => {
  const script = join(ROOT, 'scripts', 'audit.js');
  /** @param {string[]} args */
  const run = (args) => {
    try {
      return { out: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' }), status: 0 };
    } catch (/** @type {any} */ e) {
      return { out: String(e.stdout) + String(e.stderr), status: e.status };
    }
  };
  const r = run(['--seeds', '8']);
  assert.match(r.out, /sampled content checks: \d+ items \(8 seeds/);
  assert.match(r.out, /mal-rule separation/);
  assert.doesNotMatch(r.out, /not checked/);
  assert.equal(r.status, /^audit: OK/m.test(r.out) ? 0 : 1, r.out);
  assert.equal(run(['--seeds', '0']).status, 2);
});
