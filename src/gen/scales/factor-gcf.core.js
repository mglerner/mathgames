// @ts-check
// factor-gcf (skill 11, DESIGN.md section 4): distribution read backward;
// GCF = greatest common factor. 6x + 9 = 3(2x + 3) because 3(2x + 3) is
// 3(2x) + 3(3). Built on the recipe in ../common.js, after
// ./distribute.core.js.
//
// Documented seed (pinned by test/gen/factor-gcf.test.js):
//   EXAMPLE_SEED at d1 strike: 12x + 18 -> GCF 6, left 2x + 3.
//
// There is no "factored" form predicate in src/math/forms.js, so no typed
// item here asks for a factored EXPRESSION: the judge would accept the
// unfactored 6x + 9 as "the same value" (reported under NEEDS FROM OTHERS).
// The typed items ask for the parts instead, and those are judged exactly:
//   predict   fill the parentheses: "6x + 9 = 3( )" -> 2x + 3 (variant
//             'fill-blank': the key must make the two sides equal for every x).
//   strike    the two parts as a list: "GCF, what is left" -> 3, 2x + 3
//             (answer.kind 'tuple', each entry value-equal; a common factor
//             that is not the greatest, 3, 4x + 6 for 12x + 18, is wrong).
// isGcfFactored() below is the local structural check for "c(...) with
// integer content 1 inside" (and no x common to every inside term); every
// key here is checked with it.
//
// Difficulty (section 4 gives none; my reading, reported):
//   d1  numeric GCF 2..9, inside p x + q (all positive, p 1..5, q 1..9):
//       12x + 18 = 6(2x + 3). Every number is a times-table product.
//   d2  inside with a minus (p x - q), or the GCF is x: 3x^2 + 7x = x(3x + 7).
//   d3  GCF g x (g 2..6): 6x^2 - 9x = 3x(2x - 3); or a negative first term,
//       where the stated move takes out -g (predict and twin only: "the GCF"
//       of -6x + 9 is 3, and -3 is a choice, so a Strike never asks it).
//   d4  three terms inside: 6x^2 + 9x - 12 = 3(2x^2 + 3x - 4), or
//       4x^3 - 6x^2 + 2x = 2x(2x^2 - 3x + 1).
//
// Interactions:
//   twin      I5, box 0-1, with tiles: the expanded form against a factored
//             form, the second ALWAYS written like the true factoring (the
//             same signs and terms). Same: the GCF factoring, or a common
//             factor that is not the greatest, 3(4x + 6) for 12x + 18 (same
//             value, not finished: worth seeing). Different: the factor taken
//             from the first term only, 6(2x + 18) (the Half-Hand read
//             backward: "same" tagged partial-distribution; it copies a
//             number of the first form, a look that always means Different,
//             so it is drawn on about 1 Different pair in 4), or each later
//             term reduced by subtracting the factor, 6(2x + 12) (untagged;
//             no rule models it, proposed rule reported). The typed follow-up key is
//             the first form's value at the probe named in the goal. Twins
//             use a numeric GCF only: with an x in the GCF no same-looking
//             near miss is a real slip.
//   predict   see above (fill-blank), "Factor out 3".
//   strike    see above (tuple), "Factor out the GCF".
//   why       'hidden-1' (counting): "(3/3)(6x + 9) = 3((6x + 9)/3)":
//             taking 3 out is multiplying by 3/3. The two sides are drawn in
//             either order; targets are both factors of each side. Numeric
//             GCF only (an x/x is 1 only where x is not 0).
// Worked steps (problem.steps): the expanded form, each term written as GCF
// times what is left, "3(2x) + 3(3)" (the step this learner needs), and the
// factored form.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, fitsDisplay,
  twinChoices, tapTargets, probeEnvs, blank, PROBE_VALUES, V_FILL_BLANK, TWIN_SAME,
} from '../common.js';
import { num, mul, frac, add, neg, group, v, eq, stripGroups } from '../../math/ast.js';
import { q, gcd } from '../../math/rational.js';
import { evaluate } from '../../math/evaluate.js';
import { toQ } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { toPoly, coeffsIn } from '../../math/poly.js';
import { print } from '../../math/print.js';
import { qNode, polyNode } from '../../misc/kit.js';
import { diagnose } from '../../misc/diagnose.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/**
 * g x^gx (inside): the factored item. inside = [c0, c1, c2] (bigint),
 * integer content 1, and not every inside term has an x.
 * @typedef {{ g: bigint; gx: number; inside: bigint[] }} Params
 */

