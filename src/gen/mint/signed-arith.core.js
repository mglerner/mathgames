// @ts-check
// signed-arith (skill 6, DESIGN.md section 4): adding and subtracting signed
// numbers (integers, then fractions). Subtracting is adding the opposite,
// and the reason is a zero-pair (section 7): a - c = a + ((-c) + c) - c,
// and the "+ c - c" vanishes, leaving a + (-c). Built on the recipe in
// ../common.js, after identity-moves.core.js (its zero-pair Why).
//
// Documented seed (pinned by test/gen/signed-arith.test.js):
//   EXAMPLE_SEED at d2: 5 - (-3) = 8.
//
// Difficulty (section 4 gives none per skill; my reading, reported):
//   d1  two integers, sizes 2..12, at least one minus sign in play
//       (-7 + 4, 3 - 9, 5 + (-8)); no subtracting a negative yet.
//   d2  two integers, sizes 2..20: subtracting a negative (5 - (-3),
//       -6 - (-2)) or -a - b.
//   d3  three integers, sizes 2..15, with at least one "- (-c)".
//   d4  two signed fractions with unlike denominators 2..6 (common
//       denominator <= 12), at least one negative: -3/4 - (-1/6).
// Not covered here: multiplying and dividing signed numbers (the sign rules
// for products and quotients). See the report.
// Never: a result of 0 or 1; a result that equals the product of the two
// numbers (the "2 + 2 = 2 x 2" coincidence).
//
// Interactions:
//   predict   "Evaluate", typed; finished = one number (unreduced accepted).
//   strike    "Evaluate", typed; finished = one number in lowest terms.
//   twin      two pools, drawn per seed:
//             rewrite (about 1 in 5 of the two-number items joined by "-"):
//               a - c against a sum.
//               Same: a + (-c), or (-c) + a. Different: a + c (the sign of c
//               kept), or c + (-a) (the subtraction turned around). Only
//               the signs tell these apart, so for a student who has the
//               rule the written signs settle the pair: that IS the skill
//               (reported).
//             value: the expression against one number. Same: its value.
//               Different: the opposite of its value (the sign slip of
//               3 - 9 = 6; not when both amounts have the same sign, where
//               the sign is plain), the value with one "- (-c)" read as
//               "- c", or a slip that keeps the true sign (like signs: sizes
//               subtracted, -5 - 3 = -2; unlike signs: sizes added).
//               A Different number of the other sign than the true value is
//               never offered when every amount has the same sign (the sign
//               is plain from the look), and elsewhere on 1 Different item
//               in 4 only; with the rewrite pool at 1 in 5 this keeps a shape
//               table (written shape of both forms) under 70% (review
//               finding 2).
//             No existing mal-rule produces these wrong partners (NEEDS FROM
//             OTHERS in the report); "same" on them is unclassified. The
//             Same follow-up is the common value: the zero-pair is part of
//             the WHY of the rule, but neither form is the other plus a
//             zero-pair, so no single form of 0 "joins" them (section 3 I5).
//             The Different follow-up is both values.
//   why       'hidden-0' (counting): 5 - (-3) written as
//             5 + (3 - 3) - (-3) (or 5 - (-3) + (3 - 3)): tap the form of 0.
//             Targets: the first number, the zero-pair, the zero-pair's first
//             number, the number being subtracted. Two integers, sizes 2..9,
//             following the difficulty (review finding 6): d1 subtracts a
//             positive (3 - 6 as 3 + (6 + (-6)) - 6: the pair holds a
//             second bracket, so it is not the only one), d2 subtracts a negative,
//             d3-d4 a negative from a negative. A fraction version does not
//             fit the display width. The chain shows the regrouped line
//             where the zero appears, 5 + 3 + (-3 - (-3)), with reasons.
// Every item carries the worked chain: the zero-pair line when it fits (two
// integers), the "adding the opposite" line, running totals, the result.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll,
  twinChoices, tapTargets, fitsDisplay, TWIN_SAME,
} from '../common.js';
import { num, frac, add, neg, group } from '../../math/ast.js';
import { q, gcd, add as qadd, mul as qmul, neg as qneg, qeq, ONE } from '../../math/rational.js';
import { constQ } from '../../math/evaluate.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { qNode } from '../../misc/kit.js';
import { malrules, ruleMatches } from '../../misc/diagnose.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {{ op: '+' | '-'; v: Q }} Term  the first term's op is '+' */
/** @typedef {{ terms: Term[]; value: Q }} Params */

