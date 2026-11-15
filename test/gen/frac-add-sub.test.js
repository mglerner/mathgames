// @ts-check
// frac-add-sub: the property suite, plus the documented example.
// Run: node --test test/gen/frac-add-sub.test.js
// (scripts/gen-registry.js only matters if the mal-rule registry is stale.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED } from '../../src/gen/mint/frac-add-sub.core.js';
import { judge } from '../../src/check/judge.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- an independent path to the key: read the PRINTED prompt and compute
// with plain BigInt rationals. Nothing here touches the generator's
// internals, the AnswerSpec, or src/math.

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
/** @param {bigint} n @param {bigint} d @returns {[bigint, bigint]} */
function R(n, d) { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; }
/** @param {[bigint, bigint]} v */
const show = ([n, d]) => (d === 1n ? `${n}` : `${n}/${d}`);

/**
 * A sum of signed fraction terms, each a/b or (a/b)(c/d): "1/4 + 5/6",
 * "(1/4)(3/3) + 10/12", "3/4 - 1/6 + 2/3".
 * @param {string} text @returns {[bigint, bigint]}
 */
function sumValue(text) {
  const tokens = text.split(' ');
  let acc = R(0n, 1n);
  let sign = 1n;
  for (const tok of tokens) {
    if (tok === '+') { sign = 1n; continue; }
    if (tok === '-') { sign = -1n; continue; }
    const factors = tok.match(/\d+\/\d+/g);
    if (!factors || factors.join('') !== tok.replace(/[()]/g, '')) throw new Error(`cannot read ${tok} in ${text}`);
    let n = 1n; let d = 1n;
    for (const f of factors) { const [x, y] = f.split('/'); n *= BigInt(x); d *= BigInt(y); }
    acc = R(acc[0] * d + sign * n * acc[1], acc[1] * d);
  }
  return acc;
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const text = print(/** @type {Node} */ (p.prompt.math));
  if (p.interaction === 'why') {
    // the factor k/k (equal numerator and denominator) inside the one product
    const m = /\((\d+)\/(\d+)\)\((\d+)\/(\d+)\)/.exec(text);
    if (!m || m[3] !== m[4] || m[1] === m[2]) throw new Error(`cannot find the hidden 1 in ${text}`);
    const first = text.startsWith('(');
    const minus = !first && / - \(/.test(text);
    return first ? 'e.0.1' : minus ? 'e.1.0.1' : 'e.1.1';
  }
  if (p.interaction === 'forge') {
    // goal "In <sum>, give a/b the common denominator L."
    const g = /give (\d+)\/(\d+) the common denominator (\d+)\./.exec(p.prompt.goal ?? '');
    if (!g || `${g[1]}/${g[2]}` !== text) throw new Error(`cannot read the goal ${p.prompt.goal}`);
    const k = BigInt(g[3]) / BigInt(g[2]);
    return `${k}/${k}`;
  }
  if (p.interaction === 'twin') {
    const a = sumValue(text);
    const b = sumValue(print(/** @type {Node} */ (p.prompt.twin)));
    return a[0] === b[0] && a[1] === b[1] ? show(a) : `${show(a)}, ${show(b)}`;
  }
  return show(sumValue(text));
}

runGeneratorSuite(generator, {
  separates: ['one-part-coin', 'form-change-changes-value'],
  independentKey,
  // The Forge asks for a form of 1 on ONE fraction: the coin is worth 1 (checked by the suite).
  correctForms(p) {
    if (p.interaction === 'strike' || p.interaction === 'predict') {
      const [n, d] = sumValue(print(/** @type {Node} */ (p.prompt.math)));
      return [`${n}/${d}`];
    }
    return [];
  },
  notCorrect(p) {
    const text = print(/** @type {Node} */ (p.prompt.math));
    if (p.interaction === 'strike') {
      const [n, d] = sumValue(text);
      return [text, `${2n * n}/${2n * d}`, `${d}/${n}`]; // not added; not reduced; upside down
    }
    if (p.interaction === 'forge') {
      const g = /give (\d+)\/(\d+) the common denominator (\d+)\./.exec(p.prompt.goal ?? '');
      if (!g) return [];
      const k = BigInt(g[3]) / BigInt(g[2]);
      return [`${k}/1`, `1/${k}`, `${k}`];
    }
    return [];
  },
  // A Forge prompt is one fraction (its goal names the sum), so d1 has few distinct prompts.
  minDistinct: 8,
});

test('the documented example: 1/4 + 5/6 at d3, common denominator 12', () => {
  const strike = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 3, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(/** @type {Node} */ (strike.prompt.math)), '1/4 + 5/6');
  assert.equal(judge(strike, '13/12').verdict, 'correct');
  assert.equal(judge(strike, '26/24').verdict, 'form'); // same value, not in lowest terms: not a miss
  assert.equal(judge(strike, '6/10').verdict, 'wrong'); // straight across
  assert.ok((strike.steps ?? []).some((s) => print(s.line) === '(1/4)(3/3) + 5/6'), 'the chain shows the first coin');
  const forge = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 3, interaction: 'forge', fadeLevel: 2 });
  const g = /give (\d+)\/(\d+) the common denominator (\d+)\./.exec(forge.prompt.goal ?? '');
  assert.ok(g, `goal ${forge.prompt.goal}`);
  const k = BigInt(g[3]) / BigInt(g[2]);
  assert.equal(judge(forge, `${k}/${k}`).verdict, 'correct');
  assert.equal(judge(forge, `${2n * k}/${2n * k}`).verdict, 'legal-idle'); // a 1 that overshoots the common denominator
  assert.equal(judge(forge, `${k}/1`).verdict, 'wrong'); // only the top multiplied
});
