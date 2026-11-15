// @ts-check
// rational-exponents (skill 26): the named Forge of DESIGN.md section 3 I4,
// "Which power makes (9^?)^2 = 9^1?". The answer is 1/2, and that is the
// reason a^(1/2) is the number whose square is a. Built on the recipe in
// ../common.js, after the 'root-pair' Forge of sqrt-squared.core.js.
//
// Difficulty (my reading, reported):
//   d1  B = p^2 with p in 2..9 (4..81: inside the times table, so the
//       Lantern readings stay clean whole numbers).
//   d2  B squarefree in 2..19; the product form B^? B^? = B^1 is added (the
//       same unknown power twice, so the exponents ADD: prerequisite
//       exp-product-quotient).
// d3-d4 are not offered: a variable base would need x != 0 for the negative
// options, and the idea does not get harder with bigger numbers.
//
// What is blank varies (review finding 4: with only the inner power blank,
// the key was 1/2 on every item, so "tap 1/2" was always right):
//   inner    (B^?)^2 = B^1        key 1/2   (the section 3 named Forge)
//   outer    (B^(1/2))^? = B^1    key 2     (which power undoes the 1/2 power)
//   right    (B^(1/2))^2 = B^?    key 1     (what squaring the 1/2 power gives)
//   product  B^? B^? = B^1        key 1/2   (d2 only)
// Each is drawn with equal chance.
//
// Interaction: forge only (variant 'which-power'). The answer is a number
// (the exponent), so answer.kind is 'expr' (the recipe's "named variant that
// asks for something else"), not a form of 1.
//   fade 0-1  4 offered exponents: the key and 3 from the form's alphabet
//             (FORMS; inner at d1 also 1/4: B^(1/4) is exact only for a
//             square B). Each wrong option's verdict is computed by the
//             judge. Untagged: no section 5 mal-rule models picking an
//             exponent. Option sets are filtered so the key is never found
//             without the math: it is not the only non-whole (or only whole)
//             option, not the only positive one, not the unique longest or
//             shortest as written, and not the unique winner of a majority
//             vote over the options' parts (sign, numerator, denominator).
//   fade 2-3  typed (constructed).
// DEVIATION from section 3: the named option set {1/2, 2, 1, -1} is never
// offered, because 1/2 is the only fraction in it (a surface tell; review
// lesson). The documented seed gives (9^?)^2 = 9^1 with {1/2, 2, 1, -1/2}
// (Lantern readings 9, 6561, 81, 1/9).
// The Lantern after commit is drawn by the game from the chosen option; every
// option in an alphabet gives an exact value (a rational or a surd) there.
// Every item carries the completed chain in `steps`, and the last line's
// Step.reason says what the 1/2 power IS (section 7, review finding 13):
//   (9^(1/2))^2 -> 9^1 -> 9   "9^(1/2) is the number whose square is 9: 3,
//   because 3 x 3 = 9."
//
// Documented seed (pinned by test/gen/rational-exponents.forge.test.js):
//   NAMED_SEED at d1, fade 0: (9^?)^2 = 9^1 with options 1/2, 2, 1, -1/2.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, shuffledChoices, blank, DISPLAY_CAP_PX,
} from '../common.js';
import { num, mul, pow, add, eq, isEquation } from '../../math/ast.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/** @typedef {[bigint, bigint]} Frac numerator, denominator (> 0), lowest terms */

const GEN = Object.freeze({ id: 'rational-exponents.forge', version: 1, skill: 'rational-exponents' });

/** Forge variant: pick the power that makes (B^?)^2 = B^1. */
export const V_WHICH_POWER = 'which-power';

/** makeRng(NAMED_SEED) at d1, fade 0: (9^?)^2 = 9^1 with options 1/2, 2, 1, -1/2. Pinned by the test. */
export const NAMED_SEED = 'named-forge-76';

