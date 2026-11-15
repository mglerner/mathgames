// @ts-check
// literal-equations (skill 16, DESIGN.md section 4): solve a formula for a
// named variable. v1 restriction (section 3): a division is only by symbols
// the item declares nonzero, and the declaration is printed on the item
// ("l is not 0"); every declared symbol is in problem.assumptions, so the
// judge, the Cast verdicts and the move search all see it. Recipe:
// ../common.js; line helpers from ./balance-moves.core.js.
//
// Documented seed (pinned by test/gen/literal-equations.test.js):
//   EXAMPLE_SEED at d2 strike: P = 2l + 2w, solve for w -> (P - 2l)/2.
//
// Difficulty (section 4 gives none; my reading, reported). Real formulas,
// one target letter each:
//   d1  one move: A = lw for w (l is not 0), d = rt, F = ma, V = Bh, W = Fd,
//       y = kx, y = x + b, y = x - k.
//   d2  two moves: y = mx + b for x (m is not 0), y = kx + b, P = 2l + 2w,
//       I = Prt (two divisions), P = a + b + c.
//   d3  a fraction or a product: A = (1/2)bh for h, V = (1/3)Bh,
//       m = (a + b)/2, P = 2(l + w), y = (x + b)/k.
//   d4  three moves, or a product to undo first: y = m(x - h) for x,
//       A = (1/2)(a + b)h for a, F = (9/5)C + 32 for C, T = (a + b + c)/3.
//
// The worked chain is the shortest legal path found by the move search
// (moves/graph.js, with the declarations), each line printed tidily (terms
// in the formula's letter order, plus terms first, one fraction bar):
// A = lw; A/l = w. Its last line has the target alone on one side (form
// predicate isolated:<target>). Every line is checked to be its stated move
// done to the line before (sameSides, with the declarations). The Next Line,
// Predict and Why items are built from it.
// problem.steps is NOT that chain: test/gen/harness.js verifies an equation
// chain with sameSolutions in ONE variable, which a formula in several
// letters is not (it would fail "an equation chain needs exactly one
// variable key"). problem.steps here is the substitution check of the
// answer, an expression chain the harness can verify: put w = A/l back into
// lw: l(A/l), which is A (when the formula is too wide for that, the answer
// goes into the latest line of the chain where it fits). DEVIATION,
// reported under NEEDS FROM OTHERS.
//
// Interactions:
//   nextline  I2 on one stated move of the chain. NOT in section 3's I2 list
//             for this skill; it is here because literal-equations needs a
//             box 0-1 choice interaction and I5 Twin cannot take equations in
//             more than one variable (DEVIATION, reported). Candidates: the
//             line and the Lopsider's / Carrier's (and, for a number
//             divisor, Peeler's / Slicer's) lines, printed tidily; a set the
//             majority-vote attack solves, or where the key is the one
//             shortest or longest line, is rejected, so a step whose only
//             rule is the Lopsider (a division by a symbol) is never served
//             here. After a division by a number all candidates are printed
//             term by term (y/4 + 2 = x; the Slicer's y/4 + 8 = x).
//   predict   I3: the same stated move, typed, side-wise; the last move of
//             the chain also needs isolated:<target>.
//   strike    I8 "Solve for w": the key is the EXPRESSION w equals (answer
//             kind 'expr', A/l). The harness cannot check an
//             'equation-sides' key without a stated move, and
//             'equation-multiple' refuses a division by a symbol (equiv.js
//             isMultiple allows rational multiples only). The spec names
//             solvedFor: w, so the judge also takes the solved line "w = A/l"
//             (or "A/l = w") as I8 requires; both are correct.
//   cast      I1 with the declarations: chips (formulaAlphabet) clear a
//             denominator, remove a term, divide a one-term side by its
//             whole-number coefficient or by one of its letters, multiply by
//             a letter (risky unless declared), "x 0". Goal: isolated target. At most one chip of "/ <letter>" and "x 0" is shown
//             (test/gen/review-pools.test.js), so the refused chip is often
//             "x w" (risky) rather than "/ w".
//   why       'hidden-1' (counting) when the chain ends with a division or a
//             multiplication: "A/l = (l/l)w"; 'hidden-0' when it ends by
//             removing a term: "(y - b) = x + (b - b)". Sides drawn in
//             either order.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, fitsDisplay,
  shuffledChoices, tapTargets, probeEnvs, voteFindsKey,
} from '../common.js';
import { num, mul, frac, add, neg, group, v, eq, pow, vars, isEquation } from '../../math/ast.js';
import { q, div as qdiv, gcd, ONE } from '../../math/rational.js';
import { parse } from '../../math/parse.js';
import { print } from '../../math/print.js';
import { equivExpr, sameSides } from '../../math/equiv.js';
import { toPoly, toRat, polyTerms, pscale, pConstValue, pIsZero, polyToNode } from '../../math/poly.js';
import { getForm } from '../../math/forms.js';
import { applyMove } from '../../moves/apply.js';
import { canonicalize, step, search, chipVerdicts } from '../../moves/graph.js';
import { outputsOf } from '../../misc/diagnose.js';
import { moveText, rulesFor } from './balance-moves.core.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Move} Move */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').Choice} Choice */
/** @typedef {import('../../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {import('../../math/poly.js').Poly} Poly */
/** @typedef {{ f: (r: Rng) => string; t: string[] }} Template */

