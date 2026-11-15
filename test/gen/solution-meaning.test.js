// @ts-check
// solution-meaning: the property suite (one call to runGeneratorSuite), an
// independent key from the printed prompt, the rejection-sampling rate, and
// the section 5 example 3 + 4 = [ ] + 2 by seed.
// Run: node scripts/gen-registry.js && node --test test/gen/solution-meaning.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED } from '../../src/gen/scales/solution-meaning.core.js';
import { judge } from '../../src/check/judge.js';
import { diagnoseJudged } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Generator} Generator */

// ---------------------------------------------------------------- independent arithmetic
// A tiny exact evaluator of PRINTED text (BigInt rationals). It shares no
// code with src/math: the key is recomputed from what the student sees.

/** @typedef {[bigint, bigint]} R */
/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
/** @param {bigint} n @param {bigint} [d] @returns {R} */
function R(n, d = 1n) { if (d === 0n) throw new Error('divide by 0'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; }
/** @param {R} a @param {R} b */ const radd = (a, b) => R(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
/** @param {R} a @param {R} b */ const rsub = (a, b) => R(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
/** @param {R} a @param {R} b */ const rmul = (a, b) => R(a[0] * b[0], a[1] * b[1]);
/** @param {R} a @param {R} b */ const rdiv = (a, b) => R(a[0] * b[1], a[1] * b[0]);
/** @param {R} a @param {R} b */ const req = (a, b) => a[0] === b[0] && a[1] === b[1];
/** @param {R} a */ const rtext = (a) => (a[1] === 1n ? `${a[0]}` : `${a[0]}/${a[1]}`);

/**
 * Value of printed text (digits, one-letter names, + - / ^ ( ), juxtaposition).
 * @param {string} text @param {Record<string, R>} env @returns {R}
 */
function evalText(text, env) {
  const toks = text.match(/\d+|[A-Za-z_]|[-+/^()]/g) ?? [];
  if (toks.join('') !== text.replace(/\s+/g, '')) throw new Error(`cannot read ${text}`);
  let i = 0;
  const peek = () => toks[i];
  /** @returns {R} */
  const expr = () => {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = toks[i++]; const w = term(); v = op === '+' ? radd(v, w) : rsub(v, w); }
    return v;
  };
  /** @returns {R} */
  const term = () => {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t === '/') { i++; v = rdiv(v, power()); } else if (t !== undefined && (t === '(' || /^[\dA-Za-z_]/.test(t))) v = rmul(v, power());
      else return v;
    }
  };
  /** @returns {R} */
  const unary = () => { if (peek() === '-') { i++; return rmul(R(-1n), unary()); } return power(); };
  /** @returns {R} */
  const power = () => {
    const b = atom();
    if (peek() !== '^') return b;
    i++;
    const e = unary();
    if (e[1] !== 1n || e[0] < 0n) throw new Error('only whole exponents');
    let out = R(1n);
    for (let k = 0n; k < e[0]; k++) out = rmul(out, b);
    return out;
  };
  /** @returns {R} */
  const atom = () => {
    const t = toks[i++];
    if (t === '(') { const v = expr(); if (toks[i++] !== ')') throw new Error('unbalanced'); return v; }
    if (t !== undefined && /^\d+$/.test(t)) return R(BigInt(t));
    if (t !== undefined && t in env) return env[t];
    throw new Error(`cannot read ${text} at ${t}`);
  };
  const v = expr();
  if (i !== toks.length) throw new Error(`trailing text in ${text}`);
  return v;
}

/** The two sides of a printed equation. @param {Node | Equation} m */
const sidesOf = (m) => { const [l, r] = print(m).split(' = '); return { l, r }; };

/** L - R at x, from the printed prompt. @param {Problem} p @param {R} x */
const gap = (p, x) => { const { l, r } = sidesOf(p.prompt.math); return rsub(evalText(l, { x }), evalText(r, { x })); };

/** The node at a data-path, by the rule in DESIGN.md (children order); own code. @param {any} m @param {string} path */
function at(m, path) {
  const parts = path.split('.');
  let n = m.t === 'eq' ? (parts[0] === 'l' ? m.lhs : m.rhs) : m;
  for (const k of parts.slice(1)) {
    const kids = n.t === 'add' || n.t === 'mul' ? n.args : n.t === 'neg' || n.t === 'group' ? [n.arg] : n.t === 'frac' ? [n.num, n.den] : n.t === 'pow' ? [n.base, n.exp] : [];
    n = kids[Number(k)];
  }
  return n;
}

/** The one target worth exactly `want` at every probe x (degree <= 2, so 4 points decide). @param {Problem} p @param {R} want */
function hiddenTarget(p, want) {
  const hits = (p.choices ?? []).filter((c) => [2n, 3n, 5n, -1n].every((x) => req(evalText(print(at(p.prompt.math, c.id)), { x: R(x) }), want)));
  if (hits.length !== 1) throw new Error(`hidden target: ${hits.length} candidates in ${print(p.prompt.math)}`);
  return hits[0].id;
}

