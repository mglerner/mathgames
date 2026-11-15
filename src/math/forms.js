// @ts-check
// Named form predicates: (x: Node | Equation) => boolean. They look at how an
// answer is WRITTEN, never at its value (value is equiv.js's job). A judge
// that finds the right value but a failing predicate says "same value, not
// finished". AnswerSpec.formPredicates holds names from this registry.
//
// Expression predicates applied to an Equation must hold on both sides.
// Equation predicates ('standard-form', 'isolated') are false on a bare Node.
// Display parentheses (group nodes) are ignored everywhere.
//
// Names:
//   lowest-terms               no fraction whose top and bottom share an INTEGER factor > 1;
//                              no negative or zero constant denominator. 4/1 passes, 0/5 fails.
//                              Integer content only: a common polynomial factor
//                              ((x+1)/(2x+2)) and a complex fraction ((1/2)/(1/3)) are
//                              NOT detected, so do not use it for rational-expression items.
//   no-radical-in-denominator  no root (or non-integer power) inside a denominator;
//                              a negative non-integer power (2^(-1/2)) counts as one
//   no-radical                 no root and no non-integer power anywhere
//   radical-simplified         every square root has a squarefree radicand > 1
//                              (sqrt(8), sqrt(4), sqrt(1), sqrt(1/2), sqrt(x^3) all fail).
//                              A power b^(1/2) is judged as sqrt(b); any other p/2 power
//                              (2^(3/2), x^(3/2), 2^(-1/2)) fails, since a whole factor or a
//                              denominator can be pulled out; a p/q power with q > 2 of a
//                              number fails when its value is exactly a rational or
//                              square-root number (8^(1/3), 4^(1/4)) and otherwise passes
//                              (cannot tell). Each radical is judged on its own:
//                              sqrt(2)^2 and sqrt(3)sqrt(3) pass.
//   expanded                   no sum left inside a product, a power base, a negation
//                              or a numerator
//   combined                   no two like terms in a sum (3 + 4, 2x + x, sqrt(3) + 2sqrt(3) fail)
//   descending-order           a sum of plain monomials in strictly descending degree
//   standard-form              equation; one side is the literal 0, the other is
//                              nonzero and in descending-order (either side may be the zero side)
//   single-number              one integer or one integer/integer fraction, optional minus
//   integer                    one integer, optional minus
//   integer-fraction           one integer/integer fraction, optional minus
//   isolated                   equation; one side is a lone variable that the other side lacks
//                              (ANY variable: A = lw passes. Use isolated:v to name the target.)
//   isolated:v                 (parametric) equation; one side is the lone variable v
//                              and the other side lacks v
//   denominator:N              (parametric) a fraction whose denominator is the integer N,
//                              optional minus in front (-6/8 passes denominator:8; 6/(-8)
//                              does not). On an Equation with a lone variable on one
//                              side (x = 3/4) only the other side is judged.
//   factored-gcf               a greatest-common-factor factoring: a nonzero integer or
//                              monomial factor (in either order) times ONE parenthesized
//                              sum whose written terms are integer-coefficient monomials
//                              that share no common integer factor > 1 and no common
//                              variable factor. One leading minus is allowed, also with
//                              no other factor: -(x + 2) (not -(-3)(x + 2)). 3(x + 2), -2x(x - 3) and
//                              x^2(x + 1) pass; 3x + 6, 3(2x + 4), x(x^2 + x),
//                              (x + 1)(x + 2), 3(x/2 + 1) and a bare (x + 2) fail. Like
//                              terms inside are combined before the test, so 3(x + x + 1)
//                              passes ('combined' is the predicate that rejects it). A
//                              sum that collapses to one term (3(x + x)) fails.
// There is no general "factored" (trinomial) predicate yet.
//
// Where a predicate cannot tell (a radicand too large to factor, a sum under a
// radical, numbers too large to compute with) it returns true: "not provably
// unfinished". No predicate throws on any tree.

import { gcd, isZero, bitLength, MathLimit } from './rational.js';
import { stripGroups, isEquation, some, vars } from './ast.js';
import { squarePart } from './surd.js';
import { constQ, constValue } from './evaluate.js';
import { toPoly, cmpMono, polyTerms } from './poly.js';
import { toRadicalNormalForm, radTerms } from './radical.js';
import { print } from './print.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').FormPredicate} FormPredicate */

