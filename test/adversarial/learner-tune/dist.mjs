// Independent reproduction of the M2 timeline gate and the realistic profile.
// Usage:
//   node test/adversarial/learner-tune/dist.mjs gate [N] [own|stubs] [seedPrefix] [jsonPlannerParams]
//   node test/adversarial/learner-tune/dist.mjs real [N] [own|stubs] [seedPrefix] [jsonStudent] [miss]
import { xsim, accurate, realistic, attendance, spread, by } from './xsim.js';

const [mode = 'gate', N0 = '500', reg = 'stubs', pre = 'lt', extra = '{}', miss = '0.15'] = process.argv.slice(2);
const N = Number(N0);
const rs = [];
const viol = [];
for (let i = 0; i < N; i++) {
  const seed = `${pre}${i}`;
  const r = mode === 'gate'
    ? xsim({ seed, student: accurate(0.8), registry: reg, params: JSON.parse(extra) })
    : xsim({ seed, student: realistic(seed, JSON.parse(extra)), registry: reg, playDay: attendance(seed, Number(miss)) });
  rs.push(r);
  for (const v of r.violations) viol.push(`${seed} ${v}`);
}
const f3 = (x) => x.toFixed(3);
console.log(`mode ${mode} N ${N} registry ${reg} seeds ${pre}* extra ${extra}`);
console.log(`violations: ${viol.length}; inferred-skill choice-miss drops (model rule, info): ${rs.reduce((t, r) => t + r.choiceInferredDrop, 0)}`);
for (const v of viol.slice(0, 10)) console.log(`  ${v}`);
const g = rs.map((r) => r.gate); const b = rs.map((r) => r.balPlanned);
const spr = rs.map((r) => r.firstEv['sqrt-product-rule']); const qf = rs.map((r) => r.firstEv['quadratic-formula']);
console.log(`runs: ${spread(rs.map((r) => r.runs))}`);
console.log(`first-try (non-probe) ${f3(rs.reduce((t, r) => t + r.ok, 0) / rs.reduce((t, r) => t + r.items, 0))}; probe hit ${f3(rs.reduce((t, r) => t + r.probeHits, 0) / rs.reduce((t, r) => t + r.probes, 0))}`);
console.log(`EP day 65: ${spread(rs.map((r) => r.ep))}; >=70/80/90/100: ${[70, 80, 90, 100].map((e) => f3(rs.filter((r) => r.ep >= e).length / N)).join(' / ')}`);
console.log(`Gate day: ${spread(g)}; by 65: ${f3(by(g, 65))}`);
console.log(`Balance planned: ${spread(b)}; by 21: ${f3(by(b, 21))}; by 65: ${f3(by(b, 65))}`);
console.log(`spr first ev: ${spread(spr)}; by 35: ${f3(by(spr, 35))}`);
console.log(`qf first ev: ${spread(qf)}; by 35: ${f3(by(qf, 35))}`);
console.log(`all four: ${f3(rs.filter((r) => (r.gate ?? 99) <= 65 && (r.balPlanned ?? 99) <= 21 && (r.firstEv['sqrt-product-rule'] ?? 99) <= 35 && (r.firstEv['quadratic-formula'] ?? 99) <= 35).length / N)}`);
const A = Object.values(rs[0].state.skills).length;
const mastered = rs.map((r) => Object.entries(r.state.skills).filter(([id, s]) => s.mastered).length);
console.log(`mastered (all ${A} skills): ${spread(mastered)}`);
console.log(`eligible: ${['balance', 'mint', 'stack', 'root', 'factor', 'quadratic', 'ridge'].map((c) => `${c} ${f3(rs.filter((r) => r.eligible[c]).length / N)}`).join(', ')}`);
for (const id of ['frac-times-whole', 'rationalize-denominator', 'sqrt-product-rule', 'rational-exponents', 'quadratic-to-standard', 'quadratic-formula']) {
  console.log(`  ${id}: unlocked ${spread(rs.map((r) => r.firstSeen[id]))} | first ev ${spread(rs.map((r) => r.firstEv[id]))} | share ${f3(rs.filter((r) => r.firstEv[id] !== undefined).length / N)}`);
}
