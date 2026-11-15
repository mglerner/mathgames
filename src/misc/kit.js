// @ts-check
// Shared toolkit for the mal-rule files in src/misc/malrules/ (DESIGN.md
// section 5). It lives here, not in that directory, because
// scripts/gen-registry.js treats every file there as one mal-rule.
//
// A mal-rule is an executable model of ONE wrong procedure. It reads only the
// frozen Problem shape (types.d.ts): prompt.math, prompt.move, answer.kind,
// interaction, variant, assumptions. It never reads generator internals, so
// the same rule works on every generator that follows the Problem conventions
// in the header of src/gen/common.js.
//
// defineMalRule(def) turns `outputs(problem)` into the MalRule contract:
//   apply(problem)     the first (most typical) wrong result, or undefined
//                      when the bug does not show on this item;
//   applyAll(problem)  every faithful wrong result (numerator-only AND
//                      denominator-only, ...), most typical first. An
//                      extension of the frozen MalRule type, which has room
//                      for one value only;
//   picks(problem)     (optional extension) choice ids this bug taps on items
//                      whose response is not math: "Different" on a Twin, a
//                      "/ x" chip on a one-way Cast.
// The kind of an output follows the item: a Node for expression items
// (answer.kind 'expr', 'form-of-1', 'form-of-0', and every Twin), an Equation
// for line items ('equation-sides', 'equation-multiple', and the read-abc
// tuple, whose a, b, c are returned as a v^2 + b v + c = 0), a SolutionSet
// for 'solution-set'.
// `script` is the 15-word feedback line. It is ONE static string shown on
// every item the rule fires on, so it never quotes a number, a variable name,
// an operation or a direction that belongs to one example (the section 5
// scripts carry their example's numbers; those are not used verbatim). A rule never returns the correct answer on purpose, but
// it does not check: generators reject seeds where a wrong procedure happens
// to land on the key (section 11 generator contract).
// Nothing here throws on any Problem: a failure is "does not apply".

import { isEquation, stripGroups, vars, some, same } from '../math/ast.js';
import { q, ONE, ZERO, isZero, qeq } from '../math/rational.js';
import { constValue, constQ, evaluate } from '../math/evaluate.js';
import { toPoly, polyToNode, coeffsIn, polyTerms, pconst, pvar, padd, pmul, pscale, ppow } from '../math/poly.js';
import { fromQ, surdToNode } from '../math/surd.js';
import { solve } from '../math/solve.js';
import { print } from '../math/print.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').SolutionSet} SolutionSet */
/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').MalRule} MalRule */
/** @typedef {Node | Equation | SolutionSet} MalOutput */
/**
 * @typedef {MalRule & {
 *   n: number;
 *   applyAll(problem: Problem): MalOutput[];
 *   picks?(problem: Problem): string[];
 * }} MalRuleX
 */

/** Name of the variable node that stands for the blank in "3 + 4 = [ ] + 2" (variant 'fill-blank'). */
export const BLANK = '_';
/** Problem.variant values the rules key on (see src/gen/common.js). */
export const V_FILL_BLANK = 'fill-blank';
export const V_WHOLE_AS_FRACTION = 'whole-as-fraction';
export const V_READ_ABC = 'read-abc';
export const V_ONE_WAY = 'one-way';
/** A "find its value at x = p" item (I3 on equivalent-expressions): the typed answer is a NUMBER, the value at problem.probes[0]. */
export const V_LANTERN = 'lantern';

/**
 * @param {{ id: string; n: number; haunt: string; standardTerm: string; script: string; skills: string[];
 *   outputs?: (problem: Problem) => MalOutput[]; picks?: (problem: Problem) => string[] }} def
 * @returns {MalRuleX}
 */
export function defineMalRule(def) {
  /** @param {Problem} problem @returns {MalOutput[]} */
  const applyAll = (problem) => {
    if (!def.outputs) return [];
    try {
      if (!problem || !problem.prompt || !problem.answer) return [];
      return def.outputs(problem).filter((x) => x !== undefined && x !== null);
    } catch {
      return []; // a tree the rule cannot handle: the bug does not show here
    }
  };
  /** @type {MalRuleX} */
  const rule = {
    id: def.id, n: def.n, haunt: def.haunt, standardTerm: def.standardTerm, script: def.script,
    skills: def.skills,
    apply: (problem) => applyAll(problem)[0],
    applyAll,
  };
  if (def.picks) {
    const picks = def.picks;
    rule.picks = (problem) => { try { return picks(problem); } catch { return []; } };
  }
  return Object.freeze(rule);
}

// ---------------------------------------------------------------- small node helpers

