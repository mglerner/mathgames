// @ts-check
// Property tests over 5000 seeds per generator per interaction: determinism, answer keys
// verified by an independent path, distractors (mal-rule outputs only) distinct from the
// answer and from each other, tag honesty, choice verdicts recomputed from the math, the
// detector round trip on typed answers, render without throwing, feedback line <= 15 words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GENS, generate } from '../js/gens/index.js';
import { print } from '../js/print.js';
import { parse } from '../js/parse.js';
import { judge, recomputeChoice, choiceResult } from '../js/judge.js';
import { malrule, applicable } from '../js/malrules.js';
import { valueOf, polyOf, solveUpTo2, sameSet } from '../js/exact.js';
import { seq, smul, sq, sqrtQ, sfloat } from '../js/surd.js';
import { q, add, qeq, neg as qneg, mul as qmul } from '../js/rational.js';
import { renderMath } from '../js/mathview.js';
import { textOf } from '../js/vnode.js';
import { buildFeedback, wordCount } from '../js/feedback.js';
import { polyToNode } from '../js/build.js';
import { eq, num } from '../js/ast.js';
import { evalAtQ, seeds, toKeys } from './helpers.js';

const N = 5000;
const SEEDS = seeds(N);
const J = (/** @type {any} */ x) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));

/** @param {any} p @param {any} r */
function checkFeedback(p, r) {
  const fb = buildFeedback(p, r);
  assert.ok(wordCount(fb.line) <= 15, `${p.id}: "${J(fb.line)}" has ${wordCount(fb.line)} words`);
  for (const seg of fb.line) if (typeof seg !== 'string') assert.ok(!textOf(renderMath(seg.m)).includes('?'));
  if (r.verdict !== 'unparsed' && r.verdict !== 'unverifiable') {
    assert.ok(fb.instrument, p.id);
    if (fb.instrument.kind === 'lantern') for (const row of fb.instrument.rows) assert.match(row.approx, /^-?\d+\.\d\d$/);
    else for (const row of fb.instrument.rows) assert.equal(typeof row.balanced, 'boolean');
    // the Knot's own row always balances on the Scale
    if (fb.instrument.kind === 'scale') assert.ok(fb.instrument.rows[0].balanced, p.id);
  }
  if (fb.miss) assert.ok(fb.answer, 'a miss always shows a correct answer');
  return fb;
}

/** @param {any} p */
function checkRender(p) {
  const t = textOf(renderMath(p.prompt.math));
  assert.ok(t.length > 0 && !t.includes('?') && !t.includes('undefined'), p.id);
  for (const c of p.choices || []) assert.ok(!textOf(renderMath(c.display)).includes('?'), p.id);
  if (p.answer.display) assert.ok(!textOf(renderMath(p.answer.display)).includes('?'));
}

/** Typed answer through the judge; also asserts it is typeable on the keypad. @param {any} p @param {string} text */
function typed(p, text) {
  toKeys(text);
  return judge(p, text);
}

/** Generic choice-item checks. @param {any} p */
function checkChoices(p) {
  const cs = p.choices;
  assert.ok(cs.length >= 3 && cs.length <= 4, p.id);
  assert.equal(cs.filter((/** @type {any} */ c) => c.verdict === 'correct').length, 1, p.id);
  assert.equal(new Set(cs.map((/** @type {any} */ c) => c.id)).size, cs.length);
  for (const c of cs) {
    const re = recomputeChoice(p, c);
    assert.equal(re.verdict, c.verdict, `${p.id} choice ${print(c.display)}`);
    if (c.verdict === 'wrong') {
      // tag honesty: the tagged mal-rule reproduces this result, and only it does
      assert.ok(c.malrule, `${p.id}: wrong choice without a mal-rule`);
      assert.deepEqual(re.tags, [c.malrule], `${p.id} ${print(c.display)}`);
      const res = choiceResult(p, c);
      const outs = malrule(c.malrule).apply(p);
      const hit = outs.some((o) =>
        o.t === 'eq' ? sameSet(/** @type {any} */ (solveUpTo2(polyOf(/** @type {any} */ (o)))), /** @type {any} */ (solveUpTo2(polyOf(/** @type {any} */ (res.eq))))) : seq(valueOf(/** @type {any} */ (o)), /** @type {any} */ (res.value)),
      );
      assert.ok(hit, `${p.id}: ${c.malrule} does not reproduce ${print(c.display)}`);
    } else assert.equal(c.malrule, undefined);
    const r = judge(p, c.id);
    assert.equal(r.verdict, c.verdict);
    checkFeedback(p, r);
  }
  // pairwise distinct results (values or solution sets)
  const res = cs.map((/** @type {any} */ c) => choiceResult(p, c));
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++) {
      assert.notEqual(print(cs[i].display), print(cs[j].display), p.id);
      if (cs[i].verdict === 'legal-idle' || cs[j].verdict === 'legal-idle') continue; // a form of 1 keeps the value by design
      if (res[i].eq) {
        const a = /** @type {any} */ (solveUpTo2(polyOf(res[i].eq)));
        const b = /** @type {any} */ (solveUpTo2(polyOf(/** @type {any} */ (res[j].eq))));
        assert.ok(!sameSet(a, b), `${p.id}: two candidates with the same solution set`);
      } else assert.ok(!seq(/** @type {any} */ (res[i].value), /** @type {any} */ (res[j].value)), `${p.id}: two options with the same value`);
    }
  // an unknown id is "unparsed", never a miss
  assert.equal(judge(p, 'zz').verdict, 'unparsed');
}

