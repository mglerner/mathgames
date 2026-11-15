// @ts-check
// rational-exponents (skill 26, DESIGN.md section 4): a^(1/2) is the number
// whose square is a, because (a^(1/2))^2 = a^(1/2 x 2) = a^1 (section 7: "so
// 9^(1/2) is the number whose square is 9"). Built on the recipe in
// ../common.js, following src/gen/stacks-roots/sqrt-squared.core.js. The
// named Forge "(9^?)^2 = 9^1" is its own generator,
// rational-exponents.forge.js.
//
// Forms (section 4 gives no per-skill difficulty; this is my reading,
// reported). Every base is a number, or a variable declared >= 0 (d3):
//   single   B^(1/2)                    value: the number whose square is B
//   squared  (B^(1/2))^2                value: B
//   product  B^(1/2) B^(1/2)            value: B   (adds the exponents: prereq 18)
//   d1  single or squared (predict: squared or product), B = p^2 with p in
//       3..9: 14 distinct prompts per interaction (every number shown inside
//       the times table; p = 2 is out because 4/2 = 2: the Halver lands on
//       the key there). 49^(1/2) = 7; (49^(1/2))^2 = 49.
//   d2  squared or product, B squarefree in 2..19: the value is B and is
//       reachable ONLY through the idea (no root of B is a whole number).
//   d3  squared or product of a variable v >= 0 (declared and printed with
//       the item), times a coefficient k in 1..9: k(v^(1/2))^2 = k v. The
//       teacher's example (a^(1/2))^2 = a is k = 1, v = a (TEACHER_SEED).
//   d4  fraction bases: single (p^2/q^2)^(1/2) = p/q, or squared / product
//       of a/b (a, b in 2..9, coprime, a/b not a square of a fraction).
// Not offered: other rational powers (a^(3/2), a^(1/3)): they are beyond
// "the number whose square is a", and the math core cannot evaluate most
// cube roots exactly.
//
// Interactions:
//   strike   "Evaluate" (d1, d2, d4: a single number) / "Simplify" (d3:
//            'no-radical', so (x^(1/2))^2 retyped or sqrt(x)sqrt(x) is "same
//            value, not finished").
//   predict  "Evaluate" ("Simplify" at d3), goal "Square the 1/2 power" on a
//            squared form, "Two equal 1/2 powers multiplied" on a product
//            form (I3 follows the Forge at fade 2+); key the value,
//            'no-radical'. Never the single form. The exponent rule is in
//            the steps' reasons, not the instruction (review finding 13).
//   twin     I5, with visuals. The prompt form against one of:
//              Same       its value; its root form (sqrt(B), sqrt(B)^2,
//                         sqrt(B)sqrt(B)); or its worked step (B^1, for
//                         the product form too, or (r^2)^(1/2)).
//              Different  the Halver's reading (tagged half-power-is-half;
//                         only where it is drawn like the Same forms: a
//                         whole number from 2 to 100 at d1 / d2, a plain
//                         monomial at d3, a fraction at d4), or an untagged
//                         near miss written like one of the Same forms:
//                         like the value (d1 single: p +- 1; d4 single:
//                         q/p; squared / product: the "forgot the square"
//                         number p, n^2, (a/b)^2; d3: the 2 multiplied in,
//                         2kv, or k^2 v for k(v^(1/2))^2), like the root
//                         form in its own written shape (single: sqrt(p),
//                         sqrt(q^2/p^2); squared / product: sqrt(F)^2 or
//                         sqrt(F)sqrt(F) on the "forgot the square" number
//                         F; d3: c sqrt(v)^2), or like the worked step
//                         ((B^2)^(1/2) for a single form; F^1, c v^1 at d3,
//                         so an exponent 1 is not a Same tell). The
//                         product form's Same step is B^1 (not
//                         B^(1/2 + 1/2), which had no Different
//                         look-alike). Near misses that a rule does model
//                         are rejected (their tag would be missing).
//            So every written shape of the second form (number, root,
//            power, fraction) comes up both Same and Different (pinned by
//            the test).
//            No form of 1 or 0 joins a Same pair, so the follow-up key is
//            the common value (numeric) or the first form's value at the
//            probe named in the goal (d3). A Different numeric pair keys
//            both values (a tuple; no form predicate when one of them is a
//            root, since sqrt(7) is its own exact value).
//   why      'hidden-1' (counting): two fractions side by side, and exactly
//            one is worth 1: F / V (the form over its value), or 1 time in 3
//            B^(1/2) / sqrt(B) (the definition: 7^(1/2)/sqrt(7)). The other
//            is a look-alike F' / W on another form of the same difficulty
//            that is NOT worth 1: the base over itself under a 1/2 power
//            (49^(1/2)/49: the numbers match, the value is 1/7), the
//            Halver's reading (64^(1/2)/32), a near-miss value
//            ((64^(1/2))^2/8), or a squared form over the root
//            ((7^(1/2))^2/sqrt(7) = sqrt(7)). So "tap the fraction whose
//            numbers match", "the one with a square in it" and "the
//            smaller bottom" do not find the 1 reliably (the test pins
//            those guessers at or under 2/3).
//            Targets: both fractions and both numerators.
// Every item carries the worked chain in `steps`: the one step this learner
// needs, B^(1/2 x 2) = B^1 written out:
//   49^(1/2) -> (7^2)^(1/2) -> 7^1 -> 7
//   (7^(1/2))^2 -> 7^1 -> 7;  7^(1/2)7^(1/2) -> 7^(1/2 + 1/2) -> 7^1 -> 7
// Each move carries a Step.reason, and the last says what the 1/2 power IS
// (section 7): "So 49^(1/2) is the number whose square is 49: 7, because
// 7 x 7 = 49." (review finding 13).
//
// Mal-rules separated here: half-power-is-half (16) (strike, predict,
// twin), form-change-changes-value (2) (twin). A typed (n^(1/2))^2 -> n^2
// is a wrong answer left unclassified: root-square-overshoot (18) reads
// square roots only (reported as a need).
//
// Documented seeds (pinned by test/gen/rational-exponents.test.js):
//   TEACHER_SEED at d3: (a^(1/2))^2 in strike, predict and twin (the
//     teacher's example; strike key a, a >= 0 declared).
//   HALVER_SEED at d1: 9^(1/2) in strike (key 3; the Halver's 9/2 is tagged).
//
// Display width: a fixed, pure estimate (powWidth below) that draws
// exponents at superscript size and fractions stacked. The harness
// re-checks every displayed tree with the real mathdom estimate.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll,
  twinChoices, tapTargets, probeEnvs, PROBE_VALUES_NONNEG, DISPLAY_CAP_PX, TWIN_SAME,
} from '../common.js';
import { num, mul, frac, pow, sqrt, add, v as vnode, isEquation } from '../../math/ast.js';
import { q, gcd } from '../../math/rational.js';
import { constQ, evaluate } from '../../math/evaluate.js';
import { toQ } from '../../math/surd.js';
import { equivExpr } from '../../math/equiv.js';
import { qNode } from '../../misc/kit.js';
import { print } from '../../math/print.js';
import { diagnose } from '../../misc/diagnose.js';
import halver from '../../misc/malrules/half-power-is-half.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../common.js').GenOpts} GenOpts */
/**
 * base: the number B (numeric forms) or undefined (d3, a variable).
 * root: for a single form, the rational whose square is B.
 * @typedef {{ shape: 'single' | 'squared' | 'product'; base?: Q; root?: Q; v?: string; k: bigint }} Form
 */

