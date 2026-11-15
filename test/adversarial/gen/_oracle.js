// Independent exact oracle for generator items (adversarial review, M1b).
// Shares NOTHING with src/math: own BigInt rationals, surds, polynomials,
// rational functions, root finding, move application. It reads only the
// Problem's displayed data (prompt.math / twin / move / goal text, choice
// displays, step lines) and recomputes every key and label from them.

// ------------------------------------------------------------ rationals
const babs = (a) => (a < 0n ? -a : a);
export function gcd(a, b) { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; }
export function Q(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new OracleError('division by zero');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
export class OracleError extends Error {}
const qa = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
const qs = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
const qm = (a, b) => Q(a.n * b.n, a.d * b.d);
const qd = (a, b) => Q(a.n * b.d, a.d * b.n);
const qz = (a) => a.n === 0n;
export const qeq = (a, b) => a.n === b.n && a.d === b.d;
export const qstr = (a) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);
const ZERO = Q(0), ONE = Q(1);
const fromWire = (q) => Q(BigInt(q.n), BigInt(q.d));

// ------------------------------------------------------------ surds: Map<radStr, Q>
function squarefree(n) { // n > 0n: returns [k, m] with n = k^2 m, m squarefree
  let k = 1n, m = 1n, r = n;
  for (let p = 2n; p * p <= r; p++) {
    let e = 0n;
    while (r % p === 0n) { r /= p; e++; }
    for (let i = 0n; i < e / 2n; i++) k *= p;
    if (e % 2n === 1n) m *= p;
  }
  return [k, m * r];
}
function S(entries) { // normalize
  const m = new Map();
  for (const [r, c] of entries) {
    if (qz(c)) continue;
    const prev = m.get(r);
    const v = prev ? qa(prev, c) : c;
    if (qz(v)) m.delete(r); else m.set(r, v);
  }
  return m;
}
export const sQ = (q) => S([['1', q]]);
const sAdd = (a, b) => S([...a, ...b]);
const sNeg = (a) => S([...a].map(([r, c]) => [r, qs(ZERO, c)]));
function sMul(a, b) {
  const out = [];
  for (const [r1, c1] of a) for (const [r2, c2] of b) {
    const [k, m] = squarefree(BigInt(r1) * BigInt(r2));
    out.push([`${m}`, qm(qm(c1, c2), Q(k))]);
  }
  return S(out);
}
export const sIsRational = (a) => [...a.keys()].every((r) => r === '1');
export const sToQ = (a) => (sIsRational(a) ? a.get('1') ?? ZERO : undefined);
export const sIsZero = (a) => a.size === 0;
export const sEq = (a, b) => sIsZero(sAdd(a, sNeg(b)));
function sInv(a) {
  if (a.size === 0) throw new OracleError('division by zero');
  if (a.size === 1) {
    const [[r, c]] = [...a];
    // 1/(c sqrt r) = sqrt r / (c r)
    return S([[r, qd(ONE, qm(c, Q(BigInt(r))))]]);
  }
  if (a.size === 2) {
    const [[r1, c1], [r2, c2]] = [...a];
    const conj = S([[r1, c1], [r2, qs(ZERO, c2)]]);
    const den = sMul(a, conj);
    const dq = sToQ(den);
    if (!dq) throw new OracleError('cannot invert surd');
    return sMul(conj, sQ(qd(ONE, dq)));
  }
  throw new OracleError('cannot invert surd of 3+ terms');
}
const sDiv = (a, b) => sMul(a, sInv(b));
function sSqrt(a, flags) {
  const q = sToQ(a);
  if (!q) throw new OracleError('nested radical');
  if (q.n < 0n) { if (flags) flags.negRadicand = true; throw new OracleError('negative radicand'); }
  // sqrt(n/d) = sqrt(n d)/d
  const [k, m] = squarefree(q.n * q.d);
  return S([[`${m}`, Q(k, q.d)]]);
}
export function sApprox(a) { let v = 0; for (const [r, c] of a) v += (Number(c.n) / Number(c.d)) * Math.sqrt(Number(r)); return v; }
export function sStr(a) {
  if (a.size === 0) return '0';
  return [...a].map(([r, c]) => (r === '1' ? qstr(c) : `${qstr(c)}*sqrt(${r})`)).join(' + ');
}
export const fromWireSurd = (s) => S(s.terms.map((t) => [`${BigInt(t.rad)}`, fromWire(t.coef)]));

