// Runs the independent buggy students (_students.js) over every generator's
// constructed items and reports, per typed answer, whether the detector
// tagged it with that rule and only it. Shared by detector.test.js and
// findings.test.js.
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { judge } from '../../../src/check/judge.js';
import { diagnoseJudged } from '../../../src/misc/diagnose.js';
import { print } from '../../../src/math/print.js';
import { students } from './_students.js';
import { hasRoot } from './_oracle.js';

/** Known detector gaps: (rule, problem) -> finding label, or undefined. */
export function gapOf(rid, p) {
  const m = p.prompt.math;
  if (rid === 'one-part-coin' && (p.gen === 'frac-equivalence.core' || p.gen === 'identity-moves.core') && p.interaction === 'strike') return 'finding 2';
  if (p.gen === 'equivalent-expressions.core' && p.interaction === 'predict') return 'finding 3';
  if (rid === 'partial-distribution' && p.gen === 'distribute.core' && m.t === 'neg') return 'finding 4';
  if (rid === 'copy-coefficients') return 'finding 10?'; // decided per answer below (a = 0 read)
  return undefined;
}

/**
 * @param {{ seeds: number; only?: (rid: string, p: any) => boolean }} o
 * @returns {{ rid: string; gen: string; it: string; gap: string | undefined; ok: boolean; msg: string }[]}
 */
export function runStudents(o) {
  const res = [];
  for (const g of generators) for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < o.seeds; s++) {
    const p = g.generate(makeRng('st' + s), { difficulty: d, interaction: it, fadeLevel: 2 + (s % 2) });
    if (!p.constructed) continue;
    for (const [rid, model] of Object.entries(students)) {
      if (rid === 'half-power-is-half' && !hasRoot(p.prompt.math)) continue;
      if (o.only && !o.only(rid, p)) continue;
      for (const r of model(p)) {
        let gap = gapOf(rid, p);
        if (gap === 'finding 10?') gap = /^0,/.test(r) ? 'finding 10' : undefined;
        const j = judge(p, r); const dg = diagnoseJudged(p, j);
        const ok = j.verdict === 'wrong' && dg.misconceptions.length === 1 && dg.misconceptions[0] === rid;
        res.push({ rid, gen: g.id, it, gap, ok, msg: `${rid} on ${g.id} d${d} ${it} seed st${s}: ${print(p.prompt.math)} "${p.prompt.goal ?? ''}" typed "${r}" -> ${j.verdict} [${dg.misconceptions}]` });
      }
    }
  }
  return res;
}
