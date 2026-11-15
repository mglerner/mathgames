// Shared metric helpers for the gen-pedagogy adversarial tests and scripts.
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { print } from '../../../src/math/print.js';

export const gen = (id) => { const g = generators.find((x) => x.id === id); if (!g) throw new Error('no generator ' + id); return g; };
export const allGenerators = generators;
export function* items(g, d, it, n, { fade, prefix = 'gp' } = {}) {
  for (let i = 0; i < n; i++) {
    yield g.generate(makeRng(`${prefix}-${i}`), { difficulty: d, interaction: it, fadeLevel: fade ?? (it === 'forge' ? i % 2 : i % 4) });
  }
}
export function text(x) {
  if (x && typeof x === 'object' && 'op' in x && !('t' in x)) return `${x.op} ${x.operand ? print(x.operand) : ''}`;
  return print(x);
}
export function shape(n) {
  if (!n || typeof n !== 'object') return '?';
  switch (n.t) {
    case 'num': return 'N'; case 'var': return 'v';
    case 'neg': return '-' + shape(n.arg);
    case 'add': return '(' + n.args.map(shape).join('+') + ')';
    case 'mul': return n.args.map(shape).join('*');
    case 'frac': return '[' + shape(n.num) + '/' + shape(n.den) + ']';
    case 'pow': return shape(n.base) + '^';
    case 'root': return 'R' + shape(n.radicand);
    case 'group': return 'g' + shape(n.arg);
    case 'eq': return shape(n.lhs) + '=' + shape(n.rhs);
    default: return n.t || '?';
  }
}
export const isOk = (c) => c.verdict === 'correct' || c.verdict === 'progress';
/** Chi-square statistic of counts against a uniform split. */
export function chi2Uniform(counts) {
  const tot = counts.reduce((a, b) => a + b, 0); const e = tot / counts.length;
  return counts.reduce((s, c) => s + (c - e) * (c - e) / e, 0);
}
/** Accuracy of the best "look at the shapes only" rule for a Twin cell. */
export function twinShapeAccuracy(g, d, n) {
  const tab = {}; let N = 0;
  for (const p of items(g, d, 'twin', n)) {
    const same = p.choices.find((c) => c.id === 'same').verdict === 'correct';
    const k = shape(p.prompt.math) + ' | ' + shape(p.prompt.twin);
    tab[k] ||= [0, 0]; tab[k][same ? 0 : 1]++; N++;
  }
  let hit = 0; let sure = 0;
  for (const [a, b] of Object.values(tab)) { hit += Math.max(a, b); if (a === 0 || b === 0) sure += a + b; }
  return { accuracy: hit / N, determined: sure / N, tab };
}
/** "Majority vote" attack on a Next Line of equations: on each side pick the most frequent text. */
export function majorityVote(p) {
  const L = {}; const R = {};
  for (const c of p.choices) { const l = print(c.display.lhs); const r = print(c.display.rhs); L[l] = (L[l] || 0) + 1; R[r] = (R[r] || 0) + 1; }
  const score = (c) => L[print(c.display.lhs)] + R[print(c.display.rhs)];
  const best = Math.max(...p.choices.map(score));
  const top = p.choices.filter((c) => score(c) === best);
  return top.length === 1 ? top[0] : undefined; // undefined: the attack has no unique pick
}
