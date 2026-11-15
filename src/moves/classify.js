// @ts-check
// Cast classification (DESIGN.md sections 3 I1 and 11 Domain policy):
// classify(move, equation, assumptions) -> 'legal' | 'risky' | 'illegal'.
//
// Order of the rules (the first that applies wins):
//   1. square / sqrt of both sides: risky (one-way: squaring can add
//      solutions; a square root of both sides can lose the negative one).
//   2. mul / div by an operand that contains ANY variable not declared
//      nonzero (rel 'nonzero' or 'pos'): risky. Whatever the roots are:
//      "/ x" on 6 + 4x = 2x^2 is risky although 0 is not a root.
//   3. mul / div by a variable-free operand worth exactly 0, or provably
//      with no real value (1/0, sqrt(-4)): illegal ("x 0"). A constant whose
//      value cannot be computed exactly (2^(1/3)) is risky ('unverifiable'),
//      not illegal: it does have a value.
//   4. mul / div by an operand whose variables are all declared nonzero but
//      which is not provably nonzero, i.e. not a single monomial over a
//      single monomial (l + w with l, w declared): risky. This is a small
//      superset of the spec text, which names only undeclared variables; a
//      sum of declared symbols can still be 0.
//   5. add / sub of a variable-free operand provably with no real value:
//      illegal (one that cannot be computed exactly: risky). Add / sub of an
//      operand with a pole not provably nonzero (1/x): risky (a domain change
//      can lose a root; this also does not depend on the roots). Not in the
//      spec text, which only names mul / div. A pole is provably nonzero when
//      it is a monomial in declared-nonzero symbols, or a one-variable
//      polynomial with no real zero the assumptions allow (x^2 + 1).
//   6. The L1 test, exact: with e1 = applyMove(m, e),
//        L1 - R1 = k x (powers of declared-nonzero symbols) x (L0 - R0),
//      k a nonzero rational, by equiv.js multiplier() (a polynomial identity
//      after cross-multiplying). Found -> legal. "Provably no multiplier"
//      cannot happen for a move that got this far (rule 8), so it means the
//      math core disagrees with itself: risky ('unverifiable'), never a
//      confident 'illegal' on a move that is in fact legal.
//   7. multiplier() undefined (sides outside the rational functions:
//      sqrt(2) x = 2): the exact root-set comparison in one variable. Same
//      root set -> legal; different -> risky ('unverifiable'), for the same
//      reason as in rule 6; cannot compare -> rule 8.
//   8. Still undecided: legal ('invertible'). Every move that gets past
//      rules 1-5 is provably reversible and keeps the domain: mul / div by
//      a constant with an exact nonzero value or by a monomial ratio in
//      declared-nonzero symbols; add / sub of a constant with an exact value
//      or of a rational function defined at every admissible real point.
//      L = R <=> L o = R o (o defined, o != 0) and <=> L + o = R + o (o
//      defined) hold for any sides, radicals included (x 2 on sqrt(x) = 2).
//      Rules 6-7 run first only so that a math-core disagreement surfaces as
//      'illegal' (and so that the L1 multiplier is reported).
// classifyDetail() also says which rule fired.
//
// rootSetChange(before, after, v): the one-way root-set comparison. Roots
// are exact Surds (Q(sqrt n)); a root of the cleared numerator that makes a
// denominator 0 is not a root.

import { vars, isEquation } from '../math/ast.js';
import { evaluateS } from '../math/evaluate.js';
import { toRat, polyToNode, pIsZero, polyVars } from '../math/poly.js';
import { multiplier } from '../math/equiv.js';
import { solve, checkRoot } from '../math/solve.js';
import { seq, sIsZero } from '../math/surd.js';
import { MathLimit } from '../math/rational.js';
import { applyMove } from './apply.js';
import { provablyUndefined, realZeros } from './real.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Move} Move */
/** @typedef {import('../../types.d.ts').MoveVerdict} MoveVerdict */
/** @typedef {import('../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').SolutionSet} SolutionSet */

