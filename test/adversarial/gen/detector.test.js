// Adversarial (M1b review): the detector, from two sides.
//  1. Independent buggy students (_students.js) read only the displayed
//     prompt and TYPE what a real student with that bug types. On every
//     constructed item where the bug shows, the response must be judged
//     wrong and tagged with that rule and only it (known gaps, each a todo
//     test in findings.test.js, are excluded here by _detect.js gapOf()).
//  2. Every one of the 19 mal-rules is separated somewhere (its simulate()
//     student is tagged with it alone on at least one generator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { judge } from '../../../src/check/judge.js';
import { diagnoseJudged, malrules, simulate } from '../../../src/misc/diagnose.js';
import { runStudents } from './_detect.js';

const SEEDS = Number(process.env.ADV_GEN_SEEDS ?? 300);

test(`detector: independent buggy students are tagged with their rule only (${SEEDS} seeds, known gaps excluded)`, () => {
  const res = runStudents({ seeds: SEEDS }).filter((r) => !r.gap);
  assert.ok(res.length > 5000, `too few student answers ran: ${res.length}`);
  const rules = new Set(res.map((r) => r.rid));
  assert.ok(rules.size >= 10, `models exercised: ${[...rules]}`);
  assert.deepEqual(res.filter((r) => !r.ok).slice(0, 15).map((r) => r.msg), []);
});

test('detector: every one of the 19 mal-rules is separated on some generator', () => {
  const sep = new Set();
  for (const g of generators) for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < 120; s++) {
    const p = g.generate(makeRng('sp' + s), { difficulty: d, interaction: it, fadeLevel: s % 4 });
    for (const r of malrules) {
      if (sep.has(r.id)) continue;
      for (const sim of simulate(r, p)) {
        const dg = diagnoseJudged(p, judge(p, sim.response, { tapped: sim.tapped }));
        if (dg.misconceptions.length === 1 && dg.misconceptions[0] === r.id) sep.add(r.id);
      }
    }
  }
  assert.equal(malrules.length, 19);
  assert.deepEqual(malrules.map((r) => r.id).filter((id) => !sep.has(id)), []);
});
