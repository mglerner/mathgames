// @ts-check
// literal-equations: the property suite, an independent key read from the
// printed prompt, the documented seed, the declarations, the pool checks from
// the review lessons (Cast, Next Line, Why), and the rejection rate.
// Run: node scripts/gen-registry.js && node --test test/gen/literal-equations.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { EXAMPLE_SEED } from '../../src/gen/scales/literal-equations.core.js';
import { judge } from '../../src/check/judge.js';
import { answerText } from '../../src/check/answer-spec.js';
import { parse } from '../../src/math/parse.js';
import { voteFindsKey } from '../../src/gen/common.js';

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

/** The two sides of a printed equation. @param {Node | Equation} m */
const sidesOf = (m) => { const [l, r] = print(m).split(' = '); return { l, r }; };

/** The target letter, from the prompt goal "Solve for w." or the verb. @param {Problem} p */
function targetOf(p) {
  const m = /Solve for ([A-Za-z])\./.exec(`${p.prompt.goal ?? ''} ${p.prompt.verb}.`);
  if (m) return m[1];
  const t = /next to ([A-Za-z])\./.exec(p.prompt.goal ?? '');
  if (t) return t[1];
  throw new Error(`no target in ${p.prompt.goal}`);
}

/** A few exact environments for every letter: never 0. @param {string[]} letters @returns {Record<string, R>[]} */
function envs(letters) {
  const vals = [2n, 3n, 5n, 7n, 11n, 13n, -3n];
  return [0, 1, 2].map((k) => Object.fromEntries(letters.map((n, i) => [n, R(vals[(i + 2 * k) % vals.length] + BigInt(k))])));
}

/** What the target equals, as text: -D(0) / (D(1) - D(0)) with D = L - R, read from the printed formula. @param {Problem} p */
function solvedText(p) {
  const t = targetOf(p);
  const { l, r } = sidesOf(p.prompt.math);
  const at = (/** @type {string} */ x) => `((${l.replaceAll(t, `(${x})`)}) - (${r.replaceAll(t, `(${x})`)}))`;
  return `-${at('0')}/(${at('1')} - ${at('0')})`;
}

/** @param {Problem} p @returns {string | undefined} */
function independentKey(p) {
  switch (p.interaction) {
    case 'strike': return solvedText(p);
    case 'nextline': case 'predict': {
      const mv = /** @type {Move} */ (p.prompt.move);
      const { l, r } = sidesOf(p.prompt.math);
      const o = print(/** @type {Node} */ (mv.operand));
      const sym = { add: '+', sub: '-', div: '/', mul: '' }[/** @type {'add'} */ (mv.op)];
      const done = (/** @type {string} */ s) => (mv.op === 'mul' ? `(${s})(${o})` : `(${s}) ${sym} (${o})`);
      if (!p.answer.formPredicates.some((f) => f.startsWith('isolated:'))) return `${done(l)} = ${done(r)}`;
      // the last move: the target's side must become the target alone; check that, then type it alone
      const t = targetOf(p);
      const tSide = l.includes(t) ? l : r;
      const other = l.includes(t) ? r : l;
      for (const env of envs(p.variableKeys)) {
        const got = evalText(done(tSide), env);
        if (got[0] !== env[t][0] || got[1] !== env[t][1]) throw new Error(`the move does not leave ${t} alone in ${print(p.prompt.math)}`);
      }
      return `${t} = ${done(other)}`;
    }
    case 'why': {
      const want = p.variant === 'hidden-1' ? 1n : 0n;
      const hits = (p.choices ?? []).filter((c) => envs(p.variableKeys).every((env) => { const v = evalText(print(at(p.prompt.math, c.id)), env); return v[0] === want && v[1] === 1n; }));
      if (hits.length !== 1) throw new Error(`hidden ${want}: ${hits.length} candidates in ${print(p.prompt.math)}`);
      return hits[0].id;
    }
    default: return undefined;
  }
}

