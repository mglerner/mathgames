// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { P, show, shapeAst, wildAst, renv, LETTERS } from './_arb.js';
import { q } from '../../src/math/rational.js';
import { num, numQ, v, add, mul, neg, frac, pow, sqrt, root, group, eq, sub, stripGroups, same, isEquation, vars } from '../../src/math/ast.js';
import { parse, parseList, parseSolutions, MAX_INPUT } from '../../src/math/parse.js';
import { print } from '../../src/math/print.js';
import { evaluate } from '../../src/math/evaluate.js';
import { seq, sq, sqrtQ, sadd, ssub } from '../../src/math/surd.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Surd} Surd */

const x = v('x');
const y = v('y');
const n = (/** @type {number} */ k) => num(k);

/** [typed text, expected tree, canonical print] */
/** @type {[string, any, string][]} */
const PARSES = [
  // numbers, variables, the four operations
  ['7', n(7), '7'],
  ['x', x, 'x'],
  ['x+2', add(x, n(2)), 'x + 2'],
  ['x-2', add(x, neg(n(2))), 'x - 2'],
  ['x - 2 + y', add(x, neg(n(2)), y), 'x - 2 + y'],
  ['a - -b', add(v('a'), neg(neg(v('b')))), 'a - (-b)'],
  ['2*3', mul(n(2), n(3)), '2(3)'],
  ['3/4', frac(n(3), n(4)), '3/4'],
  ['-3', neg(n(3)), '-3'],
  ['+3', n(3), '3'],
  ['-3/4', neg(frac(n(3), n(4))), '-3/4'],
  ['(-3)/4', frac(group(neg(n(3))), n(4)), '(-3)/4'],
  ['3/-4', frac(n(3), neg(n(4))), '3/(-4)'],
  // implicit multiplication
  ['2x', mul(n(2), x), '2x'],
  ['xy', mul(x, y), 'xy'],
  ['2xy', mul(n(2), x, y), '2xy'],
  ['3(x+1)', mul(n(3), group(add(x, n(1)))), '3(x + 1)'],
  ['(x+1)(x+2)', mul(group(add(x, n(1))), group(add(x, n(2)))), '(x + 1)(x + 2)'],
  ['x(x+1)', mul(x, group(add(x, n(1)))), 'x(x + 1)'],
  ['(x+1)2', mul(group(add(x, n(1))), n(2)), '(x + 1)(2)'],
  ['2sqrt(3)', mul(n(2), sqrt(n(3))), '2sqrt(3)'],
  ['2sqrt3', mul(n(2), sqrt(n(3))), '2sqrt(3)'],
  ['sqrt3', sqrt(n(3)), 'sqrt(3)'],
  ['sqrt 3', sqrt(n(3)), 'sqrt(3)'],
  ['sqrt12', sqrt(n(12)), 'sqrt(12)'],
  ['sqrtx', sqrt(x), 'sqrt(x)'],
  ['sqrt3x', mul(sqrt(n(3)), x), 'sqrt(3)x'],
  ['xsqrt3', mul(x, sqrt(n(3))), 'xsqrt(3)'],
  ['sqrt(3)sqrt(3)', mul(sqrt(n(3)), sqrt(n(3))), 'sqrt(3)sqrt(3)'],
  ['x2', mul(x, n(2)), 'x(2)'],
  ['2 x', mul(n(2), x), '2x'],
  // unary minus covers the whole term
  ['-2x', neg(mul(n(2), x)), '-2x'],
  ['-x^2', neg(pow(x, n(2))), '-x^2'],
  ['(-x)^2', pow(group(neg(x)), n(2)), '(-x)^2'],
  ['2-3x', add(n(2), neg(mul(n(3), x))), '2 - 3x'],
  ['-x+y', add(neg(x), y), '-x + y'],
  ['--x', neg(neg(x)), '-(-x)'],
  ['2*-3', mul(n(2), neg(n(3))), '2(-3)'],
  ['-(x-2)', neg(group(add(x, neg(n(2))))), '-(x - 2)'],
  // precedence of / and implicit multiplication: left to right
  ['1/2x', mul(frac(n(1), n(2)), x), '(1/2)x'],
  ['2x/3', frac(mul(n(2), x), n(3)), '2x/3'],
  ['a/bc', mul(frac(v('a'), v('b')), v('c')), '(a/b)c'],
  ['a/b/c', frac(frac(v('a'), v('b')), v('c')), 'a/b/c'],
  ['a/(bc)', frac(v('a'), group(mul(v('b'), v('c')))), 'a/(bc)'],
  ['4*1/3', frac(mul(n(4), n(1)), n(3)), '4(1)/3'],
  ['6/sqrt(3)', frac(n(6), sqrt(n(3))), '6/sqrt(3)'],
  ['6/sqrt3', frac(n(6), sqrt(n(3))), '6/sqrt(3)'],
  ['(x+6)/3', frac(group(add(x, n(6))), n(3)), '(x + 6)/3'],
  ['x/2+x/3', add(frac(x, n(2)), frac(x, n(3))), 'x/2 + x/3'],
  ['a*b*c', mul(v('a'), v('b'), v('c')), 'abc'],
  ['a*b/c*d', mul(frac(mul(v('a'), v('b')), v('c')), v('d')), '(ab/c)d'],
  // powers, right associative, rational exponents in parentheses
  ['x^2', pow(x, n(2)), 'x^2'],
  ['2x^2', mul(n(2), pow(x, n(2))), '2x^2'],
  ['x^2y', mul(pow(x, n(2)), y), 'x^2y'],
  ['x^2^3', pow(x, pow(n(2), n(3))), 'x^(2^3)'],
  ['(x^2)^3', pow(group(pow(x, n(2))), n(3)), '(x^2)^3'],
  ['x^(1/2)', pow(x, group(frac(n(1), n(2)))), 'x^(1/2)'],
  ['9^(1/2)', pow(n(9), group(frac(n(1), n(2)))), '9^(1/2)'],
  ['(9^(1/2))^2', pow(group(pow(n(9), group(frac(n(1), n(2))))), n(2)), '(9^(1/2))^2'],
  ['x^-2', pow(x, neg(n(2))), 'x^(-2)'],
  ['x^(-2)', pow(x, group(neg(n(2)))), 'x^(-2)'],
  ['x^1/2', frac(pow(x, n(1)), n(2)), 'x^1/2'],
  ['2^x', pow(n(2), x), '2^x'],
  ['sqrtx^2', pow(sqrt(x), n(2)), 'sqrt(x)^2'],
  ['sqrt(x^2)', sqrt(pow(x, n(2))), 'sqrt(x^2)'],
  ['sqrt(3)^2', pow(sqrt(n(3)), n(2)), 'sqrt(3)^2'],
  ['sqrt(a+b)', sqrt(add(v('a'), v('b'))), 'sqrt(a + b)'],
  ['sqrt((x))', sqrt(group(x)), 'sqrt((x))'],
  ['((x))', group(group(x)), '((x))'],
  // equations
  ['6+4x=2x^2', eq(add(n(6), mul(n(4), x)), mul(n(2), pow(x, n(2)))), '6 + 4x = 2x^2'],
  ['0 = 2x^2 - 4x - 6', eq(n(0), add(mul(n(2), pow(x, n(2))), neg(mul(n(4), x)), neg(n(6)))), '0 = 2x^2 - 4x - 6'],
  ['x=-3', eq(x, neg(n(3))), 'x = -3'],
  ['x/3=5', eq(frac(x, n(3)), n(5)), 'x/3 = 5'],
  // alternate glyphs (written as escapes; source stays ASCII)
  ['2\u00d73', mul(n(2), n(3)), '2(3)'],
  ['2\u00b7x', mul(n(2), x), '2x'],
  ['x\u22122', add(x, neg(n(2))), 'x - 2'],
  ['6\u00f73', frac(n(6), n(3)), '6/3'],
  ['2\u221a3', mul(n(2), sqrt(n(3))), '2sqrt(3)'],
  ['\u221a(12)', sqrt(n(12)), 'sqrt(12)'],
  // letters that spell the keyword
  ['s*q*r*t', mul(v('s'), v('q'), v('r'), v('t')), 'sqr(t)'],
  ['A = l w', eq(v('A'), mul(v('l'), v('w'))), 'A = lw'],
];

