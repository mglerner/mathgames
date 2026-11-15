// @ts-check
// identity-moves: the property suite, plus the documented example seeds.
// Run: node scripts/gen-registry.js && node --test test/gen/identity-moves.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { ZERO_SEED, COIN_SEED } from '../../src/gen/mint/identity-moves.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnoseJudged } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- independent path: read the PRINTED prompt and goal; plain BigInt
// arithmetic, and a small evaluator written here (not src/math).

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }
/** @typedef {[bigint, bigint]} R */
/** @param {bigint} n @param {bigint} d @returns {R} */
function r(n, d = 1n) { if (d === 0n) throw new Error('division by 0'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; }
/** @param {R} v */
const show = ([n, d]) => (d === 1n ? `${n}` : `${n}/${d}`);

/**
 * Exact value of printed text (digits, one letter x, + - / ^ ( ), implicit
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
    while (peek() === '+' || peek() === '-') { const op = toks[i++]; const b = term(); a = op === '+' ? r(a[0] * b[1] + b[0] * a[1], a[1] * b[1]) : r(a[0] * b[1] - b[0] * a[1], a[1] * b[1]); }
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
/** @param {Problem} p @returns {bigint} */
function goalDen(p) {
  const m = /denominator (\d+)/.exec(p.prompt.goal ?? '');
  if (!m) throw new Error(`no denominator in goal ${p.prompt.goal}`);
  return BigInt(m[1]);
}
/** "x/4" or "2x/5" -> [m, b]. @param {string} t @returns {[bigint, bigint]} */
function mxb(t) {
  const m = /^(\d*)x\/(\d+)$/.exec(t);
  if (!m) throw new Error(`cannot read ${t}`);
  return [BigInt(m[1] || '1'), BigInt(m[2])];
}
/** Top-level terms of printed text, split at " + " and " - " outside parentheses. @param {string} t */
function topTerms(t) {
  let depth = 0;
  let n = 1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '(') depth++;
    else if (t[i] === ')') depth--;
    else if (depth === 0 && (t.startsWith(' + ', i) || t.startsWith(' - ', i))) n++;
  }
  return n;
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const t = text(p);
  switch (p.interaction) {
    case 'why': {
      if (p.variant === 'hidden-0') {
        const m = /\((-?\d+) ([+-]) (\d+)\)$/.exec(t);
        if (!m || value(`${m[1]} ${m[2]} ${m[3]}`, {})[0] !== 0n) throw new Error(`no zero-pair in ${t}`);
        return `e.${topTerms(t) - 1}`;
      }
      const m = /^\((\d*x|\d+)\/(\d+)\)\((\d+)\/(\d+)\)$/.exec(t);
      if (!m || m[3] !== m[4]) throw new Error(`no coin in ${t}`);
      return 'e.1';
    }
    case 'forge': {
      if (p.answer.kind === 'form-of-0') {
        const m = /^Make (.*) appear\.$/.exec(p.prompt.goal ?? '');
        if (!m) throw new Error('no target');
        const zero = { x: r(0n) };
        const g = value(m[1], zero)[0] - value(t, zero)[0];
        return g > 0n ? `${g} - ${g}` : `-${-g} + ${-g}`;
      }
      const [, b] = mxb(t);
      const k = goalDen(p) / b;
      return `${k}/${k}`;
    }
    case 'predict': {
      const m = /^\((\d*x)\/(\d+)\)\((\d+)\/(\d+)\)$/.exec(t);
      if (!m) throw new Error(`cannot read ${t}`);
      const [mm, b] = mxb(`${m[1]}/${m[2]}`);
      const k = BigInt(m[3]);
      return `${mm * k}x/${b * k}`;
    }
    case 'strike': {
      if (p.variant === 'fill-blank') {
        const [lhs, rhs] = t.split(' = ');
        const at = { x: r(7n) };
        const L = value(lhs, at);
        const R0 = value(rhs, { ...at, _: r(0n) });
        const R1 = value(rhs, { ...at, _: r(1n) });
        const slope = r(R1[0] * R0[1] - R0[0] * R1[1], R1[1] * R0[1]);
        const z = r((L[0] * R0[1] - R0[0] * L[1]) * slope[1], L[1] * R0[1] * slope[0]);
        return show(z);
      }
      const [m, b] = mxb(t);
      const D = goalDen(p);
      return `${(m * D) / b}x/${D}`;
    }
    case 'twin': {
      const g = /x = (-?\d+)/.exec(p.prompt.goal ?? '');
      if (!g) {
        // no probe named: an equivalent pair, keyed by the coin that turns mx/b into (k m x)/(k b)
        const [, b] = mxb(t);
        const [, B] = mxb(print(/** @type {Node} */ (p.prompt.twin)));
        return `${B / b}/${B / b}`;
      }
      return show(value(t, { x: r(BigInt(g[1])) }));
    }
    default: return undefined;
  }
}

