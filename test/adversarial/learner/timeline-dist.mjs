// Independent timeline reproduction (DESIGN.md section 11, M2 gate).
// Usage: node test/adversarial/learner/timeline-dist.mjs [N] [pProbe] [seedPrefix]
import { xsimulate } from './xsim.js';
const N = Number(process.argv[2] ?? 500);
const pProbe = process.argv[3] === undefined ? 0.8 : Number(process.argv[3]);
const pre = process.argv[4] ?? 'adv';
const rs = [];
for (let i = 0; i < N; i++) rs.push(xsimulate({ seed: `${pre}${i}`, p: 0.8, pProbe }));
const q = (xs) => { const s = xs.map((x) => (x ?? Infinity)).sort((a, b) => a - b); const at = (f) => s[Math.floor(f * (s.length - 1))]; return `p10 ${at(0.1)} med ${at(0.5)} p90 ${at(0.9)} max ${at(1)}`; };
const by = (xs, d) => (xs.filter((x) => x != null && x <= d).length / xs.length).toFixed(3);
const g = rs.map((r) => r.gate), bp = rs.map((r) => r.balPlanned), be = rs.map((r) => r.balEligible), bc = rs.map((r) => r.balCleared);
const spr = rs.map((r) => r.ev['sqrt-product-rule']?.day), qf = rs.map((r) => r.ev['quadratic-formula']?.day);
const fromChart = (id) => (rs.filter((r) => r.ev[id]?.charting).length / N).toFixed(3);
console.log(`N=${N} p=0.8 pProbe=${pProbe} seeds=${pre}*`);
console.log(`Gate(100EP) ${q(g)} by65 ${by(g, 65)}`);
console.log(`Balance planned ${q(bp)} by21 ${by(bp, 21)} | eligible ${q(be)} by21 ${by(be, 21)} | cleared ${q(bc)} by21 ${by(bc, 21)}`);
console.log(`sqrt-product-rule 1st ev ${q(spr)} by35 ${by(spr, 35)} fromCharting ${fromChart('sqrt-product-rule')}`);
console.log(`quadratic-formula 1st ev ${q(qf)} by35 ${by(qf, 35)} fromCharting ${fromChart('quadratic-formula')}`);
console.log(`all four ${(rs.filter((r) => (r.gate ?? 99) <= 65 && (r.balPlanned ?? 99) <= 21 && (r.ev['sqrt-product-rule']?.day ?? 99) <= 35 && (r.ev['quadratic-formula']?.day ?? 99) <= 35).length / N).toFixed(3)}`);
