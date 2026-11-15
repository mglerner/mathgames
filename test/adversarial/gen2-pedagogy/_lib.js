// Shared helpers for the gen2-pedagogy adversarial review (new-round generators only).
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { print } from '../../../src/math/print.js';

export const IDS = [
  'frac-add-sub.core', 'frac-mult-div.core', 'signed-arith.core', 'order-of-ops.core',
  'combine-like-terms.core', 'factor-gcf.core', 'clear-fractions.core', 'literal-equations.core',
  'exp-meaning.core', 'exp-product-quotient.core', 'exp-power-rules.core', 'exp-zero-negative.core',
  'square-roots.core', 'simplify-radicals.core', 'rational-exponents.core', 'rational-exponents.forge',
  'sqrt-product-rule.d2plus', 'rationalize-denominator.d2plus',
];
export const gen = (id) => { const g = generators.find((x) => x.id === id); if (!g) throw new Error('no generator ' + id); return g; };
export const big = (k, v) => (typeof v === 'bigint' ? String(v) : v);
export function show(x) {
  if (x === undefined) return 'undef';
  if (typeof x === 'string') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(show).join(' ; ') + ']';
  if (x && typeof x === 'object' && 'op' in x && !('t' in x)) return `MOVE ${x.op} ${x.operand ? print(x.operand) : ''}`;
  if (x && typeof x === 'object' && 'kind' in x && !('t' in x)) return x.kind === 'finite' ? '{' + x.roots.map((r) => { try { return print(r); } catch { return JSON.stringify(r, big); } }).join(', ') + '}' : x.kind;
  try { return print(x); } catch { return JSON.stringify(x, big); }
}
export const isOk = (c) => c.verdict === 'correct' || c.verdict === 'progress';
export function make(g, d, it, i, prefix = 'g2p', fade) {
  return g.generate(makeRng(`${prefix}-${i}`), { difficulty: d, interaction: it, fadeLevel: fade ?? (it === 'forge' ? i % 2 : i % 4) });
}
export function* cells(ids = IDS) {
  for (const id of ids) {
    const g = gen(id);
    for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) yield { g, d, it };
  }
}
export function shape(n) {
  if (!n || typeof n !== 'object') return '?';
  if ('op' in n && !('t' in n)) return 'M' + n.op;
  switch (n.t) {
    case 'num': return n.q.d !== 1n ? 'Q' : (n.q.n < 0n ? '-N' : 'N'); case 'var': return 'v';
    case 'neg': return '-' + shape(n.arg);
    case 'add': return '(' + n.args.map(shape).join('+') + ')';
    case 'mul': return n.args.map(shape).join('*');
    case 'frac': return '[' + shape(n.num) + '/' + shape(n.den) + ']';
    case 'pow': return shape(n.base) + '^' + shape(n.exp);
    case 'root': return 'R' + shape(n.radicand);
    case 'group': return 'g' + shape(n.arg);
    case 'eq': return shape(n.lhs) + '=' + shape(n.rhs);
    default: return n.t || '?';
  }
}
export function line(p, steps = true) {
  let s = `[${p.seed} f${p.fadeLevel}${p.variant ? ' ' + p.variant : ''}] ${p.prompt.verb} :: ${show(p.prompt.math)}`;
  if (p.prompt.move) s += ` | ${show(p.prompt.move)}`;
  if (p.prompt.twin) s += ` | TWIN ${show(p.prompt.twin)}`;
  if (p.prompt.goal) s += ` | goal: ${p.prompt.goal}`;
  if (p.choices) s += '\n   C: ' + p.choices.map((c) => `${c.id}=${show(c.display)}<${c.verdict}${c.malrule ? ':' + c.malrule : ''}${c.distance !== undefined ? ' d' + c.distance : ''}>`).join('  ');
  s += `\n   K(${p.answer.kind};${p.answer.formPredicates.join(',')}): ${show(p.answer.expected)}`;
  if (p.steps && steps) s += '\n      steps: ' + p.steps.map((st, i) => `L${i + 1}${st.legal ? '' : '!' + (st.malrule || '')} ${st.move ? '(' + show(st.move) + ') ' : ''}${show(st.line)}${st.reason ? ' {' + st.reason + '}' : ''}`).join('\n             ');
  if (p.visuals.length) s += `\n      visuals: ${p.visuals.join(',')}`;
  if (p.assumptions.length) s += ` assume: ${JSON.stringify(p.assumptions)}`;
  if (p.moveGraph) s += ` graph: d${p.moveGraph.distance} ${show(p.moveGraph.minPath)}`;
  return s;
}
