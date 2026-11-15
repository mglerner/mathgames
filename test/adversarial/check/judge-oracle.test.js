// Adversarial: judge() against an independent BigInt oracle (_oracle.js),
// every AnswerSpec kind. Rule: a mathematically correct response must be
// 'correct' or 'form' (never 'wrong'); an incorrect one must be 'wrong'
// (never 'correct' or 'form'). Keys and truth values are computed in
// _oracle.js; src/ is used only to parse the key text into a Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../../../src/check/judge.js';
import { parse } from '../../../src/math/parse.js';
import {
  rng, F, fadd, fmul, fdiv, feq, fz, ftext, ONE, ZERO, P, padd, psub, pmul, pscale, peq, ptext, pIsMultiple, deg,
  SQUAREFREE, bgcd,
} from './_oracle.js';

const SEEDS = 3000;

function node(s) { const r = parse(s); if ('error' in r) throw new Error(`key text did not parse: ${s}: ${r.error}`); return r; }
function problem(answer, over = {}) {
  return {
    id: 't', gen: 'adv', version: 1, seed: 's', skill: 'adv', difficulty: 1, interaction: 'strike', constructed: true, fadeLevel: 2,
    prompt: { verb: 'Solve', math: node('x') }, assumptions: [], variableKeys: ['x'], answer, visuals: [], probes: [], ...over,
  };
}

/** Run a batch: cases = [{ p, text, right: bool, exact?: verdict }]. Returns { n, bad[], unverifiable }. */
function run(cases) {
  const bad = [];
  let unv = 0;
  for (const c of cases) {
    const r = judge(c.p, c.text);
    const v = r.verdict;
    if (v === 'unverifiable') { unv++; if (c.right === false) continue; }
    let ok;
    if (c.exact) ok = v === c.exact;
    else if (c.right) ok = v !== 'wrong' && v !== 'unparsed';
    else ok = v === 'wrong' || v === 'unverifiable';
    if (!ok) bad.push(`${c.tag}: ${JSON.stringify(c.text)} -> ${v}${r.note ? ` (${r.note})` : ''}${r.error ? ` [${r.error}]` : ''}; expected ${c.exact ?? (c.right ? 'not wrong' : 'wrong')}`);
  }
  return { n: cases.length, bad, unv };
}
function report(name, res, maxUnvFrac = 0.02) {
  // eslint-disable-next-line no-console
  console.log(`${name}: ${res.n} cases, ${res.bad.length} bad, ${res.unv} unverifiable`);
  assert.equal(res.bad.length, 0, `${res.bad.length} misjudged, e.g.\n${res.bad.slice(0, 12).join('\n')}`);
  assert.ok(res.unv <= res.n * maxUnvFrac, `too many unverifiable: ${res.unv}`);
}

// ---------------------------------------------------------------- expr