const GEN = Object.freeze({ id: 'rational-exponents.core', version: 1, skill: 'rational-exponents' });

/** makeRng(TEACHER_SEED) at d3: (a^(1/2))^2 in strike, predict and twin. Pinned by the test. */
export const TEACHER_SEED = 'parent-example-33';
/** makeRng(HALVER_SEED) at d1: 9^(1/2) in strike (the section 5 Halver script's item). Pinned by the test. */
export const HALVER_SEED = 'halver-70';

const SQUAREFREE = Object.freeze([2n, 3n, 5n, 6n, 7n, 10n, 11n, 13n, 14n, 15n, 17n, 19n]);
const VARS = Object.freeze(['a', 'b', 'm', 't', 'x', 'y']);
const HALF = q(1, 2);
const VISUALS = Object.freeze(['squareplot', 'numberline']);

// ---------------------------------------------------------------- width

/**
 * Fixed width estimate in CSS px, for fitsAll: 15px a glyph, a superscript
 * at 0.7 of its base size, a fraction as wide as its wider part, a radical
 * sign 16px. Pure, so a seed gives the same item everywhere; the harness
 * re-checks with render/mathdom.js.
 * @param {Node} n @returns {number}
 */
function w(n) {
  switch (n.t) {
    case 'num': return n.q.d === 1n ? 15 * String(n.q.n).length : 15 * Math.max(String(n.q.n).length, String(n.q.d).length) + 8;
    case 'var': return 15;
    case 'group': return w(n.arg) + 16;
    case 'neg': return 15 + w(n.arg);
    case 'add': return n.args.reduce((s, a) => s + w(a), 0) + 30 * (n.args.length - 1);
    case 'mul': return n.args.reduce((s, a) => s + w(a) + (a.t === 'add' ? 16 : 0), 0) + 10 * (n.args.length - 1);
    case 'frac': return Math.max(w(n.num), w(n.den)) + 8;
    case 'pow': return w(n.base) + (n.base.t === 'var' || (n.base.t === 'num' && n.base.q.d === 1n) ? 0 : 16) + 0.7 * w(n.exp);
    case 'root': return 18 + w(n.radicand);
  }
  return 1000;
}

