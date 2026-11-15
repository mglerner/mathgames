// @ts-check
// combine-like-terms (skill 10, DESIGN.md section 4): like terms have the same
// variable part, and 4x + 3x = (4 + 3)x is distribution read backward. Built
// on the recipe in ../common.js, after ./distribute.core.js.
//
// Documented seed (pinned by test/gen/combine-like-terms.test.js):
//   EXAMPLE_SEED at d2 strike: 6x - 9 - 3x + 4 -> 3x - 5 (9x - 5 is the dropped
//   minus sign; 6x - 3x - 5 is 'same value, not finished').
//
// Difficulty (section 4 gives none; my reading, reported):
//   d1  2 x terms and 1-2 numbers, all positive, coefficients 1..9 (sums
//       stay inside the times table): 4x + 2 + 3x.
//   d2  2 x terms and 2 numbers with signs, coefficients 1..9: 5x - 8 - 2x + 3.
//   d3  x^2 terms and x terms (a like term needs the SAME power), 3-4 terms
//       with signs: x^2 + 4x + 2x^2 - x, 3x^2 - 5x - x^2.
//   d4  a product to distribute first, then combine: 3(x - 2) + 4x - 1,
//       5x - 2(x + 3) + 4.
//
// Interactions:
//   twin      I5, box 0-1, with tiles. The first form uncombined, the second
//             ALWAYS written like the combined answer (descending, same signs
//             and the same number of terms), so the look of the second form
//             never settles Same / Different. Same (about half): the combined
//             form. Different: a near miss written the same way: a minus sign
//             dropped from one later term (5x - 2x read as 5x + 2x), a
//             coefficient-1 term counted as 0 (4x + x -> 4x), the two
//             coefficients multiplied (3x + 4x -> 12x), the x^2 and x
//             coefficients exchanged (d3), and at d4 the Half-Hand's and the
//             Sign-Thief's distribution, combined ("same" tagged with that
//             rule; the other near misses are untagged: no rule models them).
//             The typed follow-up key is the first form's value at the probe
//             named in the goal (no single form of 1 or 0 joins the pair).
//   nextline  I2 "Distribute, then combine": ALWAYS on an item with a product
//             (d1 3(x - 2) + 4x ... d4 two products), because distractors may
//             only be mal-rule outputs and the 19 rules model no error on a
//             plain sum. Candidates: the answer and the Half-Hand's and
//             Sign-Thief's results, each shown combined (an uncombined
//             distractor beside a combined key would be a tell); a set where
//             the key is the one longest or shortest line, or the majority
//             vote of the written terms, or (3 candidates) the one whose
//             constant has the odd sign out, is redrawn; the number inside the
//             product has either sign even at d1, so the key's constant is
//             not always the larger one. Positive multipliers give 2
//             candidates, as in distribute.core.
//   predict   "Combine like terms", typed; finished = 'combined' (and
//             'expanded' at d4).
//   strike    "Simplify", typed; finished = 'expanded' and 'combined'.
//   why       'hidden-0' (counting): "(3x - 3x) + (4 + 5)": two bracketed
//             pairs of like terms, one of them a zero-pair; which pair it is
//             and which bracket comes first are drawn, and the other pair
//             shows a minus sign about half the time (so "the bracket with a
//             minus" does not find it). Always x terms and numbers: an x^2
//             pair does not fit the phone, so d2-d4 Why items are alike
//             (the idea has no harder version; reported).
// Worked steps (problem.steps): the item, the distributed line (d4), the
// coefficients collected "(4 + 3)x + (2 - 1)" (the step this learner needs:
// adding like terms IS distribution backward, and a lone x is 1x), and the
// answer. When the collecting line is too wide for the phone it is split,
// one power at a time; any other line too wide is left out.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, fitsDisplay, malChoices,
  shuffledChoices, twinChoices, tapTargets, probeEnvs, PROBE_VALUES, TWIN_SAME,
} from '../common.js';
import { num, mul, add, neg, group, v, pow } from '../../math/ast.js';
import { q } from '../../math/rational.js';
import { evaluate } from '../../math/evaluate.js';
import { toQ } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { print } from '../../math/print.js';
import { qNode, simp, polyNode } from '../../misc/kit.js';
import { diagnose } from '../../misc/diagnose.js';
import halfHand from '../../misc/malrules/partial-distribution.js';
import signThief from '../../misc/malrules/neg-distribution.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/**
 * A part of the item as written: a term c x^k, or a product A(b x + c).
 * @typedef {{ t: 'term'; c: bigint; k: number } | { t: 'prod'; A: bigint; b: bigint; c: bigint }} Part
 */

