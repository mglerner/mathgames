// @ts-check
// M4 keypad tests (DESIGN.md section 9): the exact key set, per-item variable
// keys, plus-minus as U+00B1, whole-answer keys, backspace by token, the raw
// text rules, the token round trip for every slice answer form (hand table
// with hand-built expected trees and hand-computed roots, plus random trees),
// the live preview, the physical-keyboard map, and the mounted DOM (buttons on
// pointerdown, no input elements).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import {
  keyDefs, makeKeypad, press, inputText, readInput, previewVNode, keypadVNode, physicalKey, mountKeypad,
  normalizeVars, readModeFor, KEYPAD_CSS, PLUS_MINUS, MAX_TOKENS, KEY_GRID_MIN_PX, PREVIEW_BOX_PX, previewTooWide,
} from '../../src/render/keypad.js';
import { findAll, hasClass, textOf } from '../../src/render/vnode.js';
import { parse, parseSolutions } from '../../src/math/parse.js';
import { print } from '../../src/math/print.js';
import { same, vars as varsOf, num, v, add, mul, neg, frac, pow, sqrt, group, eq } from '../../src/math/ast.js';
import { seq, sadd, smul, sqrtQ, sq } from '../../src/math/surd.js';
import { norm, readBack, FakeDoc } from './helpers.js';
import { randomMath } from './arb.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Surd} Surd */

/** @param {import('../../src/render/keypad.js').KeypadState} st @param {string[]} keys */
const typeKeys = (st, keys) => keys.reduce(press, st);

/**
 * Key ids that type a keypad-typable string (digits, letters, + - / ^ ( ) = ,
 * sqrt, U+00B1); spaces are skipped.
 * @param {string} t
 * @returns {string[]}
 */
function keysFor(t) {
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < t.length;) {
    if (t.startsWith('sqrt', i)) { out.push('sqrt'); i += 4; continue; }
    const c = t[i++];
    if (c === ' ') continue;
    if (/[0-9+\-/^()=,]/.test(c)) out.push(c);
    else if (c === PLUS_MINUS) out.push('pm');
    else if (/[A-Za-z]/.test(c)) out.push(`var:${c}`);
    else throw new Error(`keysFor: cannot type ${JSON.stringify(c)}`);
  }
  return out;
}

/** sqrt(n) as a Surd, independently of the parser. @param {number} n @returns {Surd} */
const rt = (n) => /** @type {Surd} */ (sqrtQ({ n: BigInt(n), d: 1n }));

// ------------------------------------------------------------------ key set

test('key set is exactly section 9: 0-9 / - + ^ sqrt ( ) = +- , no solution, all reals, backspace, vars', () => {
  const ids = keyDefs(['x']).filter((k) => k !== null).map((k) => /** @type {any} */ (k).id).sort();
  const want = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '/', '-', '+', '^', 'sqrt', '(', ')', '=', 'pm', ',', 'none', 'all', 'back', 'var:x'].sort();
  assert.deepEqual(ids, want);
  const pm = keyDefs().find((k) => k && k.id === 'pm');
  assert.equal(pm && pm.emit, '\u00b1');
  assert.equal(pm && pm.emit.length, 1);
  assert.equal(PLUS_MINUS, '\u00b1');
  // 12-column grid: every row sums to 12 columns.
  const defs = keyDefs(['x', 'y']);
  assert.equal(defs.length, 27);
  assert.equal(defs.reduce((a, k) => a + (k ? k.span : 2), 0), 5 * 12);
});

