// Dump N items per generator x difficulty x interaction, as the student would see them.
// Usage: node test/adversarial/gen-pedagogy/dump.js [genIdSubstring] [N] [interaction] [fade]
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { print } from '../../../src/math/print.js';

const [, , filt = '', nArg = '40', iFilt = '', fadeArg = ''] = process.argv;
const N = Number(nArg);
export function show(x) {
  if (x === undefined) return 'undef';
  if (Array.isArray(x)) return '[' + x.map(show).join(' ; ') + ']';
  if (x && typeof x === 'object' && 'op' in x && !('t' in x)) return `MOVE ${x.op} ${x.operand ? print(x.operand) : ''}`;
  if (x && typeof x === 'object' && 'kind' in x && !('t' in x)) return x.kind === 'finite' ? '{' + x.roots.map((r) => { try { return print(r); } catch { return JSON.stringify(r, (k, v) => typeof v === 'bigint' ? String(v) : v); } }).join(', ') + '}' : x.kind;
  try { return print(x); } catch (e) { return JSON.stringify(x, (k, v) => typeof v === 'bigint' ? String(v) : v); }
}
export function line(p, opts = {}) {
  let s = `[${p.seed} f${p.fadeLevel}${p.variant ? ' ' + p.variant : ''}] ${p.prompt.verb} :: ${show(p.prompt.math)}`;
  if (p.prompt.move) s += ` | ${show(p.prompt.move)}`;
  if (p.prompt.twin) s += ` | TWIN ${show(p.prompt.twin)}`;
  if (p.prompt.goal) s += ` | goal: ${p.prompt.goal}`;
  if (p.choices) s += '\n   C: ' + p.choices.map((c) => `${c.id}=${show(c.display)}<${c.verdict}${c.malrule ? ':' + c.malrule : ''}${c.distance !== undefined ? ' d' + c.distance : ''}>`).join('  ');
  s += `\n   K(${p.answer.kind};${p.answer.formPredicates.join(',')}): ${show(p.answer.expected)}`;
  if (p.steps && (opts.steps || p.interaction === 'trace')) s += '\n      steps: ' + p.steps.map((st, i) => `L${i + 1}${st.legal ? '' : '!' + (st.malrule || '')} ${st.move ? '(' + show(st.move) + ') ' : ''}${show(st.line)}`).join('  ||  ');
  if (opts.steps && p.visuals.length) s += `\n      visuals: ${p.visuals.join(',')}`;
  if (p.assumptions.length) s += ` assume: ${JSON.stringify(p.assumptions)}`;
  if (p.moveGraph) s += ` graph: d${p.moveGraph.distance} ${show(p.moveGraph.minPath)}`;
  return s;
}
if (process.argv[1].endsWith('dump.js')) {
  for (const g of generators) {
    if (!g.id.includes(filt)) continue;
    for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) {
      if (iFilt && it !== iFilt) continue;
      console.log(`\n===== ${g.id} d${d} ${it}`);
      for (let i = 0; i < N; i++) {
        const fade = fadeArg !== '' ? Number(fadeArg) : i % 4;
        console.log(line(g.generate(makeRng(`ped-${i}`), { difficulty: d, interaction: it, fadeLevel: fade }), { steps: i < 2 }));
      }
    }
  }
}