/** @param {Node | Equation} x @returns {number} */
function powWidth(x) {
  return 1.3 * (isEquation(x) ? w(x.lhs) + w(x.rhs) + 30 : w(x)) + 8;
}

// ---------------------------------------------------------------- forms

/** @param {bigint} k @returns {Q} */
const qi = (k) => q(k);

/** The base as a node: a whole number, a fraction a/b, or the variable. @param {Form} f @returns {Node} */
function baseNode(f) {
  if (f.v) return vnode(f.v);
  const b = /** @type {Q} */ (f.base);
  return b.d === 1n ? num(b.n) : frac(num(b.n), num(b.d));
}

/** k x node (node itself when k is 1). @param {bigint} k @param {Node} n @returns {Node} */
function coef(k, n) {
  if (k === 1n) return n;
  return n.t === 'mul' ? mul(num(k), ...n.args) : mul(num(k), n);
}

/** B^(1/2). @param {Form} f */
const half = (f) => pow(baseNode(f), num(1, 2));

/** The prompt form. @param {Form} f @returns {Node} */
function formNode(f) {
  if (f.shape === 'single') return half(f);
  if (f.shape === 'squared') return coef(f.k, pow(half(f), num(2)));
  return coef(f.k, mul(half(f), half(f)));
}

/** The same form with a radical sign for the 1/2 power. @param {Form} f @returns {Node} */
function rootForm(f) {
  const r = sqrt(baseNode(f));
  if (f.shape === 'single') return r;
  if (f.shape === 'squared') return coef(f.k, pow(r, num(2)));
  return coef(f.k, mul(r, sqrt(baseNode(f))));
}

/** The value of the form as a node (k v at d3). @param {Form} f @returns {Node} */
function valueNode(f) {
  if (f.v) return coef(f.k, vnode(f.v));
  return qNode(/** @type {Q} */ (f.shape === 'single' ? f.root : f.base));
}

/** Rational value of a numeric form. @param {Form} f @returns {Q} */
function valueQ(f) { return /** @type {Q} */ (f.shape === 'single' ? f.root : f.base); }

/** The worked chain: B^(1/2 x 2) = B^1 written out. @param {Form} f @returns {Node[]} */
function chain(f) {
  const math = formNode(f);
  if (f.shape === 'single') {
    const r = qNode(/** @type {Q} */ (f.root));
    return [math, pow(pow(r, num(2)), num(1, 2)), pow(r, num(1)), r];
  }
  const one = coef(f.k, pow(baseNode(f), num(1)));
  const mid = f.shape === 'product' ? [coef(f.k, pow(baseNode(f), add(num(1, 2), num(1, 2))))] : [];
  return [math, ...mid, one, valueNode(f)];
}

