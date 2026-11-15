// @ts-check
// equivalent-expressions (skill 8, DESIGN.md section 4): two forms are
// equivalent when they agree for EVERY x; one witness disproves it. Built on
// the recipe in ../common.js, after src/gen/mint/frac-times-whole.core.js.
//
// Families of forms (each has an equivalent partner AND a mal-rule partner,
// so no family is always "Same" or always "Different"):
//   product   A(b x + c)    vs its expansion   | the Half-Hand, the Sign-Thief
//   square    (x + c)^2     vs x^2 + 2c x + c^2 | the Spreader (x^2 + c^2)
//   quotient  (x + b c)/b   vs x/b + c          | the Crosser (x + c)
//
// Documented seeds (pinned by test/gen/equivalent-expressions.test.js):
//   TWIN_SEED at d1: the section 3 pair 2(x + 3) vs 2x + 6 (Same).
//   SPREADER_SEED at d3: the section 3 pair (x + 3)^2 vs x^2 + 9 (Different).
//
// Difficulty (my reading, reported):
//   d1  product, A in 2..9, (x +- c), c in 1..9.
//   d2  product, A in -9..-2 or 2..9, (b x +- c), b in 1..5.
//   d3  product as d2, or square, c in -9..-1 or 1..9.
//   d4  square, or quotient (b in 2..5, c in -6..-1 or 1..6).
//
// Interactions:
//   twin      I5. Equivalent (about half): the family's partner. Different:
//             a mal-rule output ("same" tagged with that rule), or a near
//             miss WRITTEN LIKE the equivalent partner ("same" untagged: no
//             rule models it): (x + c)^2 vs x^2 + c x + c^2 (not doubled),
//             (x + b c)/b vs x/b + b c (constant not divided), and for a
//             negative A, A(b x + c) vs A b x - c (sign right, size wrong).
//             Without the near misses the look of the second form settles
//             the answer (x^2 + 9 is always Different). A mal-rule twin whose
//             look gives it away is drawn on about 1 Different in 5 (square,
//             quotient) or 1 in 2 (negative product). The typed follow-up
//             key is the first form's value at the probe named in the goal
//             (an x the pair disagrees at, for a different pair).
//   predict   "Lantern" (variant lantern): the value of the form at a named
//             probe x (section 7: the Lantern puts a number into a form).
//             probes[0] is that x, so a mal-rule's rewritten form is
//             diagnosed by its VALUE there (kit.js lift).
//   strike    "Fill the blank" (variant fill-blank) so the two sides agree
//             for every x: A(x + c) = A x + [ ]; A(b x + c) = [ ]x + A c or
//             A b x + [ ] (the constant, where the Half-Hand and the
//             Sign-Thief go wrong, on about 6 in 10);
//             (x + c)^2 = x^2 + [ ]x + c^2; (x + c)^2 = x^2 + 2c x + [ ];
//             (x + b c)/b = x/b + [ ].
//   why       'hidden-0': a zero-pair (c - c) added before or after the
//             item's own first form, "3(x + 4) + (5 - 5)": two bracketed
//             parts, one of them worth 0. (The earlier 'hidden-1' "1x + b x"
//             was a tap on the only digit 1 and is gone.)

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll,
  twinChoices, tapTargets, probeEnvs, blank, V_FILL_BLANK, V_LANTERN, PROBE_VALUES,
} from '../common.js';
import { num, mul, frac, add, neg, group, pow, v, eq } from '../../math/ast.js';
import { q } from '../../math/rational.js';
import { evaluate } from '../../math/evaluate.js';
import { toQ } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { qNode, int, simp, TWIN_SAME } from '../../misc/kit.js';
import { diagnose } from '../../misc/diagnose.js';
import halfHand from '../../misc/malrules/partial-distribution.js';
import signThief from '../../misc/malrules/neg-distribution.js';
import spreader from '../../misc/malrules/freshmans-dream-square.js';
import crosser from '../../misc/malrules/cancel-across-sum.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/**
 * @typedef {{ fam: 'product'; a: bigint; b: bigint; c: bigint }
 *   | { fam: 'square'; c: bigint }
 *   | { fam: 'quotient'; b: bigint; c: bigint }} Params
 */

const GEN = Object.freeze({ id: 'equivalent-expressions.core', version: 1, skill: 'equivalent-expressions' });