test('parse: fixed table of typed input -> exact tree -> canonical text', () => {
  for (const [text, want, printed] of PARSES) {
    const got = parse(text);
    assert.ok(!('error' in got), `${JSON.stringify(text)} should parse, got ${show(got)}`);
    assert.ok(same(got, want), `${JSON.stringify(text)}: got ${show(got)} want ${show(want)}`);
    assert.equal(print(got), printed, `print of ${JSON.stringify(text)}`);
    const again = parse(printed);
    assert.ok(!('error' in again) && same(stripGroups(again), stripGroups(want)), `reparse of ${printed}`);
  }
});

const ERRORS = [
  '', ' ', '\t\n', '+', '-', '*', '/', '^', '(', ')', '=', '()', 'x=', '=x', 'x==2', 'x=2=3', '1=2=3=4',
  '2+', '2*', '2/', '2^', '(2', '2)', '((x)', 'x)(', 'x+*2', '2//3', 'x^', '^2', 'sqrt', 'sqrt()', 'sqrt+3', 'sqrt-3', 'sqrt^2',
  '2 3', '2 1/2', 'x^2 3', '1.5', '.5', '2,3', 'x,y', '3 +/- 2', '1 \u00b1 2', 'x=\u00b13',
  '2x!', 'x_1', '$5', '{x}', '[x]', '|x|', 'x<3', '3>2', 'sin(x)@', '#', '\\frac{1}{2}', '\u03c0', '2\u00b2', 'e\u0301',
  '\u0000', 'x\u0000', '\ud83d\ude00', '1e5.', '0x1F.', '%',
];