const GEN = Object.freeze({ id: 'signed-arith.core', version: 1, skill: 'signed-arith' });

/** makeRng(EXAMPLE_SEED) at difficulty 2 gives 5 - (-3). Pinned by the test. */
export const EXAMPLE_SEED = 's604';

/** @param {Term} t @returns {Q} the signed amount the term adds */
const signed = (t) => (t.op === '+' ? t.v : qneg(t.v));
/** @param {Rng} r @param {number} lo @param {number} hi @returns {Q} */
const size = (r, lo, hi) => q(BigInt(r.int(lo, hi)));
/** @param {Rng} r @param {Q} x @returns {Q} */
const randSign = (r, x) => (r.bool() ? qneg(x) : x);

/**
 * @param {Rng} r @param {number} d
 * @param {boolean} [why] the Why draw: two integers 2..12, subtracting a negative
 * @returns {Params | undefined}
 */
export function draw(r, d, why = false) {
  /** @type {Term[]} */
  let terms;
  if (why) {
    // the Why follows the difficulty (review finding 6): d1 subtracts a
    // positive number (3 - 9; no subtracting a negative yet), d2 subtracts a
    // negative (5 - (-3)), d3-d4 subtract a negative from a negative
    // (-6 - (-2)); sizes 2..9 so the regrouped line fits the phone
    const a = size(r, 2, 9);
    const c = size(r, 2, 9);
    if (d === 1) terms = [{ op: '+', v: randSign(r, a) }, { op: '-', v: c }];
    else if (d === 2) terms = [{ op: '+', v: a }, { op: '-', v: qneg(c) }];
    else terms = [{ op: '+', v: qneg(a) }, { op: '-', v: qneg(c) }];
  } else if (d === 1) {
    terms = [{ op: '+', v: randSign(r, size(r, 2, 12)) }, { op: r.bool() ? '+' : '-', v: randSign(r, size(r, 2, 12)) }];
    if (terms[1].op === '-' && terms[1].v.n < 0n) return undefined; // subtracting a negative is d2
    const value = qadd(terms[0].v, signed(terms[1]));
    if (terms.every((t) => t.v.n > 0n) && value.n > 0n) return undefined; // nothing signed about it
  } else if (d === 2) {
    const a = size(r, 2, 20);
    const c = size(r, 2, 20);
    const pattern = r.int(0, 2);
    terms = pattern === 0 ? [{ op: '+', v: a }, { op: '-', v: qneg(c) }]
      : pattern === 1 ? [{ op: '+', v: qneg(a) }, { op: '-', v: qneg(c) }]
        : [{ op: '+', v: qneg(a) }, { op: '-', v: c }];
  } else if (d === 3) {
    terms = [{ op: '+', v: randSign(r, size(r, 2, 15)) }];
    for (let i = 0; i < 2; i++) terms.push({ op: r.bool() ? '+' : '-', v: randSign(r, size(r, 2, 15)) });
    if (!terms.some((t) => t.op === '-' && t.v.n < 0n)) return undefined;
  } else {
    /** @returns {Q | undefined} */
    const fr = () => {
      const b = r.int(2, 6);
      const a = r.int(1, b - 1);
      return gcd(BigInt(a), BigInt(b)) === 1n ? q(BigInt(a), BigInt(b)) : undefined;
    };
    const x = fr();
    const y = fr();
    if (!x || !y || x.d === y.d) return undefined;
    const L = (x.d / gcd(x.d, y.d)) * y.d;
    if (L > 12n) return undefined;
    terms = [{ op: '+', v: randSign(r, x) }, { op: r.bool() ? '+' : '-', v: randSign(r, y) }];
    if (terms.every((t) => t.v.n > 0n)) return undefined;
  }
  const value = terms.reduce((acc, t) => qadd(acc, signed(t)), q(0n));
  if (value.n === 0n || qeq(value, ONE)) return undefined;
  if (terms.length === 2 && qeq(value, qmul(terms[0].v, terms[1].v))) return undefined; // "2 + 2 = 2 x 2"
  return { terms, value };
}

