// @ts-check
// ASCII printer. print() is the inverse of parse() up to display parentheses:
// for any tree, parse(print(n)) has the same value as n, and
// print(parse(print(n))) === print(n). For trees in the parser's own shape
// (see parse.js) the round trip gives back the same tree once group nodes are
// stripped from both. Output uses only what the keypad can type: digits,
// letters, + - / ^ ( ) = and "sqrt"; multiplication is always implicit.
//
// Not a renderer: render/mathdom.js draws math. This is for logs, tests,
// notes and the keypad round trip.

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */

const ADD = 1;
const NEG = 2;
const MUL = 3;
const POW = 4;
const ATOM = 5;

/** @typedef {{ s: string; prec: number }} Out */

/** @param {Node} n @param {number} min @returns {string} */
function wrap(n, min) {
  const r = p(n);
  return r.prec >= min ? r.s : `(${r.s})`;
}

/**
 * Would writing `right` directly after `left` spell the keyword "sqrt" across
 * the seam (as in the product s x q x r x t)?
 * @param {string} left @param {string} right
 */
function seamSpellsSqrt(left, right) {
  const joined = left.slice(-3) + right.slice(0, 3);
  const cut = Math.min(3, left.length);
  for (let i = joined.indexOf('sqrt'); i !== -1; i = joined.indexOf('sqrt', i + 1)) {
    if (i < cut && i + 4 > cut) return true;
  }
  return false;
}

/** @param {Node} n @returns {Out} */
function p(n) {
  switch (n.t) {
    case 'num': {
      const { n: nn, d } = n.q;
      if (d === 1n) return nn < 0n ? { s: `${nn}`, prec: NEG } : { s: `${nn}`, prec: ATOM };
      return { s: `${nn}/${d}`, prec: nn < 0n ? NEG : MUL };
    }
    case 'var': return { s: n.name, prec: ATOM };
    case 'group': return { s: `(${p(n.arg).s})`, prec: ATOM };
    case 'root': {
      const inner = p(n.radicand).s;
      return { s: n.index === 2 ? `sqrt(${inner})` : `root${n.index}(${inner})`, prec: ATOM };
    }
    case 'neg': return { s: `-${wrap(n.arg, MUL)}`, prec: NEG };
    case 'add': {
      if (n.args.length === 0) return { s: '0', prec: ATOM };
      if (n.args.length === 1) return p(n.args[0]);
      let s = wrap(n.args[0], NEG);
      for (let i = 1; i < n.args.length; i++) {
        const a = n.args[i];
        if (a.t === 'neg') {
          s += ` - ${wrap(a.arg, MUL)}`;
        } else if (a.t === 'num' && a.q.n < 0n) {
          s += ` - ${p({ t: 'num', q: { n: -a.q.n, d: a.q.d } }).s}`;
        } else if (a.t === 'mul' && a.args.length >= 2 && a.args[0].t === 'num' && a.args[0].q.n < 0n && a.args[0].q.d === 1n) {
          const first = /** @type {Node} */ ({ t: 'num', q: { n: -a.args[0].q.n, d: 1n } });
          s += ` - ${p({ t: 'mul', args: [first, ...a.args.slice(1)] }).s}`;
        } else {
          s += ` + ${wrap(a, MUL)}`;
        }
      }
      return { s, prec: ADD };
    }
    case 'mul': {
      if (n.args.length === 0) return { s: '1', prec: ATOM };
      if (n.args.length === 1) return p(n.args[0]);
      const f0 = n.args[0];
      const leadingMinus = f0.t === 'num' && f0.q.n < 0n && f0.q.d === 1n;
      let s = leadingMinus ? p(f0).s : wrap(f0, POW);
      for (let i = 1; i < n.args.length; i++) {
        let piece = wrap(n.args[i], POW);
        if (/^[0-9]/.test(piece) || seamSpellsSqrt(s, piece)) piece = `(${piece})`;
        s += piece;
      }
      return { s, prec: leadingMinus ? NEG : MUL };
    }
    case 'frac': return { s: `${wrap(n.num, MUL)}/${wrap(n.den, POW)}`, prec: MUL };
    case 'pow': {
      const e = p(n.exp);
      return { s: `${wrap(n.base, ATOM)}^${e.prec === ATOM ? e.s : `(${e.s})`}`, prec: POW };
    }
  }
}

/**
 * @param {Node | Equation} x
 * @returns {string}
 */
export function print(x) {
  if (x.t === 'eq') return `${p(x.lhs).s} = ${p(x.rhs).s}`;
  return p(x).s;
}
