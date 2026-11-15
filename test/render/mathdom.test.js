// @ts-check
// M4 renderer tests (DESIGN.md section 9): structure for every Node kind,
// data-path coverage, display conventions, preview-mode parentheses, the
// parenthesization round trip (rendered tree -> visible text -> parse ->
// same tree up to display-invariant normalization) over 20000 random ASTs,
// and width-estimator monotonicity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../../src/gen/prng.js';
import { forSeeds } from '../prop.js';
import { renderMath, renderList, nodeAtPath, estimateWidth, fitsDisplay, displayWidth, vnodeEm, DISPLAY_CAP_PX, MATH_CSS } from '../../src/render/mathdom.js';
import { textOf, findAll, hasClass, materialize } from '../../src/render/vnode.js';
import { parse } from '../../src/math/parse.js';
import { print } from '../../src/math/print.js';
import { same, num, v, add, mul, neg, frac, pow, sqrt, root, group, eq, sub } from '../../src/math/ast.js';
import { readBack, norm, FakeDoc } from './helpers.js';
import { randomMath, randomNode, nodesWithPaths } from './arb.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../src/render/vnode.js').VNode} VNode */

const M = '\u2212';
const D = '\u00b7';

/** Visible text with the radical drawn as a glyph, for readable assertions. @param {VNode} vn */
function shown(vn) {
  /** @param {VNode | string} n @returns {string} */
  const go = (n) => {
    if (typeof n === 'string') return n;
    if (hasClass(n, 'rhook')) return '\u221a';
    if (hasClass(n, 'frac')) {
      const [a, b] = /** @type {VNode[]} */ (n.children.filter((c) => typeof c !== 'string'));
      return `[${go(a)}|${go(b)}]`;
    }
    if (n.tag === 'sup') return `^{${n.children.map(go).join('')}}`;
    return n.children.map(go).join('');
  };
  return go(vn);
}
/** @param {Node | Equation} x @param {boolean} [preview] */
const S = (x, preview = false) => shown(renderMath(x, { preview }));
/** @param {string} t */
const P = (t) => {
  const r = parse(t);
  if ('error' in r) throw new Error(`parse(${t}): ${r.error}`);
  return r;
};

/**
 * The one span carrying data-path === path.
 * @param {VNode} vn @param {string} path
 */
function at(vn, path) {
  const hits = findAll(vn, (n) => n.attrs['data-path'] === path);
  assert.equal(hits.length, 1, `exactly one element with data-path ${path}`);
  return hits[0];
}

/**
 * Every Node has exactly one span with its path, the path resolves back to
 * that very Node, and no element carries a path that names no Node.
 * @param {Node | Equation} x @param {VNode} vn
 */
function checkPaths(x, vn) {
  const all = findAll(vn, (n) => n.attrs['data-path'] !== undefined);
  const want = nodesWithPaths(x);
  const counts = new Map();
  for (const e of all) counts.set(e.attrs['data-path'], (counts.get(e.attrs['data-path']) || 0) + 1);
  for (const { path, node } of want) {
    if (counts.get(path) !== 1) return `path ${path} appears ${counts.get(path) || 0} times`;
    const el = all.find((e) => e.attrs['data-path'] === path);
    if (!el || el.tag !== 'span') return `path ${path} is not a span`;
    if (nodeAtPath(x, path) !== node) return `nodeAtPath(${path}) is not the node`;
  }
  if (all.length !== want.length) return `${all.length} data-path elements for ${want.length} nodes`;
  return '';
}

/** Allowed element tags in rendered math (no inputs, nothing exotic). */
const TAGS = new Set(['span', 'sup', 'svg', 'path']);

/**
 * The round trip: what is visible reads back to the same tree.
 * @param {Node | Equation} x @param {boolean} preview @returns {string} '' or a failure
 */
function roundTrip(x, preview) {
  const vn = renderMath(x, { preview });
  const bad = findAll(vn, (n) => !TAGS.has(n.tag));
  if (bad.length) return `unexpected tag ${bad[0].tag}`;
  const pathErr = checkPaths(x, vn);
  if (pathErr) return pathErr;
  const txt = readBack(vn);
  const got = parse(txt);
  if ('error' in got) return `readback ${JSON.stringify(txt)} does not parse: ${got.error}`;
  if (!same(norm(got), norm(x, { preview }))) return `readback ${JSON.stringify(txt)} reads as ${print(got)}, rendered ${print(x)}`;
  return '';
}