const GEN = Object.freeze({ id: 'literal-equations.core', version: 1, skill: 'literal-equations' });

/** Seed of the documented example (see the header). */
export const EXAMPLE_SEED = 's1';

/** @param {Rng} r */
const k29 = (r) => r.int(2, 9);

/** @type {Record<number, Template[]>} */
const TEMPLATES = {
  1: [
    { f: () => 'A = lw', t: ['w', 'l'] },
    { f: () => 'd = rt', t: ['t', 'r'] },
    { f: () => 'F = ma', t: ['a', 'm'] },
    { f: () => 'V = Bh', t: ['h', 'B'] },
    { f: () => 'W = Fd', t: ['d', 'F'] },
    { f: (r) => `y = ${k29(r)}x`, t: ['x'] },
    { f: () => 'y = x + b', t: ['x', 'b'] },
    { f: (r) => `y = x - ${k29(r)}`, t: ['x'] },
  ],
  2: [
    { f: () => 'y = mx + b', t: ['x'] },
    { f: () => 'y = mx - b', t: ['x'] },
    { f: (r) => `y = ${k29(r)}x + b`, t: ['x'] },
    { f: (r) => `y = ${k29(r)}x - ${k29(r)}`, t: ['x'] },
    { f: () => 'P = 2l + 2w', t: ['w', 'l'] },
    { f: () => 'I = Prt', t: ['t', 'r'] },
    { f: () => 'P = a + b + c', t: ['c', 'a'] },
  ],
  3: [
    { f: () => 'A = (1/2)bh', t: ['h', 'b'] },
    { f: () => 'V = (1/3)Bh', t: ['h', 'B'] },
    { f: () => 'm = (a + b)/2', t: ['a', 'b'] },
    { f: () => 'P = 2(l + w)', t: ['w', 'l'] },
    { f: (r) => `y = (x + b)/${k29(r)}`, t: ['x'] },
    { f: (r) => `A = bh/${r.int(2, 4)}`, t: ['h', 'b'] },
  ],
  4: [
    { f: () => 'y = m(x - h)', t: ['x'] },
    { f: () => 'A = (1/2)(a + b)h', t: ['a', 'b'] },
    { f: () => 'F = (9/5)C + 32', t: ['C'] },
    { f: () => 'T = (a + b + c)/3', t: ['c', 'a'] },
    { f: (r) => `y = ${k29(r)}(x - h)`, t: ['x'] },
  ],
};

// ---------------------------------------------------------------- tidy printing