/**
 * The definition, as section 7 words it: "9^(1/2) is the number whose square
 * is 9" (review finding 13), with "square it and see" when the root is a
 * rational number.
 * @param {Form} f @returns {string}
 */
function definition(f) {
  const B = f.v ?? print(baseNode(f));
  const Bp = f.v || (/** @type {Q} */ (f.base)).d === 1n ? B : `(${B})`;
  const base = `${Bp}^(1/2) is the number whose square is ${B}`;
  if (f.v) return `${base} (${f.v} >= 0).`;
  const rt = f.shape === 'single' ? /** @type {Q} */ (f.root) : undefined;
  if (rt) { const t = print(qNode(rt)); const tp = rt.d === 1n ? t : `(${t})`; return `${base}: ${t}, because ${tp} x ${tp} = ${B}.`; }
  return `${base}.`;
}

/** The worked chain as steps, each move with its reason. @param {Form} f @returns {Step[]} */
function chainSteps(f) {
  const lines = chain(f);
  const r = (/** @type {number} */ i) => {
    if (i === 0) return undefined;
    if (f.shape === 'single') {
      const rt = print(qNode(/** @type {Q} */ (f.root)));
      return [undefined, `${print(baseNode(f))} is ${rt} squared.`, 'A power of a power: multiply the exponents, (2)(1/2) = 1.', `So ${definition(f)}`][i];
    }
    const last = i === lines.length - 1;
    if (last) return `${f.shape === 'product' ? 'The 1/2 power times itself' : 'Squaring the 1/2 power'} gives back the base, so ${definition(f)}`;
    if (f.shape === 'product') return i === 1 ? 'Same base: add the exponents.' : '1/2 + 1/2 = 1.';
    return 'A power of a power: multiply the exponents, (1/2)(2) = 1.';
  };
  return lines.map((line, i) => { const reason = r(i); return reason ? { line, legal: true, reason } : { line, legal: true }; });
}

/** The assumptions of a form: its variable declared >= 0 (or > 0). @param {Form} f @param {'nonneg' | 'pos'} [rel] @returns {Assumption[]} */
function assumptionsOf(f, rel = 'nonneg') { return f.v ? [{ name: f.v, rel }] : []; }

/** @param {bigint} n */
function isSquare(n) {
  if (n < 0n) return false;
  let r = 0n;
  while (r * r < n) r++;
  return r * r === n;
}

/**
 * @param {Rng} r @param {number} d @param {readonly Form['shape'][]} [shapes] restrict the shape
 * @returns {Form | undefined}
 */
function draw(r, d, shapes) {
  if (d === 1) {
    const shape = r.pick(shapes ?? /** @type {const} */ (['single', 'squared']));
    const p = BigInt(r.int(3, 9));
    return { shape, base: qi(p * p), root: qi(p), k: 1n };
  }
  if (d === 2) {
    const shape = r.pick(shapes ?? /** @type {const} */ (['squared', 'product']));
    if (shape === 'single') return undefined;
    return { shape, base: qi(r.pick(SQUAREFREE)), k: 1n };
  }
  if (d === 3) {
    const shape = r.pick(shapes ?? /** @type {const} */ (['squared', 'product']));
    if (shape === 'single') return undefined;
    return { shape, v: r.pick(VARS), k: BigInt(r.int(1, 9)) };
  }
  const shape = r.pick(shapes ?? /** @type {const} */ (['single', 'squared', 'product']));
  const a = BigInt(r.int(2, 9));
  const b = BigInt(r.int(2, 9));
  if (a === b || gcd(a, b) !== 1n) return undefined;
  if (shape === 'single') return { shape, base: q(a * a, b * b), root: q(a, b), k: 1n };
  if (isSquare(a) && isSquare(b)) return undefined; // (4/9)^(1/2) belongs to the single form
  return { shape, base: q(a, b), k: 1n };
}

