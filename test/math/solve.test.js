// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { P, show, rq, rqNonzero, polyAst } from './_arb.js';
import { q, mul, sub, div, neg, sign, qeq } from '../../src/math/rational.js';
import { num, numQ, v, add as nadd, mul as nmul, neg as nneg, pow, eq } from '../../src/math/ast.js';
import { solve, checkRoot, sameSolutionSet } from '../../src/math/solve.js';
import { seq, sq, sadd, smul, scmp, fromQ, toQ, sqrtQ, ssub, sscale, surdToNode } from '../../src/math/surd.js';
import { evaluate } from '../../src/math/evaluate.js';
import { toPoly, polyToNode, coeffsIn } from '../../src/math/poly.js';
import { print } from '../../src/math/print.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Rng} Rng */

const x = v('x');

/** @param {import('../../types.d.ts').SolutionSet | undefined} s */
function text(s) {
  if (!s) return 'undefined';
  if (s.kind !== 'finite') return s.kind;
  return s.roots.map((r) => print(surdToNode(r))).join(', ');
}

test('solve: hand-checked examples (including the teacher examples)', () => {
  /** @type {[string, string][]} */
  const table = [
    ['3x+5=11', '2'],
    ['x/3=5', '15'],
    ['2x+6=10', '2'],
    ['6+4x=2x^2', '-1, 3'],
    ['4+4x=2x^2', '1 - sqrt(3), 1 + sqrt(3)'],
    ['0=2x^2-4x-6', '-1, 3'],
    ['x^2=3x', '0, 3'],
    ['x^2=9', '-3, 3'],
    ['x^2=3', '-sqrt(3), sqrt(3)'],
    ['x^2=12', '-2sqrt(3), 2sqrt(3)'],
    ['x^2+6x+9=0', '-3'],
    ['(x-2)^2=0', '2'],
    ['x^2=-1', 'none'],
    ['x^2+x+1=0', 'none'],
    ['2x+3=2x+5', 'none'],
    ['0x=4', 'none'],
    ['1=2', 'none'],
    ['2(x+1)=2x+2', 'all'],
    ['x=x', 'all'],
    ['3=3', 'all'],
    ['x^2+x=x^2+2', '2'], // quadratic terms cancel: linear
    ['x^3+x=x^3+2', '2'],
    ['x/2+x/3=5', '6'],
    ['(x+6)/3=x+2', '0'],
    ['2x^2+3x-1=0', '-3/4 - sqrt(17)/4, -3/4 + sqrt(17)/4'],
    ['x=sqrt(3)', 'sqrt(3)'],
    ['sqrt(2)x=2', 'sqrt(2)'],
    ['x^2-2sqrt(3)x+3=0', 'sqrt(3)'],
    ['(1/2)x^2-3x+4=0', '2, 4'],
    ['x(x-1)=0', '0, 1'],
    ['x^2=sqrt(2)x+1', 'sqrt(2)/2 - sqrt(6)/2, sqrt(2)/2 + sqrt(6)/2'], // discriminant 2 + 4 = 6
    ['x^2+x+sqrt(2)=0', 'none'], // discriminant 1 - 4 sqrt(2) < 0
    ['-x^2+4=0', '-2, 2'],
  ];
  for (const [e, want] of table) assert.equal(text(solve(P(e), 'x')), want, e);
});

test('solve: outside the scope -> undefined', () => {
  for (const e of ['x^3=x', 'x^3=8', 'sqrt(x)=3', '1/x=2', 'x/x=1', 'xy=1', 'x+y=2', 'y=2', 'x^(1/2)=3', '2^x=8', 'x^2+x=sqrt(2)', 'x=1/0', 'x^0=1', 'x^(-1)=2', '(x+1)^100=0']) {
    assert.equal(solve(P(e), 'x'), undefined, e);
  }
  // a different variable name
  assert.equal(text(solve(P('2w+1=7'), 'w')), '3');
  assert.equal(text(solve(P('y=2'), 'y')), '2');
});

/**
 * Scramble a polynomial equation p(x) = 0 into "lhs = rhs" with random terms on both sides.
 * @param {Rng} rng @param {Node} p
 * @returns {Equation}
 */
function scramble(rng, p) {
  const extra = polyAst(rng, ['x'], 2);
  const k = num(rng.pick([1, 2, 3, -1, -2]));
  // k p + extra = extra   (same solutions as p = 0 because k != 0)
  const lhs = rng.bool() ? nadd(nmul(k, p), extra) : nadd(extra, nmul(p, k));
  return rng.bool() ? eq(lhs, extra) : eq(extra, lhs);
}