const GEN = Object.freeze({ id: 'factor-gcf.core', version: 1, skill: 'factor-gcf' });

/** Seed of the documented example (see the header). */
export const EXAMPLE_SEED = 's130';

const X = 'x';
const VISUALS = ['tiles', 'numberline'];

/** @param {bigint[]} cs @returns {Node} */
const polyOf = (cs) => polyNode(cs.map((c) => q(c)), X);
/** @param {bigint} a */
const babs = (a) => (a < 0n ? -a : a);

/** The GCF as a factor node (positive size; the sign is put in front of the product). @param {bigint} g @param {number} gx */
function gcfNode(g, gx) {
  const size = babs(g);
  if (gx === 0) return num(size);
  return size === 1n ? v(X) : mul(num(size), v(X));
}

/** g x^gx (inside) as typed: 3(2x + 3), -3(2x - 3), x(3x + 7), 3x(2x - 3). @param {bigint} g @param {number} gx @param {Node} inside */
function product(g, gx, inside) {
  const f = gcfNode(g, gx);
  const pr = f.t === 'mul' ? mul(...f.args, group(inside)) : mul(f, group(inside));
  return g < 0n ? neg(pr) : pr;
}

/** The expanded coefficients [c0..c3]. @param {Params} P @returns {bigint[]} */
function expandedCoeffs(P) {
  const out = [0n, 0n, 0n, 0n];
  P.inside.forEach((c, k) => { out[k + P.gx] += P.g * c; });
  return out;
}

/** @param {bigint[]} cs */
function content(cs) { return cs.reduce((a, c) => gcd(a, c), 0n); }

/**
 * The local structural check (see the header): n is c(...) or c x(...) or
 * -c(...), the inside a polynomial in x with integer coefficients whose
 * content is 1 and whose terms do not all hold an x.
 * @param {Node} n @returns {boolean}
 */
export function isGcfFactored(n) {
  let s = n;
  while (s.t === 'group') s = s.arg;
  if (s.t === 'neg') s = s.arg;
  if (s.t !== 'mul' || s.args.length < 2) return false;
  const rest = s.args[s.args.length - 1];
  const f = s.args.length === 2 ? s.args[0] : mul(...s.args.slice(0, -1));
  const body = stripGroups(rest);
  if (body.t !== 'add') return false;
  const fp = toPoly(f);
  if (!fp || fp.terms.size !== 1) return false;
  const p = toPoly(body);
  const cs = p && coeffsIn(p, X);
  if (!cs || cs.some((c) => c && c.d !== 1n)) return false;
  const ints = cs.map((c) => (c ? c.n : 0n));
  if (ints.filter((c) => c !== 0n).length < 2) return false;
  return content(ints) === 1n && ints[0] !== 0n;
}

/** Exact value at x = p. @param {Node} n @param {number} p */
function valueAt(n, p) {
  const s = evaluate(n, { x: q(p) });
  return s ? toQ(s) : undefined;
}

/** Written shape: digits become N (a coefficient 1 is not printed, so x and 2x differ). @param {Node} n */
export function shapeText(n) { return print(n).replace(/\d+/g, 'N'); }

// ---------------------------------------------------------------- draws

/** @param {Rng} r @param {number} lo @param {number} hi */
const pos = (r, lo, hi) => BigInt(r.int(lo, hi));
/** @param {Rng} r */
const sgn = (r) => (r.bool() ? 1n : -1n);

/**
 * @param {Rng} r @param {number} d
 * @param {{ numeric?: boolean; positive?: boolean; twoTerms?: boolean }} want
 *   numeric: a GCF with no x; positive: a positive first term; twoTerms: inside has 2 terms
 * @returns {Params | undefined}
 */