test('parse: garbage, empty input and two "=" return { error }, never throw', () => {
  for (const text of ERRORS) {
    const got = parse(text);
    assert.ok('error' in got && typeof got.error === 'string' && got.error.length > 0, `${JSON.stringify(text)} should be an error, got ${show(got)}`);
  }
  assert.deepEqual(parse('x=2=3'), { error: 'more than one "="' });
  assert.deepEqual(parse(''), { error: 'empty' });
  assert.deepEqual(parse('   '), { error: 'empty' });
});

test('parse: non-string and oversized input', () => {
  for (const bad of [undefined, null, 42, 42n, {}, [], () => 1, Symbol('s')]) {
    const got = parse(/** @type {any} */ (bad));
    assert.ok('error' in got);
  }
  assert.ok('error' in parse('1+'.repeat(MAX_INPUT)));
  assert.ok('error' in parse('('.repeat(250) + 'x' + ')'.repeat(250)));
  assert.ok('error' in parse('('.repeat(140) + 'x' + ')'.repeat(140)), 'deep nesting is an error, not a stack overflow');
  assert.ok('error' in parse('-'.repeat(280) + 'x'));
  assert.ok('error' in parse('x' + '^x'.repeat(140)));
  assert.ok(!('error' in parse('9'.repeat(MAX_INPUT))), 'a long integer is fine');
  assert.ok(!('error' in parse('((((((((((x))))))))))')));
});

const FUZZ_ALPHABET = [
  ...'0123456789', ...'0123456789', '+', '-', '*', '/', '^', '(', ')', '=', ',', ' ', 'x', 'y', 'a', 's', 'q', 'r', 't',
  'sqrt', 'sqrt(', '+/-', '\u00b1', '\u221a', '\u00d7', '\u2212', '.', '!', '_', '{', '}', '[', ']', '|', '<', '\\', '"', "'",
  '\n', '\u0000', '\ud83d', '\ude00', '\u03c0', 'no solution', 'all reals', 'e', 'E', 'NaN', 'Infinity', '__proto__', 'constructor',
];

test('parser fuzz: 40000 random strings never throw (parse, parseList, parseSolutions)', () => {
  let parsed = 0;
  forSeeds(40000, (rng) => {
    const len = rng.int(0, 24);
    let text = '';
    for (let i = 0; i < len; i++) text += rng.pick(FUZZ_ALPHABET);
    for (const f of [parse, parseList, (/** @type {string} */ s) => parseSolutions(s), (/** @type {string} */ s) => parseSolutions(s, 'x')]) {
      const got = f(text);
      assert.ok(typeof got === 'object' && got !== null);
      if ('error' in got) assert.equal(typeof got.error, 'string');
    }
    const got = parse(text);
    if (!('error' in got)) {
      parsed++;
      // whatever parses must print and reparse to the same tree (modulo groups)
      const back = parse(print(got));
      assert.ok(!('error' in back), `reparse of ${JSON.stringify(print(got))} from ${JSON.stringify(text)}`);
      assert.ok(same(stripGroups(back), stripGroups(got)), `${JSON.stringify(text)} -> ${print(got)}`);
    }
  }, { prefix: 'fuzz' });
  assert.ok(parsed > 2000, `the fuzz alphabet reaches the accepting paths (${parsed} parsed)`);
});

test('parser fuzz: random UTF-16 code units never throw', () => {
  forSeeds(10000, (rng) => {
    const len = rng.int(0, 30);
    let text = '';
    for (let i = 0; i < len; i++) text += String.fromCharCode(rng.bool(0.7) ? rng.int(32, 126) : rng.int(0, 0xffff));
    const got = parse(text);
    assert.ok('error' in got ? typeof got.error === 'string' : typeof got.t === 'string');
    parseList(text);
    parseSolutions(text);
  }, { prefix: 'utf' });
});