// ------------------------------------------------------------ exact evaluation
/** value of an AST node at env (Map name->Q), as a surd. flags collects negRadicand. */
export function ev(n, env = {}, flags) {
  switch (n.t) {
    case 'num': return sQ(fromWire(n.q));
    case 'var': {
      if (!(n.name in env)) throw new OracleError(`unbound ${n.name}`);
      return sQ(env[n.name]);
    }
    case 'add': return n.args.reduce((s, a) => sAdd(s, ev(a, env, flags)), S([]));
    case 'mul': return n.args.reduce((s, a) => sMul(s, ev(a, env, flags)), sQ(ONE));
    case 'neg': return sNeg(ev(n.arg, env, flags));
    case 'group': return ev(n.arg, env, flags);
    case 'frac': return sDiv(ev(n.num, env, flags), ev(n.den, env, flags));
    case 'root': {
      if (n.index !== 2) throw new OracleError('index');
      return sSqrt(ev(n.radicand, env, flags), flags);
    }
    case 'pow': {
      const b = ev(n.base, env, flags);
      const e = sToQ(ev(n.exp, env, flags));
      if (!e) throw new OracleError('irrational exponent');
      if (e.d === 2n) {
        const r = sSqrt(b, flags);
        return powInt(r, e.n);
      }
      if (e.d !== 1n) throw new OracleError('rational power');
      return powInt(b, e.n);
    }
    default: throw new OracleError(`node ${n.t}`);
  }
}
function powInt(b, k) {
  if (k < 0n) return sInv(powInt(b, -k));
  let r = sQ(ONE);
  for (let i = 0n; i < k; i++) r = sMul(r, b);
  return r;
}

// ------------------------------------------------------------ polynomials / rational functions in one variable
const pTrim = (p) => { const a = p.slice(); while (a.length && qz(a[a.length - 1])) a.pop(); return a; };
const pAdd = (a, b) => pTrim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => qa(a[i] ?? ZERO, b[i] ?? ZERO)));
const pNeg = (a) => a.map((c) => qs(ZERO, c));
function pMul(a, b) {
  if (!a.length || !b.length) return [];
  const out = Array.from({ length: a.length + b.length - 1 }, () => ZERO);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] = qa(out[i + j], qm(x, y)); }));
  return pTrim(out);
}
export const pDeg = (p) => p.length - 1;
export const pEval = (p, x) => p.reduceRight((acc, c) => qa(qm(acc, x), c), ZERO);
const rf = (n, d = [ONE]) => ({ n: pTrim(n), d: pTrim(d) });
const rfAdd = (a, b) => rf(pAdd(pMul(a.n, b.d), pMul(b.n, a.d)), pMul(a.d, b.d));
const rfMul = (a, b) => rf(pMul(a.n, b.n), pMul(a.d, b.d));
const rfNeg = (a) => rf(pNeg(a.n), a.d);
function rfDiv(a, b) { if (!b.n.length) throw new OracleError('division by zero poly'); return rf(pMul(a.n, b.d), pMul(a.d, b.n)); }
export const rfSub = (a, b) => rfAdd(a, rfNeg(b));
/** AST -> rational function in variable v (other vars, roots -> throw). */
export function toRF(n, v = 'x') {
  switch (n.t) {
    case 'num': return rf([fromWire(n.q)]);
    case 'var': if (n.name !== v) throw new OracleError(`var ${n.name}`); return rf([ZERO, ONE]);
    case 'add': return n.args.reduce((s, a) => rfAdd(s, toRF(a, v)), rf([]));
    case 'mul': return n.args.reduce((s, a) => rfMul(s, toRF(a, v)), rf([ONE]));
    case 'neg': return rfNeg(toRF(n.arg, v));
    case 'group': return toRF(n.arg, v);
    case 'frac': return rfDiv(toRF(n.num, v), toRF(n.den, v));
    case 'pow': {
      const e = n.exp.t === 'num' ? fromWire(n.exp.q) : undefined;
      if (!e || e.d !== 1n) throw new OracleError('pow');
      let r = rf([ONE]); const b = toRF(n.base, v);
      for (let i = 0n; i < babs(e.n); i++) r = rfMul(r, b);
      return e.n < 0n ? rfDiv(rf([ONE]), r) : r;
    }
    case 'root': throw new OracleError('root');
    default: throw new OracleError(`node ${n.t}`);
  }
}
export const rfIsZero = (a) => a.n.length === 0;
export const rfEq = (a, b) => rfIsZero(rfSub(a, b));
export function hasVar(n, name) {
  if (!n || typeof n !== 'object') return false;
  if (n.t === 'var') return name ? n.name === name : true;
  return ['args', 'arg', 'num', 'den', 'base', 'exp', 'radicand', 'lhs', 'rhs'].some((k) => {
    const c = n[k]; if (!c) return false;
    return Array.isArray(c) ? c.some((x) => hasVar(x, name)) : hasVar(c, name);
  });
}
export function hasRoot(n) {
  if (!n || typeof n !== 'object') return false;
  if (n.t === 'root' || (n.t === 'pow' && n.exp.t === 'num' && BigInt(n.exp.q.d) !== 1n)) return true;
  return ['args', 'arg', 'num', 'den', 'base', 'exp', 'radicand', 'lhs', 'rhs'].some((k) => {
    const c = n[k]; if (!c) return false;
    return Array.isArray(c) ? c.some(hasRoot) : hasRoot(c);
  });
}
/** Walk every node. */
export function walk(n, f) {
  if (!n || typeof n !== 'object') return;
  f(n);
  for (const k of ['args', 'arg', 'num', 'den', 'base', 'exp', 'radicand', 'lhs', 'rhs']) {
    const c = n[k]; if (!c) continue;
    if (Array.isArray(c)) c.forEach((x) => walk(x, f)); else walk(c, f);
  }
}

