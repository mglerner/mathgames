// Surface-tell statistics per cell. Usage: node _stats.js [genFilter] [N]
import { IDS, gen, make, show, shape, isOk } from './_lib.js';

const [, , filt = '', nArg = '600'] = process.argv;
const N = Number(nArg);
const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '-');

export function pieces(n) {
  if (!n || typeof n !== 'object') return [];
  if ('op' in n && !('t' in n)) return ['op:' + n.op, 'operand:' + (n.operand ? show(n.operand) : '')];
  switch (n.t) {
    case 'eq': return ['L:' + show(n.lhs), 'R:' + show(n.rhs)];
    case 'add': return n.args.map((a, i) => `t${i}:` + show(a));
    case 'mul': return n.args.map((a, i) => `f${i}:` + show(a));
    case 'frac': return ['n:' + show(n.num), 'd:' + show(n.den)];
    case 'pow': return ['b:' + show(n.base), 'e:' + show(n.exp)];
    case 'neg': return ['neg', ...pieces(n.arg)];
    case 'group': return pieces(n.arg);
    default: return ['w:' + show(n)];
  }
}
export function majority(p) {
  const cnt = {};
  const ps = p.choices.map((c) => pieces(c.display));
  for (const x of ps) for (const k of new Set(x)) cnt[k] = (cnt[k] || 0) + 1;
  const sc = ps.map((x) => [...new Set(x)].reduce((s, k) => s + cnt[k], 0) / Math.max(1, new Set(x).size));
  const best = Math.max(...sc); const top = sc.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  return top.length === 1 ? top[0] : -1;
}
export function cellStats(g, d, it, n = N, prefix = 'g2p') {
  const r = { n: 0, pos: {}, nch: {}, longest: 0, shortest: 0, uniqShape: 0, maj: 0, majTried: 0, same: 0, twinTab: {}, trace: {}, distinct: new Set(), verdictSets: {}, tags: {} };
  for (let i = 0; i < n; i++) {
    const p = make(g, d, it, i, prefix);
    r.distinct.add(show(p.prompt.math) + '|' + show(p.prompt.twin) + '|' + show(p.prompt.move) + '|' + (p.prompt.goal || ''));
    if (!p.choices) continue;
    r.n++;
    r.nch[p.choices.length] = (r.nch[p.choices.length] || 0) + 1;
    for (const c of p.choices) if (c.malrule) r.tags[c.malrule] = (r.tags[c.malrule] || 0) + 1; else if (!isOk(c)) r.tags['(untagged ' + c.verdict + ')'] = (r.tags['(untagged ' + c.verdict + ')'] || 0) + 1;
    if (it === 'twin') {
      const same = p.choices.find((c) => c.id === 'same').verdict === 'correct'; if (same) r.same++;
      const k = shape(p.prompt.math) + ' | ' + shape(p.prompt.twin);
      r.twinTab[k] ||= [0, 0]; r.twinTab[k][same ? 0 : 1]++;
      continue;
    }
    const oks = p.choices.map((c, j) => (isOk(c) ? j : -1)).filter((j) => j >= 0);
    const vs = p.choices.map((c) => c.verdict[0]).sort().join(''); r.verdictSets[vs] = (r.verdictSets[vs] || 0) + 1;
    if (it === 'trace') { const k = `${p.choices[oks[0]]?.id}/${p.steps.length}`; r.trace[k] = (r.trace[k] || 0) + 1; continue; }
    for (const j of oks) r.pos[j] = (r.pos[j] || 0) + 1 / oks.length;
    if (oks.length !== 1) continue;
    const ci = oks[0];
    const lens = p.choices.map((c) => show(c.display).length); const L = lens[ci];
    if (lens.every((x, j) => j === ci || x < L)) r.longest++;
    if (lens.every((x, j) => j === ci || x > L)) r.shortest++;
    const sh = p.choices.map((c) => shape(c.display));
    if (sh.filter((s) => s === sh[ci]).length === 1 && new Set(sh.filter((s, j) => j !== ci)).size === 1) r.uniqShape++;
    const m = majority(p); if (m >= 0) { r.majTried++; if (m === ci) r.maj++; }
  }
  return r;
}
export function twinShapeAcc(r) {
  let hit = 0; let sure = 0; const tot = Object.values(r.twinTab).reduce((s, [a, b]) => s + a + b, 0);
  for (const [a, b] of Object.values(r.twinTab)) { hit += Math.max(a, b); if (a === 0 || b === 0) sure += a + b; }
  return { acc: hit / tot, determined: sure / tot };
}
if (process.argv[1].endsWith('_stats.js')) {
  for (const id of IDS) {
    if (!id.includes(filt)) continue;
    const g = gen(id);
    for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) {
      const r = cellStats(g, d, it);
      let s = `${id} d${d} ${it}: distinct=${r.distinct.size}/${N}`;
      if (r.n) {
        s += ` nch=${JSON.stringify(r.nch)}`;
        if (it === 'twin') {
          const a = twinShapeAcc(r);
          s += ` same=${pct(r.same, r.n)} shapeAcc=${pct(a.acc * 1000, 1000)} determined=${pct(a.determined * 1000, 1000)}`;
          s += '\n      ' + Object.entries(r.twinTab).sort((x, y) => (y[1][0] + y[1][1]) - (x[1][0] + x[1][1])).slice(0, 8).map(([k, v]) => `${k}: ${v[0]}/${v[1]}`).join('\n      ');
        } else if (it === 'trace') s += ` trace=${JSON.stringify(r.trace)}`;
        else {
          const k = Math.max(...Object.keys(r.nch).map(Number));
          s += ` pos=[${Array.from({ length: k }, (_, j) => pct(r.pos[j] || 0, r.n)).join(' ')}] longest=${pct(r.longest, r.n)} shortest=${pct(r.shortest, r.n)} uniqShape=${pct(r.uniqShape, r.n)} majority=${pct(r.maj, r.n)} (unique pick in ${pct(r.majTried, r.n)}) verdicts=${JSON.stringify(r.verdictSets)}`;
        }
        s += ` tags=${JSON.stringify(r.tags)}`;
      }
      console.log(s);
    }
  }
}
