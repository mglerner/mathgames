// @ts-check
// distribute (skill 9, DESIGN.md section 4): A(b x + c) = A b x + A c,
// including negative and fractional A. Built on the recipe in ../common.js,
// after src/gen/mint/frac-times-whole.core.js.
//
// Documented seeds (pinned by test/gen/distribute.test.js):
//   HALF_HAND_SEED at d1: 3(x + 4) (section 5, mal-rule 6: 18 vs 10 at x = 2).
//   SIGN_THIEF_SEED at d3: -3(2x - 5) (section 5, mal-rule 7: 3 vs -27 at x = 2).
//
// Difficulty (my reading, reported):
//   d1  A in 2..9, (x + c) or (x - c), c in 1..9.
//   d2  A in 2..9, (b x + c) or (b x - c), b in 2..6.
//   d3  A in -9..-2, b in 1..6. NOT a bare minus -(b x +- c): there the
//       Half-Hand and the Sign-Thief write the same line, so the item could
//       not separate them. (The Why still shows -1(b x +- c).)
//   d4  A = +-p/q, q in 2..4, p in 1..3, with q dividing b and c (the
//       result has whole-number coefficients).
//
// Interactions:
//   nextline  "Distribute": the expansion, and the outputs of the Half-Hand
//             (partial-distribution) and, for a negative A, the Sign-Thief
//             (neg-distribution). Only mal-rule outputs may be distractors,
//             so a positive A has 2 candidates, not the 3-4 of section 3.
//   predict   "Distribute", typed; finished = 'expanded'.
//   strike    "Expand", typed; finished = 'expanded' and 'combined'.
//   twin      the product against its expansion, or against a mal-rule
//             output in the same normal form ("same" tagged).
//             The typed follow-up key is the product's value at the probe
//             named in the goal.
//   trace     I6: A(b x + c) = R, then the expansion, then the x-term alone,
//             then x = r (r an integer, not 0 or 1). About 2 in 3 chains
//             have one bad line (tagged on the step): the expansion line
//             replaced by a mal-rule's, or a later line done the Lopsider's,
//             Carrier's, Peeler's or Slicer's way (the place is drawn first).
//             Every later line follows correctly from it; the planted line
//             always changes the solution set, and its wrong root is kept a
//             whole number that is not 0 or 1, so the last line does not
//             give it away.
//             The true root is NOT printed in the prompt (it would expose
//             every planted chain, whose last line disagrees with it); it is
//             the answer (solution-set), for the number-evidence step.
//   why       'hidden-1' (counting): in -1(b x +- c), the 1 hiding in the
//             minus sign. Targets: the 1, the bracket, its two terms.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, fitsDisplay, malChoices,
  shuffledChoices, twinChoices, tapTargets, traceChoices, probeEnvs, PROBE_VALUES,
} from '../common.js';
import { num, mul, frac, add, neg, group, v, eq } from '../../math/ast.js';
import { q, gcd, mul as qmul, sub as qsub, div as qdiv, isInt } from '../../math/rational.js';
import { evaluate } from '../../math/evaluate.js';
import { toQ, fromQ } from '../../math/surd.js';
import { equivExpr, sameSolutions } from '../../math/equiv.js';
import { toPoly, coeffsIn } from '../../math/poly.js';
import { qNode, int, simp } from '../../misc/kit.js';
import { print } from '../../math/print.js';
import { canonicalize } from '../../moves/graph.js';
import { linearChain, plantedChains } from './balance-moves.core.js';
import halfHand from '../../misc/malrules/partial-distribution.js';
import signThief from '../../misc/malrules/neg-distribution.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {{ A: Q; bare: boolean; b: bigint; c: bigint }} Params  A the multiplier; c signed */

const GEN = Object.freeze({ id: 'distribute.core', version: 1, skill: 'distribute' });

/** Seeds of the documented examples (see the header). */
export const HALF_HAND_SEED = 's498';
export const SIGN_THIEF_SEED = 's533';