/**
 * "Cannot tell" is true: a predicate that hits a size limit does not throw.
 * @param {FormPredicate} f
 * @returns {FormPredicate}
 */
function guard(f) {
  return (x) => {
    try {
      return f(x);
    } catch (err) {
      if (err instanceof MathLimit || err instanceof RangeError) return true;
      throw err;
    }
  };
}

/**
 * Lift a Node predicate: groups stripped; on an Equation both sides must pass.
 * @param {(n: Node) => boolean} f
 * @returns {FormPredicate}
 */
function onExpr(f) {
  return guard((x) => {
    if (isEquation(x)) return f(stripGroups(x.lhs)) && f(stripGroups(x.rhs));
    return f(stripGroups(/** @type {Node} */ (x)));
  });
}

/** @param {Node} n @returns {boolean} */
function isNonIntegerPower(n) {
  if (n.t !== 'pow' || vars(n.exp).length > 0) return false;
  const e = constQ(n.exp);
  return e !== undefined && e.d !== 1n;
}
/** @param {Node} n @returns {boolean} */
function isRadical(n) { return n.t === 'root' || isNonIntegerPower(n); }

/** @param {Node} n @returns {bigint | undefined} the integer value of a num node */
function intOf(n) { return n.t === 'num' && n.q.d === 1n ? n.q.n : undefined; }

/** Largest integer content computed, in bits; beyond it the content is "unknown". */
const MAX_CONTENT_BITS = 4096;

/**
 * Integer content: the largest integer that visibly divides n (1 when unknown).
 * @param {Node} n
 * @returns {bigint}
 */
function content(n) {
  switch (n.t) {
    case 'num': return n.q.d === 1n ? (n.q.n < 0n ? -n.q.n : n.q.n) : 1n;
    case 'neg': case 'group': return content(n.arg);
    case 'mul': {
      let acc = 1n;
      for (const c of n.args) {
        acc *= content(c);
        if (bitLength(acc) > MAX_CONTENT_BITS) return 1n;
      }
      return acc;
    }
    case 'add': return n.args.reduce((acc, c) => gcd(acc, content(c)), 0n);
    case 'pow': {
      const e = intOf(n.exp);
      const b = content(n.base);
      if (e === undefined || e < 0n || e > 64n) return 1n;
      // b ** e is never computed past the cap (a typed power tower would
      // otherwise take seconds and then overflow BigInt).
      return bitLength(b) * Number(e) <= MAX_CONTENT_BITS ? b ** e : 1n;
    }
    default: return 1n;
  }
}

/** @param {Node} n @returns {boolean} */
function lowestTerms(n) {
  return !some(n, (x) => {
    if (x.t !== 'frac') return false;
    if (vars(x.den).length === 0) {
      const d = constQ(x.den);
      if (d !== undefined && d.n <= 0n) return true; // zero or negative denominator
    }
    return gcd(content(x.num), content(x.den)) > 1n;
  });
}

/** @param {Node} n @param {boolean} inDen @returns {boolean} true if a radical sits in a denominator */
function radicalInDen(n, inDen) {
  if (inDen && isRadical(n)) return true;
  switch (n.t) {
    case 'num': case 'var': return false;
    case 'add': case 'mul': return n.args.some((c) => radicalInDen(c, inDen));
    case 'neg': case 'group': return radicalInDen(n.arg, inDen);
    case 'frac': return radicalInDen(n.num, inDen) || radicalInDen(n.den, true);
    case 'root': return radicalInDen(n.radicand, inDen);
    case 'pow': {
      const e = vars(n.exp).length === 0 ? constQ(n.exp) : undefined;
      // x^(-p/q) is 1/x^(p/q): a radical in a denominator, written as an exponent.
      if (e !== undefined && e.n < 0n && e.d !== 1n) return true;
      return radicalInDen(n.base, inDen || (e !== undefined && e.n < 0n));
    }
  }
}

