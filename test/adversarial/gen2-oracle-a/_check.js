// Per-item independent checks for the gen2 mint / scales generators
// (adversarial review gen2-oracle-a; lens: answer keys, distractors, tags).
// checkItem(p) returns a list of { code, msg }; [] means every key, label,
// tag, chip and chain line the oracle could re-derive holds.
//
// Everything is recomputed from the PRINTED text (print() is the display)
// with ./_oracle.js (own parser, own rationals / polynomials). The only
// src imports are print() (what the learner sees), judge() (the typed-answer
// check under test) and followUp() (the typed follow-up of a tap item).
import { print } from '../../../src/math/print.js';
import { judge } from '../../../src/check/judge.js';
import { followUp } from '../../../src/gen/common.js';
import {
  Q, qeq, qz, qstr, qadd, qsub, qmul, qdiv, gcd, lcm, ZERO, ONE, OracleError,
  parseText, isEqT, varsT, toRF, rfEq, rfSub, rfEval, rfConst, rfIsZero, rf, rfMul, rfDiv,
  pVar, pConst, pIsConst, pConstVal, pDenLcm, pTermsOf, pDeg, pEval,
  solveLinear, sameLin, linStr, linearCoeffs, fromNode, POINTS, qFromWire,
} from './_oracle.js';