/** Detector round trip on a Strike item: typing each mal-rule output is wrong and tagged. @param {any} p */
function checkStrikeMalrules(p) {
  for (const m of applicable(p)) {
    for (const o of m.apply(p)) {
      const r = typed(p, print(o));
      assert.equal(r.verdict, 'wrong', `${p.id}: ${m.id} output ${print(o)} judged ${r.verdict}`);
      assert.ok(r.tags.includes(m.id), `${p.id}: ${print(o)} not tagged ${m.id} (${r.tags})`);
      checkFeedback(p, r);
    }
  }
}

test('every generator is deterministic and renders', () => {
  for (const g of Object.values(GENS)) {
    for (const inter of g.INTERACTIONS) {
      const keys = new Set();
      for (const s of SEEDS) {
        const a = generate(g.ID, s, inter);
        const b = generate(g.ID, s, inter);
        assert.equal(J(a), J(b), `${g.ID} ${s} ${inter}`);
        checkRender(a);
        keys.add(a.key);
      }
      assert.ok(keys.size >= (g.ID === 'sqrtsq' ? 12 : 30), `${g.ID} ${inter}: only ${keys.size} distinct items`);
    }
    // the same seed gives the same math in every interaction
    for (const s of SEEDS.slice(0, 500)) {
      const ks = g.INTERACTIONS.map((i) => generate(g.ID, s, i).key);
      assert.equal(new Set(ks).size, 1, `${g.ID} ${s}`);
    }
  }
});

test('frac-times-whole: answer key, distractors, judging (5000 seeds x 3 interactions)', () => {
  for (const inter of GENS.ftw.INTERACTIONS) {
    for (const s of SEEDS) {
      const p = generate('ftw', s, inter);
      const { n, a, b } = p.data;
      // independent path 1: n repeated additions of a/b
      let sum = q(0);
      for (let i = 0n; i < n; i++) sum = add(sum, q(a, b));
      assert.ok(seq(p.answer.value, sq(sum)), p.id);
      // independent path 2: re-parse the printed prompt and evaluate with plain rationals
      const pr = /** @type {any} */ (parse(print(p.prompt.math), []));
      assert.ok(qeq(evalAtQ(pr.node, q(0)), sum), p.id);
      assert.ok(qeq(evalAtQ(p.answer.display, q(0)), sum));
      if (inter === 'strike') {
        const r = typed(p, print(p.answer.display));
        assert.equal(r.verdict, 'correct', p.id);
        checkFeedback(p, r);
        const unreduced = typed(p, `${2n * n * a}/${2n * b}`);
        assert.equal(unreduced.verdict, 'form', p.id);
        checkFeedback(p, unreduced);
        assert.equal(typed(p, `${n * a}/${b}`).verdict, 'correct');
        checkStrikeMalrules(p);
        for (const m of applicable(p)) for (const o of m.apply(p)) assert.equal(typed(p, print(o)).tags.length, 1);
      } else checkChoices(p);
    }
  }
});

test('sqrt-squared: answer key, mal-rule 18, judging (5000 seeds)', () => {
  for (const s of SEEDS) {
    const p = generate('sqrtsq', s, 'strike');
    const n = p.data.n;
    const pr = /** @type {any} */ (parse(print(p.prompt.math), []));
    assert.ok(seq(valueOf(pr.node), sq(q(n))), p.id);
    assert.ok(Math.abs(Math.sqrt(Number(n)) ** 2 - Number(n)) < 1e-9); // float sanity only
    assert.equal(typed(p, `${n}`).verdict, 'correct');
    assert.equal(typed(p, `sqrt${n}sqrt${n}`).verdict, 'form');
    assert.equal(typed(p, `sqrt${n * n}`).verdict, 'form');
    assert.equal(typed(p, `sqrt${n}^2`).verdict, 'form');
    const over = typed(p, `${n * n}`);
    assert.equal(over.verdict, 'wrong');
    assert.deepEqual(over.tags, ['root-square-overshoot']);
    checkStrikeMalrules(p);
    checkFeedback(p, typed(p, `${n}`));
  }
});

