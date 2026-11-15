import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { checkProblem } from './_check.js';
const N = Number(process.argv[2] ?? 500); const only = process.argv[3];
const agg = new Map(); let items = 0;
for (const g of generators) {
  if (only && !g.id.includes(only)) continue;
  for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < N; s++) {
    const seed = `adv-${s}`; const f = s % 4;
    let p; try { p = g.generate(makeRng(seed), { difficulty: d, interaction: it, fadeLevel: f }); } catch (e) { const k = `${g.id}|d${d}|${it}|THROW`; agg.set(k, { n: (agg.get(k)?.n ?? 0) + 1, ex: [e.message] }); continue; }
    items++;
    let iss; try { iss = checkProblem(p); } catch (e) { iss = [{ code: 'CHECK-CRASH', msg: e.stack.split('\n').slice(0, 3).join(' ') }]; }
    for (const i of iss) { const k = `${g.id}|d${d}|${it}|${i.code}`; const r = agg.get(k) ?? { n: 0, ex: [] }; r.n++; if (r.ex.length < 3) r.ex.push(`seed=${seed} f${f}: ${i.msg}`); agg.set(k, r); }
  }
}
console.log('items', items);
for (const [k, r] of [...agg].sort()) console.log(r.n, k, '\n    ' + r.ex.join('\n    '));