// ------------------------------------------------------------------ every Node kind

test('num: integer, negative, fraction, negative fraction', () => {
  const a = renderMath(num(3));
  assert.equal(at(a, 'e').attrs.class, 'mnum');
  assert.equal(S(num(3)), '3');
  assert.equal(S(num(-3)), `${M}3`);
  assert.equal(S(num(3, 4)), '[3|4]');
  assert.equal(S(num(-3, 4)), `${M}[3|4]`);
  const f = findAll(renderMath(num(3, 4)), (n) => hasClass(n, 'frac'));
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].children.map((c) => typeof c === 'string' ? c : c.attrs.class), ['fnum', 'fden']);
});

test('var: italic .mi span', () => {
  const vn = renderMath(v('A'));
  assert.equal(at(vn, 'e').attrs.class, 'mi');
  assert.equal(textOf(vn), 'A');
});

test('add: binary operators, negative terms drawn as subtraction', () => {
  assert.equal(S(add(v('x'), num(1))), 'x + 1');
  assert.equal(S(sub(v('x'), num(3))), `x ${M} 3`);
  assert.equal(S(add(v('x'), num(-3))), `x ${M} 3`, 'a stored -3 after a term draws as subtraction');
  assert.equal(S(add(v('x'), mul(num(-2), v('y')))), `x ${M} 2y`);
  assert.equal(S(add(v('x'), neg(neg(v('y'))))), `x ${M} (${M}y)`);
  assert.equal(S(add(v('a'), neg(add(v('b'), v('c'))))), `a ${M} (b + c)`);
  assert.equal(S(add(neg(v('x')), num(1))), `${M}x + 1`);
  assert.equal(S(add(add(v('a'), v('b')), v('c'))), 'a + b + c', 'associativity is invisible');
  assert.equal(S(add()), '0');
  assert.equal(S(add(v('x'))), 'x');
  const vn = renderMath(sub(v('x'), num(3)));
  at(vn, 'e'); at(vn, 'e.0'); at(vn, 'e.1'); at(vn, 'e.1.0');
});

test('mul: implicit multiplication conventions', () => {
  assert.equal(S(mul(num(2), v('x'))), '2x');
  assert.equal(S(mul(num(2), sqrt(num(3)))), '2\u221a3');
  assert.equal(S(mul(num(3), add(v('x'), num(1)))), '3(x + 1)');
  assert.equal(S(mul(add(v('a'), v('b')), add(v('c'), v('d')))), '(a + b)(c + d)');
  assert.equal(S(mul(num(2), num(3))), `2${D}3`, 'a dot between numbers');
  assert.equal(S(mul(v('x'), num(2))), `x${D}2`);
  assert.equal(S(mul(sqrt(num(3)), num(2))), `\u221a3${D}2`);
  assert.equal(S(mul(num(2), pow(num(3), v('x')))), `2${D}3^{x}`);
  assert.equal(S(mul(num(4), frac(num(1), num(3)))), `4${D}[1|3]`, 'never a mixed-number look');
  assert.equal(S(mul(num(2), num(1, 3))), `2${D}[1|3]`);
  assert.equal(S(mul(num(2), frac(neg(num(1)), num(3)))), `2${D}[${M}1|3]`);
  assert.equal(S(mul(num(2), frac(v('x'), num(3)))), '2[x|3]', 'letter numerator: no dot');
  assert.equal(S(mul(frac(num(1), num(2)), v('x'))), '[1|2]x');
  assert.equal(S(mul(v('x'), neg(v('y')))), `x(${M}y)`);
  assert.equal(S(mul(num(2), num(-3))), `2(${M}3)`);
  assert.equal(S(mul(num(-2), v('x'))), `${M}2x`);
  assert.equal(S(mul(neg(v('x')), v('y'))), `${M}xy`);
  assert.equal(S(mul(pow(v('x'), num(2)), v('y'))), 'x^{2}y');
  assert.equal(S(mul(v('x'), mul(v('y'), v('z')))), 'xyz');
  assert.equal(S(mul(v('x'), mul(neg(v('y')), v('z')))), `x(${M}yz)`);
  assert.equal(S(mul(group(num(-7)), sqrt(v('a')))), `(${M}7)\u221aa`);
  assert.equal(S(mul()), '1');
  assert.equal(S(mul(v('x'))), 'x');
});

