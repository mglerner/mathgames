// @ts-check
// Move graph (DESIGN.md section 3 I1 "Chip alphabet and distance", section 11
// BFS tests): canonical states, breadth-first search to the solved form, and
// the per-chip progress / legal-idle verdicts that come from that search.
//
// Conventions:
//   - A state is an Equation in canonical form (canonicalize). bfs
//     canonicalizes `start`; alphabet(state) and isGoal(state) only ever see
//     canonical states; a step is canonicalize(applyMove(m, state)).
//   - Only LEGAL moves (classify.js, under the declared assumptions) are
//     edges. A risky or illegal chip is never on a path.
//   - distance counts moves; the start itself satisfying isGoal is 0.
//   - bfs gives up (undefined) beyond maxDepth (default 6) or once more than
//     nodeCap (default 20000) distinct states have been generated. search()
//     says which of the two happened, so a caller can reject a seed whose
//     search was capped instead of trusting an incomplete answer.
//   - bfs takes the assumptions as an optional 6th argument (an extension of
//     the section 11 signature, which has no way to pass them; without them
//     no symbol is declared nonzero and literal-equation divisions are never
//     edges).
//
// Canonical form of a side (display and dedupe key; never a correctness check
// on its own):
//   - a polynomial: its expanded form in descending order (polyToNode);
//   - a rational function: numerator over denominator, both expanded, the
//     denominator made monic; a monomial denominator whose variables are ALL
//     declared nonzero is divided out when it divides every term (lw / l -> w).
//     A denominator with an undeclared variable is never cancelled, so the
//     canonical line has the same solution set as the raw one;
//   - anything else (radicals): the side with display parentheses removed.

import { stripGroups } from '../math/ast.js';
import { toPoly, toRat, polyToNode, polyTerms, pscale, pConstValue, leadTerm } from '../math/poly.js';
import { q, div, ONE } from '../math/rational.js';
import { print } from '../math/print.js';
import { applyMove } from './apply.js';
import { classify } from './classify.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Move} Move */
/** @typedef {import('../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../math/poly.js').Poly} Poly */

export const DEFAULT_MAX_DEPTH = 6;
export const DEFAULT_NODE_CAP = 20000;

/** @param {Assumption[]} as @returns {Set<string>} */
function declaredNonzero(as) {
  return new Set((as ?? []).filter((a) => a.rel === 'nonzero' || a.rel === 'pos').map((a) => a.name));
}

/**
 * num / den with den a single monomial term whose variables are all in nz:
 * the quotient polynomial if den divides every term of num, else undefined.
 * @param {Poly} num @param {Poly} den @param {Set<string>} nz
 * @returns {Poly | undefined}
 */
function divideByMonomial(num, den, nz) {
  if (den.terms.size !== 1) return undefined;
  const [d] = polyTerms(den);
  if (!d.mono.every(([name]) => nz.has(name))) return undefined;
  /** @type {Node[]} */
  const parts = [];
  for (const t of polyTerms(num)) {
    /** @type {Node[]} */
    const factors = [{ t: 'num', q: div(t.coef, d.coef) }];
    const exps = new Map(t.mono);
    for (const [name, e] of d.mono) {
      const have = exps.get(name) ?? 0;
      if (have < e) return undefined;
      exps.set(name, have - e);
    }
    for (const [name, e] of exps) {
      if (e > 0) factors.push({ t: 'pow', base: { t: 'var', name }, exp: { t: 'num', q: q(e) } });
    }
    parts.push({ t: 'mul', args: factors });
  }
  return toPoly(parts.length === 0 ? { t: 'num', q: q(0) } : { t: 'add', args: parts });
}

/**
 * @param {Node} n @param {Set<string>} nz
 * @returns {Node}
 */
function canonSide(n, nz) {
  const p = toPoly(n);
  if (p) return polyToNode(p);
  const r = toRat(n);
  if (r) {
    const c = pConstValue(r.den);
    if (c !== undefined) return polyToNode(pscale(r.num, div(ONE, c)));
    const quo = divideByMonomial(r.num, r.den, nz);
    if (quo) return polyToNode(quo);
    const lt = /** @type {{ coef: import('../../types.d.ts').Q }} */ (leadTerm(r.den));
    const k = div(ONE, lt.coef);
    return { t: 'frac', num: polyToNode(pscale(r.num, k)), den: polyToNode(pscale(r.den, k)) };
  }
  return stripGroups(n);
}

/**
 * Canonical form of a line (see the header).
 * @param {Equation} e
 * @param {Assumption[]} [as]
 * @returns {Equation}
 */
export function canonicalize(e, as = []) {
  const nz = declaredNonzero(as);
  return { t: 'eq', lhs: canonSide(e.lhs, nz), rhs: canonSide(e.rhs, nz) };
}

/** Dedupe key of a canonical state. @param {Equation} e @returns {string} */
export function stateKey(e) { return print(e); }

/**
 * One step: the canonical line after a move.
 * @param {Move} m @param {Equation} state @param {Assumption[]} [as]
 * @returns {Equation}
 */
export function step(m, state, as = []) { return canonicalize(applyMove(m, state), as); }

/**
 * @typedef {{ found: { distance: number; minPath: Move[] } | undefined;
 *   capped: boolean; nodes: number }} SearchResult
 *   capped: the node cap stopped the search before it was complete; a
 *   `found` path is still a real path but `undefined` then proves nothing.
 */

