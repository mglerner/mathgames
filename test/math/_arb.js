// @ts-check
// Random builders shared by the src/math property tests. Everything is driven
// by the seeded Rng from src/gen/prng.js, so a failing seed replays exactly.

import { q } from '../../src/math/rational.js';
import { num, numQ, v, add, mul, neg, frac, pow, sqrt, group } from '../../src/math/ast.js';
import { parse } from '../../src/math/parse.js';

/** @typedef {import('../../types.d.ts').Rng} Rng */
/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */

/** Parse or throw: for tables written as text. @param {string} s @returns {any} */
export function P(s) {
  const r = parse(s);
  if ('error' in r) throw new Error(`test table entry does not parse: ${JSON.stringify(s)}: ${r.error}`);
  return r;
}

/** JSON with bigints, for failure messages. @param {unknown} x */
export function show(x) {
  return JSON.stringify(x, (_k, val) => (typeof val === 'bigint' ? `${val}n` : val));
}

/** Random rational with numerator in [-m, m] and denominator in [1, m]. @param {Rng} rng @param {number} [m] @returns {Q} */
export function rq(rng, m = 12) { return q(rng.int(-m, m), rng.int(1, m)); }
/** Random nonzero rational. @param {Rng} rng @param {number} [m] @returns {Q} */
export function rqNonzero(rng, m = 12) {
  for (;;) { const x = rq(rng, m); if (x.n !== 0n) return x; }
}

const RADS = [1n, 1n, 2n, 3n, 5n, 6n, 7n, 10n, 15n, 21n, 30n];
/** Random canonical Surd with up to maxTerms terms. @param {Rng} rng @param {number} [maxTerms] @returns {Surd} */
export function rsurd(rng, maxTerms = 3) {
  /** @type {Map<bigint, Q>} */
  const m = new Map();
  const k = rng.int(0, maxTerms);
  for (let i = 0; i < k; i++) {
    const c = rq(rng, 9);
    if (c.n !== 0n) m.set(rng.pick(RADS), c);
  }
  return { terms: [...m].map(([rad, coef]) => ({ coef, rad })).sort((a, b) => (a.rad < b.rad ? -1 : 1)) };
}

/**
 * Random polynomial tree over the given variables (rational coefficients,
 * division by nonzero constants only, small nonnegative integer powers).
 * @param {Rng} rng @param {string[]} names @param {number} depth
 * @returns {Node}
 */
export function polyAst(rng, names, depth) {
  if (depth <= 0 || rng.bool(0.25)) {
    const r = rng.int(0, 9);
    if (r < 4) return v(rng.pick(names));
    if (r < 8) return num(rng.int(0, 9));
    if (r < 9) return num(rng.int(-9, 9));
    return numQ(rq(rng, 6));
  }
  const d = depth - 1;
  switch (rng.int(0, 7)) {
    case 0: case 1: return add(polyAst(rng, names, d), polyAst(rng, names, d));
    case 2: return add(polyAst(rng, names, d), neg(polyAst(rng, names, d)), polyAst(rng, names, d));
    case 3: case 4: return mul(polyAst(rng, names, d), polyAst(rng, names, d));
    case 5: return neg(polyAst(rng, names, d));
    case 6: return pow(group(polyAst(rng, names, Math.min(d, 1))), num(rng.int(1, 3)));
    default: return frac(polyAst(rng, names, d), num(rng.int(1, 6)));
  }
}

const LETTERS = ['x', 'y', 'a', 'b', 's', 'q', 'r', 't', 'A', 'l'];

/**
 * Random tree using EVERY node kind, in the parser's shape: nonnegative
 * integer literals, single-letter variables, add/mul of two or more, index 2.
 * stripGroups(parse(print(n))) must equal stripGroups(n) for all of these.
 * @param {Rng} rng @param {number} depth
 * @returns {Node}
 */
