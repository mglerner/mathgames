// @ts-check
// exp-meaning: the property suite (one runGeneratorSuite() call) and the
// documented seeds. Run: node --test test/gen/exp-meaning.test.js
// (the mal-rule registry must be fresh: node scripts/gen-registry.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED, TWIN_SEED } from '../../src/gen/stacks-roots/exp-meaning.core.js';
import { judge } from '../../src/check/judge.js';

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

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const m = /** @type {any} */ (p.prompt.math);
  switch (p.interaction) {
    case 'predict': case 'strike':
      if (m.t === 'eq') return fillBlank(m);
      if (p.variant === 'lantern') return show(ev(m, { x: goalX(p) }));
      return show(ev(m, {}));
    case 'twin': return show(ev(m, { x: goalX(p) }));
    case 'why': {
      // the factor worth 1 at three nonzero x
      const at = [0, 1].filter((i) => [2n, 3n, -2n].every((x) => eqR(ev(m.args[i], { x: r(x) }), r(1n))));
      if (at.length !== 1) throw new Error(`not exactly one factor worth 1 in ${print(m)}`);
      return `e.${at[0]}`;
    }
    default: return undefined;
  }
}

/** The prompt substituted at the named x: the Lantern key's value. @param {Problem} p @returns {Node | undefined} */
function reference(p) {
  if (p.variant !== 'lantern') return undefined;
  const [n] = goalX(p);
  /** @type {any} */
  const lit = n < 0n ? { t: 'neg', arg: { t: 'num', q: { n: -n, d: 1n } } } : { t: 'num', q: { n, d: 1n } };
  /** @param {any} t @returns {any} */
  const sub = (t) => {
    if (t.t === 'var' && t.name === 'x') return { t: 'group', arg: lit };
    const out = { ...t };
    if (t.args) out.args = t.args.map(sub);
    for (const k of ['arg', 'num', 'den', 'base', 'exp', 'radicand']) if (t[k]) out[k] = sub(t[k]);
    return out;
  };
  return sub(p.prompt.math);
}

runGeneratorSuite(generator, {
  separates: ['form-change-changes-value'],
  independentKey,
  reference,
  notCorrect(p) {
    if (p.interaction !== 'predict' && p.interaction !== 'strike') return [];
    const key = /** @type {string} */ (independentKey(p));
    const m = /** @type {any} */ (p.prompt.math);
    const out = [`${BigInt(key) + 1n}`, key.startsWith('-') ? key.slice(1) : `-${key}`];
    if (m.t !== 'eq' && p.variant !== 'lantern') out.push(print(m)); // retyping the power is not finished
    return out;
  },
  minDistinct: 10,
});

test('documented seeds: "xxxxx = x^_" and x^3 against 3x at d1', () => {
  const pr = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'predict', fadeLevel: 3 });
  assert.equal(print(/** @type {any} */ (pr.prompt.math)), 'xxxxx = x^_');
  assert.equal(judge(pr, '5').verdict, 'correct');
  assert.equal(judge(pr, '4').verdict, 'wrong');
  const tw = generator.generate(makeRng(TWIN_SEED), { difficulty: 1, interaction: 'twin', fadeLevel: 0 });
  assert.equal(`${print(/** @type {any} */ (tw.prompt.math))} | ${print(/** @type {any} */ (tw.prompt.twin))}`, 'x^3 | 3x');
  assert.equal(judge(tw, 'different', { tapped: true }).verdict, 'correct');
  const st = generator.generate(makeRng('s0'), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(judge(st, print(/** @type {any} */ (st.prompt.math))).verdict, 'form'); // the power retyped is not evaluated
});
