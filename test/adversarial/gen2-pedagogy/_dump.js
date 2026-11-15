// Usage: node _dump.js <genId> [N] [interaction] [difficulty]
import { gen, make, line } from './_lib.js';
const [, , id, nArg = '40', iF = '', dF = ''] = process.argv;
const g = gen(id);
for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) {
  if (iF && it !== iF) continue; if (dF && String(d) !== dF) continue;
  console.log(`\n===== ${g.id} d${d} ${it}`);
  for (let i = 0; i < Number(nArg); i++) console.log(line(make(g, d, it, i), true));
}