/** The root of a linear equation from its printed text: L - R = m x + c. @param {Problem} p */
function linearRoot(p) {
  const c = gap(p, R(0n));
  const m = rsub(gap(p, R(1n)), c);
  return rdiv(rmul(R(-1n), c), m);
}

/** The blank's value: the left side minus the right side's number part (the blank has coefficient 1). @param {Problem} p */
function fillValue(p) {
  const { l, r } = sidesOf(p.prompt.math);
  const L = evalText(l, {});
  const r0 = evalText(r, { _: R(0n) });
  if (!req(rsub(evalText(r, { _: R(1n) }), r0), R(1n))) throw new Error(`the blank is not alone in ${r}`);
  return rsub(L, r0);
}

/** Both sides at the candidate named in the goal. @param {Problem} p @returns {R[]} */
function checkValues(p) {
  const m = /x = (-?\d+)/.exec(p.prompt.goal ?? '');
  if (!m) throw new Error(`no candidate in ${p.prompt.goal}`);
  const x = R(BigInt(m[1]));
  const { l, r } = sidesOf(p.prompt.math);
  return [evalText(l, { x }), evalText(r, { x })];
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  if (p.interaction === 'why') return hiddenTarget(p, R(0n));
  if (p.interaction === 'strike') return rtext(fillValue(p));
  if (p.interaction === 'predict') return checkValues(p).map(rtext).join(', ');
  return undefined;
}

runGeneratorSuite(generator, {
  separates: ['equals-as-operator'],
  independentKey,
  notCorrect(p) {
    if (p.interaction === 'strike') {
      const { l } = sidesOf(p.prompt.math);
      return [rtext(evalText(l, {}))]; // the Announcer's number
    }
    if (p.interaction === 'predict') {
      const [a, b] = checkValues(p);
      return req(a, b) ? [`${rtext(a)}, ${rtext(radd(b, R(1n)))}`] : [`${rtext(b)}, ${rtext(a)}`];
    }
    return [];
  },
  minDistinct: 30,
});

// ---------------------------------------------------------------- rejection-sampling rate

/**
 * An Rng that counts the rejection-sampling tries (forks labelled try:N).
 * @param {import('../../types.d.ts').Rng} rng @param {{ tries: number }} c
 * @returns {import('../../types.d.ts').Rng}
 */
function counting(rng, c) {
  return {
    seed: rng.seed,
    next: () => rng.next(), int: (lo, hi) => rng.int(lo, hi), pick: (a) => rng.pick(a), shuffle: (a) => rng.shuffle(a),
    bool: (pp) => rng.bool(pp),
    fork(label) { const m = /^try:(\d+)$/.exec(label); if (m) c.tries = Math.max(c.tries, Number(m[1]) + 1); return counting(rng.fork(label), c); },
  };
}

/** @param {Generator} g @param {number} seeds */
function rejectionRates(g, seeds) {
  /** @type {string[]} */
  const lines = [];
  for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) {
    for (const interaction of g.interactions) {
      let tries = 0;
      for (let i = 0; i < seeds; i++) {
        const c = { tries: 0 };
        g.generate(counting(makeRng(`s${i}`), c), { difficulty: d, interaction, fadeLevel: i % 4 });
        tries += c.tries;
      }
      const rate = 1 - seeds / tries;
      lines.push(`d${d} ${interaction}: ${(100 * rate).toFixed(1)}% rejected (${tries} draws for ${seeds} items)`);
      assert.ok(rate < 0.95, `${g.id} d${d} ${interaction} rejects ${(100 * rate).toFixed(1)}% of draws`);
    }
  }
  return lines;
}

test('solution-meaning: rejection-sampling rate under 95% (1000 seeds per cell)', (t) => {
  for (const line of rejectionRates(generator, 1000)) t.diagnostic(`${generator.id} ${line}`);
});

test('section 5 example by documented seed: 3 + 4 = [ ] + 2, the Announcer types 7', () => {
  const p = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(p.prompt.math), '3 + 4 = _ + 2');
  assert.equal(judge(p, '5').verdict, 'correct');
  const a = judge(p, '7');
  assert.equal(a.verdict, 'wrong');
  assert.deepEqual(diagnoseJudged(p, a), { misconceptions: ['equals-as-operator'], ambiguous: false });
  assert.deepEqual(diagnoseJudged(p, judge(p, '9')).misconceptions, []); // unclassified
});

test('solution-meaning: about half the checked candidates are solutions', () => {
  let roots = 0;
  for (let i = 0; i < 400; i++) {
    const p = generator.generate(makeRng(`s${i}`), { difficulty: 1 + (i % 2), interaction: 'predict', fadeLevel: 0 });
    const [a, b] = checkValues(p);
    if (req(a, b)) roots++;
  }
  assert.ok(roots > 120 && roots < 280, `${roots} of 400 candidates are solutions`);
});