/** Letter order: first appearance in the formula. @param {Equation} e @returns {Map<string, number>} */
function letterOrder(e) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const ch of print(e)) if (/[A-Za-z]/.test(ch) && !m.has(ch)) m.set(ch, m.size);
  return m;
}

/**
 * A polynomial with INTEGER coefficients as a tidy sum: plus terms first,
 * each group in the formula's letter order, numbers last.
 * @param {Poly} p @param {Map<string, number>} ord @returns {Node}
 */
function tidySum(p, ord) {
  const terms = polyTerms(p).map((t) => {
    const names = t.mono.map(([n]) => n).sort((a, b) => (ord.get(a) ?? 99) - (ord.get(b) ?? 99));
    const first = names.length ? Math.min(...names.map((n) => ord.get(n) ?? 99)) : 999;
    return { t, names, first };
  });
  terms.sort((x, y) => (x.t.coef.n < 0n ? 1 : 0) - (y.t.coef.n < 0n ? 1 : 0) || x.first - y.first);
  if (terms.length === 0) return num(0);
  const nodes = terms.map(({ t, names }) => {
    const c = t.coef.n < 0n ? -t.coef.n : t.coef.n;
    const exps = new Map(t.mono);
    /** @type {Node[]} */
    const fs = names.map((n) => ((exps.get(n) ?? 1) > 1 ? pow(v(n), num(exps.get(n) ?? 1)) : v(n)));
    if (c !== 1n || fs.length === 0) fs.unshift(num(c));
    const body = fs.length === 1 ? fs[0] : mul(...fs);
    return t.coef.n < 0n ? neg(body) : body;
  });
  return nodes.length === 1 ? nodes[0] : add(...nodes);
}

/** lcm of the coefficient denominators of a polynomial. @param {Poly} p */
function denLcm(p) { return polyTerms(p).reduce((a, t) => (a / gcd(a, t.coef.d)) * t.coef.d, 1n); }
/** gcd of the integer coefficients of a polynomial. @param {Poly} p */
function content(p) { return polyTerms(p).reduce((a, t) => gcd(a, t.coef.n), 0n); }

/**
 * A side printed tidily: a polynomial with one fraction bar ((P - 2l)/2, h/2),
 * or numerator / denominator with whole-number coefficients (A/l, (y - b)/m).
 * Value-preserving; returns the side unchanged outside the rational functions.
 * @param {Node} side @param {Map<string, number>} ord @returns {Node}
 */
export function tidy(side, ord) {
  const r = toRat(side);
  if (!r) return side;
  let N = r.num;
  let D = r.den;
  const c = pConstValue(D);
  if (c !== undefined) { N = pscale(N, qdiv(ONE, c)); D = toPoly(num(1)) ?? D; }
  // whole-number coefficients on both parts, no common whole factor, a plus first term below
  const m = (() => { const a = denLcm(N); const b = denLcm(D); return (a / gcd(a, b)) * b; })();
  N = pscale(N, q(m));
  D = pscale(D, q(m));
  const g = gcd(content(N), content(D)) || 1n;
  N = pscale(N, q(1n, g));
  D = pscale(D, q(1n, g));
  const lead = polyTerms(D)[0];
  if (lead && lead.coef.n < 0n) { N = pscale(N, q(-1)); D = pscale(D, q(-1)); }
  const dc = pConstValue(D);
  if (dc !== undefined && dc.n === 1n && dc.d === 1n) return tidySum(N, ord);
  if (pIsZero(N)) return num(0);
  return frac(tidySum(N, ord), tidySum(D, ord));
}

/** A line printed tidily. @param {Equation} e @param {Map<string, number>} ord @returns {Equation} */
const tidyLine = (e, ord) => eq(tidy(e.lhs, ord), tidy(e.rhs, ord));

