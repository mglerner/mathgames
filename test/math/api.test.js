// @ts-check
// The Math API of DESIGN.md section 11: every promised name is exported by the
// promised module, with the promised arity. Downstream milestones code against
// these names unseen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rational from '../../src/math/rational.js';
import * as surd from '../../src/math/surd.js';
import * as parseM from '../../src/math/parse.js';
import * as printM from '../../src/math/print.js';
import * as evaluateM from '../../src/math/evaluate.js';
import * as poly from '../../src/math/poly.js';
import * as radical from '../../src/math/radical.js';
import * as equiv from '../../src/math/equiv.js';
import * as forms from '../../src/math/forms.js';
import * as solveM from '../../src/math/solve.js';
import * as ast from '../../src/math/ast.js';

/** @type {[string, Record<string, unknown>, Record<string, number>][]} name -> minimum declared parameter count */
const API = [
  ['rational.js', rational, { q: 1, add: 2, sub: 2, mul: 2, div: 2, neg: 1, cmp: 2, qeq: 2 }],
  ['surd.js', surd, { sadd: 2, smul: 2, seq: 2, sqrtQ: 1, approx: 2 }],
  ['parse.js', parseM, { parse: 1 }],
  ['print.js', printM, { print: 1 }],
  ['evaluate.js', evaluateM, { evaluate: 2 }],
  ['poly.js', poly, { toPoly: 1, polyEq: 2, degree: 1 }],
  ['radical.js', radical, { toRadicalNormalForm: 2 }],
  ['equiv.js', equiv, { equivExpr: 2, sameSides: 2, isMultiple: 2, sameSolutions: 3 }],
  ['solve.js', solveM, { solve: 2 }],
  // extras that other milestones are told about in the M1a report
  ['surd.js extras', surd, { ssub: 2, sneg: 1, sinv: 1, sdiv: 2, ssign: 1, scmp: 2, spow: 2, sscale: 2, fromQ: 1, toQ: 1, sq: 1, surdToNode: 1 }],
  ['ast.js', ast, { num: 1, numQ: 1, v: 1, add: 0, mul: 0, neg: 1, sub: 2, frac: 2, pow: 2, sqrt: 1, root: 2, group: 1, eq: 2, isEquation: 1, stripGroups: 1, same: 2, vars: 1, children: 1, some: 2 }],
  ['parse.js extras', parseM, { parseList: 1, parseSolutions: 2 }],
  ['evaluate.js extras', evaluateM, { evaluateS: 2, constValue: 1, constQ: 1 }],
  ['poly.js extras', poly, { toRat: 1, polyToNode: 1, polyEval: 2, coeffsIn: 2, polyVars: 1, degreeIn: 2 }],
  ['equiv.js extras', equiv, { multiplier: 2, findWitness: 2 }],
  ['solve.js extras', solveM, { checkRoot: 3, sameSolutionSet: 2 }],
  ['forms.js', forms, { getForm: 1, hasForm: 1, failedForms: 2 }],
];

test('every API name is exported as a function with the documented arity', () => {
  for (const [file, mod, names] of API) {
    for (const [name, arity] of Object.entries(names)) {
      assert.equal(typeof mod[name], 'function', `${file} must export ${name}`);
      assert.equal(/** @type {Function} */ (mod[name]).length, arity, `${file} ${name} arity`);
    }
  }
  assert.equal(typeof forms.forms, 'object');
  assert.ok(Array.isArray(forms.formNames) && forms.formNames.length >= 10);
  assert.equal(equiv.WHERE_DEFINED, 'equal where defined');
});

test('the result shapes match types.d.ts', () => {
  const two = rational.q(2);
  assert.deepEqual(Object.keys(two).sort(), ['d', 'n']);
  assert.equal(typeof two.n, 'bigint');
  const s = /** @type {import('../../types.d.ts').Surd} */ (surd.sqrtQ(rational.q(12)));
  assert.deepEqual(s, { terms: [{ coef: { n: 2n, d: 1n }, rad: 3n }] });
  const p = /** @type {any} */ (poly.toPoly(ast.v('x')));
  assert.equal(p.kind, 'poly');
  const r = /** @type {any} */ (radical.toRadicalNormalForm(ast.v('x'), []));
  assert.equal(r.kind, 'radnf');
  const e = parseM.parse('x=1');
  assert.ok(!('error' in e) && e.t === 'eq');
  assert.deepEqual(solveM.solve(/** @type {any} */ (e), 'x'), { kind: 'finite', roots: [{ terms: [{ coef: { n: 1n, d: 1n }, rad: 1n }] }] });
  assert.deepEqual(equiv.equivExpr(ast.v('x'), ast.v('x')), { equal: true });
  assert.deepEqual(equiv.sameSolutions(/** @type {any} */ (e), /** @type {any} */ (e), 'x'), { equal: true });
});
