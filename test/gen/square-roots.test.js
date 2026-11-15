// @ts-check
// square-roots: the property suite (one runGeneratorSuite() call) and the
// documented seeds. Run: node scripts/gen-registry.js && node --test test/gen/square-roots.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED, NONNEG_SEED } from '../../src/gen/stacks-roots/square-roots.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnose, diagnoseJudged } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- an independent path to the key: a small reader for the PRINTED text
// that computes in sums of q sqrt(r) (BigInt fractions, r squarefree).
// Nothing here touches the generator's internals, the AnswerSpec, or src/math.

/** @typedef {[bigint, bigint]} F */
/** @typedef {Map<bigint, F>} V  radicand -> coefficient */

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
/** @param {bigint} n @param {bigint} [d] @returns {F} */
function f(n, d = 1n) { if (d === 0n) throw new Error('division by zero'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; }
const fadd = (/** @type {F} */ x, /** @type {F} */ y) => f(x[0] * y[1] + y[0] * x[1], x[1] * y[1]);
const fmul = (/** @type {F} */ x, /** @type {F} */ y) => f(x[0] * y[0], x[1] * y[1]);
/** square part: N = s^2 m, m squarefree. @param {bigint} N */
function split(N) { let s = 1n; let m = N; for (let p = 2n; p * p <= m; p++) while (m % (p * p) === 0n) { m /= p * p; s *= p; } return { s, m }; }
/** @param {F} c @param {bigint} r @returns {V} */
const term = (c, r) => (c[0] === 0n ? new Map() : new Map([[r, c]]));
/** @param {V} a @param {V} b @returns {V} */
function vadd(a, b) { const o = new Map(a); for (const [r, c] of b) { const s = fadd(o.get(r) ?? [0n, 1n], c); if (s[0] === 0n) o.delete(r); else o.set(r, s); } return o; }
/** @param {V} a @param {V} b @returns {V} */
function vmul(a, b) {
  /** @type {V} */ let o = new Map();
  for (const [r1, c1] of a) for (const [r2, c2] of b) { const { s, m } = split(r1 * r2); o = vadd(o, term(fmul(fmul(c1, c2), f(s)), m)); }
  return o;
}
/** @param {V} a @returns {V} */
const vneg = (a) => vmul(a, term(f(-1n), 1n));
/** 1/a for a = p + q sqrt(r) (one radicand at most). @param {V} a @returns {V} */
function vinv(a) {
  const rads = [...a.keys()].filter((r) => r !== 1n);
  if (rads.length > 1) throw new Error('cannot invert a value with two radicands');
  const p = a.get(1n) ?? [0n, 1n];
  const r = rads[0] ?? 1n;
  const qq = rads.length ? /** @type {F} */ (a.get(r)) : [0n, 1n];
  const norm = fadd(fmul(p, p), fmul(fmul(qq, qq), f(-r))); // p^2 - q^2 r
  if (norm[0] === 0n) throw new Error('division by zero');
  const k = f(norm[1], norm[0]);
  return vadd(term(fmul(p, k), 1n), term(fmul(fmul(qq, f(-1n)), k), r));
}
/** sqrt of a nonnegative rational value. @param {V} a @returns {V} */
function vsqrt(a) {
  if ([...a.keys()].some((r) => r !== 1n)) throw new Error('sqrt of an irrational value');
  const c = a.get(1n) ?? [0n, 1n];
  if (c[0] < 0n) throw new Error('negative radicand');
  const { s, m } = split(c[0] * c[1]); // sqrt(n/d) = sqrt(n d)/d
  return term(f(s, c[1]), m);
}

/**
 * Read printed text built from whole numbers, sqrt(...), ( ), +, -, /, ^ with a
 * whole exponent, and juxtaposition (multiplication).
 * @param {string} text @returns {V}
 */
function read(text) {
  const s = text.replace(/\s+/g, '');
  let i = 0;
  /** @returns {V} */
  const atom = () => {
    if (s.startsWith('sqrt(', i)) { i += 5; const inside = expr(); if (s[i++] !== ')') throw new Error(`bad ${text}`); return vsqrt(inside); }
    if (s[i] === '(') { i++; const x = expr(); if (s[i++] !== ')') throw new Error(`bad ${text}`); return x; }
    const m = /^\d+/.exec(s.slice(i));
    if (!m) throw new Error(`cannot read ${text} at ${i}`);
    i += m[0].length;
    return term(f(BigInt(m[0])), 1n);
  };
  /** @returns {V} */
  const factor = () => {
    let x = atom();
    if (s[i] === '^') { i++; const m = /^\d+/.exec(s.slice(i)); if (!m) throw new Error(`bad power in ${text}`); i += m[0].length; let o = term(f(1n), 1n); for (let k = 0; k < Number(m[0]); k++) o = vmul(o, x); x = o; }
    return x;
  };
  /** @returns {V} */
  const product = () => {
    if (s[i] === '-') { i++; return vneg(product()); }
    let x = factor();
    while (i < s.length && s[i] !== ')' && s[i] !== '+' && s[i] !== '-') {
      if (s[i] === '/') { i++; x = vmul(x, vinv(s[i] === '-' ? (i++, vneg(factor())) : factor())); } else x = vmul(x, factor());
    }
    return x;
  };
  /** @returns {V} */
  const expr = () => {
    let x = product();
    while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const y = product(); x = vadd(x, op === '-' ? vneg(y) : y); }
    return x;
  };
  const v = expr();
  if (i !== s.length) throw new Error(`trailing text in ${text}`);
  return v;
}

