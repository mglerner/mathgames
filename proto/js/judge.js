// @ts-check
// Exact judging (DESIGN.md section 3):
//  - I8 Strike, expressions: value equality, then the form predicate. Same value but not
//    finished -> 'form' (NOT a miss).
//  - I8 Strike, rewriting an equation: L - R must be a nonzero rational multiple of L0 - R0,
//    then the standard-form predicate (either side may be the zero side).
//  - I2 Next Line, equations: side-wise against the stated move, sides may be swapped.
//  - I2 Next Line, expressions: value + form predicate.
//  - I4 Forge: the option must have the required value; a form of 1 that misses the goal is
//    'legal-idle' ("Legal. Not closer."), not a miss.
// Garbage input is 'unparsed' (or 'unverifiable'), never a crash and never a miss.
import { parse } from './parse.js';
import { evalNumber, evalEq } from './evaluate.js';
import { seq, isRational, smul, sq, toQ, sdiv } from './surd.js';
import { multipleOf, peq, psub, pevalQ, rationalCoefs } from './poly.js';
import { sIsZero } from './surd.js';
import { q, qeq } from './rational.js';
import { FORMS, standardForm } from './forms.js';
import { applicable } from './malrules.js';
import { valueOf, polyOf, polyOfNode } from './exact.js';

/** @typedef {import('./ast.js').Node} Node */
/** @typedef {import('./ast.js').Equation} Equation */
/** @typedef {import('./surd.js').Surd} Surd */
/** @typedef {import('./poly.js').Poly} Poly */
/** @typedef {import('./rational.js').Q} Q */
/**
 * @typedef {{ verdict: 'correct' | 'form' | 'legal-idle' | 'wrong' | 'unparsed' | 'unverifiable',
 *   why?: string, tags: string[], ambiguous: boolean, parsed?: Node | Equation,
 *   value?: Surd, poly?: Poly, scaled?: boolean, choice?: any, extraRoot?: Q, rootsKept?: boolean }} JudgeResult
 */

/** @param {string} why @returns {JudgeResult} */
const unparsed = (why) => ({ verdict: 'unparsed', why, tags: [], ambiguous: false });

/**
 * Which proto mal-rules reproduce this wrong answer? Exact comparison only.
 * @param {any} p problem
 * @param {{ value?: Surd, poly?: Poly }} got
 * @returns {string[]}
 */
export function diagnose(p, got) {
  /** @type {string[]} */
  const ids = [];
  for (const m of applicable(p)) {
    const outs = m.apply(p);
    const hit = outs.some((o) => {
      if (o.t === 'eq') return !!got.poly && got.poly.length > 0 && !!multipleOf(got.poly, polyOf(/** @type {Equation} */ (o)));
      return !!got.value && seq(got.value, valueOf(/** @type {Node} */ (o)));
    });
    if (hit) ids.push(m.id);
  }
  return ids;
}

/** Divisor search bound: integers above this are not factored (display aid only). */
const ROOT_SEARCH_MAX = 1000000n;

/** @param {bigint} n positive @returns {bigint[]} */
function divisors(n) {
  /** @type {bigint[]} */
  const out = [];
  for (let d = 1n; d * d <= n; d++)
    if (n % d === 0n) {
      out.push(d);
      if (d * d !== n) out.push(n / d);
    }
  return out;
}

/**
 * A rational x with P(x) = 0 but P0(x) != 0, smallest |x| first, found by the rational root
 * theorem. Undefined when P is not a surd multiple of a rational polynomial, when its integer
 * coefficients are too large to factor, or when no such root exists. Every returned root is
 * checked by exact substitution.
 * @param {Poly} P @param {Poly} P0
 * @returns {Q | undefined}
 */