const SQUAREFREE = Object.freeze([2n, 3n, 5n, 6n, 7n, 10n, 11n, 13n, 14n, 15n, 17n, 19n]);
/**
 * Which part of (B^a)^b = B^c (or B^a B^a = B^c) is blank, its key, and the
 * offered alphabet (each wrong option keeps the Lantern reading exact).
 *   inner    (B^_)^2 = B^1      key 1/2  (the section 3 named Forge)
 *   outer    (B^(1/2))^_ = B^1  key 2    (which power undoes the 1/2 power)
 *   right    (B^(1/2))^2 = B^_  key 1    (what squaring the 1/2 power gives)
 *   product  B^_ B^_ = B^1      key 1/2  (d2: the exponents add)
 * Review finding 4: with the inner blank only, every key was 1/2.
 * @type {Readonly<Record<string, { key: Frac; alphabet: readonly Frac[]; square?: readonly Frac[] }>>}
 */
const FORMS = Object.freeze({
  inner: { key: [1n, 2n], alphabet: [[2n, 1n], [1n, 1n], [-1n, 1n], [-2n, 1n], [3n, 2n], [-1n, 2n]], square: [[2n, 1n], [1n, 1n], [-1n, 1n], [-2n, 1n], [3n, 2n], [-1n, 2n], [1n, 4n]] },
  outer: { key: [2n, 1n], alphabet: [[1n, 1n], [3n, 1n], [4n, 1n], [-1n, 1n], [-2n, 1n]] },
  right: { key: [1n, 1n], alphabet: [[2n, 1n], [1n, 2n], [3n, 2n], [4n, 1n], [-1n, 1n], [0n, 1n]] },
  product: { key: [1n, 2n], alphabet: [[2n, 1n], [1n, 1n], [-1n, 1n], [-2n, 1n], [3n, 2n], [-1n, 2n]] },
});

/** @param {Frac} f */
const text = ([n, d]) => (d === 1n ? `${n}` : `${n}/${d}`);
/** @param {Frac} f @returns {Node} */
const node = ([n, d]) => num(n, d);

/**
 * Can the key be found without the math (see the header)? Key first.
 * @param {readonly Frac[]} opts
 */
function hasTell(opts) {
  const rest = opts.slice(1);
  const whole = (/** @type {Frac} */ o) => o[1] === 1n;
  if (!whole(opts[0]) && rest.every(whole)) return true; // the only non-whole option
  if (whole(opts[0]) && rest.every((o) => !whole(o))) return true; // the only whole option
  if (opts[0][0] > 0n && rest.every((o) => o[0] <= 0n)) return true; // the only positive option
  const len = opts.map((o) => text(o).length);
  const uniq = (/** @type {number} */ x) => len.filter((l) => l === x).length === 1;
  if ((len[0] === Math.max(...len) && uniq(len[0])) || (len[0] === Math.min(...len) && uniq(len[0]))) return true;
  /** @param {Frac} o */
  const parts = (o) => [o[0] < 0n ? '-' : '+', `${o[0] < 0n ? -o[0] : o[0]}`, `${o[1]}`];
  const ps = opts.map(parts);
  const score = ps.map((p) => p.reduce((s, x, i) => s + ps.filter((y) => y[i] === x).length, 0));
  return score.slice(1).every((s) => s < score[0]);
}

/**
 * Every 3-option distractor set from the alphabet that has no tell, in a
 * fixed order.
 * @param {Frac} key @param {readonly Frac[]} alphabet @returns {Frac[][]}
 */
function fairSets(key, alphabet) {
  /** @type {Frac[][]} */
  const out = [];
  for (let i = 0; i < alphabet.length; i++) {
    for (let j = i + 1; j < alphabet.length; j++) {
      for (let k = j + 1; k < alphabet.length; k++) {
        const set = [alphabet[i], alphabet[j], alphabet[k]];
        if (!hasTell([key, ...set])) out.push(set);
      }
    }
  }
  if (out.length === 0) throw new Error(`${GEN.id}: no fair option set for key ${text(key)}`);
  return out;
}

/** @type {Record<string, Frac[][]>} */
const FAIR = {};
for (const [name, f] of Object.entries(FORMS)) {
  FAIR[name] = fairSets(f.key, f.alphabet);
  if (f.square) FAIR[`${name}-square`] = fairSets(f.key, f.square);
}

/**
 * Fixed width estimate (15px a glyph, superscripts at 0.7, times 1.3), as in
 * rational-exponents.core.js; the harness re-checks with mathdom.
 * @param {Node | Equation} x @returns {number}
 */
