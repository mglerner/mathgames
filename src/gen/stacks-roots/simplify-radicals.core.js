// @ts-check
// simplify-radicals (skill 24, DESIGN.md section 4): sqrt(N) = s sqrt(m) when
// N = s^2 m with m squarefree, by the product rule (for a, b >= 0):
// sqrt(s^2 m) = sqrt(s^2) sqrt(m) = s sqrt(m). Built on the recipe in
// ../common.js, following src/gen/stacks-roots/sqrt-product-rule.core.js.
//
// Difficulty (section 4 gives none per skill; my reading, reported):
//   d1  sqrt(N), N = s^2 m, s in {2, 3}, m in {2, 3, 5, 6, 7}: N is one of
//       8, 12, 18, 20, 24, 27, 28, 45, 54, 63 (inside the times table).
//   d2  sqrt(N), s in 2..6, m squarefree in 2..15, N <= 200; includes N with
//       more than one square factor (72 = 4 x 18 = 36 x 2), where stopping at
//       a smaller square is "same value, not finished".
//   d3  k sqrt(N), k in 2..5, N as d1 or 32, 48, 50, 72, 75; k s <= 30.
//   d4  sqrt(N1) + sqrt(N2) or sqrt(N1) - sqrt(N2) with ONE squarefree part m
//       (like radicals once simplified): sqrt(12) + sqrt(27) = 5 sqrt(3). One
//       term may already be simplified (sqrt(m)). The result is never 0.
// Every radicand is a whole number >= 8; no variables.
//
// Interactions:
//   twin      Same (about half): the simplified form; at d1-2 also a partly
//             simplified form when N has a smaller square factor (sqrt(72) vs
//             2 sqrt(18)); at d4 also the unsimplified sum of like radicals
//             (s1 sqrt(m) + s2 sqrt(m)). Different: the Smuggler's s^2 sqrt(m)
//             (tagged sqrt-product-misapplied); at d4 the reversed Splitter,
//             sqrt(N1 + N2) (tagged sqrt-splits-sum); near misses written like
//             the Same form and untagged (no section 5 rule models them):
//             s sqrt(N/s) (sqrt(12) "= 2 sqrt(6)"), (s +- 1) sqrt(m), at d3
//             (k + s) sqrt(m), at d4 (s1 + s2) sqrt(2m) ("sqrt(3) + sqrt(3) =
//             sqrt(6)" kind). Every "same" tag is recomputed by diagnose's
//             rule matcher, not assumed. Follow-up key: the common value
//             (radical-simplified), or both values (tuple).
//   strike    "Simplify": the value with every radicand squarefree (and, at
//             d4, like terms combined).
//   why       variant 'hidden-1' (counting): two fractions over the same
//             sqrt(N), sqrt(N)/(s sqrt(m)) (worth 1) and a decoy whose bottom
//             is the Smuggler's s^2 sqrt(m), or s sqrt(N/s), or (s + 1)
//             sqrt(m), in either order. "Tap the only fraction" and "tap the
//             radical fraction" do not find it: the student has to see sqrt(12) =
//             2 sqrt(3). Targets: both fractions and the top and bottom of
//             each (so the targets do not mark which fraction is the 1).
// Every item carries the worked chain in `steps`, including the product-rule
// step sqrt(s^2 m) = sqrt(s^2) sqrt(m) that this learner needs to see.
//
// Mal-rules separated here: sqrt-product-misapplied (17), half-power-is-half
// (16), sqrt-splits-sum (15, at d4), form-change-changes-value (2).
// Wrong answers no rule models (unclassified): sqrt(12) -> 2 sqrt(6) (the
// root taken of the factor's square root, not of the square), sqrt(12) ->
// 3 sqrt(2); reported under NEEDS FROM OTHERS.
//
// Documented seed (pinned by test/gen/simplify-radicals.test.js):
//   EXAMPLE_SEED at d1: the strike "Simplify sqrt(12)" (key 2 sqrt(3)).
//
// Display width: as in sqrt-squared.core.js, fitsAll() gets a fixed estimate
// that counts "sqrt(" as one character. The harness re-checks every
// displayed tree with the real mathdom estimate.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll,
  twinChoices, tapTargets, DISPLAY_CAP_PX, TWIN_SAME,
} from '../common.js';
import { num, mul, add, sub, frac, sqrt, isEquation } from '../../math/ast.js';
import { constValue } from '../../math/evaluate.js';
import { surdToNode } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { malrules, ruleMatches } from '../../misc/diagnose.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/**
 * @typedef {{ kind: 'root'; s: bigint; m: bigint }
 *   | { kind: 'coef'; k: bigint; s: bigint; m: bigint }
 *   | { kind: 'sum'; s1: bigint; s2: bigint; m: bigint; minus: boolean }} Params
 */

