// @ts-check
// Property and metamorphic tests for equiv.js.
// The core safety property, checked on every family below:
//   equal: true            => the two trees have the same exact value at every sampled point
//                             where both are defined (soundness: never accept a wrong answer)
//   equal: false + witness => both are defined at the witness and the exact values differ
//   equal: false           => some sampled point separates them (never reject a right answer)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { show, polyAst, wildAst, rq, rqNonzero, LETTERS, radSum, POS } from './_arb.js';
import { q, mul as qmul } from '../../src/math/rational.js';
import { num, numQ, v, add, mul, neg, frac, pow, sqrt, eq, vars } from '../../src/math/ast.js';
import { evaluate } from '../../src/math/evaluate.js';
import { seq } from '../../src/math/surd.js';
import { toPoly, polyToNode, pIsZero, pConstValue } from '../../src/math/poly.js';
import { equivExpr, sameSides, isMultiple, multiplier, sameSolutions, WHERE_DEFINED } from '../../src/math/equiv.js';
import { solve, sameSolutionSet } from '../../src/math/solve.js';
import { print } from '../../src/math/print.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Rng} Rng */
/** @typedef {import('../../types.d.ts').Assumption} Assumption */

/**
 * Check a verdict against exact evaluation. Returns the verdict.
 * @param {Node} a @param {Node} b @param {Assumption[]} as @param {Record<string, Q>[]} points
 */
function checkVerdict(a, b, as, points) {
  const r = equivExpr(a, b, as);
  const label = `${print(a)}  vs  ${print(b)}  -> ${show(r)}`;
  if (r.witness) {
    assert.equal(r.equal, false, label);
    const x = evaluate(a, r.witness); const y = evaluate(b, r.witness);
    assert.ok(x && y && !seq(x, y), `witness does not separate: ${label}`);
  }
  if (r.equal === true) {
    for (const env of points) {
      const x = evaluate(a, env); const y = evaluate(b, env);
      if (x && y) assert.ok(seq(x, y), `UNSOUND: said equal but differs at ${show(env)}: ${label}`);
    }
  }
  if (r.equal === false && !r.witness) {
    const separated = points.some((env) => { const x = evaluate(a, env); const y = evaluate(b, env); return x && y && !seq(x, y); });
    assert.ok(separated, `said not equal, no witness, and no sampled point separates: ${label}`);
  }
  const back = equivExpr(b, a, as);
  assert.equal(back.equal, r.equal, `not symmetric: ${label}`);
  return r;
}

/** @param {Rng} rng @param {string[]} names @param {number} n @param {boolean} [positive] */
function points(rng, names, n, positive = false) {
  return Array.from({ length: n }, () => {
    /** @type {Record<string, Q>} */
    const env = {};
    for (const nm of names) env[nm] = positive ? q(rng.int(1, 9), rng.int(1, 3)) : (rng.bool(0.8) ? q(rng.int(-7, 7)) : rq(rng, 5));
    return env;
  });
}

test('metamorphic: a polynomial equals its own expansion (5000 seeds)', () => {
  forSeeds(5000, (rng) => {
    const a = polyAst(rng, ['x', 'y'], 3);
    const p = toPoly(a);
    assert.ok(p);
    const r = checkVerdict(a, polyToNode(p), [], points(rng, ['x', 'y'], 4));
    assert.deepEqual(r, { equal: true }, print(a));
    // and stays equal after wrapping both in the same context
    const c = polyAst(rng, ['x', 'y'], 1);
    assert.equal(equivExpr(mul(c, a), mul(polyToNode(p), c)).equal, true);
    assert.equal(equivExpr(add(a, c), add(c, polyToNode(p))).equal, true);
  });
});