const GEN = Object.freeze({ id: 'combine-like-terms.core', version: 1, skill: 'combine-like-terms' });

/** Seed of the documented example (see the header). */
export const EXAMPLE_SEED = 's621';

const X = 'x';
const RULES = [halfHand, signThief];
const VISUALS = ['tiles', 'numberline'];

/** @param {Rng} r @param {number} lo @param {number} hi */
const pos = (r, lo, hi) => BigInt(r.int(lo, hi));
/** @param {Rng} r @param {number} lo @param {number} hi */
const signed = (r, lo, hi) => BigInt(r.int(lo, hi)) * (r.bool() ? 1n : -1n);

/** c x^k as a display tree (-2x, x^2, 5). @param {bigint} c @param {number} k @returns {Node} */
function termNode(c, k) {
  const cs = [q(0), q(0), q(0)];
  cs[k] = q(c);
  return polyNode(cs, X);
}

/** b x + c inside a product. @param {bigint} b @param {bigint} c @returns {Node} */
function inner(b, c) { return polyNode([q(c), q(b), q(0)], X); }

/** A part as written; a negative multiplier is a minus in front: -2(x + 3). @param {Part} p @returns {Node} */
function partNode(p) {
  if (p.t === 'term') return termNode(p.c, p.k);
  const size = p.A < 0n ? -p.A : p.A;
  const pr = mul(num(size), group(inner(p.b, p.c)));
  return p.A < 0n ? neg(pr) : pr;
}

/** The item as written. @param {Part[]} parts @returns {Node} */
function written(parts) {
  const ns = parts.map(partNode);
  return ns.length === 1 ? ns[0] : add(...ns);
}

/** The parts with every product distributed (terms in place). @param {Part[]} parts @returns {Part[]} */
function distributed(parts) {
  return parts.flatMap((p) => (p.t === 'term' ? [p] : [{ t: 'term', c: p.A * p.b, k: 1 }, { t: 'term', c: p.A * p.c, k: 0 }].filter((x) => x.c !== 0n)));
}

/** Combined coefficients [c0, c1, c2]. @param {Part[]} parts @returns {bigint[]} */
function combine(parts) {
  const cs = [0n, 0n, 0n];
  for (const p of distributed(parts)) if (p.t === 'term') cs[p.k] += p.c;
  return cs;
}

/** A polynomial from bigint coefficients, descending. @param {bigint[]} cs @returns {Node} */
function polyOf(cs) { return polyNode(cs.map((c) => q(c)), X); }

/**
 * The coefficients collected, "(4 + 3)x + (2 - 1)": one bracket per power
 * with two or more terms (a lone x shows its 1). @param {Part[]} terms distributed @returns {Node}
 */
function collected(terms) {
  /** @type {Node[]} */
  const out = [];
  for (const k of [2, 1, 0]) {
    const cs = terms.filter((t) => t.t === 'term' && t.k === k).map((t) => /** @type {{ c: bigint }} */ (t).c);
    if (cs.length === 0) continue;
    if (cs.length === 1) { out.push(termNode(cs[0], k)); continue; }
    const sum = add(...cs.map((c) => (c < 0n ? neg(num(-c)) : num(c))));
    const xpow = k === 0 ? undefined : k === 1 ? v(X) : pow(v(X), num(2));
    out.push(xpow ? mul(group(sum), xpow) : group(sum));
  }
  return out.length === 1 ? out[0] : add(...out);
}

/**
 * The collecting step(s): one line "(4 + 3)x + (2 - 1)" when it fits the
 * phone, else one power at a time ("(1 + 5)x^2 + x - 6x", then
 * "6x^2 + (1 - 6)x"), so the step is never dropped for width.
 * @param {Part[]} terms distributed @returns {Node[]}
 */