function draw(r, d, want) {
  /** @type {Params} */
  let P;
  if (d === 1) P = { g: pos(r, 2, 9), gx: 0, inside: [pos(r, 1, 9), pos(r, 1, 5), 0n] };
  else if (d === 2) {
    if (!want.numeric && r.bool(0.4)) P = { g: 1n, gx: 1, inside: [pos(r, 1, 9) * sgn(r), pos(r, 2, 9), 0n] };
    else P = { g: pos(r, 2, 9), gx: 0, inside: [-pos(r, 1, 9), pos(r, 1, 6), 0n] };
  } else if (d === 3) {
    if (!want.numeric && r.bool()) P = { g: pos(r, 2, 6), gx: 1, inside: [pos(r, 1, 9) * sgn(r), pos(r, 1, 5), 0n] };
    else {
      const neg1 = !want.positive && r.bool(0.7);
      P = { g: pos(r, 2, 9) * (neg1 ? -1n : 1n), gx: 0, inside: [pos(r, 1, 9) * sgn(r), pos(r, 1, 6), 0n] };
    }
  } else if (want.twoTerms) {
    // two terms with an x^2: 6x^2 - 9 = 3(2x^2 - 3)
    P = { g: pos(r, 2, 6), gx: 0, inside: [pos(r, 1, 9) * sgn(r), 0n, pos(r, 1, 5)] };
  } else {
    const gx = !want.numeric && r.bool() ? 1 : 0;
    P = { g: pos(r, 2, 6), gx, inside: [pos(r, 1, 9) * sgn(r), pos(r, 1, 9) * sgn(r), pos(r, 1, 5)] };
  }
  if (content(P.inside) !== 1n) return undefined;
  if (P.inside[0] === 0n) return undefined;
  if (want.positive && P.g < 0n) return undefined;
  // numbers inside the times table (each expanded coefficient is g x inside)
  if (expandedCoeffs(P).some((c) => babs(c) > 81n)) return undefined;
  return P;
}

// ---------------------------------------------------------------- items

/**
 * @param {Rng} r @param {Params} P @param {GenOpts} opts @param {string} seed
 * @param {boolean} want (twin only: a Same pair; drawn once per seed so that rejection does not skew the half)
 * @returns {Problem | undefined}
 */
