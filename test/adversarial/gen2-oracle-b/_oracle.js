// Independent exact oracle for the exponent / radical generators (gen2 review,
// lens: answer keys, distractors and tags). Shares NOTHING with src/math: own
// BigInt rationals, own real field Q(sqrt p1, sqrt p2, ...) (a sum of
// coef x sqrt(r), r squarefree), own AST evaluator, own quadratic solver and
// own re-implementations of the mal-rules that tag these items. It reads the
// generator's Node trees only as data (t / q / args / ...).

export class Domain extends Error {} // undefined value (0 division, negative radicand, ...)
export class Unsupported extends Error {} // outside what this oracle can evaluate exactly

// ------------------------------------------------------------------ rationals
const babs = (a) => (a < 0n ? -a : a);
export function gcd(a, b) { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; }
export function Q(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new Domain('division by zero');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
const qadd = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
const qmul = (a, b) => Q(a.n * b.n, a.d * b.d);
const qneg = (a) => ({ n: -a.n, d: a.d });
const qinv = (a) => Q(a.d, a.n);
const qeq = (a, b) => a.n === b.n && a.d === b.d;
const qzero = (a) => a.n === 0n;
export const qstr = (a) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);

// ---------------------------------------------------------------- squarefree
const sfCache = new Map();
/** N > 0 -> [s, m] with N = s^2 m, m squarefree. */
export function squarePart(N) {
  if (N <= 0n) throw new Error('squarePart of nonpositive');
  const k = N.toString();
  if (sfCache.has(k)) return sfCache.get(k);
  let s = 1n; let m = N;
  for (let p = 2n; p * p <= m; p++) {
    while (m % (p * p) === 0n) { m /= p * p; s *= p; }
  }
  const r = [s, m];
  if (sfCache.size < 200000) sfCache.set(k, r);
  return r;
}
export const isSquarefree = (N) => N > 0n && squarePart(N)[0] === 1n;