// ---------------------------------------------------------------- twin partners

/** The Halver's output on the form, or undefined. @param {Form} f @param {GenOpts} opts @param {string} seed @returns {Node | undefined} */
function halverOf(f, opts, seed) {
  const base = makeProblem(GEN, seed, opts, {
    prompt: { verb: 'Same value?', math: formNode(f) },
    answer: { kind: 'expr', expected: valueNode(f), formPredicates: [], assumptions: [] },
    assumptions: assumptionsOf(f),
  });
  const out = halver.apply(base);
  return out && 't' in out && out.t !== 'eq' ? /** @type {Node} */ (out) : undefined;
}

/**
 * A Halver output that is drawn like the Same partners: a whole number at
 * most 100 (d1, d2), a plain monomial with a whole coefficient (d3), a
 * fraction (d4, where every partner is one).
 * @param {Node} out @param {number} d
 */
function halverLooksLikeSame(out, d) {
  if (d === 3) return out.t === 'pow' || (out.t === 'mul' && out.args.length === 2 && out.args[0].t === 'num' && out.args[0].q.d === 1n);
  const val = out.t === 'num' || out.t === 'frac' ? constQ(out) : undefined;
  if (!val) return false;
  if (d === 4) return true;
  return val.d === 1n && val.n <= 100n && val.n > 1n;
}

/**
 * Near-miss partners (untagged), each written like one of the Same partners:
 * value (like the value), root (like the root form), power (like the worked
 * step B^1 or (r^2)^(1/2)).
 * @param {Rng} r @param {Form} f @param {number} d
 * @returns {{ value: Node; root: Node; power: Node }}
 */
function nearMisses(r, f, d) {
  if (f.v) {
    const x = vnode(f.v);
    // written like k v: the 2 multiplied in ((x^(1/2))^2 read as 2x; 3(x^(1/2))^2 read as 9x, the coefficient squared too)
    const c = f.shape === 'squared' && f.k > 1n ? f.k * f.k : 2n * f.k;
    // the root-form near miss is written like the Same root form (review finding 2)
    // power: c v^1, written like the Same step k v^1 (review finding 2)
    return { value: coef(c, x), root: coef(c, rootLike(f.shape, x)), power: coef(c, pow(x, num(1))) };
  }
  const B = baseNode(f);
  if (f.shape === 'single') {
    const rt = /** @type {Q} */ (f.root);
    const power = pow(pow(B, num(2)), num(1, 2)); // (B^2)^(1/2) = B, not its root
    if (d === 4) return { value: qNode(q(rt.d, rt.n)), root: sqrt(frac(num(rt.d * rt.d), num(rt.n * rt.n))), power };
    return { value: num(rt.n + (r.bool() ? 1n : -1n)), root: sqrt(num(rt.n)), power };
  }
  const b = /** @type {Q} */ (f.base);
  const forgot = d === 1 ? num(/** @type {Q} */ (f.root).n) : qNode(q(b.n * b.n, b.d * b.d));
  // d1 keeps every number inside the times table: (49^(1/2))^2 against 49^(1/2), not 49^2
  // the root-form near miss is written like the Same root form: the
  // "forgot the square" number under the same roots (review finding 2)
  // power: F^1, written like the Same step B^1, so an exponent 1 does not
  // mark the Same partner (review finding 2: "a 1 token -> Same" was 115 / 0).
  // At d1 F is the root p, so every number stays in the times table.
  const powF = pow(forgot, num(1));
  return { value: forgot, root: rootLike(f.shape, forgot), power: powF };
}

/** sqrt(n)^2 or sqrt(n)sqrt(n): the written shape of a squared / product root form. @param {Form['shape']} shape @param {Node} n @returns {Node} */
function rootLike(shape, n) {
  return shape === 'squared' ? pow(sqrt(n), num(2)) : mul(sqrt(n), sqrt(n));
}

// ---------------------------------------------------------------- why

