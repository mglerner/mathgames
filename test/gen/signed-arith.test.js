// @ts-check
// signed-arith: the property suite, plus the documented example.
// Run: node --test test/gen/signed-arith.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED } from '../../src/gen/mint/signed-arith.core.js';
import { judge } from '../../src/check/judge.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- an independent path to the key: evaluate the PRINTED prompt with a
// small precedence parser over BigInt rationals. Nothing here touches the
// generator's internals, the AnswerSpec, or src/math.

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
/** @typedef {[bigint, bigint]} Rat */
/** @param {bigint} n @param {bigint} d @returns {Rat} */
function R(n, d) { if (d === 0n) throw new Error('division by 0'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; }
/** @param {Rat} v */
const show = ([n, d]) => (d === 1n ? `${n}` : `${n}/${d}`);

/**
 * Evaluate printed arithmetic: + - (binary and unary) / ^ ( ), implicit
 * multiplication "3(4)" and "(2/3)(5/4)". Unary minus binds looser than ^
 * (-3^2 = -9), tighter than * and /.
 * @param {string} text @returns {Rat}
 */
function evaluateText(text) {
  const toks = text.match(/\d+|[-+/^()]/g) ?? [];
  if (toks.join('') !== text.replace(/\s+/g, '')) throw new Error(`cannot read ${text}`);
  let i = 0;
  const peek = () => toks[i];
  const take = (/** @type {string} */ t) => { if (toks[i] !== t) throw new Error(`expected ${t} in ${text}`); i++; };
  /** @returns {Rat} */
  const atom = () => {
    if (peek() === '(') { take('('); const v = expr(); take(')'); return v; }
    const t = toks[i++];
    if (!/^\d+$/.test(t ?? '')) throw new Error(`unexpected ${t} in ${text}`);
    return [BigInt(t), 1n];
  };
  /** @returns {Rat} */
  const power = () => {
    const base = atom();
    if (peek() !== '^') return base;
    take('^');
    const e = atom();
    if (e[1] !== 1n || e[0] < 0n) throw new Error('only whole exponents');
    return R(base[0] ** e[0], base[1] ** e[0]);
  };
  /** @returns {Rat} */
  const unary = () => { if (peek() === '-') { i++; const v = unary(); return [-v[0], v[1]]; } return power(); };
  /** @returns {Rat} */
  const term = () => {
    let v = unary();
    for (;;) {
      if (peek() === '/') { i++; const w = unary(); v = R(v[0] * w[1], v[1] * w[0]); } else if (peek() === '(' || /^\d+$/.test(peek() ?? '')) { const w = power(); v = R(v[0] * w[0], v[1] * w[1]); } else return v;
    }
  };
  /** @returns {Rat} */
  const expr = () => {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = toks[i++]; const w = term(); v = R(op === '+' ? v[0] * w[1] + w[0] * v[1] : v[0] * w[1] - w[0] * v[1], v[1] * w[1]); }
    return v;
  };
  const v = expr();
  if (i !== toks.length) throw new Error(`trailing input in ${text}`);
  return v;
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const text = print(/** @type {Node} */ (p.prompt.math));
  if (p.interaction === 'why') {
    const hit = (p.choices ?? []).filter((c) => evaluateText(print(/** @type {Node} */ (c.display)))[0] === 0n);
    if (hit.length !== 1) throw new Error(`${hit.length} targets worth 0 in ${text}`);
    return hit[0].id;
  }
  if (p.interaction === 'twin') {
    const a = evaluateText(text);
    const b = evaluateText(print(/** @type {Node} */ (p.prompt.twin)));
    return a[0] === b[0] && a[1] === b[1] ? show(a) : `${show(a)}, ${show(b)}`;
  }
  return show(evaluateText(text));
}

runGeneratorSuite(generator, {
  separates: ['form-change-changes-value'],
  independentKey,
  notCorrect(p) {
    if (p.interaction !== 'strike' && p.interaction !== 'predict') return [];
    const text = print(/** @type {Node} */ (p.prompt.math));
    const [n, d] = evaluateText(text);
    const out = [show([-n, d])]; // the sign slip
    // every "- (-c)" read as "- c"
    const misread = text.replace(/- \(-/g, '- (');
    if (misread !== text) { const w = evaluateText(misread); if (w[0] !== n || w[1] !== d) out.push(show(w)); }
    if (p.interaction === 'strike' && d !== 1n) out.push(`${2n * n}/${2n * d}`); // not in lowest terms
    return out;
  },
});

test('the documented example: 5 - (-3) at d2', () => {
  const strike = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 2, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(/** @type {Node} */ (strike.prompt.math)), '5 - (-3)');
  assert.equal(judge(strike, '8').verdict, 'correct');
  assert.equal(judge(strike, '2').verdict, 'wrong');
  assert.ok((strike.steps ?? []).some((s) => print(s.line) === '5 + (3 - 3) - (-3)'), 'the chain shows the zero-pair');
});
