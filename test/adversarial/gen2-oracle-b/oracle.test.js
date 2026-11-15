// Adversarial review (gen2, lens: answer keys, distractors and tags) of the
// exponent and radical generators new in round 2: exp-meaning,
// exp-product-quotient, exp-power-rules, exp-zero-negative, square-roots,
// simplify-radicals, rational-exponents (core + forge), sqrt-product-rule
// d2plus and rationalize-denominator d2plus.
//
// Oracle: ./_oracle.js (own BigInt rationals, own exact field
// Q(sqrt p1, sqrt p2, ...), own evaluator, own quadratic solver, own models
// of the mal-rules that tag these items). Nothing from src/math. Checked per
// item by ./_check.js:
//   - keyed answer: equal to the prompt at probes (nonneg / pos variables get
//     perfect squares 4, 9, 16 plus exact surd points 2, 3, 1/4, 25/9);
//     fill-blank balances; lantern / Twin follow-up value at the named probe;
//     tuple = (first, second) values; solution set = the oracle's roots
//     (two / one / none);
//   - key form: every radicand in a key squarefree > 1; no root in a
//     denominator / anywhere when the predicate says so; lowest terms;
//   - Twin: Same = identity under the stated assumptions, Different = a
//     witness, and one among the ITEM'S OWN probes; a tagged "same"
//     reproduces from its rule (own model, either direction); a form-of-1
//     follow-up key is worth 1 AND joins the forms (N c / N' one rational
//     constant); the named probe is in the section 2 set;
//   - Forge: every option's label recomputed (worth 1? reaches "no root in
//     the denominator"?); one-part-coin = a half of the key coin; the
//     which-power forge balances only for the key;
//   - Why: the correct target is worth 1, no wrong target is; "This is
//     still k" is true;
//   - declarations: a variable under a root / rational power has x >= 0 (or
//     x > 0) declared AND printed in the goal; a variable in a denominator or
//     under a power <= 0 has x != 0 declared and printed; no negative
//     radicand anywhere (prompt, twin, choices, chain, key);
//   - worked chain: every legal line keeps the value / solution set, and it
//     starts at the prompt (or the twin).
// Typed forms (./_forms.js): the key retyped in several reasonable ways is
// judged correct (or form where allowed), never wrong / unverifiable /
// unparsed; equivalent unfinished forms are 'form'; a dropped root is wrong.
//
// The review ran ADV_SEEDS=20000 per generator x difficulty x interaction
// (3.0M items) with no failure. Default here: 300 seeds per cell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { followUp } from '../../../src/gen/common.js';
import { judge } from '../../../src/check/judge.js';
import { diagnoseJudged } from '../../../src/misc/diagnose.js';
import { answerText } from '../../../src/check/answer-spec.js';
import { print } from '../../../src/math/print.js';
import rx, { TEACHER_SEED, HALVER_SEED } from '../../../src/gen/stacks-roots/rational-exponents.core.js';
import { checkItem } from './_check.js';
import { typedForms, unfinishedForms } from './_forms.js';

const SEEDS = Number(process.env.ADV_SEEDS ?? 300);
const IDS = ['exp-meaning.core', 'exp-product-quotient.core', 'exp-power-rules.core', 'exp-zero-negative.core',
  'square-roots.core', 'simplify-radicals.core', 'rational-exponents.core', 'rational-exponents.forge',
  'sqrt-product-rule.d2plus', 'rationalize-denominator.d2plus'];
const INFO = new Set(['tag-unmodelled']); // a tag this oracle has no model for (none seen in review)