/**
 * A look-alike fraction F' / W that is NOT worth 1, on another form of the
 * same difficulty (see the header).
 * @param {Rng} r @param {Form} g another form @param {number} d @param {GenOpts} opts @param {string} seed
 * @returns {Node | undefined}
 */
function decoy(r, g, d, opts, seed) {
  const kind = r.pick(g.v ? /** @type {const} */ (['self', 'near', 'root']) : /** @type {const} */ (['self', 'halver', 'near', 'root']));
  // (B^(1/2))^2 / sqrt(B): numbers match and a root sits below, but it is sqrt(B), not 1
  if (kind === 'root' && g.shape !== 'single') return frac(formNode(g), sqrt(baseNode(g)));
  if (kind === 'self' || kind === 'root') return frac(half(g), baseNode(g)); // B^(1/2)/B: the numbers match
  if (kind === 'halver') {
    if (g.v) return undefined;
    const out = halverOf(g, opts, seed);
    const val = out && constQ(out);
    if (!out || !val || !halverLooksLikeSame(out, d)) return undefined;
    return frac(formNode(g), qNode(val));
  }
  if (g.v) return frac(formNode(g), pow(vnode(g.v), num(2)));
  return frac(formNode(g), nearMisses(r.fork('near'), g, d).value);
}

/** @param {Node} n @returns {boolean} the node is worth exactly 1 (numeric) */
function worthOne(n) { const v = constQ(n); return !!v && v.n === 1n && v.d === 1n; }

// ---------------------------------------------------------------- items