/** @param {Node} radicand @returns {boolean} */
function squareRootSimplified(radicand) {
  if (vars(radicand).length === 0) {
    const c = constQ(radicand);
    if (c === undefined) return true; // irrational or undefined radicand: cannot tell
    if (c.d !== 1n || c.n <= 1n) return false;
    const sp = squarePart(c.n);
    return sp === undefined || sp.out === 1n;
  }
  const p = toPoly(radicand);
  if (!p || p.terms.size !== 1) return true; // a sum or a non-polynomial: cannot tell
  const [{ coef, mono }] = polyTerms(p);
  if (coef.d !== 1n || coef.n < 1n) return false;
  if (mono.some(([, e]) => e >= 2)) return false;
  const sp = squarePart(coef.n);
  return sp === undefined || sp.out === 1n;
}

/** @param {Node} n @returns {boolean} */
function radicalSimplified(n) {
  return !some(n, (x) => {
    if (x.t === 'root') return x.index === 2 && !squareRootSimplified(x.radicand);
    if (x.t === 'pow' && vars(x.exp).length === 0) {
      const e = constQ(x.exp);
      if (e === undefined || e.d === 1n) return false;
      // b^(1/2) is sqrt(b). Any other p/2 power is unfinished as a radical:
      // b^(3/2) = b sqrt(b), b^(-1/2) = 1/sqrt(b).
      if (e.d === 2n) return e.n !== 1n || !squareRootSimplified(x.base);
      // Higher roots: unfinished when the number is exactly a rational or a
      // square-root number (8^(1/3) = 2, 4^(1/4) = sqrt(2)); otherwise cannot tell.
      return vars(x.base).length === 0 && constValue(x) !== undefined;
    }
    return false;
  });
}

/** @param {Node} n @param {boolean} allowAdd @returns {boolean} */
function expandedAt(n, allowAdd) {
  switch (n.t) {
    case 'num': case 'var': return true;
    case 'group': return expandedAt(n.arg, allowAdd);
    case 'add': return allowAdd && n.args.every((c) => expandedAt(c, true));
    case 'neg': return expandedAt(n.arg, false);
    case 'mul': return n.args.every((c) => expandedAt(c, false));
    case 'frac': return expandedAt(n.num, false) && expandedAt(n.den, true);
    case 'pow': return expandedAt(n.base, false) && expandedAt(n.exp, true);
    case 'root': return expandedAt(n.radicand, true);
  }
}

/**
 * Top-level terms of a sum, looking through nested sums and negations.
 * @param {Node} n
 * @returns {Node[]}
 */
function termsOf(n) {
  if (n.t === 'group') return termsOf(n.arg);
  if (n.t === 'add') return n.args.flatMap(termsOf);
  if (n.t === 'neg') return termsOf(n.arg).map((t) => /** @type {Node} */ ({ t: 'neg', arg: t }));
  return [n];
}