/**
 * A polynomial side with each term over its own denominator, y/4 + 2 (the
 * way a line looks after dividing by a number term by term). Falls back to
 * tidy() outside the polynomials.
 * @param {Node} side @param {Map<string, number>} ord @returns {Node}
 */
function tidySplit(side, ord) {
  const p = toPoly(side);
  if (!p) return tidy(side, ord);
  const terms = polyTerms(p);
  if (terms.length === 0) return num(0);
  /** @type {{ node: Node; neg: boolean; first: number }[]} */
  const parts = terms.map((t) => {
    /** @type {Poly} */
    const whole = /** @type {any} */ ({ kind: 'poly', terms: new Map([[t.key, q(t.coef.n < 0n ? -t.coef.n : t.coef.n)]]) });
    const top = tidySum(whole, ord);
    const node = t.coef.d === 1n ? top : frac(top, num(t.coef.d));
    const first = t.mono.length ? Math.min(...t.mono.map(([n]) => ord.get(n) ?? 99)) : 999;
    return { node, neg: t.coef.n < 0n, first };
  });
  parts.sort((x, y) => (x.neg ? 1 : 0) - (y.neg ? 1 : 0) || x.first - y.first);
  const ns = parts.map((x) => (x.neg ? neg(x.node) : x.node));
  return ns.length === 1 ? ns[0] : add(...ns);
}

// ---------------------------------------------------------------- the formula

/**
 * The coefficient of the target in L - R (it must not hold the target, and
 * the rest must be free of it): L - R = alpha t + beta.
 * @param {Equation} e @param {string} t @returns {{ alpha: Poly; beta: Poly } | undefined}
 */
function linearIn(e, t) {
  const p = toPoly(add(e.lhs, neg(e.rhs)));
  if (!p) return undefined;
  /** @type {Map<string, Q>} */
  const a = new Map();
  /** @type {Map<string, Q>} */
  const b = new Map();
  for (const term of polyTerms(p)) {
    const e1 = term.mono.find(([n]) => n === t);
    const rest = term.mono.filter(([n]) => n !== t);
    const key = rest.map(([n, x]) => `${n}^${x}`).join('*');
    if (e1 && e1[1] !== 1) return undefined;
    (e1 ? a : b).set(key, term.coef);
  }
  /** @param {Map<string, Q>} mp */
  const toP = (mp) => {
    /** @type {Node[]} */
    const parts = [];
    for (const [key, c] of mp) {
      const fs = key === '' ? [] : key.split('*').map((s) => { const [n, x] = s.split('^'); return Number(x) > 1 ? pow(v(n), num(Number(x))) : v(n); });
      parts.push(mul({ t: 'num', q: c }, ...fs));
    }
    return toPoly(parts.length ? add(...parts) : num(0));
  };
  const alpha = toP(a);
  const beta = toP(b);
  if (!alpha || !beta || pIsZero(alpha)) return undefined;
  return { alpha, beta };
}

/** Replace every v by `by`. @param {Node} n @param {string} name @param {Node} by @returns {Node} */
function subst(n, name, by) {
  switch (n.t) {
    case 'var': return n.name === name ? group(by) : n;
    case 'num': return n;
    case 'add': return add(...n.args.map((c) => subst(c, name, by)));
    case 'mul': return mul(...n.args.map((c) => subst(c, name, by)));
    case 'neg': return neg(subst(n.arg, name, by));
    case 'group': return group(subst(n.arg, name, by));
    case 'frac': return frac(subst(n.num, name, by), subst(n.den, name, by));
    case 'pow': return pow(subst(n.base, name, by), subst(n.exp, name, by));
    case 'root': return { t: 'root', index: n.index, radicand: subst(n.radicand, name, by) };
  }
}

// ---------------------------------------------------------------- Cast alphabet

/** @param {Node} n */
const isZeroNum = (n) => n.t === 'num' && n.q.n === 0n;

