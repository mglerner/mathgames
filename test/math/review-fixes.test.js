// @ts-check
// Regression and property tests for the m1a adversarial-review findings.
// Each block names the finding it pins. Answer keys come from an independent
// path (raising back to a power, substitution at exact points), never from the
// function under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { P } from './_arb.js';
import { q, qpow } from '../../src/math/rational.js';
import { fromQ, seq, spow, ssign, toQ, sq } from '../../src/math/surd.js';
import { evaluate } from '../../src/math/evaluate.js';
import { num, numQ, pow, frac, neg } from '../../src/math/ast.js';
import { parse, parseSolutions } from '../../src/math/parse.js';
import { print } from '../../src/math/print.js';
import { equivExpr, sameSides, isMultiple, multiplier, sameSolutions } from '../../src/math/equiv.js';
import { forms, formNames, getForm, hasForm, failedForms } from '../../src/math/forms.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Assumption} Assumption */

const E = (/** @type {string} */ s) => /** @type {Equation} */ (P(s));
const N = (/** @type {string} */ s) => /** @type {Node} */ (P(s));
/** @type {Assumption[]} */
const XNZ = [{ name: 'x', rel: 'nonzero' }];

// ------------------------------------------------- oracle: domain of equations

test('isMultiple / sameSides / multiplier: a different domain is never a definite true', () => {
  // the reviewer's cases
  assert.equal(isMultiple(E('x^2/x=0'), E('x=0')), undefined);
  assert.equal(isMultiple(E('x(x-1)/(x-1)=1'), E('x=1')), undefined);
  assert.equal(sameSides(E('x^2/x=0'), E('x=0')), undefined);
  assert.equal(multiplier(E('x^2/x=0'), E('x=0')), undefined);
  // the direction does not matter
  assert.equal(isMultiple(E('x=0'), E('x^2/x=0')), undefined);
  assert.equal(sameSides(E('x=0'), E('x^2/x=0')), undefined);
  // the radical fallback has the same rule
  assert.equal(isMultiple(E('sqrt(2)x^2/x=0'), E('sqrt(2)x=0')), undefined);
  assert.equal(isMultiple(E('2sqrt(2)x/x=4'), E('sqrt(2)x/x=2')), true);
  // both differences zero: 0/x = 0 fails at 0, 0 = 0 never fails
  assert.equal(isMultiple(E('0/x=0'), E('0=0')), undefined);
  // same domain on both: still a proof
  assert.equal(isMultiple(E('2/x=4'), E('1/x=2')), true);
  assert.equal(isMultiple(E('2/x+2x=4'), E('1/x+x=2')), true);
  assert.equal(isMultiple(E('1/(2x)=1'), E('1/x=2')), true, '2x and x vanish at the same points');
  assert.equal(isMultiple(E('1/x^2=1/x'), E('2/x^2=2/x')), true);
  assert.equal(sameSides(E('6/x=2'), E('2=6/x')), true);
  assert.equal(sameSides(E('1/(x-1)=2'), E('1/(x-1)=2')), true);
  assert.equal(sameSides(E('x^(-1)=2'), E('1/x=2')), true);
  assert.equal(sameSides(E('sqrt(x)^2/x^2=2'), E('1/x=2'), [{ name: 'x', rel: 'nonneg' }]), true, 'radical and rational sides name the pole the same way');
  // a declaration removes the pole
  assert.equal(isMultiple(E('x^2/x=0'), E('x=0'), XNZ), true);
  assert.equal(sameSides(E('x^2/x=0'), E('x=0'), XNZ), true);
  assert.deepEqual(multiplier(E('x^2/x=0'), E('x=0'), XNZ), { k: q(1), powers: {} });
  // false stays false, whatever the domains
  assert.equal(isMultiple(E('x^2/x=1'), E('x=0')), false);
  assert.equal(sameSides(E('x^2/x=1'), E('x=0')), false);
  assert.equal(isMultiple(E('(2x^2-4x-6)/x=0'), E('6+4x=2x^2')), false);
  // multiplier: a pole in a variable of `powers` is the caller's "declared nonzero" check, not a domain change
  assert.deepEqual(multiplier(E('1=2x'), E('1/x=2')), { k: q(1), powers: { x: 1 } });
  assert.deepEqual(multiplier(E('A/l=w'), E('A=lw')), { k: q(1), powers: { l: -1 } });
  // ... but a pole in another variable is a domain change
  assert.equal(multiplier(E('xy/y=2x'), E('1=2')), undefined);
  // sameSolutions was already right
  assert.equal(sameSolutions(E('x^2/x=0'), E('x=0'), 'x').equal, undefined);
});

