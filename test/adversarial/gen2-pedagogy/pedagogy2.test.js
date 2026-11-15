// Adversarial pedagogy review of the second-round generators (lens: a math
// teacher who knows this learner). A test marked todo demonstrates an unfixed
// defect ("finding N" in the review report); un-todo it when the generator is
// fixed. At most 600 seeds per cell. No floats enter a math check: the only
// ratios here are tallies of how often a surface rule finds the key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDS, gen, make, show, shape, isOk } from './_lib.js';
import { evaluate } from '../../../src/math/evaluate.js';
import { seq } from '../../../src/math/surd.js';
import { q } from '../../../src/math/rational.js';

const N = 600;
const cellsOf = (id) => { const g = gen(id); const ds = []; for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) ds.push(d); return { g, ds }; };
const isSame = (p) => p.choices.find((c) => c.id === 'same').verdict === 'correct';
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const unreduced = (s) => { const m = /^-?(\d+)\/(\d+)$/.exec(s); return !!m && gcd(Number(m[1]), Number(m[2])) !== 1; };
/** share of n items on which rule(p) names the key; rule returns a choice index or -1 */
function hitRate(g, d, it, rule, n = N) {
  let hit = 0;
  for (let i = 0; i < n; i++) { const p = make(g, d, it, i); const k = rule(p); if (k >= 0 && isOk(p.choices[k])) hit++; }
  return hit / n;
}

test('scope: every reviewed generator is registered', () => { for (const id of IDS) gen(id); });

