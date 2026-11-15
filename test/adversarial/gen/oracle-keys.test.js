// Adversarial (M1b review): every generator x difficulty x interaction is
// re-derived by an independent exact oracle (_oracle.js: own BigInt
// rationals, surds, rational functions, root finding, move application;
// nothing from src/math). Checked per item (see _check.js): the answer key;
// every choice label (Next Line, Forge, Twin, Cast, Trace, Why); Twin Same =
// exact identity and Different = a witness among the probe values; Cast
// verdicts from re-derived solution sets, minPath replay; Trace lines'
// solution sets line by line; probes never 0 or 1; no negative radicand; no
// solution 0 or 1 (outside one-way items).
//
// Seeds per cell: ADV_GEN_SEEDS (default 1000 so the suite stays quick; the
// review ran 20000 per cell = 3.76M items with no key failure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { checkProblem } from './_check.js';
import { M1B_IDS } from './_scope.js';

const SEEDS = Number(process.env.ADV_GEN_SEEDS ?? 1000);
// Codes that are reported as findings (own todo tests in findings.test.js),
// or that are not defects (documented next to each).
const KNOWN = new Set([
  'cast-verdict', // finding 5: "x 0" on an all-reals line is labelled illegal; checked in findings.test.js
  'trace-wrong-root-01', // finding 9 (minor): a planted chain may end on x = 0 or 1
  'why-wrong-target-also-worth', // not a defect: frac-times-whole "(4/1)(1/3)" has two 1s; the goal names the one hiding in 4
  'goal-probe-not-in-set', // not a defect: solution-meaning "Put x = 6" names the candidate root, not a Lantern probe
]);

// Scoped to the generators this oracle models (see _scope.js for why and for
// the tests that cover the newer ones); a missing id fails below.
test('oracle scope: every M1b generator is still registered', () => {
  assert.deepEqual([...M1B_IDS].filter((id) => !generators.some((g) => g.id === id)), []);
});
for (const g of generators.filter((x) => M1B_IDS.has(x.id))) {
  test(`oracle: ${g.id} keys, labels and displays re-derive (${SEEDS} seeds per cell)`, () => {
    const fails = [];
    for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < SEEDS; s++) {
      const seed = `adv-${s}`; const fadeLevel = s % 4;
      const p = g.generate(makeRng(seed), { difficulty: d, interaction: it, fadeLevel });
      for (const i of checkProblem(p)) if (!KNOWN.has(i.code) && fails.length < 20) fails.push(`[d${d} ${it} f${fadeLevel} seed ${seed}] ${i.code}: ${i.msg}`);
    }
    assert.deepEqual(fails, []);
  });
}

test('oracle self-test: the checker objects to a broken key, label and twin', () => {
  const g = generators.find((x) => x.id === 'frac-times-whole.core');
  const p = g.generate(makeRng('adv-1'), { difficulty: 2, interaction: 'nextline', fadeLevel: 0 });
  const broken = { ...p, answer: { ...p.answer, expected: p.choices.find((c) => c.verdict === 'wrong').display } };
  assert.ok(checkProblem(broken).some((i) => i.code === 'key-wrong-value'));
  const relabel = { ...p, choices: p.choices.map((c) => ({ ...c, verdict: c.verdict === 'correct' ? 'wrong' : 'correct' })) };
  assert.ok(checkProblem(relabel).some((i) => i.code === 'choice-correct-but-wrong'));
  const t = g.generate(makeRng('adv-1'), { difficulty: 2, interaction: 'twin', fadeLevel: 0 });
  const swapped = { ...t, choices: t.choices.map((c) => ({ ...c, verdict: c.verdict === 'correct' ? 'wrong' : 'correct' })) };
  assert.ok(checkProblem(swapped).some((i) => i.code === 'twin-label-wrong'));
  const q = generators.find((x) => x.id === 'solve-linear.core');
  const tr = q.generate(makeRng('adv-3'), { difficulty: 1, interaction: 'trace', fadeLevel: 0 });
  const flipped = { ...tr, choices: tr.choices.map((c) => ({ ...c, verdict: c.id === 'none' ? (c.verdict === 'correct' ? 'wrong' : 'correct') : 'wrong' })) };
  assert.ok(checkProblem(flipped).some((i) => i.code === 'trace-key'));
});
