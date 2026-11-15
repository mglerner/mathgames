// node _run.mjs N [idFilter]  -> aggregated oracle issues per cell (scratch runner for the 20000-seed sweep)
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { print } from '../../../src/math/print.js';
import { checkItem } from './_check.js';
export const IDS = ['exp-meaning.core','exp-product-quotient.core','exp-power-rules.core','exp-zero-negative.core','square-roots.core','simplify-radicals.core','rational-exponents.core','rational-exponents.forge','sqrt-product-rule.d2plus','rationalize-denominator.d2plus'];
const N = Number(process.argv[2] ?? 200); const only = process.argv[3];
const agg = new Map(); let items = 0; const cache = new Map();
const P = (x) => { try { return print(x); } catch { return '?'; } };
for (const g of generators) {
  if (!IDS.includes(g.id) || (only && !g.id.includes(only))) continue;
  for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let s = 0; s < N; s++) {
    const seed = `o${s}`; const f = s % 4;
    let p; try { p = g.generate(makeRng(seed), { difficulty: d, interaction: it, fadeLevel: f }); } catch (e) { const k = `${g.id}|d${d}|${it}|THROW`; const r = agg.get(k) ?? { n: 0, ex: [] }; r.n++; if (r.ex.length < 2) r.ex.push(seed + ' ' + e.message); agg.set(k, r); continue; }
    items++;
    const sig = JSON.stringify(p, (k, v) => (typeof v === 'bigint' ? String(v) : (k === 'id' && typeof v === 'string' && v.includes('@')) || k === 'seed' || k === 'fadeLevel' || k === 'constructed' || k === 'visuals' ? undefined : v));
    let iss = cache.get(sig);
    if (!iss) { try { iss = checkItem(p); } catch (e) { iss = [{ code: 'CHECK-CRASH', msg: e.stack.split('\n').slice(0, 3).join(' ') }]; } if (cache.size < 300000) cache.set(sig, iss); }
    for (const i of iss) { const k = `${g.id}|d${d}|${it}|${i.code}`; const r = agg.get(k) ?? { n: 0, ex: [] }; r.n++; if (r.ex.length < 3) r.ex.push(`seed=${seed} f${f}: ${P(p.prompt.math)}${p.prompt.twin ? ' :: ' + P(p.prompt.twin) : ''} -- ${i.msg}`); agg.set(k, r); }
  }
}
console.log('items', items);
for (const [k, r] of [...agg].sort()) console.log(r.n, k, '\n    ' + r.ex.join('\n    '));
