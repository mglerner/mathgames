// @ts-check
// frac-add-sub (skill 4, DESIGN.md section 4): add and subtract fractions
// with a common denominator, reached by multiplying each fraction by a form
// of 1 THEY choose (section 7: one coin across four topics). Built on the
// recipe in ../common.js, after frac-equivalence.core.js.
//
// Documented seed (pinned by test/gen/frac-add-sub.test.js):
//   EXAMPLE_SEED at d3: 1/4 + 5/6, common denominator 12, coins 3/3 and 2/2.
//
// Difficulty (section 4 gives none per skill; my reading, reported):
//   d1  two fractions, one denominator divides the other (1/3 + 5/6): only
//       ONE fraction needs a form of 1; common denominator <= 12.
//   d2  two fractions, coprime denominators 2..6: both need a form of 1;
//       the common denominator is the product (<= 30).
//   d3  two fractions whose denominators share a factor and neither divides
//       the other (1/4 + 5/6 -> 12, not 24); common denominator <= 48.
//   d4  three fractions, distinct denominators 2..12, common denominator
//       <= 24, + and - mixed.
// Always: every fraction proper and in lowest terms; every form of 1 is k/k
// with k <= 9 (the times table; it also keeps the Forge options the same
// length); the result is positive (signed results are skill 6) and is not 1;
// a sum never equals the product of the same two fractions.
//
// Interactions:
//   forge     "In 1/4 + 5/6, give 1/4 the common denominator 12": prompt.math
//             is that ONE fraction (the judge multiplies prompt.math across
//             by the coin), key k/k with 'denominator:L'. Fade 0-1 offers the
//             key k/k; a second genuine form of 1 that misses the goal (the
//             OTHER fraction's coin when it has one: the "which 1 goes with
//             which fraction" confusion; verdict legal-idle); one Half-Coin
//             of the key (k/1 or 1/k, tagged one-part-coin); and the mirrored
//             half of the idle coin (1/m or m/1, untagged). The mirror makes
//             the "majority of numerators and denominators" attack tie, and
//             k, m <= 9 make every option 3 characters long. Fade 2-3 typed.
//   predict   "Add" with the common denominator named in the goal; any
//             finished single number is accepted (13/12, or 2/4 or 1/2).
//   strike    "Add" / "Subtract"; finished = one number in lowest terms.
//   twin      the sum against ONE fraction, so both verdicts share one written
//             shape. Same (about half): the unreduced N/L or the reduced
//             value. Whether the partner is written in lowest terms is drawn
//             on its own (a coin flip), independent of Same / Different: an
//             already-reduced partner is scaled by 2 or 3 to show it
//             unreduced, an unreduced one is reduced. Different: the numerators added without their coins
//             ((1 + 5)/12), only one numerator scaled ((3 + 5)/12), or
//             numerators and denominators added straight across ((1 + 5)/(4 + 6)).
//             No existing mal-rule produces these (see NEEDS FROM OTHERS in
//             the report), so "same" on them is unclassified. No SINGLE form
//             of 1 joins a sum of two fractions to one fraction (each fraction
//             takes its own), so the Same follow-up is the common value
//             (section 3 I5); the Different follow-up is both values.
//   why       'hidden-1' (counting): one fraction carries its coin, the other
//             is already converted: "(1/4)(3/3) + 10/12". Tap the form of 1.
//             Targets: that fraction, the coin, the coin's numerator, the
//             other term. The coin sits on the first or the second term. A d4
//             Why uses a d3 (two-fraction) draw: three fractions with a coin
//             do not fit the display width.
// Every item carries the worked chain: each fraction gets its coin on its
// own line, then is converted, then the numerators are added over the common
// denominator, then the result is reduced. A coin line that does not fit the
// width is skipped (the converted line follows directly).

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, shuffledChoices,
  twinChoices, tapTargets, fitsDisplay, TWIN_SAME,
} from '../common.js';
import { num, mul, frac, add, neg } from '../../math/ast.js';
import { q, gcd, add as qadd, mul as qmul, qeq, ONE } from '../../math/rational.js';
import { constQ } from '../../math/evaluate.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { qNode } from '../../misc/kit.js';
import { malrules, ruleMatches } from '../../misc/diagnose.js';
import halfCoin from '../../misc/malrules/one-part-coin.js';