// ----------------------------------------------------------- field elements
// An element: Map(radicand string -> Q), radicand squarefree, '1' rational part.
export const F = {
  q(x) { const m = new Map(); if (!qzero(x)) m.set('1', x); return m; },
  int(n) { return F.q(Q(n)); },
  add(a, b) {
    const m = new Map(a);
    for (const [r, c] of b) { const s = m.has(r) ? qadd(m.get(r), c) : c; if (qzero(s)) m.delete(r); else m.set(r, s); }
    return m;
  },
  neg(a) { const m = new Map(); for (const [r, c] of a) m.set(r, qneg(c)); return m; },
  sub(a, b) { return F.add(a, F.neg(b)); },
  mul(a, b) {
    let out = new Map();
    for (const [ra, ca] of a) for (const [rb, cb] of b) {
      const A = BigInt(ra); const B = BigInt(rb); const g = gcd(A, B);
      const rad = (A / g) * (B / g);
      out = F.add(out, new Map([[rad.toString(), qmul(qmul(ca, cb), Q(g))]]));
    }
    return out;
  },
  isZero(a) { return a.size === 0; },
  eq(a, b) { return F.isZero(F.sub(a, b)); },
  isRational(a) { return a.size === 0 || (a.size === 1 && a.has('1')); },
  rat(a) { return a.size === 0 ? Q(0n) : a.get('1'); },
  inv(a) {
    if (F.isZero(a)) throw new Domain('division by zero');
    if (F.isRational(a)) return F.q(qinv(F.rat(a)));
    // pick a prime dividing some radicand > 1, conjugate on it
    let p = 0n;
    for (const r of a.keys()) { const R = BigInt(r); if (R > 1n) { for (let k = 2n; k <= R; k++) if (R % k === 0n) { p = k; break; } break; } }
    const conj = new Map();
    for (const [r, c] of a) conj.set(r, BigInt(r) % p === 0n ? qneg(c) : c);
    const prod = F.mul(a, conj);
    return F.mul(conj, F.inv(prod));
  },
  approx(a) { let s = 0; for (const [r, c] of a) s += (Number(c.n) / Number(c.d)) * Math.sqrt(Number(r)); return s; },
  sign(a) {
    if (F.isZero(a)) return 0;
    if (F.isRational(a)) return F.rat(a).n > 0n ? 1 : -1;
    if (a.size === 1) { const [, c] = [...a][0]; return c.n > 0n ? 1 : -1; }
    // a + b sqrt(r) with two terms: compare exactly by squaring
    if (a.size === 2) {
      const [[r1, c1], [r2, c2]] = [...a];
      const s1 = c1.n > 0n ? 1 : -1; const s2 = c2.n > 0n ? 1 : -1;
      if (s1 === s2) return s1;
      const m1 = qmul(qmul(c1, c1), Q(BigInt(r1))); const m2 = qmul(qmul(c2, c2), Q(BigInt(r2)));
      const d = qadd(m1, qneg(m2));
      return (d.n > 0n ? s1 : s2);
    }
    const v = F.approx(a); if (Math.abs(v) < 1e-9) throw new Unsupported('sign too close to 0'); return v > 0 ? 1 : -1;
  },
  sqrt(a) {
    if (!F.isRational(a)) throw new Unsupported('sqrt of an irrational');
    const x = F.rat(a);
    if (x.n < 0n) throw new Domain('negative radicand');
    if (x.n === 0n) return F.int(0n);
    const [s, m] = squarePart(x.n * x.d);
    return new Map([[m.toString(), Q(s, x.d)]]);
  },
  pow(a, e) {
    if (e.d === 1n) {
      let n = e.n; let base = a;
      if (n < 0n) { base = F.inv(a); n = -n; }
      if (n === 0n) { if (F.isZero(a)) throw new Domain('0^0'); return F.int(1n); }
      if (n > 64n) throw new Unsupported('huge power');
      let r = F.int(1n); for (let i = 0n; i < n; i++) r = F.mul(r, base);
      return r;
    }
    if (e.d === 2n) {
      if (F.isZero(a) && e.n < 0n) throw new Domain('0 to a negative power');
      const s = F.sqrt(a); // Domain on negative base
      return F.pow(s, Q(e.n));
    }
    if (e.d % 2n === 0n) return F.pow(F.sqrt(a), Q(e.n, e.d / 2n));
    if (!F.isRational(a)) throw new Unsupported('odd root of an irrational');
    const x = F.rat(a); const k = e.d;
    const root = (n) => { const neg = n < 0n; let m = neg ? -n : n; let lo = 0n, hi = m + 1n; while (lo < hi) { const mid = (lo + hi) / 2n; if (mid ** k < m) lo = mid + 1n; else hi = mid; } return lo ** k === m ? (neg ? -lo : lo) : undefined; };
    const rn = root(x.n); const rd = root(x.d);
    if (rn === undefined || rd === undefined) throw new Unsupported('inexact odd root');
    return F.pow(F.q(Q(rn, rd)), Q(e.n));
  },
  str(a) {
    if (a.size === 0) return '0';
    return [...a].sort().map(([r, c]) => (r === '1' ? qstr(c) : `${qstr(c)}*sqrt(${r})`)).join(' + ');
  },
};

// ------------------------------------------------------------------ AST walk
export const BLANK = '_';
const un = (x) => { while (x && x.t === 'group') x = x.arg; return x; };
export { un as stripGroup };

/** Exact value of a Node in env (var -> field element). */
export function ev(n, env) {
  switch (n.t) {
    case 'num': return F.q(Q(n.q.n, n.q.d));
    case 'var': {
      if (!(n.name in env)) throw new Unsupported(`unbound ${n.name}`);
      return env[n.name];
    }
    case 'group': return ev(n.arg, env);
    case 'neg': return F.neg(ev(n.arg, env));
    case 'add': return n.args.reduce((s, a) => F.add(s, ev(a, env)), F.int(0n));
    case 'mul': return n.args.reduce((s, a) => F.mul(s, ev(a, env)), F.int(1n));
    case 'frac': { const d = ev(n.den, env); return F.mul(ev(n.num, env), F.inv(d)); }
    case 'pow': {
      const e = ev(n.exp, env);
      if (!F.isRational(e)) throw new Unsupported('irrational exponent');
      return F.pow(ev(n.base, env), F.rat(e));
    }
    case 'root': {
      if (n.index !== 2) throw new Unsupported('root index');
      return F.sqrt(ev(n.radicand, env));
    }
    default: throw new Unsupported(`node ${n.t}`);
  }
}

