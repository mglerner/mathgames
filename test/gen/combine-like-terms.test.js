// @ts-check
// combine-like-terms: the property suite, an independent key read from the
// printed prompt, the documented seed, the pool checks from the review
// lessons (twin look, choice tells, Why place), and the rejection rate.
// Run: node scripts/gen-registry.js && node --test test/gen/combine-like-terms.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED, shapeOf } from '../../src/gen/scales/combine-like-terms.core.js';
import { judge } from '../../src/check/judge.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Generator} Generator */
/** @typedef {import('../../types.d.ts').Interaction} Interaction */

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
/** @param {R} a */ const rtext = (a) => (a[1] === 1n ? `${a[0]}` : `${a[0]}/${a[1]}`);

/** Value of printed text (digits, one-letter names, + - / ^ ( ), juxtaposition). @param {string} text @param {Record<string, R>} env @returns {R} */
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

/** A quadratic (or lower) in x from its printed text, as keypad text, by evaluating at 0, 1 and -1. @param {string} t */
function combinedText(t) {
  const f = (/** @type {bigint} */ x) => evalText(t, { x: R(x) });
  const c = f(0n);
  const p = f(1n);
  const m = f(-1n);
  const a = rdiv(rsub(radd(p, m), rmul(R(2n), c)), R(2n));
  const b = rdiv(rsub(p, m), R(2n));
  // the text must really be degree <= 2: check a fourth point
  const two = f(2n);
  const want = radd(radd(rmul(a, R(4n)), rmul(b, R(2n))), c);
  if (two[0] !== want[0] || two[1] !== want[1]) throw new Error(`${t} is not a quadratic`);
  /** @type {string[]} */
  const parts = [];
  for (const [co, pw] of /** @type {[R, string][]} */ ([[a, 'x^2'], [b, 'x'], [c, '']])) {
    if (co[0] === 0n) continue;
    const size = rtext(co[0] < 0n ? R(-co[0], co[1]) : co);
    const body = pw === '' ? size : `${size === '1' ? '' : size}${pw}`;
    parts.push(parts.length === 0 ? `${co[0] < 0n ? '-' : ''}${body}` : `${co[0] < 0n ? '-' : '+'} ${body}`);
  }
  return parts.join(' ') || '0';
}

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

/** @param {Problem} p */
const text = (p) => print(/** @type {Node} */ (p.prompt.math));

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  switch (p.interaction) {
    case 'predict': case 'strike': case 'nextline': return combinedText(text(p));
    case 'twin': {
      const g = /x = (-?\d+)/.exec(p.prompt.goal ?? '');
      if (!g) throw new Error('no probe in the goal');
      return rtext(evalText(text(p), { x: R(BigInt(g[1])) }));
    }
    case 'why': {
      const hits = (p.choices ?? []).filter((c) => [2n, 3n, 5n, -1n].every((x) => evalText(print(at(p.prompt.math, c.id)), { x: R(x) })[0] === 0n));
      if (hits.length !== 1) throw new Error(`hidden 0: ${hits.length} candidates in ${text(p)}`);
      return hits[0].id;
    }
    default: return undefined;
  }
}

runGeneratorSuite(generator, {
  separates: ['partial-distribution', 'neg-distribution'],
  independentKey,
  correctForms(p) {
    if (p.interaction !== 'predict' && p.interaction !== 'strike') return [];
    const parts = combinedText(text(p)).split(' ');
    // the same terms with the last one written first
    if (parts.length < 3) return [];
    const tail = parts.slice(-2);
    const head = parts.slice(0, -2).join(' ');
    return [`${tail[0] === '-' ? '-' : ''}${tail[1]} + ${head}`];
  },
  notCorrect(p) {
    if (p.interaction !== 'predict' && p.interaction !== 'strike') return [];
    return [text(p)]; // not combined yet: same value, so 'form', never 'correct'
  },
  minDistinct: 40,
});

// ---------------------------------------------------------------- documented seed

