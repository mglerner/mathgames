// Independent "buggy students" (adversarial review, M1b). Each model reads
// ONLY the displayed prompt (AST shape + goal text) and returns what a real
// student with that bug would TYPE on a constructed item, as keypad text.
// Arithmetic is ./_oracle.js (BigInt), never src/math or src/misc.
// A model returns [] when the bug does not show on that item.
import { Q, ev, sToQ, qstr, goalProbe, hasVar, qeq } from './_oracle.js';

const num = (n) => (n && n.t === 'num' ? Q(BigInt(n.q.n), BigInt(n.q.d)) : n && n.t === 'neg' && n.arg.t === 'num' ? Q(-BigInt(n.arg.q.n), BigInt(n.arg.q.d)) : undefined);
const strip = (n) => (n && n.t === 'group' ? strip(n.arg) : n);
const qm = (a, b) => Q(a.n * b.n, a.d * b.d);
const qa = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
const qd = (a, b) => Q(a.n * b.d, a.d * b.n);
const qabs = (a) => Q(a.n < 0n ? -a.n : a.n, a.d);
const frac = (n) => { n = strip(n); if (n && n.t === 'frac') { const a = num(n.num), b = num(n.den); if (a && b) return [a, b]; } return undefined; };
const lin = (t) => { // a x + c  -> [a, c]  (t an add of a mono and a const, or a mono)
  t = strip(t);
  const mono = (m) => { m = strip(m); if (m.t === 'var') return Q(1); if (m.t === 'neg') { const k = mono(m.arg); return k && Q(-k.n, k.d); } if (m.t === 'mul' && m.args.length === 2 && strip(m.args[1]).t === 'var') return num(m.args[0]); return undefined; };
  if (t.t === 'add' && t.args.length === 2) {
    const a = mono(t.args[0]); const c = num(t.args[1]) ?? (t.args[1].t === 'neg' ? num(t.args[1]) : undefined);
    if (a && c) return [a, c, 'xc'];
    const a2 = mono(t.args[1]); const c2 = num(t.args[0]);
    if (a2 && c2) return [a2, c2, 'cx'];
  }
  return undefined;
};
const T = (q) => qstr(q);
const linText = (a, c) => `${T(a)}x ${c.n < 0n ? '-' : '+'} ${T(qabs(c))}`;
/** k(ax + c): returns [k, a, c] */
function scaledSum(m) {
  m = strip(m);
  if (m.t === 'mul' && m.args.length === 2) { const k = num(m.args[0]) ?? (frac(m.args[0]) ? qd(...frac(m.args[0])) : undefined); const l = lin(m.args[1]); if (k && l) return [k, l[0], l[1]]; }
  if (m.t === 'neg') { const l = lin(m.arg); if (l) return [Q(-1), l[0], l[1]]; const s = scaledSum(m.arg); if (s) return [Q(-s[0].n, s[0].d), s[1], s[2]]; }
  return undefined;
}

