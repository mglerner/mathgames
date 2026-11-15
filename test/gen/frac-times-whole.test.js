// @ts-check
// frac-times-whole: the reference generator test. The property suite is one
// call to runGeneratorSuite(); the rest pins the teacher's example.
// Run: node scripts/gen-registry.js && node --test test/gen/frac-times-whole.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED } from '../../src/gen/mint/frac-times-whole.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnoseJudged } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- an independent path to the key: read the PRINTED prompt and multiply
// with plain BigInt arithmetic. Nothing here touches the generator's
// internals, the AnswerSpec, or src/math.

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }

/**
 * Value of printed text that is a product of whole numbers and fractions:
 * "4(1/3)", "(5/8)(4)", "(4/1)(1/3)", "4/12", "7".
 * @param {string} text @returns {[bigint, bigint]} numerator, denominator in lowest terms
 */
function productValue(text) {
  let n = 1n;
  let d = 1n;
  const factors = text.match(/\d+(?:\/\d+)?/g);
  if (!factors || factors.join('') !== text.replace(/[()]/g, '')) throw new Error(`cannot read ${text}`);
  for (const f of factors) {
    const [x, y] = f.split('/');
    n *= BigInt(x);
    d *= BigInt(y ?? '1');
  }
  const g = gcd(n, d);
  return [n / g, d / g];
}

/** @param {[bigint, bigint]} v */
const show = ([n, d]) => (d === 1n ? `${n}` : `${n}/${d}`);

/** The whole-number factor of the printed prompt. @param {string} text @returns {string} */
function wholeFactor(text) {
  const m = /^(\d+)\(\d+\/\d+\)$/.exec(text) ?? /^\(\d+\/\d+\)\((\d+)\)$/.exec(text);
  if (!m) throw new Error(`cannot find the whole number in ${text}`);
  return m[1];
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const text = print(/** @type {Node} */ (p.prompt.math));
  if (p.interaction === 'why') {
    // "(4/4)(1/3)" or "(5/8)(4/4)": the hidden 1 is the factor with equal numerator and denominator
    const m = /^\((\d+)\/(\d+)\)\((\d+)\/(\d+)\)$/.exec(text);
    if (!m || (m[1] === m[2]) === (m[3] === m[4])) throw new Error(`cannot find the hidden 1 in ${text}`);
    return m[1] === m[2] ? 'e.0' : 'e.1';
  }
  if (p.interaction === 'forge') return `${wholeFactor(text)}/1`;
  if (p.interaction === 'twin') {
    const a = productValue(text);
    const b = productValue(print(/** @type {Node} */ (p.prompt.twin)));
    return a[0] === b[0] && a[1] === b[1] ? show(a) : `${show(a)}, ${show(b)}`;
  }
  return show(productValue(text));
}

runGeneratorSuite(generator, {
  separates: ['scalar-times-both-parts', 'scalar-into-denominator', 'form-change-changes-value'],
  independentKey,
  // The Forge asks for the whole number as a fraction: its key is worth n, not n x a/b.
  reference: (p) => (p.interaction === 'forge' ? { t: 'num', q: { n: BigInt(wholeFactor(print(/** @type {Node} */ (p.prompt.math)))), d: 1n } } : undefined),
  correctForms(p) {
    if (p.interaction !== 'forge') return [];
    const n = BigInt(wholeFactor(print(/** @type {Node} */ (p.prompt.math))));
    return [`${2n * n}/2`]; // 8/2 is also 4 written as a fraction
  },
  notCorrect(p) {
    const text = print(/** @type {Node} */ (p.prompt.math));
    if (p.interaction === 'forge') return [wholeFactor(text), `${wholeFactor(text)}/${wholeFactor(text)}`, `1/${wholeFactor(text)}`];
    if (p.interaction === 'strike') {
      const [n, d] = productValue(text);
      return [text, `${2n * n}/${2n * d}`, `${d}/${n}`]; // not multiplied; not reduced; upside down
    }
    return [];
  },
  minDistinct: 12,
});

test('the teacher example: 4 x 1/3 at d1 from the documented seed', () => {
  for (const interaction of generator.interactions) {
    const p = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction, fadeLevel: 0 });
    const shown = print(/** @type {Node} */ (p.prompt.math));
    if (interaction === 'why') assert.ok(shown === '(4/4)(1/3)' || shown === '(1/3)(4/4)', shown);
    else assert.equal(shown, '4(1/3)', `${interaction}`);
  }
  const strike = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(judge(strike, '4/3').verdict, 'correct');
  assert.equal(judge(strike, '8/6').verdict, 'form'); // same value, not finished: not a miss
  const stacker = judge(strike, '4/12');
  assert.equal(stacker.verdict, 'wrong');
  assert.deepEqual(diagnoseJudged(strike, stacker), { misconceptions: ['scalar-times-both-parts'], ambiguous: false });
  const sinker = judge(strike, '1/12');
  assert.deepEqual(diagnoseJudged(strike, sinker), { misconceptions: ['scalar-into-denominator'], ambiguous: false });
  // 1/3 has the Stacker's value too (section 5: "the answer has the value a/b").
  assert.deepEqual(diagnoseJudged(strike, judge(strike, '1/3')).misconceptions, ['scalar-times-both-parts']);
  const other = judge(strike, '7/3');
  assert.deepEqual(diagnoseJudged(strike, other), { misconceptions: [], ambiguous: false }); // unclassified

  const forge = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'forge', fadeLevel: 0 });
  assert.deepEqual((forge.choices ?? []).map((c) => print(/** @type {Node} */ (c.display))).sort(), ['1/4', '4/1', '4/4']);
  const next = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'nextline', fadeLevel: 0 });
  assert.deepEqual((next.choices ?? []).map((c) => print(/** @type {Node} */ (c.display))).sort(), ['1/12', '4/12', '4/3']);
});
