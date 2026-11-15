// @ts-check
// Regression tests for the pool-level defects the M1b adversarial reviews
// found in the generators: tells that give the answer away without the
// mathematics (Trace, Cast, Twin, Why, Next Line), and keys that asked for
// the wrong thing. Each test scans seeds; none pins a seed.
// Run: node scripts/gen-registry.js && node --test test/gen/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generators } from '../../src/gen/registry.generated.js';
import { makeRng } from '../../src/gen/prng.js';
import { voteFindsKey } from '../../src/gen/common.js';
import { print } from '../../src/math/print.js';
import { solve } from '../../src/math/solve.js';
import { sameSolutions } from '../../src/math/equiv.js';
import { applyMove } from '../../src/moves/apply.js';
import { toQ } from '../../src/math/surd.js';
import { malrules } from '../../src/misc/diagnose.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Move} Move */
/** @typedef {import('../../types.d.ts').Interaction} Interaction */

const N = Number(process.env.KEYSTONE_SEEDS ?? 600);

/** @param {string} id */
const gen = (id) => { const g = generators.find((x) => x.id === id); if (!g) throw new Error(`no generator ${id}`); return g; };

/** @param {string} id @param {number} d @param {Interaction} it @param {number} [n] @param {(i: number) => number} [fade] @returns {Problem[]} */
function pool(id, d, it, n = N, fade = () => 0) {
  const g = gen(id);
  return Array.from({ length: n }, (_, i) => g.generate(makeRng(`rp-${i}`), { difficulty: d, interaction: it, fadeLevel: /** @type {0|1|2|3} */ (fade(i)) }));
}

/** Every (generator id, difficulty) cell that offers the interaction. @param {Interaction} it @returns {[string, number][]} */
function cells(it) {
  /** @type {[string, number][]} */
  const out = [];
  for (const g of generators) if (g.interactions.includes(it)) for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) out.push([g.id, d]);
  return out;
}

/** @param {Problem} p */
const key = (p) => /** @type {NonNullable<Problem['choices']>[number]} */ ((p.choices ?? []).find((c) => c.verdict === 'correct' || c.verdict === 'progress'));
/** @param {Problem} p */
const planted = (p) => (p.steps ?? []).some((s) => !s.legal);

// ---------------------------------------------------------------- Trace

test('Trace: the share of clean chains is the per-seed draw (about 1 in 3), in every cell', () => {
  for (const [id, d] of cells('trace')) {
    const ps = pool(id, d, 'trace');
    const clean = ps.filter((p) => !planted(p)).length / ps.length;
    assert.ok(clean > 0.26 && clean < 0.41, `${id} d${d}: ${(100 * clean).toFixed(1)}% clean`);
    for (const p of ps) assert.equal(key(p).id === 'none', !planted(p), `${id} d${d} seed ${p.seed}`);
  }
});

test('Trace: a planted chain has a true root, ends on a whole number that is not 0 or 1, and repeats no line', () => {
  let n = 0;
  for (const [id, d] of cells('trace')) for (const p of pool(id, d, 'trace')) {
    const steps = p.steps ?? [];
    for (let i = 1; i < steps.length; i++) assert.notEqual(print(steps[i].line), print(steps[i - 1].line), `${id} d${d} seed ${p.seed}: a line repeats`);
    if (!planted(p)) continue;
    n++;
    const truth = solve(/** @type {Equation} */ (p.prompt.math), 'x');
    assert.ok(truth && truth.kind === 'finite' && truth.roots.length > 0, `${id} d${d} seed ${p.seed}: no true root for the number evidence`);
    const end = solve(/** @type {Equation} */ (steps[steps.length - 1].line), 'x');
    const roots = end && end.kind === 'finite' ? end.roots.map(toQ) : [];
    for (const r of roots) assert.ok(!r || !(r.d === 1n && (r.n === 0n || r.n === 1n)), `${id} d${d} seed ${p.seed}: the chain ends on ${print(steps[steps.length - 1].line)}`);
    if (id !== 'quadratic-to-standard.core') {
      assert.ok(roots.length === 1 && roots[0] && roots[0].d === 1n, `${id} d${d} seed ${p.seed}: the planted chain ends on ${print(steps[steps.length - 1].line)} (a fraction announces the plant)`);
    }
    // exactly one bad line, and it does change the solution set
    const bad = steps.map((s, i) => (s.legal ? -1 : i)).filter((i) => i > 0);
    assert.equal(bad.length, 1);
    assert.equal(sameSolutions(/** @type {Equation} */ (steps[bad[0] - 1].line), /** @type {Equation} */ (steps[bad[0]].line), 'x').equal, false);
  }
  assert.ok(n > 1000, `only ${n} planted chains`);
});