export const students = {
  // n x a/b: the Stacker multiplies top and bottom by n
  'scalar-times-both-parts'(p) {
    if (p.gen !== 'frac-times-whole.core') return [];
    const m = strip(p.prompt.math); if (m.t !== 'mul') return [];
    const [x, y] = m.args; const n = num(x) ?? num(y); const f = frac(x) ?? frac(y);
    if (!n || !f) return [];
    if (p.variant === 'whole-as-fraction') return [`${T(n)}/${T(n)}`];
    return [`${T(qm(n, f[0]))}/${T(qm(n, f[1]))}`];
  },
  'scalar-into-denominator'(p) {
    if (p.gen !== 'frac-times-whole.core') return [];
    const m = strip(p.prompt.math); if (m.t !== 'mul') return [];
    const [x, y] = m.args; const n = num(x) ?? num(y); const f = frac(x) ?? frac(y);
    if (!n || !f) return [];
    if (p.variant === 'whole-as-fraction') return [`1/${T(n)}`];
    return [`${T(f[0])}/${T(qm(n, f[1]))}`];
  },
  // the Half-Coin: the coin k/k reaches only one part
  'one-part-coin'(p) {
    const m = strip(p.prompt.math); const goal = p.prompt.goal ?? '';
    if (p.gen === 'frac-equivalence.core' || p.gen === 'identity-moves.core') {
      if (p.interaction === 'forge') {
        const dm = /denominator (\d+)/.exec(goal); if (!dm) return [];
        const f = strip(m); const b = num(f.den); const k = qd(Q(BigInt(dm[1])), b);
        return [`${T(k)}/1`, `1/${T(k)}`];
      }
      if (m.t === 'mul' && m.args.length === 2) { // (p/q)(k/k)
        const c = frac(m.args[1]); const base = strip(m.args[0]);
        if (!c || !qeq(c[0], c[1])) return [];
        const k = c[0];
        const nb = num(base.num); const db = num(base.den);
        if (!db) return [];
        const cx = nb ? undefined : monoCoef(base.num);
        if (!nb && !cx) return [];
        const top = nb ? T(qm(nb, k)) : `${T(qm(cx, k))}x`;
        const top0 = nb ? T(nb) : `${T(cx)}x`;
        return [`${top}/${T(db)}`, `${top0}/${T(qm(db, k))}`];
      }
      const dm = /denominator (\d+)/.exec(goal);
      if (dm && m.t === 'frac') { // rewrite p/q with denominator N: only the bottom changes
        const db = num(m.den); const nb = num(m.num); const k = qd(Q(BigInt(dm[1])), db);
        const cx = nb ? undefined : monoCoef(m.num); if (!nb && !cx) return [];
        const top0 = nb ? T(nb) : `${T(cx)}x`; const top = nb ? T(qm(nb, k)) : `${T(qm(cx, k))}x`;
        return [`${top0}/${dm[1]}`, `${top}/${T(db)}`];
      }
      if (/lowest terms/.test(goal) && m.t === 'frac') { // divide only one part by the common factor
        const a = num(m.num), b = num(m.den); const g = Q(gcdQ(a.n, b.n));
        return [`${T(qd(a, g))}/${T(b)}`, `${T(a)}/${T(qd(b, g))}`];
      }
      return [];
    }
    if (p.gen === 'rationalize-denominator.core') { // k/sqrt(n) -> k (top only) or k/n (bottom only)
      let f = m; if (f.t === 'mul') f = strip(f.args[0]);
      if (f.t !== 'frac' || strip(f.den).t !== 'root') return [];
      const k = num(f.num); const n = num(strip(f.den).radicand); if (!k || !n) return [];
      if (p.interaction === 'forge') return [`sqrt(${T(n)})/1`, `1/sqrt(${T(n)})`];
      return [T(k), T(qd(k, n))];
    }
    return [];
  },
  'partial-distribution'(p) {
    if (p.prompt.verb === 'Lantern') { // types the NUMBER at the probe
      const s = scaledSum(p.prompt.math); const x = goalProbe(p.prompt.goal); if (!s || !x) return [];
      return [T(qa(qm(qm(s[0], s[1]), x), s[2]))];
    }
    if (!['distribute.core', 'equivalent-expressions.core'].includes(p.gen) || p.interaction === 'trace' || p.interaction === 'why') return [];
    const s = scaledSum(p.prompt.math); if (!s) return [];
    return [linText(qm(s[0], s[1]), s[2])];
  },
  'neg-distribution'(p) {
    const s = scaledSum(p.prompt.math); if (!s || s[0].n > 0n) return [];
    const out = (x) => qa(qm(qm(s[0], s[1]), x), qm(qabs(s[0]), s[2]));
    if (p.prompt.verb === 'Lantern') { const x = goalProbe(p.prompt.goal); return x ? [T(out(x))] : []; }
    if (!['distribute.core', 'equivalent-expressions.core'].includes(p.gen) || p.interaction === 'trace' || p.interaction === 'why') return [];
    return [linText(qm(s[0], s[1]), qm(qabs(s[0]), s[2]))];
  },
  'freshmans-dream-square'(p) {
    const m = strip(p.prompt.math);
    if (m.t !== 'pow' || num(m.exp)?.n !== 2n) return [];
    const l = lin(m.base); if (!l || !qeq(l[0], Q(1))) return [];
    if (p.prompt.verb === 'Lantern') { const x = goalProbe(p.prompt.goal); return [T(qa(qm(x, x), qm(l[1], l[1])))]; }
    const c2 = T(qm(l[1], l[1]));
    return l[1].n < 0n ? [`x^2 + ${c2}`, `x^2 - ${c2}`] : [`x^2 + ${c2}`]; // (x - c)^2: also the kept-minus reading
  },
  'cancel-across-sum'(p) { // (x + kd)/d -> x + k
    const m = strip(p.prompt.math);
    if (m.t !== 'frac') return [];
    const l = lin(m.num); const d = num(m.den); if (!l || !d || !qeq(l[0], Q(1))) return [];
    const k = qd(l[1], d);
    if (p.prompt.verb === 'Lantern') { const x = goalProbe(p.prompt.goal); return [T(qa(x, k))]; }
    return qeq(k, Q(1)) ? [linText(Q(1), k), 'x'] : [linText(Q(1), k)]; // (x + d)/d: also the crossed-out form, x
  },
  'sqrt-product-misapplied'(p) { // k sqrt(m) -> sqrt(k m) (factor enters un-squared); sqrt(k^2 m) -> k^2 sqrt(m) (leaves un-rooted)
    const m = strip(p.prompt.math);
    if (m.t === 'mul' && m.args.length === 2 && strip(m.args[1]).t === 'root') { const k = num(m.args[0]); const r = num(strip(m.args[1]).radicand); if (k && r) return [`sqrt(${T(qm(k, r))})`]; }
    return [];
  },
  'sqrt-splits-sum'(p) {
    const m = strip(p.prompt.math);
    if (m.t !== 'root') return [];
    const r = strip(m.radicand); if (r.t !== 'add' || r.args.length !== 2) return [];
    const [a, b] = r.args.map((x) => sToQ(ev(x)));
    const ra = sqrtInt(a), rb = sqrtInt(b); if (ra === undefined || rb === undefined) return [];
    return [`${ra + rb}`];
  },
  'half-power-is-half'(p) { // every sqrt(n) read as n/2
    if (p.interaction === 'forge' || p.interaction === 'why') return [];
    const v = halfEval(p.prompt.math); return v ? [T(v)] : [];
  },
  'root-square-overshoot'(p) { // sqrt(n) sqrt(n) -> n^2 ; (sqrt n)^2 -> n^2
    if (p.interaction === 'forge' || p.interaction === 'why') return [];
    const m = strip(p.prompt.math);
    const pair = (x) => { x = strip(x); if (x.t === 'mul' && x.args.length === 2 && x.args.every((a) => strip(a).t === 'root') && JSON.stringify(x.args[0], bi) === JSON.stringify(x.args[1], bi)) return num(strip(x.args[0]).radicand); if (x.t === 'pow' && strip(x.base).t === 'root' && num(x.exp)?.n === 2n) return num(strip(x.base).radicand); return undefined; };
    const n = pair(m); if (n) return [T(qm(n, n))];
    // rationalize: k/sqrt(n): k sqrt(n) / n^2
    let f = m; if (f.t === 'mul') f = strip(f.args[0]);
    if (p.gen === 'rationalize-denominator.core' && f.t === 'frac' && strip(f.den).t === 'root') {
      const k = num(f.num); const nn = num(strip(f.den).radicand);
      return [`${T(k)}sqrt(${T(nn)})/${T(qm(nn, nn))}`];
    }
    return [];
  },
  'equals-as-operator'(p) { // a + b = [ ] + c  ->  a + b
    if (p.variant !== 'fill-blank') return [];
    const m = p.prompt.math; if (hasVar(m.lhs)) return [];
    return [T(sToQ(ev(m.lhs)))];
  },
  'copy-coefficients'(p) { // read a, b, c straight off L and R, signs as printed, like powers on both sides added
    if (p.variant !== 'read-abc') return [];
    const coeff = (side) => { const c = [Q(0), Q(0), Q(0)]; for (let i = 0; i < 3; i++) { /* exact: sample */ } return c; };
    void coeff;
    // c_k(L) + c_k(R) by interpolation at x = 0, 1, -1
    const f = (x) => qa(sToQ(ev(p.prompt.math.lhs, { x })), sToQ(ev(p.prompt.math.rhs, { x })));
    const f0 = f(Q(0)), f1 = f(Q(1)), fm = f(Q(-1));
    const a = qd(qa(qa(f1, fm), Q(-2n * f0.n, f0.d)), Q(2)); const b = qd(qa(f1, Q(-fm.n, fm.d)), Q(2)); const c = f0;
    return [`${T(a)}, ${T(b)}, ${T(c)}`];
  },
};
function monoCoef(m) { m = strip(m); if (m.t === 'var') return Q(1); if (m.t === 'mul' && m.args.length === 2 && strip(m.args[1]).t === 'var') return num(m.args[0]); return undefined; }
const bi = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
function gcdQ(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
function sqrtInt(q) { if (!q || q.d !== 1n || q.n < 0n) return undefined; let r = 0n; while ((r + 1n) * (r + 1n) <= q.n) r++; return r * r === q.n ? r : undefined; }
/** evaluate with every sqrt(n) replaced by n/2 (numeric only) */
function halfEval(n) {
  n = strip(n);
  switch (n.t) {
    case 'num': return num(n);
    case 'root': { const r = halfEval(n.radicand); return r && qd(r, Q(2)); }
    case 'mul': return n.args.reduce((s, a) => { const v = halfEval(a); return s && v ? qm(s, v) : undefined; }, Q(1));
    case 'add': return n.args.reduce((s, a) => { const v = halfEval(a); return s && v ? qa(s, v) : undefined; }, Q(0));
    case 'frac': { const a = halfEval(n.num), b = halfEval(n.den); return a && b && b.n !== 0n ? qd(a, b) : undefined; }
    case 'neg': { const a = halfEval(n.arg); return a && Q(-a.n, a.d); }
    case 'pow': { const b = halfEval(n.base); const e = num(n.exp); if (!b || !e || e.d !== 1n || e.n < 0n) return undefined; let r = Q(1); for (let i = 0n; i < e.n; i++) r = qm(r, b); return r; }
    default: return undefined;
  }
}
