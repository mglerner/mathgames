// Surface-feature attack on Twin cells. Usage: node _twin.js [genFilter] [N] [minAcc]
import { IDS, gen, make, show, shape } from './_lib.js';

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const toks = (s) => s.match(/[0-9]+|[a-z]+|sqrt/g) || [];
const reduced = (s) => { const m = /^-?(\d+)\/(\d+)$/.exec(s); if (!m) return /^-?\d+$/.test(s); return gcd(Number(m[1]), Number(m[2])) === 1; };
export const FEATURES = {
  twinReduced: (a, b) => reduced(b),
  twinLonger: (a, b) => b.length > a.length,
  twinHasParen: (a, b) => b.includes('('),
  mathHasParen: (a, b) => a.includes('('),
  bothOrNeitherParen: (a, b) => a.includes('(') === b.includes('('),
  sameTokenMultiset: (a, b) => toks(a).sort().join(',') === toks(b).sort().join(','),
  sameTokenSet: (a, b) => [...new Set(toks(a))].sort().join(',') === [...new Set(toks(b))].sort().join(','),
  sameTokenCount: (a, b) => toks(a).length === toks(b).length,
  twinHasMinus: (a, b) => b.includes('-'),
  mathHasMinus: (a, b) => a.includes('-'),
  sameMinusCount: (a, b) => a.split('-').length === b.split('-').length,
  twinHasSlash: (a, b) => b.includes('/'),
  twinHasCaret: (a, b) => b.includes('^'),
  twinHasSqrt: (a, b) => b.includes('sqrt'),
  twinHasPlus: (a, b) => b.includes('+'),
  twinIsInteger: (a, b) => /^-?\d+$/.test(b),
  twinHas1: (a, b) => toks(b).includes('1'),
  twinTokensSubset: (a, b) => toks(b).every((t) => toks(a).includes(t)),
  sameLength: (a, b) => a.length === b.length,
  twinSingleToken: (a, b) => toks(b).length === 1,
};
export function twinAttack(g, d, n = 600, prefix = 'g2p') {
  const tab = {}; const shp = {}; let same = 0;
  for (const k of Object.keys(FEATURES)) tab[k] = [[0, 0], [0, 0]];
  for (let i = 0; i < n; i++) {
    const p = make(g, d, 'twin', i, prefix);
    const s = p.choices.find((c) => c.id === 'same').verdict === 'correct' ? 1 : 0; same += s;
    const a = show(p.prompt.math); const b = show(p.prompt.twin);
    for (const [k, f] of Object.entries(FEATURES)) tab[k][f(a, b) ? 1 : 0][s]++;
    const sk = shape(p.prompt.math) + ' | ' + shape(p.prompt.twin); shp[sk] ||= [0, 0]; shp[sk][s]++;
  }
  const out = {};
  for (const [k, t] of Object.entries(tab)) out[k] = { acc: (Math.max(...t[0]) + Math.max(...t[1])) / n, t };
  out.shape = { acc: Object.values(shp).reduce((x, v) => x + Math.max(...v), 0) / n };
  return { same: same / n, out };
}
if (process.argv[1].endsWith('_twin.js')) {
  const [, , filt = '', nArg = '600', minArg = '0.68'] = process.argv;
  for (const id of IDS) {
    if (!id.includes(filt)) continue; const g = gen(id); if (!g.interactions.includes('twin')) continue;
    for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) {
      const r = twinAttack(g, d, Number(nArg));
      const hits = Object.entries(r.out).filter(([, v]) => v.acc >= Number(minArg)).sort((x, y) => y[1].acc - x[1].acc)
        .map(([k, v]) => `${k}=${(100 * v.acc).toFixed(0)}%${v.t ? ` [no:diff/same ${v.t[0]} yes:diff/same ${v.t[1]}]` : ''}`);
      console.log(`${id} d${d} same=${(100 * r.same).toFixed(0)}% ${hits.length ? '\n    ' + hits.join('\n    ') : '(no feature above threshold)'}`);
    }
  }
}
