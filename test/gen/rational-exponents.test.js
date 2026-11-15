// @ts-check
// rational-exponents.core: the property suite (one runGeneratorSuite() call),
// the documented seeds, and checks that the Twin and Why carry no surface
// tell. Run: node --test test/gen/rational-exponents.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { TEACHER_SEED, HALVER_SEED } from '../../src/gen/stacks-roots/rational-exponents.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnoseJudged } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---------------------------------------------------------------- an independent evaluator
// Reads the PRINTED prompt with its own small parser and computes with plain
// BigInt arithmetic. A value is c sqrt(s): c rational, s a squarefree whole
// number (enough for every form this generator shows). B^(1/2) is computed
// as THE number whose square is B (the nonnegative one): sqrt(n/d) =
// sqrt(n d)/d with the square part of n d taken out. Nothing here touches
// src/math, the AnswerSpec or the generator's internals.

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
/** @typedef {{ n: bigint; d: bigint; s: bigint }} V (n/d) sqrt(s) */
/** @param {bigint} n @param {bigint} d @param {bigint} s @returns {V} */
function mk(n, d, s) {
  if (d < 0n) { n = -n; d = -d; }
  // take square factors out of s
  for (let f = 2n; f * f <= s; f++) while (s % (f * f) === 0n) { s /= f * f; n *= f; }
  if (n === 0n) return { n: 0n, d: 1n, s: 1n };
  const g = gcd(n, d);
  return { n: n / g, d: d / g, s };
}
/** @param {V} a @param {V} b */
const vmul = (a, b) => mk(a.n * b.n, a.d * b.d, a.s * b.s);
/** @param {V} a */
const vinv = (a) => { if (a.n === 0n) throw new Error('divide by 0'); return mk(a.d, a.n * a.s, a.s); };
/** @param {V} a @param {V} b */
function vadd(a, b) {
  if (a.n === 0n) return b;
  if (b.n === 0n) return a;
  if (a.s !== b.s) throw new Error('unlike roots in a sum');
  return mk(a.n * b.d + b.n * a.d, a.d * b.d, a.s);
}
/** @param {V} a @param {V} e */
function vpow(a, e) {
  if (e.s !== 1n) throw new Error('irrational exponent');
  let base = a;
  if (e.d === 2n) {
    if (a.s !== 1n || a.n < 0n) throw new Error('1/2 power of a root or a negative');
    base = mk(1n, a.d, a.n * a.d); // the nonnegative number whose square is n/d
  } else if (e.d !== 1n) throw new Error(`power ${e.n}/${e.d}`);
  let k = e.n < 0n ? -e.n : e.n;
  let out = mk(1n, 1n, 1n);
  while (k-- > 0n) out = vmul(out, base);
  return e.n < 0n ? vinv(out) : out;
}
/** @param {V} v */
const isOne = (v) => v.n === 1n && v.d === 1n && v.s === 1n;
/** Keypad text of a value. @param {V} v */
function vtext(v) {
  const c = v.d === 1n ? `${v.n}` : `${v.n}/${v.d}`;
  if (v.s === 1n) return c;
  return v.n === 1n && v.d === 1n ? `sqrt(${v.s})` : `(${c})sqrt(${v.s})`;
}

/**
 * A tiny AST over printed text: + - (binary), juxtaposition and /, unary -,
 * ^, sqrt( ), parentheses, whole numbers, single letters.
 * @typedef {{ k: 'num'; v: bigint } | { k: 'var'; name: string } | { k: 'op'; op: string; a: Ast; b: Ast } | { k: 'neg'; a: Ast } | { k: 'sqrt'; a: Ast }} Ast
 */