test('Trace (solve-linear d4): one solution always, and no chain length is (nearly) always clean', () => {
  /** @type {Record<number, [number, number]>} */
  const len = {};
  for (const p of pool('solve-linear.core', 4, 'trace')) {
    assert.equal(/** @type {any} */ (p.answer.expected).kind, 'finite', `seed ${p.seed}: ${print(p.prompt.math)}`);
    const k = (p.steps ?? []).length;
    len[k] ??= [0, 0];
    len[k][planted(p) ? 1 : 0]++;
  }
  for (const [k, [clean, bad]] of Object.entries(len)) {
    if (clean + bad >= 50) assert.ok(clean / (clean + bad) < 0.9, `${k}-line chains: ${clean} clean, ${bad} planted`);
  }
});

test('Trace (distribute): the bad line is at more than one place, with move bugs as well as distribute bugs', () => {
  for (let d = 1; d <= 4; d++) {
    const places = new Set(); const rules = new Set();
    for (const p of pool('distribute.core', d, 'trace')) {
      const bad = (p.steps ?? []).findIndex((s) => !s.legal);
      if (bad > 0) { places.add(bad); rules.add((p.steps ?? [])[bad].malrule); }
    }
    assert.ok(places.size >= 2, `d${d}: bad line only at ${[...places]}`);
    assert.ok(rules.has('partial-distribution') && [...rules].some((r) => r === 'one-sided-operation' || r === 'transpose-no-sign-change'), `d${d}: ${[...rules]}`);
  }
});

// ---------------------------------------------------------------- Cast

test('Cast: one to two progress chips, at most one of "/ x" and "x 0", and usually a Legal-not-closer chip', () => {
  /** @param {Move} m */
  const trap = (m) => (m.op === 'div' && m.operand?.t === 'var') || (m.op === 'mul' && m.operand?.t === 'num' && m.operand.q.n === 0n);
  for (const [id, d] of cells('cast')) {
    let idle = 0;
    const ps = pool(id, d, 'cast', Math.min(N, 300), (i) => i % 2);
    for (const p of ps) {
      const cs = p.choices ?? [];
      const prog = cs.filter((c) => c.verdict === 'progress').length;
      assert.ok(cs.length >= 3 && cs.length <= 4, `${id} d${d} seed ${p.seed}: ${cs.length} chips`);
      assert.ok(prog >= 1 && prog <= 2, `${id} d${d} seed ${p.seed}: ${prog} progress chips`);
      assert.ok(cs.filter((c) => trap(/** @type {Move} */ (c.display))).length <= 1, `${id} d${d} seed ${p.seed}: both refused chips`);
      if (cs.some((c) => c.verdict === 'legal-idle')) idle++;
    }
    assert.ok(idle / ps.length > 0.9, `${id} d${d}: a legal-idle chip on only ${idle}/${ps.length}`);
  }
});

test('Cast: a chip labelled illegal really changes the solution set (no "x 0" on an all-reals line)', () => {
  let all = 0; let illegal = 0;
  for (const p of pool('solve-linear.core', 4, 'cast', 900, (i) => i % 2)) {
    const line = /** @type {Equation} */ (p.prompt.math);
    const before = solve(line, 'x');
    if (before && before.kind === 'all') all++;
    for (const c of p.choices ?? []) {
      if (c.verdict !== 'illegal') continue;
      illegal++;
      assert.equal(sameSolutions(line, applyMove(/** @type {Move} */ (c.display), line), 'x').equal, false, `seed ${p.seed}: ${print(line)}`);
    }
  }
  assert.ok(all > 100 && illegal > 100, `${all} all-reals lines, ${illegal} illegal chips`);
});

// ---------------------------------------------------------------- Next Line