/** Integer node from a bigint. @param {bigint} n @returns {Node} */
export function int(n) { return n < 0n ? { t: 'neg', arg: { t: 'num', q: { n: -n, d: 1n } } } : { t: 'num', q: { n, d: 1n } }; }

/** A rational as a display tree in the parser's shape (3/4 is frac(3, 4); a minus is a neg node). @param {Q} x @returns {Node} */
export function qNode(x) { return surdToNode(fromQ(x)); }

/** The integer value of an integer literal (optionally negated), else undefined. @param {Node} n @returns {bigint | undefined} */
export function intOf(n) {
  const s = stripGroups(n);
  if (s.t === 'num') return s.q.d === 1n ? s.q.n : undefined;
  if (s.t === 'neg') { const i = intOf(s.arg); return i === undefined ? undefined : -i; }
  return undefined;
}

/**
 * Tidy a result the way a student would write it: a constant becomes its
 * exact value, a polynomial its expanded descending form; anything else is
 * returned unchanged. Value-preserving.
 * @param {Node} n @returns {Node}
 */
export function simp(n) {
  if (vars(n).length === 0) {
    const val = constValue(n);
    return val ? surdToNode(val) : n;
  }
  const p = toPoly(n);
  return p ? polyToNode(p) : n;
}

/** @param {Node[]} terms @returns {Node} */
export function sum(terms) {
  if (terms.length === 0) return { t: 'num', q: ZERO };
  return terms.length === 1 ? terms[0] : { t: 'add', args: terms };
}

/** The terms of a sum (a non-sum is one term). Groups are looked through. @param {Node} n @returns {Node[]} */
export function termsOf(n) {
  const s = stripGroups(n);
  return s.t === 'add' ? s.args : [s];
}

/** @param {Node} a @param {Node} b @returns {Node} */
export function times(a, b) { return { t: 'mul', args: [a, b] }; }
/** @param {Node} a @param {Node} b @returns {Node} */
export function over(a, b) { return { t: 'frac', num: a, den: b }; }
/** @param {Node} lhs @param {Node} rhs @returns {Equation} */
export function eqn(lhs, rhs) { return { t: 'eq', lhs, rhs }; }

/** Is the node a negative term (a neg node, a negative literal, or a product that starts with one)? @param {Node} n */
export function isNegTerm(n) {
  const s = stripGroups(n);
  if (s.t === 'neg') return true;
  if (s.t === 'num') return s.q.n < 0n;
  if (s.t === 'mul' && s.args.length > 0) return isNegTerm(s.args[0]);
  return false;
}

/**
 * Quotient of two single-term polynomials when it is again a single term
 * with an INTEGER coefficient (6/3, 2x/2, x^2/x, x/x); undefined otherwise
 * (x/3, 3/x, sums). This is what "it cancels" means to the Crosser.
 * @param {Node} t @param {Node} d @returns {Node | undefined}
 */
export function monoDiv(t, d) {
  const pt = toPoly(t);
  const pd = toPoly(d);
  if (!pt || !pd) return undefined;
  const tt = polyTerms(pt);
  const dt = polyTerms(pd);
  if (tt.length !== 1 || dt.length !== 1) return undefined;
  const c = q(tt[0].coef.n * dt[0].coef.d, tt[0].coef.d * dt[0].coef.n);
  if (c.d !== 1n) return undefined;
  let out = pconst(c);
  const de = new Map(dt[0].mono);
  for (const [name, e] of tt[0].mono) {
    const left = e - (de.get(name) ?? 0);
    de.delete(name);
    if (left < 0) return undefined;
    if (left > 0) out = pmul(out, ppow(pvar(name), left));
  }
  if (de.size > 0) return undefined;
  return polyToNode(out);
}

/** Is the node exactly the number 1? @param {Node} n */
export function isOne(n) { const v = vars(n).length === 0 ? constQ(n) : undefined; return !!v && qeq(v, ONE); }

/**
 * Rewrite every outermost sub-tree that `alts` matches. alts(node) returns the
 * replacements for that node, most typical first ([] = no match; the search
 * then goes into its children). The result lists whole trees: the k-th uses
 * each match's k-th replacement (or its last one). [] when nothing matched.
 * @param {Node} tree
 * @param {(n: Node) => Node[]} alts
 * @returns {Node[]}
 */