/**
 * @param {Rng} r @param {Form} f @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, f, opts, seed) {
  const d = opts.difficulty;
  const math = formNode(f);
  const value = valueNode(f);
  /** @type {Step[]} */
  const steps = chainSteps(f);
  const assumptions = assumptionsOf(f);
  const env = f.v ? { variableKeys: [f.v], probes: probeEnvs([f.v], assumptions), assumptions } : {};
  const numeric = !f.v;
  const numberPreds = d === 4 ? ['single-number'] : ['integer'];
  const declared = f.v ? ` (${f.v} >= 0)` : '';

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, {
        prompt: numeric ? { verb: 'Evaluate', math, goal: 'Type the value.' } : { verb: 'Simplify', math, goal: `Write it with no root and no 1/2 power${declared}.` },
        answer: { kind: 'expr', expected: value, formPredicates: numeric ? numberPreds : ['no-radical'], assumptions: [] },
        steps, visuals: [...VISUALS], ...env,
      });
    case 'predict': {
      if (f.shape === 'single') return undefined;
      // the rule lives in the worked steps' reasons, not in the instruction (review finding 13)
      const ask = f.shape === 'squared' ? 'Square the 1/2 power' : 'Two equal 1/2 powers multiplied';
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: numeric ? 'Evaluate' : 'Simplify', math, goal: `${ask}. Type the result${declared}.` },
        answer: { kind: 'expr', expected: value, formPredicates: ['no-radical'], assumptions: [] },
        steps, visuals: [...VISUALS], ...env,
      });
    }
    case 'twin': {
      const tr = r.fork('twin');
      const want = tr.bool();
      /** @type {Node} */ let twin;
      /** @type {string | undefined} */ let tag;
      if (want) {
        // the worked step, written like the Different power near miss: (r^2)^(1/2)
        // against (B^2)^(1/2), and B^1 against B^2 (the product form too: its
        // B^(1/2 + 1/2) line had no Different look-alike, review finding 2)
        const lines = chain(f);
        twin = tr.pick([value, rootForm(f), f.shape === 'product' ? lines[2] : lines[1]]);
      } else {
        const hv = halverOf(f, opts, seed);
        const near = nearMisses(tr.fork('near'), f, d);
        /** @type {{ twin: Node; tag?: string }[]} */
        const pool = [{ twin: near.value }, { twin: near.root }, { twin: near.power }];
        if (hv !== undefined && halverLooksLikeSame(hv, d)) pool.push({ twin: hv, tag: halver.id });
        ({ twin, tag } = tr.pick(pool));
      }
      const equal = equivExpr(math, twin, assumptions).equal;
      if (equal !== want) throw new Error(`${GEN.id}: twin pair is not what was drawn (seed ${JSON.stringify(seed)})`);
      /** @type {import('../../../types.d.ts').AnswerSpec} */
      let answer;
      let goal;
      if (numeric) {
        const tv = evaluate(twin, {});
        if (!tv) return undefined;
        const tq = toQ(tv);
        answer = want
          ? { kind: 'expr', expected: value, formPredicates: numberPreds, assumptions: [] }
          : { kind: 'tuple', expected: [value, tq ? qNode(tq) : twin], formPredicates: tq ? ['single-number'] : [], assumptions: [] };
      } else {
        const x = /** @type {string} */ (f.v);
        const p0 = tr.pick(PROBE_VALUES_NONNEG);
        const at = evaluate(math, { [x]: q(p0) });
        const other = evaluate(twin, { [x]: q(p0) });
        const atQ = at && toQ(at);
        if (!atQ || !other) return undefined;
        if (!want && toQ(other) && toQ(other)?.n === atQ.n && toQ(other)?.d === atQ.d) return undefined; // the named x must split the pair
        answer = { kind: 'expr', expected: qNode(atQ), formPredicates: ['single-number'], assumptions: [] };
        goal = `${x} >= 0. Find the first form's value at ${x} = ${p0}.`;
      }
      const prompt = goal ? { verb: 'Same value?', math, twin, goal } : { verb: 'Same value?', math, twin };
      const p = makeProblem(GEN, seed, opts, {
        prompt, choices: twinChoices(prompt, want, tag), answer, steps, visuals: [...VISUALS], ...env,
      });
      // an untagged near miss must be one no rule models (else its tag would be missing)
      if (!want && tag === undefined && diagnose(p, TWIN_SAME).misconceptions.length > 0) return undefined;
      return p;
    }
    case 'why': {
      const wr = r.fork('why');
      // the hidden 1: F / V, or (1 time in 3) B^(1/2) / sqrt(B), the definition itself. At d3 the
      // variable is declared > 0, so v / v is 1 wherever it is shown.
      const one = wr.fork('one').bool(1 / 3) ? frac(half(f), sqrt(baseNode(f))) : frac(formNode(f), f.v ? vnode(f.v) : valueNode(f));
      /** @type {Form | undefined} */
      let g;
      if (f.v) g = { shape: wr.pick(/** @type {const} */ (['squared', 'product'])), v: f.v, k: 1n };
      else g = draw(wr.fork('other'), d, [f.shape]);
      if (!g || (!g.v && valueQ(g).n === valueQ(f).n && valueQ(g).d === valueQ(f).d)) return undefined;
      const other = decoy(wr.fork('decoy'), g, d, opts, seed);
      if (!other || worthOne(other)) return undefined;
      const oneFirst = wr.bool();
      const shown = oneFirst ? mul(one, other) : mul(other, one);
      const at = oneFirst ? 0 : 1;
      const whyAs = assumptionsOf(f, 'pos');
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: shown, goal: `One of the two fractions is worth exactly 1${f.v ? ` (${f.v} > 0)` : ''}. Tap it.` },
        choices: tapTargets(shown, ['e.0', 'e.0.0', 'e.1', 'e.1.0'], `e.${at}`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        steps, visuals: ['coin', ...VISUALS],
        ...(f.v ? { variableKeys: [f.v], probes: probeEnvs([f.v], whyAs), assumptions: whyAs } : {}),
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 4],
  interactions: ['twin', 'strike', 'predict', 'why'],
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const f = draw(r.fork('params'), opts.difficulty, opts.interaction === 'predict' ? ['squared', 'product'] : undefined);
      if (!f) return undefined;
      // the Why's hidden 1 is F / v: no coefficient there
      const p = item(r, opts.interaction === 'why' && f.v ? { ...f, k: 1n } : f, opts, seed);
      return p && separated(p).ok && fitsAll(p, { estimate: powWidth, capPx: DISPLAY_CAP_PX }) ? p : undefined;
    });
  },
});