test('isMultiple / sameSides true is sound against substitution (5000 seeds)', () => {
  // Independent path: at every exact probe point, the two equations must be
  // defined together and hold together.
  const points = [-3, -2, -1, 0, 1, 2, 3, 4, 5].map((k) => q(k)).concat([q(1, 2), q(-1, 2), q(3, 2)]);
  /** @param {Equation} e @param {import('../../types.d.ts').Q} x @returns {boolean | undefined} holds / fails / not defined */
  const holds = (e, x) => {
    const l = evaluate(e.lhs, { x });
    const r = evaluate(e.rhs, { x });
    return l && r ? seq(l, r) : undefined;
  };
  let trues = 0;
  let undef = 0;
  let caught = 0;
  forSeeds(5000, (rng) => {
    const pole = () => rng.pick(['x', '(x-1)', '(x+2)', '(2x)', '(x-3)']);
    const r0 = rng.int(-3, 3);
    const r1 = rng.int(-3, 5);
    const a = rng.int(1, 4);
    // orig has roots r0 and r1 (or is linear with root r0), optionally with a pole of its own
    const body = rng.bool(0.5) ? `${a}(x-(${r0}))(x-(${r1}))` : `${a}x-(${a * r0})`;
    const own = rng.bool(0.4) ? pole() : '';
    const orig = own ? `(${body})/${own}=0` : `${body}=0`;
    const k = rng.pick([1, 2, 3, -1, -2]);
    // got: k times orig, optionally decorated with d/d or + 1/d - 1/d (changes the domain only)
    const dec = rng.int(0, 3);
    const d = pole();
    /** @param {number} kk @returns {string} kk times orig, decorated */
    const build = (kk) => {
      let lhs = own ? `${kk}(${body})/${own}` : `${kk}(${body})`;
      if (dec === 1) lhs = `(${lhs})${d}/${d}`;
      if (dec === 2) lhs = `${lhs}+1/${d}-1/${d}`;
      return dec === 3 ? `0=${lhs}` : `${lhs}=0`;
    };
    const got = build(k);
    const g = E(got);
    const g1 = E(build(1)); // side-wise equal to orig where defined (sameSides is not about multiples)
    const o = E(orig);
    const sameDomainAtProbes = points.every((x) => (holds(g, x) === undefined) === (holds(o, x) === undefined));
    for (const [name, res, lhsEq] of /** @type {[string, any, Equation][]} */ ([['isMultiple', isMultiple(g, o), g], ['sameSides', sameSides(g1, o), g1], ['isMultiple rev', isMultiple(o, g), g]])) {
      assert.notEqual(res, false, `${name}: ${print(lhsEq)} matches ${orig} where defined`);
      if (res === true) {
        trues++;
        for (const x of points) assert.equal(holds(lhsEq, x), holds(o, x), `${name} said true but ${print(lhsEq)} and ${orig} differ at x = ${x.n}/${x.d}`);
      } else {
        undef++;
        if (!sameDomainAtProbes) caught++;
      }
    }
    if (!sameDomainAtProbes) assert.equal(sameSides(g1, o), undefined, `sameSides ${print(g1)} vs ${orig}`);
    // completeness on the plain case: no decoration means a definite true
    if (dec === 0 || dec === 3) assert.equal(isMultiple(g, o), true, `${got} vs ${orig}`);
    // and a decoration that changes the domain at a probe point must not be true
    if (!sameDomainAtProbes) assert.equal(isMultiple(g, o), undefined, `${got} vs ${orig}`);
  });
  assert.ok(trues > 3000 && undef > 1000 && caught > 1000, `non-vacuous: ${trues} true, ${undef} undefined, ${caught} with a visible domain change`);
});

// ------------------------------------------------- oracle: surd-valued rational powers