test('oracle: expr (rationals, polynomials, radicals)', () => {
  const cases = [];
  for (let s = 0; s < SEEDS; s++) {
    const R = rng(1000 + s);
    // rational p/q, lowest-terms
    const v = F(R.nz(-40, 40), R.big(1, 12));
    const p = problem({ kind: 'expr', expected: node(ftext(v)), formPredicates: ['lowest-terms'], assumptions: [] });
    const k = R.big(2, 6);
    cases.push({ p, tag: 'rat', text: v.d === 1n ? `${v.n}` : `${v.n}/${v.d}`, right: true, exact: 'correct' });
    cases.push({ p, tag: 'rat-k', text: `${v.n * k}/${v.d * k}`, right: true, exact: 'form' });
    const a = F(R.nz(-9, 9), R.big(1, 9));
    const b = fadd(v, F(-a.n, a.d));
    cases.push({ p, tag: 'rat-sum', text: `${ftext(a)} + ${ftext(b)}`, right: true });
    for (const w of [F(v.n + 1n, v.d), F(v.n, v.d + 1n), F(-v.n, v.d), fz(v) ? ONE : fdiv(ONE, v)]) {
      if (!feq(w, v)) cases.push({ p, tag: 'rat-wrong', text: `${w.n}/${w.d}`, right: false });
    }
    // polynomial, expanded + combined
    const r1 = R.big(-6, 6); const r2 = R.big(-6, 6); const lead = R.nz(-4, 4);
    const poly = pscale(pmul(P(-r1, 1), P(-r2, 1)), F(lead));
    const pp = problem({ kind: 'expr', expected: node(ptext(poly)), formPredicates: ['expanded', 'combined'], assumptions: [] });
    cases.push({ p: pp, tag: 'poly', text: ptext(poly), right: true, exact: 'correct' });
    cases.push({ p: pp, tag: 'poly-asc', text: ptext(poly, { ascending: true }), right: true });
    cases.push({ p: pp, tag: 'poly-star', text: ptext(poly, { star: true }), right: true, exact: 'correct' });
    cases.push({ p: pp, tag: 'poly-fact', text: `${lead}(x - ${ftext(F(r1))})(x - ${ftext(F(r2))})`, right: true, exact: 'form' });
    const i = R.int(0, 2);
    const pert = padd(poly, Array.from({ length: i + 1 }, (_, j) => (j === i ? F(R.nz(-3, 3)) : ZERO)));
    cases.push({ p: pp, tag: 'poly-wrong', text: ptext(pert), right: peq(pert, poly) });
    cases.push({ p: pp, tag: 'poly-onefactor', text: `${lead}(x - ${ftext(F(r1))})(x + ${ftext(F(r2))})`, right: r2 === 0n });
    // radical a sqrt(r), radical-simplified + no-radical-in-denominator
    const ra = R.nz(1, 9); const rr = R.pick(SQUAREFREE);
    const pr = problem({ kind: 'expr', expected: node(`${ra}sqrt(${rr})`), formPredicates: ['radical-simplified', 'no-radical-in-denominator'], assumptions: [] });
    cases.push({ p: pr, tag: 'rad', text: `${ra}sqrt(${rr})`, right: true, exact: 'correct' });
    if (ra > 1n) cases.push({ p: pr, tag: 'rad-unsimp', text: `sqrt(${ra * ra * rr})`, right: true, exact: 'form' });
    cases.push({ p: pr, tag: 'rad-den', text: `${ra * rr}/sqrt(${rr})`, right: true, exact: 'form' });
    cases.push({ p: pr, tag: 'rad-wrong1', text: `${ra + 1n}sqrt(${rr})`, right: false });
    cases.push({ p: pr, tag: 'rad-wrong2', text: `${ra}sqrt(${rr + 1n})`, right: false });
    if (ra > 1n) cases.push({ p: pr, tag: 'rad-wrong3', text: `sqrt(${ra * rr})`, right: false });
    cases.push({ p: pr, tag: 'rad-wrong4', text: `${ra * rr}`, right: false });
  }
  report('expr', run(cases));
});

// ---------------------------------------------------------------- equation-sides

function randPoly(R, maxDeg) {
  const d = R.int(0, maxDeg);
  return P(...Array.from({ length: d + 1 }, () => R.int(-9, 9)));
}

