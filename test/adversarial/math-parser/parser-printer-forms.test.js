// @ts-check
// Adversarial review of src/math (M1a): parser, printer, form predicates and
// API conformance against DESIGN.md section 11 / types.d.ts.
//
// Independent of test/math/_arb.js: its own PRNG, its own random trees and its
// own evaluator. Tests that pin a defect found in review are marked `todo`
// (reported, but they do not fail the suite) with the defect in the label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rational from '../../../src/math/rational.js';
import * as surd from '../../../src/math/surd.js';
import { parse, parseSolutions } from '../../../src/math/parse.js';
import { print } from '../../../src/math/print.js';
import { evaluate } from '../../../src/math/evaluate.js';
import * as poly from '../../../src/math/poly.js';
import * as radical from '../../../src/math/radical.js';
import * as equiv from '../../../src/math/equiv.js';
import * as formsM from '../../../src/math/forms.js';
import * as solveM from '../../../src/math/solve.js';
import { stripGroups, same } from '../../../src/math/ast.js';

const { q } = rational;
const { getForm } = formsM;

// ------------------------------------------------------------ helpers

/** mulberry32, independent of src/gen/prng.js @param {number} seed */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    bool: (p = 0.5) => next() < p,
  };
}

const show = (x) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
/** @param {string} s */
function P(s) {
  const r = parse(s);
  if ('error' in r) throw new Error(`does not parse: ${s}: ${r.error}`);
  return /** @type {any} */ (r);
}

// ---- independent evaluator: exact BigInt rationals, floats once irrational.
// Value: {k:'q', n, d} | {k:'f', f} | {k:'undef'} | {k:'skip'} (cannot judge;
// e.g. representability differs or a float is too close to 0 to decide).
const bgcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const mkq = (n, d) => { if (d < 0n) { n = -n; d = -d; } const g = bgcd(n, d) || 1n; return { k: 'q', n: n / g, d: d / g }; };
const fval = (v) => (v.k === 'q' ? Number(v.n) / Number(v.d) : v.f);
/** exact integer k-th root of a nonnegative bigint, or undefined */
function iroot(n, k) {
  if (n < 0n) return undefined;
  if (n < 2n) return n;
  let r = BigInt(Math.round(Number(n) ** (1 / k)));
  for (const c of [r - 1n, r, r + 1n]) if (c >= 0n && c ** BigInt(k) === n) return c;
  return undefined;
}
const UNDEF = { k: 'undef' };
const SKIP = { k: 'skip' };
/** @param {any} n @param {Record<string, any>} env */
function myEval(n, env) {
  switch (n.t) {
    case 'num': return mkq(n.q.n, n.q.d);
    case 'var': return env[n.name] ?? UNDEF;
    case 'group': return myEval(n.arg, env);
    case 'neg': { const a = myEval(n.arg, env); return a.k === 'q' ? mkq(-a.n, a.d) : a.k === 'f' ? { k: 'f', f: -a.f } : a; }
    case 'add': case 'mul': {
      const vs = n.args.map((c) => myEval(c, env));
      if (vs.some((v) => v.k === 'undef')) return UNDEF;
      if (vs.some((v) => v.k === 'skip')) return SKIP;
      if (vs.every((v) => v.k === 'q')) {
        return vs.reduce((acc, v) => (n.t === 'add' ? mkq(acc.n * v.d + v.n * acc.d, acc.d * v.d) : mkq(acc.n * v.n, acc.d * v.d)), mkq(n.t === 'add' ? 0n : 1n, 1n));
      }
      return { k: 'f', f: vs.reduce((acc, v) => (n.t === 'add' ? acc + fval(v) : acc * fval(v)), n.t === 'add' ? 0 : 1) };
    }
    case 'frac': {
      const a = myEval(n.num, env); const b = myEval(n.den, env);
      if (a.k === 'undef' || b.k === 'undef') return UNDEF;
      if (a.k === 'skip' || b.k === 'skip') return SKIP;
      if (b.k === 'q' && b.n === 0n) return UNDEF;
      if (b.k === 'f' && Math.abs(b.f) < 1e-9) return SKIP;
      if (a.k === 'q' && b.k === 'q') return mkq(a.n * b.d, a.d * b.n);
      return { k: 'f', f: fval(a) / fval(b) };
    }
    case 'pow': case 'root': {
      const b = myEval(n.t === 'pow' ? n.base : n.radicand, env);
      const e = n.t === 'pow' ? myEval(n.exp, env) : mkq(1n, BigInt(n.index));
      if (b.k === 'undef' || e.k === 'undef') return UNDEF;
      if (b.k === 'skip' || e.k === 'skip') return SKIP;
      if (e.k !== 'q') return SKIP; // irrational exponent: not representable
      if (e.n > 40n || e.n < -40n) return SKIP;
      if (e.d === 1n) {
        if (b.k === 'q') {
          if (b.n === 0n && e.n <= 0n) return UNDEF;
          return e.n >= 0n ? mkq(b.n ** e.n, b.d ** e.n) : mkq(b.d ** -e.n, b.n ** -e.n);
        }
        if (Math.abs(b.f) < 1e-9 && e.n <= 0n) return SKIP;
        return { k: 'f', f: b.f ** Number(e.n) };
      }
      if (b.k !== 'q') return SKIP; // root of an irrational: nested radical
      if (b.n < 0n) return UNDEF; // M1a convention (radicands never negative in v1)
      if (b.n === 0n) return e.n > 0n ? mkq(0n, 1n) : UNDEF;
      const k = Number(e.d);
      const rn = iroot(b.n, k); const rd = iroot(b.d, k);
      if (rn !== undefined && rd !== undefined) {
        return e.n >= 0n ? mkq(rn ** e.n, rd ** e.n) : mkq(rd ** -e.n, rn ** -e.n);
      }
      if (k !== 2) return SKIP; // cube root of a non-cube: not a Surd
      return { k: 'f', f: (Number(b.n) / Number(b.d)) ** (Number(e.n) / k) };
    }
  }
  throw new Error('unknown node');
}
/** Surd to float, independently. */
const surdF = (s) => s.terms.reduce((acc, t) => acc + (Number(t.coef.n) / Number(t.coef.d)) * Math.sqrt(Number(t.rad)), 0);

