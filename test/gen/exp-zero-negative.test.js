// @ts-check
// exp-zero-negative: the property suite (one runGeneratorSuite() call) and the
// documented seeds. Run: node --test test/gen/exp-zero-negative.test.js
// (the mal-rule registry must be fresh: node scripts/gen-registry.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED, TWIN_SEED } from '../../src/gen/stacks-roots/exp-zero-negative.core.js';
import { judge } from '../../src/check/judge.js';
import { followUp } from '../../src/gen/common.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */

// ---- independent path: walk the PROMPT tree with plain BigInt rational
// arithmetic written here (x^n is n factors of x; nothing from src/math).

/** @typedef {[bigint, bigint]} R */
/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }
/** @param {bigint} n @param {bigint} [d] @returns {R} */
function r(n, d = 1n) { if (d === 0n) throw new Error('division by 0'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; }
/** @param {R} a @param {R} b */
const mulR = (a, b) => r(a[0] * b[0], a[1] * b[1]);
/** @param {R} a @param {R} b */
const addR = (a, b) => r(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
/** @param {R} v */
const show = ([n, d]) => (d === 1n ? `${n}` : `${n}/${d}`);
/** @param {R} a @param {R} b */
const eqR = (a, b) => a[0] === b[0] && a[1] === b[1];

/** @param {any} n @param {Record<string, R>} env @returns {R} */
function ev(n, env) {
  switch (n.t) {
    case 'num': return r(n.q.n, n.q.d);
    case 'var': { const x = env[n.name]; if (!x) throw new Error(`no value for ${n.name}`); return x; }
    case 'group': return ev(n.arg, env);
    case 'neg': { const a = ev(n.arg, env); return r(-a[0], a[1]); }
    case 'add': return n.args.reduce((/** @type {R} */ s, /** @type {any} */ a) => addR(s, ev(a, env)), r(0n));
    case 'mul': return n.args.reduce((/** @type {R} */ s, /** @type {any} */ a) => mulR(s, ev(a, env)), r(1n));
    case 'frac': { const a = ev(n.num, env); const b = ev(n.den, env); return r(a[0] * b[1], a[1] * b[0]); }
    case 'pow': {
      const e = ev(n.exp, env);
      if (e[1] !== 1n) throw new Error('not a whole-number exponent');
      const b = ev(n.base, env);
      let out = r(1n);
      for (let i = 0n; i < (e[0] < 0n ? -e[0] : e[0]); i++) out = mulR(out, b); // n factors of the base
      return e[0] < 0n ? r(out[1], out[0]) : out;
    }
    default: throw new Error(`cannot evaluate ${n.t}`);
  }
}

/** The x named in the goal. @param {Problem} p */
function goalX(p) {
  const m = /x = (-?\d+)/.exec(p.prompt.goal ?? '');
  if (!m) throw new Error(`no x in the goal ${p.prompt.goal}`);
  return r(BigInt(m[1]));
}

/** The whole number that fills the blank so both sides agree at two points. @param {Equation} e @returns {string} */
function fillBlank(e) {
  const pts = [{ x: r(2n), y: r(3n), a: r(5n), b: r(7n) }, { x: r(3n), y: r(5n), a: r(2n), b: r(-2n) }];
  const hits = [];
  for (let k = -100n; k <= 100n; k++) {
    if (pts.every((env) => { try { return eqR(ev(e.lhs, env), ev(e.rhs, { ...env, _: r(k) })); } catch { return false; } })) hits.push(k);
  }
  if (hits.length !== 1) throw new Error(`no single blank balances ${print(/** @type {any} */ (e))}: ${hits}`);
  return `${hits[0]}`;
}

/** Same value at four nonzero x? @param {any} a @param {any} b */
const sameAt = (a, b) => [2n, 3n, 5n, -2n].every((x) => eqR(ev(a, { x: r(x) }), ev(b, { x: r(x) })));
/** Does the tree hold x? @param {any} n @returns {boolean} */
const hasX = (n) => n.t === 'var' || ['args', 'arg', 'num', 'den', 'base', 'exp'].some((k) => (k === 'args' ? (n.args ?? []).some(hasX) : n[k] && typeof n[k] === 'object' && 't' in n[k] && hasX(n[k])));

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const m = /** @type {any} */ (p.prompt.math);
  switch (p.interaction) {
    case 'predict': case 'strike':
      return m.t === 'eq' ? fillBlank(m) : show(ev(m, {}));
    case 'twin': {
      const t = /** @type {any} */ (p.prompt.twin);
      // Same, with the second form a fraction: the form of 1 that joins them is its denominator over itself
      if (!hasX(m) && !hasX(t) && sameAt(m, t)) return show(ev(m, {})); // numbers, Same: the common value
      if (sameAt(m, t) && t.t === 'frac') return `(${print(t.den)})/(${print(t.den)})`;
      if (!hasX(m) && !hasX(t)) return `${show(ev(m, {}))}, ${show(ev(t, {}))}`;
      return show(ev(m, { x: goalX(p) }));
    }
    case 'why': {
      const at = m.args.map((/** @type {any} */ f, /** @type {number} */ i) => (sameAt(f, { t: 'num', q: { n: 1n, d: 1n } }) ? i : -1)).filter((/** @type {number} */ i) => i >= 0);
      if (at.length !== 1) throw new Error(`not exactly one factor worth 1 in ${print(m)}`);
      return `e.${at[0]}`;
    }
    default: return undefined;
  }
}

runGeneratorSuite(generator, {
  separates: ['form-change-changes-value'],
  independentKey,
  allowRoots01: false,
  notCorrect(p) {
    if (p.interaction !== 'predict' && p.interaction !== 'strike') return [];
    const m = /** @type {any} */ (p.prompt.math);
    const key = /** @type {string} */ (independentKey(p));
    if (m.t !== 'eq') return [print(m), key.startsWith('-') ? key.slice(1) : `-${key}`]; // not evaluated; the sign flipped
    return [`${BigInt(key) + 1n}`, `${-BigInt(key) === BigInt(key) ? 1n : -BigInt(key)}`];
  },
  minDistinct: 10,
});

test('documented seeds: "xx/xxxxx = 1/x^_" and x^-3 against 1/x^3 at d2', () => {
  const pr = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 2, interaction: 'predict', fadeLevel: 3 });
  assert.equal(print(/** @type {any} */ (pr.prompt.math)), 'xx/(xxxxx) = 1/x^_');
  assert.equal(judge(pr, '3').verdict, 'correct');
  assert.equal(judge(pr, '-3').verdict, 'wrong');
  const tw = generator.generate(makeRng(TWIN_SEED), { difficulty: 2, interaction: 'twin', fadeLevel: 2 });
  assert.equal(`${print(/** @type {any} */ (tw.prompt.math))} | ${print(/** @type {any} */ (tw.prompt.twin))}`, 'x^(-3) | 1/x^3');
  assert.equal(judge(tw, 'same', { tapped: true }).verdict, 'correct');
  const typed = followUp(tw);
  assert.equal(judge(typed, 'x^3/x^3').verdict, 'correct');
  assert.equal(judge(typed, 'x/x').verdict, 'legal-idle');
  assert.equal(judge(typed, 'x^3').verdict, 'wrong'); // half a form of 1
});