export function kids(n) {
  switch (n.t) {
    case 'group': case 'neg': return [n.arg];
    case 'add': case 'mul': return n.args;
    case 'frac': return [n.num, n.den];
    case 'pow': return [n.base, n.exp];
    case 'root': return [n.radicand];
    case 'eq': return [n.lhs, n.rhs];
    default: return [];
  }
}
export function walk(n, f) { f(n); for (const k of kids(n)) walk(k, f); }
export function varsIn(n) { const s = new Set(); walk(n, (x) => { if (x.t === 'var' && x.name !== BLANK) s.add(x.name); }); return s; }

/** Variables that sit under a square root or in the base of a non-integer power. */
export function radicalVars(n) {
  const out = new Set();
  walk(n, (x) => {
    if (x.t === 'root') for (const v of varsIn(x.radicand)) out.add(v);
    if (x.t === 'pow') {
      const e = un(x.exp);
      if (varsIn(x.exp).size || (() => { let b = false; walk(x.exp, (y) => { if (y.t === 'var' && y.name === BLANK) b = true; }); return b; })()) return;
      let nonInt = true;
      try { const val = ev(x.exp, {}); nonInt = !(F.isRational(val) && F.rat(val).d === 1n); } catch { nonInt = true; }
      if (e && nonInt) for (const v of varsIn(x.base)) out.add(v);
    }
  });
  return out;
}

/** Numeric radicands (no variables) that are negative; and radicands with variables. */
export function radicands(n) {
  const out = [];
  walk(n, (x) => {
    if (x.t === 'root') out.push(x.radicand);
    if (x.t === 'pow') {
      let half = false;
      try { const val = ev(x.exp, {}); half = F.isRational(val) && F.rat(val).d !== 1n; } catch { half = false; }
      if (half) out.push(x.base);
    }
  });
  return out;
}

// ------------------------------------------------------------- equations
/** Coefficients [A, B, C] of lhs - rhs as a polynomial in v of degree <= 2 (checked at a 4th point). */
export function quadCoeffs(eqn, v, env = {}) {
  const f = (x) => F.sub(ev(eqn.lhs, { ...env, [v]: F.q(x) }), ev(eqn.rhs, { ...env, [v]: F.q(x) }));
  const f0 = f(Q(0n)); const f1 = f(Q(1n)); const fm = f(Q(-1n)); const f2 = f(Q(2n)); const f5 = f(Q(5n));
  const C = f0;
  const A = F.mul(F.sub(F.add(f1, fm), F.mul(F.int(2n), f0)), F.q(Q(1n, 2n)));
  const B = F.mul(F.sub(f1, fm), F.q(Q(1n, 2n)));
  const p = (x) => F.add(F.add(F.mul(A, F.int(x * x)), F.mul(B, F.int(x))), C);
  if (!F.eq(p(2n), f2) || !F.eq(p(5n), f5)) throw new Unsupported('not a quadratic');
  return [A, B, C];
}
/** The real solution set of a quadratic (or linear) equation: array of field elements, or 'all'. */
export function solveQuad(eqn, v) {
  const [A, B, C] = quadCoeffs(eqn, v);
  if (F.isZero(A)) {
    if (F.isZero(B)) return F.isZero(C) ? 'all' : [];
    return [F.mul(F.neg(C), F.inv(B))];
  }
  const D = F.sub(F.mul(B, B), F.mul(F.int(4n), F.mul(A, C)));
  const s = F.sign(D);
  if (s < 0) return [];
  const inv2A = F.inv(F.mul(F.int(2n), A));
  if (s === 0) return [F.mul(F.neg(B), inv2A)];
  const r = F.sqrt(D);
  return [F.mul(F.sub(F.neg(B), r), inv2A), F.mul(F.add(F.neg(B), r), inv2A)];
}
/** A generator Surd ({terms:[{coef,rad}]}) as a field element. */
export function fromSurd(s) {
  let out = F.int(0n);
  for (const t of s.terms) {
    const [sq, m] = squarePart(BigInt(t.rad));
    out = F.add(out, new Map([[m.toString(), qmul(Q(t.coef.n, t.coef.d), Q(sq))]]));
  }
  return out;
}