test('neg: unary minus, parentheses for sums and leading minus signs', () => {
  assert.equal(S(neg(v('x'))), `${M}x`);
  assert.equal(S(neg(mul(num(2), v('x')))), `${M}2x`);
  assert.equal(S(neg(neg(v('x')))), `${M}(${M}x)`);
  assert.equal(S(neg(num(-3))), `${M}(${M}3)`);
  assert.equal(S(neg(add(v('a'), v('b')))), `${M}(a + b)`);
  assert.equal(S(neg(pow(v('x'), num(2)))), `${M}x^{2}`);
  assert.equal(S(neg(frac(v('a'), v('b')))), `${M}[a|b]`);
});

test('frac: flex column; groups under the bar are elided, kept in preview', () => {
  const x = frac(group(add(v('x'), num(1))), num(2));
  assert.equal(S(x), '[x + 1|2]');
  assert.equal(S(x, true), '[(x + 1)|2]');
  const vn = renderMath(x);
  assert.equal(at(vn, 'e').attrs.class, 'frac');
  assert.match(at(vn, 'e.0').attrs.class, /mgrp-elided/);
  assert.equal(S(frac(frac(v('a'), v('b')), v('c'))), '[[a|b]|c]');
  assert.equal(S(frac(frac(v('a'), v('b')), v('c')), true), '[([a|b])|c]');
  assert.match(MATH_CSS, /\.frac \{[^}]*flex-direction: column/);
});

test('pow: sup exponents and base parentheses', () => {
  assert.equal(S(pow(v('x'), num(2))), 'x^{2}');
  assert.equal(at(renderMath(pow(v('x'), num(2))), 'e').attrs.class, 'mpow');
  assert.equal(findAll(renderMath(pow(v('x'), num(2))), (n) => n.tag === 'sup').length, 1);
  assert.equal(S(pow(num(-2), num(2))), `(${M}2)^{2}`);
  assert.equal(S(pow(neg(v('x')), num(2))), `(${M}x)^{2}`);
  assert.equal(S(pow(add(v('x'), num(1)), num(2))), '(x + 1)^{2}');
  assert.equal(S(pow(group(add(v('x'), num(1))), num(2))), '(x + 1)^{2}', 'a group is not double-parenthesized');
  assert.equal(S(pow(mul(num(2), v('x')), num(2))), '(2x)^{2}');
  assert.equal(S(pow(num(1, 2), num(2))), '([1|2])^{2}');
  assert.equal(S(pow(frac(v('a'), v('b')), num(2))), '([a|b])^{2}');
  assert.equal(S(pow(pow(v('x'), num(2)), num(3))), '(x^{2})^{3}');
  assert.equal(S(pow(v('x'), pow(num(2), num(3)))), 'x^{2^{3}}');
  assert.equal(S(pow(sqrt(v('x')), num(2))), '(\u221ax)^{2}');
  assert.equal(S(pow(v('x'), num(1, 2))), 'x^{[1|2]}', 'rational power');
  assert.equal(S(pow(v('x'), neg(num(2)))), `x^{${M}2}`);
  assert.equal(S(pow(v('x'), group(add(v('n'), num(1))))), 'x^{n + 1}', 'exponent group elided');
  assert.equal(S(pow(v('x'), group(add(v('n'), num(1)))), true), 'x^{(n + 1)}');
});

test('root: SVG hook that stretches, radicand under a vinculum, index when not 2', () => {
  const vn = renderMath(sqrt(frac(v('x'), num(2))));
  const r = at(vn, 'e');
  assert.equal(r.attrs.class, 'mroot');
  const svg = findAll(r, (n) => n.tag === 'svg');
  assert.equal(svg.length, 1);
  assert.equal(svg[0].ns, 'http://www.w3.org/2000/svg');
  assert.equal(svg[0].attrs.preserveAspectRatio, 'none', 'stretches with the radicand');
  assert.equal(svg[0].attrs['aria-hidden'], 'true');
  assert.equal(findAll(r, (n) => hasClass(n, 'radicand')).length, 1);
  assert.match(MATH_CSS, /\.radicand \{[^}]*border-top/);
  assert.match(MATH_CSS, /\.mroot \{[^}]*align-items: stretch/);
  assert.equal(S(sqrt(group(add(v('x'), num(1))))), '\u221ax + 1', 'radicand group elided');
  assert.equal(S(root(3, v('x'))), '^{3}\u221ax', 'index shown');
  assert.equal(findAll(renderMath(root(3, v('x'))), (n) => hasClass(n, 'rindex')).length, 1);
  assert.equal(findAll(renderMath(sqrt(v('x'))), (n) => hasClass(n, 'rindex')).length, 0);
});

