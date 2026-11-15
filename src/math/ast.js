// @ts-check
// AST constructors and structural helpers for the frozen Node / Equation types.
// Nothing here simplifies: these build exactly the tree you ask for.

import { q, qeq } from './rational.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */

/**
 * Number literal. num(3), num(3, 4), num(-2). (A Q goes through numQ.)
 * @param {bigint | number} n @param {bigint | number} [d]
 * @returns {Node}
 */
export function num(n, d = 1n) { return { t: 'num', q: q(n, d) }; }
/** @param {Q} qq @returns {Node} */
export function numQ(qq) { return { t: 'num', q: qq }; }
/** Variable. Single ASCII letters round-trip through print/parse. @param {string} name @returns {Node} */
export function v(name) { return { t: 'var', name }; }
/** @param {...Node} args @returns {Node} */
export function add(...args) { return { t: 'add', args }; }
/** @param {...Node} args @returns {Node} */
export function mul(...args) { return { t: 'mul', args }; }
/** @param {Node} arg @returns {Node} */
export function neg(arg) { return { t: 'neg', arg }; }
/** a - b as add(a, neg(b)). @param {Node} a @param {Node} b @returns {Node} */
export function sub(a, b) { return { t: 'add', args: [a, { t: 'neg', arg: b }] }; }
/** @param {Node} n @param {Node} d @returns {Node} */
export function frac(n, d) { return { t: 'frac', num: n, den: d }; }
/** @param {Node} base @param {Node} exp @returns {Node} */
export function pow(base, exp) { return { t: 'pow', base, exp }; }
/** Square root. @param {Node} radicand @returns {Node} */
export function sqrt(radicand) { return { t: 'root', index: 2, radicand }; }
/** @param {number} index @param {Node} radicand @returns {Node} */
export function root(index, radicand) { return { t: 'root', index, radicand }; }
/** @param {Node} arg @returns {Node} */
export function group(arg) { return { t: 'group', arg }; }
/** @param {Node} lhs @param {Node} rhs @returns {Equation} */
export function eq(lhs, rhs) { return { t: 'eq', lhs, rhs }; }

/** @param {unknown} x @returns {x is Equation} */
export function isEquation(x) {
  return typeof x === 'object' && x !== null && /** @type {{t?: unknown}} */ (x).t === 'eq';
}

/**
 * Direct children of a node, in order.
 * @param {Node} n
 * @returns {Node[]}
 */
export function children(n) {
  switch (n.t) {
    case 'num': case 'var': return [];
    case 'add': case 'mul': return n.args;
    case 'neg': case 'group': return [n.arg];
    case 'frac': return [n.num, n.den];
    case 'pow': return [n.base, n.exp];
    case 'root': return [n.radicand];
  }
}

/**
 * Remove every group node (display parentheses). Accepts a Node or an Equation.
 * @template {Node | Equation} T
 * @param {T} x
 * @returns {T}
 */
export function stripGroups(x) {
  if (x.t === 'eq') return /** @type {T} */ ({ t: 'eq', lhs: stripGroups(x.lhs), rhs: stripGroups(x.rhs) });
  /** @param {Node} n @returns {Node} */
  const go = (n) => {
    switch (n.t) {
      case 'num': case 'var': return n;
      case 'add': return { t: 'add', args: n.args.map(go) };
      case 'mul': return { t: 'mul', args: n.args.map(go) };
      case 'neg': return { t: 'neg', arg: go(n.arg) };
      case 'frac': return { t: 'frac', num: go(n.num), den: go(n.den) };
      case 'pow': return { t: 'pow', base: go(n.base), exp: go(n.exp) };
      case 'root': return { t: 'root', index: n.index, radicand: go(n.radicand) };
      case 'group': return go(n.arg);
    }
  };
  return /** @type {T} */ (go(/** @type {Node} */ (x)));
}

/**
 * Structural (tree) equality. Not mathematical equivalence: x + 1 and 1 + x differ.
 * @param {Node | Equation} a
 * @param {Node | Equation} b
 * @returns {boolean}
 */
export function same(a, b) {
  if (a.t !== b.t) return false;
  if (a.t === 'eq') {
    const bb = /** @type {Equation} */ (b);
    return same(a.lhs, bb.lhs) && same(a.rhs, bb.rhs);
  }
  if (a.t === 'num') return qeq(a.q, /** @type {{q: Q}} */ (b).q);
  if (a.t === 'var') return a.name === /** @type {{name: string}} */ (b).name;
  if (a.t === 'root' && a.index !== /** @type {{index: number}} */ (b).index) return false;
  const ca = children(a);
  const cb = children(/** @type {Node} */ (b));
  if (ca.length !== cb.length) return false;
  for (let i = 0; i < ca.length; i++) if (!same(ca[i], cb[i])) return false;
  return true;
}

/**
 * Sorted list of the distinct variable names in a Node or Equation.
 * @param {Node | Equation} x
 * @returns {string[]}
 */
export function vars(x) {
  /** @type {Set<string>} */
  const out = new Set();
  /** @param {Node} n */
  const go = (n) => {
    if (n.t === 'var') out.add(n.name);
    else for (const c of children(n)) go(c);
  };
  if (x.t === 'eq') { go(x.lhs); go(x.rhs); } else go(x);
  return [...out].sort();
}

/**
 * True if any node in the tree satisfies pred.
 * @param {Node} n
 * @param {(n: Node) => boolean} pred
 * @returns {boolean}
 */
export function some(n, pred) {
  if (pred(n)) return true;
  for (const c of children(n)) if (some(c, pred)) return true;
  return false;
}