/** Compare evaluate() with myEval; returns a message on disagreement. */
function agree(n, envQ) {
  const mine = myEval(n, Object.fromEntries(Object.entries(envQ).map(([k, v]) => [k, mkq(v.n, v.d)])));
  const theirs = evaluate(n, envQ);
  if (mine.k === 'skip') return undefined;
  if (mine.k === 'undef') return theirs === undefined ? undefined : `mine undef, theirs ${show(theirs)}`;
  if (theirs === undefined) return `mine ${show(mine)}, theirs undefined`;
  if (mine.k === 'q') {
    const tq = surd.toQ(theirs);
    return tq && tq.n === mine.n && tq.d === mine.d ? undefined : `mine ${show(mine)}, theirs ${show(theirs)}`;
  }
  const a = mine.f; const b = surdF(theirs);
  if (!Number.isFinite(a)) return undefined;
  return Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a)) ? undefined : `mine ${a}, theirs ${b}`;
}

// ---- random trees over every Node kind
const LET = ['x', 'y', 's', 'q', 'r', 't', 'a', 'A'];
/** @param {any} R @param {number} depth @param {boolean} parserShape */
function tree(R, depth, parserShape) {
  const leaf = () => {
    const c = R.int(0, 9);
    if (c < 4) return { t: 'var', name: R.pick(LET) };
    if (parserShape || c < 7) return { t: 'num', q: q(R.int(0, 12)) };
    if (c < 8) return { t: 'num', q: q(R.int(-12, -1)) };
    return { t: 'num', q: q(R.int(-9, 9), R.int(1, 6)) };
  };
  if (depth <= 0 || R.bool(0.2)) return leaf();
  const d = depth - 1;
  const kids = (lo) => { const k = R.int(parserShape ? Math.max(2, lo) : lo, 4); return Array.from({ length: k }, () => tree(R, d, parserShape)); };
  switch (R.int(0, 9)) {
    case 0: return { t: 'add', args: kids(0) };
    case 1: { const args = kids(2); for (let i = 1; i < args.length; i++) if (R.bool()) args[i] = { t: 'neg', arg: args[i] }; return { t: 'add', args }; }
    case 2: return { t: 'mul', args: kids(0) };
    case 3: return { t: 'neg', arg: tree(R, d, parserShape) };
    case 4: return { t: 'frac', num: tree(R, d, parserShape), den: tree(R, d, parserShape) };
    case 5: {
      if (!parserShape && R.bool(0.4)) return { t: 'pow', base: tree(R, d, parserShape), exp: { t: 'num', q: R.pick([q(1, 2), q(3, 2), q(-1, 2), q(1, 3), q(-2), q(2, 3)]) } };
      return { t: 'pow', base: tree(R, d, parserShape), exp: R.bool(0.7) ? { t: 'num', q: q(R.int(0, 3)) } : tree(R, Math.min(d, 1), parserShape) };
    }
    case 6: return { t: 'root', index: !parserShape && R.bool(0.1) ? 3 : 2, radicand: tree(R, d, parserShape) };
    case 7: return { t: 'group', arg: tree(R, d, parserShape) };
    default: return leaf();
  }
}
const hasRoot3 = (n) => JSON.stringify(n, (_k, v) => (typeof v === 'bigint' ? 0 : v)).includes('"index":3');

