// @ts-check
// exp-power-rules: the property suite (one runGeneratorSuite() call) and the
// documented seeds. Run: node --test test/gen/exp-power-rules.test.js
// (the mal-rule registry must be fresh: node scripts/gen-registry.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED, SPREADER_SEED } from '../../src/gen/stacks-roots/exp-power-rules.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnose, diagnoseJudged } from '../../src/misc/diagnose.js';

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

/** a x^2 + b x + c as typed, from three values of the prompt. @param {any} m */
function expanded(m) {
  const c = ev(m, { x: r(0n) });
  const p1 = ev(m, { x: r(1n) });
  const n1 = ev(m, { x: r(-1n) });
  const a = r((p1[0] + n1[0]) / 2n - c[0]); // values are whole numbers here
  const b = r((p1[0] - n1[0]) / 2n);
  if (a[0] !== 1n || p1[1] !== 1n || n1[1] !== 1n) throw new Error(`not x^2 + b x + c: ${print(m)}`);
  return `x^2 ${b[0] < 0n ? '-' : '+'} ${b[0] < 0n ? -b[0] : b[0]}x + ${c[0]}`;
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  const m = /** @type {any} */ (p.prompt.math);
  switch (p.interaction) {
    case 'predict': case 'strike':
      if (m.t === 'eq') return fillBlank(m);
      if (p.prompt.verb === 'Expand') return expanded(m);
      return show(ev(m, {}));
    case 'twin': return show(ev(m, { x: goalX(p) }));
    case 'why': {
      const at = [0, 1].filter((i) => [2n, 3n, -2n].every((x) => eqR(ev(m.args[i], { x: r(x) }), r(1n))));
      if (at.length !== 1) throw new Error(`not exactly one factor worth 1 in ${print(m)}`);
      return `e.${at[0]}`;
    }
    default: return undefined;
  }
}

runGeneratorSuite(generator, {
  separates: ['freshmans-dream-square', 'form-change-changes-value'],
  independentKey,
  notCorrect(p) {
    if (p.interaction !== 'predict' && p.interaction !== 'strike') return [];
    const m = /** @type {any} */ (p.prompt.math);
    const key = /** @type {string} */ (independentKey(p));
    if (m.t !== 'eq') return [print(m), ...(p.prompt.verb === 'Expand' ? [`${print(m.base)}${print(m.base)}`] : [])]; // not finished
    return [`${BigInt(key) + 1n}`, `${BigInt(key) - 1n}`];
  },
  minDistinct: 10,
});

test('documented seeds: (x^3)^4 as x^3x^3x^3x^3 at d1; (x + 3)^2 against x^2 + 9 at d3', () => {
  const pr = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'predict', fadeLevel: 3 });
  assert.equal(print(/** @type {any} */ (pr.prompt.math)), 'x^3x^3x^3x^3 = x^_');
  assert.equal(judge(pr, '12').verdict, 'correct');
  assert.equal(judge(pr, '7').verdict, 'wrong'); // exponents added: unclassified
  const tw = generator.generate(makeRng(SPREADER_SEED), { difficulty: 3, interaction: 'twin', fadeLevel: 0 });
  assert.equal(`${print(/** @type {any} */ (tw.prompt.math))} | ${print(/** @type {any} */ (tw.prompt.twin))}`, '(x + 3)^2 | x^2 + 9');
  assert.deepEqual(diagnose(tw, 'same').misconceptions, ['freshmans-dream-square']);
  assert.equal(judge(tw, 'different', { tapped: true }).verdict, 'correct');
  // the Spreader on a typed Expand and a typed Evaluate
  let seen = 0;
  for (let i = 0; i < 2000 && seen < 3; i++) {
    const st = generator.generate(makeRng(`e${i}`), { difficulty: 3, interaction: 'strike', fadeLevel: 3 });
    const t = print(/** @type {any} */ (st.prompt.math));
    if (t === '(x + 3)^2') {
      assert.deepEqual(diagnoseJudged(st, judge(st, 'x^2 + 9')), { misconceptions: ['freshmans-dream-square'], ambiguous: false });
      assert.equal(judge(st, '(x + 3)(x + 3)').verdict, 'form');
      seen |= 1;
    }
    if (t === '(2 + 3)^2') { assert.deepEqual(diagnoseJudged(st, judge(st, '13')), { misconceptions: ['freshmans-dream-square'], ambiguous: false }); seen |= 2; }
  }
  assert.equal(seen, 3, 'both (x + 3)^2 and (2 + 3)^2 were served');
});