test('metamorphic: a perturbed polynomial is refuted with a real witness (5000 seeds)', () => {
  forSeeds(5000, (rng) => {
    const a = polyAst(rng, ['x', 'y'], 3);
    const c = rqNonzero(rng, 6);
    /** @type {Node} */
    const bump = rng.pick([
      numQ(c),
      mul(numQ(c), v('x')),
      mul(numQ(c), v('x'), v('y')),
      mul(numQ(c), pow(v('y'), num(rng.int(2, 4)))),
    ]);
    const b = rng.bool() ? add(a, bump) : add(polyToNode(/** @type {any} */ (toPoly(a))), neg(bump));
    const r = checkVerdict(a, b, [], points(rng, ['x', 'y'], 4));
    assert.equal(r.equal, false, `${print(a)} vs ${print(b)}`);
    assert.ok(r.witness, `a witness must be found for ${print(a)} vs ${print(b)}`);
    // scaling by a constant other than 1 changes a nonzero polynomial
    if (!pIsZero(/** @type {any} */ (toPoly(a)))) assert.equal(equivExpr(a, mul(num(2), a)).equal, false);
  });
});

test('metamorphic: rational functions, cancel a common factor / perturb (4000 seeds)', () => {
  let notes = 0;
  forSeeds(4000, (rng) => {
    /** @returns {Node} */
    const nonzeroPoly = () => { for (;;) { const t = polyAst(rng, ['x', 'y'], 2); if (!pIsZero(/** @type {any} */ (toPoly(t)))) return t; } };
    const isConst = (/** @type {Node} */ t) => pConstValue(/** @type {any} */ (toPoly(t))) !== undefined;
    const p = polyAst(rng, ['x', 'y'], 2);
    const d = nonzeroPoly(); const r = nonzeroPoly();
    const a = frac(p, d);
    const b = frac(mul(p, r), mul(r, d));
    const pts = points(rng, ['x', 'y'], 5);
    const res = checkVerdict(a, b, [], pts);
    assert.equal(res.equal, true, `${print(a)} vs ${print(b)}`);
    if (res.note) { notes++; assert.ok(res.note.startsWith(WHERE_DEFINED)); }
    // if both sides are defined everywhere we sampled and there is no note, there must be no variable in a denominator
    if (!res.note) assert.ok(isConst(d) && isConst(r), `missing where-defined note: ${print(a)} vs ${print(b)}`);
    // perturbed numerator
    const bad = frac(add(mul(p, r), num(rng.int(1, 3))), mul(r, d));
    const res2 = checkVerdict(a, bad, [], pts);
    assert.equal(res2.equal, false, `${print(a)} vs ${print(bad)}`);
    // sums of fractions: p/d + 1/r = (p r + d)/(d r)
    const sum = add(frac(p, d), frac(num(1), r));
    const joined = frac(add(mul(p, r), d), mul(d, r));
    assert.equal(checkVerdict(sum, joined, [], pts).equal, true, `${print(sum)} vs ${print(joined)}`);
  });
  assert.ok(notes > 2000, `where-defined notes seen: ${notes}`);
});

/** A positive-valued monomial with a rational coefficient. @param {Rng} rng @returns {Node} */
function ratTerm(rng) {
  const X = () => v(rng.pick(['x', 'y']));
  const K = () => num(rng.int(1, 12));
  /** @type {(() => Node)[]} */
  const makers = [K, X, () => mul(K(), X()), () => pow(X(), num(rng.int(2, 3))), () => frac(K(), K()), () => mul(K(), X(), X()), () => frac(X(), K()), () => frac(K(), X())];
  return rng.bool(0.6) ? rng.pick(makers)() : mul(rng.pick(makers)(), rng.pick(makers)());
}