// ------------------------------------------------------------ API conformance

test('API: section 11 return shapes, beyond names and arity', () => {
  // rational
  const a = q(6, -4);
  assert.deepEqual(a, { n: -3n, d: 2n });
  assert.deepEqual(q(3n), { n: 3n, d: 1n });
  for (const [x, y, c] of [[q(1, 2), q(2, 3), -1], [q(2, 3), q(2, 3), 0], [q(1), q(-5), 1]]) assert.equal(rational.cmp(x, y), c);
  assert.equal(rational.qeq(q(2, 4), q(1, 2)), true);
  assert.deepEqual(rational.div(q(1, 2), q(-1, 4)), { n: -2n, d: 1n });
  assert.deepEqual(rational.neg(q(0)), { n: 0n, d: 1n });
  // surd
  const s2 = surd.sqrtQ(q(2));
  assert.deepEqual(s2, { terms: [{ coef: { n: 1n, d: 1n }, rad: 2n }] });
  assert.deepEqual(surd.sqrtQ(q(9, 4)), { terms: [{ coef: { n: 3n, d: 2n }, rad: 1n }] });
  assert.deepEqual(surd.sqrtQ(q(1, 2)), { terms: [{ coef: { n: 1n, d: 2n }, rad: 2n }] });
  assert.equal(surd.sqrtQ(q(-1)), undefined);
  assert.deepEqual(surd.sqrtQ(q(0)), { terms: [] });
  assert.deepEqual(surd.smul(s2, s2), { terms: [{ coef: { n: 2n, d: 1n }, rad: 1n }] });
  assert.equal(surd.seq(surd.sadd(s2, s2), surd.sqrtQ(q(8))), true);
  assert.equal(typeof surd.approx(s2, 2), 'string');
  assert.equal(surd.approx(s2, 2), '1.41');
  assert.equal(surd.approx(surd.fromQ(q(-1, 1000)), 2), '0.00');
  assert.equal(surd.approx(surd.fromQ(q(5, 2)), 0), '3');
  assert.equal(surd.approx(surd.fromQ(q(-5, 2)), 0), '-3');
  // parse / print
  assert.deepEqual(Object.keys(/** @type {any} */ (parse(''))), ['error']);
  assert.equal(P('x = 1').t, 'eq');
  assert.equal(typeof print(P('x=1')), 'string');
  // evaluate
  assert.equal(evaluate(P('x'), {}), undefined);
  assert.deepEqual(evaluate(P('x^2'), { x: q(3) }), { terms: [{ coef: { n: 9n, d: 1n }, rad: 1n }] });
  // poly
  const p = poly.toPoly(P('(x+1)^2'));
  assert.ok(p && p.kind === 'poly');
  assert.equal(poly.degree(/** @type {any} */ (p)), 2);
  assert.equal(poly.polyEq(/** @type {any} */ (p), /** @type {any} */ (poly.toPoly(P('x^2+2x+1')))), true);
  assert.equal(poly.toPoly(P('1/x')), undefined);
  // radical
  const nf = radical.toRadicalNormalForm(P('sqrt(8)'), []);
  assert.ok(nf && nf.kind === 'radnf');
  // equiv
  const r1 = equiv.equivExpr(P('2x+2'), P('2(x+1)'));
  assert.equal(r1.equal, true);
  const r2 = equiv.equivExpr(P('(x+3)^2'), P('x^2+9'));
  assert.equal(r2.equal, false);
  assert.ok(r2.witness && typeof r2.witness.x === 'object' && typeof r2.witness.x.n === 'bigint');
  assert.equal(equiv.sameSides(P('2x+1=3'), P('3=1+2x')), true);
  assert.equal(equiv.isMultiple(P('4x+2=6'), P('2x+1=3')), true);
  const ss = equiv.sameSolutions(P('2x=4'), P('x=3'), 'x');
  assert.equal(ss.equal, false);
  assert.ok(ss.witness === undefined || Array.isArray(ss.witness.terms), `witness must be a Surd: ${show(ss.witness)}`);
  // solve
  assert.deepEqual(solveM.solve(P('2x = 4'), 'x'), { kind: 'finite', roots: [{ terms: [{ coef: { n: 2n, d: 1n }, rad: 1n }] }] });
  assert.deepEqual(solveM.solve(P('x = x + 1'), 'x'), { kind: 'none' });
  assert.deepEqual(solveM.solve(P('x + x = 2x'), 'x'), { kind: 'all' });
  // forms: every registry entry is (x) => boolean, also on an Equation
  for (const [name, f] of Object.entries(formsM.forms)) {
    assert.equal(typeof f, 'function');
    for (const s of ['x', '1/2', 'x = 3', 'sqrt(2)']) assert.equal(typeof f(P(s)), 'boolean', `${name}(${s})`);
  }
});