// ------------------------------------------------------------- probe sets
const fq = (n, d = 1n) => F.q(Q(n, d));
export const PROBES = {
  // perfect squares first (clean roots), then non-squares (exact surds), then a fraction
  nonneg: [fq(4n), fq(9n), fq(16n), fq(2n), fq(3n), fq(1n, 4n), fq(25n, 9n), fq(0n)],
  pos: [fq(4n), fq(9n), fq(16n), fq(2n), fq(3n), fq(1n, 4n), fq(25n, 9n)],
  nonzero: [fq(2n), fq(3n), fq(-1n), fq(5n), fq(-2n), fq(1n, 2n), fq(-1n, 3n), fq(4n)],
  none: [fq(2n), fq(3n), fq(-1n), fq(5n), fq(-2n), fq(1n, 2n), fq(-1n, 3n), fq(0n), fq(4n)],
};
/** Cartesian probe envs for the variables, by declared relation. */
export function envs(vars, assumptions) {
  const rel = Object.fromEntries((assumptions ?? []).map((a) => [a.name, a.rel]));
  let out = [{}];
  for (const v of vars) {
    const vals = PROBES[rel[v] ?? 'none'];
    const next = [];
    for (const e of out) for (const x of vals) next.push({ ...e, [v]: x });
    out = next.slice(0, 200);
  }
  return out;
}
/** Try ev; Domain -> undefined. Unsupported propagates. */
export function tryEv(n, env) { try { return ev(n, env); } catch (e) { if (e instanceof Domain) return undefined; throw e; } }

/** Compare two nodes over envs: { same, witness, compared, onlyOne } */
export function compare(a, b, es) {
  let compared = 0; let witness; let onlyOne = 0;
  for (const e of es) {
    const va = tryEv(a, e); const vb = tryEv(b, e);
    if (va === undefined && vb === undefined) continue;
    if (va === undefined || vb === undefined) { onlyOne++; continue; }
    compared++;
    if (!F.eq(va, vb) && !witness) witness = e;
  }
  return { same: compared > 0 && !witness, witness, compared, onlyOne };
}

