// @ts-check
// solve-linear: the property suite (one call to runGeneratorSuite), an
// independent key from the printed prompt, and the rejection-sampling rate.
// Run: node scripts/gen-registry.js && node --test test/gen/solve-linear.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator from '../../src/gen/scales/solve-linear.core.js';

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

/** The solution set of a linear equation from its printed text, as keypad text: L - R = m x + c. @param {Problem} p */
function linearAnswer(p) {
  const c = gap(p, R(0n));
  const m = rsub(gap(p, R(1n)), c);
  if (m[0] === 0n) return c[0] === 0n ? 'all reals' : 'no solution';
  return rtext(rdiv(rmul(R(-1n), c), m));
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  if (p.interaction === 'why') return hiddenTarget(p, R(0n));
  if (p.interaction === 'strike') return linearAnswer(p);
  if ((p.interaction === 'nextline' || p.interaction === 'predict') && p.prompt.move) {
    const { l, r } = sidesOf(p.prompt.math);
    const o = print(/** @type {Node} */ (p.prompt.move.operand));
    const sym = { add: '+', sub: '-', div: '/', mul: '' }[/** @type {'add'} */ (p.prompt.move.op)];
    return `(${l}) ${sym} (${o}) = (${r}) ${sym} (${o})`;
  }
  return undefined;
}

/** Solved form for the linear move search, from printed text. @param {Equation} s */
function solvedLinear(s) {
  const { l, r } = sidesOf(s);
  const hasX = (/** @type {string} */ t) => /x/.test(t);
  return (!hasX(l) && !hasX(r)) || (l === 'x' && !hasX(r)) || (r === 'x' && !hasX(l));
}

runGeneratorSuite(generator, {
  separates: ['transpose-no-sign-change', 'one-sided-operation', 'transpose-coefficient-as-subtract', 'partial-distribution', 'neg-distribution'],
  independentKey,
  isGoal: solvedLinear,
  notCorrect(p) {
    if (p.interaction !== 'strike') return [];
    const k = linearAnswer(p);
    if (k === 'all reals') return ['no solution', '2'];
    if (k === 'no solution') return ['all reals', '2'];
    return [`-(${k})`, 'no solution', 'all reals'];
  },
  minDistinct: 50,
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

test('solve-linear: rejection-sampling rate under 95% (1000 seeds per cell)', (t) => {
  for (const line of rejectionRates(generator, 1000)) t.diagnostic(`${generator.id} ${line}`);
});

test('solve-linear: d4 serves no-solution, all-reals and one-root items', () => {
  /** @type {Record<string, number>} */
  const kinds = {};
  for (let i = 0; i < 300; i++) {
    const p = generator.generate(makeRng(`s${i}`), { difficulty: 4, interaction: 'strike', fadeLevel: 3 });
    const k = linearAnswer(p);
    const kind = k === 'all reals' || k === 'no solution' ? k : 'one root';
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  for (const kind of ['all reals', 'no solution', 'one root']) assert.ok((kinds[kind] ?? 0) > 50, `d4 ${kind}: ${kinds[kind] ?? 0} of 300`);
});