const SHOW = (x) => {
  if (x == null) return String(x);
  if (Array.isArray(x)) return x.map(SHOW).join(', ');
  if (typeof x.op === 'string' && !x.t) return `${x.op} ${x.operand ? print(x.operand) : ''}`;
  try { return print(x); } catch { return JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}` : v)); }
};
/** printed text -> own tree (the blank '_' is kept as a variable named '_') */
const T = (node) => parseText(print(node));

// ------------------------------------------------------------ helpers on own trees
const strip = (x) => (x && x.k === 'grp' ? strip(x.a) : x);
/** signed top-level terms of a sum: [{s: 1n|-1n, t}] */
function termsOf(x) {
  x = strip(x);
  if (x.k === '+') return [...termsOf(x.a), ...termsOf(x.b)];
  if (x.k === '-') return [...termsOf(x.a), ...termsOf(x.b).map((u) => ({ s: -u.s, t: u.t }))];
  if (x.k === 'neg') return termsOf(x.a).length === 1 ? [{ s: -termsOf(x.a)[0].s, t: termsOf(x.a)[0].t }] : [{ s: -1n, t: x.a }];
  return [{ s: 1n, t: x }];
}
const numT = (q) => ({ k: 'n', q });
const sumOf = (ts) => (ts.length === 0 ? numT(ZERO) : ts.slice(1).reduce((a, u) => ({ k: '+', a, b: u.s < 0n ? { k: 'neg', a: u.t } : u.t }), ts[0].s < 0n ? { k: 'neg', a: ts[0].t } : ts[0].t));
const mulT = (a, b) => ({ k: '*', a, b });
const divT = (a, b) => ({ k: '/', a, b });
const negT = (a) => ({ k: 'neg', a });
const isSum = (x) => { x = strip(x); return x.k === '+' || x.k === '-'; };
const R = (x) => toRF(x);
const same = (a, b) => rfEq(R(a), R(b));
const constOf = (x) => rfConst(R(x));
/** value-identity on equations side-wise (either orientation) */
const sideWise = (a, b) => (same(a.l, b.l) && same(a.r, b.r)) || (same(a.l, b.r) && same(a.r, b.l));

/** every way to rewrite ONE site, then also all sites at once; rule(node) -> replacement[] at a site */
function rewrites(x, rule) {
  const sites = [];
  const walk = (n, rebuild) => {
    for (const rep of rule(n)) sites.push(rebuild(rep));
    for (const key of ['a', 'b', 'l', 'r']) if (n[key]) walk(n[key], (r) => rebuild({ ...n, [key]: r }));
  };
  walk(x, (r) => r);
  return sites;
}
/** apply the rule at every site simultaneously (first replacement at each) */
function rewriteAll(x, rule) {
  const reps = rule(x);
  if (reps.length) return reps[0];
  const out = { ...x };
  for (const key of ['a', 'b', 'l', 'r']) if (x[key]) out[key] = rewriteAll(x[key], rule);
  return out;
}

// --- independent mal-rule models (the DESIGN.md section 5 descriptions)
// a product k(t1 + t2 + ...) as a signed term of a sum: multiplier m (sign absorbed), inner terms
function productSites(x) {
  // returns rewriters on the SUM containing the product, as a list of whole-tree alternatives
  const out = [];
  const visitSum = (n, rebuild) => {
    const ts = termsOf(n);
    ts.forEach((u, i) => {
      let t = strip(u.t); let s = u.s;
      if (t.k === 'neg') { s = -s; t = strip(t.a); }
      if (t.k !== '*') return;
      let mult; let inner;
      if (isSum(t.b) && t.b.k === 'grp') { mult = t.a; inner = t.b; } else if (isSum(t.a) && t.a.k === 'grp') { mult = t.b; inner = t.a; } else return;
      const m = s < 0n ? negT(mult) : mult;
      const its = termsOf(inner);
      out.push({ i, ts, m, its, rebuild });
    });
  };
  // a node inside a +/- chain is a TERM of the sum above it (its sign lives there): visit sums at the
  // top of a chain only, then descend into the terms
  const chain = (n) => n.k === '+' || n.k === '-' || n.k === 'neg';
  const walk = (n, rebuild, inChain) => {
    if (!inChain) visitSum(n, rebuild);
    for (const key of ['a', 'b', 'l', 'r']) if (n[key]) walk(n[key], (r) => rebuild({ ...n, [key]: r }), chain(n));
  };
  walk(x, (r) => r, false);
  return out;
}
function distRule(x, kind) {
  const sites = productSites(x);
  const variant = (site) => {
    const { i, ts, m, its } = site;
    const first = { s: 1n, t: mulT(m, its[0].s < 0n ? negT(its[0].t) : its[0].t) };
    let rest;
    if (kind === 'partial') rest = its.slice(1);
    else {
      const mv = constOf(m);
      if (!mv || mv.n >= 0n) return undefined; // the Sign-Thief needs a negative multiplier
      rest = its.slice(1).map((u) => ({ s: 1n, t: mulT(negT(m), u.s < 0n ? negT(u.t) : u.t) }));
    }
    return [...ts.slice(0, i), first, ...rest, ...ts.slice(i + 1)];
  };
  const outs = [];
  for (const site of sites) {
    const v = variant(site);
    if (v) outs.push(site.rebuild(sumOf(v)));
  }
  // all sites at once (only sites in the same top-level sum, the common case)
  const top = sites.filter((s) => s.ts === sites[0]?.ts);
  if (top.length > 1) {
    let ts = top[0].ts.map((u) => [u]);
    let ok = true;
    for (const site of top) { const v = variant(site); if (!v) { ok = false; break; } ts[site.i] = v.slice(site.i, v.length - (site.ts.length - site.i - 1)); }
    if (ok) outs.push(top[0].rebuild(sumOf(ts.flat())));
  }
  return outs;
}
function dreamRule(x) {
  return rewrites(x, (n) => {
    if (n.k !== '^') return [];
    const base = strip(n.a);
    if (!isSum(base)) return [];
    const e = constOf(n.b);
    if (!e || e.d !== 1n || e.n < 2n) return [];
    const ts = termsOf(base);
    const pw = (u) => ({ k: '^', a: { k: 'grp', a: u.s < 0n ? negT(u.t) : u.t }, b: n.b });
    const out = [sumOf(ts.map((u) => ({ s: 1n, t: pw(u) })))];
    if (e.n % 2n === 0n) out.push(sumOf(ts.map((u) => ({ s: u.s, t: pw({ s: 1n, t: u.t }) }))));
    return out;
  });
}
/** monomial quotient t/d with a whole coefficient and no negative power (the src kit's
 * description of "cancels"); undefined otherwise */
function monoQuo(t, d) {
  const a = R(t); const b = R(d);
  if (!pIsConst(a.d) || !pIsConst(b.d)) return undefined;
  const ta = pTermsOf(a.n); const tb = pTermsOf(b.n);
  if (ta.length !== 1 || tb.length !== 1) return undefined;
  const c = qdiv(qdiv(ta[0].c, pConstVal(a.d)), qdiv(tb[0].c, pConstVal(b.d)));
  if (c.d !== 1n) return undefined;
  const de = new Map(tb[0].mono);
  let out = numT(c);
  for (const [n, e] of ta[0].mono) {
    const left = e - (de.get(n) ?? 0); de.delete(n);
    if (left < 0) return undefined;
    if (left > 0) out = mulT(out, { k: '^', a: { k: 'v', name: n }, b: numT(Q(left)) });
  }
  if (de.size) return undefined;
  return out;
}
const isOneT = (x) => { const v = constOf(x); return !!v && qeq(v, ONE); };
function crosserRule(x) {
  const signed = (u) => (u.s < 0n ? negT(u.t) : u.t);
  return rewrites(x, (n) => {
    if (n.k !== '/') return [];
    const nt = termsOf(n.a); const dt = termsOf(n.b);
    const out = [];
    const over = (N, D) => (D.length === 0 ? sumOf(N.length ? N : [{ s: 1n, t: numT(ONE) }]) : divT(sumOf(N.length ? N : [{ s: 1n, t: numT(ONE) }]), sumOf(D)));
    if (nt.length < 2 && dt.length < 2) return [];
    if (dt.length === 1) {
      nt.forEach((u, i) => {
        const quo = monoQuo(signed(u), signed(dt[0]));
        if (!quo) return;
        out.push(over(nt.map((w, j) => (j === i ? { s: 1n, t: quo } : w)), []));
        if (isOneT(quo)) out.push(over(nt.filter((_, j) => j !== i), []));
      });
    } else if (nt.length === 1) {
      dt.forEach((u, j) => {
        const quo = monoQuo(signed(u), signed(nt[0]));
        if (!quo) return;
        out.push(divT(numT(ONE), sumOf(dt.map((w, k) => (k === j ? { s: 1n, t: quo } : w)))));
        if (isOneT(quo)) out.push(divT(numT(ONE), sumOf(dt.filter((_, k) => k !== j))));
      });
    } else {
      nt.forEach((u, i) => dt.forEach((w, j) => {
        const quo = monoQuo(signed(u), signed(w));
        const inv = quo ? undefined : monoQuo(signed(w), signed(u));
        if (quo) out.push(over(nt.map((z, k) => (k === i ? { s: 1n, t: quo } : z)), dt.map((z, k) => (k === j ? { s: 1n, t: numT(ONE) } : z))));
        else if (inv) out.push(over(nt.map((z, k) => (k === i ? { s: 1n, t: numT(ONE) } : z)), dt.map((z, k) => (k === j ? { s: 1n, t: inv } : z))));
        if (quo && same(signed(u), signed(w))) out.push(over(nt.filter((_, k) => k !== i), dt.filter((_, k) => k !== j)));
      }));
    }
    return out;
  });
}
const RULES = {
  'partial-distribution': (x) => distRule(x, 'partial'),
  'neg-distribution': (x) => distRule(x, 'neg'),
  'freshmans-dream-square': dreamRule,
  'cancel-across-sum': crosserRule,
};
/** does applying the named rule to tree a give the value of tree b? undefined if not modelled */
function reproduces(rule, a, b) {
  const f = RULES[rule];
  if (!f) return undefined;
  for (const o of f(a)) { try { if (same(o, b)) return true; } catch (e) { if (!(e instanceof OracleError)) throw e; } }
  return false;
}

// move application on own trees (side-wise)
function moveSide(op, side, operand) {
  const o = { k: 'grp', a: operand };
  switch (op) {
    case 'add': return { k: '+', a: side, b: o };
    case 'sub': return { k: '-', a: side, b: o };
    case 'mul': return mulT({ k: 'grp', a: side }, o);
    case 'div': return divT({ k: 'grp', a: side }, o);
    default: throw new OracleError(`move ${op}`);
  }
}
const opp = { add: 'sub', sub: 'add', mul: 'div', div: 'mul' };
function lineRules(rule, e, mv) {
  const o = T(mv.operand);
  const L = e.l; const Rr = e.r;
  const out = [];
  if (rule === 'one-sided-operation') { out.push({ k: 'eq', l: moveSide(mv.op, L, o), r: Rr }, { k: 'eq', l: L, r: moveSide(mv.op, Rr, o) }); }
  if (rule === 'transpose-no-sign-change' && (mv.op === 'add' || mv.op === 'sub')) {
    out.push({ k: 'eq', l: moveSide(mv.op, L, o), r: moveSide(opp[mv.op], Rr, o) }, { k: 'eq', l: moveSide(opp[mv.op], L, o), r: moveSide(mv.op, Rr, o) });
  }
  if (rule === 'transpose-coefficient-as-subtract' && mv.op === 'div') {
    out.push({ k: 'eq', l: moveSide('div', L, o), r: moveSide('sub', Rr, o) }, { k: 'eq', l: moveSide('sub', L, o), r: moveSide('div', Rr, o) });
  }
  if (rule === 'divide-one-term' && mv.op === 'div' && varsT(o).size === 0) {
    const sliced = (side) => {
      const ts = termsOf(side);
      if (ts.length < 2) return undefined;
      let at = ts.findIndex((u) => varsT(u.t).size > 0);
      if (at < 0) at = 0;
      return sumOf(ts.map((u, i) => (i === at ? { s: u.s, t: divT(u.t, o) } : u)));
    };
    const sl = sliced(L); const sr = sliced(Rr);
    if (sl) out.push({ k: 'eq', l: sl, r: moveSide('div', Rr, o) });
    if (sr) out.push({ k: 'eq', l: moveSide('div', L, o), r: sr });
  }
  return out;
}

// ------------------------------------------------------------ typed forms
/** split a printed expression into top-level signed term strings */
function splitTerms(s) {
  const out = []; let depth = 0; let cur = ''; let sign = '+';
  const t = s.trim();
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth === 0 && (c === '+' || c === '-') && i > 0 && t[i - 1] === ' ' && t[i + 1] === ' ') {
      out.push({ sign, body: cur.trim() }); sign = c; cur = ''; i++; continue;
    }
    cur += c;
  }
  out.push({ sign, body: cur.trim() });
  return out;
}
function joinTerms(ts) {
  return ts.map((u, i) => (i === 0 ? (u.sign === '-' ? `-${u.body}` : u.body) : ` ${u.sign} ${u.body}`)).join('');
}
const reversedTerms = (s) => { const ts = splitTerms(s); if (ts.length < 2 || ts[0].body.startsWith('-')) return undefined; return joinTerms(ts.slice().reverse()); };

function typedForms(p) {
  const a = p.answer; const x = a.expected;
  const out = [];
  const add = (s) => { if (s !== undefined && !out.includes(s)) out.push(s); };
  if (a.kind === 'solution-set') {
    const r = x.roots?.[0];
    if (x.kind === 'finite' && x.roots.length === 1 && r.terms.length === 1 && BigInt(r.terms[0].rad) === 1n) {
      const v = qstr(qFromWire(r.terms[0].coef));
      add(v); add(`x = ${v}`); add(`x=${v}`); add(`(${v})`);
    }
    return out;
  }
  if (a.kind === 'tuple') {
    const parts = x.map(print);
    add(parts.join(', ')); add(parts.join(',').replaceAll(' ', ''));
    add(parts.map((s) => `(${s})`).join(', '));
    const rv = parts.map((s) => reversedTerms(s) ?? s);
    add(rv.join(', '));
    return out;
  }
  if (a.kind === 'equation-sides') {
    const l = print(x.lhs); const r = print(x.rhs);
    add(`${l} = ${r}`); add(`${r} = ${l}`);
    add(`${reversedTerms(l) ?? l} = ${reversedTerms(r) ?? r}`);
    add(`${l}=${r}`.replaceAll(' ', ''));
    return out;
  }
  if (a.kind === 'expr' || a.kind === 'form-of-1') {
    const k = print(x);
    add(k); add(`(${k})`); add(k.replaceAll(' ', ''));
    add(reversedTerms(k));
    // a fraction with a sum on top over a number: split it term by term ((P - 2l)/2 -> P/2 - l style)
    const m = /^\((.*)\)\/(\d+)$/.exec(k);
    if (m) add(joinTerms(splitTerms(m[1]).map((u) => ({ sign: u.sign, body: `(${u.body})/${m[2]}` }))));
    // a negative number: -(n) ; a negative fraction: -(a/b), (-a)/b
    const nf = /^-(\d+)\/(\d+)$/.exec(k);
    if (nf) { add(`-(${nf[1]}/${nf[2]})`); add(`(-${nf[1]})/${nf[2]}`); }
    if (/^-\d+$/.test(k)) add(`-(${k.slice(1)})`);
    if (/^\d+$/.test(k)) add(`((${k}))`);
    // an item that does not ask for lowest terms accepts the reduced value too (and an unreduced key's twin)
    const fr = /^(-?\d+)\/(\d+)$/.exec(k);
    if (fr && a.kind === 'expr' && !a.formPredicates.includes('lowest-terms')) { const r = Q(BigInt(fr[1]), BigInt(fr[2])); if (qstr(r) !== k) add(qstr(r)); }
    // a top-level fraction bar: parenthesize both parts (3V/h -> (3V)/(h); 3/3 -> (3)/(3))
    let depth = 0; let at = -1;
    for (let i = 0; i < k.length; i++) { const c = k[i]; if (c === '(') depth++; else if (c === ')') depth--; else if (c === '/' && depth === 0) at = i; }
    if (at > 0 && !/ [+-] /.test(k.replace(/\([^()]*\)/g, ''))) add(`(${k.slice(0, at)})/(${k.slice(at + 1)})`);
  }
  return out;
}

/** typed answers that are certainly wrong (value off by one; the wrong Next Line lines) */
function wrongForms(p) {
  const a = p.answer; const x = a.expected; const out = [];
  if (a.kind === 'solution-set') {
    const s = setOf(x);
    if (s.kind === 'finite') out.push(qstr(qadd(s.root, ONE)), `x = ${qstr(qsub(s.root, ONE))}`);
  } else if (a.kind === 'tuple') {
    const parts = x.map(print);
    out.push([...parts.slice(0, -1), `${parts[parts.length - 1]} + 1`].join(', '));
  } else if (a.kind === 'equation-sides') {
    out.push(`${print(x.lhs)} + 1 = ${print(x.rhs)}`);
    for (const c of p.choices ?? []) if (c.verdict === 'wrong' && c.display?.t === 'eq') out.push(print(c.display));
  } else if (a.kind === 'expr' && p.variant !== 'fill-blank') {
    out.push(`${print(x)} + 1`);
    for (const c of p.choices ?? []) if (c.verdict === 'wrong' && c.display?.t && p.interaction === 'nextline') out.push(print(c.display));
  } else if (a.kind === 'expr') out.push(`${print(x)} + 1`);
  return out;
}

// ------------------------------------------------------------ the checks
const PROBES_OK = (q) => !(qeq(q, ZERO) || qeq(q, ONE));
function goalProbe(goal) {
  const m = /at ([a-zA-Z]) = (-?\d+(?:\/\d+)?)/.exec(goal ?? '');
  if (!m) return undefined;
  const [n, d] = m[2].split('/');
  return { name: m[1], q: Q(BigInt(n), BigInt(d ?? 1)) };
}
function denominatorsIn(x, acc = []) { // numeric denominators of every '/' in the printed tree
  if (!x) return acc;
  if (x.k === '/') { const v = constOf(x.b); if (v) acc.push(v); }
  for (const key of ['a', 'b', 'l', 'r']) if (x[key]) denominatorsIn(x[key], acc);
  return acc;
}
function varDenominators(x, acc = new Set()) { // letters under any fraction bar or negative power
  if (!x) return acc;
  if (x.k === '/') for (const v of varsT(x.b)) acc.add(v);
  if (x.k === '^') { const e = constOf(x.b); if (e && e.n < 0n) for (const v of varsT(x.a)) acc.add(v); }
  for (const key of ['a', 'b', 'l', 'r']) if (x[key]) varDenominators(x[key], acc);
  return acc;
}
const noFracSide = (x) => { const r = R(x); if (!pIsConst(r.d)) return false; const d = pConstVal(r.d); return [...r.n.values()].every((c) => qdiv(c, d).d === 1n); };

export function checkItem(p, opts = {}) {
  const issues = [];
  const bad = (code, msg) => issues.push({ code, msg });
  const it = p.interaction;
  const goal = p.prompt.goal ?? '';
  try {
    // ---- probes never 0 or 1
    for (const env of p.probes ?? []) for (const [k, v] of Object.entries(env)) if (!PROBES_OK(qFromWire(v))) bad('probe-01', `${k} = ${qstr(qFromWire(v))}`);
    const gp = goalProbe(goal);
    if (gp && !PROBES_OK(gp.q)) bad('goal-probe-01', goal);

    // ---- the printed text and the tree agree (no misreading of the display)
    for (const tree of [p.prompt.math, p.prompt.twin].filter(Boolean)) {
      const a = T(tree); const b = fromNode(tree);
      const ok = isEqT(a) ? sideWise(a, b) && (same(a.l, b.l) && same(a.r, b.r)) : same(a, b);
      if (!ok) bad('print-misread', `${SHOW(tree)} reads differently from its tree`);
    }

    const m = T(p.prompt.math);
    // ---- the key, per interaction
    if (it === 'twin') checkTwin(p, m, bad);
    else if (it === 'why') checkWhy(p, m, bad);
    else if (it === 'forge') checkForge(p, m, bad);
    else if (it === 'cast') checkCast(p, m, bad);
    else if (it === 'trace') checkTrace(p, m, bad);
    else checkTypedKey(p, m, bad);
    if (it === 'nextline') checkNextLine(p, m, bad);
    if (p.skill === 'literal-equations') checkDeclared(p, bad);
    checkChain(p, bad);

    // ---- typed forms judged correct, never unverifiable
    if (!opts.skipJudge) {
      const typed = p.constructed ? p : (it === 'twin' || it === 'nextline' || it === 'forge') ? followUp(p) : undefined;
      if (typed) {
        const forms = typedForms(p);
        if (forms.length < 3) bad('oracle-few-forms', `${p.answer.kind} ${SHOW(p.answer.expected)}`);
        for (const f of wrongForms(p)) {
          const j = judge(typed, f);
          if (j.verdict === 'correct') bad('judge-accepts-wrong', `"${f}" judged correct on ${SHOW(p.prompt.math)} key ${SHOW(p.answer.expected)}`);
          if (j.verdict === 'unverifiable') bad('judge-unverifiable-wrong', `"${f}" on ${SHOW(p.prompt.math)} (${j.error ?? j.note ?? ''})`);
        }
        for (const f of forms) {
          const j = judge(typed, f);
          if (j.verdict === 'unverifiable') bad('judge-unverifiable', `"${f}" on ${SHOW(p.prompt.math)} (${j.error ?? j.note ?? ''})`);
          else if (j.verdict !== 'correct') bad('judge-rejects-correct-form', `"${f}" judged ${j.verdict}${j.note ? ` (${j.note})` : ''} on ${SHOW(p.prompt.math)} key ${SHOW(p.answer.expected)}`);
        }
      }
    }
  } catch (e) {
    if (e instanceof OracleError) bad('oracle-error', `${e.message} on ${SHOW(p.prompt.math)}`);
    else throw e;
  }
  return issues;
}

function checkTypedKey(p, m, bad) {
  const a = p.answer; const goal = p.prompt.goal ?? '';
  switch (a.kind) {
    case 'expr': {
      if (p.variant === 'fill-blank') {
        // L = g(_): the blank K makes the two sides one polynomial
        const K = T(a.expected);
        const filled = parseText(print(p.prompt.math).replace('_', `(${print(a.expected)})`));
        if (!same(filled.l, filled.r)) bad('key-wrong-blank', `${SHOW(p.prompt.math)}: key ${SHOW(a.expected)}`);
        // the factor named in the verb is the GCF of the left side
        const g = /Factor out (.+)$/.exec(p.prompt.verb)?.[1];
        if (g) checkGcf(p, m.l, parseText(g), K, bad);
        return;
      }
      if (p.skill === 'literal-equations') { checkLiteralKey(p, m, T(a.expected), bad); return; }
      const key = T(a.expected);
      if (isEqT(m)) { bad('expr-key-on-equation', SHOW(p.prompt.math)); return; }
      if (!same(key, m)) bad('key-wrong-value', `${SHOW(p.prompt.math)} = ${SHOW(a.expected)}?`);
      const fp = a.formPredicates;
      if (fp.includes('lowest-terms') && varsT(key).size === 0) {
        const s = print(a.expected);
        const f = /^-?(\d+)\/(\d+)$/.exec(s);
        if (f && (gcd(BigInt(f[1]), BigInt(f[2])) !== 1n || f[2] === '1')) bad('key-not-lowest', s);
      }
      if (fp.includes('combined')) {
        const mons = termsOf(key).map((u) => [...R(u.t).n.keys()].join('|'));
        if (new Set(mons).size !== mons.length) bad('key-not-combined', print(a.expected));
      }
      if (fp.includes('expanded') && /\(/.test(print(a.expected))) bad('key-not-expanded', print(a.expected));
      const cd = /common denominator (\d+)/.exec(goal);
      if (cd) {
        const L = BigInt(cd[1]);
        const dens = denominatorsIn(m).map((q) => q.n);
        const lcd = dens.reduce((x, y) => lcm(x, y), 1n);
        if (L !== lcd) bad('stated-denominator-not-least', `${SHOW(p.prompt.math)}: goal says ${L}, LCD ${lcd}`);
        const kd = /\/(\d+)$/.exec(print(a.expected));
        if (!kd || BigInt(kd[1]) !== L) bad('predict-key-not-over-L', `${SHOW(p.prompt.math)} with ${L}: key ${SHOW(a.expected)}`);
      }
      return;
    }
    case 'tuple': {
      if (p.skill === 'factor-gcf') {
        const [g, rest] = a.expected.map(T);
        if (!same(mulT(g, { k: 'grp', a: rest }), m)) bad('key-wrong-factoring', `${SHOW(p.prompt.math)}: ${SHOW(a.expected)}`);
        checkGcf(p, m, g, rest, bad);
        return;
      }
      bad('unhandled-tuple', `${p.skill} ${SHOW(p.prompt.math)}`);
      return;
    }
    case 'solution-set': {
      const want = solveLinear(m);
      const got = setOf(a.expected);
      if (!want) { bad('oracle-cannot-solve', SHOW(p.prompt.math)); return; }
      if (!sameLin(want, got)) bad('key-wrong-solution-set', `${SHOW(p.prompt.math)}: key ${linStr(got)} oracle ${linStr(want)}`);
      if (want.kind === 'finite' && !PROBES_OK(want.root)) bad('root-01', `${SHOW(p.prompt.math)} -> ${qstr(want.root)}`);
      return;
    }
    case 'equation-sides': {
      const mv = p.prompt.move;
      const key = T(a.expected);
      const want = { k: 'eq', l: moveSide(mv.op, m.l, T(mv.operand)), r: moveSide(mv.op, m.r, T(mv.operand)) };
      if (!sideWise(key, want)) bad('key-not-stated-move', `${SHOW(p.prompt.math)} ${SHOW(mv)}: key ${SHOW(a.expected)}`);
      checkMoveText(p, bad);
      if (p.skill === 'clear-fractions') checkClearing(p, m, key, mv, bad);
      if (p.skill === 'literal-equations') {
        const t = /Solve for ([A-Za-z])/.exec(p.prompt.goal ?? '')?.[1];
        if (a.formPredicates.includes(`isolated:${t}`)) {
          const iso = (s, o) => same(s, { k: 'v', name: t }) && !varsT(o).has(t);
          if (!iso(key.l, key.r) && !iso(key.r, key.l)) bad('isolated-key-not-isolated', SHOW(a.expected));
        }
      }
      return;
    }
    default: bad('unhandled-kind', `${a.kind} on ${p.skill} ${p.interaction}`);
  }
}

function setOf(s) {
  if (s.kind !== 'finite') return { kind: s.kind === 'all' ? 'all' : 'none' };
  if (s.roots.length !== 1) return { kind: 'multi' };
  const r = s.roots[0];
  if (r.terms.length > 1 || (r.terms.length === 1 && BigInt(r.terms[0].rad) !== 1n)) return { kind: 'surd' };
  return { kind: 'finite', root: r.terms.length ? qFromWire(r.terms[0].coef) : ZERO };
}

function checkMoveText(p, bad) {
  const mv = p.prompt.move; const goal = p.prompt.goal ?? '';
  const word = { add: 'Add', sub: 'Subtract', div: 'Divide', mul: 'Multiply' }[mv.op];
  const t = print(mv.operand);
  const re = new RegExp(`${word} (both sides by |)\\(?${t.replace(/[()^/+-]/g, (c) => `\\${c}`)}\\)?( to| from| both|\\.|$)`);
  if (!re.test(goal)) bad('move-text', `${goal} vs ${mv.op} ${t}`);
}

/** clear-fractions: the stated multiplier is the LEAST common denominator; the cleared line has no fractions and the same root */
function checkClearing(p, m, key, mv, bad) {
  const L = constOf(T(mv.operand));
  const dens = denominatorsIn(m).map((q) => q.n);
  const lcd = dens.reduce((x, y) => lcm(x, y), 1n);
  const cl = (side) => { const r = R(side); if (!pIsConst(r.d)) return 0n; const d = pConstVal(r.d); return [...r.n.values()].reduce((acc, c) => lcm(acc, qdiv(c, d).d), 1n); };
  const coefLcd = lcm(cl(m.l), cl(m.r));
  if (mv.op === 'mul' && (!L || L.d !== 1n || L.n !== lcd)) bad('clear-not-lcd', `${SHOW(p.prompt.math)}: multiplier ${SHOW(mv.operand)}, printed denominators' LCD ${lcd}`);
  void coefLcd; // combining like terms can lower it (2x/3 - x/6 is x/2); the printed denominators' LCD is the honest multiplier
  if (mv.op === 'mul' && (!noFracSide(key.l) || !noFracSide(key.r))) bad('cleared-line-has-fraction', SHOW(p.answer.expected));
  const s0 = solveLinear(m); const s1 = solveLinear(key);
  if (!sameLin(s0, s1)) bad('cleared-line-changes-root', `${SHOW(p.prompt.math)} ${linStr(s0)} -> ${SHOW(p.answer.expected)} ${linStr(s1)}`);
}