test('oracle: equation-sides (I2/I3 side-wise; original and solved line rejected)', () => {
  const cases = [];
  let solvedChecked = 0;
  for (let s = 0; s < SEEDS; s++) {
    const R = rng(5000 + s);
    // L0 = R0 with L0 - R0 not identically zero
    let L0; let R0;
    do { L0 = randPoly(R, 2); R0 = randPoly(R, 2); } while (peq(L0, R0));
    const opKind = R.pick(['add', 'sub', 'mul', 'div']);
    let o; let oText; let L1; let R1; let raw;
    if (opKind === 'add' || opKind === 'sub') {
      const e = R.int(0, 2); const c = R.nz(-9, 9);
      o = Array.from({ length: e + 1 }, (_, j) => (j === e ? F(c) : ZERO));
      oText = ptext(o);
      const so = opKind === 'add' ? o : pscale(o, F(-1n));
      L1 = padd(L0, so); R1 = padd(R0, so);
      const sign = opKind === 'add' ? '+' : '-';
      raw = `${ptext(L0)} ${sign} (${oText}) = ${ptext(R0)} ${sign} (${oText})`;
    } else {
      let k; do { k = F(R.nz(-6, 6), R.big(1, 3)); } while (feq(k, ONE));
      o = [k]; oText = ftext(k);
      const kk = opKind === 'mul' ? k : fdiv(ONE, k);
      L1 = pscale(L0, kk); R1 = pscale(R0, kk);
      raw = opKind === 'mul' ? `${oText}(${ptext(L0)}) = ${oText}(${ptext(R0)})` : `(${ptext(L0)})/${oText} = (${ptext(R0)})/${oText}`;
    }
    const move = { op: opKind, operand: node(oText) };
    const p = problem({ kind: 'equation-sides', expected: node(`${ptext(L1)} = ${ptext(R1)}`), formPredicates: [], assumptions: [] },
      { interaction: 'predict', prompt: { verb: 'Predict', math: node(`${ptext(L0)} = ${ptext(R0)}`), move } });
    const sidewise = (gl, gr) => (peq(gl, L1) && peq(gr, R1)) || (peq(gl, R1) && peq(gr, L1));
    const add = (tag, gl, gr, text) => cases.push({ p, tag, text: text ?? `${ptext(gl)} = ${ptext(gr)}`, right: sidewise(gl, gr) });
    add('key', L1, R1);
    add('swap', R1, L1);
    add('asc', L1, R1, `${ptext(L1, { ascending: true })} = ${ptext(R1, { ascending: true })}`);
    cases.push({ p, tag: 'raw', text: raw, right: true });
    add('orig', L0, R0);
    add('orig-swap', R0, L0);
    add('one-sided', L1, R0);
    add('double', pscale(L1, F(2n)), pscale(R1, F(2n)));
    add('negated', pscale(L1, F(-1n)), pscale(R1, F(-1n)));
    add('to-zero', psub(L1, R1), []);
    // fully solved line when linear with one root
    const D = psub(L0, R0);
    if (deg(D) === 1) {
      const root = fdiv(F(-D[0].n, D[0].d), D[1]);
      add('solved', P(0, 1), [root].filter((c) => !fz(c)), `x = ${ftext(root)}`);
      add('solved-swap', [root].filter((c) => !fz(c)), P(0, 1), `${ftext(root)} = x`);
      solvedChecked++;
    }
  }
  assert.ok(solvedChecked > 300);
  report('equation-sides', run(cases));
});

// ---------------------------------------------------------------- equation-multiple

test('oracle: equation-multiple (nonzero rational multiples; x0, xx, extra/missing root)', () => {
  const cases = [];
  for (let s = 0; s < SEEDS; s++) {
    const R = rng(9000 + s);
    const r1 = R.big(-7, 7); let r2; do { r2 = R.big(-7, 7); } while (r2 === r1);
    const a = R.nz(-4, 4);
    const D = pscale(pmul(P(-r1, 1), P(-r2, 1)), F(a));
    const split = randPoly(R, 2);
    const L0 = padd(D, split); const R0 = split;
    const p = problem({ kind: 'equation-multiple', expected: node(`${ptext(L0)} = ${ptext(R0)}`), formPredicates: ['standard-form'], assumptions: [] },
      { prompt: { verb: 'Rewrite', math: node(`${ptext(L0)} = ${ptext(R0)}`) } });
    const add = (tag, gl, gr, text, exact) => {
      const right = pIsMultiple(psub(gl, gr), D) && !(psub(gl, gr).length === 0);
      cases.push({ p, tag, text: text ?? `${ptext(gl)} = ${ptext(gr)}`, right, ...(exact && right ? { exact } : {}) });
    };
    const k = F(R.nz(-12, 12), R.big(1, 5));
    const kD = pscale(D, k);
    add('kD=0', kD, [], undefined, 'correct');
    add('0=kD', [], kD, undefined, 'correct');
    add('kD=0 star', kD, [], `${ptext(kD, { star: true })} = 0`, 'correct');
    add('orig', L0, R0);
    add('times0', [], [], '0 = 0');
    add('times0b', [], [], `0(${ptext(L0)}) = 0(${ptext(R0)})`);
    add('timesx', pmul(D, P(0, 1)), []);
    const s3 = R.big(-7, 7);
    add('extra-root', pmul(D, P(-s3, 1)), []);
    add('missing-root', pscale(P(-r2, 1), F(a)), []);
    add('missing-root-b', P(-r1, 1), []);
    add('perturb', padd(kD, P(R.nz(-3, 3))), []);
    add('sign-slip', padd(L0, R0), []); // moved a side with the wrong sign
  }
  report('equation-multiple', run(cases));
});