test('b^(p/q) with an exact surd value evaluates (4^(1/4) = sqrt(2))', () => {
  /** @type {[string, string][]} */
  const table = [
    ['4^(1/4)', 'sqrt(2)'], ['4^(3/4)', '2sqrt(2)'], ['9^(1/4)', 'sqrt(3)'], ['8^(1/6)', 'sqrt(2)'],
    ['27^(1/6)', 'sqrt(3)'], ['(4/9)^(1/4)', 'sqrt(6)/3'], ['4^(-1/4)', 'sqrt(2)/2'], ['64^(5/6)', '32'],
    ['16^(3/4)', '8'], ['8^(1/3)', '2'], ['25^(3/4)', '5sqrt(5)'], ['4^(5/4)', '4sqrt(2)'],
  ];
  for (const [a, b] of table) assert.equal(equivExpr(N(a), N(b)).equal, true, `${a} = ${b}`);
  assert.equal(equivExpr(N('4^(1/4)'), N('2')).equal, false);
  assert.equal(equivExpr(N('(4x^2)^(1/4)'), N('sqrt(2)sqrt(x)'), [{ name: 'x', rel: 'nonneg' }]).equal, true);
  // still cannot verify: not a sum of square roots
  for (const s of ['2^(1/4)', '2^(1/3)', '8^(1/4)', '12^(1/6)']) assert.equal(evaluate(N(s), {}), undefined, s);
});

test('rational powers: every value returned satisfies r^k = b^p and r > 0 (8000 seeds)', () => {
  let surdHits = 0;
  let exactHits = 0;
  let undef = 0;
  forSeeds(8000, (rng) => {
    const k = rng.pick([2, 3, 4, 6, 8]);
    let p = rng.int(1, 5) * (rng.bool(0.3) ? -1 : 1);
    // half the time build a base that has an exact surd value, otherwise a random base
    let b = q(rng.int(1, 40), rng.int(1, 12));
    if (rng.bool(0.6)) {
      const s = q(rng.int(1, 12), rng.int(1, 6));
      b = /** @type {import('../../types.d.ts').Q} */ (qpow(s, rng.bool(0.5) && k % 2 === 0 ? k / 2 : k));
    }
    const node = pow(numQ(b), frac(p < 0 ? neg(num(-p)) : num(p), num(k)));
    const r = evaluate(node, {});
    if (!r) { undef++; return; }
    // independent check: raise back
    const back = spow(r, k);
    const want = qpow(b, p);
    assert.ok(back && want && seq(back, fromQ(want)), `${print(node)}: r^${k} != b^${p}`);
    assert.equal(ssign(r), 1, `${print(node)} must be positive`);
    if (toQ(r)) exactHits++; else surdHits++;
  });
  assert.ok(surdHits > 800 && exactHits > 800 && undef > 800, `non-vacuous: ${surdHits} surd, ${exactHits} rational, ${undef} undefined`);
});

test('rational powers: undefined only when the value really is not a square-root number (4000 seeds)', () => {
  // Built backward: b = s^m with s rational, exponent p/(2m), p odd. The value is sqrt(s)^p.
  forSeeds(4000, (rng) => {
    const m = rng.int(1, 4);
    const s = q(rng.int(1, 30), rng.int(1, 9));
    const p = 2 * rng.int(0, 3) + 1;
    const b = /** @type {import('../../types.d.ts').Q} */ (qpow(s, m));
    const got = evaluate(pow(numQ(b), numQ(q(p, 2 * m))), {});
    const want = evaluate(pow({ t: 'root', index: 2, radicand: numQ(s) }, num(p)), {});
    assert.ok(got && want && seq(got, want), `(${b.n}/${b.d})^(${p}/${2 * m})`);
  });
});

// ------------------------------------------------- parser-api: forms