/** Are two expressions identical as functions (exact)? numeric -> surd compare. */
export function sameValue(a, b, v = 'x') {
  if (!hasVar(a) && !hasVar(b)) return sEq(ev(a), ev(b));
  if (hasRoot(a) || hasRoot(b)) throw new OracleError('variable radical');
  return rfEq(toRF(a, v), toRF(b, v));
}

// ------------------------------------------------------------ roots
function intCoeffs(p) { // scale to integer coefficients
  let l = 1n; for (const c of p) l = (l * c.d) / gcd(l, c.d);
  return p.map((c) => (c.n * l) / c.d);
}
function divisors(n) { n = babs(n); const out = []; for (let i = 1n; i * i <= n; i++) if (n % i === 0n) { out.push(i); if (i * i !== n) out.push(n / i); } return out; }
function synthDiv(p, r) { // p(x)/(x - r), p as Q array low->high, exact
  const hi = p.slice().reverse(); const out = []; let acc = ZERO;
  for (const c of hi) { acc = qa(qm(acc, r), c); out.push(acc); }
  out.pop(); return pTrim(out.reverse());
}
/** Real roots of a polynomial, as surds; undefined if it cannot decide. Set semantics. */
export function polyRoots(p) {
  p = pTrim(p);
  if (!p.length) return 'all';
  const roots = [];
  const add = (s) => { if (!roots.some((r) => sEq(r, s))) roots.push(s); };
  let guard = 0;
  while (p.length > 1 && guard++ < 20) {
    if (qz(p[0])) { add(S([])); p = pTrim(p.slice(1)); continue; }
    if (p.length === 2) { add(sQ(qd(qs(ZERO, p[0]), p[1]))); p = [ONE]; break; }
    const ic = intCoeffs(p);
    let found;
    outer: for (const a of divisors(ic[0])) for (const b of divisors(ic[ic.length - 1])) for (const s of [1n, -1n]) {
      const r = Q(s * a, b);
      if (qz(pEval(p, r))) { found = r; break outer; }
    }
    if (found) { add(sQ(found)); p = synthDiv(p, found); continue; }
    if (p.length === 3) {
      const [c, b, a] = p;
      const disc = qs(qm(b, b), qm(Q(4), qm(a, c)));
      if (disc.n < 0n) { p = [ONE]; break; }
      const sq = sSqrt(sQ(disc));
      const mb = sQ(qs(ZERO, b)); const twoA = sQ(qm(Q(2), a));
      add(sDiv(sAdd(mb, sq), twoA)); add(sDiv(sAdd(mb, sNeg(sq)), twoA));
      p = [ONE]; break;
    }
    return undefined;
  }
  return roots;
}
/** Solution set of eq (L = R) in v: { kind:'all'|'none'|'finite', roots } or undefined. */
export function solveEq(eq, v = 'x') {
  const f = rfSub(toRF(eq.lhs, v), toRF(eq.rhs, v));
  const num = polyRoots(f.n);
  const poles = polyRoots(f.d);
  if (num === undefined || poles === undefined || poles === 'all') return undefined;
  if (num === 'all') return poles.length ? { kind: 'all-except', poles } : { kind: 'all' };
  const roots = num.filter((r) => !poles.some((p) => sEq(p, r)));
  return roots.length ? { kind: 'finite', roots } : { kind: 'none' };
}
export function sameSet(a, b) {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind !== 'finite') return true;
  return a.roots.length === b.roots.length && a.roots.every((r) => b.roots.some((s) => sEq(r, s)));
}
export function setFromWire(s) {
  if (s.kind !== 'finite') return { kind: s.kind };
  return { kind: 'finite', roots: s.roots.map(fromWireSurd) };
}
export function setStr(s) { if (!s) return 'undefined'; return s.kind === 'finite' ? `{${s.roots.map(sStr).join(', ')}}` : s.kind; }

