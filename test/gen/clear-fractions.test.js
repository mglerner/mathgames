// @ts-check
// clear-fractions: the property suite, an independent key read from the
// printed prompt, the documented seed, the pool checks from the review
// lessons (Trace, Cast, Twin), and the rejection rate.
// Run: node scripts/gen-registry.js && node --test test/gen/clear-fractions.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED } from '../../src/gen/scales/clear-fractions.core.js';
import { judge } from '../../src/check/judge.js';
import { applyMove } from '../../src/moves/apply.js';
import { diagnose } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Move} Move */
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

/** The two sides of a printed equation. @param {Node | Equation} m */
const sidesOf = (m) => { const [l, r] = print(m).split(' = '); return { l, r }; };

/** The root of a printed linear equation: L - R = m x + c. @param {Node | Equation} m */
function linearRoot(m) {
  const { l, r } = sidesOf(m);
  const gap = (/** @type {R} */ x) => rsub(evalText(l, { x }), evalText(r, { x }));
  const c = gap(R(0n));
  const k = rsub(gap(R(1n)), c);
  if (k[0] === 0n) throw new Error(`no single root in ${print(m)}`);
  return rdiv(rmul(R(-1n), c), k);
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
const text = (p) => print(p.prompt.math);

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  switch (p.interaction) {
    case 'strike': case 'twin': return rtext(linearRoot(p.prompt.math));
    case 'predict': {
      const { l, r } = sidesOf(p.prompt.math);
      const m = /^Multiply both sides by (\d+)\.$/.exec(p.prompt.goal ?? '');
      if (!m) throw new Error(`no stated multiplier in ${p.prompt.goal}`);
      return `${m[1]}(${l}) = ${m[1]}(${r})`;
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
  separates: ['one-sided-operation', 'transpose-no-sign-change'],
  independentKey,
  // Cast goal: no fraction left on the canonical line (read from its print)
  isGoal: (s) => !/\//.test(print(s)),
  notCorrect(p) {
    if (p.interaction !== 'strike') return [];
    const k = rtext(linearRoot(p.prompt.math));
    return [`-(${k})`, 'no solution', 'all reals'];
  },
  minDistinct: 20, // the Why is built from one term of the item: fewer distinct prompts
});

// ---------------------------------------------------------------- documented seed

test('documented seed: x/2 + x/3 = 5 at d2', () => {
  const p = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 2, interaction: 'strike', fadeLevel: 3 });
  assert.equal(text(p), 'x/2 + x/3 = 5');
  assert.equal(judge(p, '6').verdict, 'correct');
  assert.equal(judge(p, 'x = 6').verdict, 'correct');
  assert.equal(judge(p, '5/2').verdict, 'wrong'); // the denominators dropped: x + x = 5
  const n = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 2, interaction: 'predict', fadeLevel: 3 });
  assert.equal(judge(n, '3x + 2x = 30').verdict, 'correct');
  assert.equal(judge(n, '5x = 30').verdict, 'correct');
  assert.equal(judge(n, '3x + 2x = 5').verdict, 'wrong'); // one side only
});

// ---------------------------------------------------------------- review lessons

/** @param {number} d @param {Interaction} it @param {number} n @param {(i: number) => number} [fade] @returns {Problem[]} */
const pool = (d, it, n, fade = (i) => i % 4) => Array.from({ length: n }, (_, i) => generator.generate(makeRng(`rv${i}`), { difficulty: d, interaction: it, fadeLevel: fade(i) }));