test('denominator:N looks through a leading minus and judges the value side of "x = ..." (3000 seeds)', () => {
  const f = (/** @type {string} */ name) => /** @type {import('../../types.d.ts').FormPredicate} */ (getForm(name));
  assert.equal(f('denominator:8')(P('-6/8')), true);
  assert.equal(f('denominator:8')(P('- 6/8')), true);
  assert.equal(f('denominator:8')(P('(-6)/8')), true);
  assert.equal(f('denominator:8')(P('-(6/8)')), true);
  assert.equal(f('denominator:8')(P('6/(-8)')), false, 'the denominator typed is -8');
  assert.equal(f('denominator:8')(P('-3/4')), false);
  assert.equal(f('denominator:4')(P('x = 3/4')), true);
  assert.equal(f('denominator:4')(P('3/4 = x')), true);
  assert.equal(f('denominator:4')(P('x = -3/4')), true);
  assert.equal(f('denominator:4')(P('x = 6/8')), false);
  assert.equal(f('denominator:4')(P('1/4 = 2/4')), true);
  assert.equal(f('denominator:4')(P('1/4 = 1/2')), false);
  assert.equal(f('denominator:4')(P('1/4 + 1/4')), false, 'a sum is not one fraction');
  assert.equal(f('denominator:4')(numQ(q(-3, 4))), true, 'generator-built literal');
  assert.equal(f('denominator:1')(num(4)), false);
  forSeeds(3000, (rng) => {
    const a = rng.int(1, 60);
    const n = rng.int(2, 40);
    const top = rng.bool(0.3) ? `${a}x` : `${a}`;
    for (const s of [`${top}/${n}`, `-${top}/${n}`, `- ${top}/${n}`, `(-${top})/${n}`, `y = -${top}/${n}`, `-${top}/${n} = y`]) {
      assert.equal(f(`denominator:${n}`)(P(s)), true, s);
      assert.equal(f(`denominator:${n + 1}`)(P(s)), false, s);
    }
  });
});

test('lowest-terms (and every predicate) is fast and never throws on typed power towers', () => {
  const towers = ['(((((2^64)^64)^64)^64)^64)/2', '(((((9^64)^64)^64)^64)^64)/2', '((((9^64)^64)^64)^64)/2', '2/(((((6^64)^64)^64)^64)^64)',
    '(2^64*2^64*2^64*2^64)^64/(2^64)^64', '9^9^9/3', '(x^64)^64/(2^64)^64', 'x = (((3^64)^64)^64)/3'];
  for (const s of towers) {
    const n = P(s);
    const t0 = performance.now();
    for (const name of [...formNames, 'denominator:2', 'isolated:x']) {
      assert.equal(typeof (/** @type {any} */ (getForm(name)))(n), 'boolean', `${name} on ${s}`);
    }
    assert.ok(Array.isArray(failedForms(['integer', 'lowest-terms'], n)));
    const ms = performance.now() - t0;
    assert.ok(ms < 500, `${s} took ${ms.toFixed(0)} ms`);
  }
  // below the cap the content is still computed
  assert.equal(forms['lowest-terms'](P('2^10/4')), false);
  assert.equal(forms['lowest-terms'](P('(2^5)^5/2')), false);
  assert.equal(forms['lowest-terms'](P('3^10/4')), true);
});

test('no-radical-in-denominator: a negative non-integer power is a radical in a denominator (3000 seeds)', () => {
  const f = forms['no-radical-in-denominator'];
  for (const s of ['2^(-1/2)', '3(2^(-1/2))', 'x^(-1/2)', '2^(-3/2)', '5 + x^(-2/3)', '1/2^(-1/2)', 'y = 2^(-1/2)']) assert.equal(f(P(s)), false, s);
  for (const s of ['2^(-1)', 'x^(-2)', '2^(1/2)', 'x^(3/2)', 'sqrt(2)/2', '2^(1/2)/2']) assert.equal(f(P(s)), true, s);
  forSeeds(3000, (rng) => {
    const b = rng.bool(0.5) ? `${rng.int(2, 30)}` : rng.pick(['x', 'y', '(2x)']);
    const p = rng.int(1, 5);
    const k = rng.pick([2, 3, 4]);
    if (p % k === 0) return;
    const c = rng.int(1, 9);
    // the exponent form and the fraction form are the same thing written two ways
    assert.equal(f(P(`${c}(${b}^(-${p}/${k}))`)), false);
    assert.equal(f(P(`${c}/${b}^(${p}/${k})`)), false);
    assert.equal(f(P(`${c}(${b}^(${p}/${k}))`)), true);
  });
});

test('radical-simplified: rational powers other than 1/2', () => {
  const f = forms['radical-simplified'];
  const fail = ['2^(3/2)', '12^(3/2)', '8^(1/2)', 'x^(3/2)', '2^(-1/2)', '2^(5/2)', '3(2^(3/2))', '8^(1/3)', '4^(1/4)', '16^(3/4)', '27^(2/3)', 'y = 2^(3/2)'];
  const pass = ['2^(1/2)', 'x^(1/2)', '(2x)^(1/2)', '2sqrt(2)', '2^(1/3)', '2^(2/3)', 'x^(1/3)', 'x^(2/3)', '2^3', 'x^2', '2^(-1)', '2^x'];
  for (const s of fail) assert.equal(f(P(s)), false, s);
  for (const s of pass) assert.equal(f(P(s)), true, s);
  // every failing numeric case above has the same value as a finished form (the value check passes, only the form check rejects)
  assert.equal(equivExpr(N('2^(3/2)'), N('2sqrt(2)')).equal, true);
  assert.equal(equivExpr(N('12^(3/2)'), N('24sqrt(3)')).equal, true);
});