// ---------------------------------------------------------------- false content
test('Twin: on a Different pair the probe named in the goal is a real witness (the two forms differ there)', () => {
  const bad = [];
  for (const id of IDS) {
    const { g, ds } = cellsOf(id); if (!g.interactions.includes('twin')) continue;
    for (const d of ds) for (let i = 0; i < N; i++) {
      const p = make(g, d, 'twin', i);
      if (isSame(p) || p.prompt.math.t === 'eq') continue;
      const m = /at ([a-zA-Z]) = (-?\d+)/.exec(p.prompt.goal || '');
      if (!m) continue;
      const env = { [m[1]]: q(BigInt(m[2]), 1n) };
      let a; let b;
      try { a = evaluate(p.prompt.math, env); b = evaluate(p.prompt.twin, env); } catch { a = undefined; }
      if (!a || !b) { bad.push(`${id} d${d} ${p.seed}: not evaluable at the probe`); continue; }
      if (seq(a, b)) bad.push(`${id} d${d} ${p.seed}: ${show(p.prompt.math)} vs ${show(p.prompt.twin)} agree at ${m[1]} = ${m[2]}`);
    }
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

// ---------------------------------------------------------------- surface tells
test('frac-add-sub / frac-mult-div Twin: "the lone fraction is not in lowest terms" does not settle the pair', () => {
  const out = [];
  for (const id of ['frac-add-sub.core', 'frac-mult-div.core']) {
    const { g, ds } = cellsOf(id);
    for (const d of ds) {
      const t = [[0, 0], [0, 0]]; // [reduced?][same?]
      for (let i = 0; i < N; i++) { const p = make(g, d, 'twin', i); t[unreduced(show(p.prompt.twin)) ? 1 : 0][isSame(p) ? 1 : 0]++; }
      const acc = (Math.max(...t[0]) + Math.max(...t[1])) / N;
      if (acc >= 0.7) out.push(`${id} d${d}: ${Math.round(100 * acc)}% (unreduced: ${t[1][0]} Different / ${t[1][1]} Same)`);
    }
  }
  assert.deepEqual(out, []);
});

// Measured over all 18 generators once (600 + 600 seeds, 8 minutes); only the cells that crossed 70% are kept here.
const SHAPE_CELLS = [['signed-arith.core', 2], ['signed-arith.core', 3], ['order-of-ops.core', 3], ['clear-fractions.core', 2], ['clear-fractions.core', 4], ['rational-exponents.core', 2], ['rational-exponents.core', 3], ['rational-exponents.core', 4]];
test('Twin: a shape table learned on 300 seeds does not decide 70% of 300 fresh seeds', () => {
  const out = []; const N = 300;
  {
    for (const [id, d] of SHAPE_CELLS) {
      const g = gen(id);
      const tab = {}; let same = 0;
      const key = (p) => shape(p.prompt.math) + '|' + shape(p.prompt.twin);
      for (let i = 0; i < N; i++) { const p = make(g, d, 'twin', i, 'train'); const k = key(p); tab[k] ||= [0, 0]; tab[k][isSame(p) ? 1 : 0]++; if (isSame(p)) same++; }
      const dflt = same * 2 >= N;
      let hit = 0;
      for (let i = 0; i < N; i++) { const p = make(g, d, 'twin', i, 'fresh'); const t = tab[key(p)]; const guess = t ? t[1] >= t[0] : dflt; if (guess === isSame(p)) hit++; }
      if (hit / N >= 0.7) out.push(`${id} d${d}: ${Math.round(100 * hit / N)}%`);
    }
  }
  assert.deepEqual(out, []);
});

test('combine-like-terms d3 Next Line: "the constant with the odd sign out" does not find the key', () => {
  const g = gen('combine-like-terms.core');
  const rule = (p) => {
    const neg = p.choices.map((c) => / - \d+$/.test(show(c.display)));
    const n = neg.filter(Boolean).length;
    if (n === 1) return neg.indexOf(true);
    if (n === p.choices.length - 1) return neg.indexOf(false);
    return -1;
  };
  const r = hitRate(g, 3, 'nextline', rule);
  assert.ok(r < 0.5, `odd-sign rule finds the key on ${Math.round(100 * r)}% of d3 Next Lines`);
});

test('rational-exponents.forge: the key is not the same option on every item', () => {
  const g = gen('rational-exponents.forge'); const keys = new Set();
  for (const d of [1, 2]) for (let i = 0; i < N; i++) keys.add(show(make(g, d, 'forge', i).answer.expected));
  assert.ok(keys.size > 1, `every key is ${[...keys][0]}`);
});

test('counting Why: the target is not the one longest tap target on over 80% of a cell', { todo: 'finding 5' }, () => {
  const out = [];
  for (const id of IDS) {
    const { g, ds } = cellsOf(id); if (!g.interactions.includes('why')) continue;
    for (const d of ds) {
      const r = hitRate(g, d, 'why', (p) => { const L = p.choices.map((c) => show(c.display).length); const m = Math.max(...L); return L.filter((x) => x === m).length === 1 ? L.indexOf(m) : -1; });
      if (r > 0.8) out.push(`${id} d${d}: ${Math.round(100 * r)}%`);
    }
  }
  assert.deepEqual(out, []);
});

test('clear-fractions Cast d1: "the only multiply chip" does not find the key', () => {
  const g = gen('clear-fractions.core');
  const r = hitRate(g, 1, 'cast', (p) => { const m = p.choices.map((c, j) => (c.display.op === 'mul' && show(c.display) !== 'MOVE mul 0' ? j : -1)).filter((j) => j >= 0); return m.length === 1 ? m[0] : -1; });
  assert.ok(r < 0.8, `${Math.round(100 * r)}%`);
});

// ---------------------------------------------------------------- difficulty
test('counting Why: the items change with the difficulty (d1 does not serve the same items as d4)', () => {
  const out = [];
  for (const id of IDS) {
    const { g, ds } = cellsOf(id); if (!g.interactions.includes('why') || ds.length < 2) continue;
    const lo = ds[0]; const hi = ds[ds.length - 1]; let same = 0;
    for (let i = 0; i < 200; i++) if (show(make(g, lo, 'why', i).prompt.math) === show(make(g, hi, 'why', i).prompt.math)) same++;
    if (same >= 100) out.push(`${id}: ${same}/200 seeds give the same Why at d${lo} and d${hi}`);
  }
  assert.deepEqual(out, []);
});

// ---------------------------------------------------------------- worked steps
test('frac-mult-div: the worked chain of a division shows the form of 1 that turns it into a product', () => {
  const g = gen('frac-mult-div.core'); let missing = 0;
  for (let i = 0; i < 200; i++) {
    const p = make(g, 3, 'strike', i);
    // a form of 1 is a fraction whose top and bottom print alike
    const has = (n) => !!n && typeof n === 'object' && ((n.t === 'frac' && show(n.num) === show(n.den)) || Object.values(n).some((v) => (Array.isArray(v) ? v.some(has) : has(v))));
    if (!p.steps.some((s) => has(s.line))) missing++;
  }
  assert.equal(missing, 0, `${missing}/200 chains go from the quotient straight to "times the reciprocal"`);
});

// Corrected by the fixer: the original accepted only a last LINE "x = ...".
// Every worked step must be legal (same solution set as the line before,
// test/gen/harness.js checkSteps), and one line "x = E" with E free of x has
// exactly one root, while x^2 = p has two (or none): no legal chain can end
// that way. The chain now ends on x^2 = 7^2 and its Step.reason states both
// solutions ("x = 7 or x = -7") or that there is no solution; the test reads that.
test('square-roots Solve: the worked chain reaches the solutions ("x = ... or x = ...") or says there are none', () => {
  const g = gen('square-roots.core'); let short = 0; let solves = 0;
  for (const d of [1, 2, 3, 4]) for (let i = 0; i < 150; i++) {
    const p = make(g, d, 'strike', i); if (p.prompt.verb !== 'Solve') continue; solves++;
    const last = p.steps[p.steps.length - 1];
    const line = last.line.t === 'eq' && show(last.line.lhs) === 'x' && !show(last.line.rhs).includes('x');
    const said = /x = \S+ or x = \S+|no solution/.test(last.reason ?? '');
    if (!line && !said) short++;
  }
  assert.equal(short, 0, `${short}/${solves} Solve chains stop at "x^2 = ..."`);
});

test('literal-equations: problem.steps is a worked solution (equation lines), not a substitution check', { todo: 'finding 9' }, () => {
  const g = gen('literal-equations.core'); let n = 0;
  for (const d of [1, 2, 3, 4]) for (let i = 0; i < 100; i++) if (!make(g, d, 'strike', i).steps.some((s) => s.line.t === 'eq')) n++;
  assert.equal(n, 0, `${n}/400 Strike items carry no equation line in their worked steps`);
});

test('clear-fractions d1-d2: the worked chain shows the multiplier on every term before the cleared line', () => {
  const g = gen('clear-fractions.core'); let n = 0;
  for (const d of [1, 2]) for (let i = 0; i < 200; i++) {
    const p = make(g, d, 'strike', i);
    if (show(p.steps[1].line).includes('/') === false && !/\d\(/.test(show(p.steps[1].line))) n++;
  }
  assert.equal(n, 0, `${n}/400 chains jump from the fraction line to the cleared line`);
});

// ---------------------------------------------------------------- wording
function strings(id) {
  const { g, ds } = cellsOf(id); const out = new Set();
  for (const d of ds) for (const it of g.interactions) for (let i = 0; i < 60; i++) {
    const p = make(g, d, it, i); out.add(p.prompt.verb); if (p.prompt.goal) out.add(p.prompt.goal);
    for (const s of p.steps || []) if (s.reason) out.add(s.reason);
  }
  return [...out];
}
test('wording: no prompt says "cancel" or "move ... over"', () => {
  const out = [];
  for (const id of IDS) for (const s of strings(id)) if (/\bcancel|move (it|the term) over/i.test(s)) out.push(`${id}: ${s}`);
  assert.deepEqual(out, []);
});
test('rational-exponents: some prompt or step reason ties a^(1/2) to "the number whose square is a"', () => {
  const all = [...strings('rational-exponents.core'), ...strings('rational-exponents.forge')];
  assert.ok(all.some((s) => /whose square|square root|squared? (is|gives)/i.test(s)), 'the only instructions are "Add the exponents" / "Multiply the exponents"');
});
test('worked steps carry a classroom-vocabulary reason on at least one generator', () => {
  let withReason = 0;
  for (const id of IDS) { const { g, ds } = cellsOf(id); const it = g.interactions.includes('strike') ? 'strike' : g.interactions[0]; for (let i = 0; i < 20; i++) if ((make(g, ds[0], it, i).steps || []).some((s) => s.reason)) { withReason++; break; } }
  assert.ok(withReason > 0, 'no reviewed generator sets Step.reason on any line');
});

// ---------------------------------------------------------------- the same coin, the same zero-pair
test('form of 1 / form of 0: the new Forge and Why items draw the same coin and zero-pair as the first slice', () => {
  const coin = (p) => p.visuals.includes('coin'); const zp = (p) => p.visuals.includes('zeropair');
  for (const [id, it] of [['frac-add-sub.core', 'forge'], ['rationalize-denominator.d2plus', 'forge'], ['frac-add-sub.core', 'why'], ['clear-fractions.core', 'why'], ['factor-gcf.core', 'why'], ['rationalize-denominator.d2plus', 'why']]) {
    const { g, ds } = cellsOf(id);
    for (const d of ds) for (let i = 0; i < 100; i += 4) { // fade 0: representations shown
      const p = make(g, d, it, i); assert.ok(coin(p), `${id} d${d} ${it} ${p.seed}: no coin`);
      const key = p.choices.find(isOk).display; const k = key.t === 'group' ? key.arg : key;
      assert.equal(k.t, 'frac'); assert.equal(show(k.num), show(k.den), `${id} ${p.seed}: the 1 is not written n/n`);
    }
  }
  for (const id of ['signed-arith.core', 'combine-like-terms.core']) {
    const { g, ds } = cellsOf(id);
    for (const d of ds) for (let i = 0; i < 100; i += 4) assert.ok(zp(make(g, d, 'why', i)), `${id} d${d}: no zeropair`);
  }
});