/**
 * reason:
 *   'one-way'        square / sqrt
 *   'possibly-zero'  mul/div by an operand that might be 0 (rules 2 and 4); riskyExpr names it
 *   'zero'           mul/div by 0, or by / adding something with no value
 *   'L1'             the multiplier test found the multiplier (legal)
 *   'root-set'       the exact root-set comparison found the same roots (legal)
 *   'domain'         add / sub of an operand with a pole not provably nonzero (rule 5)
 *   'invertible'     rule 8: a reversible, domain-keeping move whose L1 / root-set test was undecided
 *   'unverifiable'   a constant operand whose value cannot be computed exactly (2^(1/3)), or
 *                    the L1 / root-set test contradicted rule 8 (a math-core bug); refused as risky
 * @typedef {{ verdict: MoveVerdict; reason: 'one-way' | 'possibly-zero' | 'zero' | 'L1' | 'root-set' | 'domain' | 'invertible' | 'unverifiable';
 *   riskyExpr?: Node; multiplier?: { k: import('../../types.d.ts').Q; powers: Record<string, number> } }} ClassifyDetail
 */

/** @param {Assumption[]} as @returns {Set<string>} */
function declaredNonzero(as) {
  return new Set((as ?? []).filter((a) => a.rel === 'nonzero' || a.rel === 'pos').map((a) => a.name));
}

/**
 * Is n provably nonzero: a single monomial over a single monomial, nonzero
 * coefficient, every variable declared nonzero? (Variable-free n is handled
 * before this is called.)
 * @param {Node} n @param {Set<string>} nz
 */
function provablyNonzero(n, nz) {
  if (!vars(n).every((name) => nz.has(name))) return false;
  const r = toRat(n);
  return !!r && r.num.terms.size === 1 && r.den.terms.size === 1;
}

/**
 * An add/sub operand with variables keeps the domain when it is a rational
 * function whose every pole is a monomial in declared-nonzero symbols, or a
 * one-variable polynomial with no admissible real zero (x^2 + 1).
 * @param {Node} n @param {Set<string>} nz @param {Assumption[]} as
 */
function polesProvablyNonzero(n, nz, as) {
  const r = toRat(n);
  if (!r) return false; // sqrt(x) and the like: possibly changes the domain
  return r.poles.every((p) => {
    if (p.terms.size === 1 && polyVars(p).every((name) => nz.has(name))) return true;
    const z = realZeros(polyToNode(p), as);
    return !!z && z.roots.length === 0;
  });
}

/**
 * @param {Move} m
 * @param {Equation} e
 * @param {Assumption[]} [as]
 * @returns {ClassifyDetail}
 */
export function classifyDetail(m, e, as = []) {
  try {
    return classifyInner(m, e, as);
  } catch (err) {
    if (err instanceof MathLimit || err instanceof RangeError) return { verdict: 'risky', reason: 'unverifiable' };
    throw err;
  }
}

/**
 * @param {Move} m @param {Equation} e @param {Assumption[]} as
 * @returns {ClassifyDetail}
 */
function classifyInner(m, e, as) {
  if (!isEquation(e)) throw new TypeError('classify: not an equation');
  if (m.op === 'square' || m.op === 'sqrt') return { verdict: 'risky', reason: 'one-way' };
  const o = m.operand;
  if (!o) throw new TypeError(`classify: op "${m.op}" needs an operand`);
  const nz = declaredNonzero(as);
  const ovars = vars(o);
  if (m.op === 'mul' || m.op === 'div') {
    if (ovars.some((name) => !nz.has(name))) return { verdict: 'risky', reason: 'possibly-zero', riskyExpr: o };
    if (ovars.length === 0) {
      const val = evaluateS(o, {});
      if (val ? sIsZero(val) : provablyUndefined(o)) return { verdict: 'illegal', reason: 'zero' };
      if (!val) return { verdict: 'risky', reason: 'unverifiable' };
    } else if (!provablyNonzero(o, nz)) {
      return { verdict: 'risky', reason: 'possibly-zero', riskyExpr: o };
    }
  } else if (ovars.length === 0) {
    if (!evaluateS(o, {})) {
      return provablyUndefined(o) ? { verdict: 'illegal', reason: 'zero' } : { verdict: 'risky', reason: 'unverifiable' };
    }
  } else if (!polesProvablyNonzero(o, nz, as)) {
    // Adding 1/x changes the domain: root 0 could be lost, whatever the roots are.
    return { verdict: 'risky', reason: 'domain', riskyExpr: o };
  }
  const e1 = applyMove(m, e);
  const mult = multiplier(e1, e, as);
  if (mult) {
    // L1 needs every symbol in the multiplier declared nonzero. Rules 2-4
    // already guarantee it for the operand; a symbol from elsewhere would be
    // a bug in multiplier(), so it is checked, not assumed.
    if (Object.keys(mult.powers).every((name) => nz.has(name))) return { verdict: 'legal', reason: 'L1', multiplier: mult };
    return { verdict: 'risky', reason: 'possibly-zero', riskyExpr: o };
  }
  if (mult === false) return { verdict: 'risky', reason: 'unverifiable' }; // a math-core disagreement (rule 6)
  // multiplier undefined: compare exact root sets in the one variable.
  const vs = vars(e);
  if (vs.length === 1) {
    const ch = rootSetChange(e, e1, vs[0]);
    if (ch) {
      const same = ch.lost.length === 0 && ch.added.length === 0;
      return same ? { verdict: 'legal', reason: 'root-set' } : { verdict: 'risky', reason: 'unverifiable' };
    }
  }
  // Rule 8 (see the header): rules 2-5 let only reversible, domain-keeping moves through.
  return { verdict: 'legal', reason: 'invertible' };
}