test('solve: linear equations built backward from the root; root verified by exact substitution', () => {
  forSeeds(5000, (rng) => {
    const r = rq(rng, 20);
    const a = rqNonzero(rng, 9);
    // a (x - r)
    const p = nmul(numQ(a), nadd(x, nneg(numQ(r))));
    const e = scramble(rng, p);
    const s = solve(e, 'x');
    assert.ok(s && s.kind === 'finite' && s.roots.length === 1, `${print(e)} -> ${text(s)}`);
    assert.ok(seq(s.roots[0], fromQ(r)), `${print(e)}: got ${text(s)}, want ${r.n}/${r.d}`);
    assert.equal(checkRoot(e, 'x', s.roots[0]), true, print(e));
    // a number that is not the root does not satisfy it
    assert.equal(checkRoot(e, 'x', sadd(s.roots[0], sq(1))), false, print(e));
  });
});

test('solve: quadratics built backward from two rational roots', () => {
  forSeeds(5000, (rng) => {
    const r1 = rq(rng, 9); const r2 = rq(rng, 9);
    const a = rqNonzero(rng, 5);
    const p = nmul(numQ(a), nadd(x, nneg(numQ(r1))), nadd(x, nneg(numQ(r2))));
    const e = scramble(rng, p);
    const s = solve(e, 'x');
    assert.ok(s && s.kind === 'finite', `${print(e)} -> ${text(s)}`);
    const want = qeq(r1, r2) ? [fromQ(r1)] : [fromQ(r1), fromQ(r2)].sort(scmp);
    assert.ok(sameSolutionSet(s, { kind: 'finite', roots: want }), `${print(e)}: got ${text(s)}`);
    assert.equal(s.roots.length, want.length, 'no repeated roots');
    for (const r of s.roots) assert.equal(checkRoot(e, 'x', r), true, `${print(e)} at ${text({ kind: 'finite', roots: [r] })}`);
    if (s.roots.length === 2) assert.equal(scmp(s.roots[0], s.roots[1]), -1, 'ascending');
  });
});

test('solve: random rational quadratics; every root substituted exactly; none/one/two cross-checked independently', () => {
  const counts = { none: 0, one: 0, two: 0, irrational: 0 };
  forSeeds(8000, (rng) => {
    let a = rqNonzero(rng, 6); const b = rq(rng, 12); let c = rq(rng, 12);
    if (rng.bool(0.15)) c = div(mul(b, b), mul(q(4), a)); // force a double root sometimes
    if (rng.bool(0.1)) a = q(rng.pick([1, -1, 2]));
    // a x^2 + b x + c = 0, scrambled
    const p = nadd(nmul(numQ(a), pow(x, num(2))), nmul(numQ(b), x), numQ(c));
    const e = scramble(rng, p);
    const s = solve(e, 'x');
    assert.ok(s && s.kind !== 'all', `${print(e)} -> ${text(s)}`);
    // Independent facts, none of which use the quadratic formula:
    //   vertex value f(-b/2a) has the sign of a (and is nonzero)  <=>  no real root
    //   vertex value is zero                                      <=>  exactly one root
    const vertexX = div(neg(b), mul(q(2), a));
    const fv = toQ(/** @type {Surd} */ (evaluate(p, { x: vertexX })));
    assert.ok(fv);
    const rel = (sign(fv) * sign(a)) || 0; // || 0 turns -0 into 0
    if (s.kind === 'none') { counts.none++; assert.equal(rel, 1, print(e)); return; }
    for (const r of s.roots) assert.equal(checkRoot(e, 'x', r), true, `${print(e)} root ${print(surdToNode(r))}`);
    if (s.roots.length === 1) {
      counts.one++;
      assert.equal(rel, 0, print(e));
      assert.ok(seq(s.roots[0], fromQ(vertexX)));
    } else {
      counts.two++;
      assert.equal(s.roots.length, 2);
      assert.equal(rel, -1, print(e));
      assert.equal(scmp(s.roots[0], s.roots[1]), -1, 'two distinct roots in ascending order');
      // Vieta: r1 + r2 = -b/a and r1 r2 = c/a
      assert.ok(seq(sadd(s.roots[0], s.roots[1]), fromQ(div(neg(b), a))), print(e));
      assert.ok(seq(smul(s.roots[0], s.roots[1]), fromQ(div(c, a))), print(e));
      if (!toQ(s.roots[0])) counts.irrational++;
    }
  });
  assert.ok(counts.none > 500 && counts.one > 300 && counts.two > 2000 && counts.irrational > 1000, show(counts));
});

