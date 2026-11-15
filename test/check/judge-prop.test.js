// @ts-check
// 5000-seed properties, one per AnswerSpec kind (DESIGN.md section 11 tests;
// M1c task): random items with known answers (test/check/_items.js builds
// the keys forward from integers, not through the judge). For each item:
//   - the key is judged correct in several typed forms;
//   - unfinished forms are 'form' (never a miss);
//   - perturbed answers are 'wrong';
//   - garbage is 'unparsed';
//   - equation items reject the retyped original and the fully solved line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { judge } from '../../src/check/judge.js';
import { answerText, SCALABLE_TUPLE_VARIANT } from '../../src/check/answer-spec.js';
import { applyMove } from '../../src/moves/apply.js';
import { sameSides } from '../../src/math/equiv.js';
import { checkRoot } from '../../src/math/solve.js';
import { seq } from '../../src/math/surd.js';
import { qeq, q } from '../../src/math/rational.js';
import { P, gcd, nz, polyText, polySub, polyScale, problem, garbage, sQ, sPQR, SQUAREFREE } from './_items.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Rng} Rng */
/** @typedef {import('../../types.d.ts').Surd} Surd */

const SEEDS = 5000;

/**
 * @param {Problem} p @param {string} text @param {string} want @param {string} why
 */
function expectVerdict(p, text, want, why) {
  const r = judge(p, text);
  assert.equal(r.verdict, want, `${why}: judge(${JSON.stringify(text)}) gave ${r.verdict} (${r.note ?? ''}${r.error ? `; ${r.error}` : ''}), want ${want}`);
  return r;
}

/** Shared checks: the key text and garbage. @param {Rng} rng @param {Problem} p */
function keyAndGarbage(rng, p) {
  expectVerdict(p, answerText(p.answer), 'correct', 'answerText(key)');
  for (let i = 0; i < 2; i++) expectVerdict(p, garbage(rng), 'unparsed', 'garbage');
}

/** @param {bigint} n @param {bigint} d @returns {string} n/d as typed, d > 0 */
function fracText(n, d) {
  if (d === 1n) return `${n}`;
  return n < 0n ? `-${-n}/${d}` : `${n}/${d}`;
}

/** (x - r) as text. @param {bigint} r */
function linFactor(r) {
  if (r === 0n) return 'x';
  return r > 0n ? `(x - ${r})` : `(x + ${-r})`;
}

/** Coefficients [C, B, A] of c (x - r1)(x - r2). @param {bigint} c @param {bigint} r1 @param {bigint} r2 */
function quadFromRoots(c, r1, r2) { return [c * r1 * r2, -c * (r1 + r2), c]; }

// ---------------------------------------------------------------- expr

