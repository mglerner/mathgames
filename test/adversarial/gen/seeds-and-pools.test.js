// Adversarial (M1b review): documented teacher-example seeds really give the
// stated items (recomputed with the independent oracle), and pool-level spec
// guarantees: rationalize d1 radicands squarefree, quadratic-to-standard d1-2
// integer roots, Twin pools near 50% equivalent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { print } from '../../../src/math/print.js';
import { judge } from '../../../src/check/judge.js';
import { diagnoseJudged } from '../../../src/misc/diagnose.js';
import { solveEq, sToQ, qstr, walk, ev, sStr, sameValue } from './_oracle.js';
import * as ftw from '../../../src/gen/mint/frac-times-whole.core.js';
import * as quad from '../../../src/gen/arch/quadratic-to-standard.core.js';
import * as rat from '../../../src/gen/stacks-roots/rationalize-denominator.core.js';
import * as sq from '../../../src/gen/stacks-roots/sqrt-squared.core.js';
import * as spr from '../../../src/gen/stacks-roots/sqrt-product-rule.core.js';
import * as sm from '../../../src/gen/scales/solution-meaning.core.js';

const SEEDS = Number(process.env.ADV_GEN_SEEDS ?? 3000);
const gen1 = (mod, seed, d, it, f = 0) => mod.default.generate(makeRng(seed), { difficulty: d, interaction: it, fadeLevel: f });
const val = (n) => sStr(ev(n));
const tags = (p, t) => { const j = judge(p, t); return [j.verdict, diagnoseJudged(p, j).misconceptions.join(',')]; };

test('seeds: 4 x 1/3 (frac-times-whole EXAMPLE_SEED) and its section 5 numbers', () => {
  for (const it of ftw.default.interactions) for (const f of [0, 1, 2, 3]) {
    const p = gen1(ftw, ftw.EXAMPLE_SEED, 1, it, f);
    // (fixer edit, pedagogy finding 3) The Why no longer shows (4/1)(1/3) with the literal 1 as the
    // target: it shows the Stacker's 4/12 taken apart as (4/4)(1/3), whose value is 1/3, and the
    // target is the form of 1. Every other interaction still shows 4 x 1/3.
    assert.equal(val(p.prompt.math), it === 'why' ? '1/3' : '4/3', `${it} f${f}: ${print(p.prompt.math)}`);
  }
  const s = gen1(ftw, ftw.EXAMPLE_SEED, 1, 'strike', 2);
  assert.deepEqual(tags(s, '4/3'), ['correct', '']);
  assert.deepEqual(tags(s, '1/12'), ['wrong', 'scalar-into-denominator']);
  assert.deepEqual(tags(s, '4/12'), ['wrong', 'scalar-times-both-parts']);
});

test('seeds: 6 + 4x = 2x^2 (d1, roots 3 and -1) and 4 + 4x = 2x^2 (d3, roots 1 +- sqrt 3)', () => {
  const p1 = gen1(quad, quad.EXAMPLE_SEED_D1, 1, 'strike', 2);
  assert.equal(print(p1.prompt.math), '6 + 4x = 2x^2');
  assert.deepEqual(solveEq(p1.prompt.math).roots.map(sStr).sort(), ['-1', '3']);
  assert.deepEqual(tags(p1, '2, -4, -6'), ['correct', '']);
  assert.deepEqual(tags(p1, '2, 4, 6'), ['wrong', 'copy-coefficients']);
  const p3 = gen1(quad, quad.EXAMPLE_SEED_D3, 3, 'strike', 2);
  assert.equal(print(p3.prompt.math), '4 + 4x = 2x^2');
  assert.deepEqual(solveEq(p3.prompt.math).roots.map(sStr).sort(), ['1 + -1*sqrt(3)', '1 + 1*sqrt(3)']);
});

test('seeds: 6/sqrt(3), sqrt(3)sqrt(3), sqrt(9 + 16), sqrt(4 x 9), 3 + 4 = [ ] + 2', () => {
  const r = gen1(rat, rat.EXAMPLE_SEED, 1, 'strike', 2);
  assert.equal(print(r.prompt.math), '6/sqrt(3)');
  assert.deepEqual(tags(r, '2sqrt(3)'), ['correct', '']);
  for (const [t, rule] of [['6', 'one-part-coin'], ['2', 'one-part-coin'], ['6sqrt(3)/9', 'root-square-overshoot'], ['4', 'half-power-is-half']]) assert.deepEqual(tags(r, t), ['wrong', rule], t);
  const s = gen1(sq, sq.EXAMPLE_SEED, 1, 'strike', 2);
  assert.equal(print(s.prompt.math), 'sqrt(3)sqrt(3)');
  assert.deepEqual(tags(s, '9'), ['wrong', 'root-square-overshoot']);
  const sum = gen1(spr, spr.SUM_SEED, 1, 'twin', 0);
  assert.equal(`${print(sum.prompt.math)} ~ ${print(sum.prompt.twin)}`, 'sqrt(9 + 16) ~ sqrt(9) + sqrt(16)');
  assert.equal(sum.choices.find((c) => c.id === 'same').malrule, 'sqrt-splits-sum');
  assert.deepEqual(sum.answer.expected.map(val), ['5', '7']);
  const prod = gen1(spr, spr.PRODUCT_SEED, 1, 'twin', 0);
  assert.ok(sameValue(prod.prompt.math, prod.prompt.twin));
  assert.equal(val(prod.prompt.math), '6');
  const b = gen1(sm, sm.EXAMPLE_SEED, 1, 'strike', 2);
  assert.equal(print(b.prompt.math), '3 + 4 = _ + 2');
  assert.deepEqual(tags(b, '5'), ['correct', '']);
  assert.deepEqual(tags(b, '7'), ['wrong', 'equals-as-operator']);
  assert.deepEqual(tags(b, '9'), ['wrong', '']);
});

const squarefree = (n) => { for (let p = 2n; p * p <= n; p++) if (n % (p * p) === 0n) return false; return true; };
test(`pools: rationalize d1 radicands squarefree; quadratic d1-2 integer roots; Twin ~50% equivalent (${SEEDS} seeds)`, () => {
  const bad = [];
  for (const g of generators) for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) {
    let same = 0;
    for (let s = 0; s < SEEDS; s++) {
      const p = g.generate(makeRng('pl' + s), { difficulty: d, interaction: it, fadeLevel: s % 4 });
      if (g.id === 'rationalize-denominator.core') walk(p.prompt.math, (n) => { if (n.t === 'root' && n.radicand.t === 'num' && !squarefree(n.radicand.q.n)) bad.push(`radicand ${print(p.prompt.math)}`); });
      if (g.id === 'quadratic-to-standard.core' && d <= 2 && p.prompt.math.t === 'eq') {
        const sol = solveEq(p.prompt.math);
        if (!sol || sol.kind !== 'finite' || sol.roots.length !== 2 || sol.roots.some((r) => { const q = sToQ(r); return !q || q.d !== 1n || qstr(q) === '0' || qstr(q) === '1'; })) bad.push(`roots d${d} ${it} ${print(p.prompt.math)}`);
      }
      if (it === 'twin' && p.choices.find((c) => c.id === 'same').verdict === 'correct') same++;
    }
    if (it === 'twin' && (same / SEEDS < 0.4 || same / SEEDS > 0.6)) bad.push(`${g.id} d${d} twin share ${same / SEEDS}`);
  }
  assert.deepEqual(bad.slice(0, 10), []);
});