// ---------------------------------------------------------------- solution-set

function surdOf(p, qq, r, d = 1n) {
  // (p + qq sqrt(r)) / d
  const terms = [];
  if (p !== 0n) terms.push({ coef: { ...F(p, d) }, rad: 1n });
  if (qq !== 0n) terms.push({ coef: { ...F(qq, d) }, rad: r });
  return { terms };
}
const sameRoot = (a, b) => a.p * b.d === b.p * a.d && a.q * b.d === b.q * a.d && (a.q === 0n || a.r === b.r);
const mkRoot = (p, q, r, d) => { const g = bgcd(bgcd(p, q), d) || 1n; let pp = p / g; let qq = q / g; let dd = d / g; if (dd < 0n) { pp = -pp; qq = -qq; dd = -dd; } return { p: pp, q: qq, r: qq === 0n ? 1n : r, d: dd }; };
const rootText = (x) => {
  const num = x.q === 0n ? `${x.p}` : `${x.p} ${x.q < 0n ? '-' : '+'} ${x.q < 0n ? -x.q : x.q}sqrt(${x.r})`;
  return x.d === 1n ? num : `(${num})/${x.d}`;
};

test('oracle: solution-set (order, duplicates, +-, none/all, extra/missing, irrational)', () => {
  const cases = [];
  for (let s = 0; s < SEEDS; s++) {
    const R = rng(13000 + s);
    const shape = R.pick(['one', 'two', 'irr', 'none', 'all']);
    let truth; // array of roots {p,q,r,d}, or 'none' / 'all'
    if (shape === 'one') truth = [mkRoot(R.big(-20, 20), 0n, 1n, R.big(1, 6))];
    else if (shape === 'two') {
      const x = mkRoot(R.big(-20, 20), 0n, 1n, R.big(1, 4)); let y; do { y = mkRoot(R.big(-20, 20), 0n, 1n, R.big(1, 4)); } while (sameRoot(x, y));
      truth = [x, y];
    } else if (shape === 'irr') {
      const pp = R.big(-9, 9); const qq = R.nz(1, 5); const r = R.pick(SQUAREFREE); const d = R.big(1, 3);
      truth = [mkRoot(pp, qq, r, d), mkRoot(pp, -qq, r, d)];
    } else truth = shape;
    const expected = Array.isArray(truth)
      ? { kind: 'finite', roots: truth.map((x) => surdOf(x.p, x.q, x.r, x.d)) }
      : { kind: truth };
    const p = problem({ kind: 'solution-set', expected, formPredicates: ['radical-simplified'], assumptions: [] });
    const setEq = (got) => {
      if (!Array.isArray(truth) || !Array.isArray(got)) return truth === got;
      return got.every((g) => truth.some((t) => sameRoot(g, t))) && truth.every((t) => got.some((g) => sameRoot(g, t)));
    };
    const add = (tag, got, text) => cases.push({ p, tag, text, right: setEq(got) });
    add('none', 'none', 'no solution');
    add('all', 'all', 'all reals');
    if (!Array.isArray(truth)) {
      add('zero', [mkRoot(0n, 0n, 1n, 1n)], '0');
      add('five', [mkRoot(5n, 0n, 1n, 1n)], 'x = 5');
      continue;
    }
    const texts = truth.map(rootText);
    add('key', truth, texts.join(', '));
    add('rev', [...truth].reverse(), [...texts].reverse().join(', '));
    add('x=', truth, texts.map((t) => `x = ${t}`).join(', '));
    add('dup', truth, [...texts, texts[0]].join(', '));
    add('missing', truth.slice(1).length ? truth.slice(1) : [mkRoot(truth[0].p + 1n, truth[0].q, truth[0].r, truth[0].d)], truth.length > 1 ? texts.slice(1).join(', ') : rootText(mkRoot(truth[0].p + 1n, truth[0].q, truth[0].r, truth[0].d)));
    const extra = mkRoot(truth[0].p + truth[0].d, truth[0].q, truth[0].r, truth[0].d);
    add('extra', [...truth, extra], [...texts, rootText(extra)].join(', '));
    const neg = truth.map((x) => mkRoot(-x.p, -x.q, x.r, x.d));
    add('negated', neg, neg.map(rootText).join(', '));
    if (shape === 'irr') {
      const t = truth[0];
      const pmNum = `${t.p} ± ${t.q < 0n ? -t.q : t.q}sqrt(${t.r})`;
      add('pm', truth, t.d === 1n ? pmNum : `(${pmNum})/${t.d}`);
      const asc = `${t.p} +/- ${t.q < 0n ? -t.q : t.q}sqrt(${t.r})`;
      add('pm-ascii', truth, t.d === 1n ? asc : `(${asc})/${t.d}`);
      // "+-" typed as two characters is plus-negative (section 9): one root only
      const pn = `${t.p} +- ${t.q < 0n ? -t.q : t.q}sqrt(${t.r})`;
      add('plus-neg', [mkRoot(t.p, -(t.q < 0n ? -t.q : t.q), t.r, t.d)], t.d === 1n ? pn : `(${pn})/${t.d}`);
      add('one-of-pair', [t], rootText(t));
      add('rational-part', [mkRoot(t.p, 0n, 1n, t.d)], rootText(mkRoot(t.p, 0n, 1n, t.d)));
      // unsimplified radicand: sqrt(4r) = 2 sqrt(r) -> right value, form
      const qa = t.q < 0n ? -t.q : t.q;
      const unsimp = qa % 2n === 0n ? `${t.p} ± ${qa / 2n}sqrt(${4n * t.r})` : `${t.p} ± sqrt(${qa * qa * t.r})`;
      cases.push({ p, tag: 'pm-unsimp', text: t.d === 1n ? unsimp : `(${unsimp})/${t.d}`, right: true, ...(qa === 1n ? {} : { exact: 'form' }) });
    } else {
      const t = truth[0];
      add('pm-zero', [t], `${rootText(t)} ± 0`);
    }
  }
  report('solution-set', run(cases));
});

