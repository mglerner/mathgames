// node _runforms.mjs N [idFilter] -> typed forms judged outside their intended verdicts (scratch runner)
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { print } from '../../../src/math/print.js';
import { followUp } from '../../../src/gen/common.js';
import { judge } from '../../../src/check/judge.js';
import { answerText } from '../../../src/check/answer-spec.js';
import { typedForms, unfinishedForms } from './_forms.js';
const IDS = ['exp-meaning.core','exp-product-quotient.core','exp-power-rules.core','exp-zero-negative.core','square-roots.core','simplify-radicals.core','rational-exponents.core','rational-exponents.forge','sqrt-product-rule.d2plus','rationalize-denominator.d2plus'];
const N = Number(process.argv[2] ?? 200); const only = process.argv[3];
const agg = new Map(); const seen = new Set(); let judged = 0;
for (const g of generators) {
  if (!IDS.includes(g.id) || (only && !g.id.includes(only))) continue;
  for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < N; s++) {
    const seed = `o${s}`; const f = s % 4;
    const p0 = g.generate(makeRng(seed), { difficulty: d, interaction: it, fadeLevel: f });
    if (it === 'why') continue;
    const p = it === 'twin' ? followUp(p0) : p0;
    if (!p.constructed) continue;
    const kt = answerText(p.answer); const pt = print(p.prompt.math);
    const sig = `${g.id}|${d}|${it}|${p.variant}|${pt}|${p0.prompt.twin ? print(p0.prompt.twin) : ''}|${kt}|${p.prompt.goal}`;
    if (seen.has(sig)) continue; seen.add(sig);
    for (const fm of [...typedForms(p, kt, pt), ...unfinishedForms(p, kt, pt)]) {
      const r = judge(p, fm.text); judged++;
      if (!fm.want.has(r.verdict)) {
        const k = `${g.id}|d${d}|${it}|${fm.why}|${r.verdict}`; const a = agg.get(k) ?? { n: 0, ex: [] }; a.n++;
        if (a.ex.length < 4) a.ex.push(`seed=${seed} f${f} prompt "${pt}" key "${kt}" typed "${fm.text}" -> ${r.verdict} ${r.note ?? ''}`); agg.set(k, a);
      }
    }
  }
}
console.log('distinct items', seen.size, 'judged', judged);
for (const [k, r] of [...agg].sort()) console.log(r.n, k, '\n    ' + r.ex.join('\n    '));