test('Trace: about 1 in 3 clean; a planted chain ends on a small whole number (not 0 or 1), shows no fraction after line 1, and the bad line moves', () => {
  for (let d = 1; d <= 4; d++) {
    const ps = pool(d, 'trace', 600);
    let clean = 0;
    const places = new Set();
    /** @type {Record<number, [number, number]>} */
    const len = {};
    for (const p of ps) {
      const steps = p.steps ?? [];
      const bad = steps.findIndex((s) => !s.legal);
      len[steps.length] ??= [0, 0];
      len[steps.length][bad < 0 ? 0 : 1]++;
      for (const s of steps.slice(1)) assert.doesNotMatch(print(s.line), /\//, `d${d} seed ${p.seed}: ${print(s.line)}`);
      if (bad < 0) { clean++; continue; }
      places.add(bad);
      const end = linearRoot(steps[steps.length - 1].line);
      assert.ok(end[1] === 1n && end[0] !== 0n && end[0] !== 1n && end[0] >= -20n && end[0] <= 20n, `d${d} seed ${p.seed}: ends on ${rtext(end)}`);
    }
    assert.ok(clean / ps.length > 0.26 && clean / ps.length < 0.41, `d${d}: ${clean} clean of ${ps.length}`);
    assert.ok(places.size >= 2, `d${d}: bad line only at ${[...places]}`);
    for (const [k, [c, b]] of Object.entries(len)) if (c + b >= 50) assert.ok(c / (c + b) < 0.9, `d${d} ${k}-line chains: ${c} clean, ${b} planted`);
  }
});

test('Trace: a planted line after a stated move carries exactly the tags the mal-rules give it (an untagged plant is no rule output)', () => {
  // review gen2-oracle-a finding 1: "(x + 9)/2 = 6 [x 2] -> x + 9 = 6" was planted untagged as "a whole number
  // not multiplied" while the identical Lopsider line was tagged one-sided-operation on other items.
  let tagged = 0;
  for (let d = 1; d <= 4; d++) for (const p of pool(d, 'trace', 400)) {
    const steps = p.steps ?? [];
    const i = steps.findIndex((s) => !s.legal);
    if (i < 0 || !steps[i].move) continue;
    const prev = /** @type {Equation} */ (steps[i - 1].line);
    const move = /** @type {Move} */ (steps[i].move);
    /** @type {Problem} */
    const asPredict = { ...p, interaction: 'predict', choices: undefined, prompt: { ...p.prompt, math: prev, move },
      answer: { kind: 'equation-sides', expected: /** @type {Equation} */ (applyMove(move, prev)), formPredicates: [], assumptions: [] } };
    const hits = diagnose(asPredict, steps[i].line).misconceptions;
    const want = steps[i].malrule ? [steps[i].malrule] : [];
    assert.deepEqual(hits, want, `d${d} seed ${p.seed}: ${print(prev)} -> ${print(steps[i].line)} tagged ${steps[i].malrule ?? 'none'}`);
    if (want.length) tagged++;
  }
  assert.ok(tagged > 100, `only ${tagged} tagged plants checked`);
});

test('Cast: 3-4 chips, 1-2 progress, at most one of "/ x" and "x 0", the LCD always shown, usually a Legal-not-closer chip', () => {
  /** @param {Move} m */
  const trap = (m) => (m.op === 'div' && m.operand?.t === 'var') || (m.op === 'mul' && m.operand?.t === 'num' && m.operand.q.n === 0n);
  for (let d = 1; d <= 4; d++) {
    let idle = 0; let biggest = 0; let multi = 0;
    const ps = pool(d, 'cast', 300, (i) => i % 2);
    for (const p of ps) {
      const cs = p.choices ?? [];
      const prog = cs.filter((c) => c.verdict === 'progress');
      assert.ok(cs.length >= 3 && cs.length <= 4 && prog.length >= 1 && prog.length <= 2, `d${d} seed ${p.seed}`);
      assert.ok(cs.filter((c) => trap(/** @type {Move} */ (c.display))).length <= 1, `d${d} seed ${p.seed}`);
      const lcd = Number(/** @type {any} */ (p.steps ?? [])[1].move.operand.q.n);
      assert.ok(cs.some((c) => { const m = /** @type {any} */ (c.display); return m.op === 'mul' && Number(m.operand.q.n) === lcd && c.verdict === 'progress'; }), `d${d} seed ${p.seed}: no x ${lcd} chip`);
      if (cs.some((c) => c.verdict === 'legal-idle')) idle++;
      // "pick the largest multiplier"
      const muls = cs.filter((c) => { const m = /** @type {any} */ (c.display); return m.op === 'mul' && m.operand.t === 'num' && m.operand.q.n > 0n; });
      const top = muls.reduce((a, c) => (a === undefined || /** @type {any} */ (c.display).operand.q.n > /** @type {any} */ (a.display).operand.q.n ? c : a), /** @type {any} */ (undefined));
      if (muls.length >= 2) { multi++; if (top.verdict === 'progress') biggest++; }
    }
    assert.ok(idle / ps.length > 0.9, `d${d}: a legal-idle chip on only ${idle}/${ps.length}`);
    if (d >= 2) assert.ok(biggest < 0.8 * multi, `d${d}: the largest multiplier is the progress chip on ${biggest} of ${multi}`);
  }
});

test('Twin: both answers in every cell, and the second line is written like the cleared line', () => {
  for (let d = 1; d <= 4; d++) {
    const ps = pool(d, 'twin', 600);
    /** @type {Record<string, [number, number]>} */
    const tab = {};
    let same = 0;
    for (const p of ps) {
      const isSame = (p.choices ?? []).find((c) => c.id === 'same')?.verdict === 'correct';
      if (isSame) same++;
      const k = print(/** @type {Equation} */ (p.prompt.twin)).replace(/\d+/g, 'N');
      assert.doesNotMatch(k, /\//, `d${d} seed ${p.seed}`);
      tab[k] ??= [0, 0];
      tab[k][isSame ? 0 : 1]++;
    }
    assert.ok(same > 200 && same < 400, `d${d}: ${same} same of ${ps.length}`);
    const sure = Object.values(tab).filter(([a, b]) => a === 0 || b === 0).reduce((s, [a, b]) => s + a + b, 0);
    assert.ok(sure / ps.length <= 0.15, `d${d}: ${(100 * sure / ps.length).toFixed(1)}% of second lines have a look that is always one answer ${JSON.stringify(tab)}`);
  }
});

test('Why: the hidden 1 is not always at one place', () => {
  for (let d = 1; d <= 4; d++) {
    /** @type {Record<string, number>} */
    const place = {};
    for (const p of pool(d, 'why', 300)) {
      const k = (p.choices ?? []).find((c) => c.verdict === 'correct');
      assert.ok(k);
      place[k.id] = (place[k.id] ?? 0) + 1;
    }
    assert.ok(Object.keys(place).length >= 2 && Object.values(place).every((n) => n < 0.75 * 300), `d${d}: ${JSON.stringify(place)}`);
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

test('clear-fractions: rejection-sampling rate under 95% (1000 seeds per cell)', (t) => {
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