export function extraRationalRoot(P, P0) {
  if (P.length < 2) return undefined;
  const lead = P[P.length - 1];
  const scaled = P.map((c) => sdiv(c, lead));
  if (scaled.some((c) => !c)) return undefined;
  const monic = rationalCoefs(/** @type {Surd[]} */ (scaled));
  if (!monic) return undefined;
  let L = 1n;
  for (const c of monic) L = (L * c.d) / gcdB(L, c.d);
  let ints = monic.map((c) => (c.n * L) / c.d);
  /** @type {Q[]} */
  const cands = [];
  if (ints[0] === 0n) cands.push(q(0));
  while (ints.length > 1 && ints[0] === 0n) ints = ints.slice(1);
  const a0 = ints[0] < 0n ? -ints[0] : ints[0];
  const an = ints[ints.length - 1] < 0n ? -ints[ints.length - 1] : ints[ints.length - 1];
  if (ints.length > 1 && a0 <= ROOT_SEARCH_MAX && an <= ROOT_SEARCH_MAX) {
    for (const u of divisors(a0)) for (const w of divisors(an)) cands.push(q(u, w), q(-u, w));
  }
  const abs = (/** @type {Q} */ r) => (r.n < 0n ? -r.n : r.n);
  cands.sort((a, b) => {
    // exact: |a| vs |b| as |a.n| * b.d vs |b.n| * a.d; ties put the positive one first
    const x = abs(a) * b.d;
    const y = abs(b) * a.d;
    if (x !== y) return x < y ? -1 : 1;
    return a.n === b.n ? 0 : a.n > b.n ? -1 : 1;
  });
  /** @type {Q[]} */
  const seen = [];
  for (const r of cands) {
    if (seen.some((s) => qeq(s, r))) continue;
    seen.push(r);
    if (sIsZero(pevalQ(P, r)) && !sIsZero(pevalQ(P0, r))) return r;
  }
  return undefined;
}

/** @param {bigint} a @param {bigint} b */
function gcdB(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a;
}

/** @param {string[]} tags @param {Partial<JudgeResult>} rest @returns {JudgeResult} */
function wrong(tags, rest) {
  return { verdict: 'wrong', tags, ambiguous: tags.length >= 2, ...rest };
}

/**
 * Judge a typed Strike response.
 * @param {any} p @param {string} text
 * @returns {JudgeResult}
 */
export function judgeTyped(p, text) {
  const pr = parse(text, p.variableKeys);
  if ('error' in pr) return unparsed('Could not read that. Check the preview.');
  if (p.answer.kind === 'expr') {
    if (pr.kind !== 'expr') return unparsed('Type a value, not an equation.');
    const ev = evalNumber(pr.node);
    if ('fail' in ev) {
      if (ev.fail === 'divzero') return unparsed('Division by 0 has no value.');
      return { verdict: 'unverifiable', why: 'Cannot check that form. Try a simpler one.', tags: [], ambiguous: false, parsed: pr.node };
    }
    const value = ev.value;
    if (seq(value, p.answer.value)) {
      const f = FORMS[/** @type {'lowest-terms' | 'integer' | 'radical-finished'} */ (p.answer.form)](pr.node);
      if (f.ok) return { verdict: 'correct', tags: [], ambiguous: false, parsed: pr.node, value };
      return { verdict: 'form', why: f.why, tags: [], ambiguous: false, parsed: pr.node, value };
    }
    return wrong(diagnose(p, { value }), { parsed: pr.node, value });
  }
  // equation-multiple
  if (pr.kind !== 'eq') return unparsed('Type an equation: it needs an = sign.');
  const ev = evalEq(pr.eq);
  if ('fail' in ev) {
    if (ev.fail === 'divzero') return unparsed('Division by 0 has no value.');
    return { verdict: 'unverifiable', why: 'Cannot check that form. Try a simpler one.', tags: [], ambiguous: false, parsed: pr.eq };
  }
  const P = ev.poly;
  const P0 = polyOf({ t: 'eq', lhs: p.data.L, rhs: p.data.R });
  if (P.length === 0) return wrong([], { parsed: pr.eq, poly: P, why: 'That holds for every x. The Knot has two solutions.' });
  const k = multipleOf(P, P0);
  if (k) {
    if (!isRational(k)) return { verdict: 'form', why: 'Same solutions. Use rational coefficients.', tags: [], ambiguous: false, parsed: pr.eq, poly: P };
    const f = standardForm(pr.eq);
    const kq = /** @type {import('./rational.js').Q} */ (toQ(k));
    const scaled = !(kq.n === 1n && kq.d === 1n) && !(kq.n === -1n && kq.d === 1n);
    if (f.ok) return { verdict: 'correct', tags: [], ambiguous: false, parsed: pr.eq, poly: P, scaled };
    return { verdict: 'form', why: f.why, tags: [], ambiguous: false, parsed: pr.eq, poly: P };
  }
  // Not a multiple of the Knot: wrong (DESIGN.md section 3, I8), even when both true solutions
  // check. Point the Scale at an extra rational solution of the student's line if one exists.
  const [r1, r2] = p.data.roots;
  if (sIsZero(pevalQ(P, q(r1))) && sIsZero(pevalQ(P, q(r2)))) {
    const extraRoot = extraRationalRoot(P, P0);
    return wrong(diagnose(p, { poly: P }), {
      parsed: pr.eq,
      poly: P,
      extraRoot,
      rootsKept: true,
      why: extraRoot
        ? 'Your line has a solution the Knot does not have.'
        : 'Both solutions check, but that is not this equation rewritten. Subtract a whole side.',
    });
  }
  return wrong(diagnose(p, { poly: P }), { parsed: pr.eq, poly: P });
}

