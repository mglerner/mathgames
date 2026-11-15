// Independent exact oracle for the gen2 mint / scales generators
// (adversarial review gen2-oracle-a). Shares NOTHING with src/math: its own
// BigInt rationals, its own parser for the PRINTED text (the keypad grammar
// of DESIGN.md section 9: * / and juxtaposition equal precedence, left to
// right; unary minus covers the whole term; ^ right associative), and its
// own multivariate polynomials / rational functions. Identities are decided
// exactly by cross-multiplication (n1 d2 - n2 d1 == 0 as polynomials).

export class OracleError extends Error {}

// ------------------------------------------------------------ rationals
const babs = (a) => (a < 0n ? -a : a);
export function gcd(a, b) { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; }
export function lcm(a, b) { return a === 0n || b === 0n ? 0n : babs(a * b) / gcd(a, b); }
export function Q(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new OracleError('division by zero');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
export const qadd = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
export const qsub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
export const qmul = (a, b) => Q(a.n * b.n, a.d * b.d);
export const qdiv = (a, b) => Q(a.n * b.d, a.d * b.n);
export const qeq = (a, b) => a.n === b.n && a.d === b.d;
export const qz = (a) => a.n === 0n;
export const qstr = (a) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);
export const ZERO = Q(0), ONE = Q(1);
export const qFromWire = (q) => Q(BigInt(q.n), BigInt(q.d));

// ------------------------------------------------------------ parser (printed text -> own tree)
// own tree: {k:'n', q} | {k:'v', name} | {k:'+', a, b} | {k:'-', a, b} | {k:'*', a, b} | {k:'/', a, b}
//           | {k:'neg', a} | {k:'^', a, b} | {k:'eq', l, r}
function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9]/.test(c)) { let j = i; while (j < s.length && /[0-9]/.test(s[j])) j++; out.push({ k: 'num', v: BigInt(s.slice(i, j)) }); i = j; continue; }
    if (s.startsWith('sqrt', i)) throw new OracleError('sqrt not supported here');
    if (/[A-Za-z]/.test(c)) { out.push({ k: 'var', v: c }); i++; continue; }
    if ('+-*/^()='.includes(c)) { out.push({ k: c }); i++; continue; }
    if (c === '_') { out.push({ k: 'var', v: '_' }); i++; continue; }
    throw new OracleError(`bad char ${c} in ${s}`);
  }
  return out;
}
export function parseText(s) {
  const t = tokenize(s);
  let p = 0;
  const peek = () => t[p];
  const eat = (k) => { if (!t[p] || t[p].k !== k) throw new OracleError(`expected ${k} at ${p} in ${s}`); return t[p++]; };
  function expr() {
    let a = term();
    while (peek() && (peek().k === '+' || peek().k === '-')) { const op = t[p++].k; const b = term(); a = { k: op, a, b }; }
    return a;
  }
  function term() {
    if (peek() && peek().k === '-') { p++; return { k: 'neg', a: term() }; }
    let a = factor();
    for (;;) {
      const n = peek();
      if (!n) break;
      if (n.k === '*' || n.k === '/') { p++; const b = factor(); a = { k: n.k, a, b }; continue; }
      if (n.k === 'num' || n.k === 'var' || n.k === '(') { const b = factor(); a = { k: '*', a, b }; continue; }
      break;
    }
    return a;
  }
  function factor() {
    const a = atom();
    if (peek() && peek().k === '^') { p++; return { k: '^', a, b: exponent() }; }
    return a;
  }
  function exponent() {
    if (peek() && peek().k === '-') { p++; return { k: 'neg', a: exponent() }; }
    const a = atom();
    if (peek() && peek().k === '^') { p++; return { k: '^', a, b: exponent() }; }
    return a;
  }
  function atom() {
    const n = peek();
    if (!n) throw new OracleError(`unexpected end in ${s}`);
    if (n.k === 'num') { p++; return { k: 'n', q: Q(n.v) }; }
    if (n.k === 'var') { p++; return { k: 'v', name: n.v }; }
    if (n.k === '(') { p++; const e = expr(); eat(')'); return { k: 'grp', a: e }; }
    throw new OracleError(`unexpected ${n.k} in ${s}`);
  }
  const l = expr();
  let out = l;
  if (peek() && peek().k === '=') { p++; out = { k: 'eq', l, r: expr() }; }
  if (p !== t.length) throw new OracleError(`trailing tokens in ${s}`);
  return out;
}
export const isEqT = (x) => x && x.k === 'eq';
export function varsT(x, acc = new Set()) {
  if (!x) return acc;
  if (x.k === 'v') acc.add(x.name);
  for (const c of [x.a, x.b, x.l, x.r]) if (c) varsT(c, acc);
  return acc;
}

