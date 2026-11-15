// @ts-check
// factor-gcf: the property suite, an independent key read from the printed
// prompt, the documented seed, the local "factored" check, the pool checks
// from the review lessons (twin look, Why place), and the rejection rate.
// Run: node scripts/gen-registry.js && node --test test/gen/factor-gcf.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED, isGcfFactored } from '../../src/gen/scales/factor-gcf.core.js';
import { judge } from '../../src/check/judge.js';
import { parse } from '../../src/math/parse.js';

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

/** Coefficients [c0, c1, c2, c3] of a cubic (or lower) f, from f at 0, 1, -1, 2; checked at 3. @param {(x: bigint) => R} f @returns {R[]} */
function cubic(f) {
  const f0 = f(0n); const f1 = f(1n); const fm = f(-1n); const f2 = f(2n);
  const c0 = f0;
  const even = rsub(rdiv(radd(f1, fm), R(2n)), c0); // c2
  const odd = rdiv(rsub(f1, fm), R(2n)); // c1 + c3
  // f(2) = c0 + 2 c1 + 4 c2 + 8 c3 = c0 + 2 odd + 4 c2 + 6 c3
  const c3 = rdiv(rsub(rsub(rsub(f2, c0), rmul(R(2n), odd)), rmul(R(4n), even)), R(6n));
  const c1 = rsub(odd, c3);
  const cs = [c0, c1, even, c3];
  const at3 = cs.reduce((s, c, k) => radd(s, rmul(c, R(3n ** BigInt(k)))), R(0n));
  const want = f(3n);
  if (at3[0] !== want[0] || at3[1] !== want[1]) throw new Error('not a cubic');
  return cs;
}

/** Keypad text of a polynomial from integer coefficients, descending. @param {bigint[]} cs */
function polyText(cs) {
  /** @type {string[]} */
  const parts = [];
  for (let k = cs.length - 1; k >= 0; k--) {
    const c = cs[k];
    if (c === 0n) continue;
    const size = c < 0n ? -c : c;
    const pw = k === 0 ? '' : k === 1 ? 'x' : `x^${k}`;
    const body = k === 0 ? `${size}` : `${size === 1n ? '' : size}${pw}`;
    parts.push(parts.length === 0 ? `${c < 0n ? '-' : ''}${body}` : `${c < 0n ? '-' : '+'} ${body}`);
  }
  return parts.join(' ') || '0';
}

/** The GCF (positive, with the common power of x) and what is left, from the printed expanded form. @param {string} t */
function factorText(t) {
  const cs = cubic((x) => evalText(t, { x: R(x) })).map((c) => { if (c[1] !== 1n) throw new Error('not integer'); return c[0]; });
  const g = cs.reduce((a, c) => gcd(a, c), 0n);
  const m = cs.findIndex((c) => c !== 0n);
  const inside = cs.slice(m).map((c) => c / g);
  const gText = m === 0 ? `${g}` : `${g === 1n ? '' : g}x${m > 1 ? `^${m}` : ''}`;
  return { gText, inside: polyText(inside), insideCs: inside, g, m };
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
    case 'predict': {
      const [l, r] = text(p).split(' = ');
      const m = /^(-?)(\d*)(x?)\(_\)$/.exec(r);
      if (!m) throw new Error(`cannot read ${r}`);
      const G = (/** @type {bigint} */ x) => rmul(R(m[1] ? -1n : 1n), rmul(R(m[2] ? BigInt(m[2]) : 1n), m[3] ? R(x) : R(1n)));
      // what is left, f(x) = l(x) / G(x), read off at points where G is not 0
      const f = (/** @type {bigint} */ x) => rdiv(evalText(l, { x: R(x) }), G(x === 0n ? 7n : x));
      const at = (/** @type {bigint} */ x) => (x === 0n ? rdiv(evalText(l, { x: R(7n) }), G(7n)) : f(x));
      // degree <= 2: fit through 1, -1, 2 and check at 3 and 7
      const f1 = at(1n); const fm = at(-1n); const f2 = at(2n);
      const b = rdiv(rsub(f1, fm), R(2n));
      const ac = rdiv(radd(f1, fm), R(2n));
      const a = rdiv(rsub(rsub(f2, rmul(R(2n), b)), ac), R(3n));
      const c = rsub(ac, a);
      for (const x of [3n, 7n]) {
        const want = at(x);
        const got = radd(radd(rmul(a, R(x * x)), rmul(b, R(x))), c);
        if (got[0] !== want[0] || got[1] !== want[1]) throw new Error(`what is left is not a quadratic in ${text(p)}`);
      }
      if ([a, b, c].some((y) => y[1] !== 1n)) throw new Error(`not whole numbers in ${text(p)}`);
      return polyText([c[0], b[0], a[0]]);
    }
    case 'strike': {
      const f = factorText(text(p));
      return `${f.gText}, ${f.inside}`;
    }
    case 'twin': {
      const g = /x = (-?\d+)/.exec(p.prompt.goal ?? '');
      if (!g) throw new Error('no probe in the goal');
      return rtext(evalText(text(p), { x: R(BigInt(g[1])) }));
    }
    case 'why': {
      const hits = (p.choices ?? []).filter((c) => [2n, 3n, 5n, -1n].every((x) => { const v = evalText(print(at(p.prompt.math, c.id)), { x: R(x) }); return v[0] === 1n && v[1] === 1n; }));
      if (hits.length !== 1) throw new Error(`hidden 1: ${hits.length} candidates in ${text(p)}`);
      return hits[0].id;
    }
    default: return undefined;
  }
}

