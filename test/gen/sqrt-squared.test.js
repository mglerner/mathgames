// @ts-check
// sqrt-squared: the property suite (one runGeneratorSuite() call) and the
// documented seeds. Run: node scripts/gen-registry.js && node --test test/gen/sqrt-squared.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED, FORGE_SEED } from '../../src/gen/stacks-roots/sqrt-squared.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnoseJudged } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- an independent path to the key: read the PRINTED prompt with regular
// expressions and plain BigInt arithmetic. Nothing here touches the
// generator's internals, the AnswerSpec, or src/math.

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }

/**
 * Value of a printed form: "5", "25/4", "sqrt(5)sqrt(5)", "sqrt(5)^2".
 * sqrt(n) x sqrt(n) is n BY DEFINITION of the square root (the number whose
 * square is n), which is the one fact this path uses.
 * @param {string} text @returns {[bigint, bigint]}
 */
function formValue(text) {
  let m = /^(\d+)(?:\/(\d+))?$/.exec(text);
  if (m) { const n = BigInt(m[1]); const d = BigInt(m[2] ?? '1'); const g = gcd(n, d); return [n / g, d / g]; }
  m = /^sqrt\((\d+)\)sqrt\((\d+)\)$/.exec(text);
  if (m && m[1] === m[2]) return [BigInt(m[1]), 1n];
  m = /^sqrt\((\d+)\)\^2$/.exec(text);
  if (m) return [BigInt(m[1]), 1n];
  throw new Error(`cannot read ${text}`);
}

/** @param {[bigint, bigint]} v */
const show = ([n, d]) => (d === 1n ? `${n}` : `${n}/${d}`);

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const text = print(/** @type {Node} */ (p.prompt.math));
  if (p.interaction === 'why') {
    // "(7/2)(sqrt(5)sqrt(5)/5)" or the factors swapped: two fractions; the hidden 1 is the root
    // form over its own radicand (the other is k/e with k != e)
    const ONE = String.raw`\((sqrt\((\d+)\)(?:sqrt\(\d+\)|\^2))\/(\d+)\)`;
    const NUM = String.raw`\((\d+)\/(\d+)\)`;
    const first = new RegExp(`^${ONE}${NUM}$`).exec(text);
    const last = new RegExp(`^${NUM}${ONE}$`).exec(text);
    const same = (/** @type {string} */ form, /** @type {string} */ n, /** @type {string} */ den) => n === den && (form === `sqrt(${n})sqrt(${n})` || form === `sqrt(${n})^2`);
    if (first && first[4] !== first[5] && same(first[1], first[2], first[3])) return 'e.0';
    if (last && last[1] !== last[2] && same(last[3], last[4], last[5])) return 'e.1';
    throw new Error(`cannot find the hidden 1 in ${text}`);
  }
  if (p.interaction === 'forge') {
    const m = /^sqrt\(_\)(?:sqrt\(_\)|\^2) = (\d+)$/.exec(text);
    if (!m) throw new Error(`cannot read the forge ${text}`);
    return m[1]; // sqrt(n) x sqrt(n) = n: the radicand is the right side
  }
  if (p.interaction === 'twin') {
    const a = formValue(text);
    const b = formValue(print(/** @type {Node} */ (p.prompt.twin)));
    return a[0] === b[0] && a[1] === b[1] ? show(a) : `${show(a)}, ${show(b)}`;
  }
  return show(formValue(text));
}

/** The radicand n of the prompt (any interaction). @param {Problem} p */
function radicand(p) {
  const m = /sqrt\((\d+)\)/.exec(print(/** @type {Node} */ (p.prompt.math)));
  if (m) return BigInt(m[1]);
  return BigInt(/** @type {RegExpExecArray} */ (/= (\d+)$/.exec(print(/** @type {Node} */ (p.prompt.math))))[1]);
}

runGeneratorSuite(generator, {
  separates: ['root-square-overshoot', 'half-power-is-half', 'form-change-changes-value'],
  independentKey,
  // The Forge asks for the radicand: its key is worth n, read from the right side.
  reference: (p) => (p.interaction === 'forge' ? { t: 'num', q: { n: radicand(p), d: 1n } } : undefined),
  notCorrect(p) {
    const n = radicand(p);
    const text = print(/** @type {Node} */ (p.prompt.math));
    if (p.interaction === 'forge') return [`${n * n}`, `sqrt(${n})`, `${2n * n}`];
    if (p.interaction === 'strike') return [text, `${n * n}`, `sqrt(${n * n})`, `${n}/2`]; // not done; Overshoot; a root left; half
    if (p.interaction === 'predict') return [text, `${n * n}`, `sqrt(${n * n})`];
    return [];
  },
  minDistinct: 10,
});

test('documented seeds: sqrt(3) x sqrt(3), and the named Forge sqrt(?) x sqrt(?) = 5', () => {
  for (const interaction of generator.interactions) {
    const p = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction, fadeLevel: 0 });
    const shown = interaction === 'why' ? /^(\(\d\/\d\)\(sqrt\(3\)sqrt\(3\)\/3\)|\(sqrt\(3\)sqrt\(3\)\/3\)\(\d\/\d\))$/ : interaction === 'forge' ? /^sqrt\(_\)sqrt\(_\) = 3$/ : /^sqrt\(3\)sqrt\(3\)$/;
    assert.match(print(/** @type {Node} */ (p.prompt.math)), shown, interaction);
  }
  const strike = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(judge(strike, '3').verdict, 'correct');
  assert.equal(judge(strike, 'sqrt(9)').verdict, 'form'); // same value, not finished
  const over = judge(strike, '9');
  assert.equal(over.verdict, 'wrong');
  assert.deepEqual(diagnoseJudged(strike, over), { misconceptions: ['root-square-overshoot'], ambiguous: false });
  assert.deepEqual(diagnoseJudged(strike, judge(strike, '9/4')), { misconceptions: ['half-power-is-half'], ambiguous: false });
  assert.deepEqual(diagnoseJudged(strike, judge(strike, '6')), { misconceptions: [], ambiguous: false }); // unclassified

  const forge = generator.generate(makeRng(FORGE_SEED), { difficulty: 1, interaction: 'forge', fadeLevel: 0 });
  assert.equal(print(/** @type {Node} */ (forge.prompt.math)), 'sqrt(_)sqrt(_) = 5');
  assert.deepEqual((forge.choices ?? []).map((c) => `${print(/** @type {Node} */ (c.display))}:${c.verdict}`).sort(), ['25:wrong', '5:correct', 'sqrt(5):wrong']);
  const typed = generator.generate(makeRng(FORGE_SEED), { difficulty: 1, interaction: 'forge', fadeLevel: 2 });
  assert.equal(judge(typed, '5').verdict, 'correct');
  assert.equal(judge(typed, '25').verdict, 'wrong');
});