// ------------------------------------------------------------ multivariate polynomials
// poly: Map<monoKey, Q>; monoKey "" (constant) or "x^2.y^1" sorted by name
function monoParse(k) { if (k === '') return []; return k.split('.').map((s) => { const [n, e] = s.split('^'); return [n, Number(e)]; }); }
function monoKey(list) { return list.filter(([, e]) => e !== 0).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([n, e]) => `${n}^${e}`).join('.'); }
function monoMul(a, b) { const m = new Map(monoParse(a)); for (const [n, e] of monoParse(b)) m.set(n, (m.get(n) ?? 0) + e); return monoKey([...m]); }
const P = (entries) => { const m = new Map(); for (const [k, c] of entries) { const v = qadd(m.get(k) ?? ZERO, c); if (qz(v)) m.delete(k); else m.set(k, v); } return m; };
export const pConst = (q) => P([['', q]]);
export const pVar = (n) => P([[`${n}^1`, ONE]]);
export const pAdd = (a, b) => P([...a, ...b]);
export const pNeg = (a) => P([...a].map(([k, c]) => [k, qsub(ZERO, c)]));
export const pScale = (a, q) => P([...a].map(([k, c]) => [k, qmul(c, q)]));
export function pMul(a, b) { const out = []; for (const [k1, c1] of a) for (const [k2, c2] of b) out.push([monoMul(k1, k2), qmul(c1, c2)]); return P(out); }
export const pIsZero = (a) => a.size === 0;
export const pIsConst = (a) => [...a.keys()].every((k) => k === '');
export const pConstVal = (a) => a.get('') ?? ZERO;
export function pDeg(a, v) { let d = 0; for (const k of a.keys()) for (const [n, e] of monoParse(k)) if (!v || n === v) d = Math.max(d, v ? e : 0); if (!v) { for (const k of a.keys()) d = Math.max(d, monoParse(k).reduce((s, [, e]) => s + e, 0)); } return d; }
export function pEval(a, env) {
  let s = ZERO;
  for (const [k, c] of a) {
    let t = c;
    for (const [n, e] of monoParse(k)) {
      const x = env[n];
      if (x === undefined) throw new OracleError(`unbound ${n}`);
      for (let i = 0; i < e; i++) t = qmul(t, x);
    }
    s = qadd(s, t);
  }
  return s;
}
/** coefficient denominators lcm */
export function pDenLcm(a) { let l = 1n; for (const c of a.values()) l = lcm(l, c.d); return l; }
export function pTermsOf(a) { return [...a].map(([k, c]) => ({ mono: monoParse(k), key: k, c })); }

// ------------------------------------------------------------ rational functions
export const rf = (n, d = pConst(ONE)) => ({ n, d });
export const rfAdd = (a, b) => rf(pAdd(pMul(a.n, b.d), pMul(b.n, a.d)), pMul(a.d, b.d));
export const rfNeg = (a) => rf(pNeg(a.n), a.d);
export const rfSub = (a, b) => rfAdd(a, rfNeg(b));
export const rfMul = (a, b) => rf(pMul(a.n, b.n), pMul(a.d, b.d));
export function rfDiv(a, b) { if (pIsZero(b.n)) throw new OracleError('division by zero'); return rf(pMul(a.n, b.d), pMul(a.d, b.n)); }
export const rfIsZero = (a) => pIsZero(a.n);
export const rfEq = (a, b) => rfIsZero(rfSub(a, b));
export function rfEval(a, env) { const d = pEval(a.d, env); if (qz(d)) return undefined; return qdiv(pEval(a.n, env), d); }
/** own tree -> rational function */
export function toRF(x) {
  switch (x.k) {
    case 'n': return rf(pConst(x.q));
    case 'v': return rf(pVar(x.name));
    case 'grp': return toRF(x.a);
    case '+': return rfAdd(toRF(x.a), toRF(x.b));
    case '-': return rfSub(toRF(x.a), toRF(x.b));
    case '*': return rfMul(toRF(x.a), toRF(x.b));
    case '/': return rfDiv(toRF(x.a), toRF(x.b));
    case 'neg': return rfNeg(toRF(x.a));
    case '^': {
      const e = toRF(x.b);
      if (!pIsConst(e.n) || !pIsConst(e.d)) throw new OracleError('variable exponent');
      const ev = qdiv(pConstVal(e.n), pConstVal(e.d));
      if (ev.d !== 1n) throw new OracleError('fractional exponent');
      const b = toRF(x.a);
      let r = rf(pConst(ONE));
      for (let i = 0n; i < babs(ev.n); i++) r = rfMul(r, b);
      return ev.n < 0n ? rfDiv(rf(pConst(ONE)), r) : r;
    }
    default: throw new OracleError(`toRF ${x.k}`);
  }
}
export const rfOfText = (s) => toRF(parseText(s));
export function rfConst(a) {
  if (!pIsConst(a.n) || !pIsConst(a.d)) return undefined;
  return qdiv(pConstVal(a.n), pConstVal(a.d));
}
/** value of a numeric text */
export function valText(s) { const r = rfOfText(s); const v = rfConst(r); if (!v) throw new OracleError(`not numeric: ${s}`); return v; }