const X = v('x');
const RULES = [halfHand, signThief];

/** @param {Rng} r @param {number} d @returns {Params | undefined} */
function draw(r, d) {
  const sign = () => (r.bool() ? 1n : -1n);
  if (d === 1) return { A: q(r.int(2, 9)), bare: false, b: 1n, c: BigInt(r.int(1, 9)) * sign() };
  if (d === 2) return { A: q(r.int(2, 9)), bare: false, b: BigInt(r.int(2, 6)), c: BigInt(r.int(1, 9)) * sign() };
  if (d === 3) {
    const bare = r.bool(0.25);
    // A bare minus -(b x + c) is not served: the Half-Hand's line and the
    // Sign-Thief's line are the same there (-b x + c), so a wrong answer
    // could not be given to one of them (section 5: ambiguous).
    if (bare) return undefined;
    return { A: q(bare ? -1 : -r.int(2, 9)), bare, b: BigInt(r.int(1, 6)), c: BigInt(r.int(1, 9)) * sign() };
  }
  const qd = r.int(2, 4);
  const p = r.int(1, 3);
  if (gcd(BigInt(p), BigInt(qd)) !== 1n) return undefined;
  const Q = BigInt(qd);
  return { A: q(BigInt(p) * sign(), Q), bare: false, b: Q * BigInt(r.int(1, 3)), c: Q * BigInt(r.int(1, 4)) * sign() };
}

/** b x + c in the parser's shape. @param {Params} d @returns {Node} */
function inner(d) {
  return add(d.b === 1n ? X : mul(num(d.b), X), int(d.c));
}

/** A(inner), as typed: 3(x + 4), -3(2x - 5), -(x + 4), (1/2)(4x + 6), -(1/2)(4x - 6). @param {Params} d @param {Node} body */
function product(d, body) {
  if (d.bare) return neg(group(body));
  const size = d.A.n < 0n ? q(-d.A.n, d.A.d) : d.A;
  const m = size.d === 1n ? num(size.n) : frac(num(size.n), num(size.d));
  const pr = mul(m, group(body));
  return d.A.n < 0n ? neg(pr) : pr;
}

/** The exact rational value of n at x = p. @param {Node} n @param {number} p */
function valueAt(n, p) {
  const s = evaluate(n, { x: q(p) });
  return s ? toQ(s) : undefined;
}

/** [constant, x-coefficient] of a linear expression in x. @param {Node} n @returns {[Q, Q] | undefined} */
function linear(n) {
  const p = toPoly(n);
  const cs = p && coeffsIn(p, 'x');
  if (!cs || cs.length > 2) return undefined;
  return [cs[0] ?? q(0), cs[1] ?? q(0)];
}

/**
 * A solve chain from lhs = R: lhs = R, the expansion `first` = R, then the
 * standard moves (remove the constant, divide by the coefficient; each step
 * carries its move). Undefined when the root is not a whole number.
 * @param {Node} lhs @param {Node} first an expansion of lhs (maybe a wrong one)
 * @param {bigint} R
 * @returns {{ steps: Step[]; root: Q } | undefined}
 */
function chain(lhs, first, R) {
  const lin = linear(first);
  if (!lin || lin[1].n === 0n) return undefined;
  const root = qdiv(qsub(q(R), lin[0]), lin[1]);
  if (!isInt(root)) return undefined;
  const line1 = eq(first, int(R));
  const rest = linearChain(canonicalize(line1));
  if (!rest || rest.length === 0) return undefined;
  /** @type {Step[]} */
  const steps = [{ line: eq(lhs, int(R)), legal: true }, { line: line1, legal: true }, ...rest];
  if (steps.some((st, i) => i > 0 && print(st.line) === print(steps[i - 1].line))) return undefined;
  return { root, steps };
}

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @param {boolean} planted a Trace with a bad line (drawn once per seed, outside the
 *   rejection loop, so that rejecting more planted chains cannot skew the 2 : 1 mix)
 * @returns {Problem | undefined}
 */