// ------------------------------------------------------------ parsing

/** [typed, expected print of the reading, value at x=2, y=3 (as "n/d" or null = undefined)] */
const READINGS = [
  ['2x', '2x', '4/1'],
  ['2sqrt(3)', '2sqrt(3)', null],
  ['sqrt3', 'sqrt(3)', null],
  ['sqrt3x', 'sqrt(3)x', null],
  ['3(x+1)', '3(x + 1)', '9/1'],
  ['(x+1)(x-2)', '(x + 1)(x - 2)', '0/1'],
  ['2x^2', '2x^2', '8/1'],
  ['x^(1/2)', 'x^(1/2)', null],
  ['-x^2', '-x^2', '-4/1'], // -(x^2), conventional
  ['-2^2', '-2^2', '-4/1'], // -(2^2), conventional
  ['2^3^2', '2^(3^2)', '512/1'], // right associative, conventional
  ['1/2x', '(1/2)x', '1/1'], // (1/2)x: a documented choice, ambiguous for students
  ['6/2(1+2)', '(6/2)(1 + 2)', '9/1'], // left to right
  ['4/3/2', '4/3/2', '2/3'],
  ['x - -y', 'x - (-y)', '5/1'],
  ['x--y', 'x - (-y)', '5/1'],
  ['2*-3', '2(-3)', '-6/1'],
  ['x/-2', 'x/(-2)', '-1/1'],
  ['x^-2y', 'x^(-2)y', '3/4'],
  ['x^1/2', 'x^1/2', '1/1'], // (x^1)/2, conventional
  ['2x/3', '2x/3', '4/3'],
  ['sqrtx^2', 'sqrt(x)^2', '2/1'],
  ['3x^2y', '3x^2y', '36/1'],
  ['  2 x  ', '2x', '4/1'],
  ['+x', 'x', '2/1'],
  ['(2)3', '(2)(3)', '6/1'],
  ['0^0', '0^0', null],
  ['1/0', '1/0', null],
];

test('parse: keypad readings (value at x=2, y=3, structure via print)', () => {
  const env = { x: q(2), y: q(3) };
  for (const [s, want, val] of READINGS) {
    const n = P(s);
    assert.equal(print(n), want, `print(parse(${JSON.stringify(s)}))`);
    if (val !== null) {
      const got = evaluate(n, env);
      const tq = got && surd.toQ(got);
      assert.ok(tq, `${s} should evaluate rationally`);
      assert.equal(rational.qstr(/** @type {any} */ (tq)), val, s);
    }
  }
});