/** factor-gcf: g is the GCF (integer content times the least power of x, sign of the leading term) and the inside has none left */
function checkGcf(p, whole, g, inside, bad) {
  const W = R(whole).n; const G = R(g); const I = R(inside);
  if (!pIsConst(G.d) || !pIsConst(I.d)) { bad('gcf-not-poly', SHOW(p.prompt.math)); return; }
  const ts = pTermsOf(W);
  let c = 0n; let minx = Infinity;
  for (const t of ts) { if (t.c.d !== 1n) { bad('gcf-frac-coef', SHOW(p.prompt.math)); return; } c = gcd(c, t.c.n); const e = t.mono.find(([n]) => n === 'x'); minx = Math.min(minx, e ? e[1] : 0); }
  const gts = pTermsOf(G.n);
  if (gts.length !== 1) { bad('gcf-not-monomial', `${SHOW(p.prompt.math)}: ${print(p.answer.expected?.[0] ?? p.answer.expected)}`); return; }
  const gc = gts[0].c; const ge = gts[0].mono.find(([n]) => n === 'x')?.[1] ?? 0;
  const absg = gc.n < 0n ? -gc.n : gc.n;
  if (gc.d !== 1n || absg !== c || ge !== minx) bad('gcf-not-greatest', `${SHOW(p.prompt.math)}: factor ${print(p.answer.kind === 'tuple' ? p.answer.expected[0] : p.answer.expected)} (verb ${p.prompt.verb}); GCF is ${c}${minx ? `x^${minx}` : ''}`);
  // the inside: integer coefficients, content 1, no common x
  const its = pTermsOf(I.n);
  let ic = 0n; let imin = Infinity;
  for (const t of its) { if (t.c.d !== 1n) bad('gcf-inside-frac', SHOW(p.prompt.math)); ic = gcd(ic, t.c.n); const e = t.mono.find(([n]) => n === 'x'); imin = Math.min(imin, e ? e[1] : 0); }
  if (ic !== 1n || imin !== 0) bad('gcf-inside-not-reduced', `${SHOW(p.prompt.math)}: inside ${SHOW(p.answer.kind === 'tuple' ? p.answer.expected[1] : p.answer.expected)}`);
}