/** @param {string} src @returns {Ast} */
function parseText(src) {
  const toks = src.replace(/\s+/g, '').match(/sqrt\(|\d+|[a-z]|[-+*/^()]/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const take = (/** @type {string} */ t) => { if (toks[i] !== t) throw new Error(`expected ${t} in ${src}`); i++; };
  /** @returns {Ast} */
  const expr = () => {
    let a = term();
    while (peek() === '+' || peek() === '-') { const op = toks[i++]; a = { k: 'op', op, a, b: term() }; }
    return a;
  };
  /** @returns {Ast} */
  const term = () => {
    let a = unary();
    for (;;) {
      const t = peek();
      if (t === '/') { i++; a = { k: 'op', op: '/', a, b: unary() }; } else if (t !== undefined && t !== '+' && t !== '-' && t !== ')') {
        a = { k: 'op', op: '*', a, b: unary() };
      } else return a;
    }
  };
  /** @returns {Ast} */
  const unary = () => (peek() === '-' ? (i++, { k: 'neg', a: unary() }) : power());
  /** @returns {Ast} */
  const power = () => {
    const a = atom();
    if (peek() === '^') { i++; return { k: 'op', op: '^', a, b: peek() === '-' ? unary() : power() }; }
    return a;
  };
  /** @returns {Ast} */
  const atom = () => {
    const t = toks[i++];
    if (t === undefined) throw new Error(`unexpected end of ${src}`);
    if (t === '(') { const a = expr(); take(')'); return a; }
    if (t === 'sqrt(') { const a = expr(); take(')'); return { k: 'sqrt', a }; }
    if (/^\d+$/.test(t)) return { k: 'num', v: BigInt(t) };
    if (/^[a-z]$/.test(t)) return { k: 'var', name: t };
    throw new Error(`unexpected ${t} in ${src}`);
  };
  const a = expr();
  if (i !== toks.length) throw new Error(`trailing text in ${src}`);
  return a;
}
/** @param {Ast} a @param {Record<string, bigint>} env @returns {V} */
function ev(a, env) {
  switch (a.k) {
    case 'num': return mk(a.v, 1n, 1n);
    case 'var': if (env[a.name] === undefined) throw new Error(`no value for ${a.name}`); return mk(env[a.name], 1n, 1n);
    case 'neg': { const x = ev(a.a, env); return mk(-x.n, x.d, x.s); }
    case 'sqrt': return vpow(ev(a.a, env), mk(1n, 2n, 1n));
    case 'op': {
      const x = ev(a.a, env);
      const y = ev(a.b, env);
      if (a.op === '+') return vadd(x, y);
      if (a.op === '-') return vadd(x, mk(-y.n, y.d, y.s));
      if (a.op === '*') return vmul(x, y);
      if (a.op === '/') return vmul(x, vinv(y));
      return vpow(x, y);
    }
  }
}
/** @param {string} text @param {Record<string, bigint>} [env] */
const valueOf = (text, env = {}) => ev(parseText(text), env);

// ---------------------------------------------------------------- the independent key

/** @param {Problem} p */
const mathText = (p) => print(/** @type {Node} */ (p.prompt.math));

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const text = mathText(p);
  if (p.interaction === 'why') {
    // the top-level product of two fractions: the one worth exactly 1 (at two probes when there is a letter)
    const ast = parseText(text);
    if (ast.k !== 'op' || ast.op !== '*') throw new Error(`not a product of two fractions: ${text}`);
    const letters = [...new Set(text.replace(/sqrt/g, '').match(/[a-z]/g) ?? [])];
    const envs = letters.length === 0 ? [{}] : [2n, 3n].map((x) => Object.fromEntries(letters.map((l) => [l, x])));
    const ones = [ast.a, ast.b].map((f) => envs.every((env) => isOne(ev(f, env))));
    if (ones.filter(Boolean).length !== 1) throw new Error(`not exactly one fraction worth 1 in ${text}`);
    return ones[0] ? 'e.0' : 'e.1';
  }
  const letter = /[abmtxy]/.exec(text.replace(/sqrt/g, ''))?.[0];
  if (p.interaction === 'twin') {
    const twinText = print(/** @type {Node} */ (p.prompt.twin));
    if (letter) {
      const at = /= (\d+)\.$/.exec(p.prompt.goal ?? '');
      if (!at) throw new Error(`no named probe in ${p.prompt.goal}`);
      return vtext(valueOf(text, { [letter]: BigInt(at[1]) }));
    }
    const a = valueOf(text);
    const b = valueOf(twinText);
    return a.n === b.n && a.d === b.d && a.s === b.s ? vtext(a) : `${vtext(a)}, ${vtext(b)}`;
  }
  if (letter) {
    // k(v^(1/2))^2 or k v^(1/2) v^(1/2): by the definition, (v^(1/2))^2 = v
    const m = /^(\d*)(?:\(([a-z])\^\(1\/2\)\)\^2|([a-z])\^\(1\/2\)([a-z])\^\(1\/2\))$/.exec(text);
    if (!m || (m[3] !== undefined && m[3] !== m[4])) throw new Error(`cannot read ${text}`);
    return `${m[1]}${m[2] ?? m[3]}`;
  }
  return vtext(valueOf(text));
}

/** Wrong typed answers a student with a known slip gives. @param {Problem} p @returns {string[]} */
function notCorrect(p) {
  if (p.interaction !== 'strike' && p.interaction !== 'predict') return [];
  const text = mathText(p);
  const out = [text]; // retyped: the move is not done
  const letter = /[abmtxy]/.exec(text.replace(/sqrt/g, ''))?.[0];
  if (letter) {
    const k = /^(\d*)/.exec(text)?.[1] ?? '';
    return [...out, `${k}${letter}^2`, `${k}sqrt(${letter})`, `${k}${letter}/2`];
  }
  const v = valueOf(text);
  out.push(vtext(vmul(v, v))); // squared once too often
  if (!text.includes(')^2') && !text.includes(')(')) out.push(vtext(vmul(valueOf(text.replace('^(1/2)', '')), mk(1n, 2n, 1n)))); // half of B
  return out;
}

runGeneratorSuite(generator, {
  separates: ['half-power-is-half', 'form-change-changes-value'],
  independentKey,
  notCorrect,
  minDistinct: 8,
});

// ---------------------------------------------------------------- documented seeds

test('documented seed: the teacher example (a^(1/2))^2 = a, a >= 0', () => {
  for (const interaction of /** @type {const} */ (['strike', 'predict', 'twin'])) {
    const p = generator.generate(makeRng(TEACHER_SEED), { difficulty: 3, interaction, fadeLevel: 3 });
    assert.equal(mathText(p), '(a^(1/2))^2', interaction);
    assert.deepEqual(p.assumptions, [{ name: 'a', rel: 'nonneg' }]);
  }
  const strike = generator.generate(makeRng(TEACHER_SEED), { difficulty: 3, interaction: 'strike', fadeLevel: 3 });
  assert.equal(judge(strike, 'a').verdict, 'correct');
  assert.equal(judge(strike, 'a^1').verdict, 'correct');
  assert.equal(judge(strike, '(a^(1/2))^2').verdict, 'form'); // same value, not finished
  assert.equal(judge(strike, 'sqrt(a)sqrt(a)').verdict, 'form');
  const half = judge(strike, 'a^2/4'); // (a/2)^2
  assert.equal(half.verdict, 'wrong');
  assert.deepEqual(diagnoseJudged(strike, half), { misconceptions: ['half-power-is-half'], ambiguous: false });
  assert.deepEqual(diagnoseJudged(strike, judge(strike, 'a^2')), { misconceptions: [], ambiguous: false }); // unclassified
});

test('documented seed: 9^(1/2) = 3, and the Halver reads it as 9/2', () => {
  const p = generator.generate(makeRng(HALVER_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(mathText(p), '9^(1/2)');
  assert.equal(judge(p, '3').verdict, 'correct');
  assert.equal(judge(p, 'sqrt(9)').verdict, 'form');
  assert.deepEqual(diagnoseJudged(p, judge(p, '9/2')), { misconceptions: ['half-power-is-half'], ambiguous: false });
  assert.deepEqual(diagnoseJudged(p, judge(p, '81')), { misconceptions: [], ambiguous: false });
});

// ---------------------------------------------------------------- surface tells

/** Shape of a twin's second form, as a guesser sees it. @param {string} t */
function shapeOf(t) {
  if (t.includes('sqrt')) return 'root';
  if (t.includes('^')) return 'power';
  if (t.includes('/')) return 'fraction';
  return 'plain';
}

test('Twin: about half Same, and no written shape of the second form settles it', () => {
  for (const difficulty of [1, 2, 3, 4]) {
    /** @type {Record<string, [number, number]>} shape -> [same, different] */
    const by = {};
    let same = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const p = generator.generate(makeRng(`tw${i}`), { difficulty, interaction: 'twin', fadeLevel: i % 2 });
      const isSame = (p.choices ?? []).some((c) => c.id === 'same' && c.verdict === 'correct');
      if (isSame) same++;
      const s = shapeOf(print(/** @type {Node} */ (p.prompt.twin)));
      by[s] ??= [0, 0];
      by[s][isSame ? 0 : 1]++;
    }
    assert.ok(same > 0.4 * N && same < 0.6 * N, `d${difficulty}: ${same} of ${N} Same`);
    for (const [s, [a, b]] of Object.entries(by)) {
      if (a + b < N / 20) continue;
      assert.ok(a > 0.15 * (a + b) && b > 0.15 * (a + b), `d${difficulty}: a ${s} second form is Same ${a} / Different ${b} times`);
    }
  }
});

test('Why: the hidden 1 sits first and second, and no naive guesser finds it', () => {
  for (const difficulty of [1, 2, 3, 4]) {
    let first = 0;
    let matchDecoy = 0;
    /** @type {Record<string, number>} guesser -> score (a tie scores 1/2) */
    const won = { smallerBottom: 0, squareOnTop: 0, rootBelow: 0, longer: 0, shorter: 0 };
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const p = generator.generate(makeRng(`why${i}`), { difficulty, interaction: 'why', fadeLevel: i % 4 });
      const k = (p.choices ?? []).find((c) => c.verdict === 'correct')?.id === 'e.0' ? 0 : 1;
      if (k === 0) first++;
      // a decoy B^(1/2)/B: the same number (or letter) on top and bottom, not worth 1
      const wrong = (p.choices ?? []).find((c) => c.id === `e.${1 - k}`);
      const t = wrong ? print(/** @type {Node} */ (wrong.display)) : '';
      if (/^(\(?[\d/a-z]+\)?)\^\(1\/2\)\/\1$/.test(t)) matchDecoy++;
      // naive guessers read the two fractions' printed tops and bottoms only
      const parts = [0, 1].map((j) => {
        const c = (p.choices ?? []).find((x) => x.id === `e.${j}`);
        const top = print(/** @type {Node} */ ((p.choices ?? []).find((x) => x.id === `e.${j}.0`)?.display));
        const whole = print(/** @type {Node} */ (c?.display));
        const bottom = whole.slice(top.length + (whole.startsWith(`(${top})`) ? 3 : 1)).replace(/^\((.*)\)$/, '$1');
        let size;
        try { const v = valueOf(bottom); size = v.s === 1n ? Number(v.n) / Number(v.d) : bottom.length; } catch { size = bottom.length; }
        return { whole, top, bottom, size };
      });
      /** @param {number[]} xs @param {(a: number, b: number) => boolean} better */
      const score = (xs, better) => (xs[0] === xs[1] ? 0.5 : (better(xs[0], xs[1]) ? 0 : 1) === k ? 1 : 0);
      won.smallerBottom += score(parts.map((x) => x.size), (a, b) => a < b);
      won.squareOnTop += score(parts.map((x) => (/\)\^2|\)\(|[a-z]\^\(1\/2\)[a-z]/.test(x.top) ? 1 : 0)), (a, b) => a > b);
      won.rootBelow += score(parts.map((x) => (x.bottom.includes('sqrt') ? 1 : 0)), (a, b) => a > b);
      won.longer += score(parts.map((x) => x.whole.length), (a, b) => a > b);
      won.shorter += score(parts.map((x) => x.whole.length), (a, b) => a < b);
    }
    assert.ok(first > 0.35 * N && first < 0.65 * N, `d${difficulty}: the 1 is first ${first} of ${N} times`);
    assert.ok(matchDecoy > 0.15 * N, `d${difficulty}: only ${matchDecoy} of ${N} decoys have matching numbers`);
    for (const [g, n] of Object.entries(won)) assert.ok(n <= (2 / 3) * N, `d${difficulty}: the guesser "${g}" wins ${n} of ${N}`);
  }
});
