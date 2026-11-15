// Adversarial (M1b review): tag honesty with INDEPENDENT bug models. Every
// tagged distractor (Next Line, Forge, Twin "same"/"different") and every
// planted Trace line must be reproduced by our own model of that bug
// (_students.js values, _eqbugs.js lines), built from the displayed prompt
// only. A tagged Next Line equation candidate must also not be the output of
// a DIFFERENT modelled line bug. Not modelled independently: the Copyist's
// planted Trace lines (its eight sign patterns are re-checked only through
// diagnose, in detector.test.js on read-abc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { parse } from '../../../src/math/parse.js';
import { print } from '../../../src/math/print.js';
import { students } from './_students.js';
import { bugLines, distLines, matchesAny } from './_eqbugs.js';
import { sameValue, isEq } from './_oracle.js';
import { M1B_IDS } from './_scope.js';

const SEEDS = Number(process.env.ADV_GEN_SEEDS ?? 400);
const LINE_RULES = ['one-sided-operation', 'transpose-no-sign-change', 'transpose-coefficient-as-subtract', 'divide-one-term'];
const valEq = (a, b) => { try { return sameValue(a, b); } catch { return false; } };
const outsOf = (r, p) => (students[r] ? students[r](p).map((s) => parse(s)).filter((x) => x && !x.error) : undefined);

test(`tags: every tagged distractor and planted line reproduces from an independent model of its rule (${SEEDS} seeds)`, () => {
  const fails = []; let checked = 0;
  const fail = (m) => { if (fails.length < 20) fails.push(m); };
  // scoped to the generators these bug models know (see _scope.js; gen2-oracle-a/b check the newer tags)
  assert.deepEqual([...M1B_IDS].filter((id) => !generators.some((g) => g.id === id)), []);
  for (const g of generators.filter((x) => M1B_IDS.has(x.id))) for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < SEEDS; s++) {
    const p = g.generate(makeRng('tg' + s), { difficulty: d, interaction: it, fadeLevel: s % 2 });
    const where = `${g.id} d${d} ${it} seed tg${s}: ${print(p.prompt.math)}${p.prompt.twin ? ' ~ ' + print(p.prompt.twin) : ''}`;
    for (const c of p.choices ?? []) {
      if (!c.malrule || it === 'cast') continue;
      const r = c.malrule; checked++;
      if (it === 'twin') {
        if (r === 'form-change-changes-value') { if (c.id !== 'different' || !valEq(p.prompt.math, p.prompt.twin)) fail(`${where}: Stranger tag on ${c.id}`); continue; }
        if (c.id !== 'same' || valEq(p.prompt.math, p.prompt.twin)) { fail(`${where}: ${r} on ${c.id} of an equivalent pair`); continue; }
        // (fixer edit, pedagogy finding 4 / oracle finding 8) The Half-Coin Twin of frac-equivalence and
        // identity-moves is now the plain fraction against the same fraction with ONE part multiplied
        // by a whole number k > 1 ("the coin reached one part"), so the two forms are written alike.
        // Independent model: exactly one of numerator / denominator is k times the other form's.
        if (r === 'one-part-coin' && (g.id === 'frac-equivalence.core' || g.id === 'identity-moves.core')) {
          const a = p.prompt.math; const b = p.prompt.twin;
          const times = (k, n) => ({ t: 'mul', args: [{ t: 'num', q: { n: BigInt(k), d: 1n } }, n] });
          const ks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
          const top = a.t === 'frac' && b.t === 'frac' && valEq(a.den, b.den) && ks.some((k) => valEq(b.num, times(k, a.num)));
          const bottom = a.t === 'frac' && b.t === 'frac' && valEq(a.num, b.num) && ks.some((k) => valEq(b.den, times(k, a.den)));
          if (top === bottom) fail(`${where}: one-part-coin does not multiply exactly one part`);
          continue;
        }
        const strike = (math) => ({ ...p, interaction: 'strike', prompt: { ...p.prompt, math, goal: '' } });
        const o1 = outsOf(r, strike(p.prompt.math)); const o2 = outsOf(r, strike(p.prompt.twin));
        if (!o1) { fail(`${where}: no model for ${r}`); continue; }
        if (!o1.some((o) => valEq(o, p.prompt.twin)) && !o2.some((o) => valEq(o, p.prompt.math))) fail(`${where}: ${r} does not turn one form into the other`);
        continue;
      }
      if (isEq(c.display) && p.prompt.move) {
        if (!matchesAny(c.display, bugLines(r, p.prompt.math, p.prompt.move))) fail(`${where}: ${print(c.display)} is not a ${r} line`);
        for (const o of LINE_RULES) if (o !== r && matchesAny(c.display, bugLines(o, p.prompt.math, p.prompt.move))) fail(`${where}: ${print(c.display)} [${r}] is also a ${o} line`);
        continue;
      }
      const outs = outsOf(r, p);
      if (!outs) { fail(`${where}: no model for ${r}`); continue; }
      if (!outs.some((o) => valEq(o, c.display))) fail(`${where}: ${print(c.display)} is not a ${r} output`);
    }
    if (it === 'trace') for (let i = 1; i < p.steps.length; i++) {
      const st = p.steps[i]; if (st.legal || st.malrule === 'copy-coefficients') continue;
      const prev = p.steps[i - 1].line; const r = st.malrule; checked++;
      const cands = r === 'partial-distribution' || r === 'neg-distribution' ? distLines(r, prev).filter(isEq) : st.move ? bugLines(r, prev, st.move) : [];
      if (!matchesAny(st.line, cands)) fail(`${where}: L${i} ${print(st.line)} is not a ${r} step from ${print(prev)}`);
    }
  }
  assert.ok(checked > 10000, `checked ${checked}`);
  assert.deepEqual(fails, []);
});