function checkLiteralKey(p, m, key, bad) {
  const t = /Solve for ([A-Za-z])/.exec(p.prompt.goal ?? '')?.[1];
  if (!t) { bad('literal-no-target', p.prompt.goal); return; }
  if (varsT(key).has(t)) bad('literal-key-holds-target', SHOW(p.answer.expected));
  const c = linearCoeffs(m, t);
  if (!c) { bad('literal-not-linear', SHOW(p.prompt.math)); return; }
  // t = -beta/alpha
  const want = rfDiv(rf(c.beta), rf(c.alpha)); // sign below
  const mine = rfSub(rf(pConst(ZERO)), want);
  if (!rfEq(R(key), mine)) bad('literal-key-wrong', `${SHOW(p.prompt.math)} for ${t}: key ${SHOW(p.answer.expected)}`);
}

/** literal-equations: the declared-nonzero list covers every letter it divides by, and the goal text prints it */
function checkDeclared(p, bad) {
  const declared = new Set(p.assumptions.filter((a) => a.rel === 'nonzero' || a.rel === 'pos').map((a) => a.name));
  const goal = p.prompt.goal ?? '';
  for (const n of declared) if (!new RegExp(`\\b${n}\\b[^.]* (is|are) not 0`).test(goal)) bad('declared-not-printed', `${n} in "${goal}"`);
  const printedDecl = /([A-Za-z](?:, [A-Za-z])*(?: and [A-Za-z])?) (?:is|are) not 0/.exec(goal);
  if (printedDecl) for (const n of printedDecl[1].split(/, | and /)) if (!declared.has(n)) bad('printed-not-declared', `${n} in "${goal}"`);
  const trees = [p.prompt.math, p.answer.kind === 'equation-sides' || p.answer.kind === 'expr' ? p.answer.expected : undefined,
    ...(p.choices ?? []).map((c) => c.display).filter((d) => d && d.t), ...(p.steps ?? []).map((s) => s.line)].filter(Boolean);
  for (const tr of trees) {
    for (const v of varDenominators(T(tr))) if (!declared.has(v)) bad('undeclared-divisor', `${v} divides in ${SHOW(tr)} (declared: ${[...declared].join(',') || 'none'})`);
  }
  // the KEY's own denominator as a rational function (not just what is printed under a bar)
  if (p.answer.kind === 'expr' && p.interaction !== 'why') {
    const d = R(T(p.answer.expected)).d;
    for (const k of d.keys()) for (const part of k.split('.').filter(Boolean)) { const n = part.split('^')[0]; if (!declared.has(n)) bad('undeclared-divisor-key', `${n} in ${SHOW(p.answer.expected)}`); }
  }
  const mv = p.prompt.move;
  if (mv && (mv.op === 'div' || mv.op === 'mul') && varsT(T(mv.operand)).size) for (const v of varsT(T(mv.operand))) if (!declared.has(v)) bad('undeclared-move-operand', `${SHOW(mv)}`);
}