/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').Choice} Choice */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {{ a: bigint; b: bigint; s: bigint }} Term  s: +1n or -1n (the first term is always +1n) */
/** @typedef {{ terms: Term[]; L: bigint; k: bigint[]; value: Q; N: bigint }} Params */

const GEN = Object.freeze({ id: 'frac-add-sub.core', version: 1, skill: 'frac-add-sub' });

/** makeRng(EXAMPLE_SEED) at difficulty 3 gives 1/4 + 5/6 (common denominator 12). Pinned by the test. */
export const EXAMPLE_SEED = 's264';

/** @param {bigint} a @param {bigint} b */
function lcm(a, b) { return (a / gcd(a, b)) * b; }

/**
 * The d3 denominator pairs: 4..12, sharing a factor, neither dividing the
 * other, common denominator <= 48 and both forms of 1 k/k with k <= 9.
 * Listed once (drawing them at random rejected about 19 tries in 20).
 * @type {[number, number][]}
 */
const D3_PAIRS = [];
for (let x = 4; x <= 12; x++) {
  for (let y = x + 1; y <= 12; y++) {
    const L = lcm(BigInt(x), BigInt(y));
    if (gcd(BigInt(x), BigInt(y)) > 1n && y % x !== 0 && L <= 48n && L / BigInt(x) <= 9n) D3_PAIRS.push([x, y]);
  }
}

/** @param {Rng} r @param {number} b @returns {bigint | undefined} a proper numerator in lowest terms over b */
function numerator(r, b) {
  const a = r.int(1, b - 1);
  return gcd(BigInt(a), BigInt(b)) === 1n ? BigInt(a) : undefined;
}

/**
 * @param {Rng} r @param {number} d
 * @returns {Params | undefined} undefined = draw again
 */
export function draw(r, d) {
  /** @type {number[]} */
  let dens;
  if (d === 1) {
    const b = r.int(2, 6);
    const t = r.int(2, Math.floor(12 / b));
    dens = r.bool() ? [b, b * t] : [b * t, b];
  } else if (d === 2) {
    dens = [r.int(2, 6), r.int(2, 6)];
    if (gcd(BigInt(dens[0]), BigInt(dens[1])) !== 1n) return undefined;
  } else if (d === 3) {
    const [x, y] = r.pick(D3_PAIRS);
    dens = r.bool() ? [x, y] : [y, x];
  } else {
    // three denominators of a common denominator L <= 24 (drawn from L down,
    // since three random denominators rarely share a small one)
    const L = r.pick([6, 8, 10, 12, 12, 18, 20, 24]);
    const divs = [];
    for (let b = 2; b <= 12; b++) if (L % b === 0 && L / b <= 9) divs.push(b);
    if (divs.length < 3) return undefined;
    dens = r.shuffle(divs).slice(0, 3);
    const l = dens.reduce((acc, b) => lcm(acc, BigInt(b)), 1n);
    if (l !== BigInt(L)) return undefined;
  }
  /** @type {Term[]} */
  const terms = [];
  for (let i = 0; i < dens.length; i++) {
    const a = numerator(r, dens[i]);
    if (a === undefined) return undefined;
    terms.push({ a, b: BigInt(dens[i]), s: i === 0 || r.bool() ? 1n : -1n });
  }
  const L = terms.reduce((acc, t) => lcm(acc, t.b), 1n);
  if (L > (d === 1 ? 12n : d === 2 ? 30n : d === 3 ? 48n : 24n)) return undefined;
  const k = terms.map((t) => L / t.b);
  if (k.some((x) => x > 9n)) return undefined;
  // every running total, left to right, stays positive: negative numbers
  // are skill 6, which comes after this one
  let value = q(0n);
  for (const t of terms) {
    value = qadd(value, q(t.s * t.a, t.b));
    if (value.n <= 0n) return undefined;
  }
  if (qeq(value, ONE)) return undefined;
  const N = terms.reduce((acc, t, i) => acc + t.s * t.a * k[i], 0n);
  if (terms.length === 2) {
    const [f, g] = terms;
    // "2 + 2 = 2 x 2": the sum must not be the product of the same fractions
    if (qeq(value, qmul(q(f.a, f.b), q(g.s * g.a, g.b)))) return undefined;
    // nor what adding straight across gives
    const den = f.b + g.s * g.b;
    if (den > 0n && qeq(value, q(f.a + g.s * g.a, den))) return undefined;
  }
  return { terms, L, k, value, N };
}

