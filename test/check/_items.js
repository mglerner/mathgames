// @ts-check
// Random items with KNOWN answers for the judge property tests. Every key is
// built forward from integers chosen first (roots, coefficients), with plain
// BigInt arithmetic and string templates: nothing here calls the judge, the
// equivalence engine or print(), so the keys are an independent path.
// Typed variants are produced as keypad text.

import { parse } from '../../src/math/parse.js';
import { q } from '../../src/math/rational.js';

/** @typedef {import('../../types.d.ts').Rng} Rng */
/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').AnswerSpec} AnswerSpec */
/** @typedef {import('../../types.d.ts').Surd} Surd */

/** @param {string} s */
export function P(s) {
  const r = parse(s);
  if ('error' in r) throw new Error(`test item did not parse: ${s}: ${r.error}`);
  return r;
}

/** @param {bigint} a @param {bigint} b @returns {bigint} */
export function gcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a;
}

/** @param {Rng} rng @param {number} lo @param {number} hi @returns {bigint} nonzero */
export function nz(rng, lo, hi) {
  for (;;) { const x = rng.int(lo, hi); if (x !== 0) return BigInt(x); }
}

/**
 * Polynomial text in x from coefficients [c0, c1, c2, ...], descending or
 * ascending, with an optional "*" between coefficient and power.
 * @param {bigint[]} cs @param {{ ascending?: boolean; star?: boolean }} [o]
 * @returns {string}
 */
export function polyText(cs, o = {}) {
  /** @type {string[]} */
  const parts = [];
  const order = cs.map((c, i) => i);
  if (!o.ascending) order.reverse();
  for (const i of order) {
    const c = cs[i];
    if (c === 0n) continue;
    const mag = c < 0n ? -c : c;
    const pw = i === 0 ? '' : i === 1 ? 'x' : `x^${i}`;
    let body;
    if (i === 0) body = `${mag}`;
    else if (mag === 1n) body = pw;
    else body = o.star ? `${mag}*${pw}` : `${mag}${pw}`;
    if (parts.length === 0) parts.push(c < 0n ? `-${body}` : body);
    else parts.push(c < 0n ? ` - ${body}` : ` + ${body}`);
  }
  return parts.length === 0 ? '0' : parts.join('');
}

/** @param {bigint[]} a @param {bigint[]} b */
export function polySub(a, b) {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => (a[i] ?? 0n) - (b[i] ?? 0n));
}

/** @param {bigint[]} a @param {bigint} k */
export function polyScale(a, k) { return a.map((c) => c * k); }

/**
 * Base problem shell.
 * @param {AnswerSpec} answer
 * @param {Partial<Problem>} [over]
 * @returns {Problem}
 */
export function problem(answer, over = {}) {
  return /** @type {Problem} */ ({
    id: 't', gen: 'test', version: 1, seed: 's', skill: 'test', difficulty: 1,
    interaction: 'strike', constructed: true, fadeLevel: 2,
    prompt: { verb: 'Solve', math: P('x') },
    assumptions: [], variableKeys: ['x'], answer, visuals: [], probes: [],
    ...over,
  });
}

/** Unparseable strings, for every kind. Each one fails in parse, parseList and parseSolutions. */
export const GARBAGE_TEMPLATES = ['((', '3 = = 4', '#', '.5', '2..', 'x^', ')(', '3 +', '=', '= 3', '@x', '3 4', '?', '1,,2', '(1, 2', 'sqrt', '2 + * 3', '$'];

/** @param {Rng} rng @returns {string} */
export function garbage(rng) {
  const g = rng.pick(GARBAGE_TEMPLATES);
  // Optionally glue a valid-looking fragment in front; the bad tail still fails.
  return rng.bool() ? g : `${rng.int(1, 9)}x + ${g}`;
}

// ---------------------------------------------------------------- surds for solution sets

/** @param {bigint} n @param {bigint} [d] @returns {Surd} */
export function sQ(n, d = 1n) {
  const g = gcd(n, d) || 1n;
  let nn = n / g; let dd = d / g;
  if (dd < 0n) { nn = -nn; dd = -dd; }
  return nn === 0n ? { terms: [] } : { terms: [{ coef: q(nn, dd), rad: 1n }] };
}

/** p + s q sqrt(r) as a Surd (p, q integers, r squarefree > 1). @param {bigint} p @param {bigint} qq @param {bigint} r */
export function sPQR(p, qq, r) {
  /** @type {Surd['terms']} */
  const terms = [];
  if (p !== 0n) terms.push({ coef: q(p), rad: 1n });
  if (qq !== 0n) terms.push({ coef: q(qq), rad: r });
  return { terms };
}

export const SQUAREFREE = [2n, 3n, 5n, 6n, 7n, 10n, 11n, 13n];