/** Seeds of the documented examples (see the header). */
export const TWIN_SEED = 's106';
export const SPREADER_SEED = 's55';

const X = v('x');
const RULES = [halfHand, signThief, spreader, crosser];
const VISUALS = ['numberline'];

/** @param {Rng} r @param {number} lo @param {number} hi @returns {bigint} a nonzero integer in -hi..-lo or lo..hi */
function signed(r, lo, hi) { return BigInt(r.int(lo, hi) * (r.bool() ? 1 : -1)); }

/** @param {Rng} r @param {number} d @returns {Params} */
function draw(r, d) {
  const fam = d <= 2 ? 'product' : d === 3 ? r.pick(['product', 'square']) : r.pick(['square', 'quotient']);
  if (fam === 'product') {
    if (d === 1) return { fam, a: BigInt(r.int(2, 9)), b: 1n, c: signed(r, 1, 9) };
    return { fam, a: signed(r, 2, 9), b: BigInt(r.int(1, 5)), c: signed(r, 1, 9) };
  }
  if (fam === 'square') return { fam, c: signed(r, 1, 9) };
  return { fam: 'quotient', b: BigInt(r.int(2, 5)), c: signed(r, 1, 6) };
}

/** b x (x when b is 1). @param {bigint} b @returns {Node} */
function bx(b) { return b === 1n ? X : mul(num(b), X); }

/** The family's first form, in the parser's shape. @param {Params} d @returns {Node} */
function form(d) {
  if (d.fam === 'product') {
    const pr = mul(num(d.a < 0n ? -d.a : d.a), group(add(bx(d.b), int(d.c))));
    return d.a < 0n ? neg(pr) : pr;
  }
  if (d.fam === 'square') return pow(group(add(X, int(d.c))), num(2));
  return frac(add(X, int(d.b * d.c)), num(d.b));
}

/** The family's equivalent partner. @param {Params} d @param {Node} math @returns {Node} */
function partner(d, math) {
  if (d.fam === 'quotient') return add(frac(X, num(d.b)), int(d.c));
  return simp(math);
}

/**
 * A Different partner written like the equivalent one (see the header), or
 * undefined when the family has none here.
 * @param {Params} d @returns {Node | undefined}
 */
function nearMiss(d) {
  if (d.fam === 'product') return d.a < 0n ? simp(add(mul(int(d.a * d.b), X), int(-d.c))) : undefined;
  if (d.fam === 'square') return d.c === 1n || d.c === -1n ? undefined : simp(add(pow(X, num(2)), mul(int(d.c), X), int(d.c * d.c)));
  return add(frac(X, num(d.b)), int(d.b * d.c));
}

/** The exact rational value of n at x = p. @param {Node} n @param {number} p */
function valueAt(n, p) {
  const s = evaluate(n, { x: q(p) });
  return s ? toQ(s) : undefined;
}

/** @param {Q} a @param {Q} b */
const qsame = (a, b) => a.n === b.n && a.d === b.d;

/**
 * The fill-the-blank line and its key, for strike.
 * @param {Rng} r @param {Params} d @param {Node} math @returns {{ rhs: Node; key: bigint }}
 */