test('parse: errors, never throws', () => {
  const bad = ['', '   ', '2+', '2-', '(x+1', 'x+1)', 'x=1=2', '=', 'x=', '=x', '()', 'sqrt', 'sqrt()', 'x^', '^2',
    '2 3', '2 1/2', '1.5', 'x,y', '1 +/- 2', '±3', '++', '*2', '/2', '2**3', '2//3', 'sqrt-3', 'x==1', '((((', '))))',
    '2^', 'sqrt(', 'x(', '-', '+', '=-', '\u0000', '\ud800', '\u{1F600}', 'x^^2', 'xy^', 'é'];
  for (const s of bad) {
    let r;
    assert.doesNotThrow(() => { r = parse(s); }, s);
    assert.ok(r && 'error' in r && typeof r.error === 'string', `expected error for ${JSON.stringify(s)}: ${show(r)}`);
  }
  // very long and deeply nested
  for (const s of ['x+'.repeat(200) + 'x', '('.repeat(150) + 'x' + ')'.repeat(150), '-'.repeat(299) + 'x', 'sqrt('.repeat(60) + 'x' + ')'.repeat(60), '2^'.repeat(150) + '2', '9'.repeat(301)]) {
    let r;
    assert.doesNotThrow(() => { r = parse(s); }, s.slice(0, 20));
    assert.ok(r && typeof r === 'object', s.slice(0, 20));
  }
  // 300 digits is accepted and exact
  const big = P('9'.repeat(300));
  assert.equal(big.q.n, 10n ** 300n - 1n);
});

test('parse: 20000 random keypad strings never throw; accepted ones print and reparse to the same tree', () => {
  const KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '/', '-', '+', '^', 'sqrt', '(', ')', '=', '±', ',', 'x', 'y', 'l', 'w', 'A', ' ', 'no solution', 'all reals'];
  for (let seed = 1; seed <= 20000; seed++) {
    const R = rng(seed);
    const len = R.int(0, 25);
    let s = '';
    for (let i = 0; i < len; i++) s += R.pick(KEYS);
    let r;
    try { r = parse(s); } catch (e) { assert.fail(`seed ${seed}: parse threw on ${JSON.stringify(s)}: ${e}`); }
    if ('error' in r) continue;
    const printed = print(r);
    const again = parse(printed);
    assert.ok(!('error' in again), `seed ${seed}: ${JSON.stringify(s)} -> ${printed} does not reparse: ${show(again)}`);
    assert.ok(same(stripGroups(again), stripGroups(r)), `seed ${seed}: ${JSON.stringify(s)} -> ${printed} changes structure`);
    assert.equal(print(again), printed, `seed ${seed}: print not idempotent`);
  }
});

// ------------------------------------------------------------ round trips

test('round trip: 20000 parser-shaped random trees over all kinds: structure preserved', () => {
  let checked = 0;
  for (let seed = 1; seed <= 20000; seed++) {
    const n = tree(rng(seed), 5, true);
    const s = print(n);
    if (s.length > 300) continue;
    const back = parse(s);
    assert.ok(!('error' in back), `seed ${seed}: ${s} -> ${show(back)}`);
    assert.ok(same(stripGroups(back), stripGroups(n)), `seed ${seed}: ${s} reparsed as ${print(back)}\n${show(stripGroups(n))}\n${show(stripGroups(back))}`);
    checked++;
  }
  assert.ok(checked > 15000, `only ${checked} checked`);
});

test('round trip: 20000 unrestricted trees: value preserved (independent evaluator), print idempotent', () => {
  let checked = 0;
  for (let seed = 1; seed <= 20000; seed++) {
    const n = tree(rng(seed + 1e6), 4, false);
    const s = print(n);
    if (s.length > 300 || hasRoot3(n)) continue;
    const back = parse(s);
    assert.ok(!('error' in back), `seed ${seed}: ${s} -> ${show(back)}`);
    assert.equal(print(back), s, `seed ${seed}: print(parse(print(n))) !== print(n)`);
    const env = { x: q(2), y: q(-3, 2), s: q(5), q: q(1, 3), r: q(7), t: q(-1), a: q(4), A: q(9, 4) };
    const m1 = agree(n, env); const m2 = agree(back, env);
    assert.equal(m1, undefined, `seed ${seed} original ${s}: ${m1}`);
    assert.equal(m2, undefined, `seed ${seed} reparsed ${s}: ${m2}`);
    checked++;
  }
  assert.ok(checked > 15000, `only ${checked} checked`);
});

test('round trip: equations and root index 3 (documented: print emits root3(...), parse rejects)', () => {
  const e = { t: 'eq', lhs: P('2x+1'), rhs: P('-x^2') };
  assert.ok(same(stripGroups(P(print(/** @type {any} */ (e)))), stripGroups(/** @type {any} */ (e))));
  const r3 = { t: 'root', index: 3, radicand: { t: 'num', q: q(8) } };
  assert.equal(print(/** @type {any} */ (r3)), 'root3(8)');
});