/** The size of a number as a node: 5, or 3/4. @param {Q} x @returns {Node} */
function mag(x) { const a = x.n < 0n ? -x.n : x.n; return x.d === 1n ? num(a) : frac(num(a), num(x.d)); }
/** A number standing first: -5 or 5. @param {Q} x @returns {Node} */
function lead(x) { return x.n < 0n ? neg(mag(x)) : mag(x); }

/**
 * The expression for a list of terms: "+ 5", "+ (-5)", "- 5", "- (-5)".
 * @param {Term[]} terms @returns {Node}
 */
function expr(terms) {
  return add(...terms.map((t, i) => {
    if (i === 0) return lead(t.op === '+' ? t.v : qneg(t.v));
    const inner = t.v.n < 0n ? group(neg(mag(t.v))) : mag(t.v);
    return t.op === '+' ? inner : neg(inner);
  }));
}

/** Every subtraction rewritten as adding the opposite. @param {Term[]} terms @returns {Term[]} */
function addOpposite(terms) { return terms.map((t) => ({ op: '+', v: signed(t) })); }

/** The zero-pair (-c) + c, written "3 - 3" for c = -3 and "-8 + 8" for c = 8. @param {Q} c @returns {Node} */
function zeroPair(c) {
  return c.n < 0n ? add(mag(c), neg(mag(c))) : add(neg(mag(c)), mag(c));
}

/** The common-denominator line of a fraction sum: -9/12 + 2/12. @param {Term[]} plus all '+' @returns {Node | undefined} */
function overL(plus) {
  if (plus.every((t) => t.v.d === 1n)) return undefined;
  const L = plus.reduce((acc, t) => (acc / gcd(acc, t.v.d)) * t.v.d, 1n);
  return expr(plus.map((t) => ({ op: '+', v: { n: t.v.n * (L / t.v.d), d: L } })));
}

/** The worked chain. @param {Params} P @returns {Step[]} */
function chain(P) {
  const { terms } = P;
  /** @type {Node[]} */
  const lines = [expr(terms)];
  const plus = addOpposite(terms);
  if (terms.length === 2 && terms[1].op === '-') {
    const [a, c] = [terms[0].v, terms[1].v];
    const zp = add(lead(a), group(zeroPair(c)), neg(c.n < 0n ? group(neg(mag(c))) : mag(c)));
    if (fitsDisplay(zp)) lines.push(zp);
  }
  if (terms.some((t) => t.op === '-')) lines.push(expr(plus));
  const L = overL(plus);
  if (L) lines.push(L);
  if (terms.length === 3) lines.push(expr([{ op: '+', v: qadd(signed(terms[0]), signed(terms[1])) }, plus[2]]));
  const v = qNode(P.value);
  if (print(v) !== print(lines[lines.length - 1])) lines.push(v);
  return lines.map((line) => ({ line, legal: true }));
}

/**
 * Width estimate for fitsAll: 15px a character plus 24 (common.js uses 16;
 * the 20-character regrouped Why line "-3 + 6 + (-6 - (-6))" needs 15). The
 * harness re-checks every tree with render/mathdom.js.
 * @param {Node | import('../../../types.d.ts').Equation} x
 */