function checkTwin(p, m, bad) {
  const tw = T(p.prompt.twin);
  const a = p.answer; const goal = p.prompt.goal ?? '';
  const sameC = (p.choices ?? []).find((c) => c.id === 'same');
  const diffC = (p.choices ?? []).find((c) => c.id === 'different');
  if (!sameC || !diffC) { bad('twin-choices', ''); return; }
  let eqv;
  if (isEqT(m)) {
    const s1 = solveLinear(m); const s2 = solveLinear(tw);
    if (!s1 || !s2) { bad('oracle-cannot-solve', `${SHOW(p.prompt.math)} | ${SHOW(p.prompt.twin)}`); return; }
    eqv = sameLin(s1, s2);
    if (a.kind !== 'solution-set') bad('eq-twin-key-kind', a.kind);
    else if (!sameLin(setOf(a.expected), s1)) bad('eq-twin-key-wrong', `${SHOW(p.prompt.math)}: key ${linStr(setOf(a.expected))} oracle ${linStr(s1)}`);
    if (s1.kind === 'finite' && !PROBES_OK(s1.root)) bad('root-01', `${SHOW(p.prompt.math)} -> ${qstr(s1.root)}`);
    if (!eqv && s2.kind === 'finite' && s1.kind === 'finite') {
      // a Different pair: some probe is a witness (it solves exactly one of them)
    }
  } else {
    eqv = same(m, tw);
    // degree+1 point proof for polynomial pairs in one variable
    const vs = [...new Set([...varsT(m), ...varsT(tw)])];
    const rm = R(m); const rt = R(tw);
    if (vs.length === 1 && pIsConst(rm.d) && pIsConst(rt.d)) {
      const deg = Math.max(pDeg(rm.n), pDeg(rt.n));
      const pts = POINTS.slice(0, deg + 1);
      const agree = pts.every((x) => qeq(rfEval(rm, { [vs[0]]: x }), rfEval(rt, { [vs[0]]: x })));
      if (agree !== eqv) bad('oracle-self-disagree', `${SHOW(p.prompt.math)} vs ${SHOW(p.prompt.twin)}`);
    }
    if (vs.length > 0 && !eqv) {
      const wit = (p.probes ?? []).some((env) => { const e = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, qFromWire(v)])); const x = rfEval(rm, e); const y = rfEval(rt, e); return x && y && !qeq(x, y); });
      if (!wit) bad('twin-diff-no-probe-witness', `${SHOW(p.prompt.math)} vs ${SHOW(p.prompt.twin)}`);
    }
    // follow-up key
    if (eqv && a.kind === 'form-of-1') {
      const k = R(T(a.expected));
      if (!rfEq(k, rf(pConst(ONE)))) bad('twin-coin-not-1', SHOW(a.expected));
    } else if (vs.length === 0) {
      if (eqv) {
        if (a.kind !== 'expr' || !same(T(a.expected), m)) bad('twin-same-key-wrong', `${SHOW(p.prompt.math)}: ${a.kind} ${SHOW(a.expected)}`);
      } else if (a.kind !== 'tuple' || !same(T(a.expected[0]), m) || !same(T(a.expected[1]), tw)) bad('twin-diff-key-wrong', `${SHOW(p.prompt.math)} vs ${SHOW(p.prompt.twin)}: ${a.kind} ${SHOW(a.expected)}`);
    } else {
      const gp = goalProbe(goal);
      if (!gp) bad('twin-no-goal-probe', goal);
      else if (a.kind !== 'expr' || !qeq(constOf(T(a.expected)) ?? Q(99999), rfEval(rm, { [gp.name]: gp.q }))) bad('twin-key-wrong-at-probe', `${SHOW(p.prompt.math)} at ${gp.name} = ${qstr(gp.q)}: key ${SHOW(a.expected)}`);
    }
  }
  if ((sameC.verdict === 'correct') !== eqv || (diffC.verdict === 'correct') === eqv) bad('twin-label-wrong', `${SHOW(p.prompt.math)} vs ${SHOW(p.prompt.twin)}: oracle ${eqv ? 'same' : 'different'}`);
  // tags
  if (eqv) {
    if (diffC.malrule !== 'form-change-changes-value') bad('twin-diff-tag', `different on a Same pair tagged ${diffC.malrule}`);
    if (sameC.malrule) bad('twin-correct-tagged', sameC.malrule);
  } else {
    if (diffC.malrule) bad('twin-correct-tagged', diffC.malrule);
    if (sameC.malrule && !isEqT(m)) {
      const r = reproduces(sameC.malrule, m, tw);
      const r2 = reproduces(sameC.malrule, tw, m);
      if (r === undefined) bad('tag-not-modelled', sameC.malrule);
      else if (!r && !r2) bad('twin-tag-not-reproduced', `${SHOW(p.prompt.math)} -> ${SHOW(p.prompt.twin)} tagged ${sameC.malrule}`);
    }
    if (!sameC.malrule && !isEqT(m)) {
      // an untagged near miss: none of the modelled rules may explain it
      for (const rule of Object.keys(RULES)) if (reproduces(rule, m, tw)) bad('twin-untagged-but-rule', `${SHOW(p.prompt.math)} -> ${SHOW(p.prompt.twin)} is ${rule}`);
    }
  }
}

