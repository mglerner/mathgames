// All learner-facing strings (verb, goal, step reasons) per generator, with counts.
import { IDS, gen, make } from './_lib.js';
for (const id of IDS) {
  const g = gen(id); const seen = new Map();
  for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) for (let i = 0; i < 60; i++) {
    const p = make(g, d, it, i);
    const add = (k, s) => { if (!s) return; const t = k + ': ' + s.replace(/-?\d+(\/\d+)?/g, '#').replace(/\b[a-zA-Z]\b/g, (m) => m); const key = t; seen.set(key, (seen.get(key) || new Set()).add(`d${d}${it}`)); };
    add('verb', p.prompt.verb); add('goal', p.prompt.goal);
    for (const s of p.steps || []) add('reason', s.reason);
  }
  console.log('## ' + id);
  for (const [k, v] of seen) console.log('  ' + k + '   [' + [...v].slice(0, 6).join(',') + (v.size > 6 ? ',..' : '') + ']');
}