/**
 * legal / risky / illegal (DESIGN.md section 11 moves API).
 * @param {Move} m
 * @param {Equation} e
 * @param {Assumption[]} [as]
 * @returns {MoveVerdict}
 */
export function classify(m, e, as = []) {
  return classifyDetail(m, e, as).verdict;
}

// ---------------------------------------------------------------- root sets

/** @param {Equation} e @returns {Node} */
function difference(e) { return { t: 'add', args: [e.lhs, { t: 'neg', arg: e.rhs }] }; }

/**
 * The exact real solution set of e in v, taking the domain into account:
 * the difference L - R is cleared to num/den, num = 0 is solved by solve.js,
 * and a root that makes any denominator (pole) 0 is dropped. Every kept root
 * is re-checked by exact substitution into e itself. undefined when this
 * cannot be done exactly (degree > 2, another variable, "all reals except a
 * pole", a substitution that cannot be evaluated).
 * @param {Equation} e
 * @param {string} v
 * @returns {SolutionSet | undefined}
 */
export function trueSolutions(e, v) {
  try {
    const r = toRat(difference(e));
    /** @type {SolutionSet | undefined} */
    let base;
    /** @type {Node[]} */
    let poles = [];
    if (r) {
      poles = r.poles.map((p) => polyToNode(p));
      if (pIsZero(r.num)) return poles.length === 0 ? { kind: 'all' } : undefined;
      base = solve({ t: 'eq', lhs: polyToNode(r.num), rhs: { t: 'num', q: { n: 0n, d: 1n } } }, v);
    } else {
      base = solve(e, v);
    }
    if (!base) return undefined;
    if (base.kind === 'all') return poles.length === 0 ? base : undefined;
    if (base.kind === 'none') return base;
    /** @type {Surd[]} */
    const roots = [];
    for (const root of base.roots) {
      const atPole = poles.some((p) => {
        const val = evaluateS(p, { [v]: root });
        return val !== undefined && sIsZero(val);
      });
      if (atPole) continue;
      if (checkRoot(e, v, root) !== true) return undefined;
      roots.push(root);
    }
    return roots.length === 0 ? { kind: 'none' } : { kind: 'finite', roots };
  } catch (err) {
    if (err instanceof MathLimit || err instanceof RangeError) return undefined;
    throw err;
  }
}

/**
 * The one-way root-set comparison: which roots of `before` are not roots of
 * `after` (lost) and which roots of `after` are new (added). All reals on
 * both sides is no change; all reals on exactly one side cannot be listed
 * as roots and is undefined. undefined = cannot compare exactly.
 * @param {Equation} before
 * @param {Equation} after
 * @param {string} v
 * @returns {{ lost: Surd[]; added: Surd[]; before: SolutionSet; after: SolutionSet } | undefined}
 */
export function rootSetChange(before, after, v) {
  const a = trueSolutions(before, v);
  const b = trueSolutions(after, v);
  if (!a || !b) return undefined;
  if (a.kind === 'all' || b.kind === 'all') {
    if (a.kind === b.kind) return { lost: [], added: [], before: a, after: b };
    return undefined; // "all but finitely many" cannot be listed as roots
  }
  const ra = a.kind === 'finite' ? a.roots : [];
  const rb = b.kind === 'finite' ? b.roots : [];
  return {
    lost: ra.filter((x) => !rb.some((y) => seq(x, y))),
    added: rb.filter((x) => !ra.some((y) => seq(x, y))),
    before: a,
    after: b,
  };
}