export function rewriteWhere(tree, alts) {
  let most = 0;
  /** @param {Node} n @param {number} k @returns {Node} */
  const go = (n, k) => {
    const a = alts(n);
    if (a.length > 0) { most = Math.max(most, a.length); return a[Math.min(k, a.length - 1)]; }
    switch (n.t) {
      case 'num': case 'var': return n;
      case 'add': return { t: 'add', args: n.args.map((c) => go(c, k)) };
      case 'mul': return { t: 'mul', args: n.args.map((c) => go(c, k)) };
      case 'neg': return { t: 'neg', arg: go(n.arg, k) };
      case 'group': return { t: 'group', arg: go(n.arg, k) };
      case 'frac': return { t: 'frac', num: go(n.num, k), den: go(n.den, k) };
      case 'pow': return { t: 'pow', base: go(n.base, k), exp: go(n.exp, k) };
      case 'root': return { t: 'root', index: n.index, radicand: go(n.radicand, k) };
    }
  };
  const first = go(tree, 0);
  /** @type {Node[]} */
  const out = [];
  if (most === 0) return out;
  out.push(first);
  for (let k = 1; k < most; k++) out.push(go(tree, k));
  return out;
}

// ---------------------------------------------------------------- reading the item

/** prompt.math when it is an expression, groups removed. @param {Problem} p @returns {Node | undefined} */
export function exprOf(p) {
  const m = p.prompt.math;
  return m && !isEquation(m) ? stripGroups(m) : undefined;
}

/** prompt.math when it is an equation, groups removed. @param {Problem} p @returns {Equation | undefined} */
export function equationOf(p) {
  const m = p.prompt.math;
  return isEquation(m) ? stripGroups(m) : undefined;
}

/** Is this an item whose wrong results are expressions (an 'expr' answer, or any Twin)? @param {Problem} p */
export function isExprItem(p) {
  return exprOf(p) !== undefined && (p.answer.kind === 'expr' || p.interaction === 'twin');
}

/** The one variable of a solve item, else undefined. @param {Problem} p @returns {string | undefined} */
export function solveVar(p) {
  const e = equationOf(p);
  if (!e || p.answer.kind !== 'solution-set') return undefined;
  const vs = vars(e).filter((x) => x !== BLANK);
  return vs.length === 1 ? vs[0] : undefined;
}

/**
 * Lift an expression rewrite to the item: on an expression item the rewritten
 * trees; on a Lantern item (variant V_LANTERN: "find its value at x = p") the
 * exact value of each rewritten tree at problem.probes[0], since that number
 * is what a student with the bug types there; on a solve item the solution
 * sets of the equation with the rewrite done wherever it applies (both sides
 * when both match).
 * @param {Problem} p
 * @param {(n: Node) => Node[]} rewrite whole-tree alternatives, [] if no match
 * @returns {MalOutput[]}
 */
export function lift(p, rewrite) {
  const m = exprOf(p);
  if (m) {
    if (!isExprItem(p)) return [];
    const trees = rewrite(m);
    if (p.variant !== V_LANTERN || p.interaction === 'twin') return trees;
    const env = (p.probes ?? [])[0];
    if (!env) return [];
    /** @type {Node[]} */
    const vals = [];
    for (const t of trees) {
      const val = evaluate(t, env);
      if (!val) continue;
      const n = surdToNode(val);
      if (!vals.some((x) => same(x, n))) vals.push(n);
    }
    return vals;
  }
  const e = equationOf(p);
  const v = solveVar(p);
  if (!e || !v) return [];
  const L = rewrite(e.lhs);
  const R = rewrite(e.rhs);
  /** @type {Equation[]} */
  const eqs = [];
  const n = Math.max(L.length, R.length);
  for (let k = 0; k < n; k++) {
    eqs.push(eqn(L.length ? L[Math.min(k, L.length - 1)] : e.lhs, R.length ? R[Math.min(k, R.length - 1)] : e.rhs));
  }
  /** @type {SolutionSet[]} */
  const out = [];
  for (const x of eqs) { const s = solve(x, v); if (s) out.push(s); }
  return out;
}

/**
 * A linear solve item as L = a v + b, R = c v + d (exact rationals), else
 * undefined (not a one-variable solve item, or a side is not linear in v).
 * @param {Problem} p
 * @returns {{ v: string; a: Q; b: Q; c: Q; d: Q } | undefined}
 */
export function linearOf(p) {
  const e = equationOf(p);
  const v = solveVar(p);
  if (!e || !v) return undefined;
  const pl = toPoly(e.lhs);
  const pr = toPoly(e.rhs);
  const cl = pl && coeffsIn(pl, v);
  const cr = pr && coeffsIn(pr, v);
  if (!cl || !cr || cl.length > 2 || cr.length > 2) return undefined;
  return { v, a: cl[1] ?? ZERO, b: cl[0] ?? ZERO, c: cr[1] ?? ZERO, d: cr[0] ?? ZERO };
}