/** The fraction a/b of a term, unsigned. @param {Term} t @returns {Node} */
function fracOf(t) { return frac(num(t.a), num(t.b)); }

/** A sum of signed pieces: the first as is, the rest added or subtracted. @param {Term[]} terms @param {(i: number) => Node} piece @returns {Node} */
function signedSum(terms, piece) {
  return add(...terms.map((t, i) => (i === 0 || t.s > 0n ? piece(i) : neg(piece(i)))));
}

/** @param {bigint} k @returns {Node} */
function coin(k) { return frac(num(k), num(k)); }

/**
 * The worked chain: each fraction that needs one gets its coin on its own
 * line (skipped when that line is too wide), then is converted; then the
 * numerators over the common denominator; then the result, reduced.
 * @param {Params} P @returns {Step[]}
 */
function chain(P) {
  const { terms, L, k } = P;
  /** @type {Node[]} */
  const lines = [signedSum(terms, (i) => fracOf(terms[i]))];
  const done = terms.map(() => false);
  /** @param {number} i @returns {Node} */
  const conv = (i) => frac(num(terms[i].a * k[i]), num(L));
  terms.forEach((t, i) => {
    if (k[i] === 1n) { done[i] = true; return; }
    const withCoin = signedSum(terms, (j) => (j === i ? mul(fracOf(t), coin(k[i])) : done[j] ? conv(j) : fracOf(terms[j])));
    if (fitsDisplay(withCoin)) lines.push(withCoin);
    done[i] = true;
    lines.push(signedSum(terms, (j) => (done[j] ? conv(j) : fracOf(terms[j]))));
  });
  lines.push(frac(signedSum(terms, (i) => num(terms[i].a * k[i])), num(L)));
  lines.push(frac(num(P.N), num(L)));
  const v = qNode(P.value);
  if (print(v) !== print(lines[lines.length - 1])) lines.push(v);
  return lines.map((line) => ({ line, legal: true }));
}

/**
 * A Twin partner n/d written reduced (lowest terms) or not (n/d itself when it
 * is not in lowest terms, else scaled by 2 or 3). undefined when the reduced
 * form is a whole number or the partner is not a plain positive fraction.
 * @param {Node} x @param {boolean} reduced @param {Rng} r @returns {Node | undefined}
 */
function restyle(x, reduced, r) {
  if (x.t !== 'frac' || x.num.t !== 'num' || x.den.t !== 'num') return undefined;
  const n = x.num.q.n; const d = x.den.q.n;
  if (n <= 0n || d <= 0n || x.num.q.d !== 1n || x.den.q.d !== 1n) return undefined;
  const g = gcd(n, d);
  if (reduced) return d / g === 1n ? undefined : frac(num(n / g), num(d / g));
  if (g > 1n) return x;
  const m = BigInt(r.pick([2, 3]));
  return frac(num(n * m), num(d * m));
}