function checkWhy(p, m, bad) {
  const want = p.variant === 'hidden-1' ? ONE : p.variant === 'hidden-0' ? ZERO : undefined;
  if (!want) { bad('why-variant', String(p.variant)); return; }
  const worth = (node) => rfEq(R(T(node)), rf(pConst(want)));
  let right = 0;
  for (const c of p.choices ?? []) {
    if (c.verdict === 'correct') { right++; if (!worth(c.display)) bad('why-correct-not-worth', `${SHOW(p.prompt.math)}: ${SHOW(c.display)}`); }
    else if (worth(c.display)) bad('why-wrong-also-worth', `${SHOW(p.prompt.math)}: ${SHOW(c.display)}`);
  }
  if (right !== 1) bad('why-correct-count', String(right));
  // the Why line itself is true: an identity (equation), or the value of the chain it came from
  if (isEqT(m)) {
    if (p.skill === 'literal-equations') {
      const t = /next to ([A-Za-z])\./.exec(p.prompt.goal ?? '')?.[1];
      // the formula itself is not on a Why item; the line must at least be linear in the target, with
      // the target's coefficient worth exactly 1 (the coin times the target)
      const c = t ? linearCoeffs(m, t) : undefined;
      if (!c) bad('why-line-not-linear', `${SHOW(p.prompt.math)} (${p.prompt.goal})`);
      else if (!rfEq(rf(c.alpha), rf(c.D)) && !rfEq(rf(c.alpha), rfSub(rf(pConst(ZERO)), rf(c.D)))) bad('why-target-coefficient-not-1', SHOW(p.prompt.math));
    } else if (!same(m.l, m.r)) bad('why-line-not-identity', SHOW(p.prompt.math));
  } else if (p.steps?.length) {
    if (!same(m, T(p.steps[0].line))) bad('why-line-changes-value', `${SHOW(p.prompt.math)} vs ${SHOW(p.steps[0].line)}`);
  }
  // goal-text claims "A = B" before the first period (frac-mult-div, signed-arith, order-of-ops)
  const claim = /^(?:Check )?([^.:]*?) = ([^.:]*?)(?:, regrouped)?[.:]/.exec(p.prompt.goal ?? '');
  if (claim && !/[a-z]{2}/.test(claim[1] + claim[2])) {
    try {
      const A = parseText(claim[1]); const B = parseText(claim[2]);
      if (!same(A, B)) bad('why-goal-claim-false', p.prompt.goal);
      const back = /multiply back by ([^.]+)\./.exec(p.prompt.goal ?? '');
      const want = back ? mulT(A, parseText(back[1])) : A;
      if (!isEqT(m) && !same(m, want)) bad('why-math-not-goal-value', `${SHOW(p.prompt.math)} vs "${claim[1]}"${back ? ` times ${back[1]}` : ''}`);
    } catch (e) { if (!(e instanceof OracleError)) throw e; }
  }
}