export function shapeAst(rng, depth) {
  if (depth <= 0 || rng.bool(0.2)) {
    return rng.bool(0.5) ? v(rng.pick(LETTERS)) : num(rng.int(0, 30));
  }
  const d = depth - 1;
  const kids = () => Array.from({ length: rng.int(2, 4) }, () => shapeAst(rng, d));
  switch (rng.int(0, 8)) {
    case 0: case 1: return add(...kids());
    case 2: case 3: return mul(...kids());
    case 4: return neg(shapeAst(rng, d));
    case 5: return frac(shapeAst(rng, d), shapeAst(rng, d));
    case 6: return pow(shapeAst(rng, d), shapeAst(rng, d));
    case 7: return sqrt(shapeAst(rng, d));
    default: return group(shapeAst(rng, d));
  }
}

/**
 * Random tree with NO shape restrictions: negative and fractional literals,
 * empty and one-element sums and products. Only value and print-idempotence
 * are promised for these.
 * @param {Rng} rng @param {number} depth
 * @returns {Node}
 */
export function wildAst(rng, depth) {
  if (depth <= 0 || rng.bool(0.2)) {
    const r = rng.int(0, 3);
    if (r === 0) return v(rng.pick(LETTERS));
    if (r === 1) return num(rng.int(-9, 9));
    if (r === 2) return numQ(rq(rng, 6));
    return num(rng.int(0, 30));
  }
  const d = depth - 1;
  const kids = () => Array.from({ length: rng.int(0, 3) }, () => wildAst(rng, d));
  switch (rng.int(0, 8)) {
    case 0: case 1: return add(...kids());
    case 2: case 3: return mul(...kids());
    case 4: return neg(wildAst(rng, d));
    case 5: return frac(wildAst(rng, d), wildAst(rng, d));
    case 6: return pow(wildAst(rng, d), rng.bool(0.7) ? num(rng.int(-2, 3)) : numQ(q(rng.int(-3, 3), 2)));
    case 7: return sqrt(wildAst(rng, d));
    default: return group(wildAst(rng, d));
  }
}

/** Random env over the given names with small rational values. @param {Rng} rng @param {string[]} names */
export function renv(rng, names) {
  /** @type {Record<string, Q>} */
  const env = {};
  for (const nm of names) env[nm] = rng.bool(0.8) ? q(rng.int(-6, 6)) : rq(rng, 5);
  return env;
}

/** Every variable positive: the declaration the radical generators assume. @type {import('../../types.d.ts').Assumption[]} */
export const POS = [{ name: 'x', rel: 'pos' }, { name: 'y', rel: 'pos' }];

/**
 * A random product of radical factors in x and y (all values positive when x, y > 0).
 * @param {Rng} rng
 * @returns {Node}
 */
export function radTerm(rng) {
  const X = () => v(rng.pick(['x', 'y']));
  const K = () => num(rng.int(1, 12));
  /** @type {(() => Node)[]} */
  const makers = [
    K, X,
    () => sqrt(K()),
    () => sqrt(X()),
    () => sqrt(mul(K(), X())),
    () => sqrt(mul(X(), X())),
    () => pow(X(), numQ(q(rng.int(-3, 5), 2))),
    () => pow(mul(K(), X()), numQ(q(rng.int(1, 3), 2))),
    () => frac(K(), sqrt(mul(K(), X()))),
    () => frac(sqrt(X()), mul(K(), X())),
    () => pow(sqrt(mul(K(), X())), num(rng.int(-2, 3))),
    () => frac(numQ(q(rng.int(1, 5), rng.int(1, 5))), num(rng.int(1, 4))),
  ];
  const k = rng.int(1, 3);
  const factors = Array.from({ length: k }, () => rng.pick(makers)());
  return factors.length === 1 ? factors[0] : mul(...factors);
}

/** @param {Rng} rng @returns {Node} */
export function radSum(rng) {
  const k = rng.int(1, 3);
  const terms = Array.from({ length: k }, () => (rng.bool(0.25) ? { t: /** @type {const} */ ('neg'), arg: radTerm(rng) } : radTerm(rng)));
  return terms.length === 1 ? terms[0] : add(...terms);
}


export { LETTERS };