for (const id of IDS) {
  const g = generators.find((x) => x.id === id);
  test(`${id}: keys, labels, tags, declarations re-derived (${SEEDS} seeds per cell)`, () => {
    assert.ok(g, `${id} is registered`);
    const fails = [];
    for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < SEEDS; s++) {
      const seed = `o${s}`; const fadeLevel = s % 4;
      const p = g.generate(makeRng(seed), { difficulty: d, interaction: it, fadeLevel });
      for (const i of checkItem(p)) if (!INFO.has(i.code) && fails.length < 15) fails.push(`[d${d} ${it} f${fadeLevel} ${seed}] ${i.code}: ${i.msg}`);
    }
    assert.deepEqual(fails, []);
  });

  test(`${id}: the key typed in reasonable forms is never wrong / unparsed / unverifiable`, () => {
    const fails = []; const seen = new Set();
    for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < SEEDS; s++) {
      if (it === 'why') continue;
      const p0 = g.generate(makeRng(`o${s}`), { difficulty: d, interaction: it, fadeLevel: s % 4 });
      const p = it === 'twin' ? followUp(p0) : p0;
      if (!p.constructed) continue;
      const kt = answerText(p.answer); const pt = print(p.prompt.math);
      const sig = `${d}|${it}|${pt}|${kt}|${p.prompt.goal}`;
      if (seen.has(sig)) continue; seen.add(sig);
      for (const f of [...typedForms(p, kt, pt), ...unfinishedForms(p, kt, pt)]) {
        const r = judge(p, f.text);
        if (!f.want.has(r.verdict) && fails.length < 15) fails.push(`[d${d} ${it} o${s}] key "${kt}" typed "${f.text}" (${f.why}) -> ${r.verdict}`);
      }
    }
    assert.deepEqual(fails, []);
  });
}

test('rational-exponents: the teacher example (a^(1/2))^2 = a is reproducible by TEACHER_SEED', () => {
  for (const it of ['strike', 'predict']) for (const fadeLevel of [0, 3]) {
    const p = rx.generate(makeRng(TEACHER_SEED), { difficulty: 3, interaction: it, fadeLevel });
    assert.equal(print(p.prompt.math), '(a^(1/2))^2');
    assert.deepEqual(p.assumptions, [{ name: 'a', rel: 'nonneg' }]);
    assert.match(p.prompt.goal, /a >= 0/);
    assert.equal(judge(p, 'a').verdict, 'correct');
    for (const t of ['(a^(1/2))^2', 'sqrt(a)sqrt(a)', 'sqrt(a)^2']) assert.equal(judge(p, t).verdict, 'form', t);
    const half = judge(p, 'a^2/4');
    assert.equal(half.verdict, 'wrong');
    assert.deepEqual(diagnoseJudged(p, half).misconceptions, ['half-power-is-half']);
  }
  const t = rx.generate(makeRng(TEACHER_SEED), { difficulty: 3, interaction: 'twin', fadeLevel: 0 });
  assert.equal(print(t.prompt.math), '(a^(1/2))^2');
});

