// Compact one-line-per-item view. Usage: node _c.js <genId> [N] [interactions,comma] [difficulty] [stepsFor]
import { gen, make, show, isOk } from './_lib.js';
const [, , id, nArg = '10', iF = '', dF = '', sArg = '1'] = process.argv;
const g = gen(id); const its = iF ? iF.split(',') : g.interactions;
for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of its) {
  if (!g.interactions.includes(it)) continue; if (dF && String(d) !== dF) continue;
  console.log(`== ${g.id} d${d} ${it}`);
  for (let i = 0; i < Number(nArg); i++) {
    const p = make(g, d, it, i);
    let s = `${i}f${p.fadeLevel}${p.variant ? ' ' + p.variant : ''}| ${p.prompt.verb} :: ${show(p.prompt.math)}`;
    if (p.prompt.move) s += ` | ${show(p.prompt.move)}`;
    if (p.prompt.twin) s += ` <> ${show(p.prompt.twin)}`;
    if (p.prompt.goal) s += ` | g: ${p.prompt.goal}`;
    if (p.choices) s += ' || ' + p.choices.map((c) => `${isOk(c) ? '*' : ''}${show(c.display)}${c.malrule ? '<' + c.malrule + '>' : (c.verdict === 'legal-idle' ? '<idle>' : c.verdict === 'risky' ? '<risky>' : c.verdict === 'illegal' ? '<illegal>' : '')}`).join(' ; ');
    s += ` || K(${p.answer.kind};${p.answer.formPredicates.join(',')}) ${show(p.answer.expected)}`;
    if (p.assumptions.length) s += ' assume ' + p.assumptions.map((a) => a.name + ':' + a.rel).join(',');
    console.log(s);
    if (p.steps && i < Number(sArg)) console.log('     steps: ' + p.steps.map((st) => `${st.legal ? '' : '!' + (st.malrule || '') + ' '}${show(st.line)}${st.reason ? ' {' + st.reason + '}' : ''}`).join('  ->  ') + `   [visuals ${p.visuals.join(',')}]`);
  }
}