runGeneratorSuite(generator, {
  separates: ['one-part-coin', 'form-change-changes-value'],
  independentKey,
  notCorrect(p) {
    const t = text(p);
    if (p.interaction === 'forge' && p.answer.kind === 'form-of-1') {
      const k = goalDen(p) / mxb(t)[1];
      return [`${k}/1`, `1/${k}`, `${k + 1n}/${k + 1n}`];
    }
    if (p.interaction === 'forge') {
      const key = /** @type {string} */ (independentKey(p)); // "3 - 3" or "-5 + 5"
      const g = key.split(' ')[0];
      const size = g.replace('-', '');
      const flipped = g.startsWith('-') ? `${size} - ${size}` : `-${size} + ${size}`; // a zero-pair, but legal-idle
      return [g, flipped];
    }
    if (p.interaction === 'predict' || (p.interaction === 'strike' && p.variant !== 'fill-blank')) {
      return [p.interaction === 'predict' ? t.replace(/\(\d+\/\d+\)$/, '').replace(/^\((.*)\)$/, '$1') : t]; // the value, not the asked denominator
    }
    return [];
  },
  minDistinct: 12,
});

test('documented seeds at d1: x + 5 = x + 8 - 3 and x/4 = 3x/12', () => {
  const zf = generator.generate(makeRng(ZERO_SEED), { difficulty: 1, interaction: 'forge', fadeLevel: 0 });
  assert.equal(text(zf), 'x + 5');
  assert.equal(zf.prompt.goal, 'Make x + 8 appear.');
  assert.deepEqual((zf.choices ?? []).map((c) => print(/** @type {Node} */ (c.display))).sort(), ['3', '3 - 3', '8', '8 - 8']);
  const zs = generator.generate(makeRng(ZERO_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(/** @type {any} */ (zs.prompt.math)), 'x + 5 = x + 8 - _');
  assert.equal(judge(zs, '3').verdict, 'correct');
  const cf = generator.generate(makeRng(COIN_SEED), { difficulty: 1, interaction: 'forge', fadeLevel: 0 });
  assert.equal(text(cf), 'x/4');
  assert.equal(cf.prompt.goal, 'Make the denominator 12.');
  const cp = generator.generate(makeRng(COIN_SEED), { difficulty: 1, interaction: 'predict', fadeLevel: 2 });
  assert.equal(text(cp), '(x/4)(3/3)');
  assert.equal(judge(cp, '3x/12').verdict, 'correct');
  assert.equal(judge(cp, 'x/4').verdict, 'form');
  assert.deepEqual(diagnoseJudged(cp, judge(cp, '3x/4')), { misconceptions: ['one-part-coin'], ambiguous: false });
  assert.deepEqual(diagnoseJudged(cp, judge(cp, 'x/12')), { misconceptions: ['one-part-coin'], ambiguous: false });
});
