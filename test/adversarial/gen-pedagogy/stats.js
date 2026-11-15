// Answer-position, option-length and shape-leak statistics per cell.
// Usage: node test/adversarial/gen-pedagogy/stats.js [genFilter] [seeds]
import { generators } from '../../../src/gen/registry.generated.js';
import { makeRng } from '../../../src/gen/prng.js';
import { print } from '../../../src/math/print.js';
import { show } from './dump.js';

const [, , filt = '', nArg = '5000'] = process.argv;
const N = Number(nArg);
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');
function shape(n) { // coarse structural signature
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
for (const g of generators) {
  if (!g.id.includes(filt)) continue;
  for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) {
    const pos = {}; let withChoices = 0; let longest = 0, shortest = 0, nonTwin = 0;
    const twinShape = {}; let same = 0, twins = 0; const whyShape = {}; const whyCorrectShape = {};
    const traceLine = {}; const nch = {}; const castProg = {}; const tags = {}; const distinct = new Set();
    let whyUniqueShape = 0, whys = 0;
    for (let i = 0; i < N; i++) {
      const p = g.generate(makeRng(`st-${i}`), { difficulty: d, interaction: it, fadeLevel: it === 'forge' ? i % 2 : i % 4 });
      distinct.add(show(p.prompt.math) + '|' + show(p.prompt.twin) + '|' + show(p.prompt.move));
      if (!p.choices) continue;
      withChoices++;
      nch[p.choices.length] = (nch[p.choices.length] || 0) + 1;
      const ok = (c) => c.verdict === 'correct' || c.verdict === 'progress';
      if (it === 'twin') {
        twins++; const isSame = p.choices.find((c) => c.id === 'same').verdict === 'correct'; if (isSame) same++;
        const k = shape(p.prompt.twin); twinShape[k] ||= [0, 0]; twinShape[k][isSame ? 0 : 1]++;
        for (const c of p.choices) if (c.malrule) tags[c.malrule] = (tags[c.malrule] || 0) + 1;
        continue;
      }
      if (it === 'trace') {
        const c = p.choices.find(ok); traceLine[`${c.id}/${p.steps.length}`] = (traceLine[`${c.id}/${p.steps.length}`] || 0) + 1; continue;
      }
      if (it === 'cast') {
        const k = p.choices.map((c) => c.verdict[0]).sort().join(''); castProg[k] = (castProg[k] || 0) + 1;
        p.choices.forEach((c, j) => { if (c.verdict === 'progress') pos[j] = (pos[j] || 0) + 1; });
        continue;
      }
      const ci = p.choices.findIndex(ok); pos[ci] = (pos[ci] || 0) + 1;
      for (const c of p.choices) if (c.malrule) tags[c.malrule] = (tags[c.malrule] || 0) + 1; else if (!ok(c)) tags['(untagged wrong)'] = (tags['(untagged wrong)'] || 0) + 1;
      if (it === 'why') {
        whys++;
        const cs = shape(p.choices[ci].display); whyCorrectShape[cs] = (whyCorrectShape[cs] || 0) + 1;
        const others = p.choices.filter((c, j) => j !== ci).map((c) => shape(c.display));
        if (!others.includes(cs)) whyUniqueShape++;
        const k = p.choices.map((c) => (ok(c) ? '*' : '') + shape(c.display)).join(' '); whyShape[k] = (whyShape[k] || 0) + 1;
        continue;
      }
      nonTwin++;
      const lens = p.choices.map((c) => show(c.display).length); const L = lens[ci];
      if (lens.every((x, j) => j === ci || x < L)) longest++;
      if (lens.every((x, j) => j === ci || x > L)) shortest++;
    }
    let s = `${g.id} d${d} ${it}: distinct=${distinct.size}`;
    if (withChoices) {
      s += ` nChoices=${JSON.stringify(nch)}`;
      if (Object.keys(pos).length) {
        const tot = Object.values(pos).reduce((a, b) => a + b, 0); const k = Math.max(...Object.keys(nch).map(Number));
        s += ` pos=[${Array.from({ length: k }, (_, j) => pct(pos[j] || 0, tot)).join(' ')}]`;
      }
      if (nonTwin) s += ` correctUniqLongest=${pct(longest, nonTwin)} uniqShortest=${pct(shortest, nonTwin)}`;
      if (twins) s += ` same=${pct(same, twins)} twinShape(same/diff)=${JSON.stringify(twinShape)}`;
      if (whys) s += ` whyCorrectUniqueShape=${pct(whyUniqueShape, whys)} correctShapes=${JSON.stringify(whyCorrectShape)} layouts=${JSON.stringify(Object.entries(whyShape).sort((a, b) => b[1] - a[1]).slice(0, 6))}`;
      if (Object.keys(traceLine).length) s += ` trace=${JSON.stringify(traceLine)}`;
      if (Object.keys(castProg).length) s += ` castVerdictSets=${JSON.stringify(castProg)}`;
      if (Object.keys(tags).length) s += ` tags=${JSON.stringify(tags)}`;
    }
    console.log(s);
  }
}