// ---------------------------------------------------------------- form-of-1

test('oracle: form-of-1 (sqrt(r)/sqrt(r) yes, sqrt(r)/1 no, n/n legal-idle; denominators)', () => {
  const cases = [];
  for (let s = 0; s < SEEDS; s++) {
    const R = rng(17000 + s);
    const r = R.pick(SQUAREFREE); const a = R.nz(1, 12);
    const p = problem({ kind: 'form-of-1', expected: node(`sqrt(${r})/sqrt(${r})`), formPredicates: ['no-radical-in-denominator'], assumptions: [] },
      { interaction: 'forge', prompt: { verb: 'Forge', math: node(`${a}/sqrt(${r})`), goal: 'no root in the denominator' } });
    const m = R.big(2, 5); const n = R.big(2, 9);
    cases.push({ p, tag: 'coin', text: `sqrt(${r})/sqrt(${r})`, right: true, exact: 'correct' });
    cases.push({ p, tag: 'coin-m', text: `${m}sqrt(${r})/(${m}sqrt(${r}))`, right: true, exact: 'correct' });
    cases.push({ p, tag: 'coin-unsimp', text: `sqrt(${m * m * r})/sqrt(${m * m * r})`, right: true, exact: 'correct' });
    cases.push({ p, tag: 'n/n', text: `${n}/${n}`, right: true, exact: 'legal-idle' });
    cases.push({ p, tag: 'one', text: '1', right: true, exact: 'legal-idle' });
    cases.push({ p, tag: 'sqrt/1', text: `sqrt(${r})/1`, right: false });
    cases.push({ p, tag: '1/sqrt', text: `1/sqrt(${r})`, right: false });
    cases.push({ p, tag: 'n/m', text: `${n}/${n + 1n}`, right: false });
    cases.push({ p, tag: 'other-rad', text: `sqrt(${r})/sqrt(${r + 1n})`, right: false });
    cases.push({ p, tag: 'x/x', text: 'x/x', right: true, exact: 'risky' });
    // fraction to a target denominator
    const num = R.nz(-9, 9); const den = R.big(2, 9); const t = R.big(2, 5);
    const pd = problem({ kind: 'form-of-1', expected: node(`${t}/${t}`), formPredicates: [`denominator:${den * t}`], assumptions: [] },
      { interaction: 'forge', prompt: { verb: 'Forge', math: node(`${num}/${den}`), goal: `denominator ${den * t}` } });
    cases.push({ p: pd, tag: 'den', text: `${t}/${t}`, right: true, exact: 'correct' });
    cases.push({ p: pd, tag: 'den-other', text: `${t + 1n}/${t + 1n}`, right: true, exact: 'legal-idle' });
    cases.push({ p: pd, tag: 'den-wrong', text: `${t}/${t + 1n}`, right: false });
    cases.push({ p: pd, tag: 'den-whole', text: `${t}/1`, right: false });
  }
  report('form-of-1', run(cases));
});