runGeneratorSuite(generator, {
  separates: ['partial-distribution'],
  independentKey,
  correctForms(p) {
    if (p.interaction === 'predict') return [`(${independentKey(p)})`];
    if (p.interaction === 'strike') { const f = factorText(text(p)); return [`(${f.gText}), (${f.inside})`]; }
    return [];
  },
  notCorrect(p) {
    if (p.interaction === 'predict') return [text(p).split(' = ')[0]]; // the whole expression, not what is left
    if (p.interaction === 'strike') {
      const f = factorText(text(p));
      const out = [`1, ${text(p)}`];
      // a common factor that is not the greatest
      for (const d of [2n, 3n, 5n, 7n]) if (f.g % d === 0n && f.g !== d) out.push(`${f.g / d}${f.m > 0 ? (f.m > 1 ? `x^${f.m}` : 'x') : ''}, ${polyText(f.insideCs.map((c) => c * d))}`);
      if (f.m > 0) out.push(`${f.g}, ${polyText([0n, ...f.insideCs])}`); // the x left inside
      return out;
    }
    return [];
  },
  minDistinct: 30,
});

// ---------------------------------------------------------------- documented seed

test('documented seed: 12x + 18 at d1', () => {
  const p = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(text(p), '12x + 18');
  assert.equal(judge(p, '6, 2x + 3').verdict, 'correct');
  assert.equal(judge(p, '3, 4x + 6').verdict, 'wrong');
  assert.equal(judge(p, '6, 2x + 18').verdict, 'wrong');
  const f = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 1, interaction: 'predict', fadeLevel: 3 });
  assert.equal(text(f), '12x + 18 = 6(_)');
  assert.equal(judge(f, '2x + 3').verdict, 'correct');
  assert.equal(judge(f, '12x + 18').verdict, 'wrong');
});

test('isGcfFactored: c(...) with integer content 1 inside, and no x common to the inside', () => {
  for (const [t, want] of /** @type {[string, boolean][]} */ ([
    ['3(2x + 3)', true], ['-3(2x - 3)', true], ['3x(2x - 3)', true], ['x(3x + 7)', true], ['2x(2x^2 - 3x + 1)', true],
    ['3(4x + 6)', false], ['6x + 9', false], ['3(2x^2 + 3x)', false], ['3(x)', false], ['(1/2)(4x + 6)', false],
  ])) {
    const n = parse(t);
    assert.ok(!('error' in n));
    assert.equal(isGcfFactored(/** @type {Node} */ (n)), want, t);
  }
});

