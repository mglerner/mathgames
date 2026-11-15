// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { P, show, polyAst, renv, rq } from './_arb.js';
import { q, qeq, ZERO } from '../../src/math/rational.js';
import { toQ, fromQ, seq } from '../../src/math/surd.js';
import { evaluate } from '../../src/math/evaluate.js';
import { print } from '../../src/math/print.js';
import {
  toPoly, polyEq, degree, degreeIn, polyVars, coeffsIn, polyEval, polyToNode, leadTerm,
  padd, pmul, psub, pneg, pscale, pconst, pIsZero, toRat, cmpMono, PZERO, PONE,
} from '../../src/math/poly.js';

/** @typedef {import('./../../src/math/poly.js').Poly} Poly */
/** @typedef {import('../../types.d.ts').Node} Node */

/** @param {string} s @returns {Poly} */
const TP = (s) => {
  const p = toPoly(P(s));
  assert.ok(p, `${s} should be a polynomial`);
  return p;
};

test('toPoly: canonical expanded form (hand-checked)', () => {
  /** @type {[string, string][]} */
  const table = [
    ['(x+3)^2', 'x^2 + 6x + 9'],
    ['2(x-3)(x+1)', '2x^2 - 4x - 6'],
    ['6+4x-2x^2', '-2x^2 + 4x + 6'],
    ['(a+b)^2', 'a^2 + 2ab + b^2'],
    ['(a+b)(a-b)', 'a^2 - b^2'],
    ['(x+6)/3', '(1/3)x + 2'],
    ['x-x', '0'],
    ['0x^5', '0'],
    ['sqrt(4)x', '2x'],
    ['2^(-1)x', '(1/2)x'],
    ['x/2+x/3', '(5/6)x'],
    ['(x+y+1)^2', 'x^2 + 2xy + y^2 + 2x + 2y + 1'],
    ['-(x-2)', '-x + 2'],
    ['3', '3'],
    ['yx', 'xy'],
    ['x^2y+xy^2', 'x^2y + xy^2'],
  ];
  for (const [text, want] of table) assert.equal(print(polyToNode(TP(text))), want, text);
});

test('toPoly: not a polynomial -> undefined', () => {
  for (const text of ['1/x', 'x/x', 'x^(-1)', 'x^(1/2)', 'sqrt(x)', 'sqrt(2)x', 'sqrt(2)', '2^x', 'x^x', 'x^0', 'x/0', '1/0', '0^0', 'x+1/0', 'x^65', '(x+1)^100', 'x^(2^70)', 'x+2^(10^30)', 'sqrt(x^2)']) {
    assert.equal(toPoly(P(text)), undefined, text);
  }
  assert.ok(toPoly(P('x^64')));
});

test('degree, degreeIn, polyVars, coeffsIn, leadTerm', () => {
  assert.equal(degree(TP('2x^2-4x-6')), 2);
  assert.equal(degree(TP('x^2y^3+x^4')), 5);
  assert.equal(degree(TP('7')), 0);
  assert.equal(degree(TP('x-x')), -1);
  assert.equal(degreeIn(TP('x^2y^3+x^4'), 'y'), 3);
  assert.equal(degreeIn(TP('x^2'), 'y'), 0);
  assert.deepEqual(polyVars(TP('xy+a')), ['a', 'x', 'y']);
  assert.deepEqual(coeffsIn(TP('2x^2-6'), 'x'), [q(-6), ZERO, q(2)]);
  assert.deepEqual(coeffsIn(TP('x-x'), 'x'), []);
  assert.deepEqual(coeffsIn(TP('5'), 'x'), [q(5)]);
  assert.equal(coeffsIn(TP('xy'), 'x'), undefined);
  assert.equal(coeffsIn(TP('y+1'), 'x'), undefined);
  assert.deepEqual(leadTerm(TP('3x-5x^2+1')), { key: 'x:2', coef: q(-5) });
  assert.equal(leadTerm(PZERO), undefined);
  assert.ok(cmpMono('x:2', 'x:1,y:1') > 0 && cmpMono('x:1,y:1', 'y:2') > 0 && cmpMono('x:3', 'x:1,y:1') > 0);
});