/** @param {Params} P */
function verbOf(P) {
  if (P.terms.length > 2) return 'Add and subtract';
  return P.terms[1].s > 0n ? 'Add' : 'Subtract';
}

/**
 * Does a plain-looking attack find the key of a tap item without the math?
 *   - the key is the uniquely longest or uniquely shortest option;
 *   - the key alone has the most common numerator AND denominator text
 *     (the "majority vote of the parts").
 * @param {Node[]} options key first
 */
export function optionTell(options) {
  const len = options.map((o) => print(o).length);
  const rest = len.slice(1);
  if (rest.every((x) => x < len[0]) || rest.every((x) => x > len[0])) return true;
  /** @param {Node} o @returns {[string, string]} */
  const parts = (o) => (o.t === 'frac' ? [print(o.num), print(o.den)] : [print(o), '1']);
  /** @type {Record<string, number>} */ const top = {};
  /** @type {Record<string, number>} */ const bot = {};
  for (const o of options) { const [t, b] = parts(o); top[t] = (top[t] ?? 0) + 1; bot[b] = (bot[b] ?? 0) + 1; }
  const score = options.map((o) => { const [t, b] = parts(o); return top[t] + bot[b]; });
  return score.slice(1).every((x) => x < score[0]);
}

/**
 * The tag of "same" on a Twin: the one rule that turns one form into the
 * other; undefined when none does; null (reject) when two do, or when one
 * does on an equivalent pair.
 * @param {Problem} p @param {boolean} equivalent
 * @returns {string | undefined | null}
 */
function twinTag(p, equivalent) {
  const hits = malrules.filter((r) => ruleMatches(r, p, TWIN_SAME)).map((r) => r.id);
  if (hits.length === 0) return undefined;
  if (equivalent || hits.length > 1) return null;
  return hits[0];
}