function fill(r, d, math) {
  if (d.fam === 'product') {
    if (d.b === 1n && d.a > 0n) return { rhs: add(mul(num(d.a), X), blank()), key: d.a * d.c };
    // the constant is the term the Half-Hand and the Sign-Thief get wrong: blank it more often than not
    if (r.bool(0.6)) return { rhs: add(simp(mul(int(d.a * d.b), X)), blank()), key: d.a * d.c };
    return { rhs: add(mul(blank(), X), int(d.a * d.c)), key: d.a * d.b };
  }
  if (d.fam === 'square') {
    if (r.bool()) return { rhs: add(pow(X, num(2)), mul(blank(), X), num(d.c * d.c)), key: 2n * d.c };
    return { rhs: add(pow(X, num(2)), simp(mul(int(2n * d.c), X)), blank()), key: d.c * d.c };
  }
  return { rhs: add(frac(X, num(d.b)), blank()), key: d.c };
}

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, d, opts, seed) {
  const math = form(d);
  const twinSame = partner(d, math);
  /** @type {Step[]} */
  const steps = [math, twinSame].map((line) => ({ line, legal: true }));
  const env = { variableKeys: ['x'], probes: probeEnvs(['x']) };

  switch (opts.interaction) {
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      const p0 = tr.pick(PROBE_VALUES);
      /** @type {Node} */ let twin;
      /** @type {string | undefined} */ let tag;
      if (want) {
        twin = twinSame;
      } else {
        const near = nearMiss(d);
        if (near && !tr.fork('near').bool(d.fam === 'product' ? 0.5 : 0.2)) {
          twin = near;
        } else {
          const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Same value?', math }, answer: { kind: 'expr', expected: twinSame, formPredicates: [], assumptions: [] } });
          const options = RULES.flatMap((rule) => rule.applyAll(base).map((out) => ({ rule, out })));
          if (options.length === 0) return undefined;
          const pick = tr.pick(options);
          twin = /** @type {Node} */ (pick.out);
          tag = pick.rule.id;
        }
      }
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const at = valueAt(math, p0);
      const other = valueAt(twin, p0);
      if (!at || !other || (at.d === 1n && (at.n === 0n || at.n === 1n))) return undefined; // a Lantern key of 0 or 1 is too guessable
      if (!want && qsame(at, other)) return undefined; // the named probe must split a different pair
      const prompt = { verb: 'Same value?', math, twin, goal: `Find the first form's value at x = ${p0}.` };
      const p = makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, tag),
        answer: { kind: 'expr', expected: qNode(at), formPredicates: ['single-number'], assumptions: [] },
        steps, visuals: VISUALS, ...env,
      });
      // an untagged near miss must be one no rule models (else its tag would be missing)
      if (!want && tag === undefined && diagnose(p, TWIN_SAME).misconceptions.length > 0) return undefined;
      return p;
    }
    case 'predict': {
      const p0 = r.fork('probe').pick(PROBE_VALUES);
      const at = valueAt(math, p0);
      if (!at || (at.d === 1n && (at.n === 0n || at.n === 1n))) return undefined; // a Lantern key of 0 or 1 is too guessable
      return makeProblem(GEN, seed, opts, {
        variant: V_LANTERN,
        prompt: { verb: 'Lantern', math, goal: `Find its value at x = ${p0}.` },
        answer: { kind: 'expr', expected: qNode(at), formPredicates: ['single-number'], assumptions: [] },
        steps, visuals: VISUALS, ...env,
        // the named x first: a rule's rewritten form is diagnosed by its value there
        probes: [{ x: q(p0) }, ...env.probes.filter((e) => !(e.x.n === BigInt(p0) && e.x.d === 1n))],
      });
    }
    case 'strike': {
      const { rhs, key } = fill(r.fork('fill'), d, math);
      if (key === 0n || key === 1n) return undefined;
      return makeProblem(GEN, seed, opts, {
        variant: V_FILL_BLANK,
        prompt: { verb: 'Fill the blank', math: eq(math, rhs), goal: 'Make the two sides equal for every x.' },
        answer: { kind: 'expr', expected: int(key), formPredicates: ['single-number'], assumptions: [] },
        steps, visuals: VISUALS, ...env,
      });
    }
    case 'why': {
      const wr = r.fork('why');
      const c = BigInt(wr.int(2, 9));
      const zp = group(add(num(c), neg(num(c))));
      const zeroFirst = wr.bool();
      const shown = zeroFirst ? add(zp, math) : add(math, zp);
      const zi = zeroFirst ? 0 : 1;
      const fi = 1 - zi;
      // the item's own bracketed part: the sum inside the product or the square, or the whole quotient
      const own = d.fam === 'product' ? (d.a < 0n ? `e.${fi}.0.1` : `e.${fi}.1`) : d.fam === 'square' ? `e.${fi}.0` : `e.${fi}`;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-0',
        prompt: { verb: 'Tap the hidden 0', math: shown, goal: 'Same value, new form. Tap the 0 that was added.' },
        choices: tapTargets(shown, [`e.${zi}`, `e.${zi}.0.0`, own, `e.${fi}`].filter((x, i, a) => a.indexOf(x) === i).sort(), `e.${zi}`),
        answer: { kind: 'expr', expected: num(0), formPredicates: [], assumptions: [] },
        steps: [math, shown].map((line) => ({ line, legal: true })),
        visuals: ['zeropair', ...VISUALS], ...env,
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['twin', 'predict', 'strike', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const d = draw(r.fork('params'), opts.difficulty);
      const p = item(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