// ---------------------------------------------------------- tree helpers
export const N = {
  num: (n, d = 1n) => ({ t: 'num', q: Q(n, d) }),
  q: (x) => ({ t: 'num', q: x }),
  add: (...args) => ({ t: 'add', args }),
  mul: (...args) => ({ t: 'mul', args }),
  frac: (a, b) => ({ t: 'frac', num: a, den: b }),
  sqrt: (a) => ({ t: 'root', index: 2, radicand: a }),
  pow: (a, b) => ({ t: 'pow', base: a, exp: b }),
  neg: (a) => ({ t: 'neg', arg: a }),
};
/** All trees obtained by rewriting exactly one node (pre-order) with each of f(node)'s outputs, plus all-at-once. */
export function rewrites(tree, f) {
  const outs = [];
  const rec = (n, rebuild) => {
    for (const r of f(n)) outs.push(rebuild(r));
    const k = n.t;
    if (k === 'group' || k === 'neg') rec(n.arg, (x) => rebuild({ ...n, arg: x }));
    else if (k === 'add' || k === 'mul') n.args.forEach((a, i) => rec(a, (x) => rebuild({ ...n, args: n.args.map((y, j) => (j === i ? x : y)) })));
    else if (k === 'frac') { rec(n.num, (x) => rebuild({ ...n, num: x })); rec(n.den, (x) => rebuild({ ...n, den: x })); }
    else if (k === 'pow') { rec(n.base, (x) => rebuild({ ...n, base: x })); rec(n.exp, (x) => rebuild({ ...n, exp: x })); }
    else if (k === 'root') rec(n.radicand, (x) => rebuild({ ...n, radicand: x }));
  };
  rec(tree, (x) => x);
  // all at once (first output of each matching node, bottom-up)
  const all = (n) => {
    let m = n;
    const k = n.t;
    if (k === 'group' || k === 'neg') m = { ...n, arg: all(n.arg) };
    else if (k === 'add' || k === 'mul') m = { ...n, args: n.args.map(all) };
    else if (k === 'frac') m = { ...n, num: all(n.num), den: all(n.den) };
    else if (k === 'pow') m = { ...n, base: all(n.base), exp: all(n.exp) };
    else if (k === 'root') m = { ...n, radicand: all(n.radicand) };
    const r = f(n);
    return r.length ? r[0] : m;
  };
  outs.push(all(tree));
  return outs;
}
const constQ = (n) => { try { const v = ev(n, {}); return F.isRational(v) ? F.rat(v) : undefined; } catch { return undefined; } };
const isHalfPow = (n) => n.t === 'pow' && (() => { const e = constQ(n.exp); return e && e.n === 1n && e.d === 2n; })();