/**
 * One try: an item from drawn parameters, or undefined (reject).
 * @param {Rng} r @param {Params} P @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, P, opts, seed) {
  const { terms, L, k, value } = P;
  const math = signedSum(terms, (i) => fracOf(terms[i]));
  const steps = chain(P);
  const visuals = ['bars', 'numberline', 'coin'];
  const valueNode = qNode(value);

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: verbOf(P), math, goal: 'Type the result in lowest terms.' },
        answer: { kind: 'expr', expected: valueNode, formPredicates: ['single-number', 'lowest-terms'], assumptions: [] },
        steps, visuals,
      });
    case 'predict':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: verbOf(P), math, goal: `Use the common denominator ${L}.` },
        answer: { kind: 'expr', expected: frac(num(P.N), num(L)), formPredicates: ['single-number'], assumptions: [] },
        steps, visuals,
      });
    case 'forge': {
      const fr = r.fork('forge');
      const need = terms.map((_, i) => i).filter((i) => k[i] > 1n);
      const i = fr.pick(need);
      const t = terms[i];
      const key = coin(k[i]);
      const p = makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Forge', math: fracOf(t), goal: `In ${print(math)}, give ${t.a}/${t.b} the common denominator ${L}.` },
        answer: { kind: 'form-of-1', expected: key, formPredicates: [`denominator:${L}`], assumptions: [] },
        steps, visuals: ['coin', 'bars', 'numberline'],
      });
      if (p.constructed) return p; // fade 2-3: typed
      const otherCoins = k.filter((x, j) => j !== i && x > 1n && x !== k[i]);
      const otherDens = terms.map((u) => u.b).filter((x, j) => j !== i && x <= 9n && x !== k[i]);
      const fill = [2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n].filter((x) => x !== k[i]);
      const m = fr.pick(otherCoins.length ? otherCoins : otherDens.length ? otherDens : fill);
      const halves = /** @type {Node[]} */ (halfCoin.applyAll(p));
      if (halves.length !== 2) return undefined;
      const topOnly = fr.bool();
      const halfKey = topOnly ? halves[0] : halves[1]; // k/1 or 1/k
      const halfIdle = topOnly ? frac(num(1), num(m)) : frac(num(m), num(1)); // the mirror
      const idle = coin(m);
      if (optionTell([key, idle, halfKey, halfIdle])) return undefined;
      /** @type {Omit<Choice, 'id'>[]} */
      const items = [
        { display: key, verdict: 'correct' },
        { display: idle, verdict: 'legal-idle' },
        { display: halfKey, verdict: 'wrong', malrule: halfCoin.id },
        { display: halfIdle, verdict: 'wrong' },
      ];
      return { ...p, choices: shuffledChoices(fr.fork('choices'), items) };
    }
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      /** @type {Node[]} */
      const pool = [];
      if (want) {
        pool.push(frac(num(P.N), num(L)));
        if (value.d !== L && value.d !== 1n) pool.push(valueNode);
      } else {
        const plain = terms.reduce((acc, u) => acc + u.s * u.a, 0n);
        pool.push(frac(num(plain), num(L))); // numerators added without their coins
        terms.forEach((u, i) => { // only this numerator scaled
          if (k[i] === 1n) return;
          const n = terms.reduce((acc, w, j) => acc + w.s * w.a * (j === i ? k[j] : 1n), 0n);
          pool.push(frac(num(n), num(L)));
        });
        if (terms.length === 2) { // straight across
          const den = terms[0].b + terms[1].s * terms[1].b;
          if (den > 0n) pool.push(frac(num(plain), num(den)));
        }
      }
      // Reduced or not is drawn on its own, independent of Same / Different
      // (review finding 1: "unreduced -> Different" decided 72-89% of pairs).
      const reduced = tr.bool();
      const usable = pool.map((x) => restyle(x, reduced, tr)).filter((x) => {
        if (x === undefined) return false;
        const f = /** @type {Extract<Node, { t: 'frac' }>} */ (x);
        const tv = constQ(x);
        return f.t === 'frac' && f.num.t === 'num' && f.num.q.n > 0n && tv !== undefined && !qeq(tv, ONE) && (want || !qeq(tv, value));
      });
      if (usable.length === 0) return undefined;
      const twin = /** @type {Node} */ (tr.pick(usable));
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
      const probe = { ...base, choices: twinChoices(prompt, want) };
      const tag = twinTag(probe, want);
      if (tag === null) return undefined;
      return { ...base, choices: twinChoices(prompt, want, tag) };
    }
    case 'why': {
      if (terms.length !== 2) return undefined; // the caller draws two fractions for a Why
      const wr = r.fork('why');
      const need = [0, 1].filter((i) => k[i] > 1n);
      const c = wr.pick(need);
      /** @param {number} i @returns {Node} */
      const piece = (i) => (i === c ? mul(fracOf(terms[i]), coin(k[i])) : frac(num(terms[i].a * k[i]), num(L)));
      const shown = signedSum(terms, piece);
      // data-path of the product that carries the coin
      const at = c === 0 ? 'e.0' : terms[1].s > 0n ? 'e.1' : 'e.1.0';
      const other = c === 0 ? 'e.1' : 'e.0';
      const lines = [math, shown, signedSum(terms, (i) => frac(num(terms[i].a * k[i]), num(L)))];
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: 'Tap the form of 1 that changed the look, not the value.' },
        choices: tapTargets(shown, [`${at}.0`, `${at}.1`, `${at}.1.0`, other].sort(), `${at}.1`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps: lines.map((line) => ({ line, legal: true })),
        visuals: ['coin', ...visuals.filter((x) => x !== 'coin')],
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
  const d = opts.interaction === 'why' && opts.difficulty === 4 ? 3 : opts.difficulty;
  const P = draw(r.fork('params'), d);
  if (!P) return undefined;
  const p = item(r, P, opts, seed);
  return p && separated(p).ok && fitsAll(p) ? p : undefined;
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['forge', 'predict', 'strike', 'twin', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => attempt(r, opts, seed));
  },
});