function item(r, P, opts, seed, want) {
  const inside = polyOf(P.inside);
  const factored = product(P.g, P.gx, inside);
  const expandedCs = expandedCoeffs(P);
  const expanded = polyNode(expandedCs.map((c) => q(c)), X);
  if (!isGcfFactored(factored)) throw new Error(`${GEN.id}: ${print(factored)} is not GCF-factored (seed ${JSON.stringify(seed)})`);
  if (equivExpr(factored, expanded).equal !== true) throw new Error(`${GEN.id}: ${print(factored)} is not ${print(expanded)} (seed ${JSON.stringify(seed)})`);
  // each term written as GCF times what is left: 3(2x) + 3(3)
  const G = P.g < 0n ? neg(gcfNode(P.g, P.gx)) : gcfNode(P.g, P.gx);
  const insideTerms = [2, 1, 0].filter((k) => P.inside[k] !== 0n).map((k) => {
    const cs = [0n, 0n, 0n];
    cs[k] = P.inside[k];
    return polyOf(cs);
  });
  const spelled = add(...insideTerms.map((t) => (P.g < 0n ? mul(group(G), group(t)) : G.t === 'mul' ? mul(...G.args, group(t)) : mul(G, group(t)))));
  /** @type {Step[]} */
  const steps = [expanded, spelled, factored]
    .filter((line, i) => i !== 1 || fitsDisplay(line))
    .map((line) => ({ line, legal: true }));
  const env = { variableKeys: [X], probes: probeEnvs([X]) };
  const gText = print(G);

  switch (opts.interaction) {
    case 'predict': {
      const math = eq(expanded, product(P.g, P.gx, blank()));
      return makeProblem(GEN, seed, opts, {
        variant: V_FILL_BLANK,
        prompt: { verb: `Factor out ${gText}`, math, goal: 'Fill the parentheses so the two sides are equal for every x.' },
        answer: { kind: 'expr', expected: inside, formPredicates: ['expanded', 'combined'], assumptions: [] },
        steps, visuals: VISUALS, ...env,
      });
    }
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Factor out the GCF', math: expanded, goal: 'Type the GCF, a comma, then what is left in the parentheses.' },
        answer: { kind: 'tuple', expected: [gcfNode(P.g, P.gx), inside], formPredicates: ['expanded', 'combined'], assumptions: [] },
        steps, visuals: VISUALS, ...env,
      });
    case 'twin': {
      const tr = r.fork('twin');
      const p0 = tr.pick(PROBE_VALUES);
      /** @type {Node[]} */
      const cands = [];
      if (want) {
        cands.push(factored);
        // a common factor that is not the greatest: 12x + 18 = 3(4x + 6)
        for (let f = 2n; f < babs(P.g); f++) {
          if (babs(P.g) % f !== 0n) continue;
          const k = P.g / f;
          cands.push(product(P.g < 0n ? -f : f, P.gx, polyOf(P.inside.map((c) => c * babs(k)))));
        }
      } else {
        // the factor taken from the first term only (the later terms copied)
        const lead = Math.max(...[0, 1, 2].filter((k) => P.inside[k] !== 0n));
        cands.push(product(P.g, P.gx, polyOf(P.inside.map((c, k) => (k === lead ? c : c * P.g)))));
        // each later term reduced by subtracting the factor instead of dividing
        cands.push(product(P.g, P.gx, polyOf(P.inside.map((c, k) => (k === lead || c === 0n ? c : (c < 0n ? -1n : 1n) * babs(P.g) * (babs(c) - 1n))))));
      }
      const ok = cands.filter((c) => shapeText(c) === shapeText(factored) && equivExpr(c, expanded).equal === want);
      if (ok.length === 0) return undefined;
      // Same: the GCF form or a smaller common factor, about half each when both exist
      // Different: the Half-Hand's twin copies the first form's number
      // ("3x + 21" against "3(x + 21)"), a look that always means Different,
      // so it is drawn on about 1 Different pair in 4 (enough to detect the
      // rule); the subtracting slip is the rest
      const half = ok.find((c) => c === cands[0]);
      const useHalf = !want && tr.bool(0.25);
      const rest = ok.filter((c) => c !== half);
      if (!want && (useHalf ? !half : rest.length === 0)) return undefined;
      const twin = want ? (ok.length > 1 && tr.bool() ? tr.pick(ok.slice(1)) : ok[0])
        : useHalf ? /** @type {Node} */ (half) : tr.pick(rest);
      const at = valueAt(expanded, p0);
      const other = valueAt(twin, p0);
      if (!at || !other || (at.d === 1n && (at.n === 0n || at.n === 1n))) return undefined;
      if (!want && at.n * other.d === other.n * at.d) return undefined;
      const prompt = { verb: 'Same value?', math: expanded, twin, goal: `Find the first form's value at x = ${p0}.` };
      const draft = makeProblem(GEN, seed, opts, {
        prompt, choices: twinChoices(prompt, want),
        answer: { kind: 'expr', expected: qNode(at), formPredicates: ['single-number'], assumptions: [] },
        steps, visuals: VISUALS, ...env,
      });
      if (want) return draft;
      const hits = diagnose(draft, TWIN_SAME).misconceptions;
      if (hits.length > 1) return undefined;
      return { ...draft, choices: twinChoices(prompt, false, hits[0]) };
    }
    case 'why': {
      const size = babs(P.g);
      const body = group(expanded);
      const coin = mul(frac(num(size), num(size)), body);
      const pulled = mul(num(size), group(frac(group(expanded), num(size))));
      const coinLeft = r.fork('why').bool();
      const math = coinLeft ? eq(coin, pulled) : eq(pulled, coin);
      const cs = coinLeft ? 'l' : 'r';
      const ps = coinLeft ? 'r' : 'l';
      const positive = { ...P, g: size };
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math, goal: `Taking ${size} out multiplies by a 1. Tap it.` },
        choices: tapTargets(math, [`${cs}.0`, `${cs}.1`, `${ps}.0`, `${ps}.1`].sort(), `${cs}.0`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps: [expanded, coin, pulled, product(positive.g, 0, polyOf(P.inside.map((c) => (P.g < 0n ? -c : c))))].map((line) => ({ line, legal: true })),
        visuals: ['coin', 'tiles'], ...env,
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
    const it = opts.interaction;
    const want = {
      numeric: it === 'twin' || it === 'why',
      positive: it === 'strike' || it === 'why',
      twoTerms: it === 'why',
    };
    const same = rng.fork('same').bool();
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const P = draw(r.fork('params'), opts.difficulty, want);
      if (!P) return undefined;
      const p = item(r, P, opts, seed, same);
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