test('property: expr items (rational, polynomial, radical)', () => {
  forSeeds(SEEDS, (rng) => {
    const family = rng.int(0, 2);
    if (family === 0) {
      const a = nz(rng, -30, 30);
      const b = BigInt(rng.int(2, 12));
      const g = gcd(a, b);
      const n = a / g; const d = b / g;
      const p = problem({ kind: 'expr', expected: P(fracText(n, d)), formPredicates: ['lowest-terms'], assumptions: [] });
      keyAndGarbage(rng, p);
      expectVerdict(p, fracText(n, d), 'correct', 'key');
      expectVerdict(p, `(${n})/(${d})`, 'correct', 'parenthesized');
      if (n < 0n && d > 1n) expectVerdict(p, `-(${-n}/${d})`, 'correct', 'minus outside');
      const k = BigInt(rng.int(2, 5));
      expectVerdict(p, fracText(n * k, d * k), 'form', 'unreduced');
      expectVerdict(p, fracText(n + 1n, d), 'wrong', 'numerator + 1');
      expectVerdict(p, `${n}/${d + 1n}`, 'wrong', 'denominator + 1');
    } else if (family === 1) {
      const c = nz(rng, -4, 4);
      const r1 = BigInt(rng.int(-6, 6));
      const r2 = BigInt(rng.int(-6, 6));
      const cs = quadFromRoots(c, r1, r2);
      const p = problem({ kind: 'expr', expected: P(polyText(cs)), formPredicates: ['expanded', 'combined'], assumptions: [] });
      keyAndGarbage(rng, p);
      expectVerdict(p, polyText(cs), 'correct', 'descending');
      expectVerdict(p, polyText(cs, { ascending: true }), 'correct', 'ascending');
      expectVerdict(p, polyText(cs, { star: true }), 'correct', 'with *');
      const lead = c === 1n ? '' : c === -1n ? '-' : `${c}`;
      const factored = `${lead}${linFactor(r1)}${linFactor(r2)}`;
      if (r1 !== 0n || r2 !== 0n) {
        const r = expectVerdict(p, factored, 'form', 'factored');
        assert.ok(r.failedForms.includes('expanded'), 'factored fails expanded');
      }
      expectVerdict(p, `${polyText(cs)} + x - x`, 'form', 'uncombined');
      expectVerdict(p, polyText([cs[0] + 1n, cs[1], cs[2]]), 'wrong', 'constant + 1');
      expectVerdict(p, polyText([cs[0], cs[1] + 1n, cs[2]]), 'wrong', 'x coefficient + 1');
    } else {
      const m = BigInt(rng.int(2, 9));
      const s = rng.pick(SQUAREFREE);
      const p = problem({ kind: 'expr', expected: P(`${m}sqrt(${s})`), formPredicates: ['radical-simplified'], assumptions: [] });
      keyAndGarbage(rng, p);
      expectVerdict(p, `${m}*sqrt(${s})`, 'correct', 'with *');
      expectVerdict(p, `sqrt(${s})*${m}`, 'correct', 'radical first');
      const r = expectVerdict(p, `sqrt(${m * m * s})`, 'form', 'unsimplified radical');
      assert.match(r.note ?? '', new RegExp(`${m * m * s} still hides a square`));
      expectVerdict(p, `${m + 1n}sqrt(${s})`, 'wrong', 'coefficient + 1');
      expectVerdict(p, `${m}sqrt(${s + 1n})`, 'wrong', 'radicand + 1');
    }
  });
});

// ---------------------------------------------------------------- equation-sides