/** @param {Node} n @returns {boolean} */
function combined(n) {
  const terms = termsOf(n);
  if (terms.length < 2) return true;
  const everyVarPos = vars(n).map((name) => /** @type {const} */ ({ name, rel: 'pos' }));
  /** @type {Set<string>} */
  const seen = new Set();
  for (const t of terms) {
    /** @type {string} */
    let key;
    const nf = toRadicalNormalForm(t, everyVarPos);
    const parts = nf ? radTerms(nf) : undefined;
    if (nf && parts && parts.length === 0) return false; // a term worth 0 is not combined
    if (parts && parts.length === 1 && parts[0].coef.terms.length === 1) {
      const mono = parts[0].mono.map(([nm, e]) => `${nm}^${e.n}/${e.d}`).join(' ');
      key = `like:${parts[0].coef.terms[0].rad}|${mono}`;
    } else {
      key = `other:${print(t.t === 'neg' ? t.arg : t)}`;
    }
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/** @param {Node} n @returns {string | undefined} the variable of a var or var^(positive integer) */
function varPowerName(n) {
  if (n.t === 'var') return n.name;
  if (n.t !== 'pow' || n.base.t !== 'var') return undefined;
  const e = intOf(n.exp);
  return e !== undefined && e >= 1n ? n.base.name : undefined;
}
/** @param {Node} n @returns {boolean} a number literal or integer/(positive integer) */
function isPlainCoef(n) {
  if (n.t === 'num') return true;
  if (n.t !== 'frac') return false;
  const a = intOf(n.num);
  const b = intOf(n.den);
  return a !== undefined && b !== undefined && b > 0n;
}

/**
 * A plainly written monomial: optional minus, optional numeric coefficient
 * first, then distinct variables each to a positive integer power; or such a
 * thing over a positive integer (x^2/2).
 * @param {Node} n
 * @returns {boolean}
 */
function isMonomialLiteral(n) {
  if (n.t === 'neg') n = n.arg;
  if (n.t === 'frac' && !isPlainCoef(n)) {
    const d = intOf(n.den);
    if (d === undefined || d <= 0n) return false;
    n = n.num;
  }
  const factors = n.t === 'mul' ? n.args : [n];
  /** @type {Set<string>} */
  const seen = new Set();
  for (let i = 0; i < factors.length; i++) {
    const f = factors[i];
    if (i === 0 && isPlainCoef(f)) continue;
    const name = varPowerName(f);
    if (name === undefined || seen.has(name)) return false;
    seen.add(name);
  }
  return factors.length > 0;
}

/** @param {Node} n @returns {boolean} */
function descendingOrder(n) {
  const terms = termsOf(n);
  /** @type {string | undefined} */
  let prev;
  for (const t of terms) {
    if (!isMonomialLiteral(t)) return false;
    const p = toPoly(t);
    if (!p || p.terms.size !== 1) return false; // also rejects a zero term
    const key = polyTerms(p)[0].key;
    if (prev !== undefined && cmpMono(prev, key) <= 0) return false;
    prev = key;
  }
  return terms.length > 0;
}

/** @param {Node} n @returns {boolean} */
function isIntegerLiteral(n) {
  if (n.t === 'neg') n = n.arg;
  return n.t === 'num' && n.q.d === 1n;
}
/** @param {Node} n @returns {boolean} */
function isIntegerFraction(n) {
  if (n.t === 'neg') n = n.arg;
  if (n.t === 'num') return n.q.d !== 1n; // a generator-built rational literal
  if (n.t !== 'frac') return false;
  const a = n.num.t === 'neg' ? n.num.arg : n.num;
  const d = intOf(n.den);
  return intOf(a) !== undefined && d !== undefined && d !== 0n;
}

/** @param {Node} n @returns {boolean} */
function isLiteralZero(n) { return n.t === 'num' && isZero(n.q); }

/**
 * A sum whose written terms are monomials with integer coefficients (after
 * combining like terms) sharing no integer factor > 1 and no variable.
 * @param {Node} s an 'add' node, groups already stripped
 * @returns {boolean}
 */
function primitiveSum(s) {
  if (!termsOf(s).every(isMonomialLiteral)) return false;
  const p = toPoly(s);
  if (!p) return false;
  const ts = polyTerms(p);
  if (ts.length < 2) return false;
  let g = 0n;
  for (const t of ts) {
    if (t.coef.d !== 1n) return false;
    g = gcd(g, t.coef.n);
  }
  if (g > 1n) return false;
  for (const [name] of ts[0].mono) {
    if (ts.every((t) => t.mono.some(([nm, e]) => nm === name && e > 0))) return false;
  }
  return true;
}

/** @param {Node} n @returns {boolean} written with a leading minus (-x, -3x, a negative literal first) */
function writtenNegative(n) {
  if (n.t === 'neg') return true;
  const first = n.t === 'mul' ? n.args[0] : n.t === 'frac' ? n.num : n;
  return first.t === 'neg' || (first.t === 'num' && first.q.n < 0n);
}

/** @param {Node[]} args @returns {Node[]} nested products flattened */
function flatFactors(args) { return args.flatMap((a) => (a.t === 'mul' ? flatFactors(a.args) : [a])); }

/** @param {Node} n groups already stripped @returns {boolean} */
function factoredGcf(n) {
  const negated = n.t === 'neg';
  if (n.t === 'neg') n = n.arg;
  if (n.t === 'add') return negated && primitiveSum(n);
  if (n.t !== 'mul') return false;
  const flat = flatFactors(n.args);
  const sums = flat.filter((a) => a.t === 'add');
  if (sums.length !== 1) return false;
  const rest = flat.filter((a) => a.t !== 'add');
  /** @type {Node} */
  const factor = rest.length === 1 ? rest[0] : { t: 'mul', args: rest };
  if (!isMonomialLiteral(factor)) return false;
  if (negated && writtenNegative(factor)) return false; // -(-3)(x + 2): one minus only
  const fp = toPoly(factor);
  if (!fp || fp.terms.size !== 1) return false; // a zero factor
  return primitiveSum(sums[0]);
}

/** @type {FormPredicate} */
function standardForm(x) {
  if (!isEquation(x)) return false;
  const l = stripGroups(x.lhs);
  const r = stripGroups(x.rhs);
  // The nonzero side must be a polynomial in some variable: 6 = 0 is not standard form.
  if (isLiteralZero(r)) return !isLiteralZero(l) && vars(l).length > 0 && descendingOrder(l);
  if (isLiteralZero(l)) return vars(r).length > 0 && descendingOrder(r);
  return false;
}

/**
 * @param {Node | Equation} x
 * @param {string} [target] the variable that must be isolated (any, when omitted)
 * @returns {boolean}
 */
function isolated(x, target) {
  if (!isEquation(x)) return false;
  const l = stripGroups(x.lhs);
  const r = stripGroups(x.rhs);
  /** @param {Node} a @param {Node} b */
  const alone = (a, b) => a.t === 'var' && (target === undefined || a.name === target) && !vars(b).includes(a.name);
  return alone(l, r) || alone(r, l);
}

/**
 * @param {Node} n groups already stripped
 * @param {bigint} want
 * @returns {boolean} n is a fraction over the integer `want`, optional minus in front
 */
function hasDenominator(n, want) {
  if (n.t === 'neg') n = n.arg;
  if (n.t === 'num') return n.q.d !== 1n && n.q.d === want; // a generator-built rational literal
  return n.t === 'frac' && intOf(n.den) === want;
}

/**
 * The static registry, keyed by name. Use getForm for parametric names.
 * @type {Readonly<Record<string, FormPredicate>>}
 */
export const forms = Object.freeze({
  'lowest-terms': onExpr(lowestTerms),
  'no-radical-in-denominator': onExpr((n) => !radicalInDen(n, false)),
  'no-radical': onExpr((n) => !some(n, isRadical)),
  'radical-simplified': onExpr(radicalSimplified),
  'expanded': onExpr((n) => expandedAt(n, true)),
  'combined': onExpr(combined),
  'descending-order': onExpr(descendingOrder),
  'standard-form': guard(standardForm),
  'single-number': onExpr((n) => isIntegerLiteral(n) || isIntegerFraction(n)),
  'integer': onExpr(isIntegerLiteral),
  'integer-fraction': onExpr(isIntegerFraction),
  'isolated': guard((x) => isolated(x)),
  'factored-gcf': onExpr(factoredGcf),
});

/** Static predicate names. */
export const formNames = Object.freeze(Object.keys(forms));

/**
 * Look a predicate up by name, including the parametric "denominator:N" and
 * "isolated:v".
 * Returns undefined for an unknown name.
 * @param {string} name
 * @returns {FormPredicate | undefined}
 */
export function getForm(name) {
  if (Object.prototype.hasOwnProperty.call(forms, name)) return forms[name];
  const m = /^denominator:(\d+)$/.exec(name);
  if (m) {
    const want = BigInt(m[1]);
    return guard((x) => {
      if (!isEquation(x)) return hasDenominator(stripGroups(/** @type {Node} */ (x)), want);
      const l = stripGroups(x.lhs);
      const r = stripGroups(x.rhs);
      if (l.t === 'var') return hasDenominator(r, want);
      if (r.t === 'var') return hasDenominator(l, want);
      return hasDenominator(l, want) && hasDenominator(r, want);
    });
  }
  const iso = /^isolated:([A-Za-z])$/.exec(name);
  if (iso) return guard((x) => isolated(x, iso[1]));
  return undefined;
}

/** @param {string} name @returns {boolean} */
export function hasForm(name) { return getForm(name) !== undefined; }

/**
 * The names (in the order given) whose predicate fails on x. An unknown name
 * throws: that is a generator bug, not something a student can cause.
 * @param {string[]} names
 * @param {Node | Equation} x
 * @returns {string[]}
 */
export function failedForms(names, x) {
  return names.filter((name) => {
    const f = getForm(name);
    if (!f) throw new RangeError(`forms: unknown predicate "${name}"`);
    return !f(x);
  });
}