function checkForge(p, m, bad) {
  const a = p.answer; const goal = p.prompt.goal ?? '';
  const g = /^In (.+), give (.+) the common denominator (\d+)\.$/.exec(goal);
  if (!g) { bad('forge-goal', goal); return; }
  const sum = parseText(g[1]); const F = parseText(g[2]); const L = BigInt(g[3]);
  if (!same(F, m) || print(p.prompt.math) !== g[2]) bad('forge-math-not-named-fraction', `${SHOW(p.prompt.math)} vs ${g[2]}`);
  const dens = denominatorsIn(sum).map((q) => q.n);
  const lcd = dens.reduce((x, y) => lcm(x, y), 1n);
  if (L !== lcd) bad('forge-L-not-least', `${goal}: LCD ${lcd}`);
  if (!termsOf(sum).some((u) => print(p.prompt.math) === g[2])) bad('forge-fraction-not-in-sum', goal);
  const Fd = constOf(strip(F).b);
  const reaches = (coin) => { const c = strip(T(coin)); if (c.k !== '/') return false; const cd = constOf(c.b); return !!cd && rfEq(R(c), rf(pConst(ONE))) && qeq(qmul(Fd, cd), Q(L)); };
  const worth1 = (coin) => rfEq(R(T(coin)), rf(pConst(ONE)));
  if (a.kind !== 'form-of-1' || !reaches(a.expected)) bad('forge-key-wrong', `${goal}: key ${SHOW(a.expected)}`);
  const key = strip(T(a.expected));
  for (const c of p.choices ?? []) {
    const want = reaches(c.display) ? 'correct' : worth1(c.display) ? 'legal-idle' : 'wrong';
    if (c.verdict !== want) bad('forge-choice-label', `${goal}: ${SHOW(c.display)} labelled ${c.verdict}, oracle ${want}`);
    if (c.malrule === 'one-part-coin') {
      const d = strip(T(c.display));
      const half1 = d.k === '/' && same(d.a, key.a) && same(d.b, numT(ONE));
      const half2 = d.k === '/' && same(d.a, numT(ONE)) && same(d.b, key.b);
      if (!half1 && !half2) bad('forge-tag-not-reproduced', `${goal}: ${SHOW(c.display)} tagged one-part-coin, key ${SHOW(a.expected)}`);
    } else if (c.malrule) bad('forge-tag-not-modelled', c.malrule);
  }
}

function checkNextLine(p, m, bad) {
  const a = p.answer;
  const key = T(a.expected);
  const isE = isEqT(key);
  const eqTo = (x) => (isE ? sideWise(T(x), key) : same(T(x), key));
  for (const c of p.choices ?? []) {
    const ok = eqTo(c.display);
    if (c.verdict === 'correct' && !ok) bad('nextline-correct-not-key', `${SHOW(p.prompt.math)}: ${SHOW(c.display)} vs key ${SHOW(a.expected)}`);
    if (c.verdict === 'wrong' && ok) bad('nextline-wrong-is-key', `${SHOW(p.prompt.math)}: ${SHOW(c.display)}`);
    if (c.verdict === 'wrong') {
      if (!c.malrule) { bad('nextline-untagged', SHOW(c.display)); continue; }
      let rep;
      if (isEqT(m)) {
        const outs = lineRules(c.malrule, m, p.prompt.move);
        if (outs.length === 0 && !['one-sided-operation', 'transpose-no-sign-change', 'divide-one-term'].includes(c.malrule)) rep = undefined;
        else rep = outs.some((o) => sideWise(o, T(c.display)));
      } else rep = reproduces(c.malrule, m, T(c.display));
      if (rep === undefined) bad('tag-not-modelled', c.malrule);
      else if (!rep) bad('nextline-tag-not-reproduced', `${SHOW(p.prompt.math)} ${p.prompt.move ? SHOW(p.prompt.move) : ''}: ${SHOW(c.display)} tagged ${c.malrule}`);
    }
  }
}