function powWidth(x) {
  /** @param {Node} n @returns {number} */
  const w = (n) => {
    switch (n.t) {
      case 'num': return n.q.d === 1n ? 15 * String(n.q.n).length : 15 * Math.max(String(n.q.n).length, String(n.q.d).length) + 8;
      case 'var': return 15;
      case 'group': return w(n.arg) + 16;
      case 'neg': return 15 + w(n.arg);
      case 'add': return n.args.reduce((s, a) => s + w(a), 0) + 30 * (n.args.length - 1);
      case 'mul': return n.args.reduce((s, a) => s + w(a), 0) + 10 * (n.args.length - 1);
      case 'frac': return Math.max(w(n.num), w(n.den)) + 8;
      case 'pow': return w(n.base) + (n.base.t === 'var' || (n.base.t === 'num' && n.base.q.d === 1n) ? 0 : 16) + 0.7 * w(n.exp);
      case 'root': return 18 + w(n.radicand);
    }
    return 1000;
  };
  return 1.3 * (isEquation(x) ? w(x.lhs) + w(x.rhs) + 30 : w(x)) + 8;
}

/** The whole number whose square is B, if any. @param {bigint} B */
function sqrtOf(B) { for (let k = 1n; k * k <= B; k++) if (k * k === B) return k; return undefined; }

/**
 * @param {Rng} r @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, opts, seed) {
  const d = opts.difficulty;
  const B = d === 1 ? BigInt(r.int(2, 9)) ** 2n : r.pick(SQUAREFREE);
  const form = r.pick(d === 1 ? ['inner', 'outer', 'right'] : ['inner', 'outer', 'right', 'product']);
  const { key } = FORMS[form];
  const half = () => pow(num(B), num(1, 2));
  /** @type {Node} */
  let lhs;
  /** @type {Node} */
  let rhs = pow(num(B), num(1));
  if (form === 'inner') lhs = pow(pow(num(B), blank()), num(2));
  else if (form === 'outer') lhs = pow(half(), blank());
  else if (form === 'right') { lhs = pow(half(), num(2)); rhs = pow(num(B), blank()); }
  else lhs = mul(pow(num(B), blank()), pow(num(B), blank()));
  const shown = eq(lhs, rhs);
  const product = form === 'product';
  const done = product ? mul(half(), half()) : pow(half(), num(2));
  const root = sqrtOf(B);
  // the forcing sentence of section 7 (review finding 13): the 1/2 power IS
  // the number whose square is B
  const why = root !== undefined
    ? `${B}^(1/2) is the number whose square is ${B}: ${root}, because ${root} x ${root} = ${B}.`
    : `${B}^(1/2) is the number whose square is ${B}: the square root of ${B}.`;
  /** @type {Step[]} */
  const steps = [
    { line: done, legal: true },
    ...(product ? [{ line: pow(num(B), add(num(1, 2), num(1, 2))), legal: true, reason: 'Same base: add the exponents.' }] : []),
    { line: pow(num(B), num(1)), legal: true, reason: product ? '1/2 + 1/2 = 1.' : 'A power of a power: (1/2)(2) = 1.' },
    { line: num(B), legal: true, reason: `So squaring ${B}^(1/2) gives ${B}. ${why}` },
  ];
  const p = makeProblem(GEN, seed, opts, {
    variant: V_WHICH_POWER,
    prompt: { verb: 'Forge', math: shown, goal: 'Which power makes the two sides equal?' },
    answer: { kind: 'expr', expected: node(key), formPredicates: ['single-number'], assumptions: [] },
    steps, visuals: ['squareplot', 'numberline'],
  });
  if (p.constructed) return p; // fade 2-3: typed
  const set = r.pick(FAIR[d === 1 && FORMS[form].square ? `${form}-square` : form]);
  return {
    ...p,
    choices: shuffledChoices(r.fork('choices'), [
      { display: node(key), verdict: 'correct' },
      ...set.map((o) => ({ display: node(o), verdict: /** @type {const} */ ('wrong') })),
    ]),
  };
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 2],
  interactions: ['forge'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const p = item(r, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: powWidth, capPx: DISPLAY_CAP_PX }) ? p : undefined;
    });
  },
});