function collectedLines(terms) {
  const all = collected(terms);
  if (fitsDisplay(all)) return [all];
  const ts = /** @type {{ t: 'term'; c: bigint; k: number }[]} */ (terms);
  /** @type {Node[]} */
  const out = [];
  const done = new Set();
  for (const k of [2, 1, 0]) {
    const these = ts.filter((t) => t.k === k);
    if (these.length < 2) continue;
    /** @type {Node[]} */
    const parts = [];
    for (const j of [2, 1, 0]) {
      const cs = ts.filter((t) => t.k === j).map((t) => t.c);
      if (cs.length === 0) continue;
      if (done.has(j)) parts.push(termNode(cs.reduce((a, b) => a + b, 0n), j));
      else if (j === k) parts.push(collected(ts.filter((t) => t.k === j)));
      else parts.push(...ts.filter((t) => t.k === j).map((t) => termNode(t.c, j)));
    }
    out.push(parts.length === 1 ? parts[0] : add(...parts));
    done.add(k);
  }
  return out;
}

/** The constant term of a polynomial in x (its value at x = 0), as a sign source. @param {Node} n @returns {bigint} */
function polyConst(n) {
  const s = valueAt(n, 0);
  if (!s) throw new Error(`${GEN.id}: cannot evaluate ${print(n)} at x = 0`);
  return s.n;
}

/** Exact value at x = p. @param {Node} n @param {number} p */
function valueAt(n, p) {
  const s = evaluate(n, { x: q(p) });
  return s ? toQ(s) : undefined;
}

/**
 * The written shape of a tree: numbers become N, the variable v; signs,
 * powers and brackets are kept. Two forms with the same shape differ only in
 * their numbers.
 * @param {Node} n @returns {string}
 */
export function shapeOf(n) {
  switch (n.t) {
    case 'num': return n.q.n === 1n && n.q.d === 1n ? '1' : 'N';
    case 'var': return 'v';
    case 'neg': return `-${shapeOf(n.arg)}`;
    case 'add': return `(${n.args.map(shapeOf).join('+')})`;
    case 'mul': return n.args.map(shapeOf).join('*');
    case 'frac': return `[${shapeOf(n.num)}/${shapeOf(n.den)}]`;
    case 'pow': return `${shapeOf(n.base)}^${shapeOf(n.exp)}`;
    case 'root': return `R${shapeOf(n.radicand)}`;
    case 'group': return `g${shapeOf(n.arg)}`;
  }
}

// ---------------------------------------------------------------- draws

/** No "2 + 2 = 2 x 2": two like coefficients that are both 2. @param {Part[]} parts */
function coincidence(parts) {
  for (const k of [0, 1, 2]) {
    const cs = distributed(parts).filter((p) => p.t === 'term' && p.k === k).map((p) => /** @type {{ c: bigint }} */ (p).c);
    if (cs.length >= 2 && cs.filter((c) => c === 2n).length >= 2) return true;
  }
  return false;
}

/**
 * The parts of a plain item (twin, predict, strike) at each difficulty.
 * @param {Rng} r @param {number} d @returns {Part[] | undefined}
 */
function drawPlain(r, d) {
  /** @type {Part[]} */
  let parts;
  if (d === 1) {
    const one = r.bool(0.3);
    parts = [{ t: 'term', c: one ? 1n : pos(r, 2, 9), k: 1 }, { t: 'term', c: pos(r, 2, 9), k: 1 }, { t: 'term', c: pos(r, 1, 9), k: 0 }];
    if (r.bool(0.4)) parts.push({ t: 'term', c: pos(r, 1, 9), k: 0 });
  } else if (d === 2) {
    parts = [{ t: 'term', c: signed(r, 1, 9), k: 1 }, { t: 'term', c: signed(r, 1, 9), k: 1 }, { t: 'term', c: signed(r, 1, 9), k: 0 }, { t: 'term', c: signed(r, 1, 9), k: 0 }];
  } else if (d === 3) {
    // 3 or 4 terms: four terms with an x^2 rarely fit the phone (19 characters)
    parts = [{ t: 'term', c: signed(r, 1, 5), k: 2 }, { t: 'term', c: signed(r, 1, 5), k: 2 }, { t: 'term', c: signed(r, 1, 9), k: 1 }];
    const extra = r.int(0, 2);
    if (extra === 1) parts.push({ t: 'term', c: signed(r, 1, 9), k: 1 });
    else if (extra === 2) parts.push({ t: 'term', c: signed(r, 1, 9), k: 0 });
  } else {
    parts = [{ t: 'prod', A: signed(r, 2, 6), b: pos(r, 1, 3), c: signed(r, 1, 9) }, { t: 'term', c: signed(r, 1, 9), k: 1 }];
    if (r.bool(0.6)) parts.push({ t: 'term', c: signed(r, 1, 9), k: 0 });
  }
  parts = r.shuffle(parts);
  const cs = combine(parts);
  if (cs.every((c) => c === 0n)) return undefined;
  // every power that appears keeps a nonzero total (no term vanishes: that is the Why's job)
  for (const k of [0, 1, 2]) {
    const has = distributed(parts).some((p) => p.t === 'term' && p.k === k);
    if (has && cs[k] === 0n) return undefined;
  }
  // like terms really to combine: some power appears twice (after distributing)
  const counts = [0, 1, 2].map((k) => distributed(parts).filter((p) => p.t === 'term' && p.k === k).length);
  if (!counts.some((n) => n >= 2)) return undefined;
  if (coincidence(parts)) return undefined;
  return parts;
}

