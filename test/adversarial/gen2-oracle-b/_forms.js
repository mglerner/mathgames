// Typed variants of a keyed answer, and the verdict each SHOULD get.
// typedForms(p) -> [{ text, want: Set<verdict>, why }], built from the key's
// printed text by string rewrites (no src/math): the same answer written the
// ways a student would type it. judge() must never call one of these 'wrong',
// 'unverifiable' or 'unparsed'; a retyped prompt must be 'form', not 'correct'.
import { stripGroup as un } from './_oracle.js';

const OK = new Set(['correct', 'form']);
const CORRECT = new Set(['correct']);

/** Variants of one printed expression that keep its value and finished shape. */
export function exprVariants(t) {
  const out = new Set();
  out.add(t);
  out.add(` ${t} `);
  // "2sqrt(3)" -> "2 sqrt(3)", "2sqrt3", "2√3", "2 √(3)"
  out.add(t.replace(/(\d)sqrt/g, '$1 sqrt'));
  out.add(t.replace(/sqrt\((\d+|[a-z])\)/g, 'sqrt$1'));
  out.add(t.replace(/sqrt\((\d+|[a-z])\)/g, '√$1'));
  out.add(t.replace(/sqrt\(/g, '√('));
  // k sqrt(n) commuted: "sqrt(3)*2", "sqrt(3)×2", "2×sqrt(3)", "2*sqrt3"
  let m = /^(-?)(\d+)sqrt\((\d+)\)$/.exec(t);
  if (m) {
    const [, s, k, n] = m;
    out.add(`${s}sqrt(${n})*${k}`); out.add(`${s}sqrt(${n})×${k}`); out.add(`${s}${k}×sqrt(${n})`); out.add(`${s}${k}*sqrt${n}`);
    out.add(`${s}${k}·√${n}`);
  }
  // k sqrt(n)/m -> (k/m)sqrt(n), k/m sqrt(n), sqrt(n)k/m
  m = /^(-?)(\d*)sqrt\((\d+)\)\/(\d+)$/.exec(t);
  if (m) {
    const [, s, k, n, d] = m; const kk = k || '1';
    out.add(`${s}(${kk}/${d})sqrt(${n})`); out.add(`${s}${kk}/${d} sqrt(${n})`); out.add(`${s}${kk}/${d}√${n}`);
    out.add(`${s}sqrt(${n})${k ? '*' + k : ''}/${d}`);
  }
  // (a +- b sqrt(n))/c -> (+-b sqrt(n) + a)/c ; a/c +- b sqrt(n)/c
  m = /^\((-?\d+) ([+-]) (\d*)sqrt\((\d+)\)\)\/(\d+)$/.exec(t);
  if (m) {
    const [, a, op, b, n, c] = m;
    out.add(`(${op === '-' ? '-' : ''}${b}sqrt(${n}) + ${a})/${c}`);
    out.add(`${a}/${c} ${op} ${b}sqrt(${n})/${c}`);
  }
  // a +- b sqrt(n) -> b sqrt(n) +- ... (commute sum)
  m = /^(-?\d+) ([+-]) (\d*)sqrt\((\d+)\)$/.exec(t);
  if (m) { const [, a, op, b, n] = m; out.add(`${op === '-' ? '-' : ''}${b}sqrt(${n}) + ${a}`); }
  // k v (rational-exponents d3 "9b"): "9*b", "9 b", "b*9", "b(9)"
  m = /^(\d+)([a-z])$/.exec(t);
  if (m) { const [, k, v] = m; out.add(`${k}*${v}`); out.add(`${k} ${v}`); out.add(`${v}*${k}`); out.add(`${v}(${k})`); }
  // integers / fractions in parentheses
  if (/^-?\d+(\/\d+)?$/.test(t)) { out.add(`(${t})`); if (t.includes('/')) { const [a, b] = t.split('/'); out.add(`${a} / ${b}`); out.add(`(${a})/(${b})`); } }
  // x^n/x^n (form of 1) -> "(x^n)/(x^n)", and written out "xxx/(xxx)"
  m = /^([a-z])\^(\d+)\/\1\^\2$/.exec(t);
  if (m) { const [, v, n] = m; out.add(`(${v}^${n})/(${v}^${n})`); const w = v.repeat(Number(n)); out.add(`${w}/(${w})`); }
  // a sum with no parentheses: reversed term order ("x^2 + 6x + 9" -> "9 + 6x + x^2")
  if (!/[()]/.test(t) && / [+-] /.test(t)) {
    const terms = t.replace(/ - /g, ' + -').split(' + ');
    out.add(terms.slice().reverse().join(' + ').replace(/\+ -/g, '- '));
  }
  // a form of 1 (c)/(c) with a sum: commuted sum inside both parts, and both parts doubled
  m = /^\((\d+) ([+-]) sqrt\((\d+)\)\)\/\(\1 \2 sqrt\(\3\)\)$/.exec(t);
  if (m) {
    const [, a, op, n] = m; const s = op === '-' ? '-' : '';
    out.add(`(${s}sqrt(${n}) + ${a})/(${s}sqrt(${n}) + ${a})`);
    out.add(`(${2 * a} ${op} 2sqrt(${n}))/(${2 * a} ${op} 2sqrt(${n}))`);
  }
  m = /^sqrt\((\d+)\)\/sqrt\(\1\)$/.exec(t);
  if (m) { out.add(`2sqrt(${m[1]})/(2sqrt(${m[1]}))`); out.add(`√${m[1]}/√${m[1]}`); }
  return [...out];
}

/** Roots of a printed solution list "a, b" (key text) -> plus-minus variants. */
function solutionVariants(t, v) {
  const out = new Set([t]);
  if (t === 'no solution') return [...out];
  const roots = t.split(', ');
  out.add(roots.slice().reverse().join(', '));
  out.add(roots.map((r) => `${v} = ${r}`).join(', '));
  out.add(roots.join(','));
  if (roots.length === 2 && roots[0] === `-${roots[1]}`) {
    const r = roots[1];
    for (const rv of exprVariants(r)) { out.add(`±${rv}`); out.add(`${v} = ±${rv}`); }
  }
  for (const r of roots) if (/sqrt/.test(r)) out.add(roots.map((x) => x.replace(/sqrt\((\d+)\)/g, '√$1')).join(', '));
  return [...out];
}

/**
 * @param {any} p problem (constructed item, or a Twin follow-up)
 * @param {string} keyText answerText(p.answer)
 * @param {string} promptText print(p.prompt.math)
 */
export function typedForms(p, keyText, promptText) {
  const forms = [];
  const k = p.answer.kind;
  if (k === 'solution-set') {
    for (const t of solutionVariants(keyText, p.variableKeys[0])) forms.push({ text: t, want: CORRECT, why: 'solution set retyped' });
    const roots = keyText.split(', ');
    if (roots.length === 2) forms.push({ text: roots[1], want: new Set(['wrong']), why: 'one root dropped' });
    return forms;
  }
  if (k === 'tuple') {
    const parts = keyText.split(', ');
    if (parts.length === 2) {
      const [a, b] = parts.map(exprVariants);
      for (let i = 0; i < Math.max(a.length, b.length); i++) forms.push({ text: `${a[i % a.length]}, ${b[i % b.length]}`, want: OK, why: 'tuple retyped' });
    }
    return forms;
  }
  for (const t of exprVariants(keyText)) forms.push({ text: t, want: OK, why: 'key retyped' });
  return forms;
}

/** Equivalent but unfinished typings that must be 'form' (never 'wrong'). */
export function unfinishedForms(p, keyText, promptText) {
  const out = [];
  if (p.answer.kind !== 'expr' || p.variant === 'fill-blank' || p.variant === 'lantern' || p.interaction === 'twin') return out;
  const preds = p.answer.formPredicates ?? [];
  if (!preds.length) return out;
  const u = un(p.prompt.math);
  if (u.t === 'eq') return out;
  // the prompt retyped (only when it is not already the key)
  if (promptText !== keyText) out.push({ text: promptText, want: new Set(['form']), why: 'prompt retyped' });
  // radicals: k sqrt(n) as sqrt(k^2 n), and as sqrt(k^2)sqrt(n)
  const m = /^(\d+)sqrt\((\d+)\)$/.exec(keyText);
  if (m && preds.includes('radical-simplified')) {
    const k = BigInt(m[1]); const n = BigInt(m[2]);
    out.push({ text: `sqrt(${k * k * n})`, want: new Set(['form']), why: 'radicand not simplified' });
    out.push({ text: `sqrt(${k * k})sqrt(${n})`, want: new Set(['form']), why: 'square factor not taken out' });
  }
  // rational exponents: "9b" typed as 9sqrt(b)sqrt(b), 9(b^(1/2))^2
  const mv = /^(\d*)([a-z])$/.exec(keyText);
  if (mv && preds.includes('no-radical')) {
    const [, c, v] = mv;
    out.push({ text: `${c}sqrt(${v})sqrt(${v})`, want: new Set(['form']), why: 'roots left in' });
    out.push({ text: `${c}(${v}^(1/2))^2`, want: new Set(['form']), why: 'half power left in' });
  }
  return out;
}