test('property: equation-sides (I2/I3 side-wise; original and solved line rejected)', () => {
  forSeeds(SEEDS, (rng) => {
    if (rng.bool()) {
      // a x + b = c, move: subtract b. a is never 1, so the result is not the solved line.
      let a = nz(rng, -9, 9);
      if (a === 1n) a = 2n;
      const r = BigInt(rng.int(-9, 9));
      const b = nz(rng, -9, 9);
      const c = a * r + b;
      const L0 = polyText([b, a]);
      const orig = P(`${L0} = ${c}`);
      const move = /** @type {const} */ ({ op: 'sub', operand: P(`${b}`) });
      const ax = polyText([0n, a]);
      const expected = P(`${ax} = ${c - b}`);
      assert.equal(sameSides(expected, applyMove(move, orig)), true, 'key agrees with applyMove');
      const p = problem({ kind: 'equation-sides', expected, formPredicates: [], assumptions: [] },
        { interaction: 'predict', prompt: { verb: 'Predict', math: orig, move } });
      keyAndGarbage(rng, p);
      expectVerdict(p, `${ax} = ${c - b}`, 'correct', 'result');
      expectVerdict(p, `${c - b} = ${ax}`, 'correct', 'sides swapped');
      expectVerdict(p, `${L0} - (${b}) = ${c} - (${b})`, 'correct', 'unsimplified result');
      expectVerdict(p, `${L0} = ${c}`, 'wrong', 'retyped original');
      expectVerdict(p, `${c} = ${L0}`, 'wrong', 'retyped original, swapped');
      expectVerdict(p, `x = ${r}`, 'wrong', 'fully solved line');
      expectVerdict(p, `${ax} = ${c}`, 'wrong', 'one-sided');
      expectVerdict(p, `${ax} = ${c + b}`, 'wrong', 'transposed sign');
      expectVerdict(p, ax, 'unparsed', 'no = sign');
    } else {
      const cq = nz(rng, -3, 3);
      const r1 = BigInt(rng.int(-6, 6));
      const r2 = BigInt(rng.int(-6, 6));
      const Pc = quadFromRoots(cq, r1, r2);
      const u = nz(rng, -9, 9);
      const w = nz(rng, -9, 9);
      const Lc = [w, u];
      const Rc = polySub(Pc, polyScale(Lc, -1n)); // R0 = P + L0
      const L0 = polyText(Lc);
      const R0 = polyText(Rc);
      const orig = P(`${L0} = ${R0}`);
      const move = /** @type {const} */ ({ op: 'sub', operand: P(L0) });
      const expected = P(`0 = ${polyText(Pc)}`);
      assert.equal(sameSides(expected, applyMove(move, orig)), true, 'key agrees with applyMove');
      const p = problem({ kind: 'equation-sides', expected, formPredicates: [], assumptions: [] },
        { interaction: 'predict', prompt: { verb: 'Predict', math: orig, move } });
      keyAndGarbage(rng, p);
      expectVerdict(p, `0 = ${polyText(Pc)}`, 'correct', 'result');
      expectVerdict(p, `${polyText(Pc)} = 0`, 'correct', 'sides swapped');
      expectVerdict(p, `${polyText(Pc, { ascending: true })} = 0`, 'correct', 'ascending');
      expectVerdict(p, `${L0} - (${L0}) = ${R0} - (${L0})`, 'correct', 'unsimplified result');
      expectVerdict(p, `${L0} = ${R0}`, 'wrong', 'retyped original');
      expectVerdict(p, `x = ${r1}`, 'wrong', 'fully solved line');
      expectVerdict(p, `0 = ${R0}`, 'wrong', 'one-sided');
      expectVerdict(p, `0 = ${polyText([Pc[0] + 1n, Pc[1], Pc[2]])}`, 'wrong', 'constant off by one');
    }
  });
});

// ---------------------------------------------------------------- equation-multiple

test('property: equation-multiple (I8 rewrite as ... = 0)', () => {
  forSeeds(SEEDS, (rng) => {
    const cq = nz(rng, -3, 3);
    const r1 = BigInt(rng.int(-6, 6));
    const r2 = BigInt(rng.int(-6, 6));
    const Pc = quadFromRoots(cq, r1, r2);
    const Lc = [nz(rng, -9, 9), nz(rng, -9, 9)];
    const Rc = polySub(Pc, polyScale(Lc, -1n));
    const origText = `${polyText(Lc)} = ${polyText(Rc)}`;
    const orig = P(origText);
    const p = problem({ kind: 'equation-multiple', expected: orig, formPredicates: ['standard-form'], assumptions: [] },
      { prompt: { verb: 'Rewrite as ... = 0', math: orig } });
    expectVerdict(p, `${polyText(Pc)} = 0`, 'correct', 'P = 0');
    expectVerdict(p, `0 = ${polyText(Pc)}`, 'correct', '0 = P');
    const k = rng.pick([-1n, 2n, -2n, 3n]);
    expectVerdict(p, `${polyText(polyScale(Pc, k))} = 0`, 'correct', `scaled by ${k}`);
    for (let i = 0; i < 2; i++) expectVerdict(p, garbage(rng), 'unparsed', 'garbage');
    expectVerdict(p, origText, 'form', 'retyped original (same equation, not standard form)');
    expectVerdict(p, `x = ${r1}`, 'wrong', 'fully solved line');
    if (Pc.filter((c) => c !== 0n).length >= 2) expectVerdict(p, `${polyText(Pc, { ascending: true })} = 0`, 'form', 'ascending');
    expectVerdict(p, `${polyText([Pc[0] + 1n, Pc[1], Pc[2]])} = 0`, 'wrong', 'constant off by one');
    expectVerdict(p, `x(${polyText(Pc)}) = 0`, 'wrong', 'multiplied by x');
    expectVerdict(p, polyText(Pc), 'unparsed', 'no = sign');
  });
});