test('ring axioms on Poly', () => {
  forSeeds(3000, (rng) => {
    const a = /** @type {Poly} */ (toPoly(polyAst(rng, ['x', 'y'], 2)));
    const b = /** @type {Poly} */ (toPoly(polyAst(rng, ['x', 'y'], 2)));
    const c = /** @type {Poly} */ (toPoly(polyAst(rng, ['x', 'y'], 2)));
    assert.ok(a && b && c);
    assert.ok(polyEq(padd(a, b), padd(b, a)));
    assert.ok(polyEq(pmul(a, b), pmul(b, a)));
    assert.ok(polyEq(padd(padd(a, b), c), padd(a, padd(b, c))));
    assert.ok(polyEq(pmul(pmul(a, b), c), pmul(a, pmul(b, c))));
    assert.ok(polyEq(pmul(a, padd(b, c)), padd(pmul(a, b), pmul(a, c))));
    assert.ok(polyEq(padd(a, PZERO), a) && polyEq(pmul(a, PONE), a));
    assert.ok(pIsZero(psub(a, a)) && pIsZero(padd(a, pneg(a))) && pIsZero(pmul(a, PZERO)));
    const k = rq(rng);
    assert.ok(polyEq(pscale(a, k), pmul(a, pconst(k))));
    // no zero coefficients are ever stored
    for (const p of [padd(a, b), pmul(a, b), psub(a, b)]) for (const coef of p.terms.values()) assert.ok(coef.n !== 0n);
    if (!pIsZero(a) && !pIsZero(b)) assert.equal(degree(pmul(a, b)), degree(a) + degree(b), 'no zero divisors');
  });
});

test('toPoly agrees with tree evaluation at random exact points (two independent paths)', () => {
  forSeeds(5000, (rng) => {
    const tree = polyAst(rng, ['x', 'y', 'z'], 3);
    const p = toPoly(tree);
    assert.ok(p, print(tree));
    for (let i = 0; i < 3; i++) {
      const env = renv(rng, ['x', 'y', 'z']);
      const viaTree = evaluate(tree, env);
      const viaPoly = polyEval(p, env);
      assert.ok(viaTree && viaPoly !== undefined, print(tree));
      assert.ok(seq(viaTree, fromQ(viaPoly)), `${print(tree)} at ${show(env)}`);
    }
    // the display tree is the same polynomial
    const back = toPoly(polyToNode(p));
    assert.ok(back && polyEq(back, p), print(polyToNode(p)));
  });
});

/**
 * Do two trees agree at every point of a grid with `size` values per variable?
 * Uses evaluate.js only (never poly.js).
 * @param {Node} a @param {Node} b @param {string[]} names @param {number} size
 */
function agreeOnGrid(a, b, names, size) {
  const idx = names.map(() => 0);
  for (;;) {
    /** @type {Record<string, import('../../types.d.ts').Q>} */
    const env = {};
    names.forEach((nm, j) => { env[nm] = q(idx[j] - 2); });
    const x = evaluate(a, env); const y = evaluate(b, env);
    assert.ok(x && y);
    if (!seq(x, y)) return false;
    let k = 0;
    while (k < idx.length && ++idx[k] === size) { idx[k] = 0; k++; }
    if (k === idx.length) return true;
  }
}

test('polyEq cross-checked against exact evaluation at degree+1 points (univariate)', () => {
  let equalCases = 0; let unequalCases = 0;
  forSeeds(5000, (rng) => {
    const a = polyAst(rng, ['x'], 3);
    const pa = /** @type {Poly} */ (toPoly(a));
    // b is either an independent tree, the expanded form of a, or a perturbed by a low-degree term
    const mode = rng.int(0, 3);
    /** @type {Node} */
    let b;
    if (mode === 0) b = polyAst(rng, ['x'], 3);
    else if (mode === 1) b = polyToNode(pa);
    else if (mode === 2) b = { t: 'add', args: [polyToNode(pa), { t: 'mul', args: [{ t: 'num', q: rq(rng, 3) }, { t: 'pow', base: { t: 'var', name: 'x' }, exp: { t: 'num', q: q(rng.int(1, 3)) } }] }] };
    else b = { t: 'mul', args: [a, { t: 'num', q: q(rng.int(1, 2)) }] };
    const pb = /** @type {Poly} */ (toPoly(b));
    assert.ok(pa && pb);
    const d = Math.max(degree(pa), degree(pb), 0);
    // A nonzero polynomial of degree <= d has at most d roots, so agreement at d+1 points is identity.
    const byPoints = agreeOnGrid(a, b, ['x'], d + 1);
    assert.equal(polyEq(pa, pb), byPoints, `${print(a)}  vs  ${print(b)}`);
    if (byPoints) equalCases++; else unequalCases++;
  });
  assert.ok(equalCases > 1000 && unequalCases > 1000, `both outcomes exercised (${equalCases} equal, ${unequalCases} unequal)`);
});