// ------------------------------------------------------------ moves (own application)
const N = (q) => ({ t: 'num', q: { n: q.n, d: q.d } });
export function applyMoveSide(op, side, operand) {
  switch (op) {
    case 'add': return { t: 'add', args: [side, operand] };
    case 'sub': return { t: 'add', args: [side, { t: 'neg', arg: operand }] };
    case 'mul': return { t: 'mul', args: [side, operand] };
    case 'div': return { t: 'frac', num: side, den: operand };
    case 'square': return { t: 'pow', base: side, exp: N(Q(2)) };
    default: throw new OracleError(`move ${op}`);
  }
}
export function applyMove(m, eq) {
  return { t: 'eq', lhs: applyMoveSide(m.op, eq.lhs, m.operand), rhs: applyMoveSide(m.op, eq.rhs, m.operand) };
}
/** side-wise equality, swap allowed. */
export function sidewise(got, want, v = 'x') {
  const eqS = (a, b) => { try { return sameValue(a, b, v); } catch { return false; } };
  return (eqS(got.lhs, want.lhs) && eqS(got.rhs, want.rhs)) || (eqS(got.lhs, want.rhs) && eqS(got.rhs, want.lhs));
}
export const isEq = (x) => x && x.t === 'eq';
export const isMoveObj = (x) => x && typeof x.op === 'string' && !x.t;

/** Parse a "x = N" or "at x = N" value from goal text. */
export function goalProbe(goal) {
  const m = /x = (-?\d+(?:\/\d+)?)/.exec(goal ?? '');
  if (!m) return undefined;
  const [a, b] = m[1].split('/');
  return Q(BigInt(a), BigInt(b ?? 1));
}
export function nodeAt(x, path) {
  const parts = path.split('.');
  let n = isEq(x) ? (parts[0] === 'l' ? x.lhs : parts[0] === 'r' ? x.rhs : undefined) : parts[0] === 'e' ? x : undefined;
  for (let i = 1; i < parts.length && n; i++) {
    const k = Number(parts[i]);
    const kids = n.t === 'add' || n.t === 'mul' ? n.args : n.t === 'neg' || n.t === 'group' ? [n.arg] : n.t === 'frac' ? [n.num, n.den] : n.t === 'pow' ? [n.base, n.exp] : n.t === 'root' ? [n.radicand] : [];
    n = kids[k];
  }
  return n;
}
export const deepEq = (a, b) => JSON.stringify(a, (k, v) => (typeof v === 'bigint' ? v.toString() : v)) === JSON.stringify(b, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
export { ZERO, ONE, sAdd, sMul, sNeg, sDiv, sSqrt, N as numNode };