/** Solve a linear equation L = R in v; returns {kind:'finite', root} | {kind:'all'} | {kind:'none'} | undefined (not linear in v or other vars). */
export function solveLinear(eqTree, v = 'x') {
  const f = rfSub(toRF(eqTree.l), toRF(eqTree.r));
  // f = N/D; D must be a nonzero constant for our linear check (denominators numeric)
  if (!pIsConst(f.d)) return undefined;
  const N = f.n;
  for (const k of N.keys()) for (const [n, e] of monoParse(k)) if (n !== v || e > 1) return undefined;
  const a = N.get(`${v}^1`) ?? ZERO;
  const b = N.get('') ?? ZERO;
  if (qz(a)) return qz(b) ? { kind: 'all' } : { kind: 'none' };
  return { kind: 'finite', root: qdiv(qsub(ZERO, b), a) };
}
export const sameLin = (s, t) => !!s && !!t && s.kind === t.kind && (s.kind !== 'finite' || qeq(s.root, t.root));
export const linStr = (s) => (!s ? 'undefined' : s.kind === 'finite' ? `{${qstr(s.root)}}` : s.kind);

/** The coefficient pair of a formula L = R that is linear in target t: L - R = alpha t + beta. */
export function linearCoeffs(eqTree, t) {
  const f = rfSub(toRF(eqTree.l), toRF(eqTree.r));
  // multiply through by D: alpha, beta polynomials of the numerator, D must be free of t
  const D = f.d;
  for (const k of D.keys()) if (monoParse(k).some(([n]) => n === t)) return undefined;
  const alpha = []; const beta = [];
  for (const [k, c] of f.n) {
    const m = monoParse(k);
    const e = m.find(([n]) => n === t);
    if (e && e[1] > 1) return undefined;
    if (e) alpha.push([monoKey(m.filter(([n]) => n !== t)), c]); else beta.push([k, c]);
  }
  return { alpha: P(alpha), beta: P(beta), D };
}

// ------------------------------------------------------------ AST (src Node wire format) -> own tree, without src code
export function fromNode(n) {
  if (n.t === 'eq') return { k: 'eq', l: fromNode(n.lhs), r: fromNode(n.rhs) };
  switch (n.t) {
    case 'num': return { k: 'n', q: qFromWire(n.q) };
    case 'var': return { k: 'v', name: n.name };
    case 'add': return n.args.slice(1).reduce((a, b) => ({ k: '+', a, b: fromNode(b) }), fromNode(n.args[0]));
    case 'mul': return n.args.slice(1).reduce((a, b) => ({ k: '*', a, b: fromNode(b) }), fromNode(n.args[0]));
    case 'neg': return { k: 'neg', a: fromNode(n.arg) };
    case 'group': return { k: 'grp', a: fromNode(n.arg) };
    case 'frac': return { k: '/', a: fromNode(n.num), b: fromNode(n.den) };
    case 'pow': return { k: '^', a: fromNode(n.base), b: fromNode(n.exp) };
    default: throw new OracleError(`node ${n.t}`);
  }
}

/** Evaluation points avoiding 0 and 1 (degree+1 points are taken from this list). */
export const POINTS = [2, 3, -1, 5, -2, 7, -3, 11, 4, -5, 13, 6, -7, 17, 8].map((k) => Q(k));