test('metamorphic: radicals and rational powers, rewrite / perturb (5000 seeds)', () => {
  let trues = 0; let falses = 0;
  forSeeds(5000, (rng) => {
    // t, u: positive-valued rational monomials (for x, y > 0), so sqrt(t) stays in the class
    const t = ratTerm(rng);
    const u = ratTerm(rng);
    const rest = rng.bool() ? radSum(rng) : num(rng.int(0, 5));
    /** @type {[Node, Node][]} value-preserving rewrites of t (valid because t, u > 0) */
    const rewrites = [
      [t, pow(sqrt(t), num(2))],
      [t, sqrt(pow(t, num(2)))],
      [t, sqrt(mul(t, t))],
      [t, mul(sqrt(t), sqrt(t))],
      [sqrt(mul(t, u)), mul(sqrt(t), sqrt(u))],
      [frac(t, sqrt(u)), frac(mul(t, sqrt(u)), u)],
      [frac(num(1), sqrt(u)), frac(sqrt(u), u)],
      [pow(t, numQ(q(1, 2))), sqrt(t)],
      [pow(t, numQ(q(3, 2))), mul(t, sqrt(t))],
      [pow(pow(t, numQ(q(1, 2))), num(2)), t],
      [mul(pow(t, numQ(q(1, 2))), pow(t, numQ(q(1, 2)))), t],
      [frac(t, t), num(1)],
      [mul(t, pow(u, num(-1))), frac(t, u)],
      [sqrt(frac(t, u)), frac(sqrt(t), sqrt(u))],
    ];
    const [l, r] = rng.pick(rewrites);
    const a = add(l, rest); const b = add(rest, r);
    const pts = points(rng, ['x', 'y'], 4, true).map((e) => ({ x: qmul(e.x, e.x), y: qmul(e.y, e.y) }));
    const res = checkVerdict(a, b, POS, pts);
    assert.equal(res.equal, true, `${print(a)}  vs  ${print(b)}`);
    assert.equal(res.note, undefined, 'pos variables: no caveat');
    trues++;
    // Perturbations that always change the value when t, u > 0:
    /** @type {[Node, Node][]} */
    const wrongs = [
      [t, mul(num(2), t)],
      [add(sqrt(t), num(1)), sqrt(t)],
      [sqrt(add(t, u)), add(sqrt(t), sqrt(u))], // sqrt of a sum is strictly less than the sum of sqrts
      [mul(sqrt(t), sqrt(t)), mul(num(3), t)],
      [frac(t, sqrt(u)), frac(t, mul(num(2), sqrt(u)))],
      [pow(add(sqrt(t), sqrt(u)), num(2)), add(t, u)], // misses 2 sqrt(t u) > 0
    ];
    const [wl, wr] = rng.pick(wrongs);
    const wa = add(wl, rest); const wb = add(rest, wr);
    const res2 = checkVerdict(wa, wb, POS, pts);
    assert.equal(res2.equal, false, `${print(wa)}  vs  ${print(wb)}`);
    falses++;
  });
  assert.ok(trues === 5000 && falses === 5000);
});

