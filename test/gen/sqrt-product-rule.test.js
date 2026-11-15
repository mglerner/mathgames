// @ts-check
// sqrt-product-rule: the property suite (one runGeneratorSuite() call) and
// the documented seeds for the two named Twin pairs (section 3 I5).
// Run: node scripts/gen-registry.js && node --test test/gen/sqrt-product-rule.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { PRODUCT_SEED, SUM_SEED } from '../../src/gen/stacks-roots/sqrt-product-rule.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnose, diagnoseJudged } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- an independent path to the key: read the PRINTED forms with regular
// expressions and compute with plain BigInt arithmetic, taking each square
// root of a whole number by search (it must be exact). Nothing here touches
// the generator's internals, the AnswerSpec, or src/math.

/** The whole square root of N, or an error. @param {bigint} N */
function root(N) {
  let s = 0n;
  while ((s + 1n) * (s + 1n) <= N) s++;
  if (s * s !== N) throw new Error(`sqrt(${N}) is not whole`);
  return s;
}

/** Value of a printed form with a whole value. @param {string} text @returns {bigint} */
function formValue(text) {
  /** @type {RegExpExecArray | null} */
  let m;
  if ((m = /^(\d+)$/.exec(text))) return BigInt(m[1]);
  if ((m = /^sqrt\((\d+)\)$/.exec(text))) return root(BigInt(m[1]));
  if ((m = /^sqrt\((\d+)\((\d+)\)\)$/.exec(text))) return root(BigInt(m[1]) * BigInt(m[2]));
  if ((m = /^sqrt\((\d+) \+ (\d+)\)$/.exec(text))) return root(BigInt(m[1]) + BigInt(m[2]));
  if ((m = /^(\d+)sqrt\((\d+)\)$/.exec(text))) return BigInt(m[1]) * root(BigInt(m[2]));
  if ((m = /^sqrt\((\d+)\)sqrt\((\d+)\)$/.exec(text))) return root(BigInt(m[1])) * root(BigInt(m[2]));
  if ((m = /^sqrt\((\d+)\) \+ sqrt\((\d+)\)$/.exec(text))) return root(BigInt(m[1])) + root(BigInt(m[2]));
  throw new Error(`cannot read ${text}`);
}

/** A printed form's value as keypad text; also "n/2" (the Halver's a b / 2). @param {string} text */
function valueText(text) {
  const m = /^(\d+)\/(\d+)$/.exec(text);
  if (!m) return `${formValue(text)}`;
  const [n, d] = [BigInt(m[1]), BigInt(m[2])];
  if (d !== 2n || n % 2n === 0n) throw new Error(`unexpected fraction ${text}`);
  return text;
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const text = print(/** @type {Node} */ (p.prompt.math));
  if (p.interaction === 'why') {
    // "(7/2)(sqrt(4(9))/(sqrt(4)sqrt(9)))" or the factors swapped: two fractions; the hidden 1 is
    // the one whose two parts have one value (the other is c/e with c != e)
    const ONE = String.raw`\((sqrt\(\d+\(\d+\)\))\/\((sqrt\(\d+\)sqrt\(\d+\))\)\)`;
    const NUM = String.raw`\((\d+)\/(\d+)\)`;
    const first = new RegExp(`^${ONE}${NUM}$`).exec(text);
    const last = new RegExp(`^${NUM}${ONE}$`).exec(text);
    if (first && first[3] !== first[4] && formValue(first[1]) === formValue(first[2])) return 'e.0';
    if (last && last[1] !== last[2] && formValue(last[3]) === formValue(last[4])) return 'e.1';
    throw new Error(`cannot find the hidden 1 in ${text}`);
  }
  if (p.interaction === 'twin') {
    const a = valueText(text);
    const b = valueText(print(/** @type {Node} */ (p.prompt.twin)));
    return a === b ? a : `${a}, ${b}`;
  }
  return `${formValue(text)}`;
}

runGeneratorSuite(generator, {
  separates: ['sqrt-splits-sum', 'sqrt-product-misapplied', 'half-power-is-half', 'form-change-changes-value'],
  independentKey,
  notCorrect(p) {
    if (p.interaction !== 'strike') return [];
    const text = print(/** @type {Node} */ (p.prompt.math));
    const v = formValue(text);
    return [text, `sqrt(${v * v})`, `${v + 1n}`]; // not done; a root left; off by one
  },
  minDistinct: 12,
});

test('documented seeds: the two named Twin pairs (section 3 I5)', () => {
  const prod = generator.generate(makeRng(PRODUCT_SEED), { difficulty: 1, interaction: 'twin', fadeLevel: 0 });
  assert.equal(print(/** @type {Node} */ (prod.prompt.math)), 'sqrt(4(9))');
  assert.equal(print(/** @type {Node} */ (prod.prompt.twin)), 'sqrt(4)sqrt(9)');
  assert.equal((prod.choices ?? []).find((c) => c.id === 'same')?.verdict, 'correct');
  assert.deepEqual(diagnose(prod, 'different').misconceptions, ['form-change-changes-value']);
  const prodStrike = generator.generate(makeRng(PRODUCT_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(/** @type {Node} */ (prodStrike.prompt.math)), 'sqrt(4(9))');
  assert.equal(judge(prodStrike, '6').verdict, 'correct');
  assert.deepEqual(diagnoseJudged(prodStrike, judge(prodStrike, '18')), { misconceptions: ['half-power-is-half'], ambiguous: false });

  const sum = generator.generate(makeRng(SUM_SEED), { difficulty: 1, interaction: 'twin', fadeLevel: 0 });
  assert.equal(print(/** @type {Node} */ (sum.prompt.math)), 'sqrt(9 + 16)');
  assert.equal(print(/** @type {Node} */ (sum.prompt.twin)), 'sqrt(9) + sqrt(16)');
  assert.equal((sum.choices ?? []).find((c) => c.id === 'different')?.verdict, 'correct');
  assert.deepEqual(diagnose(sum, 'same'), { misconceptions: ['sqrt-splits-sum'], ambiguous: false });
  assert.deepEqual(/** @type {Node[]} */ (sum.answer.expected).map((n) => print(n)), ['5', '7']); // the follow-up types both values
  const sumStrike = generator.generate(makeRng(SUM_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(/** @type {Node} */ (sumStrike.prompt.math)), 'sqrt(9 + 16)');
  assert.equal(judge(sumStrike, '5').verdict, 'correct');
  assert.deepEqual(diagnoseJudged(sumStrike, judge(sumStrike, '7')), { misconceptions: ['sqrt-splits-sum'], ambiguous: false });
});