function checkCast(p, m, bad) {
  const declared = new Set(p.assumptions.filter((a) => a.rel === 'nonzero' || a.rel === 'pos').map((a) => a.name));
  const lit = p.skill === 'literal-equations';
  const t = lit ? /Solve for ([A-Za-z])/.exec(p.prompt.goal ?? '')?.[1] : 'x';
  if (!lit) checkTypedKey({ ...p, interaction: 'strike' }, m, bad);
  else checkLiteralKey(p, m, T(p.answer.expected), bad);
  const orig = lit ? undefined : solveLinear(m);
  let progress = 0;
  for (const c of p.choices ?? []) {
    const mv = c.display;
    const o = mv.operand ? T(mv.operand) : undefined;
    const vs = o ? varsT(o) : new Set();
    let want;
    if ((mv.op === 'mul' || mv.op === 'div') && o && constOf(o) && qz(constOf(o))) want = 'illegal';
    else if ((mv.op === 'mul' || mv.op === 'div') && [...vs].some((v) => !declared.has(v))) want = 'risky';
    else if (lit) want = 'legal';
    else {
      const after = { k: 'eq', l: moveSide(mv.op, m.l, o), r: moveSide(mv.op, m.r, o) };
      want = sameLin(solveLinear(after), orig) ? 'legal' : 'illegal';
    }
    const got = c.verdict === 'progress' || c.verdict === 'legal-idle' ? 'legal' : c.verdict;
    if (got !== want) bad('cast-verdict', `${SHOW(p.prompt.math)} chip ${SHOW(mv)}: ${c.verdict}, oracle ${want}`);
    if (c.verdict === 'progress') progress++;
    if (got === 'legal' && want === 'legal') {
      const after = { k: 'eq', l: moveSide(mv.op, m.l, o), r: moveSide(mv.op, m.r, o) };
      const done = lit
        ? (same(after.l, { k: 'v', name: t }) && !varsT(after.r).has(t)) || (same(after.r, { k: 'v', name: t }) && !varsT(after.l).has(t))
        : noFracSide(after.l) && noFracSide(after.r);
      if (done && !(c.verdict === 'progress' && c.distance === 0)) bad('cast-reaches-goal-not-progress0', `${SHOW(p.prompt.math)} chip ${SHOW(mv)}: ${c.verdict} d=${c.distance}`);
      if (!done && c.verdict === 'progress' && c.distance === 0) bad('cast-progress0-not-goal', `${SHOW(p.prompt.math)} chip ${SHOW(mv)}`);
      if (!lit && p.moveGraph?.distance === 1 && c.verdict === 'progress' && !done) bad('cast-progress-not-clearing', `${SHOW(p.prompt.math)} chip ${SHOW(mv)}`);
    }
  }
  if (progress < 1) bad('cast-no-progress', SHOW(p.prompt.math));
}

function checkTrace(p, m, bad) {
  checkTypedKey({ ...p, interaction: 'strike' }, m, bad);
  const st = p.steps ?? [];
  const orig = solveLinear(m);
  let firstChange = -1; let prev = orig; let nBad = 0;
  for (let i = 1; i < st.length; i++) {
    const s = solveLinear(T(st[i].line));
    if (!s) { bad('oracle-cannot-solve', SHOW(st[i].line)); return; }
    const keeps = sameLin(s, prev);
    if (st[i].legal && !keeps) bad('trace-legal-line-changes-set', `L${i} ${SHOW(st[i - 1].line)} -> ${SHOW(st[i].line)}: ${linStr(prev)} -> ${linStr(s)}`);
    if (!st[i].legal) { nBad++; if (keeps) bad('trace-bad-line-keeps-set', `L${i} ${SHOW(st[i].line)}`); }
    if (firstChange < 0 && !sameLin(s, orig)) firstChange = i;
    prev = s;
  }
  if (nBad > 1) bad('trace-two-bad', String(nBad));
  // the planted line's tag reproduces from its mal-rule; an untagged plant is no modelled rule's output
  const LINE_RULES = ['one-sided-operation', 'transpose-no-sign-change', 'transpose-coefficient-as-subtract', 'divide-one-term'];
  const explains = (rule, prevT, lineT, mv) => {
    if (LINE_RULES.includes(rule)) return mv ? lineRules(rule, prevT, mv).some((o) => sideWise(o, lineT)) : false;
    const f = RULES[rule];
    if (!f) return undefined;
    return f(prevT).some((o) => isEqT(o) && sideWise(o, lineT));
  };
  for (let i = 1; i < st.length; i++) {
    if (st[i].legal) continue;
    const prevT = T(st[i - 1].line); const lineT = T(st[i].line); const mv = st[i].move;
    if (st[i].malrule) {
      const r = explains(st[i].malrule, prevT, lineT, mv);
      if (r === undefined) bad('tag-not-modelled', st[i].malrule);
      else if (!r) bad('trace-tag-not-reproduced', `${SHOW(st[i - 1].line)} ${mv ? `[${SHOW(mv)}] ` : ''}-> ${SHOW(st[i].line)} tagged ${st[i].malrule}`);
    } else {
      for (const rule of [...LINE_RULES, ...Object.keys(RULES)]) if (explains(rule, prevT, lineT, mv)) bad('trace-untagged-but-rule', `${SHOW(st[i - 1].line)} ${mv ? `[${SHOW(mv)}] ` : ''}-> ${SHOW(st[i].line)} is ${rule}`);
    }
  }
  const want = firstChange < 0 ? 'none' : `L${firstChange}`;
  const right = (p.choices ?? []).filter((c) => c.verdict === 'correct').map((c) => c.id);
  if (right.length !== 1 || right[0] !== want) bad('trace-key', `${SHOW(p.prompt.math)}: marked ${right}, oracle ${want}`);
  if (firstChange < 0) {
    const last = solveLinear(T(st[st.length - 1].line));
    if (!sameLin(last, orig)) bad('trace-clean-ends-wrong', SHOW(st[st.length - 1].line));
  }
}

/** worked chains: every legal line keeps the value / solution set; literal-equations: the substitution check is an identity chain */
function checkChain(p, bad) {
  const st = p.steps ?? [];
  if (p.interaction === 'trace') return;
  for (let i = 1; i < st.length; i++) {
    const a = T(st[i - 1].line); const b = T(st[i].line);
    if (isEqT(a) !== isEqT(b)) { bad('chain-kind-change', `L${i}`); continue; }
    let ok;
    if (isEqT(a)) ok = sameLin(solveLinear(a), solveLinear(b));
    else ok = same(a, b);
    if (st[i].legal && !ok) bad('chain-legal-line-changes', `${p.skill} ${p.interaction}: ${SHOW(st[i - 1].line)} -> ${SHOW(st[i].line)}`);
    if (!st[i].legal && ok) bad('chain-bad-line-keeps', `${SHOW(st[i].line)}`);
    if (st[i].legal && st[i].move && isEqT(a)) {
      const want = { k: 'eq', l: moveSide(st[i].move.op, a.l, T(st[i].move.operand)), r: moveSide(st[i].move.op, a.r, T(st[i].move.operand)) };
      if (!sideWise(b, want)) bad('chain-not-stated-move', `${SHOW(st[i - 1].line)} ${SHOW(st[i].move)} -> ${SHOW(st[i].line)}`);
    }
  }
  if (st.length && !st.every((s) => s.legal) && p.interaction !== 'trace') bad('chain-has-bad-line', p.interaction);
  // the chain starts at the prompt (mint/scales items other than Why / literal-equations)
  if (st.length && p.skill !== 'literal-equations' && p.interaction !== 'why' && p.interaction !== 'forge' && p.interaction !== 'nextline') {
    const a = T(st[0].line); let m = T(p.prompt.math);
    if (p.variant === 'fill-blank') m = m.l;
    if (isEqT(a) !== isEqT(m) || (isEqT(a) ? !sideWise(a, m) : !same(a, m))) bad('chain-not-from-prompt', `${SHOW(st[0].line)} vs ${SHOW(p.prompt.math)}`);
  }
  // literal-equations substitution chain: it plugs the key into the formula side holding the target
  if (p.skill === 'literal-equations' && st.length) {
    const first = T(st[0].line); const last = T(st[st.length - 1].line);
    if (!same(first, last)) bad('literal-check-chain-not-identity', `${SHOW(st[0].line)} -> ${SHOW(st[st.length - 1].line)}`);
  }
}