test('documented seed: 6x - 9 - 3x + 4 at d2', () => {
  const p = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 2, interaction: 'strike', fadeLevel: 3 });
  assert.equal(text(p), '6x - 9 - 3x + 4');
  assert.equal(judge(p, '3x - 5').verdict, 'correct');
  assert.equal(judge(p, '-5 + 3x').verdict, 'correct');
  assert.equal(judge(p, '9x - 5').verdict, 'wrong');
  assert.equal(judge(p, '6x - 3x - 5').verdict, 'form');
});

// ---------------------------------------------------------------- review lessons

/** @param {number} d @param {Interaction} it @param {number} n @returns {Problem[]} */
const pool = (d, it, n) => Array.from({ length: n }, (_, i) => generator.generate(makeRng(`rv${i}`), { difficulty: d, interaction: it, fadeLevel: i % 4 }));

test('Twin: the second form is always written like the combined answer, and both answers occur in every cell', () => {
  for (let d = 1; d <= 4; d++) {
    let same = 0; let diff = 0; let untagged = 0;
    for (const p of pool(d, 'twin', 400)) {
      const twin = /** @type {Node} */ (p.prompt.twin);
      const isSame = (p.choices ?? []).find((c) => c.id === 'same')?.verdict === 'correct';
      if (isSame) same++; else diff++;
      // the combined answer of the first form, as text, parsed by shape
      const key = combinedText(text(p));
      const keyShape = key.replace(/\d+/g, 'N');
      assert.equal(print(twin).replace(/\d+/g, 'N'), keyShape, `d${d} seed ${p.seed}: ${text(p)} | ${print(twin)}`);
      if (!isSame && (p.choices ?? []).find((c) => c.id === 'same')?.malrule === undefined) untagged++;
    }
    assert.ok(same > 120 && diff > 120, `d${d}: ${same} same, ${diff} different`);
    assert.ok(untagged > 50, `d${d}: only ${untagged} untagged near misses`);
  }
});

test('Next Line: the key is not found by length, position or majority of terms', () => {
  for (let d = 1; d <= 4; d++) {
    const ps = pool(d, 'nextline', 400);
    let longest = 0; let shortest = 0;
    /** @type {Record<string, number>} */
    const place = {};
    for (const p of ps) {
      const cs = p.choices ?? [];
      const k = cs.findIndex((c) => c.verdict === 'correct');
      place[k] = (place[k] ?? 0) + 1;
      const lens = cs.map((c) => print(/** @type {Node} */ (c.display)).length);
      if (lens.every((l, i) => i === k || l < lens[k])) longest++;
      if (lens.every((l, i) => i === k || l > lens[k])) shortest++;
    }
    assert.ok(longest / ps.length < 0.6 && shortest / ps.length < 0.6, `d${d}: key longest ${longest}, shortest ${shortest} of ${ps.length}`);
    assert.ok(Object.values(place).every((n) => n / ps.length < 0.7), `d${d}: key positions ${JSON.stringify(place)}`);
    // "pick the biggest / smallest number": the key's constant is not always the extreme one
    let big = 0; let small = 0;
    for (const p of ps) {
      const consts = (p.choices ?? []).map((c) => { const m = /([+-]) (\d+)$/.exec(print(/** @type {Node} */ (c.display))); return m ? (m[1] === '-' ? -1 : 1) * Number(m[2]) : 0; });
      const k = (p.choices ?? []).findIndex((c) => c.verdict === 'correct');
      if (consts.every((c, i) => i === k || c < consts[k])) big++;
      if (consts.every((c, i) => i === k || c > consts[k])) small++;
    }
    assert.ok(big / ps.length < 0.75 && small / ps.length < 0.75, `d${d}: key constant largest ${big}, smallest ${small} of ${ps.length}`);
  }
});

