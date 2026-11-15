// @ts-check
// rationalize-denominator: the property suite (one runGeneratorSuite() call)
// and the documented seed. Run: node scripts/gen-registry.js && node --test test/gen/rationalize-denominator.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED } from '../../src/gen/stacks-roots/rationalize-denominator.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnoseJudged } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- an independent path to the key: a small reader for the PRINTED text
// that computes in Q(sqrt(r)) (values a + b sqrt(r), a and b BigInt
// fractions, r one squarefree number per expression). Nothing here touches
// the generator's internals, the AnswerSpec, or src/math.

/** @typedef {[bigint, bigint]} F */
/** @typedef {{ a: F; b: F }} V a + b sqrt(r) */

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
/** @param {bigint} n @param {bigint} d @returns {F} */
function f(n, d = 1n) { if (d === 0n) throw new Error('division by zero'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; }
const fadd = (/** @type {F} */ x, /** @type {F} */ y) => f(x[0] * y[1] + y[0] * x[1], x[1] * y[1]);
const fmul = (/** @type {F} */ x, /** @type {F} */ y) => f(x[0] * y[0], x[1] * y[1]);
const fneg = (/** @type {F} */ x) => f(-x[0], x[1]);
const isZero = (/** @type {F} */ x) => x[0] === 0n;

/**
 * Read printed text built from whole numbers, sqrt(...), ( ), / and
 * juxtaposition (multiplication), left to right.
 * @param {string} text @returns {{ v: V; r: bigint }}
 */
function read(text) {
  let i = 0;
  let r = 0n; // the one radicand, once seen
  const s = text.replace(/\s+/g, '');
  /** @returns {V} */
  const factor = () => {
    if (s.startsWith('sqrt(', i)) {
      i += 5;
      const inside = term();
      if (s[i++] !== ')') throw new Error(`bad text ${text}`);
      if (!isZero(inside.b) || inside.a[1] !== 1n || inside.a[0] <= 0n) throw new Error(`not a whole radicand in ${text}`);
      let N = inside.a[0];
      let out = 1n;
      for (let p = 2n; p * p <= N; p++) while (N % (p * p) === 0n) { N /= p * p; out *= p; }
      if (N === 1n) return { a: f(out), b: f(0n) };
      if (r !== 0n && r !== N) throw new Error(`two radicands in ${text}`);
      r = N;
      return { a: f(0n), b: f(out) };
    }
    if (s[i] === '(') { i++; const v = term(); if (s[i++] !== ')') throw new Error(`bad text ${text}`); return v; }
    const m = /^\d+/.exec(s.slice(i));
    if (!m) throw new Error(`cannot read ${text} at ${i}`);
    i += m[0].length;
    return { a: f(BigInt(m[0])), b: f(0n) };
  };
  /** @param {V} x @param {V} y @returns {V} */
  const mul = (x, y) => ({ a: fadd(fmul(x.a, y.a), fmul(fmul(x.b, y.b), f(r))), b: fadd(fmul(x.a, y.b), fmul(x.b, y.a)) });
  /** @param {V} y @returns {V} 1/y by the conjugate */
  const inv = (y) => {
    const norm = fadd(fmul(y.a, y.a), fneg(fmul(fmul(y.b, y.b), f(r)))); // a^2 - b^2 r
    const k = f(norm[1], norm[0]);
    return { a: fmul(y.a, k), b: fmul(fneg(y.b), k) };
  };
  /** @returns {V} */
  const term = () => {
    let v = factor();
    while (i < s.length && s[i] !== ')') {
      if (s[i] === '/') { i++; v = mul(v, inv(factor())); } else v = mul(v, factor());
    }
    return v;
  };
  const v = term();
  if (i !== s.length) throw new Error(`trailing text in ${text}`);
  return { v, r };
}

/** a + b sqrt(r) as keypad text in finished form (only one part is nonzero here). @param {{ v: V; r: bigint }} x */
function show({ v, r }) {
  const rat = (/** @type {F} */ x) => (x[1] === 1n ? `${x[0]}` : `${x[0]}/${x[1]}`);
  if (isZero(v.b)) return rat(v.a);
  if (!isZero(v.a)) throw new Error('a sum: not expected on this generator');
  const [n, d] = v.b;
  const top = n === 1n ? `sqrt(${r})` : `${n}sqrt(${r})`;
  return d === 1n ? top : `${top}/${d}`;
}

/** k and n of the printed prompt "k/sqrt(n)" or "(k/sqrt(n))(sqrt(n)/sqrt(n))". @param {Problem} p */
function kn(p) {
  const m = /^\(?(\d+)\/sqrt\((\d+)\)/.exec(print(/** @type {Node} */ (p.prompt.math)));
  if (!m) throw new Error('cannot read k/sqrt(n)');
  return { k: BigInt(m[1]), n: BigInt(m[2]) };
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const text = print(/** @type {Node} */ (p.prompt.math));
  if (p.interaction === 'why') {
    const m = /^\((\d+)\/sqrt\((\d+)\)\)\((sqrt\(\2\)\/sqrt\(\2\))\)$/.exec(text);
    if (!m || show(read(m[3])) !== '1') throw new Error(`cannot find the hidden 1 in ${text}`);
    return 'e.1'; // the second factor
  }
  if (p.interaction === 'forge') {
    const { n } = kn(p);
    return `sqrt(${n})/sqrt(${n})`; // sqrt(n) x sqrt(n) = n clears the root
  }
  if (p.interaction === 'twin') {
    const a = show(read(text));
    const b = show(read(print(/** @type {Node} */ (p.prompt.twin))));
    // Same: the form of 1 that connects k/sqrt(n) to its rationalized form. Different: both values.
    return a === b ? `sqrt(${kn(p).n})/sqrt(${kn(p).n})` : `${a}, ${b}`;
  }
  return show(read(text));
}

runGeneratorSuite(generator, {
  separates: ['one-part-coin', 'root-square-overshoot', 'half-power-is-half', 'form-change-changes-value'],
  independentKey,
  correctForms(p) {
    const { k, n } = kn(p);
    if (p.interaction === 'forge') return [`2sqrt(${n})/(2sqrt(${n}))`, `(3sqrt(${n}))/(3sqrt(${n}))`];
    if (p.interaction === 'strike' || p.interaction === 'predict') {
      const g = gcd(k, n);
      const out = [`sqrt(${n})(${k / g}/${n / g})`];
      if (p.interaction === 'predict') out.push(`${k}sqrt(${n})/${n}`); // not reduced is fine on a Predict
      return out;
    }
    return [];
  },
  notCorrect(p) {
    const { k, n } = kn(p);
    const text = print(/** @type {Node} */ (p.prompt.math));
    if (p.interaction === 'forge') return [`${n}/${n}`, `sqrt(${n})/1`, `1/sqrt(${n})`, `sqrt(${n})/sqrt(${n + 1n})`];
    if (p.interaction === 'strike') {
      const out = [text, `${k}`, `${k}/${n}`, `${k}sqrt(${n})/${n * n}`, `sqrt(${n})/${k}`];
      if (gcd(k, n) !== 1n) out.push(`${k}sqrt(${n})/${n}`); // not in lowest terms
      return out;
    }
    if (p.interaction === 'predict') return [text, `${k}`, `${k}/${n}`, `${k}sqrt(${n})/${n * n}`];
    return [];
  },
});

test('documented seed: 6/sqrt(3) at d1 (a teacher example)', () => {
  for (const interaction of generator.interactions) {
    const p = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction, fadeLevel: 0 });
    const shown = interaction === 'why' || interaction === 'predict' ? '(6/sqrt(3))(sqrt(3)/sqrt(3))' : '6/sqrt(3)';
    assert.equal(print(/** @type {Node} */ (p.prompt.math)), shown, interaction);
  }
  const strike = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(/** @type {Node} */ (strike.answer.expected)), '2sqrt(3)');
  assert.equal(judge(strike, '2sqrt(3)').verdict, 'correct');
  assert.equal(judge(strike, '6sqrt(3)/3').verdict, 'form'); // same value, not finished
  // Section 5 mal-rule 4: 6/sqrt(3) -> 6, or -> 2.
  assert.deepEqual(diagnoseJudged(strike, judge(strike, '6')), { misconceptions: ['one-part-coin'], ambiguous: false });
  assert.deepEqual(diagnoseJudged(strike, judge(strike, '2')), { misconceptions: ['one-part-coin'], ambiguous: false });
  // Mal-rule 18: 6/sqrt(3) -> 6sqrt(3)/9.
  assert.deepEqual(diagnoseJudged(strike, judge(strike, '6sqrt(3)/9')), { misconceptions: ['root-square-overshoot'], ambiguous: false });
  // Mal-rule 16: sqrt(3) read as 3/2: 6/(3/2) = 4.
  assert.deepEqual(diagnoseJudged(strike, judge(strike, '4')), { misconceptions: ['half-power-is-half'], ambiguous: false });

  const forge = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'forge', fadeLevel: 0 });
  assert.deepEqual((forge.choices ?? []).map((c) => `${print(/** @type {Node} */ (c.display))}:${c.verdict}:${c.malrule ?? ''}`).sort(),
    ['1/sqrt(3):wrong:one-part-coin', '3/3:legal-idle:', 'sqrt(3)/1:wrong:one-part-coin', 'sqrt(3)/sqrt(3):correct:']);
  const typed = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'forge', fadeLevel: 2 });
  assert.equal(judge(typed, 'sqrt(3)/sqrt(3)').verdict, 'correct');
  assert.equal(judge(typed, '3/3').verdict, 'legal-idle'); // "Legal. Not closer."
  assert.equal(judge(typed, 'sqrt(3)/1').verdict, 'wrong');
});