/**
 * A linear solve item with the variable on ONE side only, turned so that it
 * reads a v + b = d with a != 0. undefined otherwise.
 * @param {Problem} p
 * @returns {{ v: string; a: Q; b: Q; d: Q } | undefined}
 */
export function oneSidedLinear(p) {
  const l = linearOf(p);
  if (!l) return undefined;
  if (!isZero(l.a) && isZero(l.c)) return { v: l.v, a: l.a, b: l.b, d: l.d };
  if (isZero(l.a) && !isZero(l.c)) return { v: l.v, a: l.c, b: l.d, d: l.b };
  return undefined;
}

/** A one-root solution set. @param {Q} x @returns {SolutionSet} */
export function oneRoot(x) { return { kind: 'finite', roots: [fromQ(x)] }; }

/**
 * Coefficients [c0, c1, c2] of each side of a one-variable equation of degree
 * at most 2, with the variable. undefined if a side is not such a polynomial.
 * @param {Problem} p
 * @returns {{ v: string; L: Q[]; R: Q[] } | undefined}
 */
export function quadraticSides(p) {
  const e = equationOf(p);
  if (!e) return undefined;
  const vs = vars(e);
  if (vs.length !== 1) return undefined;
  const pl = toPoly(e.lhs);
  const pr = toPoly(e.rhs);
  const cl = pl && coeffsIn(pl, vs[0]);
  const cr = pr && coeffsIn(pr, vs[0]);
  if (!cl || !cr || cl.length > 3 || cr.length > 3) return undefined;
  /** @param {Q[]} cs */
  const pad = (cs) => [cs[0] ?? ZERO, cs[1] ?? ZERO, cs[2] ?? ZERO];
  return { v: vs[0], L: pad(cl), R: pad(cr) };
}

/** c0 + c1 v + c2 v^2 as a descending display tree. @param {Q[]} cs @param {string} v @returns {Node} */
export function polyNode(cs, v) {
  let acc = pconst(ZERO);
  cs.forEach((c, i) => { acc = padd(acc, pscale(ppow(pvar(v), i), c)); });
  return polyToNode(acc);
}

/** Does the node contain a variable? @param {Node} n */
export function hasVar(n) { return vars(n).length > 0; }

export { isEquation, stripGroups, vars, some, same };

// ---------------------------------------------------------------- shapes shared by several rules

/** Choice ids of every Twin item (see src/gen/common.js). */
export const TWIN_SAME = 'same';
export const TWIN_DIFFERENT = 'different';

/** Equations, shortest printed line first (stable): the line a hurried student most likely writes. @param {Equation[]} eqs */
export function shortestFirst(eqs) {
  return eqs.map((e, i) => ({ e, i, len: print(e).length })).sort((x, y) => x.len - y.len || x.i - y.i).map((x) => x.e);
}

/**
 * n x a/b or a/b x n with n an integer literal: { n, w (the whole-number
 * node), f (the fraction node) }. undefined for anything else.
 * @param {Node} m group-stripped
 * @returns {{ n: bigint; w: Node; f: Extract<Node, { t: 'frac' }> } | undefined}
 */
export function wholeTimesFrac(m) {
  if (m.t !== 'mul' || m.args.length !== 2) return undefined;
  for (const [w, f] of [[m.args[0], m.args[1]], [m.args[1], m.args[0]]]) {
    const n = intOf(w);
    if (n !== undefined && f.t === 'frac') return { n, w, f };
  }
  return undefined;
}

/**
 * multiplier x (sum): a product with exactly one sum among its factors, with
 * an optional minus in front; or a bare -(sum) (`bare`, multiplier -1).
 * @param {Node} n group-stripped
 * @returns {{ mult: Node; terms: Node[]; bare: boolean } | undefined}
 */
export function productWithSum(n) {
  let s = n;
  let negate = false;
  if (s.t === 'neg') { negate = true; s = s.arg; }
  if (s.t === 'add' && s.args.length >= 2) return negate ? { mult: int(-1n), terms: s.args, bare: true } : undefined;
  if (s.t !== 'mul') return undefined;
  const sums = s.args.filter((x) => x.t === 'add' && x.args.length >= 2);
  if (sums.length !== 1) return undefined;
  const others = s.args.filter((x) => x !== sums[0]);
  if (others.length === 0) return undefined;
  /** @type {Node} */
  let mult = others.length === 1 ? others[0] : { t: 'mul', args: others };
  if (negate) mult = { t: 'neg', arg: mult };
  return { mult, terms: /** @type {Extract<Node, { t: 'add' }>} */ (sums[0]).args, bare: false };
}