/**
 * The parts of a Next Line item: always with a product (see the header).
 * @param {Rng} r @param {number} d @returns {Part[] | undefined}
 */
function drawProduct(r, d) {
  /** @type {Part[]} */
  let parts;
  if (d === 1) {
    // the number inside may be negative: with every number positive the key
    // would always hold the larger constant (A c > c), a tell
    parts = [{ t: 'prod', A: pos(r, 2, 5), b: 1n, c: signed(r, 1, 9) }, { t: 'term', c: pos(r, 1, 9), k: 1 }];
    if (r.bool()) parts.push({ t: 'term', c: pos(r, 1, 9), k: 0 });
  }
  else if (d === 2) {
    parts = [{ t: 'prod', A: pos(r, 2, 6), b: 1n, c: signed(r, 1, 9) }, { t: 'term', c: signed(r, 1, 9), k: 1 }];
    if (r.bool()) parts.push({ t: 'term', c: signed(r, 1, 9), k: 0 });
  } else if (d === 3) {
    parts = [{ t: 'prod', A: -pos(r, 2, 6), b: pos(r, 1, 3), c: signed(r, 1, 9) }, { t: 'term', c: signed(r, 1, 9), k: 1 }];
    if (r.bool()) parts.push({ t: 'term', c: signed(r, 1, 9), k: 0 });
  } else {
    parts = [{ t: 'prod', A: signed(r, 2, 5), b: 1n, c: signed(r, 1, 9) }, { t: 'prod', A: signed(r, 2, 5), b: 1n, c: signed(r, 1, 9) }];
  }
  parts = r.shuffle(parts);
  const cs = combine(parts);
  if (cs[1] === 0n || cs[0] === 0n) return undefined;
  if (coincidence(parts)) return undefined;
  return parts;
}

// ---------------------------------------------------------------- near misses (twin)

/**
 * Different partners for the Twin, written like the combined answer: each a
 * real slip (see the header). Returned as coefficient lists.
 * @param {Part[]} parts @param {number} d @returns {bigint[][]}
 */
function nearMisses(parts, d) {
  const terms = /** @type {{ t: 'term'; c: bigint; k: number }[]} */ (distributed(parts));
  const right = combine(parts);
  /** @type {bigint[][]} */
  const out = [];
  // a minus sign dropped from a later term (the first term's sign is never the slip)
  terms.forEach((t, i) => {
    if (i === 0 || t.c >= 0n) return;
    const cs = right.slice();
    cs[t.k] += -2n * t.c;
    out.push(cs);
  });
  // a lone x (coefficient 1 or -1) counted as 0
  for (const t of terms) {
    if (t.k === 0 || (t.c !== 1n && t.c !== -1n)) continue;
    const cs = right.slice();
    cs[t.k] -= t.c;
    out.push(cs);
  }
  // the two coefficients of a power multiplied instead of added (positive terms only, d1-d2)
  if (d <= 2) {
    for (const k of [1]) {
      const cs0 = terms.filter((t) => t.k === k).map((t) => t.c);
      if (cs0.length === 2 && cs0[0] > 1n && cs0[1] > 1n) {
        const cs = right.slice();
        cs[k] = cs0[0] * cs0[1];
        out.push(cs);
      }
    }
  }
  // x^2 and x coefficients exchanged
  if (d === 3 && right[2] !== right[1]) out.push([right[0], right[2], right[1]]);
  return out;
}

// ---------------------------------------------------------------- items