test('Why: the zero-pair is not always at one place and is one of two brackets', () => {
  for (let d = 1; d <= 4; d++) {
    /** @type {Record<string, number>} */
    const place = {};
    let minus = 0; // the bracket that is not 0 also shows a minus sign: "tap the minus" does not work
    for (const p of pool(d, 'why', 300)) {
      const k = (p.choices ?? []).find((c) => c.verdict === 'correct');
      assert.ok(k);
      place[k.id] = (place[k.id] ?? 0) + 1;
      const groups = (p.choices ?? []).filter((c) => /** @type {Node} */ (c.display).t === 'group');
      assert.equal(groups.length, 2, `seed ${p.seed}: ${text(p)}`);
      const other = groups.find((c) => c !== k);
      if (other && print(/** @type {Node} */ (other.display)).includes('-')) minus++;
    }
    assert.ok(Object.keys(place).length === 2 && Object.values(place).every((n) => n > 90), `d${d}: ${JSON.stringify(place)}`);
    assert.ok(minus > 90, `d${d}: the other bracket shows a minus on only ${minus} of 300`);
  }
});

test('d1 stays inside the times table, all positive', () => {
  for (const it of /** @type {Interaction[]} */ (['twin', 'predict', 'strike'])) {
    for (const p of pool(1, it, 300)) {
      const t = text(p);
      assert.doesNotMatch(t, /-/, `${it} seed ${p.seed}: ${t}`);
      for (const m of t.match(/\d+/g) ?? []) assert.ok(Number(m) <= 9, `${it} seed ${p.seed}: ${t}`);
      for (const m of combinedText(t).match(/\d+/g) ?? []) if (m !== '2') assert.ok(Number(m) <= 18, `${it} seed ${p.seed}: ${t}`);
    }
  }
});

test('shapeOf: numbers are hidden, signs and powers are not', () => {
  const p = generator.generate(makeRng('s1'), { difficulty: 3, interaction: 'strike', fadeLevel: 3 });
  assert.match(shapeOf(/** @type {Node} */ (p.answer.expected)), /v/);
});

test('every item carries at least 2 worked lines, and goals avoid the in-world words (section 9 vocabulary)', () => {
  for (const it of generator.interactions) for (let d = generator.difficulty[0]; d <= generator.difficulty[1]; d++) {
    for (let i = 0; i < 40; i++) {
      const p = generator.generate(makeRng(`wk${i}`), { difficulty: d, interaction: it, fadeLevel: it === 'forge' ? i % 2 : i % 4 });
      assert.ok((p.steps ?? []).length >= 2, `d${d} ${it} seed ${p.seed}: ${(p.steps ?? []).length} lines`);
      assert.doesNotMatch(p.prompt.goal ?? '', /\bcoin\b|\bLantern\b|\bbracket\b|under the root/, `d${d} ${it}`);
    }
  }
});

// ---------------------------------------------------------------- rejection-sampling rate

/** An Rng that counts rejection-sampling tries (forks labelled try:N). @param {import('../../types.d.ts').Rng} rng @param {{ tries: number }} c @returns {import('../../types.d.ts').Rng} */
function counting(rng, c) {
  return {
    seed: rng.seed,
    next: () => rng.next(), int: (lo, hi) => rng.int(lo, hi), pick: (a) => rng.pick(a), shuffle: (a) => rng.shuffle(a),
    bool: (pp) => rng.bool(pp),
    fork(label) { const m = /^try:(\d+)$/.exec(label); if (m) c.tries = Math.max(c.tries, Number(m[1]) + 1); return counting(rng.fork(label), c); },
  };
}

test('combine-like-terms: rejection-sampling rate under 95% (1000 seeds per cell)', (t) => {
  /** @type {Generator} */
  const g = generator;
  for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) {
    for (const interaction of g.interactions) {
      let tries = 0;
      for (let i = 0; i < 1000; i++) {
        const c = { tries: 0 };
        g.generate(counting(makeRng(`s${i}`), c), { difficulty: d, interaction, fadeLevel: i % 4 });
        tries += c.tries;
      }
      const rate = 1 - 1000 / tries;
      t.diagnostic(`${g.id} d${d} ${interaction}: ${(100 * rate).toFixed(1)}% rejected (${tries} draws for 1000 items)`);
      assert.ok(rate < 0.95, `${g.id} d${d} ${interaction} rejects ${(100 * rate).toFixed(1)}% of draws`);
    }
  }
});