test('group: parentheses kept for display', () => {
  assert.equal(S(group(v('x'))), '(x)');
  assert.equal(S(add(num(1), group(add(v('x'), num(2))))), '1 + (x + 2)');
  assert.equal(S(mul(group(num(3)), group(num(4)))), '(3)(4)');
  assert.equal(at(renderMath(group(v('x'))), 'e').attrs.class, 'mgrp');
});

test('equation: two nowrap sides, the second starts with "=", wraps only there', () => {
  const vn = renderMath(eq(add(num(6), mul(num(4), v('x'))), mul(num(2), pow(v('x'), num(2)))));
  assert.match(vn.attrs.class, /\bmeq\b/);
  const sides = vn.children.filter((c) => typeof c !== 'string');
  assert.equal(sides.length, 2);
  assert.ok(sides.every((c) => typeof c !== 'string' && hasClass(c, 'mside')));
  assert.equal(textOf(/** @type {VNode} */ (sides[1])).trim().slice(0, 1), '=');
  assert.equal(shown(vn), '6 + 4x = 2x^{2}');
  at(vn, 'l'); at(vn, 'r'); at(vn, 'l.1.1');
  assert.match(MATH_CSS, /\.meq \{[^}]*flex-wrap: wrap/);
  assert.match(MATH_CSS, /\.mside \{[^}]*white-space: nowrap/);
  assert.equal(vn.attrs['aria-label'], '6 + 4x = 2x^2');
});

test('renderList: items, commas, prefixed paths', () => {
  const vn = renderList([num(2), neg(num(4))]);
  assert.equal(shown(vn), `2, ${M}4`);
  assert.equal(findAll(vn, (n) => n.attrs['data-path'] === 'i1:e').length, 1);
});

