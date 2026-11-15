// @ts-check
// frac-equivalence: the property suite, plus the documented example seed.
// Run: node scripts/gen-registry.js && node --test test/gen/frac-equivalence.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED } from '../../src/gen/mint/frac-equivalence.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnoseJudged } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- independent path: read the PRINTED prompt and goal, plain BigInt arithmetic.

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }

/** Numerator and denominator products of "3/4", "(3/4)(5/5)", unreduced. @param {string} text @returns {[bigint, bigint]} */
function productRaw(text) {
  const factors = text.match(/\d+(?:\/\d+)?/g);
  if (!factors || factors.join('') !== text.replace(/[()]/g, '')) throw new Error(`cannot read ${text}`);
  let n = 1n;
  let d = 1n;
  for (const f of factors) { const [x, y] = f.split('/'); n *= BigInt(x); d *= BigInt(y ?? '1'); }
  return [n, d];
}
/** @param {[bigint, bigint]} v @returns {[bigint, bigint]} */
const reduce = ([n, d]) => { const g = gcd(n, d); return [n / g, d / g]; };
/** @param {[bigint, bigint]} v */
const show = ([n, d]) => (d === 1n ? `${n}` : `${n}/${d}`);
/** @param {Problem} p */
const text = (p) => print(/** @type {Node} */ (p.prompt.math));
/** The denominator the goal asks for. @param {Problem} p @returns {bigint} */
function goalDen(p) {
  const m = /denominator (\d+)/.exec(p.prompt.goal ?? '');
  if (!m) throw new Error(`no denominator in goal ${p.prompt.goal}`);
  return BigInt(m[1]);
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const t = text(p);
  switch (p.interaction) {
    case 'why': {
      const m = /^\((\d+)\/(\d+)\)\((\d+)\/(\d+)\)$/.exec(t);
      if (!m) throw new Error(`cannot read ${t}`);
      const first = m[1] === m[2];
      const second = m[3] === m[4];
      if (first === second) throw new Error(`no single coin in ${t}`);
      return first ? 'e.0' : 'e.1';
    }
    case 'forge': {
      const [, b] = productRaw(t);
      const D = goalDen(p);
      if (D % b !== 0n) throw new Error('goal denominator is not a multiple');
      return `${D / b}/${D / b}`;
    }
    case 'predict': return show(productRaw(t));
    case 'strike': {
      if (/lowest/.test(p.prompt.goal ?? '')) return show(reduce(productRaw(t)));
      const [a, b] = productRaw(t);
      const D = goalDen(p);
      return `${(a * D) / b}/${D}`;
    }
    case 'twin': {
      const [a, b] = productRaw(t);
      const [c, d] = productRaw(print(/** @type {Node} */ (p.prompt.twin)));
      // Same (cross products agree): the coin that turns a/b into c/d. Different: both values.
      if (a * d === b * c) return `${d / b}/${d / b}`;
      return `${show(reduce([a, b]))}, ${show(reduce([c, d]))}`;
    }
    default: return undefined;
  }
}

runGeneratorSuite(generator, {
  separates: ['one-part-coin', 'form-change-changes-value'],
  independentKey,
  correctForms(p) {
    if (p.interaction !== 'forge') return [];
    const [, b] = productRaw(text(p));
    const k = goalDen(p) / b;
    return [`(${k})/(${k})`, `${k}/(${k})`];
  },
  notCorrect(p) {
    const t = text(p);
    if (p.interaction === 'forge') {
      const [, b] = productRaw(t);
      const k = goalDen(p) / b;
      return [`${k}/1`, `1/${k}`, `${k + 1n}/${k + 1n}`, `${k}`];
    }
    if (p.interaction === 'predict' || (p.interaction === 'strike' && !/lowest/.test(p.prompt.goal ?? ''))) {
      const [a, b] = reduce(productRaw(t));
      return [`${a}/${b}`]; // the value, but not with the asked denominator
    }
    if (p.interaction === 'strike') {
      const [n, d] = productRaw(t);
      return [`${n}/${d}`, `${d}/${n}`];
    }
    return [];
  },
  minDistinct: 12,
});

test('documented seed: 3/4 = 15/20 at d1', () => {
  const forge = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'forge', fadeLevel: 0 });
  assert.equal(print(/** @type {Node} */ (forge.prompt.math)), '3/4');
  assert.equal(forge.prompt.goal, 'Make the denominator 20.');
  assert.deepEqual((forge.choices ?? []).map((c) => print(/** @type {Node} */ (c.display))).sort(), ['1/5', '5/1', '5/5', '9/9']);
  const predict = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'predict', fadeLevel: 2 });
  assert.equal(print(/** @type {Node} */ (predict.prompt.math)), '(3/4)(5/5)');
  assert.equal(judge(predict, '15/20').verdict, 'correct');
  assert.equal(judge(predict, '3/4').verdict, 'form'); // same value, not finished
  const num = judge(predict, '15/4');
  assert.deepEqual(diagnoseJudged(predict, num), { misconceptions: ['one-part-coin'], ambiguous: false });
  const den = judge(predict, '3/20');
  assert.deepEqual(diagnoseJudged(predict, den), { misconceptions: ['one-part-coin'], ambiguous: false });
});
