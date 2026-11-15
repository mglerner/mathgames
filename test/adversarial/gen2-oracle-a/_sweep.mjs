// Sweep runner: node _sweep.mjs <generator-id> [seeds=20000] [skipJudge]
// Generates every difficulty x interaction cell for one generator at seeds
// "s0".."s<N-1>" (fade levels 0-3 in rotation, like the harness) and prints
// aggregated oracle issues with up to 3 replayable examples each.
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { checkItem } from './_check.js';

const id = process.argv[2];
const N = Number(process.argv[3] ?? 20000);
const skipJudge = process.argv[4] === 'skipJudge';
const g = generators.find((x) => x.id === id);
if (!g) { console.error(`no generator ${id}`); process.exit(2); }
const agg = new Map();
let items = 0;
const t0 = Date.now();
for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) {
  for (const it of g.interactions) {
    for (let s = 0; s < N; s++) {
      const seed = `s${s}`; const f = s % 4;
      let p;
      try { p = g.generate(makeRng(seed), { difficulty: d, interaction: it, fadeLevel: f }); } catch (e) {
        const k = `d${d}|${it}|GENERATE-THROWS`; const r = agg.get(k) ?? { n: 0, ex: [] }; r.n++; if (r.ex.length < 3) r.ex.push(`seed=${seed} f${f}: ${e.message}`); agg.set(k, r); continue;
      }
      items++;
      let iss;
      try { iss = checkItem(p, { skipJudge }); } catch (e) { iss = [{ code: 'CHECK-CRASH', msg: e.stack.split('\n').slice(0, 3).join(' ') }]; }
      for (const i of iss) {
        const k = `d${d}|${it}|${i.code}`; const r = agg.get(k) ?? { n: 0, ex: [] }; r.n++;
        if (r.ex.length < 3) r.ex.push(`seed=${seed} f${f}: ${i.msg}`); agg.set(k, r);
      }
    }
  }
}
console.log(`${id}: ${items} items, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const [k, r] of [...agg].sort()) console.log(`${r.n} ${id}|${k}\n    ${r.ex.join('\n    ')}`);