test('materialize builds real-DOM-shaped trees (SVG in its namespace)', () => {
  const el = materialize(new FakeDoc(), renderMath(sqrt(num(3))));
  const svg = el.findAll((/** @type {any} */ e) => e.tagName === 'SVG');
  assert.equal(svg.length, 1);
  assert.equal(svg[0].namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(el.getAttribute('class'), 'm');
});

test('teacher examples render as expected', () => {
  assert.equal(S(mul(num(4), frac(num(1), num(3)))), `4${D}[1|3]`);
  assert.equal(S(mul(sqrt(num(3)), sqrt(num(3)))), '\u221a3\u221a3');
  assert.equal(S(frac(num(6), sqrt(num(3)))), '[6|\u221a3]');
  assert.equal(S(P('6 + 4x = 2x^2')), '6 + 4x = 2x^{2}');
});

// ------------------------------------------------------------------ preview mode

test('preview shows the surprising readings with parentheses', () => {
  assert.equal(S(P('1/2x'), true), '([1|2])x', '1/2x reads as (1/2)x');
  assert.equal(S(P('1/2x'), false), '[1|2]x');
  assert.equal(S(P('a/bc'), true), '([a|b])c');
  assert.equal(S(P('2x/3'), true), '[2x|3]');
  assert.equal(S(P('-x^2'), true), `${M}(x^{2})`);
  assert.equal(S(P('-3^2'), true), `${M}(3^{2})`);
  assert.equal(S(P('-3^2x'), true), `${M}(3^{2})x`);
  assert.equal(S(P('2 - x^2'), true), `2 ${M} x^{2}`, 'binary minus is no surprise');
  assert.equal(S(P('(-3)^2'), true), `(${M}3)^{2}`);
  assert.equal(S(P('1/2/3'), true), '[([1|2])|3]');
  assert.equal(S(P('sqrt3'), true), '\u221a3');
  assert.equal(S(P('sqrt3x'), true), '\u221a3x');
  assert.equal(S(P('x^-2'), true), `x^{${M}2}`);
  assert.equal(S(P('(x+1)/2'), true), '[(x + 1)|2]', 'typed parentheses are shown');
});

// ------------------------------------------------------------------ round trip

test('parenthesization round trip: 20000 random ASTs (normal mode)', () => {
  let eqs = 0;
  forSeeds(20000, (rng) => {
    const x = randomMath(rng, rng.int(1, 4));
    if (x.t === 'eq') eqs++;
    const err = roundTrip(x, false);
    if (err) throw new Error(err);
  }, { prefix: 'rt' });
  assert.ok(eqs > 3000, `equations covered (${eqs})`);
});

test('parenthesization round trip: 5000 random ASTs (preview mode)', () => {
  forSeeds(5000, (rng) => {
    const err = roundTrip(randomMath(rng, rng.int(1, 4)), true);
    if (err) throw new Error(err);
  }, { prefix: 'pv' });
});

test('round trip covers every Node kind and the tricky shapes', () => {
  const kinds = new Set();
  let negFirst = 0, negLater = 0, groupedNeg = 0;
  forSeeds(20000, (rng) => {
    const x = randomMath(rng, rng.int(1, 4));
    for (const { node } of nodesWithPaths(x)) {
      kinds.add(node.t);
      if (node.t === 'mul' && node.args.length > 1) {
        if (node.args[0].t === 'neg' || (node.args[0].t === 'num' && node.args[0].q.n < 0n)) negFirst++;
        if (node.args.slice(1).some((a) => a.t === 'neg')) negLater++;
        if (node.args[0].t === 'group' && node.args[0].arg.t === 'num' && node.args[0].arg.q.n < 0n) groupedNeg++;
      }
    }
  }, { prefix: 'rt' });
  assert.deepEqual([...kinds].sort(), ['add', 'frac', 'group', 'mul', 'neg', 'num', 'pow', 'root', 'var']);
  assert.ok(negFirst > 100 && negLater > 100 && groupedNeg > 10, `${negFirst} ${negLater} ${groupedNeg}`);
});

test('readBack self-check: it does catch display bugs', () => {
  // A hand-built "renderer" that drops parentheses must fail the round trip.
  const bad = { tag: 'span', attrs: { class: 'm' }, children: [{ tag: 'span', attrs: { class: 'mn' }, children: ['3'] }, { tag: 'span', attrs: { class: 'mi' }, children: ['x'] }, ' + 1'] };
  assert.notEqual(print(P(readBack(bad))), print(mul(num(3), group(add(v('x'), num(1))))));
  const mixed = { tag: 'span', attrs: {}, children: ['2', { tag: 'span', attrs: { class: 'frac' }, children: [{ tag: 'span', attrs: { class: 'fnum' }, children: ['1'] }, { tag: 'span', attrs: { class: 'fden' }, children: ['3'] }] }] };
  assert.throws(() => readBack(mixed), /mixed number/);
  const supDigit = { tag: 'span', attrs: {}, children: [{ tag: 'span', attrs: { class: 'mi' }, children: ['x'] }, { tag: 'sup', attrs: { class: 'msup' }, children: ['2'] }, '3'] };
  assert.throws(() => readBack(supDigit), /after a sup/);
  // norm keeps x(-y) distinct from -xy.
  assert.equal(same(norm(mul(v('x'), neg(v('y')))), norm(neg(mul(v('x'), v('y'))))), false);
  assert.equal(same(norm(mul(num(-2), v('x'))), norm(neg(mul(num(2), v('x'))))), true);
});

// ------------------------------------------------------------------ width estimator

test('width estimator: replacing any subtree with a wider one never narrows the whole', () => {
  let strict = 0;
  forSeeds(3000, (rng) => {
    const x = randomMath(rng, rng.int(1, 4));
    const w0 = estimateWidth(x).oneLine;
    const paths = nodesWithPaths(x);
    const { path } = rng.pick(paths);
    const grow = (/** @type {Node} */ n) => add(n, v('x'));
    /** @param {Node} n @param {string} p @returns {Node} */
    const rebuild = (n, p) => {
      if (p === path) return grow(n);
      const c = (/** @type {Node} */ k, /** @type {number} */ i) => rebuild(k, `${p}.${i}`);
      switch (n.t) {
        case 'add': return { t: 'add', args: n.args.map(c) };
        case 'mul': return { t: 'mul', args: n.args.map(c) };
        case 'neg': return { t: 'neg', arg: c(n.arg, 0) };
        case 'group': return { t: 'group', arg: c(n.arg, 0) };
        case 'frac': return { t: 'frac', num: c(n.num, 0), den: c(n.den, 1) };
        case 'pow': return { t: 'pow', base: c(n.base, 0), exp: c(n.exp, 1) };
        case 'root': return { t: 'root', index: n.index, radicand: c(n.radicand, 0) };
        default: return n;
      }
    };
    const y = x.t === 'eq' ? { t: /** @type {'eq'} */ ('eq'), lhs: rebuild(x.lhs, 'l'), rhs: rebuild(x.rhs, 'r') } : rebuild(x, 'e');
    const w1 = estimateWidth(y).oneLine;
    if (!(w1 >= w0)) throw new Error(`growing ${path} of ${print(x)}: ${w0} -> ${w1}`);
    if (w1 > w0) strict++;
    if (fitsDisplay(y) && !fitsDisplay(x)) throw new Error('fitsDisplay not monotone');
  }, { prefix: 'w' });
  // Equal only when the grown part sits under a wider fraction part.
  assert.ok(strict > 2400, `strictly wider in ${strict} of 3000`);
});

test('width estimator: more terms, more digits, parentheses all widen', () => {
  let prev = 0;
  /** @type {Node[]} */
  const terms = [];
  for (let i = 0; i < 12; i++) {
    terms.push(mul(num(i + 1), v('x')));
    const w = estimateWidth(add(...terms)).oneLine;
    assert.ok(w > prev, `term ${i}`);
    prev = w;
  }
  assert.ok(estimateWidth(num(1000)).oneLine > estimateWidth(num(100)).oneLine);
  assert.ok(estimateWidth(group(v('x'))).oneLine > estimateWidth(v('x')).oneLine);
  assert.ok(vnodeEm(renderMath(v('x'))) > 0);
  forSeeds(500, (rng) => {
    const n = randomNode(rng, 3);
    return estimateWidth(n).oneLine > 0 && estimateWidth(n, { fontPx: 30 }).oneLine > estimateWidth(n, { fontPx: 22 }).oneLine;
  }, { prefix: 'wf' });
});

test('display cap: 375px phone minus 16px gutters; equations may wrap at "="', () => {
  assert.equal(DISPLAY_CAP_PX, 343);
  assert.ok(fitsDisplay(P('6 + 4x = 2x^2')));
  assert.ok(fitsDisplay(P('4 + 4x = 2x^2')));
  const long = add(...Array.from({ length: 14 }, (_, i) => mul(num(i + 10), pow(v('x'), num(i + 2)))));
  assert.equal(fitsDisplay(long), false);
  const side = add(...Array.from({ length: 3 }, (_, i) => mul(num(i + 10), pow(v('x'), num(2)))));
  const e = eq(side, side);
  const w = estimateWidth(e);
  assert.ok(w.oneLine > DISPLAY_CAP_PX, `one line ${w.oneLine}`);
  assert.ok(fitsDisplay(e), 'fits once wrapped at "="');
  assert.equal(displayWidth(e), Math.max(/** @type {number} */ (w.lhs), /** @type {number} */ (w.rhs)));
});

test('rendering is deterministic and pure (same input, same tree)', () => {
  const rng = makeRng('det');
  for (let i = 0; i < 200; i++) {
    const x = randomMath(rng);
    assert.deepEqual(renderMath(x), renderMath(x));
  }
});

test('regression (finding 4): fractions do not shrink, so nested fractions stay full size; .m has a 22px floor', () => {
  const rule = (/** @type {string} */ sel) => (MATH_CSS.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')) || ['', ''])[1];
  assert.match(rule('.m .frac'), /font-size: 1em/);
  assert.match(rule('.m'), /font-size: max\(22px, 1em\)/);
  // No other rule scales a fraction part.
  for (const sel of ['.m .fnum', '.m .fden']) assert.doesNotMatch(rule(sel), /font-size/);
  // The width estimate matches: a fraction is as wide as its widest part plus padding and margins.
  const w = vnodeEm(renderMath(frac(num(1), num(2))).children[0]);
  assert.ok(Math.abs(w - (0.6 + 2 * 0.18 + 2 * 0.08)) < 1e-9, `${w}`);
});