test('rational-exponents: the Halver is present and tagged (HALVER_SEED, and Twin pools at every difficulty)', () => {
  const p = rx.generate(makeRng(HALVER_SEED), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.equal(print(p.prompt.math), '9^(1/2)');
  const r = judge(p, '9/2');
  assert.equal(r.verdict, 'wrong');
  assert.deepEqual(diagnoseJudged(p, r).misconceptions, ['half-power-is-half']);
  for (let d = 1; d <= 4; d++) {
    let tagged = 0;
    for (let s = 0; s < 400; s++) {
      const q = rx.generate(makeRng(`h${s}`), { difficulty: d, interaction: 'twin', fadeLevel: 0 });
      if (q.choices.some((c) => c.malrule === 'half-power-is-half')) tagged++;
    }
    assert.ok(tagged > 0, `d${d}: a Halver Twin within 400 seeds`);
  }
});

test('oracle self-test: a broken key, a swapped Twin label, a false tag and a bad coin are caught', () => {
  const G = (id) => generators.find((x) => x.id === id);
  const codes = (p) => checkItem(p).map((i) => i.code);
  const s = G('simplify-radicals.core').generate(makeRng('o1'), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  assert.ok(codes({ ...s, answer: { ...s.answer, expected: { t: 'num', q: { n: 7n, d: 1n } } } }).includes('key-expr'));
  // unsimplified radicand in a key
  const k = s.answer.expected; // c sqrt(m)
  const bad = { t: 'root', index: 2, radicand: { t: 'num', q: { n: 12n, d: 1n } } };
  assert.ok(codes({ ...s, answer: { ...s.answer, expected: bad } }).some((c) => c === 'key-form' || c === 'key-expr'), print(k));
  // Twin label swap
  const t = G('square-roots.core').generate(makeRng('o1'), { difficulty: 2, interaction: 'twin', fadeLevel: 0 });
  const sw = { ...t, choices: t.choices.map((c) => ({ ...c, verdict: c.verdict === 'correct' ? 'wrong' : 'correct' })) };
  assert.ok(codes(sw).includes('twin-label'));
  // a solution set with one root dropped
  const q = G('square-roots.core').generate(makeRng('o1'), { difficulty: 1, interaction: 'strike', fadeLevel: 3 });
  for (let i = 0; i < 50 && q.answer.kind !== 'solution-set'; i++) Object.assign(q, G('square-roots.core').generate(makeRng(`o${i}`), { difficulty: 1, interaction: 'strike', fadeLevel: 3 }));
  assert.equal(q.answer.kind, 'solution-set');
  const one = { ...q, answer: { ...q.answer, expected: { kind: 'finite', roots: q.answer.expected.roots.slice(1) } } };
  assert.ok(codes(one).includes('key-solution-set'));
  // a false mal-rule tag on a Different Twin
  let dt;
  for (let i = 0; i < 200 && !dt; i++) {
    const x = G('simplify-radicals.core').generate(makeRng(`o${i}`), { difficulty: 1, interaction: 'twin', fadeLevel: 0 });
    if (x.choices.find((c) => c.id === 'different').verdict === 'correct' && !x.choices.some((c) => c.malrule)) dt = x;
  }
  const tagged = { ...dt, choices: dt.choices.map((c) => (c.id === 'same' ? { ...c, malrule: 'sqrt-splits-sum' } : c)) };
  assert.ok(codes(tagged).includes('twin-tag-not-reproduced'));
  // a form-of-1 key that does not join the Twin forms
  let ft;
  for (let i = 0; i < 400 && !ft; i++) {
    const x = G('exp-product-quotient.core').generate(makeRng(`o${i}`), { difficulty: 2, interaction: 'twin', fadeLevel: 3 });
    if (x.answer.kind === 'form-of-1') ft = x;
  }
  const x2 = { t: 'frac', num: { t: 'pow', base: { t: 'var', name: 'x' }, exp: { t: 'num', q: { n: 9n, d: 1n } } }, den: { t: 'pow', base: { t: 'var', name: 'x' }, exp: { t: 'num', q: { n: 9n, d: 1n } } } };
  assert.ok(codes({ ...ft, answer: { ...ft.answer, expected: x2 } }).includes('twin-coin-does-not-join'));
  // Forge: relabel the idle coin as correct
  const f = G('rationalize-denominator.d2plus').generate(makeRng('o1'), { difficulty: 3, interaction: 'forge', fadeLevel: 0 });
  const rl = { ...f, choices: f.choices.map((c) => (c.verdict === 'legal-idle' ? { ...c, verdict: 'correct' } : c.verdict === 'correct' ? { ...c, verdict: 'legal-idle' } : c)) };
  assert.ok(codes(rl).includes('forge-label'));
  // an undeclared variable under a root
  const r3 = rx.generate(makeRng(TEACHER_SEED), { difficulty: 3, interaction: 'strike', fadeLevel: 3 });
  assert.ok(codes({ ...r3, assumptions: [], answer: { ...r3.answer, assumptions: [] } }).includes('undeclared-radical-var'));
});
