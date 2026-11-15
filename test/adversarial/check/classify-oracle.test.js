// Adversarial: classify() against an independent root-set oracle.
// Equations are built from known roots (_oracle.js arithmetic), so the true
// solution set before and after each move is known without src/math.
// Properties (DESIGN.md section 3 I1, section 11 domain policy):
//   (a) 'legal' never changes the solution set;
//   (b) mul / div by an operand containing an undeclared variable is 'risky';
//   (c) moves that are provably invertible (add/sub a polynomial, mul/div a
//       nonzero constant or a declared-nonzero symbol) are 'legal';
//   (d) mul / div by 0 is 'illegal'.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, trueSolutions, rootSetChange } from '../../../src/moves/classify.js';
import { applyMove } from '../../../src/moves/apply.js';
import { parse } from '../../../src/math/parse.js';
import { rng, F, fadd, fsub, fmul, fdiv, feq, fz, ftext, ONE, ZERO, P, padd, psub, pmul, pscale, ptext, peval } from './_oracle.js';

function node(s) { const r = parse(s); if ('error' in r) throw new Error(`did not parse: ${s}: ${r.error}`); return r; }

// Solution sets: { co: false, pts } finite, or { co: true, pts } = all reals except pts.
const has = (pts, x) => pts.some((y) => feq(x, y));
const uniq = (pts) => pts.filter((x, i) => pts.findIndex((y) => feq(x, y)) === i);
const remove = (S, s) => (S.co ? { co: true, pts: uniq([...S.pts, s]) } : { co: false, pts: S.pts.filter((x) => !feq(x, s)) });
const addPt = (S, s) => (S.co ? { co: true, pts: S.pts.filter((x) => !feq(x, s)) } : { co: false, pts: uniq([...S.pts, s]) });
const setEq = (A, B) => A.co === B.co && A.pts.length === B.pts.length && A.pts.every((x) => has(B.pts, x));
const setText = (S) => `${S.co ? 'R minus ' : ''}{${S.pts.map((x) => `${x.n}/${x.d}`).join(', ')}}`;

