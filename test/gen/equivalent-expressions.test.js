// @ts-check
// equivalent-expressions: the property suite, plus the documented example seeds.
// Run: node scripts/gen-registry.js && node --test test/gen/equivalent-expressions.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { TWIN_SEED, SPREADER_SEED } from '../../src/gen/scales/equivalent-expressions.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnose } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- independent path: read the PRINTED prompt; plain BigInt arithmetic and
// a small evaluator written here (not src/math).

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }
/** @typedef {[bigint, bigint]} R */
/** @param {bigint} n @param {bigint} d @returns {R} */
function r(n, d = 1n) { if (d === 0n) throw new Error('division by 0'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; }
/** @param {R} v */
const show = ([n, d]) => (d === 1n ? `${n}` : `${n}/${d}`);
/** @param {R} a @param {R} b @returns {R} */
const minus = (a, b) => r(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);

/**
 * Exact value of printed text (digits, letters, + - / ^ ( ), implicit
 * multiplication; 2x/3 is (2x)/3; unary minus covers the whole term).
 * @param {string} src @param {Record<string, R>} env @returns {R}
 */
function value(src, env) {
  const toks = src.match(/\d+|[a-z_]|[-+/^()]/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  /** @returns {R} */
  const expr = () => {
    let a = term();
    while (peek() === '+' || peek() === '-') { const op = toks[i++]; const b = term(); a = op === '+' ? r(a[0] * b[1] + b[0] * a[1], a[1] * b[1]) : minus(a, b); }
    return a;
  };
  /** @returns {R} */
  const term = () => {
    if (peek() === '-') { i++; const a = term(); return r(-a[0], a[1]); }
    let a = power();
    for (;;) {
      const t = peek();
      if (t === '/') { i++; const b = power(); a = r(a[0] * b[1], a[1] * b[0]); } else if (t !== undefined && t !== '+' && t !== '-' && t !== ')') { const b = power(); a = r(a[0] * b[0], a[1] * b[1]); } else return a;
    }
  };
  /** @returns {R} */
  const power = () => {
    const a = atom();
    if (peek() !== '^') return a;
    i++;
    const e = Number(atom()[0]);
    let out = r(1n);
    for (let k = 0; k < e; k++) out = r(out[0] * a[0], out[1] * a[1]);
    return out;
  };
  /** @returns {R} */
  const atom = () => {
    const t = toks[i++];
    if (t === '(') { const a = expr(); if (toks[i++] !== ')') throw new Error(`bad ${src}`); return a; }
    if (t !== undefined && /^\d+$/.test(t)) return r(BigInt(t));
    if (t !== undefined && env[t]) return env[t];
    throw new Error(`cannot read ${src} at ${t}`);
  };
  const out = expr();
  if (i !== toks.length) throw new Error(`trailing input in ${src}`);
  return out;
}


/** @param {Problem} p */
const text = (p) => print(/** @type {any} */ (p.prompt.math));
/** The probe x named in the goal. @param {Problem} p @returns {bigint} */
function goalProbe(p) {
  const g = /x = (-?\d+)/.exec(p.prompt.goal ?? '');
  if (!g) throw new Error('no probe in the goal');
  return BigInt(g[1]);
}
/**
 * The blank of "L = R(_)" that makes the sides agree, solved at x = 7 and
 * checked at x = -3 and x = 4 (R is linear in the blank).
 * @param {string} t @returns {string}
 */
function solveBlank(t) {
  const [lhs, rhs] = t.split(' = ');
  /** @param {bigint} x */
  const at = (x) => {
    const L = value(lhs, { x: r(x) });
    const R0 = value(rhs, { x: r(x), _: r(0n) });
    const R1 = value(rhs, { x: r(x), _: r(1n) });
    const slope = minus(R1, R0);
    const gap = minus(L, R0);
    return r(gap[0] * slope[1], gap[1] * slope[0]);
  };
  const z = at(7n);
  for (const x of [-3n, 4n]) { const w = at(x); if (w[0] !== z[0] || w[1] !== z[1]) throw new Error(`no single blank balances ${t}`); }
  return show(z);
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const t = text(p);
  switch (p.interaction) {
    case 'twin': case 'predict': return show(value(t, { x: r(goalProbe(p)) }));
    case 'strike': return solveBlank(t);
    case 'why': {
      // the zero pair "(c - c)" is written first or last; the other bracket holds x
      const first = /^\((\d+) - (\d+)\) [+-] /.exec(t);
      const last = / \+ \((\d+) - (\d+)\)$/.exec(t);
      const m = first ?? last;
      if (!m || m[1] !== m[2] || (first && last)) throw new Error(`no single zero-pair in ${t}`);
      return first ? 'e.0' : 'e.1';
    }
    default: return undefined;
  }
}

/** prompt.math with x replaced by the goal's probe: the value the Lantern key must have. @param {Problem} p @returns {Node | undefined} */
function reference(p) {
  if (p.interaction !== 'predict') return undefined;
  const x = goalProbe(p);
  /** @type {Node} */
  const lit = x < 0n ? { t: 'neg', arg: { t: 'num', q: { n: -x, d: 1n } } } : { t: 'num', q: { n: x, d: 1n } };
  /** @param {any} n @returns {any} */
  const sub = (n) => {
    if (n.t === 'var' && n.name === 'x') return { t: 'group', arg: lit };
    const out = { ...n };
    if (n.args) out.args = n.args.map(sub);
    for (const k of ['arg', 'num', 'den', 'base', 'exp', 'radicand']) if (n[k]) out[k] = sub(n[k]);
    return out;
  };
  return sub(p.prompt.math);
}

runGeneratorSuite(generator, {
  separates: ['form-change-changes-value', 'partial-distribution', 'neg-distribution', 'freshmans-dream-square', 'cancel-across-sum'],
  independentKey,
  reference,
  notCorrect(p) {
    if (p.interaction !== 'predict' && p.interaction !== 'strike') return [];
    const key = /** @type {string} */ (independentKey(p));
    return [key.startsWith('-') ? key.slice(1) : `-${key}`];
  },
  minDistinct: 12,
});

test('documented seeds: 2(x + 3) vs 2x + 6 at d1; (x + 3)^2 vs x^2 + 9 at d3', () => {
  const same = generator.generate(makeRng(TWIN_SEED), { difficulty: 1, interaction: 'twin', fadeLevel: 0 });
  assert.equal(text(same), '2(x + 3)');
  assert.equal(print(/** @type {Node} */ (same.prompt.twin)), '2x + 6');
  assert.deepEqual(diagnose(same, 'different').misconceptions, ['form-change-changes-value']);
  assert.equal(judge(same, 'same', { tapped: true }).verdict, 'correct');
  const spread = generator.generate(makeRng(SPREADER_SEED), { difficulty: 3, interaction: 'twin', fadeLevel: 0 });
  assert.equal(text(spread), '(x + 3)^2');
  assert.equal(print(/** @type {Node} */ (spread.prompt.twin)), 'x^2 + 9');
  assert.deepEqual(diagnose(spread, 'same').misconceptions, ['freshmans-dream-square']);
  assert.equal(judge(spread, 'different', { tapped: true }).verdict, 'correct');
});