/** A value as keypad text: a sum of c sqrt(r) terms. @param {V} v */
function show(v) {
  if (v.size === 0) return '0';
  return [...v.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([r, [n, d]], k) => {
    const sign = n < 0n ? '-' : k > 0 ? '+' : '';
    const a = n < 0n ? -n : n;
    const body = r === 1n ? `${a}` : `${a === 1n ? '' : a}sqrt(${r})`;
    return `${k > 0 ? ` ${sign} ` : sign}${d === 1n ? body : `(${body})/${d}`}`;
  }).join('');
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const text = print(/** @type {any} */ (p.prompt.math));
  if (p.interaction === 'why') {
    // "(sqrt(N)/n)(k/e)" or "(k/e)(sqrt(N)/n)": the hidden 1 is the fraction whose two parts have one value
    const m = /^\((.+?)\/(.+?)\)\((.+?)\/(.+?)\)$/.exec(text);
    if (!m) throw new Error(`cannot read the Why ${text}`);
    const one = (/** @type {string} */ a, /** @type {string} */ b) => show(read(a)) === show(read(b));
    if (one(m[1], m[2]) && !one(m[3], m[4])) return 'e.0';
    if (one(m[3], m[4]) && !one(m[1], m[2])) return 'e.1';
    throw new Error(`no single hidden 1 in ${text}`);
  }
  if (p.interaction === 'twin') {
    const a = show(read(text));
    const b = show(read(print(/** @type {Node} */ (p.prompt.twin))));
    return a === b ? a : `${a}, ${b}`;
  }
  const eq = /^(\d*)x\^2(?: ([+-]) (\d+))? = (-?)(\d+)(?:\/(\d+))?$/.exec(text);
  if (eq) {
    // a x^2 + c = d: x^2 = (d - c)/a, two roots, one, or none
    const a = BigInt(eq[1] || '1');
    const c = eq[3] ? BigInt(eq[3]) * (eq[2] === '-' ? -1n : 1n) : 0n;
    const dd = f(BigInt(eq[5]) * (eq[4] ? -1n : 1n), eq[6] ? BigInt(eq[6]) : 1n);
    const t = fmul(fadd(dd, f(-c)), f(1n, a));
    if (t[0] < 0n) return 'no solution';
    if (t[0] === 0n) throw new Error('root 0');
    return `\u00b1${show(vsqrt(term(t, 1n)))}`; // the plus-minus key
  }
  return show(read(text));
}

runGeneratorSuite(generator, {
  separates: ['half-power-is-half', 'sqrt-splits-sum', 'form-change-changes-value'],
  independentKey,
  correctForms(p) {
    if (p.interaction !== 'strike' || p.answer.kind !== 'solution-set') return [];
    const k = independentKey(p) ?? '';
    return k.startsWith('\u00b1') ? [`+/-${k.slice(1)}`, `x = +/-${k.slice(1)}`] : [];
  },
  notCorrect(p) {
    if (p.interaction !== 'strike') return [];
    const k = independentKey(p) ?? '';
    if (p.answer.kind === 'solution-set') {
      if (!k.startsWith('\u00b1')) return ['0'];
      const r = k.slice(1);
      return [r, `-${r}`]; // one root only (the positive root alone is the classic miss)
    }
    const text = print(/** @type {Node} */ (p.prompt.math));
    return [text, `-(${k})`]; // not evaluated; the wrong sign
  },
  minDistinct: 12,
});

test('documented seeds: x^2 = 49 (two solutions) and sqrt((-5)^2) vs -5', () => {
  const solve = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(/** @type {any} */ (solve.prompt.math)), 'x^2 = 49');
  for (const t of ['7, -7', '-7, 7', '\u00b17', '+/-7', 'x = 7, x = -7']) assert.equal(judge(solve, t).verdict, 'correct', t);
  const one = judge(solve, '7');
  assert.equal(one.verdict, 'wrong');
  assert.equal(one.note, 'One solution is missing.');
  assert.deepEqual(diagnoseJudged(solve, one).misconceptions, []); // unclassified: no section 5 rule models it
  assert.equal(judge(solve, 'sqrt(49), -sqrt(49)').verdict, 'form'); // same set, not finished

  const twin = generator.generate(makeRng(NONNEG_SEED), { difficulty: 4, interaction: 'twin', fadeLevel: 0 });
  assert.equal(print(/** @type {Node} */ (twin.prompt.math)), 'sqrt((-5)^2)');
  assert.equal(print(/** @type {Node} */ (twin.prompt.twin)), '-5');
  assert.equal((twin.choices ?? []).find((c) => c.id === 'different')?.verdict, 'correct');
  assert.deepEqual(diagnose(twin, 'same').misconceptions, []);
});