const narrow = (x) => 15 * print(x).length + 24;

/** @param {Problem} p @param {boolean} equivalent @returns {string | undefined | null} null = reject */
function twinTag(p, equivalent) {
  const hits = malrules.filter((r) => ruleMatches(r, p, TWIN_SAME)).map((r) => r.id);
  if (hits.length === 0) return undefined;
  if (equivalent || hits.length > 1) return null;
  return hits[0];
}

/**
 * @param {Rng} r @param {Params} P @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, P, opts, seed) {
  const { terms, value } = P;
  const math = expr(terms);
  const steps = chain(P);
  const visuals = ['numberline', 'zeropair'];
  const valueNode = qNode(value);
  const hasMinus = terms.some((t) => t.op === '-');

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Evaluate', math, ...(value.d !== 1n ? { goal: 'Type the result in lowest terms.' } : {}) },
        answer: { kind: 'expr', expected: valueNode, formPredicates: ['single-number', 'lowest-terms'], assumptions: [] },
        steps, visuals,
      });
    case 'predict':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Evaluate', math, ...(hasMinus ? { goal: 'Subtracting is adding the opposite.' } : {}) },
        answer: { kind: 'expr', expected: valueNode, formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      const rewrite = terms.length === 2 && terms[1].op === '-' && tr.bool(1 / 5);
      /** @type {Node[]} */
      const pool = [];
      if (rewrite) {
        const [a, c] = [terms[0].v, terms[1].v];
        if (want) pool.push(expr([{ op: '+', v: a }, { op: '+', v: qneg(c) }]), expr([{ op: '+', v: qneg(c) }, { op: '+', v: a }]));
        else pool.push(expr([{ op: '+', v: a }, { op: '+', v: c }]), expr([{ op: '+', v: c }, { op: '+', v: qneg(a) }]));
      } else if (want) {
        pool.push(valueNode);
      } else {
        // the sign slip (3 - 9 = 6), only where the sign is in question: two
        // like-signed amounts (-6 - 4) have the obvious sign, so the opposite
        // number would be a give-away
        const C2 = terms.length === 2 ? signed(terms[1]) : undefined;
        if (!C2 || (terms[0].v.n < 0n) !== (C2.n < 0n)) pool.push(qNode(qneg(value)));
        terms.forEach((t, i) => { // one "- (-c)" read as "- c"
          if (i === 0 || t.op !== '-' || t.v.n >= 0n) return;
          pool.push(qNode(terms.reduce((acc, u, j) => qadd(acc, j === i ? u.v : signed(u)), q(0n))));
        });
        if (terms.length === 2) {
          // a slip that keeps the sign of the true result, so the sign of the
          // partner never settles the pair: like signs, the sizes subtracted
          // (-5 - 3 = -2); unlike signs, the sizes added (-3 + 7 = 10)
          const A = terms[0].v;
          const C = signed(terms[1]);
          const abs = (/** @type {Q} */ x) => (x.n < 0n ? qneg(x) : x);
          const same = (A.n < 0n) === (C.n < 0n);
          const size = same ? abs(qadd(abs(A), qneg(abs(C)))) : qadd(abs(A), abs(C));
          pool.push(qNode((same ? A.n < 0n : value.n < 0n) ? qneg(size) : size));
        }
      }
      // when every amount has the same sign, the sign of the result is plain
      // from the look of the item: a Different number of the other sign
      // would be a give-away (review finding 2: "(5 - (-3)) vs -N" was
      // always Different), so it is not offered there
      const amounts = terms.map(signed);
      const plain = amounts.every((x) => (x.n < 0n) === (amounts[0].n < 0n));
      // and where the sign is in question, a Different partner of the other
      // sign is offered on 1 Different item in 4 only, so the partner's sign
      // against the item's look does not settle the pair either
      const slipOk = tr.bool(1 / 4);
      const usable = pool.filter((t) => {
        const tv = constQ(t);
        if (tv === undefined || (!want && qeq(tv, value)) || qeq(tv, ONE) || tv.n === 0n) return false;
        return want || rewrite || (!plain && slipOk) || (tv.n < 0n) === (value.n < 0n);
      });
      if (usable.length === 0) return undefined;
      const twin = tr.pick(usable);
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const twinValue = /** @type {Q} */ (constQ(twin));
      const prompt = { verb: 'Same value?', math, twin };
      const base = makeProblem(GEN, seed, opts, {
        prompt,
        answer: want ? { kind: 'expr', expected: valueNode, formPredicates: ['single-number'], assumptions: [] }
          : { kind: 'tuple', expected: [valueNode, qNode(twinValue)], formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
      const tag = twinTag({ ...base, choices: twinChoices(prompt, want) }, want);
      if (tag === null) return undefined;
      return { ...base, choices: twinChoices(prompt, want, tag) };
    }
    case 'why': {
      // a - c (c of either sign): the zero-pair (-c) + c is written in, then
      // regrouped so the c - c that vanishes is on show (review finding 6)
      const [a, c] = [terms[0].v, terms[1].v];
      const pairFirst = r.fork('why').bool();
      const cTerm = c.n < 0n ? group(neg(mag(c))) : mag(c); // c as it follows a minus: (-3) or 9
      const sub = neg(cTerm);
      // subtracting a positive (d1): the pair is written c + (-c), so it is
      // not the only bracket on show (its (-c) is a second one, and a target)
      const pair = group(c.n > 0n ? add(mag(c), group(neg(mag(c)))) : zeroPair(c));
      const shown = pairFirst ? add(lead(a), pair, sub) : add(lead(a), sub, pair);
      const at = pairFirst ? 'e.1' : 'e.2';
      const inner = c.n > 0n ? `${at}.0.1` : `${at}.0.0`;
      const subAt = pairFirst ? 'e.2.0' : 'e.1.0';
      const opp = qneg(c);
      const oppTerm = opp.n < 0n ? group(neg(mag(opp))) : mag(opp); // -c as it follows a plus
      const sum = add(lead(a), oppTerm);
      // a + (-c) + (c - c): the second half of the pair meets the c being subtracted
      const regrouped = add(lead(a), oppTerm, group(add(lead(c), neg(cTerm))));
      /** @type {Step[]} */
      const whySteps = [
        { line: shown, legal: true },
        ...(fitsDisplay(regrouped, { estimate: narrow }) ? [{ line: regrouped, legal: true, reason: `Regroup: the ${print(c.n > 0n ? mag(c) : lead(c))} of the pair meets the ${print(sub)}.` }] : []),
        { line: sum, legal: true, reason: `${print(add(lead(c), neg(cTerm)))} is 0: a number minus itself.` },
        { line: valueNode, legal: true },
      ];
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-0',
        prompt: { verb: 'Tap the hidden 0', math: shown, goal: `${print(math)} = ${print(sum)}. Tap the form of 0 that shows why.` },
        choices: tapTargets(shown, ['e.0', at, inner, subAt].sort(), at),
        answer: { kind: 'expr', expected: num(0), formPredicates: [], assumptions: [] },
        steps: whySteps,
        visuals: ['zeropair', 'numberline'],
      });
    }
    default:
      return undefined;
  }
}

/**
 * One rejection-sampling try (exported for the rejection-rate measurement in
 * the report; the generator itself is the default export).
 * @param {Rng} r @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
export function attempt(r, opts, seed) {
  const P = draw(r.fork('params'), opts.difficulty, opts.interaction === 'why');
  if (!P) return undefined;
  const p = item(r, P, opts, seed);
  return p && separated(p).ok && fitsAll(p, { estimate: narrow }) ? p : undefined;
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['predict', 'strike', 'twin', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => attempt(r, opts, seed));
  },
});