/**
 * The chip alphabet of a formula state (target-blind, section 3 I1):
 * multiply a side by its coefficients' common denominator; remove each term
 * from both sides; for a side that is one term, divide by its whole-number
 * coefficient and by each of its letters; "x 0"; multiply by each letter of
 * a one-term side (risky unless declared). At most 12 moves.
 * @param {Equation} state @returns {Move[]}
 */
export function formulaAlphabet(state) {
  // Order matters: the move search keeps the first shortest path it meets,
  // and that path is the worked chain. Clearing a denominator first, then
  // removing terms, then dividing is the order a teacher writes.
  /** @type {Move[]} */
  const clear = [];
  /** @type {Move[]} */
  const remove = [];
  /** @type {Move[]} */
  const divide = [];
  /** @type {Move[]} */
  const late = [];
  for (const side of [state.lhs, state.rhs]) {
    const p = toPoly(side);
    if (!p) continue;
    const terms = polyTerms(p);
    const d = denLcm(p);
    if (d > 1n) clear.push({ op: 'mul', operand: num(d) });
    for (const t of terms) {
      /** @type {Poly} */
      const size = /** @type {any} */ ({ kind: 'poly', terms: new Map([[t.key, t.coef.n < 0n ? q(-t.coef.n, t.coef.d) : t.coef]]) });
      const node = tidySum(pscale(size, q(denLcm(size))), new Map());
      const operand = denLcm(size) === 1n ? node : frac(node, num(denLcm(size)));
      remove.push({ op: t.coef.n < 0n ? 'add' : 'sub', operand });
    }
    if (terms.length !== 1) continue;
    const [t] = terms;
    const names = t.mono.map(([n]) => n);
    if (t.coef.d === 1n && t.coef.n !== 1n && t.coef.n !== -1n && names.length > 0) divide.push({ op: 'div', operand: num(t.coef.n < 0n ? -t.coef.n : t.coef.n) });
    for (const n of names) divide.push({ op: 'div', operand: v(n) });
    for (const n of names) late.push({ op: 'mul', operand: v(n) });
  }
  /** @type {Set<string>} */
  const seen = new Set();
  return [...clear, ...remove, ...divide, { op: 'mul', operand: num(0) }, ...late].filter((m) => {
    const k = `${m.op} ${m.operand ? print(m.operand) : ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12);
}

/** "/ <letter>" or "x 0": the review's refused-chip shapes. @param {Move} m */
function isTrap(m) {
  return (m.op === 'div' && m.operand !== undefined && m.operand.t === 'var') || (m.op === 'mul' && m.operand !== undefined && isZeroNum(m.operand));
}

/**
 * Cast choices with the item's declarations: one progress chip, a legal-idle
 * chip when there is one, up to 4 chips in all, at most 2 progress and at
 * most one trap (counting the progress chip), a refused chip when the trap
 * rule allows. undefined (reject) when there is none to show.
 * @param {Rng} r @param {Equation} start canonical @param {(s: Equation) => boolean} isGoal @param {Assumption[]} as
 */
function castChoices(r, start, isGoal, as) {
  const cv = chipVerdicts(start, formulaAlphabet(start), formulaAlphabet, isGoal, { as });
  if (!cv || cv.distance === 0) return undefined;
  const prog = cv.chips.filter((c) => c.verdict === 'progress');
  if (prog.length === 0) return undefined;
  const first = r.pick(prog);
  const pool = r.shuffle(cv.chips.filter((c) => c !== first));
  /** @type {typeof cv.chips} */
  const shown = [first];
  const idle = pool.find((c) => c.verdict === 'legal-idle' && !isTrap(c.move));
  if (idle) shown.push(idle);
  const refused = pool.find((c) => (c.verdict === 'risky' || c.verdict === 'illegal') && !(isTrap(c.move) && shown.some((x) => isTrap(x.move))));
  if (refused) shown.push(refused);
  for (const c of pool) {
    if (shown.length >= 4) break;
    if (shown.includes(c)) continue;
    if (c.verdict === 'progress' && shown.filter((x) => x.verdict === 'progress').length >= 2) continue;
    if (isTrap(c.move) && shown.some((x) => isTrap(x.move))) continue;
    shown.push(c);
  }
  if (shown.length < 3) return undefined;
  const items = shown.map((c) => {
    /** @type {Omit<Choice, 'id'>} */
    const o = { display: c.move, verdict: c.verdict };
    if (c.distance !== undefined) o.distance = c.distance;
    return o;
  });
  return { choices: shuffledChoices(r, items), moveGraph: { distance: cv.distance, minPath: cv.minPath } };
}

// ---------------------------------------------------------------- items

/** "l is not 0", "P and r are not 0". @param {string[]} names */
function declText(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return ` ${names[0]} is not 0.`;
  return ` ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are not 0.`;
}

/**
 * @param {Rng} r @param {Equation} formula @param {string} target @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, formula, target, opts, seed) {
  const ord = letterOrder(formula);
  const lin = linearIn(formula, target);
  if (!lin) return undefined;
  // declare every letter of the target's coefficient nonzero; it must be one term
  if (polyTerms(lin.alpha).length !== 1) return undefined;
  const declared = polyTerms(lin.alpha)[0].mono.map(([n]) => n).sort((a, b) => (ord.get(a) ?? 0) - (ord.get(b) ?? 0));
  /** @type {Assumption[]} */
  const as = declared.map((name) => ({ name, rel: /** @type {const} */ ('nonzero') }));
  const isGoal = /** @type {(s: Equation) => boolean} */ (getForm(`isolated:${target}`));
  // the key: target = -beta / alpha, checked by substitution
  const keyRaw = frac(polyToNode(pscale(lin.beta, q(-1))), polyToNode(lin.alpha));
  const key = tidy(keyRaw, ord);
  const L = subst(formula.lhs, target, key);
  const R = subst(formula.rhs, target, key);
  if (equivExpr(L, R, as).equal !== true) throw new Error(`${GEN.id}: ${target} = ${print(key)} does not solve ${print(formula)} (seed ${JSON.stringify(seed)})`);
  if (vars(key).includes(target)) throw new Error(`${GEN.id}: the key holds the target (seed ${JSON.stringify(seed)})`);
  // the worked chain: the shortest legal path, printed tidily
  const found = search(canonicalize(formula, as), formulaAlphabet, isGoal, { as });
  if (!found.found || found.capped || found.found.distance === 0) return undefined;
  /** @type {Step[]} */
  const steps = [{ line: formula, legal: true }];
  let state = canonicalize(formula, as);
  for (const m of found.found.minPath) {
    state = step(m, state, as);
    const line = tidyLine(state, ord);
    const prev = /** @type {Equation} */ (steps[steps.length - 1].line);
    if (sameSides(line, applyMove(m, prev), as) !== true) throw new Error(`${GEN.id}: tidy line ${print(line)} is not the move (seed ${JSON.stringify(seed)})`);
    steps.push({ line, move: m, legal: true });
  }
  const last = /** @type {Equation} */ (steps[steps.length - 1].line);
  if (!isGoal(last)) throw new Error(`${GEN.id}: the chain does not end with ${target} alone (seed ${JSON.stringify(seed)})`);
  const lastKey = last.lhs.t === 'var' ? last.rhs : last.lhs;
  if (equivExpr(lastKey, key, as).equal !== true) throw new Error(`${GEN.id}: the chain ends on another value (seed ${JSON.stringify(seed)})`);
  if (!steps.every((st) => fitsDisplay(st.line))) return undefined;
  // problem.steps: the substitution check of the answer (see the header):
  // the answer put back into the formula; when that is too wide for the
  // phone, into the latest line of the chain where it fits (F = (9/5)C + 32:
  // 9((5F - 160)/9) gives back 5F - 160)
  /** @type {Step[] | undefined} */
  let check;
  for (let i = 0; i < steps.length - 1 && !check; i++) {
    const ln = /** @type {Equation} */ (steps[i === 0 ? 0 : steps.length - 1 - i].line);
    const holderSide = vars(ln.lhs).includes(target) ? ln.lhs : ln.rhs;
    const otherSide = holderSide === ln.lhs ? ln.rhs : ln.lhs;
    const plugged = subst(holderSide, target, key);
    const back = tidy(otherSide, ord);
    if (equivExpr(plugged, back, as).equal !== true) throw new Error(`${GEN.id}: the answer does not check in ${print(ln)} (seed ${JSON.stringify(seed)})`);
    const lines = [plugged, tidy(plugged, ord), back]
      .filter((line, j, a) => j === 0 || print(line) !== print(a[j - 1]))
      .filter((line) => fitsDisplay(line))
      .map((line) => ({ line, legal: true }));
    if (lines.length >= 2 && fitsDisplay(plugged)) check = lines;
  }
  if (!check) return undefined;
  const letters = [...ord.keys()];
  const shared = { variableKeys: letters, assumptions: as, probes: probeEnvs(letters, as), visuals: ['balance'], steps: check };
  const goal = `Solve for ${target}.${declText(declared)}`;

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: `Solve for ${target}`, math: formula, goal },
        answer: { kind: 'expr', expected: key, formPredicates: [], assumptions: [], solvedFor: target },
        ...shared,
      });
    case 'nextline': case 'predict': {
      const at = steps.map((st, i) => i).filter((i) => i > 0 && (opts.interaction === 'predict' || ['add', 'sub', 'mul', 'div'].includes(/** @type {Move} */ (steps[i].move).op)));
      const j = r.fork('step').pick(at);
      const prev = /** @type {Equation} */ (steps[j - 1].line);
      const move = /** @type {Move} */ (steps[j].move);
      const after = /** @type {Equation} */ (steps[j].line);
      const p = makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Next line', math: prev, move, goal: `Solve for ${target}. ${moveText(move)}${declText(declared)}` },
        answer: { kind: 'equation-sides', expected: after, formPredicates: j === steps.length - 1 ? [`isolated:${target}`] : [], assumptions: [] },
        ...shared,
      });
      if (opts.interaction === 'predict') return p;
      // every rule output, printed tidily, then a set the vote attack does not
      // solve. After a division by a number every candidate is printed term
      // by term (y/4 + 2 = x), the way the Slicer writes his line (y/4 + 8),
      // so the student can find it and the key is not the only line of its look.
      const split = move.op === 'div' && move.operand !== undefined && vars(move.operand).length === 0;
      const show = (/** @type {Equation} */ e) => (split ? eq(tidySplit(e.lhs, ord), tidySplit(e.rhs, ord)) : tidyLine(e, ord));
      const shownKey = show(canonicalize(after, as));
      if (sameSides(shownKey, after, as) !== true) throw new Error(`${GEN.id}: the printed key is not the key (seed ${JSON.stringify(seed)})`);
      /** @type {Omit<Choice, 'id'>[]} */
      const pool = [];
      for (const rule of rulesFor(move)) {
        for (const o of outputsOf(rule, p)) {
          if (!isEquation(o)) continue;
          const t = show(canonicalize(o, as));
          if (sameSides(t, after, as) !== false) return undefined; // a rule lands on the key
          if (pool.some((c) => sameSides(/** @type {Equation} */ (c.display), t, as) !== false)) continue;
          pool.push({ display: t, verdict: 'wrong', malrule: rule.id });
        }
      }
      /** @type {Omit<Choice, 'id'>[][]} */
      const sets = [];
      for (const size of [3, 2]) {
        const walk = (/** @type {number} */ from, /** @type {Omit<Choice, 'id'>[]} */ acc) => {
          if (acc.length === size) {
            const lines = [shownKey, ...acc.map((c) => /** @type {Equation} */ (c.display))];
            const lens = lines.map((x) => print(x).length);
            const extreme = lens.slice(1).every((l) => l < lens[0]) || lens.slice(1).every((l) => l > lens[0]);
            if (!voteFindsKey(lines) && !extreme) sets.push(acc);
            return;
          }
          for (let i = from; i < pool.length; i++) walk(i + 1, [...acc, pool[i]]);
        };
        walk(0, []);
        if (sets.length > 0) break;
      }
      if (sets.length === 0) return undefined;
      const wrong = r.fork('wrong').pick(sets);
      return { ...p, choices: shuffledChoices(r.fork('choices'), [{ display: shownKey, verdict: 'correct' }, ...wrong]) };
    }
    case 'cast': {
      const start = canonicalize(formula, as);
      const cc = castChoices(r.fork('cast'), start, isGoal, as);
      if (!cc) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Cast', math: formula, goal: `Pick a move for both sides. ${goal}` },
        choices: cc.choices, moveGraph: cc.moveGraph,
        answer: { kind: 'expr', expected: key, formPredicates: [], assumptions: [] },
        ...shared,
      });
    }
    case 'why': {
      const j = steps.length - 1;
      const move = /** @type {Move} */ (steps[j].move);
      const prev = /** @type {Equation} */ (steps[j - 1].line);
      const o = /** @type {Node} */ (move.operand);
      const holderLeft = last.lhs.t === 'var';
      const other = holderLeft ? last.rhs : last.lhs;
      const flip = r.fork('side').bool();
      /** @type {Node} */ let holder;
      /** @type {Node} */ let shownOther;
      /** @type {'hidden-1' | 'hidden-0'} */ let variant;
      if (move.op === 'div' || move.op === 'mul') {
        variant = 'hidden-1';
        holder = mul(group(frac(o, o)), v(target));
        shownOther = other.t === 'frac' || other.t === 'group' ? other : group(other);
      } else {
        variant = 'hidden-0';
        holder = add(v(target), group(move.op === 'sub' ? add(o, neg(o)) : add(neg(o), o)));
        const prevOther = holderLeft ? prev.rhs : prev.lhs;
        const parts = prevOther.t === 'add' ? prevOther.args : [prevOther];
        shownOther = group(add(...parts, move.op === 'sub' ? neg(o) : o));
      }
      const math = flip ? eq(shownOther, holder) : eq(holder, shownOther);
      const hs = flip ? 'r' : 'l';
      const os = flip ? 'l' : 'r';
      const coinPath = variant === 'hidden-1' ? `${hs}.0` : `${hs}.1`;
      const varPath = variant === 'hidden-1' ? `${hs}.1` : `${hs}.0`;
      return makeProblem(GEN, seed, opts, {
        variant,
        prompt: {
          verb: variant === 'hidden-1' ? 'Tap the hidden 1' : 'Tap the hidden 0', math,
          goal: `${moveText(move)}${declText(declared)} Tap the ${variant === 'hidden-1' ? '1' : '0'} it leaves next to ${target}.`,
        },
        choices: tapTargets(math, [os, shownOther.t === 'group' ? `${os}.0.0` : `${os}.0`, coinPath, varPath].sort(), coinPath),
        answer: { kind: 'expr', expected: num(variant === 'hidden-1' ? 1 : 0), formPredicates: [], assumptions: [] },
        ...shared,
        // section 7: the form of 1 is the coin, the form of 0 the zero-pair, wherever it is the tap target
        visuals: [variant === 'hidden-1' ? 'coin' : 'zeropair', 'balance'],
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['nextline', 'predict', 'strike', 'cast', 'why'],
  alphabet: formulaAlphabet,
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const tr = r.fork('template');
      const tpl = tr.pick(TEMPLATES[opts.difficulty]);
      const text = tpl.f(tr);
      const formula = parse(text);
      if ('error' in formula || !isEquation(formula)) throw new Error(`${GEN.id}: template ${text} does not parse`);
      const target = tr.pick(tpl.t);
      const p = item(r, formula, target, opts, seed);
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});