// ---------------------------------------------------------------- solution-set

/** @param {Rng} rng @returns {{ n: bigint; d: bigint }} */
function smallRational(rng) {
  const d = BigInt(rng.pick([1, 1, 2, 3]));
  let n = BigInt(rng.int(-12, 12));
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

/** @param {Problem} p @param {string} text @param {number} nMissing @param {number} nExtra @param {string} why */
function expectSetMiss(p, text, nMissing, nExtra, why) {
  const r = expectVerdict(p, text, 'wrong', why);
  assert.equal(r.missing?.length, nMissing, `${why}: missing count`);
  assert.equal(r.extra?.length, nExtra, `${why}: extra count`);
}

test('property: solution-set (complete, missing and extra roots distinguished, plus-minus, no solution, all reals)', () => {
  forSeeds(SEEDS, (rng) => {
    const family = rng.int(0, 4);
    if (family === 0) {
      // two distinct rational roots
      const a = smallRational(rng);
      let b = smallRational(rng);
      while (b.n * a.d === a.n * b.d) b = { n: b.n + 1n, d: b.d };
      const g = gcd(b.n, b.d) || 1n; b = { n: b.n / g, d: b.d / g };
      const ta = fracText(a.n, a.d); const tb = fracText(b.n, b.d);
      const roots = [sQ(a.n, a.d), sQ(b.n, b.d)];
      // Independent key check: both roots satisfy (dx - n)(d'x - n') = 0 by substitution.
      const eqText = `(${a.d}x - (${a.n}))(${b.d}x - (${b.n})) = 0`;
      for (const r of roots) assert.equal(checkRoot(P(eqText), 'x', r), true, 'key root checks');
      const p = problem({ kind: 'solution-set', expected: { kind: 'finite', roots }, formPredicates: [], assumptions: [] });
      keyAndGarbage(rng, p);
      expectVerdict(p, `${ta}, ${tb}`, 'correct', 'list');
      expectVerdict(p, `${tb}, ${ta}`, 'correct', 'other order');
      expectVerdict(p, `x = ${ta}, x = ${tb}`, 'correct', 'with x =');
      expectVerdict(p, `${tb}, ${ta}, ${ta}`, 'correct', 'repeated');
      expectSetMiss(p, ta, 1, 0, 'missing root');
      let c = BigInt(rng.int(13, 20));
      expectSetMiss(p, `${ta}, ${tb}, ${c}`, 0, 1, 'extra root');
      expectSetMiss(p, `${ta}, ${c}`, 1, 1, 'one swapped');
      expectSetMiss(p, 'no solution', 2, 0, 'no solution typed');
      expectVerdict(p, 'all reals', 'wrong', 'all reals typed');
    } else if (family === 1) {
      const a = smallRational(rng);
      const ta = fracText(a.n, a.d);
      const p = problem({ kind: 'solution-set', expected: { kind: 'finite', roots: [sQ(a.n, a.d)] }, formPredicates: [], assumptions: [] });
      keyAndGarbage(rng, p);
      expectVerdict(p, `x = ${ta}`, 'correct', 'x = root');
      expectVerdict(p, `${ta}, ${ta}`, 'correct', 'double root typed twice');
      expectSetMiss(p, `${ta}, ${fracText(a.n + a.d, a.d)}`, 0, 1, 'extra root');
      expectSetMiss(p, fracText(a.n + a.d, a.d), 1, 1, 'wrong root');
    } else if (family === 2) {
      const none = rng.bool();
      const p = problem({ kind: 'solution-set', expected: { kind: none ? 'none' : 'all' }, formPredicates: [], assumptions: [] });
      keyAndGarbage(rng, p);
      expectVerdict(p, none ? 'No Solution' : 'ALL REALS', 'correct', 'key word, case ignored');
      expectVerdict(p, none ? 'all reals' : 'no solution', 'wrong', 'the other word');
      expectVerdict(p, `${rng.int(-9, 9)}`, 'wrong', 'a number');
    } else {
      // p +/- q sqrt(s)
      const pp = BigInt(rng.int(-9, 9));
      const qq = BigInt(rng.int(1, 5));
      const s = rng.pick(SQUAREFREE);
      const roots = [sPQR(pp, -qq, s), sPQR(pp, qq, s)];
      const eqText = `x^2 - ${2n * pp}x + ${pp * pp - qq * qq * s} = 0`;
      for (const r of roots) assert.equal(checkRoot(P(eqText), 'x', r), true, 'key root checks');
      const p = problem({ kind: 'solution-set', expected: { kind: 'finite', roots }, formPredicates: ['radical-simplified'], assumptions: [] });
      keyAndGarbage(rng, p);
      const rad = qq === 1n ? `sqrt(${s})` : `${qq}sqrt(${s})`;
      const head = pp === 0n ? '' : `${pp} `;
      expectVerdict(p, `${head}\u00b1 ${rad}`, 'correct', 'U+00B1 key');
      expectVerdict(p, `${head}+/- ${rad}`, 'correct', '+/-');
      expectVerdict(p, `${pp} + ${rad}, ${pp} - ${rad}`, 'correct', 'both written out');
      expectVerdict(p, `x = ${pp} - ${rad}, x = ${pp} + ${rad}`, 'correct', 'with x =');
      if (qq > 1n) expectVerdict(p, `${head}\u00b1 sqrt(${qq * qq * s})`, 'form', 'unsimplified radical');
      expectSetMiss(p, `${pp} + ${rad}`, 1, 0, 'one sign only');
      // "+-" typed as two characters is plus, negative (section 9): one value.
      expectSetMiss(p, `${pp} +- ${rad}`, 1, 0, '"+-" is plus-negative');
      expectSetMiss(p, `${head}\u00b1 ${qq + 1n === 1n ? '' : qq + 1n}sqrt(${s})`, 2, 2, 'wrong coefficient');
    }
  });
});

// ---------------------------------------------------------------- form-of-1

test('property: form-of-1 (Forge typed: rationalize, common denominator)', () => {
  forSeeds(SEEDS, (rng) => {
    if (rng.bool()) {
      const a = BigInt(rng.int(1, 20));
      const m = BigInt(rng.int(1, 4));
      const s = rng.pick(SQUAREFREE);
      const math = P(m === 1n ? `${a}/sqrt(${s})` : `${a}/(${m}sqrt(${s}))`);
      const p = problem({ kind: 'form-of-1', expected: P(`sqrt(${s})/sqrt(${s})`), formPredicates: ['no-radical-in-denominator'], assumptions: [] },
        { interaction: 'forge', prompt: { verb: 'Forge', math, goal: 'no root in the denominator' } });
      keyAndGarbage(rng, p);
      const k = BigInt(rng.int(2, 7));
      const j = BigInt(rng.int(2, 4));
      expectVerdict(p, `(${k}sqrt(${s}))/(${k}sqrt(${s}))`, 'correct', 'k sqrt / k sqrt');
      expectVerdict(p, `sqrt(${s * j * j})/sqrt(${s * j * j})`, 'correct', 'unsimplified radical coin');
      expectVerdict(p, `${k}/${k}`, 'legal-idle', 'k/k');
      expectVerdict(p, `${s}/${s}`, 'legal-idle', 's/s');
      expectVerdict(p, `sqrt(${s})/1`, 'wrong', 'sqrt/1 is not 1');
      expectVerdict(p, `1/sqrt(${s})`, 'wrong', '1/sqrt is not 1');
      expectVerdict(p, `sqrt(${s})/${s}`, 'wrong', 'sqrt/s is not 1');
    } else {
      let n = nz(rng, -9, 9);
      let d = BigInt(rng.int(2, 9));
      while (gcd(n, d) !== 1n) n += 1n;
      if (n === 0n) n = 1n;
      const k = BigInt(rng.int(2, 6));
      const D = d * k;
      const p = problem({ kind: 'form-of-1', expected: P(`${k}/${k}`), formPredicates: [`denominator:${D}`], assumptions: [] },
        { interaction: 'forge', prompt: { verb: 'Forge', math: P(fracText(n, d)), goal: `denominator ${D}` } });
      keyAndGarbage(rng, p);
      expectVerdict(p, `(${k})/(${k})`, 'correct', 'parenthesized');
      expectVerdict(p, `${k + 1n}/${k + 1n}`, 'legal-idle', '(k+1)/(k+1)');
      expectVerdict(p, `${k}/1`, 'wrong', 'k/1');
      expectVerdict(p, `1/${k}`, 'wrong', '1/k');
      expectVerdict(p, `${k}/${k + 1n}`, 'wrong', 'k/(k+1)');
    }
  });
});

// ---------------------------------------------------------------- form-of-0

test('property: form-of-0 (Forge typed zero-pair: complete the square)', () => {
  forSeeds(SEEDS, (rng) => {
    let h = nz(rng, -9, 9);
    if (h === 1n || h === -1n) h *= 2n;
    const h2 = h * h;
    const abs = h < 0n ? -h : h;
    const p = problem({ kind: 'form-of-0', expected: P(`${h2} - ${h2}`), formPredicates: [], assumptions: [] },
      { interaction: 'forge', prompt: { verb: 'Forge', math: P(polyText([0n, 2n * h, 1n])), goal: 'make a perfect square' } });
    keyAndGarbage(rng, p);
    expectVerdict(p, `+${h2} - ${h2}`, 'correct', 'leading +');
    expectVerdict(p, `(${h})^2 - ${h2}`, 'correct', 'square written as a power');
    expectVerdict(p, `${h2} - (${h})^2`, 'correct', 'power on the take-away side');
    expectVerdict(p, `${abs} - ${abs}`, 'legal-idle', '+h - h');
    expectVerdict(p, `${4n * h2} - ${4n * h2}`, 'legal-idle', '+4h^2 - 4h^2');
    expectVerdict(p, `${h2}`, 'wrong', 'only the + half');
    expectVerdict(p, `${h2} - ${abs}`, 'wrong', 'unequal pair');
    expectVerdict(p, `${h2} + ${h2}`, 'wrong', 'both added');
  });
});

// ---------------------------------------------------------------- tuple

test('property: tuple (read a, b, c scaled; plain value pairs exact)', () => {
  forSeeds(SEEDS, (rng) => {
    if (rng.bool()) {
      const A = nz(rng, -6, 6);
      const B = BigInt(rng.int(-12, 12));
      const C = BigInt(rng.int(-12, 12));
      const p = problem({ kind: 'tuple', expected: [P(`${A}`), P(`${B}`), P(`${C}`)], formPredicates: [], assumptions: [] },
        { variant: SCALABLE_TUPLE_VARIANT, prompt: { verb: 'Type a, b, c', math: P(`0 = ${polyText([C, B, A])}`) } });
      keyAndGarbage(rng, p);
      const r1 = expectVerdict(p, `${A}, ${B}, ${C}`, 'correct', 'exact');
      assert.equal(r1.note, undefined, 'no note when k = 1');
      const k = rng.pick([-1n, 2n, -2n, 3n]);
      const r = expectVerdict(p, `${A * k}, ${B * k}, ${C * k}`, 'correct', `scaled by ${k}`);
      assert.ok(r.scale && qeq(r.scale, q(k)), 'scale reported');
      assert.match(r.note ?? '', /equivalent equation/);
      const g = gcd(gcd(A, B), C);
      if (g > 1n) expectVerdict(p, `${A / g}, ${B / g}, ${C / g}`, 'correct', 'divided by the gcd');
      expectVerdict(p, `${A}, ${B}, ${C + 1n}`, 'wrong', 'c + 1');
      expectVerdict(p, `${A}, ${B}`, 'unparsed', 'too few');
      expectVerdict(p, '0, 0, 0', 'wrong', 'k = 0');
    } else {
      const L = BigInt(rng.int(-20, 20));
      let R = BigInt(rng.int(-20, 20));
      if (R === L) R += 1n;
      const p = problem({ kind: 'tuple', expected: [P(`${L}`), P(`${R}`)], formPredicates: [], assumptions: [] });
      keyAndGarbage(rng, p);
      expectVerdict(p, `${L}, ${R}`, 'correct', 'exact');
      expectVerdict(p, `${R}, ${L}`, 'wrong', 'swapped');
      expectVerdict(p, `${2n * L}, ${2n * R}`, 'wrong', 'scaling is not allowed here');
      expectVerdict(p, `${L}, ${R}, 0`, 'unparsed', 'too many');
    }
  });
});

// ---------------------------------------------------------------- never throws

const KEYPAD = ['0', '1', '2', '3', '9', '/', '-', '+', '^', 'sqrt', '(', ')', '=', '\u00b1', ',', 'x', 'y', ' ', 'no solution', 'all reals', '+-', '+/-', '.', '#', '\u221a', '0/0', '1/0', '^99', '^(1/2)', '^(-1)'];

test('property: judge never throws and always returns a known verdict, on random keypad strings, for every kind', () => {
  const VERDICTS = new Set(['correct', 'form', 'legal-idle', 'risky', 'wrong', 'unparsed', 'unverifiable']);
  /** @type {Problem[]} */
  const items = [
    problem({ kind: 'expr', expected: P('3/4'), formPredicates: ['lowest-terms'], assumptions: [] }),
    problem({ kind: 'expr', expected: P('2sqrt(3)'), formPredicates: ['radical-simplified'], assumptions: [] }),
    problem({ kind: 'equation-sides', expected: P('0 = 2x^2 - 4x - 6'), formPredicates: [], assumptions: [] }, { prompt: { verb: 'p', math: P('6 + 4x = 2x^2') } }),
    problem({ kind: 'equation-multiple', expected: P('6 + 4x = 2x^2'), formPredicates: ['standard-form'], assumptions: [] }),
    problem({ kind: 'solution-set', expected: { kind: 'finite', roots: [sQ(-1n), sQ(3n)] }, formPredicates: [], assumptions: [] }),
    problem({ kind: 'form-of-1', expected: P('sqrt(3)/sqrt(3)'), formPredicates: ['no-radical-in-denominator'], assumptions: [] }, { prompt: { verb: 'f', math: P('6/sqrt(3)') } }),
    problem({ kind: 'form-of-0', expected: P('9 - 9'), formPredicates: [], assumptions: [] }, { prompt: { verb: 'f', math: P('x^2 + 6x') } }),
    problem({ kind: 'tuple', expected: [P('2'), P('-4'), P('-6')], formPredicates: [], assumptions: [] }, { variant: SCALABLE_TUPLE_VARIANT }),
  ];
  forSeeds(SEEDS, (rng) => {
    const len = rng.int(0, 12);
    let s = '';
    for (let i = 0; i < len; i++) s += rng.pick(KEYPAD);
    for (const p of items) {
      const r = judge(p, s);
      assert.ok(VERDICTS.has(r.verdict), `verdict ${r.verdict} for ${JSON.stringify(s)}`);
      assert.ok(Array.isArray(r.failedForms));
      if (r.verdict === 'unverifiable' && r.error) assert.fail(`internal error on ${JSON.stringify(s)} (${p.answer.kind}): ${r.error}`);
    }
  });
});

/** @param {Surd} a @param {Surd} b */
export function surdEq(a, b) { return seq(a, b); }