test('print/parse round trip: one explicit case per Node kind, and Equation', () => {
  /** @type {[string, any][]} */
  const kinds = [
    ['num', n(42)],
    ['var', v('w')],
    ['add', add(x, n(1), y)],
    ['mul', mul(n(2), x, y)],
    ['neg', neg(x)],
    ['frac', frac(add(x, n(1)), mul(n(2), y))],
    ['pow', pow(x, n(3))],
    ['pow (rational power, as the parser builds it)', pow(x, frac(n(1), n(2)))],
    ['pow (negative power)', pow(x, neg(n(2)))],
    ['root', sqrt(add(pow(x, n(2)), n(9)))],
    ['root of a rational power', sqrt(pow(n(9), frac(n(1), n(2))))],
    ['group', group(add(x, n(1)))],
    ['eq', eq(add(n(6), mul(n(4), x)), mul(n(2), pow(x, n(2))))],
  ];
  for (const [label, tree] of kinds) {
    const back = parse(print(tree));
    assert.ok(!('error' in back), `${label}: ${print(tree)}`);
    assert.ok(same(stripGroups(back), stripGroups(tree)), `${label}: ${print(tree)} -> ${show(back)}`);
  }
  // Generator-style literals (a num holding a rational or a negative) keep their VALUE and their text.
  for (const tree of [pow(x, numQ(q(1, 2))), pow(n(9), numQ(q(-3, 2))), mul(num(-4), x), add(x, num(-6)), numQ(q(-3, 4)), mul(numQ(q(3, 4)), x), pow(num(-2), n(2))]) {
    const text = print(tree);
    const back = /** @type {Node} */ (parse(text));
    assert.ok(!('error' in back), text);
    assert.equal(print(back), text);
    const env = { x: q(4) };
    const a = evaluate(tree, env); const b = evaluate(back, env);
    assert.ok(a && b && seq(a, b), text);
  }
  assert.equal(print(pow(x, numQ(q(1, 2)))), 'x^(1/2)');
  assert.equal(print(mul(num(-4), x)), '-4x');
  assert.equal(print(add(mul(n(2), pow(x, n(2))), mul(num(-4), x), num(-6))), '2x^2 - 4x - 6');
  assert.equal(print(root(3, x)), 'root3(x)', 'index other than 2 prints but is outside the v1 grammar');
});

test('print/parse round trip: 20000 random parser-shaped trees over every Node kind', () => {
  /** @type {Record<string, number>} */
  const seen = {};
  forSeeds(20000, (rng) => {
    const tree = shapeAst(rng, rng.int(1, 4));
    const count = (/** @type {Node} */ t) => { seen[t.t] = (seen[t.t] ?? 0) + 1; };
    count(tree);
    const text = print(tree);
    if (text.length > MAX_INPUT) return;
    const back = parse(text);
    assert.ok(!('error' in back), `${text}: ${show(back)}`);
    assert.ok(same(stripGroups(back), stripGroups(tree)), `${text}\n got ${show(stripGroups(back))}\nwant ${show(stripGroups(tree))}`);
    assert.equal(print(back), text, 'printing is stable');
    // and as an equation
    const tree2 = shapeAst(rng, 2);
    const e = eq(tree, tree2);
    const eText = print(e);
    if (eText.length > MAX_INPUT) return;
    const eBack = parse(eText);
    assert.ok(isEquation(eBack) && same(stripGroups(eBack), stripGroups(e)), eText);
  }, { prefix: 'shape' });
  for (const kind of ['num', 'var', 'add', 'mul', 'neg', 'frac', 'pow', 'root', 'group']) assert.ok(seen[kind] > 200, `${kind} exercised at the top level`);
});

test('print/parse: 20000 unrestricted trees keep their value and print idempotently', () => {
  let evaluated = 0;
  forSeeds(20000, (rng) => {
    const tree = wildAst(rng, rng.int(1, 4));
    const text = print(tree);
    if (text.length > MAX_INPUT) return;
    const back = parse(text);
    assert.ok(!('error' in back) && !isEquation(back), `${text}: ${show(back)}`);
    assert.equal(print(/** @type {Node} */ (back)), text, 'print(parse(print(n))) === print(n)');
    assert.deepEqual(vars(/** @type {Node} */ (back)), vars(tree));
    for (let i = 0; i < 3; i++) {
      const env = renv(rng, LETTERS);
      const a = evaluate(tree, env);
      const b = evaluate(/** @type {Node} */ (back), env);
      assert.equal(a === undefined, b === undefined, `${text} definedness at ${show(env)}`);
      if (a && b) { evaluated++; assert.ok(seq(a, b), `${text} at ${show(env)}`); }
    }
  }, { prefix: 'wild' });
  assert.ok(evaluated > 10000, `enough defined evaluations (${evaluated})`);
});