// ---------------------------------------------------------------- review lessons

/** @param {number} d @param {Interaction} it @param {number} n @returns {Problem[]} */
const pool = (d, it, n) => Array.from({ length: n }, (_, i) => generator.generate(makeRng(`rv${i}`), { difficulty: d, interaction: it, fadeLevel: i % 4 }));

test('Twin: the second form is always written like the true factoring; Same and Different both occur, with and without a minus in front', () => {
  for (let d = 1; d <= 4; d++) {
    let same = 0; let diff = 0; let untagged = 0; let smaller = 0; let copied = 0;
    /** @type {Record<string, [number, number]>} */
    const lead = {};
    for (const p of pool(d, 'twin', 400)) {
      const twin = print(/** @type {Node} */ (p.prompt.twin));
      const f = factorText(text(p));
      const negLead = text(p).startsWith('-');
      const g = negLead ? `-${f.gText}` : f.gText;
      const ins = negLead ? polyText(f.insideCs.map((c) => -c)) : f.inside;
      const truth = `${g}(${ins})`;
      assert.equal(twin.replace(/\d+/g, 'N'), truth.replace(/\d+/g, 'N'), `d${d} seed ${p.seed}: ${text(p)} | ${twin} (true ${truth})`);
      const isSame = (p.choices ?? []).find((c) => c.id === 'same')?.verdict === 'correct';
      lead[String(negLead)] ??= [0, 0];
      lead[String(negLead)][isSame ? 0 : 1]++;
      if (isSame) { same++; if (twin !== truth) smaller++; } else diff++;
      const last = (/** @type {string} */ t) => (/(\d+)\)?$/.exec(t) ?? [])[1];
      if (last(text(p)) === last(twin)) copied++;
      if (!isSame && (p.choices ?? []).find((c) => c.id === 'same')?.malrule === undefined) untagged++;
    }
    assert.ok(same > 120 && diff > 120, `d${d}: ${same} same, ${diff} different`);
    assert.ok(untagged > 30, `d${d}: only ${untagged} untagged near misses`);
    for (const [k, [a, b]] of Object.entries(lead)) assert.ok(a + b < 20 || (a > 0.25 * (a + b) && b > 0.25 * (a + b)), `d${d} minus in front ${k}: ${a} same, ${b} different`);
    if (d === 1) assert.ok(smaller > 20, `d1: only ${smaller} Same pairs with a smaller common factor`);
    assert.ok(copied < 0.15 * 400, `d${d}: ${copied} of 400 pairs repeat the first form's last number (always Different)`);
  }
});

test('Why: the hidden 1 is on either side, never the only fraction or bracket', () => {
  for (let d = 1; d <= 4; d++) {
    /** @type {Record<string, number>} */
    const place = {};
    for (const p of pool(d, 'why', 300)) {
      const k = (p.choices ?? []).find((c) => c.verdict === 'correct');
      assert.ok(k);
      place[k.id] = (place[k.id] ?? 0) + 1;
      const marked = (p.choices ?? []).filter((c) => { const t = /** @type {Node} */ (c.display).t; return t === 'group' || t === 'frac'; });
      assert.ok(marked.length >= 2, `seed ${p.seed}`);
    }
    assert.ok(Object.keys(place).length === 2 && Object.values(place).every((n) => n > 90), `d${d}: ${JSON.stringify(place)}`);
  }
});

test('every key is GCF-factored (the local structural check)', () => {
  for (let d = 1; d <= 4; d++) for (const p of pool(d, 'strike', 300)) {
    const [g, ins] = /** @type {Node[]} */ (p.answer.expected);
    const n = parse(`${print(g)}(${print(ins)})`);
    assert.ok(!('error' in n) && isGcfFactored(/** @type {Node} */ (n)), `seed ${p.seed}: ${print(g)}(${print(ins)})`);
  }
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

test('factor-gcf: rejection-sampling rate under 95% (1000 seeds per cell)', (t) => {
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
