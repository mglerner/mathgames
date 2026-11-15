// Shared by the adversarial render tests: random ASTs, a vnode reader that
// uses only visible glyphs and 2-D layout classes, a textbook-precedence
// evaluator of what it read, and a float evaluator of the AST.
import { renderMath } from '../../../src/render/mathdom.js';

// ------------------------------------------------------------ RNG + generator
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export const VARS = ['x', 'y', 'a', 'b'];
export function gen(R, depth) {
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  const num = () => {
    const k = R();
    if (k < 0.45) return { t: 'num', q: { n: BigInt(int(0, 12)), d: 1n } };
    if (k < 0.7) return { t: 'num', q: { n: BigInt(-int(1, 9)), d: 1n } };
    const d = int(2, 7); let n = int(1, 9); if (R() < 0.4) n = -n;
    const g = gcd(Math.abs(n), d);
    return { t: 'num', q: { n: BigInt(n / g), d: BigInt(d / g) } };
  };
  if (depth <= 0 || R() < 0.22) return R() < 0.5 ? num() : { t: 'var', name: pick(VARS) };
  const k = R();
  const sub = () => gen(R, depth - 1);
  if (k < 0.15) return { t: 'add', args: Array.from({ length: pick([0, 1, 2, 2, 3]) }, sub) };
  if (k < 0.32) return { t: 'mul', args: Array.from({ length: pick([0, 1, 2, 2, 2, 3]) }, sub) };
  if (k < 0.44) return { t: 'neg', arg: sub() };
  if (k < 0.58) return { t: 'frac', num: sub(), den: sub() };
  if (k < 0.72) {
    const e = R() < 0.6 ? num() : sub();
    return { t: 'pow', base: sub(), exp: e };
  }
  if (k < 0.82) return { t: 'root', index: R() < 0.85 ? 2 : 3, radicand: sub() };
  return { t: 'group', arg: sub() };
}
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a || 1; }

// ------------------------------------------------------------ AST evaluator
export function evalAst(n, env) {
  switch (n.t) {
    case 'num': return Number(n.q.n) / Number(n.q.d);
    case 'var': return env[n.name];
    case 'add': return n.args.reduce((s, a) => s + evalAst(a, env), 0);
    case 'mul': return n.args.reduce((s, a) => s * evalAst(a, env), 1);
    case 'neg': return -evalAst(n.arg, env);
    case 'frac': return evalAst(n.num, env) / evalAst(n.den, env);
    case 'pow': return Math.pow(evalAst(n.base, env), evalAst(n.exp, env));
    case 'root': return nroot(evalAst(n.radicand, env), n.index);
    case 'group': return evalAst(n.arg, env);
  }
  throw new Error('bad node ' + n.t);
}
export function nroot(v, k) { return k === 2 ? Math.sqrt(v) : k % 2 && v < 0 ? -Math.pow(-v, 1 / k) : Math.pow(v, 1 / k); }

// ------------------------------------------------------------ vnode reader
// Emits a token list. Layout classes are trusted as 2-D grouping a human sees:
// a stacked fraction is one unit, a superscript attaches to what is just left
// of it, a radical covers its radicand. Everything else is visible glyphs.
const cls = (v) => (v.attrs && v.attrs.class ? v.attrs.class.split(/\s+/) : []);
export function readTokens(v) {
  const out = [];
  const go = (n) => {
    if (typeof n === 'string') {
      for (const c of n) {
        if (c === ' ') continue;
        if (c >= '0' && c <= '9') {
          const last = out[out.length - 1];
          if (last && last.k === 'num' && last.open) last.v += c; else out.push({ k: 'num', v: c, open: true });
          continue;
        }
        if (out.length && out[out.length - 1].k === 'num') out[out.length - 1].open = false;
        if (/[A-Za-z]/.test(c)) out.push({ k: 'var', v: c });
        else if (c === '−' || c === '-') out.push({ k: '-' });
        else if (c === '+') out.push({ k: '+' });
        else if (c === '·') out.push({ k: '*' });
        else if (c === '(' || c === ')') out.push({ k: c });
        else if (c === '=') out.push({ k: '=' });
        else throw new Error('reader: unexpected glyph ' + JSON.stringify(c));
      }
      return;
    }
    const closeNum = () => { if (out.length && out[out.length - 1].k === 'num') out[out.length - 1].open = false; };
    const c = cls(n);
    if (n.tag === 'svg') return;
    if (c.includes('frac')) {
      const [fn, fd] = n.children;
      closeNum();
      out.push({ k: 'box', kind: 'frac', num: readTokens(fn), den: readTokens(fd) });
      return;
    }
    if (c.includes('msup')) {
      closeNum();
      out.push({ k: 'sup', body: readTokens({ tag: 'span', attrs: {}, children: n.children }) });
      return;
    }
    if (c.includes('mroot')) {
      closeNum();
      let index = 2; const kids = [];
      for (const k of n.children) {
        if (typeof k !== 'string' && cls(k).includes('rindex')) index = Number(k.children.join(''));
        else if (typeof k !== 'string' && cls(k).includes('radicand')) kids.push(k);
      }
      out.push({ k: 'box', kind: 'root', index, body: readTokens(kids[0]) });
      return;
    }
    for (const k of n.children) go(k);
  };
  go(v);
  for (const t of out) if (t.k === 'num') delete t.open;
  return out;
}