test('variable keys: default x, up to 4 declared, validated', () => {
  assert.deepEqual(normalizeVars(undefined), ['x']);
  assert.deepEqual(normalizeVars([]), []);
  assert.deepEqual(normalizeVars(['l', 'w', 'A']), ['l', 'w', 'A']);
  assert.deepEqual(normalizeVars(['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd']);
  assert.deepEqual(normalizeVars(['x', 'x']), ['x']);
  assert.throws(() => normalizeVars(['a', 'b', 'c', 'd', 'e']), /at most 4/);
  assert.throws(() => normalizeVars(['xy']), /single ASCII/);
  assert.throws(() => normalizeVars(['1']), /single ASCII/);
  const lw = keyDefs(['l', 'w', 'A']).filter((k) => k && k.kind === 'var').map((k) => k && k.label);
  assert.deepEqual(lw, ['l', 'w', 'A']);
  assert.equal(keyDefs([]).filter((k) => k && k.kind === 'var').length, 0);
  // An undeclared letter does nothing.
  const st = makeKeypad({ variableKeys: ['l', 'w'] });
  assert.deepEqual(press(st, 'var:x').tokens, []);
  assert.deepEqual(press(st, 'var:l').tokens, ['var:l']);
  assert.deepEqual(press(st, 'bogus').tokens, []);
});

test('backspace removes one token; sqrt and multi-digit numbers are per key', () => {
  let st = typeKeys(makeKeypad(), ['1', '2', 'sqrt', '3']);
  assert.equal(inputText(st), '12sqrt3');
  st = press(st, 'back');
  assert.equal(inputText(st), '12sqrt');
  st = press(st, 'back');
  assert.equal(inputText(st), '12');
  st = press(st, 'back');
  assert.equal(inputText(st), '1');
  st = press(press(st, 'back'), 'back');
  assert.deepEqual(st.tokens, []);
});

test('whole-answer keys replace the input; any later key starts over', () => {
  let st = typeKeys(makeKeypad({ answerKind: 'solution-set' }), ['2', '+']);
  st = press(st, 'none');
  assert.equal(inputText(st), 'no solution');
  assert.equal(inputText(press(st, 'all')), 'all reals');
  assert.equal(inputText(press(st, '7')), '7');
  assert.deepEqual(press(st, 'back').tokens, []);
  const r = readInput(inputText(st), { mode: 'solutions', solveFor: 'x' });
  assert.deepEqual(r, { status: 'word', word: 'no solution' });
  const set = parseSolutions(inputText(press(st, 'all')));
  assert.ok(!('error' in set) && set.set.kind === 'all');
});

test('raw text: plus-minus is one character; "+" then "-" is plus, negative; letters never spell sqrt', () => {
  const st = makeKeypad({ variableKeys: ['s', 'q', 'r', 't'] });
  assert.equal(inputText(typeKeys(st, ['1', 'pm', '2'])), '1\u00b12');
  assert.equal(inputText(typeKeys(st, ['1', '+', '-', '2'])), '1+ -2');
  const sqrtLetters = inputText(typeKeys(st, ['var:s', 'var:q', 'var:r', 'var:t']));
  assert.equal(sqrtLetters, 's q r t');
  const p = parse(sqrtLetters);
  assert.ok(!('error' in p) && same(p, mul(v('s'), v('q'), v('r'), v('t'))));
  // "+ -" in a solution list is ONE value (1 + (-2) = -1), not plus-minus.
  const sol = parseSolutions(inputText(typeKeys(makeKeypad(), ['1', '+', '-', '2'])));
  assert.ok(!('error' in sol) && sol.set.kind === 'finite');
  assert.equal(/** @type {any} */ (sol.set).roots.length, 1);
  assert.ok(seq(/** @type {any} */ (sol.set).roots[0], sq(-1)));
  forSeeds(2000, (rng) => {
    const all = keyDefs(['x', 'y']).filter((k) => k && k.kind !== 'whole').map((k) => /** @type {any} */ (k).id);
    const keys = Array.from({ length: rng.int(1, 30) }, () => rng.pick(all));
    const t = inputText(typeKeys(makeKeypad({ variableKeys: ['x', 'y'] }), keys));
    if (t.includes('+-')) throw new Error(`"+-" in ${t}`);
    if (t.includes('+/')) throw new Error(`"+/" in ${t}`);
    if (t.length > 300) throw new Error('too long');
  }, { prefix: 'kt' });
});

test('input is capped at MAX_TOKENS keys', () => {
  let st = makeKeypad();
  for (let i = 0; i < MAX_TOKENS + 10; i++) st = press(st, '9');
  assert.equal(st.tokens.length, MAX_TOKENS);
});

// ------------------------------------------------------------------ round trip, hand table

/**
 * Every slice answer form. expect is built by hand (ast.js constructors,
 * never the parser); roots are computed with surd.js arithmetic by hand.
 * @type {{ name: string; vars?: string[]; mode?: 'single' | 'solutions' | 'list'; solveFor?: string; keys: string[];
 *          expect?: (Node | Equation)[]; roots?: Surd[]; word?: string }[]}
 */
const TABLE = [
  { name: 'integer', keys: ['1', '2'], expect: [num(12)] },
  { name: 'negative integer', keys: ['-', '7'], expect: [neg(num(7))] },
  { name: 'fraction', keys: ['3', '/', '4'], expect: [frac(num(3), num(4))] },
  { name: 'negative fraction', keys: ['-', '3', '/', '4'], expect: [neg(frac(num(3), num(4)))] },
  { name: 'fraction with negative numerator in parens', keys: ['(', '-', '3', ')', '/', '4'], expect: [frac(group(neg(num(3))), num(4))] },
  { name: 'fraction times whole', keys: ['4', '/', '3'], expect: [frac(num(4), num(3))] },
  { name: '1/2x is (1/2)x', keys: ['1', '/', '2', 'var:x'], expect: [mul(frac(num(1), num(2)), v('x'))] },
  { name: '1/(2x)', keys: ['1', '/', '(', '2', 'var:x', ')'], expect: [frac(num(1), group(mul(num(2), v('x'))))] },
  { name: 'radical', keys: ['sqrt', '3'], expect: [sqrt(num(3))] },
  { name: 'coefficient radical', keys: ['2', 'sqrt', '3'], expect: [mul(num(2), sqrt(num(3)))] },
  { name: 'radical over integer', keys: ['sqrt', '3', '/', '3'], expect: [frac(sqrt(num(3)), num(3))] },
  { name: 'rationalized', keys: ['2', 'sqrt', '3'], expect: [mul(num(2), sqrt(num(3)))] },
  { name: 'radical of sum', keys: ['sqrt', '(', 'var:x', '+', '1', ')'], expect: [sqrt(add(v('x'), num(1)))] },
  { name: 'negative radical', keys: ['-', 'sqrt', '5'], expect: [neg(sqrt(num(5)))] },
  { name: 'power', keys: ['var:x', '^', '2'], expect: [pow(v('x'), num(2))] },
  { name: 'negative exponent', keys: ['var:x', '^', '-', '2'], expect: [pow(v('x'), neg(num(2)))] },
  { name: 'rational exponent', keys: ['9', '^', '(', '1', '/', '2', ')'], expect: [pow(num(9), group(frac(num(1), num(2))))] },
  { name: '-x^2 is -(x^2)', keys: ['-', 'var:x', '^', '2'], expect: [neg(pow(v('x'), num(2)))] },
  { name: '(-3)^2', keys: ['(', '-', '3', ')', '^', '2'], expect: [pow(group(neg(num(3))), num(2))] },
  { name: 'quadratic standard form', keys: ['2', 'var:x', '^', '2', '-', '4', 'var:x', '-', '6', '=', '0'],
    expect: [eq(add(mul(num(2), pow(v('x'), num(2))), neg(mul(num(4), v('x'))), neg(num(6))), num(0))] },
  { name: 'equation 6 + 4x = 2x^2', keys: ['6', '+', '4', 'var:x', '=', '2', 'var:x', '^', '2'],
    expect: [eq(add(num(6), mul(num(4), v('x'))), mul(num(2), pow(v('x'), num(2))))] },
  { name: 'distribute', keys: ['3', '(', 'var:x', '+', '1', ')'], expect: [mul(num(3), group(add(v('x'), num(1))))] },
  { name: 'plus negative', keys: ['var:x', '+', '-', '2'], expect: [add(v('x'), neg(num(2)))] },
  { name: 'literal equation l = A/w', vars: ['l', 'w', 'A'], keys: ['var:l', '=', 'var:A', '/', 'var:w'], expect: [eq(v('l'), frac(v('A'), v('w')))] },
  { name: 'literal equation A = lw', vars: ['l', 'w', 'A'], keys: ['var:A', '=', 'var:l', 'var:w'], expect: [eq(v('A'), mul(v('l'), v('w')))] },
  { name: 'two-letter product', vars: ['x', 'y'], keys: ['2', 'var:x', 'var:y'], expect: [mul(num(2), v('x'), v('y'))] },
  { name: 'tuple a, b, c', mode: 'list', keys: ['2', ',', '-', '4', ',', '-', '6'], expect: [num(2), neg(num(4)), neg(num(6))] },
  { name: 'tuple with fraction', mode: 'list', keys: ['1', '/', '2', ',', '0', ',', '3'], expect: [frac(num(1), num(2)), num(0), num(3)] },
  // Solution sets: compared by value with hand-computed Surds.
  { name: 'single root', mode: 'solutions', keys: ['5'], roots: [sq(5)] },
  { name: 'single root x = ', mode: 'solutions', solveFor: 'x', keys: ['var:x', '=', '-', '3', '/', '2'], roots: [sq(-3, 2)] },
  { name: 'two roots', mode: 'solutions', keys: ['-', '1', ',', '3'], roots: [sq(-1), sq(3)] },
  { name: 'two roots x = , x = ', mode: 'solutions', solveFor: 'x', keys: ['var:x', '=', '2', ',', 'var:x', '=', '-', '3'], roots: [sq(-3), sq(2)] },
  { name: 'plus-minus integer', mode: 'solutions', keys: ['pm', '3'], roots: [sq(-3), sq(3)] },
  { name: 'plus-minus radical', mode: 'solutions', keys: ['1', 'pm', 'sqrt', '3'], roots: [sadd(sq(1), smul(sq(-1), rt(3))), sadd(sq(1), rt(3))] },
  { name: 'x = plus-minus radical', mode: 'solutions', solveFor: 'x', keys: ['var:x', '=', '2', 'pm', '3', 'sqrt', '2'],
    roots: [sadd(sq(2), smul(sq(-3), rt(2))), sadd(sq(2), smul(sq(3), rt(2)))] },
  { name: 'quadratic formula shape', mode: 'solutions', keys: ['(', '1', 'pm', 'sqrt', '5', ')', '/', '2'],
    roots: [sadd(sq(1, 2), smul(sq(-1, 2), rt(5))), sadd(sq(1, 2), smul(sq(1, 2), rt(5)))] },
  { name: 'plus then minus is not plus-minus', mode: 'solutions', keys: ['1', '+', '-', '2'], roots: [sq(-1)] },
  { name: 'no solution', mode: 'solutions', keys: ['none'], word: 'no solution' },
  { name: 'all reals', mode: 'solutions', keys: ['all'], word: 'all reals' },
];

test('keypad round trip: every slice answer form (hand table)', () => {
  for (const row of TABLE) {
    const st = typeKeys(makeKeypad({ variableKeys: row.vars, mode: row.mode, solveFor: row.solveFor }), row.keys);
    const text = inputText(st);
    const reading = readInput(text, { mode: st.mode, solveFor: st.solveFor });
    if (row.word) {
      assert.deepEqual(reading, { status: 'word', word: row.word }, row.name);
      continue;
    }
    assert.equal(reading.status, 'read', `${row.name}: ${text} -> ${reading.status} ${reading.status === "unread" ? reading.error : ""}`);
    if (reading.status !== 'read') continue;
    if (row.expect) {
      assert.equal(reading.items.length, row.expect.length, row.name);
      reading.items.forEach((got, i) => {
        const want = /** @type {Node | Equation} */ (row.expect && row.expect[i]);
        assert.ok(same(got, want), `${row.name}: read ${print(got)}, want ${print(want)} (exact tree, groups kept)`);
      });
    }
    if (row.roots) {
      const r = parseSolutions(text, st.solveFor);
      assert.ok(!('error' in r) && r.set.kind === 'finite', row.name);
      if ('error' in r || r.set.kind !== 'finite') continue;
      assert.equal(r.set.roots.length, row.roots.length, `${row.name}: ${text}`);
      // Roots come back ascending; compare as sets.
      for (const want of row.roots) assert.ok(r.set.roots.some((g) => seq(g, want)), `${row.name}: missing root`);
      if (st.solveFor) assert.ok(reading.items.every((it) => it.t === 'eq' && it.lhs.t === 'var' && it.lhs.name === st.solveFor));
    }
  }
});

test('keypad round trip: random trees typed key by key read back as the same tree', () => {
  let typed = 0;
  forSeeds(6000, (rng) => {
    const x = randomMath(rng, rng.int(1, 4));
    const vs = varsOf(x);
    if (vs.length > 4) return;
    const text = print(x);
    const keys = keysFor(text);
    const st = typeKeys(makeKeypad({ variableKeys: vs }), keys);
    if (st.tokens.length !== keys.length) {
      if (keys.length > MAX_TOKENS) return; // beyond the keypad's length cap
      throw new Error(`keys dropped typing ${text}`);
    }
    const kt = inputText(st);
    const a = parse(kt);
    const b = parse(text);
    if ('error' in b) throw new Error(`print output did not parse: ${text}`);
    if ('error' in a) throw new Error(`keypad text ${JSON.stringify(kt)} did not parse: ${a.error}`);
    if (!same(a, b)) throw new Error(`keypad text ${kt} reads differently from ${text}`);
    // And the reading is the tree that was typed, up to display normalization.
    if (!same(norm(a), norm(/** @type {any} */ (b)))) throw new Error('norm mismatch');
    typed++;
  }, { prefix: 'kr' });
  assert.ok(typed > 4000, `typed ${typed}`);
});

test('keypad round trip: random solution lists with plus-minus', () => {
  forSeeds(2000, (rng) => {
    const a = rng.int(-9, 9), b = rng.int(1, 9), n = rng.pick([2, 3, 5, 6, 7]), d = rng.int(1, 4);
    // value = (a +- b sqrt(n)) / d
    const keys = ['(', ...keysFor(`${Math.abs(a)}`)];
    if (a < 0) keys.splice(1, 0, '-');
    keys.push('pm', ...keysFor(`${b}`), 'sqrt', ...keysFor(`${n}`), ')', '/', ...keysFor(`${d}`));
    const st = typeKeys(makeKeypad({ mode: 'solutions' }), keys);
    const r = parseSolutions(inputText(st), 'x');
    if ('error' in r || r.set.kind !== 'finite') throw new Error(`${inputText(st)} unread`);
    const c = sq(a, d), e = smul(sq(b, d), rt(n));
    const want = [sadd(c, smul(sq(-1), e)), sadd(c, e)];
    if (r.set.roots.length !== 2 || !want.every((w) => r.set.roots.some((g) => seq(g, w)))) throw new Error(`${inputText(st)} wrong roots`);
  }, { prefix: 'ks' });
});

// ------------------------------------------------------------------ preview

test('preview: shows the reading, parenthesized where it could surprise', () => {
  const pv = (/** @type {string[]} */ keys, /** @type {any} */ opts = {}) => {
    const st = typeKeys(makeKeypad(opts), keys);
    const t = inputText(st);
    return previewVNode(readInput(t, { mode: st.mode, solveFor: st.solveFor }), t);
  };
  const half = pv(['1', '/', '2', 'var:x']);
  assert.ok(hasClass(half, 'kp-read'));
  const parens = findAll(half, (n) => hasClass(n, 'mparen') && findAll(n, (k) => hasClass(k, 'frac')).length > 0);
  assert.equal(parens.length, 1, '1/2x shows as (1/2)x');
  assert.equal(readBack(half).replace(/\s+/g, ''), '(((1)/(2)))x');
  const sq3 = pv(['sqrt', '3']);
  assert.equal(findAll(sq3, (n) => hasClass(n, 'mroot')).length, 1, 'sqrt3 shows as a radical over 3');
  assert.equal(readBack(sq3), 'sqrt(3)');
  const negsq = pv(['-', 'var:x', '^', '2']);
  assert.equal(readBack(negsq).replace(/\s+/g, ''), '-(x^(2))');
  const partial = pv(['2', '+']);
  assert.ok(hasClass(partial, 'kp-unread'));
  assert.match(textOf(partial), /not readable yet/);
  assert.equal(findAll(partial, (n) => hasClass(n, 'm')).length, 0);
  const open = pv(['sqrt', '(', '2']);
  assert.ok(hasClass(open, 'kp-unread'));
  assert.ok(textOf(open).startsWith('\u221a(2'));
  const empty = pv([]);
  assert.ok(hasClass(empty, 'kp-empty'));
  const pmList = pv(['var:x', '=', '1', 'pm', 'sqrt', '3'], { mode: 'solutions' });
  assert.ok(hasClass(pmList, 'kp-read'));
  assert.equal(findAll(pmList, (n) => hasClass(n, 'meq')).length, 2, 'x = 1 + sqrt3, x = 1 - sqrt3');
  const pmSingle = pv(['1', 'pm', '2']);
  assert.ok(hasClass(pmSingle, 'kp-unread'), 'plus-minus outside a solution item is not readable');
  const words = pv(['none'], { mode: 'solutions' });
  assert.ok(hasClass(words, 'kp-word'));
  const tuple = pv(['2', ',', '-', '4'], { mode: 'list' });
  assert.equal(findAll(tuple, (n) => hasClass(n, 'mcomma')).length, 1);
  assert.equal(readModeFor('solution-set'), 'solutions');
  assert.equal(readModeFor('tuple'), 'list');
  assert.equal(readModeFor('expr'), 'single');
  assert.equal(readModeFor('equation-sides'), 'single');
});

// ------------------------------------------------------------------ physical keyboard

test('physical keyboard map', () => {
  const vs = ['x', 'A'];
  /** @param {string} key @param {object} [mods] */
  const k = (key, mods = {}) => physicalKey({ key, ...mods }, vs);
  for (const c of '0123456789+-/^()=,') assert.equal(k(c), c);
  assert.equal(k('x'), 'var:x');
  assert.equal(k('A'), 'var:A');
  assert.equal(k('a'), undefined, 'case-sensitive; a is not declared');
  assert.equal(k('y'), undefined);
  assert.equal(k('s'), 'sqrt');
  assert.equal(physicalKey({ key: 's' }, ['s']), 'var:s', 's types the variable when declared');
  assert.equal(k('\\'), 'sqrt');
  assert.equal(k('#'), 'sqrt');
  assert.equal(k('~'), 'pm');
  assert.equal(k('['), 'none');
  assert.equal(k(']'), 'all');
  assert.equal(k('Backspace'), 'back');
  assert.equal(k('Delete'), 'back');
  assert.equal(k('Enter'), 'enter');
  assert.equal(k('r', { metaKey: true }), undefined);
  assert.equal(k('1', { ctrlKey: true }), undefined);
  assert.equal(k('*'), undefined);
});

// ------------------------------------------------------------------ mounted DOM

test('mountKeypad: buttons on pointerdown, no input elements, live preview, keyboard, destroy', () => {
  const doc = new FakeDoc();
  const host = doc.createElement('div');
  const target = doc.createElement('div');
  /** @type {any[]} */
  const changes = [];
  /** @type {string[]} */
  const entered = [];
  const kp = mountKeypad(doc, host, {
    variableKeys: ['x'], onChange: (c) => changes.push(c), onEnter: (t) => entered.push(t), keyboardTarget: target,
  });
  const all = host.findAll(() => true);
  assert.equal(all.filter((e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName) || e.getAttribute('contenteditable') !== null).length, 0);
  const buttons = host.findAll((e) => e.tagName === 'BUTTON');
  assert.equal(buttons.length, 24);
  assert.ok(buttons.every((b) => b.getAttribute('type') === 'button'));
  assert.ok(all.every((e) => !e.listeners.click), 'no click handlers');
  const grid = host.findAll((e) => e.getAttribute('class') === 'kp-grid')[0];
  assert.ok(grid.listeners.pointerdown && grid.listeners.pointerdown.length === 1);
  const btn = (/** @type {string} */ id) => buttons.filter((b) => b.getAttribute('data-key') === id)[0];
  /** @param {string} id @param {object} [extra] */
  const tap = (id, extra = {}) => {
    const b = btn(id);
    let prevented = false;
    grid.listeners.pointerdown[0]({ target: b, button: 0, preventDefault() { prevented = true; }, ...extra });
    return prevented;
  };
  assert.ok(tap('1'), 'pointerdown is preventDefault-ed');
  tap('/'); tap('2'); tap('var:x');
  assert.equal(kp.getText(), '1/2x');
  // Right button is ignored.
  grid.listeners.pointerdown[0]({ target: btn('3'), button: 2, preventDefault() {} });
  assert.equal(kp.getText(), '1/2x');
  // A tap on a child of the button (e.g. its text) still finds the key.
  const label = doc.createElement('span');
  btn('+').appendChild(label);
  grid.listeners.pointerdown[0]({ target: label, button: 0, preventDefault() {} });
  assert.equal(kp.getText(), '1/2x+');
  assert.equal(changes.at(-1).reading.status, 'unread');
  assert.match(host.textContent, /not readable yet/);
  tap('back');
  assert.equal(changes.at(-1).reading.status, 'read');
  assert.equal(host.findAll((e) => e.getAttribute('class') === 'mparen').length, 1, 'preview drew (1/2)x');
  // Physical keyboard.
  target.dispatch('keydown', { key: '+' });
  target.dispatch('keydown', { key: '3' });
  assert.equal(kp.getText(), '1/2x+3');
  target.dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(entered, ['1/2x+3']);
  kp.clear();
  assert.equal(kp.getText(), '');
  kp.destroy();
  assert.equal(host.childNodes.length, 0);
  target.dispatch('keydown', { key: '5' });
  assert.equal(kp.getText(), '', 'keyboard listener removed');
});

test('mountKeypad: the preview can live in another container', () => {
  const doc = new FakeDoc();
  const host = doc.createElement('div');
  const pv = doc.createElement('div');
  const kp = mountKeypad(doc, host, { previewContainer: pv });
  kp.press('7');
  assert.match(pv.textContent, /7/);
  assert.equal(host.findAll((e) => /kp-preview/.test(e.getAttribute('class') || '')).length, 0);
  kp.destroy();
  assert.equal(pv.childNodes.length, 0);
});

test('keys are 48px or larger and touch-safe (CSS contract)', () => {
  assert.equal(KEY_GRID_MIN_PX, 256);
  assert.match(KEYPAD_CSS, /\.kp-grid \{[^}]*gap: 4px/);
  assert.match(KEYPAD_CSS, /\.kp-key \{[^}]*min-height: 48px/);
  assert.match(KEYPAD_CSS, /\.kp-key \{[^}]*min-width: 48px/);
  assert.match(KEYPAD_CSS, /grid-auto-rows: minmax\(48px/);
  assert.match(KEYPAD_CSS, /\.kp \{[^}]*touch-action: manipulation/);
  assert.match(KEYPAD_CSS, /\.kp \{[^}]*-webkit-user-select: none/);
  assert.match(KEYPAD_CSS, /\.kp \{[^}]*-webkit-touch-callout: none/);
  const vn = keypadVNode(makeKeypad({ variableKeys: ['l', 'w', 'A'] }));
  assert.equal(findAll(vn, (n) => n.tag === 'input' || n.tag === 'textarea').length, 0);
  assert.equal(findAll(vn, (n) => n.tag === 'button').length, 26);
});

// ------------------------------------------------------------------ review fixes (m4 fixer)

test('regression (finding 1): whole-answer keys are live only on solution-set items', () => {
  for (const mode of /** @type {const} */ (['single', 'list'])) {
    const st = makeKeypad({ mode });
    for (const id of ['none', 'all']) {
      // press() ignores them, from empty and mid-input, so the judge never gets the words as letters.
      assert.deepEqual(press(st, id).tokens, [], `${mode} ${id}`);
      assert.deepEqual(press(typeKeys(st, ['2']), id).tokens, ['2'], `${mode} ${id} after 2`);
      // Physical keys go through press() too.
      const kid = physicalKey({ key: id === 'none' ? '[' : ']' }, st.vars);
      assert.deepEqual(press(st, /** @type {string} */ (kid)).tokens, []);
    }
    // Text that spells a word anyway (not from the keypad) previews as unread, never as a word.
    for (const w of ['no solution', 'all reals']) {
      const r = readInput(w, { mode });
      assert.equal(r.status, 'unread', `${mode} ${w}`);
      assert.ok(hasClass(previewVNode(r, w), 'kp-unread'));
    }
    // Drawn disabled, same grid (layout unchanged).
    const vn = keypadVNode(st);
    const btn = (/** @type {string} */ id) => findAll(vn, (n) => n.attrs['data-key'] === id)[0];
    for (const id of ['none', 'all']) {
      assert.ok(hasClass(btn(id), 'kp-off') && btn(id).attrs['aria-disabled'] === 'true' && 'disabled' in btn(id).attrs, `${mode} ${id} drawn disabled`);
    }
    assert.ok(!('disabled' in btn('7').attrs));
    assert.equal(findAll(vn, (n) => n.tag === 'button').length, findAll(keypadVNode(makeKeypad({ mode: 'solutions' })), (n) => n.tag === 'button').length);
  }
  const sol = makeKeypad({ answerKind: 'solution-set' });
  const vs = keypadVNode(sol);
  assert.equal(findAll(vs, (n) => hasClass(n, 'kp-off')).length, 0);
  assert.equal(inputText(press(sol, 'none')), 'no solution');
  assert.deepEqual(readInput('all reals', { mode: 'solutions' }), { status: 'word', word: 'all reals' });
});

test('regression (finding 2): the keys + / - never spell "+/-" (one plus-minus token in parse.js)', () => {
  const st = typeKeys(makeKeypad({ answerKind: 'solution-set' }), ['8', '+', '/', '-', '2']);
  assert.equal(inputText(st), '8+ /-2');
  assert.equal(readInput(inputText(st), { mode: 'solutions', solveFor: 'x' }).status, 'unread');
  assert.ok('error' in parseSolutions(inputText(st), 'x'));
  // A genuine plus-minus is still one key.
  const pmSt = typeKeys(makeKeypad({ answerKind: 'solution-set' }), ['8', 'pm', '2']);
  assert.equal(readInput(inputText(pmSt), { mode: 'solutions', solveFor: 'x' }).status, 'read');
});

test('regression (finding 3): a too-wide preview keeps its start visible and says the rest is off screen', () => {
  // Base rule: no centered overflow:hidden box (that clips BOTH ends); centered by auto margins instead.
  const base = /** @type {string} */ ((KEYPAD_CSS.match(/\.kp-preview \{([^}]*)\}/) || [])[1]);
  assert.doesNotMatch(base, /justify-content:\s*center/);
  assert.doesNotMatch(base, /overflow:\s*hidden/);
  assert.match(base, /overflow-x:\s*auto/);
  assert.match(KEYPAD_CSS, /\.kp-preview > :first-child \{ margin-left: auto; \}/);
  assert.match(KEYPAD_CSS, /\.kp-preview > :last-child \{ margin-right: auto; \}/);
  const pv = (/** @type {string[]} */ keys, /** @type {any} */ opts = {}) => {
    const st = typeKeys(makeKeypad(opts), keys);
    const t = inputText(st);
    return previewVNode(readInput(t, { mode: st.mode, solveFor: st.solveFor }), t);
  };
  const long = pv(keysFor('-(x+1)(x-1)(x+2)(x-2)(x+3)'));
  assert.ok(hasClass(long, 'kp-wide'), 'flagged wide');
  assert.match(textOf(long), /swipe to see the rest/);
  assert.ok(textOf(long).startsWith('\u2212('), 'the leading minus is the first thing in the scroller');
  const short = pv(keysFor('2x+1'));
  assert.ok(!hasClass(short, 'kp-wide'));
  assert.equal(PREVIEW_BOX_PX, 325);
  // Lists and equations wrap, so only their widest piece counts.
  const list = pv(keysFor('1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16'), { mode: 'list' });
  assert.ok(!hasClass(list, 'kp-wide'));
  assert.equal(typeof previewTooWide, 'function');
});
