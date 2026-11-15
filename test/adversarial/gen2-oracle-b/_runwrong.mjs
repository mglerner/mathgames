// node _runwrong.mjs N [filter]: wrong typed answers (own mal-rule models, key +- 1, -key, key/2, key x 2) must not be correct / form
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { print } from '../../../src/math/print.js';
import { followUp } from '../../../src/gen/common.js';
import { judge } from '../../../src/check/judge.js';
import { answerText } from '../../../src/check/answer-spec.js';
import { MAL, N, compare, envs, varsIn, F, stripGroup as un } from './_oracle.js';
const IDS = ['exp-meaning.core','exp-product-quotient.core','exp-power-rules.core','exp-zero-negative.core','square-roots.core','simplify-radicals.core','rational-exponents.core','rational-exponents.forge','sqrt-product-rule.d2plus','rationalize-denominator.d2plus'];
const NS = Number(process.argv[2] ?? 200); const only = process.argv[3];
const agg = new Map(); const seen = new Set(); let judged = 0;
for (const g of generators) {
  if (!IDS.includes(g.id) || (only && !g.id.includes(only))) continue;
  for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < NS; s++) {
    const p0 = g.generate(makeRng(`o${s}`), { difficulty: d, interaction: it, fadeLevel: 2 + (s % 2) });
    if (it === 'why') continue;
    const p = it === 'twin' ? followUp(p0) : p0;
    if (!p.constructed || p.answer.kind !== 'expr') continue;
    const sig = `${g.id}|${d}|${it}|${print(p.prompt.math)}|${answerText(p.answer)}|${p.prompt.goal}`;
    if (seen.has(sig)) continue; seen.add(sig);
    const key = p.answer.expected;
    const as = [...p.assumptions, ...p.answer.assumptions];
    const es = envs([...varsIn(key), ...varsIn(p.prompt.math)].filter((v, i, a) => a.indexOf(v) === i), as);
    const cands = [N.add(key, N.num(1n)), N.neg(key), N.frac(key, N.num(2n)), N.mul(N.num(2n), key)];
    if (p.variant !== 'fill-blank' && p.variant !== 'lantern' && it !== 'twin') for (const [id, f] of Object.entries(MAL)) for (const o of f(p.prompt.math)) cands.push(o);
    for (const c of cands) {
      let cmp; try { cmp = compare(c, key, es); } catch { continue; }
      if (cmp.same || cmp.compared === 0) continue;
      let text; try { text = print(c); } catch { continue; }
      const r = judge(p, text); judged++;
      if (r.verdict === 'correct' || r.verdict === 'form') {
        const k = `${g.id}|d${d}|${it}|${r.verdict}`; const a = agg.get(k) ?? { n: 0, ex: [] }; a.n++;
        if (a.ex.length < 4) a.ex.push(`o${s} prompt "${print(p.prompt.math)}" key "${answerText(p.answer)}" typed "${text}" -> ${r.verdict} ${r.note ?? ''}`); agg.set(k, a);
      }
    }
  }
}
console.log('distinct', seen.size, 'judged', judged);
for (const [k, r] of [...agg].sort()) console.log(r.n, k, '\n    ' + r.ex.join('\n    '));
