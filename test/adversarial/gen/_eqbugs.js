// Independent models of the equation-line bugs (rules 3, 8, 9, 10) and the
// distribution bugs (6, 7) as LINES, for tag reproduction on Next Line
// candidates and planted Trace lines. Built from the displayed previous line
// and stated move only; arithmetic via ./_oracle.js.
import { applyMoveSide, sidewise, numNode, Q, ev, sToQ } from './_oracle.js';

const strip = (n) => (n && n.t === 'group' ? strip(n.arg) : n);
const terms = (n) => { n = strip(n); return n.t === 'add' ? n.args : [n]; };
const sum = (ts) => (ts.length === 1 ? ts[0] : { t: 'add', args: ts });
const inv = { add: 'sub', sub: 'add', mul: 'div', div: 'mul' };

/** candidate lines a student with bug `rule` writes for move m on prev. */
export function bugLines(rule, prev, m) {
  const L = prev.lhs, R = prev.rhs; const op = m.op, t = m.operand;
  const A = (s) => applyMoveSide(op, s, t);
  const out = [];
  const eq = (l, r) => out.push({ t: 'eq', lhs: l, rhs: r });
  switch (rule) {
    case 'one-sided-operation': eq(A(L), R); eq(L, A(R)); break;
    case 'transpose-no-sign-change': // the side holding the term is right, the other side gets the term with its sign kept
      if (op === 'add' || op === 'sub') { eq(A(L), applyMoveSide(inv[op], R, t)); eq(applyMoveSide(inv[op], L, t), A(R)); }
      break;
    case 'transpose-coefficient-as-subtract': // ax = c, "/ a" done as "- a" on the far side
      if (op === 'div') { eq(A(L), applyMoveSide('sub', R, t)); eq(applyMoveSide('sub', L, t), A(R)); }
      break;
    case 'divide-one-term': // only one term of a sum side is divided
      if (op === 'div') {
        for (const [side, other, swap] of [[L, R, false], [R, L, true]]) {
          const ts = terms(side); if (ts.length < 2) continue;
          for (let i = 0; i < ts.length; i++) {
            const s2 = sum(ts.map((x, j) => (j === i ? applyMoveSide('div', x, t) : x)));
            if (swap) eq(A(other), s2); else eq(s2, A(other));
          }
        }
      }
      break;
    default: break;
  }
  return out;
}

/** k(t1 + t2 + ...) inside a tree -> distribution bug variants of the whole tree. */
export function distLines(rule, tree) {
  const out = [];
  const rec = (n, rebuild) => {
    if (!n || typeof n !== 'object') return;
    const s = strip(n);
    let k, inner;
    if (s.t === 'mul' && s.args.length === 2 && strip(s.args[1]).t === 'add') { k = s.args[0]; inner = strip(s.args[1]); }
    else if (s.t === 'neg' && strip(s.arg).t === 'add') { k = { t: 'num', q: { n: -1n, d: 1n } }; inner = strip(s.arg); }
    else if (s.t === 'neg' && strip(s.arg).t === 'mul' && strip(s.arg).args.length === 2 && strip(strip(s.arg).args[1]).t === 'add') { k = { t: 'neg', arg: strip(s.arg).args[0] }; inner = strip(strip(s.arg).args[1]); }
    if (k) {
      const ts = inner.args;
      const times = (a, b) => ({ t: 'mul', args: [a, b] });
      if (rule === 'partial-distribution') out.push(rebuild(sum([times(k, ts[0]), ...ts.slice(1)])));
      if (rule === 'neg-distribution' && kNeg(k)) out.push(rebuild(sum([times(k, ts[0]), ...ts.slice(1).map((x) => times({ t: 'neg', arg: k }, x))])));
    }
    for (const key of ['args', 'arg', 'num', 'den', 'base', 'lhs', 'rhs']) {
      const c = n[key]; if (!c) continue;
      if (Array.isArray(c)) c.forEach((x, i) => rec(x, (r) => rebuild({ ...n, args: n.args.map((y, j) => (j === i ? r : y)) })));
      else rec(c, (r) => rebuild({ ...n, [key]: r }));
    }
  };
  rec(tree, (r) => r);
  return out;
}

function kNeg(k) { try { const v = sToQ(ev(k)); return v && v.n < 0n; } catch { return false; } }
export function matchesAny(line, cands) { return cands.some((c) => { try { return sidewise(line, c); } catch { return false; } }); }
export { numNode, Q };