test('rationalize-denominator d1: answer key, distractors, judging (5000 seeds x 2 interactions)', () => {
  for (const inter of GENS.rat.INTERACTIONS) {
    for (const s of SEEDS) {
      const p = generate('rat', s, inter);
      const { k, n } = p.data;
      const A = p.answer.value;
      // independent path: multiply back by sqrt(n) and get k
      assert.ok(seq(smul(A, /** @type {any} */ (sqrtQ(q(n)))), sq(q(k))), p.id);
      const pr = /** @type {any} */ (parse(print(p.prompt.math), []));
      assert.ok(seq(valueOf(pr.node), A), p.id);
      assert.ok(Math.abs(sfloat(A) - Number(k) / Math.sqrt(Number(n))) < 1e-9); // float sanity only
      if (inter === 'strike') {
        const r = typed(p, print(p.answer.display));
        assert.equal(r.verdict, 'correct', `${p.id} ${print(p.answer.display)}`);
        checkFeedback(p, r);
        assert.equal(typed(p, print(p.prompt.math)).verdict, 'form', 'retyping k/sqrt(n) is same value, not finished');
        assert.equal(typed(p, `${k}sqrt${n}/${n}`).verdict, k % n === 0n || q(k, n).d !== n ? 'form' : 'correct');
        checkStrikeMalrules(p);
        for (const m of applicable(p)) for (const o of m.apply(p)) assert.equal(typed(p, print(o)).tags.length, 1, `${p.id} ${print(o)}`);
      } else {
        checkChoices(p);
        assert.equal(p.choices.filter((/** @type {any} */ c) => c.verdict === 'legal-idle').length, 1);
        const idle = p.choices.find((/** @type {any} */ c) => c.verdict === 'legal-idle');
        assert.equal(judge(p, idle.id).verdict, 'legal-idle');
        assert.equal(buildFeedback(p, judge(p, idle.id)).miss, false, 'Legal. Not closer. is not a miss');
      }
    }
  }
});

test('quadratic-to-standard d1: answer key by substitution, distractors, side-wise judging (5000 seeds x 2)', () => {
  for (const inter of GENS.quad.INTERACTIONS) {
    for (const s of SEEDS) {
      const p = generate('quad', s, inter);
      const [r1, r2] = p.data.roots;
      assert.notEqual(r1, r2);
      for (const r of [r1, r2]) {
        assert.ok(r !== 0n && r !== 1n, `${p.id}: root ${r}`);
        // independent substitution into the original
        assert.ok(qeq(evalAtQ(p.data.L, q(r)), evalAtQ(p.data.R, q(r))), `${p.id} at ${r}`);
      }
      // the displayed Knot re-parses to the same equation
      const pr = /** @type {any} */ (parse(print(p.prompt.math)));
      for (const r of [r1, r2]) assert.ok(qeq(evalAtQ(pr.eq.lhs, q(r)), evalAtQ(pr.eq.rhs, q(r))));
      if (inter === 'strike') {
        const ans = p.answer.display;
        for (const r of [r1, r2]) assert.ok(qeq(evalAtQ(ans.lhs, q(r)), q(0)), `${p.id} answer at ${r}`);
        // Vieta: a x^2 + b x + c with b = -a (r1 + r2), c = a r1 r2: exactly these two roots
        const A = evalAtQ(ans.lhs, q(0)); // c
        const a2 = p.data.a < 0n ? -p.data.a : p.data.a;
        assert.ok(qeq(A, q(a2 * r1 * r2)));
        // accepted forms: as printed, swapped, negated, and a rational multiple
        const coefs = p.data.a < 0n ? p.data.pCoefs.map(qneg) : p.data.pCoefs;
        const text = print(ans);
        const half = print(polyToNode(coefs.map((/** @type {any} */ c) => qmul(c, q(1, 2)))));
        const negd = print(polyToNode(coefs.map(qneg)));
        for (const t of [text, `0=${print(ans.lhs)}`, `${negd}=0`, `0=${negd}`, `${half}=0`, `0=${half}`]) {
          const r = typed(p, t);
          assert.equal(r.verdict, 'correct', `${p.id}: ${t}`);
          checkFeedback(p, r);
        }
        // same solutions, not finished: never a miss
        const orig = typed(p, print(p.prompt.math));
        assert.equal(orig.verdict, 'form', `${p.id}: retyping the original`);
        assert.equal(buildFeedback(p, orig).miss, false);
        assert.equal(typed(p, `(x-${r1})(x-${r2})=0`.replace(/--/g, '+')).verdict, 'form');
        checkStrikeMalrules(p);
        // Carrier and Copyist coincide on a typed rewrite: always ambiguous, never tagged to one
        const carrier = typed(p, print(malrule('transpose-no-sign-change').apply(p)[0]));
        assert.ok(carrier.ambiguous && carrier.tags.includes('copy-coefficients'), p.id);
        // the fully solved line is not a rewrite
        assert.equal(typed(p, `x=${r1}`).verdict, 'wrong');
      } else {
        checkChoices(p);
        // retyping the original line as the "next line" is rejected (side-wise)
        assert.equal(recomputeChoice(p, { display: p.prompt.math }).verdict, 'wrong');
        assert.equal(recomputeChoice(p, { display: eq(num(0), num(0)) }).verdict, 'wrong');
        // both orientations of the correct result are accepted
        const c = p.choices.find((/** @type {any} */ x) => x.verdict === 'correct').display;
        assert.equal(recomputeChoice(p, { display: eq(c.rhs, c.lhs) }).verdict, 'correct');
      }
    }
  }
});