test('numeric families from the mal-rule list (exhaustive small ranges)', () => {
  const N = (/** @type {number} */ k) => num(k);
  const T = (/** @type {Node} */ a, /** @type {Node} */ b) => equivExpr(a, b).equal;
  for (let a = 0; a <= 30; a++) {
    for (let b = 0; b <= 30; b++) {
      // 15 sqrt-splits-sum: sqrt(a + b) = sqrt(a) + sqrt(b) only when a b = 0
      assert.equal(T(sqrt(add(N(a), N(b))), add(sqrt(N(a)), sqrt(N(b)))), a * b === 0, `sqrt(${a}+${b})`);
      // product rule holds for all a, b >= 0
      assert.equal(T(sqrt(mul(N(a), N(b))), mul(sqrt(N(a)), sqrt(N(b)))), true, `sqrt(${a}x${b})`);
      // 13 freshman's dream
      assert.equal(T(pow(add(N(a), N(b)), N(2)), add(pow(N(a), N(2)), pow(N(b), N(2)))), a * b === 0, `(${a}+${b})^2`);
    }
  }
  for (let n = 1; n <= 12; n++) {
    for (let a = 0; a <= 9; a++) {
      for (let b = 1; b <= 9; b++) {
        const lhs = mul(N(n), frac(N(a), N(b)));
        assert.equal(T(lhs, frac(mul(N(n), N(a)), N(b))), true, `${n} x ${a}/${b}`);
        // 19 scalar-into-denominator and 5 scalar-times-both-parts
        assert.equal(T(lhs, frac(N(a), mul(N(n), N(b)))), a === 0 || n === 1, `${n} x ${a}/${b} vs a/(nb)`);
        assert.equal(T(lhs, frac(mul(N(n), N(a)), mul(N(n), N(b)))), a === 0 || n === 1, `${n} x ${a}/${b} vs na/nb`);
        // forms of 1
        assert.equal(T(frac(N(a), N(b)), frac(mul(N(a), N(n)), mul(N(b), N(n)))), true);
      }
    }
  }
  for (let n = 0; n <= 60; n++) {
    // 18 root-square-overshoot
    assert.equal(T(mul(sqrt(N(n)), sqrt(N(n))), N(n)), true, `sqrt(${n})^2`);
    assert.equal(T(mul(sqrt(N(n)), sqrt(N(n))), N(n * n)), n === 0 || n === 1);
    assert.equal(T(pow(pow(N(n), numQ(q(1, 2))), N(2)), N(n)), true, `(${n}^(1/2))^2`);
    // 16 half-power-is-half: n^(1/2) = n/2 only for n = 0 and n = 4
    assert.equal(T(pow(N(n), numQ(q(1, 2))), frac(N(n), N(2))), n === 0 || n === 4, `${n}^(1/2) vs ${n}/2`);
    assert.equal(T(sqrt(N(n)), frac(N(n), N(2))), n === 0 || n === 4);
    for (let k = 1; k <= 6; k++) {
      if (n === 0) continue;
      // rationalize: k/sqrt(n) = k sqrt(n)/n ; 4 one-part-coin: not k (unless n = 1) and not k/n (unless n = 1)
      assert.equal(T(frac(N(k), sqrt(N(n))), frac(mul(N(k), sqrt(N(n))), N(n))), true, `${k}/sqrt(${n})`);
      assert.equal(T(frac(N(k), sqrt(N(n))), N(k)), n === 1);
      assert.equal(T(frac(N(k), sqrt(N(n))), frac(N(k), N(n))), n === 1);
      // 17 sqrt-product-misapplied: sqrt(k^2 n) = k sqrt(n), not k^2 sqrt(n) (unless k = 1)
      assert.equal(T(sqrt(N(k * k * n)), mul(N(k), sqrt(N(n)))), true);
      assert.equal(T(sqrt(N(k * k * n)), mul(N(k * k), sqrt(N(n)))), k === 1);
      assert.equal(T(mul(N(k), sqrt(N(n))), sqrt(N(k * n))), k === 1, `${k}sqrt(${n}) vs sqrt(${k * n})`);
    }
  }
});

test('soundness sweep: random pairs of arbitrary trees, with and without assumptions (20000 seeds)', () => {
  const tally = { true: 0, false: 0, undefined: 0 };
  forSeeds(20000, (rng) => {
    const depth = rng.int(1, 3);
    const a = wildAst(rng, depth);
    // b: sometimes unrelated, sometimes a reshuffle or a near-miss of a
    const mode = rng.int(0, 4);
    /** @type {Node} */
    let b;
    if (mode === 0) b = wildAst(rng, depth);
    else if (mode === 1) b = add(a, num(0));
    else if (mode === 2) b = mul(num(1), a);
    else if (mode === 3) b = add(a, num(rng.int(-1, 1)));
    else b = neg(neg(a));
    const positive = rng.bool(0.4);
    const names = [...new Set([...vars(a), ...vars(b)])];
    /** @type {Assumption[]} */
    const as = positive ? names.map((name) => ({ name, rel: rng.pick(/** @type {const} */ (['pos', 'nonneg'])) })) : [];
    const pts = [...points(rng, LETTERS, 4, positive), ...points(rng, LETTERS, 2, true).map((e) => { for (const k of Object.keys(e)) e[k] = qmul(e[k], e[k]); return e; })];
    const r = checkVerdict(a, b, as, pts);
    tally[/** @type {'true' | 'false' | 'undefined'} */ (String(r.equal))]++;
    // reflexivity: a tree is never "not equal" to itself
    assert.notEqual(equivExpr(a, a, as).equal, false, print(a));
  }, { prefix: 'sound' });
  assert.ok(tally.true > 2000 && tally.false > 2000, show(tally));
});