function item(r, d, opts, seed, planted) {
  const body = inner(d);
  const math = product(d, body);
  const expansion = simp(math);
  const M = d.bare ? int(-1n) : qNode(d.A);
  const spelled = add(mul(M, d.b === 1n ? X : mul(num(d.b), X)), mul(M, int(d.c)));
  /** @type {Step[]} */
  // d4: "(3/4)(8x) + (3/4)(12)" is too wide for a phone, so the term-by-term
  // line is written with each product over the denominator: "24x/4 + 36/4".
  const over = (/** @type {bigint} */ n, /** @type {boolean} */ withX) => {
    const size = n < 0n ? -n : n;
    const f = frac(withX ? mul(num(size), X) : num(size), num(d.A.d));
    return n < 0n ? neg(f) : f;
  };
  const termwise = d.A.d === 1n || fitsDisplay(spelled) ? spelled : add(over(d.A.n * d.b, true), over(d.A.n * d.c, false));
  const steps = [math, termwise, expansion].filter((line) => line === math || line === expansion || fitsDisplay(line)).map((line) => ({ line, legal: true }));
  if (opts.difficulty === 4 && steps.length < 3 && opts.interaction !== 'trace' && opts.interaction !== 'why') return undefined;
  const visuals = ['tiles', 'numberline'];
  const env = { variableKeys: ['x'], probes: probeEnvs(['x']) };
  /** @param {string[]} formPredicates */
  const key = (formPredicates) => ({ kind: /** @type {const} */ ('expr'), expected: expansion, formPredicates, assumptions: [] });

  switch (opts.interaction) {
    case 'predict':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Distribute', math }, answer: key(['expanded']), steps, visuals, ...env });
    case 'strike':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Expand', math }, answer: key(['expanded', 'combined']), steps, visuals, ...env });
    case 'nextline': {
      const p = makeProblem(GEN, seed, opts, { prompt: { verb: 'Distribute', math }, answer: key(['expanded']), steps, visuals, ...env });
      const wrong = malChoices(p, RULES);
      if (!wrong || wrong.length === 0) return undefined;
      return { ...p, choices: shuffledChoices(r.fork('choices'), [{ display: expansion, verdict: 'correct' }, ...wrong]) };
    }
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      const p0 = tr.pick(PROBE_VALUES);
      /** @type {Node} */ let twin;
      /** @type {string | undefined} */ let tag;
      if (want) {
        twin = expansion; // the same normal form as the mal-rule twins, so the shape does not give the answer
      } else {
        const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Same value?', math }, answer: key([]) });
        const options = RULES.flatMap((rule) => rule.applyAll(base).map((out) => ({ rule, out })));
        if (options.length === 0) return undefined;
        const pick = tr.pick(options);
        twin = /** @type {Node} */ (pick.out);
        tag = pick.rule.id;
      }
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const at = valueAt(math, p0);
      const other = valueAt(twin, p0);
      if (!at || !other || (at.d === 1n && (at.n === 0n || at.n === 1n))) return undefined; // a Lantern key of 0 or 1 is too guessable
      if (!want && at.n * other.d === other.n * at.d) return undefined;
      const prompt = { verb: 'Same value?', math, twin, goal: `Find the first form's value at x = ${p0}.` };
      return makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, tag),
        answer: { kind: 'expr', expected: qNode(at), formPredicates: ['single-number'], assumptions: [] },
        steps, visuals, ...env,
      });
    }
    case 'trace': {
      const tr = r.fork('trace');
      const root = tr.int(-6, 9);
      if (root === 0 || root === 1) return undefined;
      // A planted chain needs an integer wrong root, which few constants give
      // (3x + 4 = 18 -> x = 14/3): instead of rejecting, every constant in
      // the difficulty's range is tried and one workable (constant, rule
      // output) pair is drawn. Bounded work, no extra rejection.
      const cs = !planted ? [d.c] : opts.difficulty === 4
        ? [-4n, -3n, -2n, -1n, 1n, 2n, 3n, 4n].map((t) => t * d.A.d)
        : [-9n, -8n, -7n, -6n, -5n, -4n, -3n, -2n, -1n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n];
      // Bad-line places: the expansion line (a distribute bug), or a later
      // line (a stated move done the Lopsider's, Carrier's, Peeler's or
      // Slicer's way). The place is drawn first, so the bad line is not
      // always the line after the given one.
      /** @type {Map<number, Step[][]>} */
      const pool = new Map();
      /** @param {Step[]} steps */
      const keep = (steps) => {
        const at = steps.findIndex((st) => !st.legal);
        pool.set(at, [...(pool.get(at) ?? []), steps]);
      };
      for (const c of cs) {
        const dc = { ...d, c };
        const m = product(dc, inner(dc));
        const Rq = qmul(d.A, q(d.b * BigInt(root) + c));
        if (!isInt(Rq)) continue;
        const good = chain(m, simp(m), Rq.n);
        if (!good) { if (planted) continue; return undefined; }
        if (good.root.n !== BigInt(root)) throw new Error(`${GEN.id}: the correct chain does not reach x = ${root} (seed ${JSON.stringify(seed)})`);
        if (!planted) { keep(good.steps); continue; }
        const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Distribute', math: m }, answer: key(['expanded']) });
        for (const rule of RULES) {
          for (const out of rule.applyAll(base)) {
            const bad = chain(m, /** @type {Node} */ (out), Rq.n);
            // the wrong root is a whole number (as the true one is) and not 0 or 1
            if (bad && bad.root.n !== 0n && bad.root.n !== 1n) keep(bad.steps.map((st, i) => (i === 1 ? { ...st, legal: false, malrule: rule.id } : st)));
          }
        }
        for (const steps of plantedChains(good.steps)) keep(steps);
      }
      if (pool.size === 0) return undefined;
      const lines = tr.pick(/** @type {Step[][]} */ (pool.get(tr.pick([...pool.keys()].sort((x, y) => x - y)))));
      // Machine-verify every step (section 3, I6): legal lines keep the
      // solution set, the planted line changes it.
      for (let i = 1; i < lines.length; i++) {
        const same = sameSolutions(/** @type {Equation} */ (lines[i - 1].line), /** @type {Equation} */ (lines[i].line), 'x').equal;
        if (same !== lines[i].legal) throw new Error(`${GEN.id}: trace step ${i} is mislabelled (seed ${JSON.stringify(seed)})`);
      }
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Find the bad line', math: lines[0].line, goal: 'Tap the first line that does not follow, or No bad line.' },
        choices: traceChoices(lines),
        answer: { kind: 'solution-set', expected: { kind: 'finite', roots: [fromQ(q(root))] }, formPredicates: [], assumptions: [] },
        steps: lines, visuals: ['balance'], ...env,
      });
    }
    case 'why': {
      if (d.c === 1n || d.c === -1n) return undefined; // no second target worth 1 or -1
      const shown = neg(mul(num(1), group(body)));
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: 'A minus sign in front of parentheses hides a 1. Tap it.' },
        choices: tapTargets(shown, ['e.0.0', 'e.0.1', 'e.0.1.0.0', 'e.0.1.0.1'], 'e.0.0'),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps: [neg(group(body)), shown, simp(neg(body))].map((line) => ({ line, legal: true })),
        visuals, ...env,
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['nextline', 'predict', 'strike', 'twin', 'trace', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    const planted = rng.fork('planted').bool(2 / 3);
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const d = draw(r.fork('params'), opts.difficulty);
      if (!d) return undefined;
      const p = item(r, d, opts, seed, planted);
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