test('evaluate agrees with an independent evaluator on 20000 random trees at random points', () => {
  /** @type {Record<string, number>} */
  const kinds = {};
  for (let seed = 1; seed <= 20000; seed++) {
    const R = rng(seed + 2e6);
    const n = tree(R, 4, false);
    const env = Object.fromEntries(LET.map((v) => [v, q(R.int(-6, 6), R.int(1, 4))]));
    const m = agree(n, env);
    assert.equal(m, undefined, `seed ${seed}: ${print(n)} at ${show(env)}: ${m}`);
    const k = myEval(n, Object.fromEntries(Object.entries(env).map(([v, x]) => [v, mkq(x.n, x.d)]))).k;
    kinds[k] = (kinds[k] || 0) + 1;
  }
  // the comparison must not be vacuous
  assert.ok(kinds.q > 5000 && kinds.f > 1000 && kinds.undef > 1000, show(kinds));
});

// ------------------------------------------------------------ form predicates

/** [predicate, typed, expected] -- hand-decided */
const FORMS = [
  ['lowest-terms', '4/3', true], ['lowest-terms', '8/6', false], ['lowest-terms', '-4/3', true],
  ['lowest-terms', '(-4)/3', true], ['lowest-terms', '4/(-3)', false], ['lowest-terms', '2x/4', false],
  ['lowest-terms', '3/x', true], ['lowest-terms', '1/2 + 1/3', true], ['lowest-terms', '6/4 + 1', false],
  ['lowest-terms', '2sqrt(2)/4', false], ['lowest-terms', 'sqrt(2)/2', true], ['lowest-terms', 'x = 8/6', false],
  ['no-radical-in-denominator', '1/sqrt(2)', false], ['no-radical-in-denominator', 'sqrt(2)/2', true],
  ['no-radical-in-denominator', '3sqrt(2)/2', true], ['no-radical-in-denominator', '1/(1+sqrt(2))', false],
  ['no-radical-in-denominator', '1/x^(1/2)', false], ['no-radical-in-denominator', '1/2', true],
  ['radical-simplified', '2sqrt(3)', true], ['radical-simplified', 'sqrt(12)', false], ['radical-simplified', 'sqrt(4)', false],
  ['radical-simplified', 'sqrt(2)', true], ['radical-simplified', 'sqrt(18)', false], ['radical-simplified', 'sqrt(1/2)', false],
  ['radical-simplified', 'sqrt(x^3)', false], ['radical-simplified', 'sqrt(2x)', true], ['radical-simplified', '12^(1/2)', false],
  ['radical-simplified', 'sqrt(2)/2', true],
  ['standard-form', '0 = 2x^2 - 4x - 6', true], ['standard-form', '2x^2 - 4x - 6 = 0', true],
  ['standard-form', '2x^2 = 4x + 6', false], ['standard-form', '-4x + 2x^2 - 6 = 0', false],
  ['standard-form', 'x^2 - 6 = 0', true], ['standard-form', 'x^2 + x^2 = 0', false], ['standard-form', '0 = 0', false],
  ['standard-form', '2x^2 - 4x - 6', false], ['standard-form', 'x^2 - 2x + 1 - 1 = 0', false],
  ['descending-order', '2x^2 - 4x - 6', true], ['descending-order', '-4x + 2x^2', false], ['descending-order', '3 + x', false],
  ['combined', '3 + 4', false], ['combined', '2x + x', false], ['combined', 'sqrt(3) + 2sqrt(3)', false],
  ['combined', '2x + 3', true], ['combined', 'sqrt(2) + 1', true], ['combined', '2sqrt(3) + sqrt(12)', false],
  ['expanded', '2(x+1)', false], ['expanded', '2x + 2', true], ['expanded', '(x+1)^2', false], ['expanded', 'x^2 + 2x + 1', true],
  ['expanded', '-(x+1)', false],
  ['single-number', '3', true], ['single-number', '-3/4', true], ['single-number', '3/0', false], ['single-number', 'x', false],
  ['integer', '-3', true], ['integer', '6/2', false],
  ['integer-fraction', '-3/4', true], ['integer-fraction', '3', false],
  ['isolated', 'x = 3', true], ['isolated', '3 = x', true], ['isolated', 'x = x + 1', false], ['isolated', '2x = 6', false],
  ['denominator:4', '3/4', true], ['denominator:4', '6/8', false], ['denominator:4', 'x/4', true],
];