/**
 * @param {Rng} r @param {Part[]} parts @param {GenOpts} opts @param {string} seed
 * @param {boolean} want (twin only: a Same pair; drawn once per seed so that rejection does not skew the half)
 * @returns {Problem | undefined}
 */
function item(r, parts, opts, seed, want) {
  const math = written(parts);
  const key = simp(math);
  const cs = combine(parts);
  if (print(key) !== print(polyOf(cs))) throw new Error(`${GEN.id}: combined form disagrees with the coefficients (seed ${JSON.stringify(seed)})`);
  const hasProduct = parts.some((p) => p.t === 'prod');
  const dist = distributed(parts);
  /** @type {Node[]} */
  const lines = [math];
  if (hasProduct) lines.push(written(dist));
  lines.push(...collectedLines(dist), key);
  /** @type {Step[]} */
  const steps = lines
    .filter((line, i) => i === 0 || i === lines.length - 1 || fitsDisplay(line))
    .filter((line, i, a) => i === 0 || print(line) !== print(a[i - 1]))
    .map((line) => ({ line, legal: true }));
  const env = { variableKeys: [X], probes: probeEnvs([X]) };
  const finished = hasProduct ? ['expanded', 'combined'] : ['combined'];
  /** @param {string[]} formPredicates */
  const spec = (formPredicates) => ({ kind: /** @type {const} */ ('expr'), expected: key, formPredicates, assumptions: [] });

  switch (opts.interaction) {
    case 'predict':
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: hasProduct ? 'Distribute, then combine like terms' : 'Combine like terms', math },
        answer: spec(finished), steps, visuals: VISUALS, ...env,
      });
    case 'strike':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Simplify', math }, answer: spec(['expanded', 'combined']), steps, visuals: VISUALS, ...env });
    case 'nextline': {
      const p = makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Distribute, then combine like terms', math }, answer: spec(['expanded', 'combined']), steps, visuals: VISUALS, ...env,
      });
      const wrong = malChoices(p, RULES);
      if (!wrong || wrong.length === 0) return undefined;
      // each distractor shown combined, like the key (tag honesty compares values)
      const shown = wrong.map((c) => ({ ...c, display: simp(/** @type {Node} */ (c.display)) }));
      const all = [key, ...shown.map((c) => /** @type {Node} */ (c.display))];
      if (exprVoteFindsKey(all)) return undefined;
      // the key is neither the one longest nor the one shortest candidate
      const lens = all.map((n) => print(n).length);
      if (lens.slice(1).every((l) => l < lens[0]) || lens.slice(1).every((l) => l > lens[0])) return undefined;
      // nor the one candidate whose constant has the odd sign out (review
      // finding 3: that alone found the d3 key 93% of the time)
      if (all.length >= 3) {
        const negs = all.map((n) => polyConst(n) < 0n);
        if (negs.filter((x) => x === negs[0]).length === 1) return undefined;
      }
      return { ...p, choices: shuffledChoices(r.fork('choices'), [{ display: key, verdict: 'correct' }, ...shown]) };
    }
    case 'twin': {
      const tr = r.fork('twin');
      const p0 = tr.pick(PROBE_VALUES);
      /** @type {Node} */
      let twin = key;
      if (!want) {
        /** @type {Node[]} */
        const cands = nearMisses(parts, opts.difficulty).map(polyOf);
        if (hasProduct) {
          const base = makeProblem(GEN, seed, opts, { prompt: { verb: 'Same value?', math }, answer: spec([]) });
          for (const rule of RULES) for (const out of rule.applyAll(base)) cands.push(simp(/** @type {Node} */ (out)));
        }
        const ok = cands.filter((c) => shapeOf(c) === shapeOf(key) && equivExpr(c, key).equal === false);
        if (ok.length === 0) return undefined;
        twin = tr.pick(ok);
      }
      const equal = equivExpr(math, twin).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      const at = valueAt(math, p0);
      const other = valueAt(twin, p0);
      if (!at || !other || (at.d === 1n && (at.n === 0n || at.n === 1n))) return undefined; // a key of 0 or 1 is too guessable
      if (!want && at.n * other.d === other.n * at.d) return undefined; // the named x must split a different pair
      const prompt = { verb: 'Same value?', math, twin, goal: `Find the first form's value at x = ${p0}.` };
      const draft = makeProblem(GEN, seed, opts, {
        prompt, choices: twinChoices(prompt, want),
        answer: { kind: 'expr', expected: qNode(at), formPredicates: ['single-number'], assumptions: [] },
        steps, visuals: VISUALS, ...env,
      });
      if (want) return draft;
      // tag "same" with the rule that turns one form into the other, if exactly one does
      const hits = diagnose(draft, TWIN_SAME).misconceptions;
      if (hits.length > 1) return undefined;
      return { ...draft, choices: twinChoices(prompt, false, hits[0]) };
    }
    case 'why':
      return whyItem(r.fork('why'), opts, seed);
    default:
      return undefined;
  }
}