const GEN = Object.freeze({ id: 'simplify-radicals.core', version: 1, skill: 'simplify-radicals' });

/** makeRng(EXAMPLE_SEED) at d1, strike: "Simplify sqrt(12)". Pinned by the test. */
export const EXAMPLE_SEED = 'sqrt12-3';

const M_D1 = Object.freeze([2n, 3n, 5n, 6n, 7n]);
const M_D2 = Object.freeze([2n, 3n, 5n, 6n, 7n, 10n, 11n, 13n, 14n, 15n]);
/** d3 radicands s^2 m beyond the d1 set: 32, 48, 50, 72, 75. */
const EXTRA_D3 = Object.freeze([[4n, 2n], [4n, 3n], [5n, 2n], [6n, 2n], [5n, 3n]]);

/**
 * Width estimate for fitsAll: conservativeWidth with "sqrt(" as one character.
 * @param {Node | Equation} x @returns {number}
 */
function rootWidth(x) {
  const px = (/** @type {Node | Equation} */ y) => { const s = print(y); return 16 * (s.length - 4 * (s.match(/sqrt\(/g) ?? []).length) + 24; };
  const one = px(x);
  if (!isEquation(x) || one <= DISPLAY_CAP_PX) return one;
  return Math.max(px(x.lhs), px(x.rhs)) + 32;
}

/**
 * rootWidth, but a product of fractions (the Why) is measured as drawn:
 * each fraction is stacked, so it is as wide as the wider of its two parts.
 * @param {Node | Equation} x @returns {number}
 */
function stackedWidth(x) {
  if (isEquation(x) || x.t !== 'mul' || !x.args.every((a) => a.t === 'frac')) return rootWidth(x);
  return x.args.reduce((w, a) => w + (a.t === 'frac' ? Math.max(rootWidth(a.num), rootWidth(a.den)) : 0), 0);
}

/** @param {Rng} r @param {bigint} lo @param {bigint} hi */
const bint = (r, lo, hi) => BigInt(r.int(Number(lo), Number(hi)));

/** @param {Rng} r @param {number} d @returns {Params | undefined} */
function draw(r, d) {
  if (d === 1) return { kind: 'root', s: bint(r, 2n, 3n), m: r.pick(M_D1) };
  if (d === 2) {
    const s = bint(r, 2n, 6n);
    const m = r.pick(M_D2);
    return s * s * m <= 200n ? { kind: 'root', s, m } : undefined;
  }
  if (d === 3) {
    const [s, m] = r.bool(2 / 3) ? [bint(r, 2n, 3n), r.pick(M_D1)] : r.pick(EXTRA_D3);
    const k = bint(r, 2n, 5n);
    return k * s <= 30n ? { kind: 'coef', k, s, m } : undefined;
  }
  const m = r.pick(M_D1);
  const s1 = bint(r, 1n, 5n);
  const s2 = bint(r, 1n, 5n);
  const minus = r.bool(1 / 3);
  if (s1 === s2 || (s1 === 1n && s2 === 1n)) return undefined;
  if (s1 * s1 * m > 150n || s2 * s2 * m > 150n) return undefined;
  if (minus && s1 < s2) return undefined; // the result stays positive
  return { kind: 'sum', s1, s2, m, minus };
}

/** c sqrt(m), or sqrt(m) when c is 1. @param {bigint} c @param {bigint} m @returns {Node} */
function cr(c, m) { return c === 1n ? sqrt(num(m)) : mul(num(c), sqrt(num(m))); }
/** sqrt(s^2 m), or sqrt(m) when s is 1. @param {bigint} s @param {bigint} m */
const rad = (s, m) => sqrt(num(s * s * m));

/**
 * The prompt, the simplified answer (c sqrt(m)) and the worked chain.
 * @param {Params} d @returns {{ math: Node; c: bigint; m: bigint; steps: Node[] }}
 */
function form(d) {
  if (d.kind === 'root') {
    const { s, m } = d;
    const math = rad(s, m);
    return { math, c: s, m, steps: [math, sqrt(mul(num(s * s), num(m))), mul(sqrt(num(s * s)), sqrt(num(m))), cr(s, m)] };
  }
  if (d.kind === 'coef') {
    const { k, s, m } = d;
    const math = mul(num(k), rad(s, m));
    return {
      math, c: k * s, m,
      steps: [math, mul(num(k), sqrt(mul(num(s * s), num(m)))), mul(num(k), sqrt(num(s * s)), sqrt(num(m))), cr(k * s, m)],
    };
  }
  const { s1, s2, m, minus } = d;
  const join = (/** @type {Node} */ a, /** @type {Node} */ b) => (minus ? sub(a, b) : add(a, b));
  const math = join(rad(s1, m), rad(s2, m));
  const c = minus ? s1 - s2 : s1 + s2;
  return { math, c, m, steps: [math, join(cr(s1, m), cr(s2, m)), cr(c, m)] };
}

/** Is n a perfect square? @param {bigint} n */
function isSquare(n) { let s = 0n; while ((s + 1n) * (s + 1n) <= n) s++; return s * s === n; }

/** The rules that turn one Twin form into the other. @param {Problem} p @returns {string[]} */
function sameHits(p) { return malrules.filter((r) => ruleMatches(r, p, TWIN_SAME)).map((r) => r.id); }

/**
 * Twin partners for the prompt: [equivalent forms, different forms].
 * @param {Rng} r @param {Params} d @param {bigint} c @param {bigint} m
 * @returns {{ same: Node[]; diff: Node[] }}
 */
function partners(r, d, c, m) {
  /** @type {Node[]} */ const same = [cr(c, m)];
  /** @type {Node[]} */ const diff = [];
  const near = r.bool() ? c + 1n : c - 1n;
  if (near >= 2n) diff.push(cr(near, m));
  if (d.kind === 'root') {
    const { s } = d;
    for (let t = s - 1n; t >= 2n; t--) if (s % t === 0n) { same.push(cr(t, (s / t) * (s / t) * m)); break; } // a smaller square factor
    diff.push(cr(s * s, m)); // the Smuggler: the square leaves un-rooted
    if (!isSquare(s * m)) diff.push(cr(s, s * m)); // sqrt(12) "= 2 sqrt(6)"
  } else if (d.kind === 'coef') {
    diff.push(cr(d.k * d.s * d.s, m)); // the Smuggler inside: k s^2 sqrt(m)
    diff.push(cr(d.k + d.s, m)); // added the factor instead of multiplying
  } else {
    const { s1, s2, minus } = d;
    const join = (/** @type {Node} */ a, /** @type {Node} */ b) => (minus ? sub(a, b) : add(a, b));
    same.push(join(cr(s1, m), cr(s2, m)));
    const N1 = s1 * s1 * m;
    const N2 = s2 * s2 * m;
    diff.push(sqrt(join(num(N1), num(N2)))); // the reversed Splitter
    diff.push(join(cr(s1 * s1, m), cr(s2 * s2, m))); // the Smuggler on each term
    if (!isSquare(2n * m)) diff.push(cr(c, 2n * m)); // "sqrt(3) + sqrt(3) = sqrt(6)"
    // A root of a sum that IS the value (written like the Splitter's pair),
    // so "a root of a sum is Different" is no tell: sqrt(X + Y), X + Y = c^2 m.
    const T = c * c * m;
    const X = T >= 6n ? BigInt(r.int(2, Number(T) - 2)) : 0n;
    if (X > 0n && T <= 200n && X !== N1 && X !== N2 && T - X !== N1 && T - X !== N2) same.push(sqrt(add(num(X), num(T - X))));
  }
  return { same, diff };
}

/**
 * @param {Rng} r @param {Params} d @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, d, opts, seed) {
  const { math, c, m, steps: chain } = form(d);
  if (c < 1n) return undefined;
  const answer = cr(c, m);
  /** @type {Step[]} */
  const steps = chain.map((line) => ({ line, legal: true }));
  const visuals = ['squareplot', 'numberline'];
  const finished = d.kind === 'sum' ? ['radical-simplified', 'combined'] : ['radical-simplified'];
  /** @param {string[]} formPredicates */
  const key = (formPredicates) => ({ kind: /** @type {const} */ ('expr'), expected: answer, formPredicates, assumptions: [] });

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Simplify', math, goal: d.kind === 'sum' ? 'Simplify each square root, then combine.' : 'Take every perfect-square factor out of the radicand.' },
        answer: key(finished), steps, visuals,
      });
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      const { same, diff } = partners(tr.fork('partners'), d, c, m);
      const twin = tr.pick(want ? same : diff);
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) return undefined;
      const twinValue = constValue(twin);
      if (!twinValue) return undefined;
      const prompt = { verb: 'Same value?', math, twin };
      const draft = makeProblem(GEN, seed, opts, { prompt, choices: twinChoices(prompt, want), answer: key(finished) });
      const hits = want ? [] : sameHits(draft);
      if (hits.length > 1) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt,
        choices: twinChoices(prompt, want, hits[0]),
        answer: want ? key(['radical-simplified'])
          : { kind: 'tuple', expected: [answer, surdToNode(twinValue)], formPredicates: ['radical-simplified'], assumptions: [] },
        steps, visuals,
      });
    }
    case 'why': {
      const wr = r.fork('why');
      // The radicand of the Why: the prompt's (its first term at d4).
      const [s, mm] = d.kind === 'sum' ? [d.s1 > 1n ? d.s1 : d.s2, d.m] : [d.s, d.m];
      const N = s * s * mm;
      const top = () => sqrt(num(N));
      /** @type {Node[]} */
      const decoys = [cr(s * s, mm), cr(s + 1n, mm)];
      if (!isSquare(s * mm)) decoys.push(cr(s, s * mm));
      const one = frac(top(), cr(s, mm));
      const decoy = frac(top(), wr.pick(decoys));
      const oneFirst = wr.bool();
      const shown = oneFirst ? mul(one, decoy) : mul(decoy, one);
      const at = oneFirst ? 0 : 1;
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: 'One of these fractions is worth exactly 1. Tap it.' },
        choices: tapTargets(shown, ['e.0', 'e.0.0', 'e.0.1', 'e.1', 'e.1.0', 'e.1.1'], `e.${at}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps: form({ kind: 'root', s, m: mm }).steps.map((line) => ({ line, legal: true })),
        visuals: ['coin', ...visuals],
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['twin', 'strike', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const d = draw(r.fork('params'), opts.difficulty);
      if (!d) return undefined;
      const p = item(r, d, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: opts.interaction === 'why' ? stackedWidth : rootWidth }) ? p : undefined;
    });
  },
});