/**
 * Breadth-first search, with the reason when nothing is found.
 * @param {Equation} start
 * @param {(state: Equation) => Move[]} alphabet
 * @param {(state: Equation) => boolean} isGoal
 * @param {{ maxDepth?: number; nodeCap?: number; as?: Assumption[] }} [opts]
 * @returns {SearchResult}
 */
export function search(start, alphabet, isGoal, opts = {}) {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const nodeCap = opts.nodeCap ?? DEFAULT_NODE_CAP;
  const as = opts.as ?? [];
  const s0 = canonicalize(start, as);
  if (isGoal(s0)) return { found: { distance: 0, minPath: [] }, capped: false, nodes: 1 };
  /** @type {Map<string, { prev: string | undefined; move: Move | undefined }>} */
  const seen = new Map([[stateKey(s0), { prev: undefined, move: undefined }]]);
  /** @type {Equation[]} */
  let frontier = [s0];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    /** @type {Equation[]} */
    const next = [];
    for (const state of frontier) {
      const key = stateKey(state);
      for (const m of alphabet(state)) {
        if (classify(m, state, as) !== 'legal') continue;
        const s1 = step(m, state, as);
        const k1 = stateKey(s1);
        if (seen.has(k1)) continue;
        seen.set(k1, { prev: key, move: m });
        if (isGoal(s1)) return { found: { distance: depth, minPath: pathTo(seen, k1) }, capped: false, nodes: seen.size };
        if (seen.size > nodeCap) return { found: undefined, capped: true, nodes: seen.size };
        next.push(s1);
      }
    }
    frontier = next;
  }
  return { found: undefined, capped: false, nodes: seen.size };
}

/**
 * @param {Map<string, { prev: string | undefined; move: Move | undefined }>} seen
 * @param {string} key
 * @returns {Move[]}
 */
function pathTo(seen, key) {
  /** @type {Move[]} */
  const path = [];
  for (let k = /** @type {string | undefined} */ (key); k !== undefined;) {
    const rec = /** @type {{ prev: string | undefined; move: Move | undefined }} */ (seen.get(k));
    if (rec.move) path.push(rec.move);
    k = rec.prev;
  }
  return path.reverse();
}

/**
 * Section 11 moves API. undefined: no path within maxDepth, or the node cap
 * was hit (use search() to tell which).
 * @param {Equation} start
 * @param {(state: Equation) => Move[]} alphabet
 * @param {(state: Equation) => boolean} isGoal
 * @param {number} [maxDepth]
 * @param {number} [nodeCap]
 * @param {Assumption[]} [as]
 * @returns {{ distance: number; minPath: Move[] } | undefined}
 */
export function bfs(start, alphabet, isGoal, maxDepth = DEFAULT_MAX_DEPTH, nodeCap = DEFAULT_NODE_CAP, as = []) {
  return search(start, alphabet, isGoal, { maxDepth, nodeCap, as }).found;
}

/**
 * @typedef {{ move: Move; verdict: 'progress' | 'legal-idle' | 'risky' | 'illegal'; distance?: number; next?: Equation }} ChipInfo
 *   distance: moves from the line AFTER this chip to the solved form, for
 *   progress chips only (a legal-idle chip's distance is not searched: it is
 *   known to be no smaller than the current one, and that is all I1 shows).
 *   next: the canonical line after a legal chip.
 */

/**
 * The I1 verdict and distance of each chip on a state: risky / illegal from
 * classify(); a legal chip is 'progress' when the distance after it is
 * smaller than the distance now, otherwise 'legal-idle' ("Legal. Not
 * closer."). undefined if the state itself has no path within maxDepth, or
 * any search was capped: the generator must reject that seed rather than
 * show a verdict computed from an incomplete search.
 * @param {Equation} state
 * @param {Move[]} chips
 * @param {(state: Equation) => Move[]} alphabet
 * @param {(state: Equation) => boolean} isGoal
 * @param {{ maxDepth?: number; nodeCap?: number; as?: Assumption[] }} [opts]
 * @returns {{ distance: number; minPath: Move[]; chips: ChipInfo[] } | undefined}
 */
export function chipVerdicts(state, chips, alphabet, isGoal, opts = {}) {
  const as = opts.as ?? [];
  const s0 = canonicalize(state, as);
  const here = search(s0, alphabet, isGoal, opts);
  if (!here.found || here.capped) return undefined;
  /** @type {ChipInfo[]} */
  const out = [];
  for (const move of chips) {
    const v = classify(move, s0, as);
    if (v !== 'legal') { out.push({ move, verdict: v }); continue; }
    const next = step(move, s0, as);
    // Progress means a path from `next` shorter than the one from here, so a
    // search to depth (distance - 1) decides it completely and stays cheap.
    // On a solved state (distance 0) nothing is shorter: every legal chip is
    // idle. (search() answers 0 for a goal start whatever maxDepth is, so the
    // strict comparison is checked, not assumed.)
    if (here.found.distance === 0) { out.push({ move, verdict: 'legal-idle', next }); continue; }
    const there = search(next, alphabet, isGoal, { ...opts, maxDepth: here.found.distance - 1 });
    if (there.capped) return undefined;
    if (there.found && there.found.distance < here.found.distance) out.push({ move, verdict: 'progress', distance: there.found.distance, next });
    else out.push({ move, verdict: 'legal-idle', next });
  }
  return { distance: here.found.distance, minPath: here.found.minPath, chips: out };
}