test('forms: hand-built positive and negative cases', () => {
  for (const [name, s, want] of FORMS) {
    const f = getForm(/** @type {string} */ (name));
    assert.ok(f, `missing ${name}`);
    assert.equal(f(P(s)), want, `${name}(${s})`);
  }
  assert.throws(() => formsM.failedForms(['no-such-form'], P('x')));
});

test('forms DEFECT: denominator:N rejects a negative fraction (-3/4 parses as neg(frac))', { todo: 'denominator:N checks only a top-level frac' }, () => {
  const f = /** @type {any} */ (getForm('denominator:4'));
  assert.equal(f(P('-3/4')), true, '-3/4 has denominator 4');
  assert.equal(f(P('-x/4')), true, '-x/4 has denominator 4');
});

test('forms DEFECT: no-radical-in-denominator accepts negative rational powers (2^(-1/2) = 1/sqrt(2))', { todo: 'negative fractional power not treated as a radical in a denominator' }, () => {
  const f = formsM.forms['no-radical-in-denominator'];
  assert.equal(f(P('2^(-1/2)')), false);
  assert.equal(f(P('3(2^(-1/2))')), false);
  assert.equal(f(P('x^(-1/2)')), false);
});

test('forms DEFECT: radical-simplified only inspects exponent exactly 1/2 (2^(3/2) = 2sqrt(2), 12^(3/2) = 24sqrt(3))', { todo: 'other rational powers not checked' }, () => {
  const f = formsM.forms['radical-simplified'];
  assert.equal(f(P('2^(3/2)')), false);
  assert.equal(f(P('12^(3/2)')), false);
  assert.equal(f(P('8^(1/2)')), false); // control: this one already fails correctly
});

test('parseSolutions DEFECT (interface): the spec keypad key is labelled "+-", but "+-" reads as plus-negative', { todo: 'only U+00B1 and "+/-" are plus-minus' }, () => {
  const r = /** @type {any} */ (parseSolutions('x = 1 +- 2', 'x'));
  assert.ok(r.set, show(r));
  assert.equal(r.set.roots.length, 2, `got ${show(r.set)}`);
});

test('forms DEFECT: isolated has no target variable (y = 2x passes when solving for x)', { todo: 'isolated cannot say which variable' }, () => {
  const f = formsM.forms.isolated;
  // A literal-equations item "solve A = lw for w": retyping the formula passes.
  assert.equal(f(P('A = lw')), false, 'A = lw is not solved for w');
});

test('forms DEFECT: standard-form accepts a constant equation and a "+ -6" term', { todo: 'standard-form shape holes' }, () => {
  const f = formsM.forms['standard-form'];
  assert.equal(f(P('6 = 0')), false, '6 = 0 is not a polynomial in standard form');
  assert.equal(f(P('x^2 + -6 = 0')), false, 'x^2 + -6 = 0 should be written x^2 - 6 = 0');
  assert.equal(f(P('x^2 - 4/2 = 0')), false, '4/2 is an unsimplified coefficient');
});

test('forms DEFECT: lowest-terms on a typed power tower throws and is slow', { todo: 'content() computes b ** e unbounded' }, () => {
  // 28 keypad characters; 9^ instead of 2^ takes about 5 s before the throw.
  const n = P('(((((2^64)^64)^64)^64)^64)/2');
  const t0 = performance.now();
  let threw;
  try { formsM.forms['lowest-terms'](n); } catch (e) { threw = e; }
  const ms = performance.now() - t0;
  assert.equal(threw, undefined, `threw ${threw}`);
  assert.ok(ms < 500, `took ${ms.toFixed(0)} ms`);
});

// ------------------------------------------------------------ timing guards

test('timing: pathological typed inputs return quickly through parse/evaluate/toPoly/equivExpr', () => {
  for (const s of ['9^9^9', '2^2^2^2^2', '(x+y+a+1)^20', '(x+1)^64', '(((x+1)^8)^8)^8', '((((9^64)^64)^64)^64)/2', 'sqrt(' + '9'.repeat(200) + ')']) {
    const t0 = performance.now();
    const n = P(s);
    evaluate(n, { x: q(3), y: q(2), a: q(1) });
    poly.toPoly(n);
    equiv.equivExpr(n, { t: 'add', args: [n, { t: 'num', q: q(0) }] });
    const ms = performance.now() - t0;
    assert.ok(ms < 2000, `${s} took ${ms.toFixed(0)} ms`);
  }
});
