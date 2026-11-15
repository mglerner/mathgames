// Independent oracle for the check/ and moves/ adversarial tests.
// Plain BigInt rationals and polynomials (ascending coefficient arrays), a
// seeded PRNG, and keypad-text writers. Nothing here imports src/: every
// truth value these tests compare against is computed here.

// ---------------------------------------------------------------- PRNG

export function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return {
    next,
    int,
    big: (lo, hi) => BigInt(int(lo, hi)),
    nz: (lo, hi) => { for (;;) { const x = int(lo, hi); if (x !== 0) return BigInt(x); } },
    pick: (a) => a[int(0, a.length - 1)],
    bool: () => next() < 0.5,
  };
}

// ---------------------------------------------------------------- rationals

const babs = (a) => (a < 0n ? -a : a);
export function bgcd(a, b) { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; }
export function F(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new Error('F: zero denominator');
  if (d < 0n) { n = -n; d = -d; }
  const g = bgcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
export const fadd = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
export const fsub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
export const fmul = (a, b) => F(a.n * b.n, a.d * b.d);
export const fdiv = (a, b) => F(a.n * b.d, a.d * b.n);
export const feq = (a, b) => a.n === b.n && a.d === b.d;
export const fz = (a) => a.n === 0n;
export const ZERO = F(0n);
export const ONE = F(1n);

/** Fraction as keypad text, parenthesized when it is not a plain integer >= 0. */
export function ftext(a) {
  if (a.d === 1n) return a.n < 0n ? `(${a.n})` : `${a.n}`;
  return `(${a.n}/${a.d})`;
}

// ---------------------------------------------------------------- polynomials in x (ascending)

export function ptrim(p) { const q = p.slice(); while (q.length && fz(q[q.length - 1])) q.pop(); return q; }
export const P = (...ints) => ptrim(ints.map((c) => F(c)));
export function padd(a, b) { const n = Math.max(a.length, b.length); return ptrim(Array.from({ length: n }, (_, i) => fadd(a[i] ?? ZERO, b[i] ?? ZERO))); }
export function pneg(a) { return a.map((c) => F(-c.n, c.d)); }
export const psub = (a, b) => padd(a, pneg(b));
export function pmul(a, b) {
  if (!a.length || !b.length) return [];
  const out = Array.from({ length: a.length + b.length - 1 }, () => ZERO);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] = fadd(out[i + j], fmul(a[i], b[j]));
  return ptrim(out);
}
export const pscale = (a, k) => ptrim(a.map((c) => fmul(c, k)));
export function peq(a, b) { a = ptrim(a); b = ptrim(b); return a.length === b.length && a.every((c, i) => feq(c, b[i])); }
export function peval(p, x) { let acc = ZERO; for (let i = p.length - 1; i >= 0; i--) acc = fadd(fmul(acc, x), p[i]); return acc; }
export const deg = (p) => ptrim(p).length - 1;
/** Is a = k b for a nonzero rational k? (both zero counts) */
export function pIsMultiple(a, b) {
  a = ptrim(a); b = ptrim(b);
  if (!a.length && !b.length) return true;
  if (!a.length || !b.length || a.length !== b.length) return false;
  const k = fdiv(a[a.length - 1], b[b.length - 1]);
  return peq(a, pscale(b, k));
}

/** Polynomial keypad text, descending (default) or ascending; coefficients as ftext. */
export function ptext(p, { ascending = false, star = false, v = 'x' } = {}) {
  p = ptrim(p);
  const idx = p.map((_, i) => i).filter((i) => !fz(p[i]));
  if (!ascending) idx.reverse();
  if (!idx.length) return '0';
  const parts = [];
  for (const i of idx) {
    const c = p[i];
    const neg = c.n < 0n;
    const mag = F(babs(c.n), c.d);
    const pw = i === 0 ? '' : i === 1 ? v : `${v}^${i}`;
    let body;
    if (i === 0) body = mag.d === 1n ? `${mag.n}` : `${mag.n}/${mag.d}`;
    else if (feq(mag, ONE)) body = pw;
    else body = (mag.d === 1n ? `${mag.n}` : `(${mag.n}/${mag.d})`) + (star ? '*' : '') + pw;
    if (!parts.length) parts.push(neg ? `-${body}` : body);
    else parts.push(neg ? ` - ${body}` : ` + ${body}`);
  }
  return parts.join('');
}

// ---------------------------------------------------------------- surds p + q sqrt(r), r squarefree

export const SQUAREFREE = [2n, 3n, 5n, 6n, 7n, 10n, 11n, 13n, 14n, 15n];