test('sameSides / isMultiple / sameSolutions on random linear and quadratic moves (4000 seeds)', () => {
  forSeeds(4000, (rng) => {
    const L = polyAst(rng, ['x'], 2); const R = polyAst(rng, ['x'], 2);
    const e0 = eq(L, R);
    const c = polyAst(rng, ['x'], 1);
    const k = numQ(rqNonzero(rng, 5));
    // add c to both sides
    const added = eq(add(L, c), add(R, c));
    const typed = eq(polyToNode(/** @type {any} */ (toPoly(add(L, c)))), polyToNode(/** @type {any} */ (toPoly(add(R, c)))));
    assert.equal(sameSides(typed, added), true);
    assert.equal(sameSides(eq(typed.rhs, typed.lhs), added), true, 'swap allowed');
    assert.equal(isMultiple(typed, e0), true);
    assert.deepEqual(multiplier(typed, e0), { k: q(1), powers: {} });
    // multiply both sides by k
    const scaled = eq(mul(k, L), mul(R, k));
    assert.equal(isMultiple(scaled, e0), true, `${print(scaled)} from ${print(e0)}`);
    // one-sided add of a nonzero constant: not the same sides, not a multiple (unless L - R is constant)
    const oneSided = eq(add(L, num(3)), R);
    assert.equal(sameSides(oneSided, eq(add(L, num(3)), add(R, num(3)))), false);
    const diff = /** @type {any} */ (toPoly(add(L, neg(R))));
    if (diff.terms.size > 1 || (diff.terms.size === 1 && !diff.terms.has(''))) assert.equal(isMultiple(oneSided, e0), false, `${print(oneSided)} from ${print(e0)}`);
    // multiply both sides by x: the multiplier is x^1 (the classifier's "risky"), never a rational multiple
    const timesX = eq(mul(v('x'), L), mul(v('x'), R));
    if (!pIsZero(diff)) {
      assert.deepEqual(multiplier(timesX, e0), { k: q(1), powers: { x: 1 } });
      assert.equal(isMultiple(timesX, e0), false);
    }
    // solution sets: legal moves keep them, sameSolutions agrees with solve
    const s0 = solve(e0, 'x');
    if (s0) {
      for (const e1 of [added, typed, scaled]) {
        const s1 = solve(e1, 'x');
        assert.ok(s1 && sameSolutionSet(s0, s1), `${print(e1)} from ${print(e0)}`);
        assert.deepEqual(sameSolutions(e0, e1, 'x'), { equal: true });
      }
      const s2 = solve(oneSided, 'x');
      if (s2) {
        const r = sameSolutions(e0, oneSided, 'x');
        assert.equal(r.equal, sameSolutionSet(s0, s2));
        if (r.equal === false && s0.kind !== 'all' && s2.kind !== 'all' && r.witness) {
          // the witness solves exactly one of the two
          const in0 = s0.kind === 'finite' && s0.roots.some((x) => seq(x, /** @type {any} */ (r.witness)));
          const in2 = s2.kind === 'finite' && s2.roots.some((x) => seq(x, /** @type {any} */ (r.witness)));
          assert.notEqual(in0, in2);
        }
      }
    }
  });
});

test('never throws: equivExpr on wild trees with every assumption mix (5000 seeds)', () => {
  forSeeds(5000, (rng) => {
    const a = wildAst(rng, 4); const b = wildAst(rng, 4);
    const rel = rng.pick(/** @type {const} */ (['pos', 'nonneg', 'nonzero']));
    const r = equivExpr(a, b, LETTERS.map((name) => ({ name, rel })));
    assert.ok(r.equal === true || r.equal === false || r.equal === undefined);
    sameSides(eq(a, b), eq(b, a));
    isMultiple(eq(a, b), eq(b, a));
    sameSolutions(eq(a, b), eq(b, a), 'x');
    solve(eq(a, b), 'x');
  }, { prefix: 'nothrow' });
});