test('standard-form needs a variable; isolated:v names the target', () => {
  const sf = forms['standard-form'];
  for (const s of ['6 = 0', '0 = 6', '-3 = 0', '1/2 = 0']) assert.equal(sf(P(s)), false, s);
  for (const s of ['x = 0', '0 = x', 'x^2 - 6 = 0', '0 = 2x^2 - 4x - 6']) assert.equal(sf(P(s)), true, s);
  // an unsimplified coefficient is lowest-terms' job, and it does catch it
  assert.deepEqual(failedForms(['standard-form', 'lowest-terms'], P('x^2 - 4/2 = 0')), ['lowest-terms']);
  // "+ -6" and "- 6" are the same tree (frozen Node type), so no predicate can tell them apart
  assert.deepEqual(P('x^2 + -6 = 0'), P('x^2 - 6 = 0'));

  const iso = (/** @type {string} */ name, /** @type {string} */ s) => /** @type {any} */ (getForm(name))(P(s));
  assert.equal(iso('isolated:w', 'A = lw'), false);
  assert.equal(iso('isolated:A', 'A = lw'), true);
  assert.equal(iso('isolated:w', 'w = A/l'), true);
  assert.equal(iso('isolated:w', 'A/l = w'), true);
  assert.equal(iso('isolated:w', 'w = A/w'), false);
  assert.equal(iso('isolated:x', 'y = 2x'), false);
  assert.equal(iso('isolated:x', 'x'), false);
  assert.equal(forms.isolated(P('A = lw')), true, 'the bare predicate accepts any lone variable (documented)');
  assert.ok(hasForm('isolated:w') && !hasForm('isolated:') && !hasForm('isolated:xy') && !hasForm('isolated:2'));
});

// ------------------------------------------------- parser-api: "+-" in a solution list

test('parseSolutions reads adjacent "+-" as plus-minus; parse keeps plus-negative (3000 seeds)', () => {
  const roots = (/** @type {string} */ s) => {
    const r = parseSolutions(s, 'x');
    assert.ok(!('error' in r), `${s}: ${'error' in r ? r.error : ''}`);
    assert.equal(/** @type {any} */ (r).set.kind, 'finite');
    return /** @type {any} */ (r).set.roots;
  };
  assert.deepEqual(roots('x = 1 +- 2'), [sq(-1n), sq(3n)]);
  assert.deepEqual(roots('1+-sqrt(3)'), roots('1 \u00b1 sqrt(3)'));
  assert.deepEqual(roots('+-2'), [sq(-2n), sq(2n)]);
  assert.deepEqual(roots('1 + -2'), [sq(-1n)], 'with a space it is plus, negative');
  assert.deepEqual(roots('3, 1+-2'), [sq(-1n), sq(3n)]);
  assert.ok('error' in parseSolutions('1 +- 2 +- 3'), 'more than one plus-minus');
  assert.ok('error' in parseSolutions('1 +- 2 +/- 3'));
  assert.deepEqual(P('3+-2'), P('3-2'), 'parse() is unchanged');
  forSeeds(3000, (rng) => {
    const a = rng.int(-20, 20);
    const b = rng.int(1, 20);
    const sp = () => (rng.bool(0.5) ? ' ' : '');
    const want = [sq(BigInt(a - b)), sq(BigInt(a + b))];
    for (const pm of ['+-', '+/-', '\u00b1']) assert.deepEqual(roots(`x${sp()}=${sp()}${a}${sp()}${pm}${sp()}${b}`), want, `${a} ${pm} ${b}`);
    assert.deepEqual(roots(`${a} + -${b}`), [sq(BigInt(a - b))]);
    const plain = /** @type {Node} */ (parse(`${a}+-${b}`));
    const val = evaluate(plain, {});
    assert.ok(val && seq(val, sq(BigInt(a - b))));
  });
});