test('oracle: classify on random moves (legal never changes the root set; undeclared mul/div is risky)', () => {
  const bad = [];
  const counts = {};
  let n = 0; let tsAnswered = 0; let rscAnswered = 0;
  const big = (k, x) => (typeof x === 'bigint' ? `${x}` : x);
  const surdQ = (r) => (r.terms.length === 0 ? ZERO : r.terms.length === 1 && r.terms[0].rad === 1n ? F(r.terms[0].coef.n, r.terms[0].coef.d) : null);
  for (let seed = 0; seed < 6000; seed++) {
    const R = rng(40000 + seed);
    // ---- the equation and its true solution set
    let eqText; let S0; let poles = [];
    const fam = R.pick(['poly', 'poly', 'rat']);
    if (fam === 'poly') {
      const shape = R.pick(['lin', 'quad', 'dbl', 'none', 'all', 'zero-root']);
      const a = F(R.nz(-4, 4));
      let D; let roots;
      const r1 = F(R.big(-6, 6)); let r2; do { r2 = F(R.big(-6, 6)); } while (feq(r1, r2));
      if (shape === 'lin') { D = pscale(P(-r1.n, 1), a); roots = [r1]; }
      else if (shape === 'quad') { D = pscale(pmul(P(-r1.n, 1), P(-r2.n, 1)), a); roots = [r1, r2]; }
      else if (shape === 'dbl') { D = pscale(pmul(P(-r1.n, 1), P(-r1.n, 1)), a); roots = [r1]; }
      else if (shape === 'zero-root') { D = pscale(pmul(P(0, 1), P(-r2.n, 1)), a); roots = uniq([ZERO, r2]); }
      else if (shape === 'none') { D = pscale(P(R.int(1, 9), 0, 1), a); roots = []; }
      else { D = []; roots = null; }
      const Sx = P(...Array.from({ length: R.int(1, 3) }, () => R.int(-9, 9)));
      eqText = `${ptext(padd(D, Sx))} = ${ptext(Sx)}`;
      S0 = roots ? { co: false, pts: roots } : { co: true, pts: [] };
    } else {
      // (a x + b)/(x - t) = c
      const t = F(R.big(-5, 5)); const a = R.big(-5, 5); const b = R.big(-9, 9); const c = R.big(-5, 5);
      if (a === 0n && b === 0n) continue;
      poles = [t];
      // a x + b = c (x - t)  ->  (a - c) x = -b - c t
      const lhsK = F(a - c); const rhsK = fsub(F(-b), fmul(F(c), t));
      if (fz(lhsK)) S0 = fz(rhsK) ? { co: true, pts: [t] } : { co: false, pts: [] };
      else { const x0 = fdiv(rhsK, lhsK); S0 = feq(x0, t) ? { co: false, pts: [] } : { co: false, pts: [x0] }; }
      eqText = `(${ptext(P(Number(b), Number(a)))})/(${ptext(psub(P(0, 1), [t].filter((z) => !fz(z))))}) = ${c}`;
    }
    const e = node(eqText);
    // ---- the move, its operand text, and the oracle's solution set after it
    const kind = R.pick(['addPoly', 'addPole', 'mulK', 'mul0', 'divK', 'div0', 'mulLin', 'divLin', 'mulX', 'divX', 'mulRecip', 'mulSq1', 'mulL', 'divL', 'mulLundecl', 'mulXminusX']);
    let op; let oText; let S1; let as = [];
    let expect; // required verdict, or undefined
    const s = F(R.big(-6, 6));
    const k = F(R.nz(-7, 7), R.big(1, 3));
    const inDomain = (x) => !has(poles, x);
    switch (kind) {
      case 'addPoly': {
        const q = P(...Array.from({ length: R.int(1, 3) }, () => R.int(-9, 9)));
        if (!q.length) continue;
        op = R.pick(['add', 'sub']); oText = ptext(q); S1 = S0; expect = 'legal'; break;
      }
      case 'addPole': {
        op = R.pick(['add', 'sub']);
        oText = fz(s) ? `${ftext(k)}/x` : `${ftext(k)}/(${ptext(P(-s.n, 1))})`;
        S1 = remove(S0, s); break;
      }
      case 'mulK': op = 'mul'; oText = ftext(k); S1 = S0; expect = 'legal'; break;
      case 'divK': op = 'div'; oText = ftext(k); S1 = S0; expect = 'legal'; break;
      case 'mul0': op = 'mul'; oText = R.pick(['0', '(3 - 3)', '0/5']); S1 = { co: true, pts: poles }; expect = 'illegal'; break;
      case 'div0': op = 'div'; oText = R.pick(['0', '(2 - 2)']); S1 = { co: false, pts: [] }; expect = 'illegal'; break;
      case 'mulLin': op = 'mul'; oText = `(${ptext(P(-s.n, 1))})`; S1 = inDomain(s) ? addPt(S0, s) : S0; expect = 'risky'; break;
      case 'divLin': op = 'div'; oText = `(${ptext(P(-s.n, 1))})`; S1 = remove(S0, s); expect = 'risky'; break;
      case 'mulX': op = 'mul'; oText = R.pick(['x', `${ftext(k)}x`]); S1 = inDomain(ZERO) ? addPt(S0, ZERO) : S0; expect = 'risky'; break;
      case 'divX': op = 'div'; oText = R.pick(['x', `${ftext(k)}x`, 'x^2']); S1 = remove(S0, ZERO); expect = 'risky'; break;
      case 'mulRecip': op = 'mul'; oText = fz(s) ? '1/x' : `1/(${ptext(P(-s.n, 1))})`; S1 = remove(S0, s); expect = 'risky'; break;
      case 'mulSq1': op = R.pick(['mul', 'div']); oText = '(x^2 + 1)'; S1 = S0; expect = 'risky'; break;
      case 'mulL': op = 'mul'; oText = R.pick(['l', '2l', 'l^2']); as = [{ name: 'l', rel: 'nonzero' }]; S1 = S0; expect = 'legal'; break;
      case 'divL': op = 'div'; oText = R.pick(['l', '3l', 'l^2']); as = [{ name: 'l', rel: R.pick(['nonzero', 'pos']) }]; S1 = S0; expect = 'legal'; break;
      case 'mulLundecl': op = R.pick(['mul', 'div']); oText = 'l'; as = R.pick([[], [{ name: 'l', rel: 'nonneg' }]]); S1 = S0; expect = 'risky'; break;
      case 'mulXminusX': op = 'mul'; oText = '(x - x)'; S1 = { co: true, pts: poles }; expect = 'risky'; break;
      default: throw new Error(kind);
    }
    const v = classify({ op, operand: node(oText) }, e, as);
    n++;
    counts[`${kind}:${v}`] = (counts[`${kind}:${v}`] ?? 0) + 1;
    const where = `${eqText}  [${op} ${oText}]${as.length ? ` as=${JSON.stringify(as)}` : ''}: ${v}; roots ${setText(S0)} -> ${setText(S1)}`;
    if (v === 'legal' && !setEq(S0, S1)) bad.push(`(a) legal but the root set changed: ${where}`);
    if (expect && v !== expect) bad.push(`expected ${expect}: ${where}`);
    // trueSolutions / rootSetChange against the oracle, whenever they answer
    const fromS = (ss) => (ss.kind === 'all' ? { co: true, pts: [] } : { co: false, pts: ss.kind === 'none' ? [] : ss.roots.map(surdQ) });
    const ts0 = trueSolutions(e, 'x');
    if (ts0) { tsAnswered++; const got = fromS(ts0); if (got.pts.includes(null) || !setEq(got, S0)) bad.push(`trueSolutions ${eqText}: ${JSON.stringify(ts0, big)} vs ${setText(S0)}`); }
    if (op === 'mul' || op === 'div' || op === 'add' || op === 'sub') {
      const ch = rootSetChange(e, applyMove({ op, operand: node(oText) }, e), 'x');
      if (ch && !S0.co && !S1.co) {
        rscAnswered++;
        const lost = S0.pts.filter((x) => !has(S1.pts, x)); const added = S1.pts.filter((x) => !has(S0.pts, x));
        const gl = ch.lost.map(surdQ); const ga = ch.added.map(surdQ);
        if (gl.length !== lost.length || !gl.every((x) => x && has(lost, x)) || ga.length !== added.length || !ga.every((x) => x && has(added, x))) {
          bad.push(`rootSetChange ${where}: lost ${JSON.stringify(ch.lost, big)} added ${JSON.stringify(ch.added, big)}`);
        }
      } else if (ch && !(S0.co && S1.co && !S0.pts.length && !S1.pts.length && !ch.lost.length && !ch.added.length)) bad.push(`rootSetChange answered for a co-finite set: ${where}: lost ${JSON.stringify(ch.lost, big)} added ${JSON.stringify(ch.added, big)}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`classify oracle: ${n} moves; trueSolutions answered ${tsAnswered}, rootSetChange answered ${rscAnswered}`, JSON.stringify(counts));
  assert.equal(bad.length, 0, `${bad.length} bad, e.g.\n${bad.slice(0, 15).join('\n')}`);
  assert.ok(n > 5000);
});