test('Next Line (equations): 3-4 candidates, and the majority vote never finds the key', () => {
  for (const [id, lo, hi] of /** @type {[string, number, number][]} */ ([['balance-moves.core', 1, 3], ['solve-linear.core', 1, 4]])) {
    for (let d = lo; d <= hi; d++) for (const p of pool(id, d, 'nextline', 300)) {
      const cs = p.choices ?? [];
      assert.ok(cs.length >= 3 && cs.length <= 4, `${id} d${d} seed ${p.seed}: ${cs.length} candidates`);
      const k = key(p);
      const lines = [k, ...cs.filter((c) => c !== k)].map((c) => /** @type {Equation} */ (c.display));
      assert.equal(voteFindsKey(lines), false, `${id} d${d} seed ${p.seed}: ${lines.map((l) => print(l)).join(' | ')}`);
    }
  }
});

test('distribute d3 never serves a bare -(b x + c): rules 6 and 7 write the same line there', () => {
  for (const it of /** @type {Interaction[]} */ (['predict', 'strike', 'nextline', 'twin'])) for (const p of pool('distribute.core', 3, it, 300)) {
    const m = /** @type {Node} */ (p.prompt.math);
    assert.ok(!(m.t === 'neg' && m.arg.t === 'group'), `${it} seed ${p.seed}: ${print(m)}`);
  }
});

// ---------------------------------------------------------------- Twin

test('Twin: a Same pair joined by a form of 1 is keyed by that form of 1', () => {
  for (const id of ['frac-equivalence.core', 'identity-moves.core', 'rationalize-denominator.core']) {
    const g = gen(id);
    let same = 0;
    for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const p of pool(id, d, 'twin', 200, (i) => i % 4)) {
      const isSame = (p.choices ?? []).find((c) => c.id === 'same')?.verdict === 'correct';
      if (!isSame) { assert.notEqual(p.answer.kind, 'form-of-1', `${id} d${d} seed ${p.seed}`); continue; }
      same++;
      assert.equal(p.answer.kind, 'form-of-1', `${id} d${d} seed ${p.seed}: ${print(p.prompt.math)} ~ ${print(/** @type {Node} */ (p.prompt.twin))}`);
      const coin = /** @type {Node} */ (p.answer.expected);
      assert.ok(coin.t === 'frac' && print(coin.num) === print(coin.den), `${id}: key ${print(coin)} is not k/k`);
    }
    assert.ok(same > 70, `${id}: only ${same} Same pairs`);
  }
});

test('Twin: the way the second form is written does not settle Same / Different', () => {
  /** @param {any} n @returns {string} */
  const shape = (n) => {
    switch (n.t) {
      case 'num': return 'N'; case 'var': return 'v'; case 'neg': return `-${shape(n.arg)}`;
      case 'add': return `(${n.args.map(shape).join('+')})`; case 'mul': return n.args.map(shape).join('*');
      case 'frac': return `[${shape(n.num)}/${shape(n.den)}]`; case 'pow': return `${shape(n.base)}^`;
      case 'root': return `R${shape(n.radicand)}`; case 'group': return `g${shape(n.arg)}`; default: return '?';
    }
  };
  for (const [id, ds] of /** @type {[string, number[]][]} */ ([['frac-equivalence.core', [1, 2, 3, 4]], ['identity-moves.core', [1, 2, 3, 4]], ['frac-times-whole.core', [1, 2, 3, 4]], ['equivalent-expressions.core', [3, 4]]])) {
    for (const d of ds) {
      /** @type {Record<string, [number, number]>} */
      const tab = {};
      const ps = pool(id, d, 'twin', 1500, (i) => i % 4);
      for (const p of ps) {
        const k = `${shape(p.prompt.math)} | ${shape(p.prompt.twin)}`;
        tab[k] ??= [0, 0];
        tab[k][(p.choices ?? []).find((c) => c.id === 'same')?.verdict === 'correct' ? 0 : 1]++;
      }
      const sure = Object.values(tab).filter(([a, b]) => a === 0 || b === 0).reduce((s, [a, b]) => s + a + b, 0);
      assert.ok(sure / ps.length <= 0.15, `${id} d${d}: ${(100 * sure / ps.length).toFixed(1)}% of pairs have a look that is always one answer`);
    }
  }
});