test('parseList: comma-separated items', () => {
  const got = parseList('2, -4, -6');
  assert.ok(Array.isArray(got) && got.length === 3);
  assert.equal(got.map((g) => print(g)).join(' | '), '2 | -4 | -6');
  assert.equal(/** @type {any[]} */ (parseList('x')).length, 1);
  assert.equal(/** @type {any[]} */ (parseList('x = 1, y = 2')).length, 2);
  for (const bad of ['', ',', '2,', ',2', '2,,3', '2, (3', '1 2, 3']) assert.ok('error' in parseList(bad), JSON.stringify(bad));
  assert.ok('error' in parseList('(2,3)'), 'a comma inside parentheses is not a list');
});

test('parseSolutions: keypad solution-set forms', () => {
  const s3 = /** @type {Surd} */ (sqrtQ(q(3)));
  /** @param {string} text @param {string} [name] */
  const roots = (text, name) => {
    const got = parseSolutions(text, name);
    assert.ok(!('error' in got), `${text}: ${show(got)}`);
    assert.equal(got.set.kind, 'finite');
    return /** @type {{ kind: 'finite'; roots: Surd[] }} */ (got.set).roots;
  };
  /** @param {Surd[]} got @param {Surd[]} want */
  const sameList = (got, want) => assert.ok(got.length === want.length && got.every((g, i) => seq(g, want[i])), `${show(got)} vs ${show(want)}`);
  sameList(roots('3, -1'), [sq(-1), sq(3)]);
  sameList(roots('x = 3, x = -1', 'x'), [sq(-1), sq(3)]);
  sameList(roots('x=3,-1'), [sq(-1), sq(3)]);
  sameList(roots('3'), [sq(3)]);
  sameList(roots('3, 3, 6/2'), [sq(3)]);
  sameList(roots('1 +/- sqrt(3)'), [ssub(sq(1), s3), sadd(sq(1), s3)]);
  sameList(roots('1 \u00b1 sqrt3'), [ssub(sq(1), s3), sadd(sq(1), s3)]);
  sameList(roots('x = \u00b13'), [sq(-3), sq(3)]);
  sameList(roots('(4 +/- sqrt(48))/4'), [ssub(sq(1), s3), sadd(sq(1), s3)]);
  sameList(roots('1 + sqrt(3), 1 - sqrt(3)'), [ssub(sq(1), s3), sadd(sq(1), s3)]);
  sameList(roots('\u00b10'), [sq(0)]);
  sameList(roots('1/2, -2/3'), [sq(-2, 3), sq(1, 2)]);
  assert.deepEqual(parseSolutions('no solution'), { set: { kind: 'none' }, nodes: [] });
  assert.deepEqual(parseSolutions('  No  Solution '), { set: { kind: 'none' }, nodes: [] });
  assert.deepEqual(parseSolutions('all reals'), { set: { kind: 'all' }, nodes: [] });
  const withNodes = parseSolutions('sqrt(12), 2');
  assert.ok(!('error' in withNodes) && withNodes.nodes.length === 2 && print(withNodes.nodes[0]) === 'sqrt(12)');
  for (const bad of ['', 'x', 'x = y', 'y = 3', '3,', '1 +/- 2 +/- 3', '1/0', 'sqrt(-4)', 'x = 3 = 4', '3 = x', 'nothing', '2^(1/3)']) {
    assert.ok('error' in parseSolutions(bad, 'x'), JSON.stringify(bad));
  }
  assert.ok(!('error' in parseSolutions('y = 3')), 'without a named variable any single letter is accepted');
});

test('ast helpers', () => {
  assert.deepEqual(vars(P('2xy + sqrt(a) = b^x')), ['a', 'b', 'x', 'y']);
  assert.ok(same(stripGroups(P('((x+1))(2)')), mul(add(x, n(1)), n(2))));
  assert.ok(same(sub(x, y), add(x, neg(y))));
  assert.ok(!same(add(x, y), add(y, x)), 'same is structural, not mathematical');
  assert.ok(!same(root(2, x), root(3, x)));
  assert.ok(isEquation(P('x=1')) && !isEquation(P('x')));
});