// ---------------------------------------------------- own mal-rule models
// Each returns candidate output trees for an expression prompt.
export const MAL = {
  'half-power-is-half': (t) => rewrites(t, (n) => (n.t === 'root' ? [N.frac(n.radicand, N.num(2n))] : isHalfPow(n) ? [N.frac(n.base, N.num(2n))] : [])),
  'sqrt-splits-sum': (t) => rewrites(t, (n) => {
    const r = n.t === 'root' ? un(n.radicand) : isHalfPow(n) ? un(n.base) : undefined;
    if (!r || r.t !== 'add') return [];
    return [N.add(...r.args.map((a) => (un(a).t === 'neg' ? N.neg(N.sqrt(un(a).arg)) : N.sqrt(a))))];
  }),
  'sqrt-product-misapplied': (t) => {
    const outs = rewrites(t, (n) => {
      if (n.t !== 'root') return [];
      const v = constQ(n.radicand);
      if (!v || v.d !== 1n || v.n < 4n) return [];
      const res = [];
      const ss = []; for (let s = 2n; s * s <= v.n; s++) ss.unshift(s);
      for (const s of ss) if (v.n % (s * s) === 0n) res.push(N.mul(N.num(s * s), N.sqrt(N.num(v.n / (s * s)))));
      return res;
    });
    // k sqrt(m) -> sqrt(k m) (factor enters un-squared), anywhere
    outs.push(...rewrites(t, (n) => {
      if (n.t !== 'mul' || n.args.length !== 2) return [];
      const [a, b] = n.args.map(un);
      const k = constQ(a);
      if (k && k.d === 1n && k.n > 1n && b.t === 'root') return [N.sqrt(N.mul(a, b.radicand))];
      return [];
    }));
    return outs;
  },
  'root-square-overshoot': (t) => {
    const outs = rewrites(t, (n) => {
      if (n.t === 'pow' && un(n.base).t === 'root') { const e = constQ(n.exp); if (e && e.n === 2n && e.d === 1n) return [N.pow(un(n.base).radicand, N.num(2n))]; }
      if (n.t === 'mul') {
        const res = [];
        for (let i = 0; i < n.args.length; i++) for (let j = i + 1; j < n.args.length; j++) {
          const a = un(n.args[i]); const b = un(n.args[j]);
          if (a.t === 'root' && b.t === 'root') {
            const va = constQ(a.radicand); const vb = constQ(b.radicand);
            if (va && vb && qeq(va, vb)) res.push(N.mul(...n.args.filter((_, k) => k !== i && k !== j), N.pow(a.radicand, N.num(2n))));
          }
        }
        return res;
      }
      return [];
    });
    // implied coin on K / (c sqrt n) (rationalize): K sqrt(n) / (c n^2)
    const u = un(t);
    if (u.t === 'frac') {
      const den = un(u.den);
      const parts = den.t === 'mul' ? den.args.map(un) : [den];
      const roots = parts.filter((p) => p.t === 'root');
      if (roots.length === 1) {
        const rest = parts.filter((p) => p.t !== 'root');
        const rn = roots[0].radicand;
        outs.push(N.frac(N.mul(u.num, N.sqrt(rn)), N.mul(...rest, N.pow(rn, N.num(2n)))));
      }
    }
    return outs;
  },
  'one-part-coin': (t) => {
    // implied coin on K / D with D holding a root: numerator only, denominator only
    const u = un(t);
    if (u.t !== 'frac') return [];
    const den = un(u.den);
    const outs = [];
    const coins = [];
    const parts = den.t === 'mul' ? den.args.map(un) : [den];
    for (const p of parts) if (p.t === 'root') coins.push(p);
    if (den.t === 'add' && den.args.length === 2) {
      const [a, b] = den.args.map(un);
      coins.push(b.t === 'neg' ? N.add(a, b.arg) : N.add(a, N.neg(b)));
    }
    for (const c of coins) { outs.push(N.frac(N.mul(u.num, c), u.den)); outs.push(N.frac(u.num, N.mul(u.den, c))); }
    return outs;
  },
  'cancel-across-sum': (t) => {
    const u = un(t);
    const outs = [];
    if (u.t !== 'frac') return outs;
    const den = un(u.den); const nu = constQ(u.num);
    if (den.t === 'add') {
      // cancel a term of the denominator against the numerator: k/(k +- r) -> 1/(+-r)  (and k/(a +- r) with k | a)
      den.args.forEach((a, i) => {
        const va = constQ(a);
        if (va && nu && !qzero(va)) {
          const others = den.args.filter((_, j) => j !== i);
          const ratio = qmul(nu, qinv(va));
          outs.push(N.frac(N.q(ratio), others.length === 1 ? others[0] : N.add(...others)));
          outs.push(N.frac(N.q(ratio), N.add(N.num(1n), ...others)));
          // the numerator divides that term: k/(m k +- r) -> 1/(m +- r)
          outs.push(N.frac(N.num(1n), N.add(N.q(qinv(ratio)), ...others)));
        }
      });
    }
    return outs;
  },
  'freshmans-dream-square': (t) => rewrites(t, (n) => {
    if (n.t !== 'pow') return [];
    const e = constQ(n.exp); const b = un(n.base);
    if (!e || e.d !== 1n || e.n !== 2n || b.t !== 'add') return [];
    return [N.add(...b.args.map((a) => N.pow(a, N.num(2n)))), N.add(...b.args.map((a) => (un(a).t === 'neg' ? N.neg(N.pow(un(a).arg, N.num(2n))) : N.pow(a, N.num(2n)))))];
  }),
  'partial-distribution': (t) => rewrites(t, (n) => {
    if (n.t !== 'mul' || n.args.length !== 2) return [];
    const [a, b] = n.args.map(un);
    const res = [];
    if (b.t === 'add') res.push(N.add(N.mul(a, b.args[0]), ...b.args.slice(1)));
    if (a.t === 'add') res.push(N.add(N.mul(a.args[0], b), ...a.args.slice(1)));
    return res;
  }),
};

/** Does mal-rule id, applied to `from`, give something worth `to` at every env? undefined if not modelled. */
export function malReproduces(id, from, to, es) {
  const f = MAL[id];
  if (!f) return undefined;
  for (const out of f(from)) {
    let ok = true; let any = false;
    for (const e of es) {
      let a; let b;
      try { a = tryEv(out, e); b = tryEv(to, e); } catch { ok = false; break; }
      if (a === undefined || b === undefined) continue;
      any = true;
      if (!F.eq(a, b)) { ok = false; break; }
    }
    if (ok && any) return true;
  }
  return false;
}