/**
 * Does the "majority vote" attack find the key of an expression choice item?
 * It reads no mathematics: each candidate scores the number of candidates
 * that share each of its written terms; a unique top score is the pick.
 * @param {Node[]} cands key first
 */
export function exprVoteFindsKey(cands) {
  const termsOf = (/** @type {Node} */ n) => {
    const s = n.t === 'group' ? n.arg : n;
    return (s.t === 'add' ? s.args : [s]).map((t) => print(t));
  };
  /** @type {Record<string, number>} */
  const count = {};
  for (const c of cands) for (const t of new Set(termsOf(c))) count[t] = (count[t] ?? 0) + 1;
  const score = cands.map((c) => termsOf(c).reduce((s, t) => s + count[t], 0));
  return score.slice(1).every((x) => x < score[0]);
}

/**
 * The hidden-0 Why: "(3x - 3x) + (4 + 5)" (see the header).
 * @param {Rng} r @param {GenOpts} opts @param {string} seed @returns {Problem | undefined}
 */
function whyItem(r, opts, seed) {
  const d = opts.difficulty;
  // the two kinds that are paired: x terms and numbers (x^2 pairs do not fit
  // a phone: "(3x^2 - 3x^2) + (4x + 5x)" is 25 characters)
  const [k1, k2] = [1, 0];
  const zeroFirstKind = r.bool(); // is the zero-pair made of the x terms?
  const a = BigInt(r.int(2, 9)) * (d === 1 || r.bool() ? 1n : -1n);
  // the other pair has a minus about half the time too (else "the bracket
  // with a minus" would find the zero-pair); at d1 its total stays positive
  const b = d === 1 ? pos(r, 2, 9) : signed(r, 1, 9);
  const c = signed(r, 1, 9);
  if (b + c === 0n || (d === 1 && b + c < 0n)) return undefined;
  const zk = zeroFirstKind ? k1 : k2;
  const ok = zeroFirstKind ? k2 : k1;
  const zeroPair = group(add(termNode(a, zk), termNode(-a, zk)));
  const otherPair = group(add(termNode(b, ok), termNode(c, ok)));
  const zeroFirst = r.bool();
  const shown = zeroFirst ? add(zeroPair, otherPair) : add(otherPair, zeroPair);
  const zi = zeroFirst ? 0 : 1;
  const oi = 1 - zi;
  // the item as first written: the four terms interleaved
  const original = add(termNode(a, zk), termNode(b, ok), termNode(-a, zk), termNode(c, ok));
  const result = termNode(b + c, ok);
  return makeProblem(GEN, seed, opts, {
    variant: 'hidden-0',
    prompt: { verb: 'Tap the hidden 0', math: shown, goal: 'Like terms were grouped. Tap the pair that is worth 0.' },
    choices: tapTargets(shown, [`e.${zi}`, `e.${oi}`, `e.${zi}.0.0`, `e.${oi}.0.0`].sort(), `e.${zi}`),
    answer: { kind: 'expr', expected: num(0), formPredicates: [], assumptions: [] },
    steps: [original, shown, result].map((line) => ({ line, legal: true })),
    visuals: ['zeropair', 'tiles'], variableKeys: [X], probes: probeEnvs([X]),
  });
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['twin', 'nextline', 'predict', 'strike', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    const want = rng.fork('same').bool();
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      /** @type {Problem | undefined} */
      let p;
      if (opts.interaction === 'why') p = whyItem(r.fork('why'), opts, seed);
      else {
        const parts = opts.interaction === 'nextline' ? drawProduct(r.fork('params'), opts.difficulty) : drawPlain(r.fork('params'), opts.difficulty);
        if (!parts) return undefined;
        p = item(r, parts, opts, seed, want);
      }
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