test('Twin: an untagged wrong "Same" is one no rule models; a tagged one names a registered rule', () => {
  const ids = new Set(malrules.map((r) => r.id));
  let untagged = 0;
  for (const [id, d] of cells('twin')) for (const p of pool(id, d, 'twin', 200)) {
    const same = (p.choices ?? []).find((c) => c.id === 'same');
    if (!same || same.verdict === 'correct') continue;
    if (same.malrule === undefined) untagged++;
    else assert.ok(ids.has(same.malrule), `${id}: ${same.malrule}`);
  }
  assert.ok(untagged > 50, `only ${untagged} near-miss pairs`);
});

// ---------------------------------------------------------------- Forge, Why, numbers

test('Forge (offered faces): the key is not the only form of 1 / form of 0 on offer', () => {
  for (const id of ['frac-equivalence.core', 'identity-moves.core', 'rationalize-denominator.core']) {
    const g = gen(id);
    for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const p of pool(id, d, 'forge', 200, (i) => i % 2)) {
      const cs = p.choices ?? [];
      assert.ok(cs.some((c) => c.verdict === 'legal-idle'), `${id} d${d} seed ${p.seed}: no second legal form`);
      assert.equal(cs.filter((c) => c.verdict === 'correct').length, 1);
      assert.equal(new Set(cs.map((c) => print(/** @type {Node} */ (c.display)))).size, cs.length);
    }
  }
});

test('counting Why: the target is not the only bracket or fraction, and not always at one place (except the disclosed distribute Why)', () => {
  for (const [id, d] of cells('why')) {
    if (id === 'distribute.core') continue; // KNOWN, reported: "-1(b x + c)", a tap on the only digit 1
    let onlyMarked = 0; let whole = 0; let literal = 0;
    const places = new Set();
    const ps = pool(id, d, 'why', 300);
    for (const p of ps) {
      const k = key(p);
      const want = p.variant === 'hidden-1' ? '1' : '0';
      const marked = (p.choices ?? []).filter((c) => { const t = /** @type {Node} */ (c.display).t; return t === 'group' || t === 'frac'; });
      if (marked.length === 1 && marked[0] === k) onlyMarked++;
      if (k.id === 'e') whole++;
      if (print(/** @type {Node} */ (k.display)) === want) literal++;
      places.add(k.id);
    }
    const worst = Math.max(onlyMarked, whole, literal) / ps.length;
    assert.ok(worst <= 0.9 && !(places.size === 1 && worst > 0.5), `${id} d${d}: only bracket ${onlyMarked}, whole ${whole}, literal ${literal} of ${ps.length}; places ${[...places]}`);
  }
});

test('sqrt-product-rule: every number shown is under 400', () => {
  for (const it of /** @type {Interaction[]} */ (['twin', 'strike', 'why'])) for (const p of pool('sqrt-product-rule.core', 1, it, 400)) {
    const shown = [p.prompt.math, p.prompt.twin, ...(p.steps ?? []).map((s) => s.line), ...(p.choices ?? []).map((c) => c.display)].filter(Boolean).map((x) => print(/** @type {Node} */ (x))).join(' ');
    for (const m of shown.match(/\d+/g) ?? []) assert.ok(Number(m) < 400, `${it} seed ${p.seed}: ${m} in ${shown}`);
  }
});

test('worked chains: every item of every generator but solution-meaning carries at least 2 lines', () => {
  for (const g of generators) {
    if (g.id === 'solution-meaning.core') continue; // a substitution check is not a chain of lines (its header)
    for (const it of g.interactions) for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const p of pool(g.id, d, it, 40, (i) => (it === 'forge' ? i % 2 : i % 4))) {
      assert.ok((p.steps ?? []).length >= 2, `${g.id} d${d} ${it} seed ${p.seed}: ${(p.steps ?? []).length} lines`);
    }
  }
});

test('goals: no bare "coin", "Lantern", "bracket" or "under the root" (section 9 vocabulary)', () => {
  for (const g of generators) for (const it of g.interactions) for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const p of pool(g.id, d, it, 30)) {
    assert.doesNotMatch(p.prompt.goal ?? '', /\bcoin\b|\bLantern\b|\bbracket\b|under the root/, `${g.id} ${it}`);
  }
});