test('solve: quadratics built backward from p +- q sqrt(n)', () => {
  forSeeds(4000, (rng) => {
    const p0 = rq(rng, 6); const q0 = rqNonzero(rng, 4); const n = rng.pick([2, 3, 5, 6, 7, 10, 11, 13]);
    // roots p0 +- q0 sqrt(n): x^2 - 2 p0 x + (p0^2 - q0^2 n) = 0
    const a = rqNonzero(rng, 4);
    const B = mul(q(-2), p0);
    const C = sub(mul(p0, p0), mul(mul(q0, q0), q(n)));
    const poly = nadd(nmul(numQ(a), pow(x, num(2))), nmul(numQ(mul(a, B)), x), numQ(mul(a, C)));
    const e = scramble(rng, poly);
    const s = solve(e, 'x');
    const root = sscale(/** @type {Surd} */ (sqrtQ(q(n))), q0);
    const want = [ssub(fromQ(p0), root), sadd(fromQ(p0), root)].sort(scmp);
    assert.ok(s && s.kind === 'finite' && s.roots.length === 2, `${print(e)} -> ${text(s)}`);
    assert.ok(seq(s.roots[0], want[0]) && seq(s.roots[1], want[1]), `${print(e)}: got ${text(s)}`);
    for (const r of s.roots) assert.equal(checkRoot(e, 'x', r), true);
  });
});

test('solve: no-solution and all-reals linear cases', () => {
  forSeeds(3000, (rng) => {
    const side = polyAst(rng, ['x'], 2);
    const p = toPoly(side);
    assert.ok(p);
    const same = eq(side, polyToNode(p));
    assert.deepEqual(solve(same, 'x'), { kind: 'all' }, print(same));
    const c = rqNonzero(rng, 9);
    const off = eq(side, nadd(polyToNode(p), numQ(c)));
    assert.deepEqual(solve(off, 'x'), { kind: 'none' }, print(off));
  });
});

test('solve agrees with coefficient extraction from poly.js (independent path) on the degree', () => {
  forSeeds(4000, (rng) => {
    const e = eq(polyAst(rng, ['x'], 2), polyAst(rng, ['x'], 2));
    const cs = coeffsIn(/** @type {any} */ (toPoly(nadd(e.lhs, nneg(e.rhs)))), 'x');
    assert.ok(cs);
    const s = solve(e, 'x');
    if (cs.length > 3) { assert.equal(s, undefined, print(e)); return; }
    assert.ok(s, print(e));
    if (cs.length === 0) assert.equal(s.kind, 'all');
    if (cs.length === 1) assert.equal(s.kind, 'none');
    if (cs.length === 2) assert.ok(s.kind === 'finite' && s.roots.length === 1 && seq(s.roots[0], fromQ(div(neg(cs[0]), cs[1]))));
    if (s.kind === 'finite') for (const r of s.roots) assert.equal(checkRoot(e, 'x', r), true, print(e));
  });
});

test('checkRoot and sameSolutionSet', () => {
  const s3 = /** @type {Surd} */ (sqrtQ(q(3)));
  assert.equal(checkRoot(P('4+4x=2x^2'), 'x', sadd(sq(1), s3)), true);
  assert.equal(checkRoot(P('4+4x=2x^2'), 'x', sq(3)), false);
  assert.equal(checkRoot(P('6+4x=2x^2'), 'x', sq(3)), true);
  assert.equal(checkRoot(P('1/x=1'), 'x', sq(0)), undefined);
  assert.equal(checkRoot(P('xy=1'), 'x', sq(1)), undefined);
  assert.ok(sameSolutionSet({ kind: 'finite', roots: [sq(3), sq(-1)] }, { kind: 'finite', roots: [sq(-1), sq(3), sq(3)] }));
  assert.ok(!sameSolutionSet({ kind: 'finite', roots: [sq(3)] }, { kind: 'finite', roots: [sq(-1), sq(3)] }));
  assert.ok(!sameSolutionSet({ kind: 'finite', roots: [] }, { kind: 'none' }));
  assert.ok(sameSolutionSet({ kind: 'all' }, { kind: 'all' }) && !sameSolutionSet({ kind: 'all' }, { kind: 'none' }));
});
