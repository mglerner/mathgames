// @ts-check
// rationalize-denominator, difficulties 2-4: the property suite (one
// runGeneratorSuite() call) and the documented seeds.
// Run: node scripts/gen-registry.js && node --test test/gen/rationalize-denominator.d2plus.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { CDEN_SEED, CONJ_SEED } from '../../src/gen/stacks-roots/rationalize-denominator.d2plus.js';
import { judge } from '../../src/check/judge.js';
import { diagnoseJudged } from '../../src/misc/diagnose.js';

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

/**
 * Split printed text at its top-level occurrences of one character.
 * @param {string} s @param {string} ch @returns {string[]}
 */
function splitTop(s, ch) {
  /** @type {string[]} */ const out = [''];
  let depth = 0;
  for (const c of s) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ch && depth === 0) out.push(''); else out[out.length - 1] += c;
  }
  return out;
}
/** "(A)(B)" -> [A, B]. @param {string} s @returns {string[]} */
function groups(s) {
  /** @type {string[]} */ const out = [];
  let depth = 0; let cur = '';
  for (const c of s) {
    if (c === '(' && depth++ === 0) { cur = ''; continue; }
    if (c === ')' && --depth === 0) { out.push(cur); continue; }
    cur += c;
  }
  return out;
}
/** Strip one pair of outer parentheses. @param {string} s */
const bare = (s) => (s.startsWith('(') && s.endsWith(')') && groups(s).length === 1 ? s.slice(1, -1) : s);

/**
 * The hidden 1 of a two-fraction Why "(A/B)(C/D)": the data-path of the one
 * fraction whose top and bottom have one value.
 * @param {string} text @returns {string}
 */
function whyKey(text) {
  const fs = groups(text);
  if (fs.length !== 2) throw new Error(`cannot read the Why ${text}`);
  const ones = fs.map((x) => { const [a, b] = splitTop(x, '/'); return show(read(bare(a))) === show(read(bare(b))); });
  if (ones[0] === ones[1]) throw new Error(`no single hidden 1 in ${text}`);
  return ones[0] ? 'e.0' : 'e.1';
}

/**
 * The prompt's denominator, read from "k/den" or "sqrt(a)/den" (the first
 * factor of a Multiply prompt).
 * @param {Problem} p @returns {string}
 */
function denOf(p) {
  let text = print(/** @type {Node} */ (p.prompt.math));
  const gs = groups(text);
  if (gs.length === 2 && text === `(${gs[0]})(${gs[1]})`) text = gs.find((g) => { const [a, b] = splitTop(g, '/'); return show(read(bare(a))) !== show(read(bare(b))); }) ?? text;
  const parts = splitTop(text, '/');
  if (parts.length !== 2) throw new Error(`cannot read the denominator of ${text}`);
  return bare(parts[1]);
}

/** A form of 1 that clears the root below, from the denominator alone. @param {string} den */
function clearingCoin(den) {
  let m;
  if ((m = /^(\d+) ([+-]) sqrt\((\d+)\)$/.exec(den))) { const c = `${m[1]} ${m[2] === '+' ? '-' : '+'} sqrt(${m[3]})`; return `(${c})/(${c})`; }
  if ((m = /^(\d+)?sqrt\((\d+)\)$/.exec(den))) return `sqrt(${m[2]})/sqrt(${m[2]})`;
  throw new Error(`unexpected denominator ${den}`);
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const text = print(/** @type {Node} */ (p.prompt.math));
  if (p.interaction === 'why') return whyKey(text);
  if (p.interaction === 'forge') return clearingCoin(denOf(p));
  if (p.interaction === 'twin') {
    const a = show(read(text));
    const b = show(read(print(/** @type {Node} */ (p.prompt.twin))));
    return a === b ? clearingCoin(denOf(p)) : `${a}, ${b}`;
  }
  return show(read(text));
}

runGeneratorSuite(generator, {
  separates: ['one-part-coin', 'root-square-overshoot', 'half-power-is-half', 'sqrt-product-misapplied', 'form-change-changes-value'],
  independentKey,
  correctForms(p) {
    if (p.interaction !== 'forge') return [];
    const den = denOf(p);
    const m = /^sqrt\((\d+)\)$/.exec(den);
    if (!m) return [];
    // d3: sqrt(N)/sqrt(N) and sqrt(m)/sqrt(m) both clear sqrt(N)
    const N = BigInt(m[1]);
    let r = N; for (let k = 2n; k * k <= r; k++) while (r % (k * k) === 0n) r /= k * k;
    return [`sqrt(${N})/sqrt(${N})`, `sqrt(${r})/sqrt(${r})`, `(2sqrt(${r}))/(2sqrt(${r}))`];
  },
  notCorrect(p) {
    const den = denOf(p);
    const text = print(/** @type {Node} */ (p.prompt.math));
    if (p.interaction === 'forge') {
      const out = [`(${den})/1`, `1/(${den})`, '7/7']; // the Half-Coin's; a 1 that leaves the root
      if (den.includes(' ')) out.push(`(${den})/(${den})`); // the same-sign coin keeps a root below
      return out;
    }
    if (p.interaction === 'strike' || p.interaction === 'predict') return [text];
    return [];
  },
  minDistinct: 12,
});

test('documented seeds: 6/(2sqrt(3)) and 2/(3 + sqrt(7))', () => {
  const cden = generator.generate(makeRng(CDEN_SEED), { difficulty: 2, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(/** @type {Node} */ (cden.prompt.math)), '6/(2sqrt(3))');
  assert.equal(judge(cden, 'sqrt(3)').verdict, 'correct');
  assert.equal(judge(cden, '6sqrt(3)/6').verdict, 'form'); // not in lowest terms
  assert.equal(judge(cden, '6sqrt(3)/(2sqrt(3)sqrt(3))').verdict, 'form'); // a root still below
  assert.deepEqual(diagnoseJudged(cden, judge(cden, '2sqrt(3)')).misconceptions, []); // the c forgotten: unclassified

  const conj = generator.generate(makeRng(CONJ_SEED), { difficulty: 4, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(/** @type {Node} */ (conj.prompt.math)), '2/(3 + sqrt(7))');
  assert.equal(judge(conj, '3 - sqrt(7)').verdict, 'correct');
  assert.equal(judge(conj, '(6 - 2sqrt(7))/2').verdict, 'form'); // not in lowest terms
  assert.equal(judge(conj, '-sqrt(7) + 3').verdict, 'correct');
  const forge = generator.generate(makeRng(CONJ_SEED), { difficulty: 4, interaction: 'forge', fadeLevel: 2 });
  assert.equal(judge(forge, '(3 - sqrt(7))/(3 - sqrt(7))').verdict, 'correct');
  assert.equal(judge(forge, 'sqrt(7)/sqrt(7)').verdict, 'legal-idle'); // a root stays below
  assert.equal(judge(forge, '(3 + sqrt(7))/(3 + sqrt(7))').verdict, 'legal-idle');
  assert.equal(judge(forge, '(3 - sqrt(7))/1').verdict, 'wrong');
});
