// @ts-check
// distribute: the property suite, plus the documented example seeds.
// Run: node scripts/gen-registry.js && node --test test/gen/distribute.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { HALF_HAND_SEED, SIGN_THIEF_SEED } from '../../src/gen/scales/distribute.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnoseJudged } from '../../src/misc/diagnose.js';

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
const text = (p) => print(/** @type {Node} */ (p.prompt.math));

/** The expansion m x + c of a printed linear expression, by evaluating it at 0, 1 and 2. @param {string} t */
function expansion(t) {
  const at = (/** @type {bigint} */ x) => value(t, { x: r(x) });
  const c = at(0n);
  const m = minus(at(1n), c);
  const two = minus(at(2n), c);
  if (two[0] !== 2n * m[0] || two[1] !== m[1]) throw new Error(`${t} is not linear`);
  const coef = m[1] === 1n ? (m[0] === 1n ? '' : m[0] === -1n ? '-' : `${m[0]}`) : `(${show(m)})`;
  const head = m[0] === 0n ? '' : `${coef}x`;
  if (c[0] === 0n) return head || '0';
  const tail = show(c[0] < 0n ? r(-c[0], c[1]) : c);
  return head ? `${head} ${c[0] < 0n ? '-' : '+'} ${tail}` : show(c);
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const t = text(p);
  switch (p.interaction) {
    case 'nextline': case 'predict': case 'strike': return expansion(t);
    case 'twin': {
      const g = /x = (-?\d+)/.exec(p.prompt.goal ?? '');
      if (!g) throw new Error('no probe in the goal');
      return show(value(t, { x: r(BigInt(g[1])) }));
    }
    case 'why':
      if (!/^-1\(.*\)$/.test(t)) throw new Error(`cannot read ${t}`);
      return 'e.0.0';
    default: return undefined;
  }
}

runGeneratorSuite(generator, {
  separates: ['partial-distribution', 'neg-distribution'],
  independentKey,
  correctForms(p) {
    if (p.interaction !== 'predict' && p.interaction !== 'strike') return [];
    const [head, op, tail] = expansion(text(p)).split(' ');
    return op ? [`${op === '-' ? '-' : ''}${tail} + ${head}`] : []; // constant first
  },
  notCorrect(p) {
    if (p.interaction !== 'predict' && p.interaction !== 'strike') return [];
    return [text(p)]; // not distributed yet
  },
  minDistinct: 12,
});

test('documented seeds: 3(x + 4) at d1 and -3(2x - 5) at d3', () => {
  const half = generator.generate(makeRng(HALF_HAND_SEED), { difficulty: 1, interaction: 'predict', fadeLevel: 3 });
  assert.equal(text(half), '3(x + 4)');
  assert.equal(judge(half, '3x + 12').verdict, 'correct');
  assert.deepEqual(diagnoseJudged(half, judge(half, '3x + 4')), { misconceptions: ['partial-distribution'], ambiguous: false });
  const next = generator.generate(makeRng(HALF_HAND_SEED), { difficulty: 1, interaction: 'nextline', fadeLevel: 0 });
  assert.deepEqual((next.choices ?? []).map((c) => print(/** @type {Node} */ (c.display))).sort(), ['3x + 12', '3x + 4']);
  const thief = generator.generate(makeRng(SIGN_THIEF_SEED), { difficulty: 3, interaction: 'strike', fadeLevel: 3 });
  assert.equal(text(thief), '-3(2x - 5)');
  assert.equal(judge(thief, '-6x + 15').verdict, 'correct');
  assert.deepEqual(diagnoseJudged(thief, judge(thief, '-6x - 15')), { misconceptions: ['neg-distribution'], ambiguous: false });
  assert.deepEqual(diagnoseJudged(thief, judge(thief, '-6x - 5')), { misconceptions: ['partial-distribution'], ambiguous: false });
});