// Textbook precedence parser over reader tokens, evaluating directly.
//   expr := term (('+'|'-') term)*
//   term := '-' term | factor ('*'? factor)*     (juxtaposition = product)
//   factor := atom sup*                          (sup binds to the atom)
// Unary minus covers the whole term (-3^2 = -9, -2x = -(2x)).
export function evalTokens(toks, env) {
  let p = 0;
  const peek = () => toks[p];
  const expr = () => {
    let v = term();
    while (peek() && (peek().k === '+' || peek().k === '-')) {
      const op = toks[p++].k; const r = term(); v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const startsFactor = (t) => t && (t.k === 'num' || t.k === 'var' || t.k === '(' || t.k === 'box');
  const term = () => {
    if (peek() && peek().k === '-') { p++; return -term(); }
    let v = factor();
    for (;;) {
      if (peek() && peek().k === '*') { p++; v *= factor(); continue; }
      if (startsFactor(peek())) {
        if (peek().k === 'num' && toks[p - 1] && toks[p - 1].k === 'num') throw new Error('reader: two numbers adjacent');
        const prev = toks[p - 1]; const nx = peek();
        if (prev && prev.k === 'num' && nx.k === 'box' && nx.kind === 'frac' && nx.num[0] && (nx.num[0].k === 'num' || nx.num[0].k === '-')) {
          throw new Error('reader: integer then numeric stacked fraction reads as a mixed number');
        }
        if (nx.k === 'num' && prev && (prev.k === 'box' || prev.k === 'sup')) throw new Error('reader: digit right after a fraction, radical or exponent');
        v *= factor(); continue;
      }
      break;
    }
    return v;
  };
  const factor = () => {
    let v = atom();
    while (peek() && peek().k === 'sup') { const e = evalTokens(toks[p++].body, env); v = Math.pow(v, e); }
    return v;
  };
  const atom = () => {
    const t = toks[p++];
    if (!t) throw new Error('reader: unexpected end');
    if (t.k === 'num') return Number(t.v);
    if (t.k === 'var') return env[t.v];
    if (t.k === 'box') return t.kind === 'frac' ? evalTokens(t.num, env) / evalTokens(t.den, env) : nroot(evalTokens(t.body, env), t.index);
    if (t.k === '(') { const v = expr(); if (!peek() || peek().k !== ')') throw new Error('reader: missing )'); p++; return v; }
    throw new Error('reader: unexpected token ' + t.k);
  };
  const v = expr();
  if (p !== toks.length) throw new Error('reader: trailing tokens at ' + p + ' ' + JSON.stringify(toks[p]));
  return v;
}

export const ENVS = [
  { x: 1.37, y: 0.61, a: 2.23, b: 1.91 },
  { x: 0.43, y: 1.77, a: 1.13, b: 2.71 },
  { x: 2.9, y: 1.21, a: 0.37, b: 1.53 },
];
export function close(u, v) {
  if (Number.isNaN(u) && Number.isNaN(v)) return true;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return u === v || (Math.abs(u) > 1e12 && Math.abs(v) > 1e12);
  if (Math.abs(u) > 1e12 || Math.abs(v) > 1e12) return true; // out of float's useful range
  return Math.abs(u - v) <= 1e-7 * Math.max(1, Math.abs(u), Math.abs(v));
}

export function checkNode(node, preview) {
  const v = renderMath(node, { preview });
  const toks = readTokens(v);
  for (const env of ENVS) {
    const want = evalAst(node, env);
    const got = evalTokens(toks, env);
    if (!close(want, got)) return { want, got };
  }
  return null;
}