runGeneratorSuite(generator, {
  separates: ['one-sided-operation', 'transpose-no-sign-change', 'divide-one-term'],
  independentKey,
  reference(p) {
    if (p.interaction !== 'strike') return undefined;
    const n = parse(solvedText(p));
    return 'error' in n ? undefined : /** @type {Node} */ (n);
  },
  // isolated target: one side is exactly the letter, the other side does not hold it
  isGoal(s, p) {
    const t = targetOf(p);
    const { l, r } = sidesOf(s);
    return (l === t && !r.includes(t)) || (r === t && !l.includes(t));
  },
  notCorrect(p) {
    if (p.interaction !== 'strike') return [];
    return [`-(${solvedText(p)})`, sidesOf(p.prompt.math).l];
  },
  minDistinct: 8,
});

// ---------------------------------------------------------------- documented seed

test('documented seed: P = 2l + 2w for w at d2', () => {
  const p = generator.generate(makeRng(EXAMPLE_SEED), { difficulty: 2, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(p.prompt.math), 'P = 2l + 2w');
  assert.match(p.prompt.goal ?? '', /Solve for w\./);
  for (const t of ['(P - 2l)/2', 'P/2 - l', '(P-2l)/2']) assert.equal(judge(p, t).verdict, 'correct', t);
  assert.equal(judge(p, 'P - 2l').verdict, 'wrong');
  assert.equal(judge(p, 'P/2 - 2l').verdict, 'wrong');
  // section 3 I8 (review gen2-oracle-a finding 2): the solved line is a complete final answer
  assert.equal(judge(p, 'w = (P - 2l)/2').verdict, 'correct');
  assert.equal(judge(p, '(P - 2l)/2 = w').verdict, 'correct');
  assert.equal(judge(p, 'w = P - 2l').verdict, 'wrong');
  assert.notEqual(judge(p, '2w = P - 2l').verdict, 'correct'); // w not alone
  assert.notEqual(judge(p, 'w = P - 2l - w').verdict, 'correct'); // w on both sides
});

test('I8 Solve for v: "v = key", "key = v" and the bare key are judged the same, and a wrong right side stays wrong (600 items)', () => {
  let n = 0;
  for (let d = generator.difficulty[0]; d <= generator.difficulty[1]; d++) for (let i = 0; i < 150; i++) {
    const p = generator.generate(makeRng(`sf${i}`), { difficulty: d, interaction: 'strike', fadeLevel: i % 4 });
    const v = p.answer.solvedFor;
    assert.ok(typeof v === 'string' && /^Solve for /.test(p.prompt.verb) && p.prompt.verb.endsWith(v), `solvedFor ${v} vs ${p.prompt.verb}`);
    const key = answerText(p.answer);
    assert.equal(judge(p, key).verdict, 'correct', key);
    assert.equal(judge(p, `${v} = ${key}`).verdict, 'correct', `${v} = ${key}`);
    assert.equal(judge(p, `${key} = ${v}`).verdict, 'correct', `${key} = ${v}`);
    // a wrong right side: the key plus 1 is a different expression (exact, not a sample)
    const off = `(${key}) + 1`;
    assert.equal(judge(p, off).verdict, 'wrong', off);
    assert.equal(judge(p, `${v} = ${off}`).verdict, 'wrong', `${v} = ${off}`);
    n++;
  }
  assert.equal(n, 150 * (generator.difficulty[1] - generator.difficulty[0] + 1));
});

// ---------------------------------------------------------------- declarations and review lessons

/** @param {number} d @param {Interaction} it @param {number} n @param {(i: number) => number} [fade] @returns {Problem[]} */
const pool = (d, it, n, fade = (i) => i % 4) => Array.from({ length: n }, (_, i) => generator.generate(makeRng(`rv${i}`), { difficulty: d, interaction: it, fadeLevel: fade(i) }));

test('every letter the chain divides by is declared nonzero, in the assumptions and printed on the item', () => {
  let divided = 0;
  for (let d = 1; d <= 4; d++) for (const it of /** @type {Interaction[]} */ (['strike', 'predict', 'cast', 'nextline', 'why'])) for (const p of pool(d, it, 150, (i) => (it === 'cast' ? i % 2 : i % 4))) {
    const declared = new Set(p.assumptions.filter((a) => a.rel === 'nonzero').map((a) => a.name));
    // the moves the item shows: the stated move, or the Cast's shortest path
    for (const m of [p.prompt.move, ...(p.moveGraph?.minPath ?? [])]) {
      if (!m || m.op !== 'div' || !m.operand) continue;
      for (const ch of print(m.operand).match(/[A-Za-z]/g) ?? []) {
        divided++;
        assert.ok(declared.has(ch), `d${d} ${it} seed ${p.seed}: divides by ${ch}, not declared`);
        assert.match(p.prompt.goal ?? '', new RegExp(`\\b${ch}\\b[^.]*not 0`), `d${d} ${it} seed ${p.seed}: ${p.prompt.goal}`);
      }
    }
    for (const name of declared) assert.match(p.prompt.goal ?? '', new RegExp(`\\b${name}\\b[^.]*not 0`), `d${d} ${it} seed ${p.seed}: ${name} declared but not printed`);
  }
  assert.ok(divided > 100, `only ${divided} divisions by a letter`);
});

test('Cast: 3-4 chips, 1-2 progress, at most one of "/ letter" and "x 0", usually a Legal-not-closer chip and a refused chip', () => {
  /** @param {Move} m */
  const trap = (m) => (m.op === 'div' && m.operand?.t === 'var') || (m.op === 'mul' && m.operand?.t === 'num' && m.operand.q.n === 0n);
  for (let d = 1; d <= 4; d++) {
    let idle = 0; let refused = 0;
    const ps = pool(d, 'cast', 300, (i) => i % 2);
    for (const p of ps) {
      const cs = p.choices ?? [];
      const prog = cs.filter((c) => c.verdict === 'progress');
      assert.ok(cs.length >= 3 && cs.length <= 4 && prog.length >= 1 && prog.length <= 2, `d${d} seed ${p.seed}`);
      assert.ok(cs.filter((c) => trap(/** @type {Move} */ (c.display))).length <= 1, `d${d} seed ${p.seed}`);
      if (cs.some((c) => c.verdict === 'legal-idle')) idle++;
      if (cs.some((c) => c.verdict === 'risky' || c.verdict === 'illegal')) refused++;
    }
    assert.ok(idle / ps.length > 0.9, `d${d}: a legal-idle chip on only ${idle}/${ps.length}`);
    assert.ok(refused / ps.length > 0.7, `d${d}: a refused chip on only ${refused}/${ps.length}`);
  }
});

test('Next Line: 3 candidates, the majority vote never finds the key, the key is not always at one place', () => {
  for (let d = 1; d <= 4; d++) {
    /** @type {Record<number, number>} */
    const place = {};
    const ps = pool(d, 'nextline', 300);
    for (const p of ps) {
      const cs = p.choices ?? [];
      assert.ok(cs.length >= 3, `d${d} seed ${p.seed}: ${cs.length} candidates`);
      const k = cs.findIndex((c) => c.verdict === 'correct');
      place[k] = (place[k] ?? 0) + 1;
      const lines = [cs[k], ...cs.filter((_, i) => i !== k)].map((c) => /** @type {Equation} */ (c.display));
      assert.equal(voteFindsKey(lines), false, `d${d} seed ${p.seed}`);
      const lens = lines.map((l) => print(l).length);
      assert.ok(!lens.slice(1).every((l) => l < lens[0]) && !lens.slice(1).every((l) => l > lens[0]), `d${d} seed ${p.seed}: the key is the one longest or shortest line`);
    }
    assert.ok(Object.values(place).every((n) => n < 0.6 * ps.length), `d${d}: ${JSON.stringify(place)}`);
  }
});

test('Why: the hidden 1 / 0 is on either side and is one of two marked targets', () => {
  for (let d = 1; d <= 4; d++) {
    /** @type {Record<string, number>} */
    const side = {};
    for (const p of pool(d, 'why', 300)) {
      const k = (p.choices ?? []).find((c) => c.verdict === 'correct');
      assert.ok(k);
      side[k.id[0]] = (side[k.id[0]] ?? 0) + 1;
      const marked = (p.choices ?? []).filter((c) => { const t = /** @type {Node} */ (c.display).t; return t === 'group' || t === 'frac'; });
      assert.ok(marked.length >= 2, `seed ${p.seed}: ${print(p.prompt.math)}`);
    }
    assert.ok(Object.keys(side).length === 2 && Object.values(side).every((n) => n > 90), `d${d}: ${JSON.stringify(side)}`);
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

test('literal-equations: rejection-sampling rate under 95% (1000 seeds per cell)', (t) => {
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