/**
 * The value (expressions) or equation (equations) that a choice leads to, for the instruments.
 * @param {any} p @param {any} choice
 * @returns {{ value?: Surd, eq?: Equation }}
 */
export function choiceResult(p, choice) {
  if (p.interaction === 'forge') {
    if (p.gen === 'ftw') return { value: smul(valueOf(choice.display), valueOf(p.prompt.math.args[1])) };
    return { value: smul(valueOf(p.prompt.math), valueOf(choice.display)) };
  }
  if (choice.display.t === 'eq') return { eq: choice.display };
  return { value: valueOf(choice.display) };
}

/**
 * Recompute a choice's verdict and tag from the math alone (the generator labels its choices
 * by construction; this is the independent path the tests compare against).
 * @param {any} p @param {any} choice
 * @returns {{ verdict: string, tags: string[] }}
 */
export function recomputeChoice(p, choice) {
  const res = choiceResult(p, choice);
  /** @param {{ value?: Surd, poly?: Poly }} got */
  const tagsFor = (got) => diagnose(p, got);
  if (p.interaction === 'forge') {
    const opt = valueOf(choice.display);
    if (p.gen === 'ftw') {
      if (seq(opt, sq(q(p.data.n)))) return { verdict: 'correct', tags: [] };
      return { verdict: 'wrong', tags: tagsFor({ value: res.value }) };
    }
    // rationalize: the coin must be worth exactly 1; then it must clear the root
    if (!seq(opt, sq(q(1)))) return { verdict: 'wrong', tags: tagsFor({ value: res.value }) };
    const den = valueOf(choice.display.den);
    const cleared = isRational(smul(valueOf(p.prompt.math.den), den));
    return { verdict: cleared ? 'correct' : 'legal-idle', tags: [] };
  }
  // nextline
  if (res.eq) {
    const S = polyOfNode(p.answer.subtract);
    const wantL = psub(polyOfNode(p.data.L), S);
    const wantR = psub(polyOfNode(p.data.R), S);
    const gotL = polyOfNode(res.eq.lhs);
    const gotR = polyOfNode(res.eq.rhs);
    const ok = (peq(gotL, wantL) && peq(gotR, wantR)) || (peq(gotL, wantR) && peq(gotR, wantL));
    if (ok) return { verdict: 'correct', tags: [] };
    return { verdict: 'wrong', tags: tagsFor({ poly: polyOf(res.eq) }) };
  }
  const value = /** @type {Surd} */ (res.value);
  if (seq(value, p.answer.value) && FORMS['lowest-terms'](choice.display).ok) return { verdict: 'correct', tags: [] };
  return { verdict: 'wrong', tags: tagsFor({ value }) };
}

/**
 * Judge a tap-chosen response by choice id.
 * @param {any} p @param {string} id
 * @returns {JudgeResult}
 */
export function judgeChoice(p, id) {
  const choice = (p.choices || []).find((/** @type {any} */ c) => c.id === id);
  if (!choice) return unparsed('Pick one first.');
  const res = choiceResult(p, choice);
  const tags = choice.malrule ? [choice.malrule] : [];
  return {
    verdict: choice.verdict,
    tags,
    ambiguous: false,
    choice,
    value: res.value,
    poly: res.eq ? polyOf(res.eq) : undefined,
    parsed: choice.display,
  };
}

/** @param {any} p @param {string} response */
export function judge(p, response) {
  return p.interaction === 'strike' ? judgeTyped(p, response) : judgeChoice(p, response);
}