// ---------------------------------------------------------------- form-of-0

test('oracle: form-of-0 (+b^2 - b^2 yes, +b^2 no, other zero-pairs legal-idle)', () => {
  const cases = [];
  for (let s = 0; s < SEEDS; s++) {
    const R = rng(21000 + s);
    const b = R.nz(-9, 9); const sq = b * b;
    const p = problem({ kind: 'form-of-0', expected: node(`${sq} - ${sq}`), formPredicates: [], assumptions: [] },
      { interaction: 'forge', prompt: { verb: 'Forge', math: node(`x^2 + ${ptext(P(0, Number(2n * b)))}`), goal: 'make a perfect square' } });
    const c = R.big(1, 99);
    cases.push({ p, tag: 'pair', text: `${sq} - ${sq}`, right: true, exact: 'correct' });
    cases.push({ p, tag: '+pair', text: `+${sq} - ${sq}`, right: true, exact: 'correct' });
    cases.push({ p, tag: 'pair-paren', text: `(${b})^2 - (${b})^2`, right: true, exact: 'correct' });
    cases.push({ p, tag: 'add-only', text: `+${sq}`, right: false });
    cases.push({ p, tag: 'sub-only', text: `-${sq}`, right: false });
    cases.push({ p, tag: 'unbalanced', text: `${sq} - ${sq + 1n}`, right: false });
    if (c !== sq) cases.push({ p, tag: 'other-pair', text: `${c} - ${c}`, right: true, exact: 'legal-idle' });
    cases.push({ p, tag: 'x-x', text: 'x - x', right: true, exact: 'legal-idle' });
    cases.push({ p, tag: 'x-pair', text: `x + ${sq} - x - ${sq}`, right: true });
  }
  report('form-of-0', run(cases));
});

// ---------------------------------------------------------------- tuple

test('oracle: tuple read a, b, c (any nonzero rational k), plain tuple (exact)', () => {
  const cases = [];
  for (let s = 0; s < SEEDS; s++) {
    const R = rng(25000 + s);
    const abc = [F(R.nz(-9, 9)), F(R.big(-9, 9)), F(R.big(-9, 9))];
    const exp = abc.map((x) => node(ftext(x)));
    const p = problem({ kind: 'tuple', expected: exp, formPredicates: [], assumptions: [] }, { variant: 'read-abc' });
    const plain = problem({ kind: 'tuple', expected: exp, formPredicates: [], assumptions: [] });
    const k = F(R.nz(-12, 12), R.big(1, 5));
    const txt = (xs) => xs.map((x) => (x.d === 1n ? `${x.n}` : `${x.n}/${x.d}`)).join(', ');
    const scaled = abc.map((x) => fmul(x, k));
    cases.push({ p, tag: 'abc', text: txt(abc), right: true, exact: 'correct' });
    cases.push({ p, tag: 'k abc', text: txt(scaled), right: true, exact: 'correct' });
    cases.push({ p, tag: '0 abc', text: '0, 0, 0', right: false });
    const i = R.int(0, 2);
    const pert = scaled.map((x, j) => (j === i ? fadd(x, ONE) : x));
    cases.push({ p, tag: 'perturb', text: txt(pert), right: pIsMultiple(pert, abc) });
    const neg1 = abc.map((x, j) => (j === 0 ? F(-x.n, x.d) : x));
    cases.push({ p, tag: 'one-sign', text: txt(neg1), right: pIsMultiple(neg1, abc) });
    cases.push({ p: plain, tag: 'plain', text: txt(abc), right: true, exact: 'correct' });
    if (!feq(k, ONE)) cases.push({ p: plain, tag: 'plain-k', text: txt(scaled), right: false });
  }
  report('tuple', run(cases));
});