test('polyEq cross-checked against exact evaluation on a (d+1)^2 grid (two variables)', () => {
  let equalCases = 0; let unequalCases = 0;
  forSeeds(2000, (rng) => {
    const a = polyAst(rng, ['x', 'y'], 2);
    const pa = /** @type {Poly} */ (toPoly(a));
    const mode = rng.int(0, 2);
    /** @type {Node} */
    const b = mode === 0 ? polyAst(rng, ['x', 'y'], 2)
      : mode === 1 ? polyToNode(pa)
        : { t: 'add', args: [polyToNode(pa), { t: 'mul', args: [{ t: 'num', q: rq(rng, 3) }, { t: 'var', name: 'x' }, { t: 'var', name: 'y' }] }] };
    const pb = /** @type {Poly} */ (toPoly(b));
    const d = Math.max(degree(pa), degree(pb), 0);
    const byPoints = agreeOnGrid(a, b, ['x', 'y'], d + 1);
    assert.equal(polyEq(pa, pb), byPoints, `${print(a)}  vs  ${print(b)}`);
    if (byPoints) equalCases++; else unequalCases++;
  });
  assert.ok(equalCases > 300 && unequalCases > 300, `${equalCases} equal, ${unequalCases} unequal`);
});

test('toRat: quotient form and recorded poles', () => {
  /** @param {string} s */
  const R = (s) => {
    const r = toRat(P(s));
    assert.ok(r, s);
    return { num: print(polyToNode(r.num)), den: print(polyToNode(r.den)), poles: r.poles.map((p) => print(polyToNode(p))) };
  };
  assert.deepEqual(R('x/x'), { num: 'x', den: 'x', poles: ['x'] });
  assert.deepEqual(R('1/(2x-4)'), { num: '1', den: '2x - 4', poles: ['x - 2'] });
  assert.deepEqual(R('x^0'), { num: '1', den: '1', poles: ['x'] });
  assert.deepEqual(R('x^(-2)'), { num: '1', den: 'x^2', poles: ['x'] });
  assert.deepEqual(R('1/x+1/y'), { num: 'x + y', den: 'xy', poles: ['x', 'y'] });
  assert.deepEqual(R('1/(1/x)'), { num: 'x', den: '1', poles: ['x'] });
  assert.deepEqual(R('(x+1)/2'), { num: 'x + 1', den: '2', poles: [] });
  for (const text of ['1/(x-x)', 'x/0', '(x-x)^0', '(x-x)^(-1)', 'sqrt(x)/x', 'x/sqrt(2)', '1/x^(1/2)', '2^x', 'x^(-65)']) assert.equal(toRat(P(text)), undefined, text);
});

test('toRat agrees with tree evaluation wherever the tree is defined', () => {
  let defined = 0;
  forSeeds(4000, (rng) => {
    /** @type {Node} */
    const tree = { t: 'add', args: [
      { t: 'frac', num: polyAst(rng, ['x', 'y'], 2), den: polyAst(rng, ['x', 'y'], 2) },
      { t: 'mul', args: [polyAst(rng, ['x', 'y'], 1), { t: 'pow', base: polyAst(rng, ['x', 'y'], 1), exp: { t: 'num', q: q(rng.int(-2, 2)) } }] },
    ] };
    const r = toRat(tree);
    for (let i = 0; i < 3; i++) {
      const env = renv(rng, ['x', 'y']);
      const viaTree = evaluate(tree, env);
      if (!viaTree) continue;
      // defined at a point => toRat exists, every pole is nonzero there, and num/den has the same value
      assert.ok(r, `${print(tree)} is defined at ${show(env)} so it must have a quotient form`);
      for (const pole of r.poles) assert.ok(!qeq(/** @type {import('../../types.d.ts').Q} */ (polyEval(pole, env)), ZERO), `pole of ${print(tree)} vanishes at a defined point`);
      const nv = /** @type {import('../../types.d.ts').Q} */ (polyEval(r.num, env));
      const dv = /** @type {import('../../types.d.ts').Q} */ (polyEval(r.den, env));
      assert.ok(dv.n !== 0n, 'denominator nonzero at a defined point');
      const tv = toQ(viaTree);
      assert.ok(tv && nv.n * dv.d * tv.d === tv.n * dv.n * nv.d, `${print(tree)} at ${show(env)}`);
      defined++;
    }
  });
  assert.ok(defined > 5000, `${defined} defined evaluations`);
});
