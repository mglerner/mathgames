// @ts-check
// Test-only helpers. evalAtQ is an INDEPENDENT evaluator (plain rational arithmetic straight
// off the AST, no surd or polynomial modules) used to check answer keys by substitution.
import { q, add, mul, div, neg } from '../js/rational.js';

/** @typedef {import('../js/rational.js').Q} Q */

/**
 * @param {any} n AST node with no radicals
 * @param {Q} x
 * @returns {Q}
 */
export function evalAtQ(n, x) {
  switch (n.t) {
    case 'num':
      return n.q;
    case 'var':
      return x;
    case 'group':
      return evalAtQ(n.arg, x);
    case 'neg':
      return neg(evalAtQ(n.arg, x));
    case 'add':
      return n.args.reduce((/** @type {Q} */ s, /** @type {any} */ a) => add(s, evalAtQ(a, x)), q(0));
    case 'mul':
      return n.args.reduce((/** @type {Q} */ s, /** @type {any} */ a) => mul(s, evalAtQ(a, x)), q(1));
    case 'frac':
      return div(evalAtQ(n.num, x), evalAtQ(n.den, x));
    case 'pow': {
      const e = evalAtQ(n.exp, x);
      if (e.d !== 1n || e.n < 0n) throw new Error('test evaluator: integer powers only');
      let r = q(1);
      for (let i = 0n; i < e.n; i++) r = mul(r, evalAtQ(n.base, x));
      return r;
    }
  }
  throw new Error(`test evaluator: unsupported ${n.t}`);
}

/** Split keypad text into key tokens. @param {string} text */
export function toKeys(text) {
  const toks = text.match(/sqrt|[0-9]|[-+/^()=x]/g) || [];
  if (toks.join('') !== text) throw new Error(`not typeable on the keypad: ${text}`);
  return toks;
}

/** @param {number} n */
export const seeds = (n, prefix = 's') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
