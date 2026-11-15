// @ts-check
// AST shape follows DESIGN.md section 11 `Node`/`Equation`, plus an `explicit` flag on mul
// (true = a printed times sign, as in the prompt "4 x 1/3"; false = juxtaposition, as in "2x").
import { q } from './rational.js';

/** @typedef {import('./rational.js').Q} Q */
/**
 * @typedef {{ t: 'num', q: Q }
 *   | { t: 'var', name: string }
 *   | { t: 'add', args: Node[] }
 *   | { t: 'mul', args: Node[], explicit?: boolean }
 *   | { t: 'neg', arg: Node }
 *   | { t: 'frac', num: Node, den: Node }
 *   | { t: 'pow', base: Node, exp: Node }
 *   | { t: 'root', index: number, radicand: Node }
 *   | { t: 'group', arg: Node }} Node
 */
/** @typedef {{ t: 'eq', lhs: Node, rhs: Node }} Equation */

/** @param {bigint | number} n @param {bigint | number} [d] @returns {Node} */
export const num = (n, d = 1n) => ({ t: 'num', q: q(n, d) });
/** @param {string} name @returns {Node} */
export const v = (name) => ({ t: 'var', name });
/** @param {Node[]} args @returns {Node} */
export const add = (...args) => ({ t: 'add', args });
/** juxtaposition @param {Node[]} args @returns {Node} */
export const mul = (...args) => ({ t: 'mul', args });
/** printed times sign @param {Node[]} args @returns {Node} */
export const times = (...args) => ({ t: 'mul', args, explicit: true });
/** @param {Node} arg @returns {Node} */
export const neg = (arg) => ({ t: 'neg', arg });
/** @param {Node} n @param {Node} d @returns {Node} */
export const frac = (n, d) => ({ t: 'frac', num: n, den: d });
/** @param {Node} base @param {Node} exp @returns {Node} */
export const pow = (base, exp) => ({ t: 'pow', base, exp });
/** @param {Node} radicand @returns {Node} */
export const root = (radicand) => ({ t: 'root', index: 2, radicand });
/** @param {Node} arg @returns {Node} */
export const group = (arg) => ({ t: 'group', arg });
/** @param {Node} lhs @param {Node} rhs @returns {Equation} */
export const eq = (lhs, rhs) => ({ t: 'eq', lhs, rhs });

/** @param {Node} n @returns {Node} */
export function stripGroups(n) {
  while (n.t === 'group') n = n.arg;
  return n;
}

/**
 * Structural equality (groups count; explicit flag ignored).
 * @param {Node | Equation} a @param {Node | Equation} b
 * @returns {boolean}
 */
export function astEq(a, b) {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case 'eq': {
      const bb = /** @type {Equation} */ (b);
      return astEq(a.lhs, bb.lhs) && astEq(a.rhs, bb.rhs);
    }
    case 'num': {
      const bb = /** @type {{t:'num', q: Q}} */ (b);
      return a.q.n === bb.q.n && a.q.d === bb.q.d;
    }
    case 'var':
      return a.name === /** @type {{t:'var', name: string}} */ (b).name;
    case 'add':
    case 'mul': {
      const bb = /** @type {{args: Node[]}} */ (b);
      return a.args.length === bb.args.length && a.args.every((x, i) => astEq(x, bb.args[i]));
    }
    case 'neg':
    case 'group':
      return astEq(a.arg, /** @type {{arg: Node}} */ (b).arg);
    case 'frac': {
      const bb = /** @type {{num: Node, den: Node}} */ (b);
      return astEq(a.num, bb.num) && astEq(a.den, bb.den);
    }
    case 'pow': {
      const bb = /** @type {{base: Node, exp: Node}} */ (b);
      return astEq(a.base, bb.base) && astEq(a.exp, bb.exp);
    }
    case 'root':
      return astEq(a.radicand, /** @type {{radicand: Node}} */ (b).radicand);
  }
  return false;
}
