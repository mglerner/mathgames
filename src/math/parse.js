// @ts-check
// Parser for what a kid types on the keypad (DESIGN.md section 9): digits,
// + - / ^ ( ) = sqrt and single-letter variables. NEVER throws: every failure
// is returned as { error }.
//
// Grammar (lowest to highest precedence):
//   input    := expr | expr '=' expr                 exactly zero or one '='
//   expr     := term (('+' | '-') term)*             a - b is add[a, neg(b)]
//   term     := '-' term | factor (('*' | '/' | <nothing>) factor)*
//   factor   := atom ('^' exponent)?
//   exponent := '-' exponent | atom ('^' exponent)?  right associative
//   atom     := number | letter | '(' expr ')' | sqrt '(' expr ')' | sqrt number | sqrt letter
//
// Conventions (the "parser shape" that print() round-trips):
//   - Multiplication and division have equal precedence and group left to
//     right, and implicit multiplication is ordinary multiplication:
//     1/2x is (1/2)x, a/bc is (a/b)c, 2x/3 is (2x)/3. print() never emits one
//     of these without parentheses.
//   - Unary minus covers the whole term: -2x is neg(mul[2, x]), -x^2 is neg(x^2).
//   - 3/4 is frac(num 3, num 4): number literals are always nonnegative integers.
//   - Every explicit pair of parentheses is kept as a group node, except the
//     pair that belongs to sqrt( ).
//   - sqrt3 is sqrt(3); sqrt3x is sqrt(3) x; sqrtx^2 is (sqrt(x))^2.
//   - Two numbers separated only by a space ("2 1/2") are an error, not a product.
//   - Decimals are not supported (the keypad has no point key).
//   - Variables are single ASCII letters; "sqrt" is always the keyword.
// Also accepted: '*', U+00D7, U+00B7, U+22C5 (times), U+2212 (minus), U+00F7
// (divide), U+221A (square root sign).
// Plus-minus (U+00B1 or "+/-") and commas are rejected by parse(); they belong
// to parseSolutions() and parseList().
// The two characters "+-" typed with nothing between them are context
// dependent: parse() and parseList() read them as plus then negative
// (3+-2 is 1), parseSolutions() reads them as plus-minus (the section 9
// keypad key is labelled "+-"). "+ -" with a space is always plus, negative.

import { evaluateS } from './evaluate.js';
import { seq, scmp } from './surd.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').SolutionSet} SolutionSet */

/** Longest input accepted, in characters. */
export const MAX_INPUT = 300;
const MAX_DEPTH = 120;

/**
 * @typedef {{ k: 'num'; v: bigint; sp: boolean } | { k: 'var'; v: string; sp: boolean }
 *   | { k: 'sqrt' | 'pm' | '+' | '-' | '*' | '/' | '^' | '(' | ')' | '=' | ','; sp: boolean }} Tok
 *   sp: whitespace came directly before this token
 */

class ParseError extends Error {}

/** @param {string} msg @returns {never} */
function fail(msg) { throw new ParseError(msg); }

/** @type {Record<string, Tok['k']>} */
const SYMBOLS = {
  '+': '+', '-': '-', '*': '*', '/': '/', '^': '^', '(': '(', ')': ')', '=': '=', ',': ',',
  '\u00d7': '*', '\u00b7': '*', '\u22c5': '*', '\u2212': '-', '\u00f7': '/', '\u221a': 'sqrt', '\u00b1': 'pm',
};

/**
 * @param {string} text
 * @returns {Tok[]}
 */
function tokenize(text) {
  /** @type {Tok[]} */
  const out = [];
  let i = 0;
  let sp = false;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\u00a0') { sp = true; i++; continue; }
    if (c >= '0' && c <= '9') {
      let j = i + 1;
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      out.push({ k: 'num', v: BigInt(text.slice(i, j)), sp });
      i = j;
    } else if (text.startsWith('sqrt', i)) {
      out.push({ k: 'sqrt', sp });
      i += 4;
    } else if (text.startsWith('+/-', i)) {
      out.push({ k: 'pm', sp });
      i += 3;
    } else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      out.push({ k: 'var', v: c, sp });
      i++;
    } else if (Object.prototype.hasOwnProperty.call(SYMBOLS, c)) {
      out.push(/** @type {Tok} */ ({ k: SYMBOLS[c], sp }));
      i++;
    } else if (c === '.') {
      fail('decimals are not supported; type a fraction');
    } else {
      fail(`unexpected character "${c}"`);
    }
    sp = false;
  }
  return out;
}

/**
 * Parse one expression from a token list (no '=', no ',', no plus-minus).
 * @param {Tok[]} toks
 * @returns {Node}
 */
function parseExprTokens(toks) {
  let pos = 0;
  let depth = 0;
  const peek = () => (pos < toks.length ? toks[pos] : undefined);
  /** @param {Tok | undefined} t */
  const describe = (t) => (t === undefined ? 'end of input' : t.k === 'num' ? `"${t.v}"` : t.k === 'var' ? `"${t.v}"` : t.k === 'pm' ? 'plus-minus' : `"${t.k}"`);
  const enter = () => { if (++depth > MAX_DEPTH) fail('too deeply nested'); };
  const leave = () => { depth--; };

  /** @returns {Node} */
  function expr() {
    enter();
    const first = term();
    /** @type {Node[]} */
    const args = [first];
    for (let t = peek(); t && (t.k === '+' || t.k === '-'); t = peek()) {
      pos++;
      const rhs = term();
      args.push(t.k === '-' ? { t: 'neg', arg: rhs } : rhs);
    }
    leave();
    return args.length === 1 ? first : { t: 'add', args };
  }

  /** @param {Tok | undefined} t */
  function startsAtom(t) {
    return t !== undefined && (t.k === 'num' || t.k === 'var' || t.k === '(' || t.k === 'sqrt');
  }

  /** @returns {Node} */
  function term() {
    enter();
    const t0 = peek();
    if (t0 && t0.k === '-') { pos++; const inner = term(); leave(); return { t: 'neg', arg: inner }; }
    if (t0 && t0.k === '+') { pos++; const inner = term(); leave(); return inner; }
    let cur = factor();
    let open = false; // cur is a mul built in this loop and may take more factors
    for (;;) {
      const t = peek();
      if (t && t.k === '*') {
        pos++;
        const f = signedFactor();
        if (open && cur.t === 'mul') cur.args.push(f); else { cur = { t: 'mul', args: [cur, f] }; open = true; }
      } else if (t && t.k === '/') {
        pos++;
        const f = signedFactor();
        cur = { t: 'frac', num: cur, den: f };
        open = false;
      } else if (startsAtom(t)) {
        if (t && t.k === 'num' && toks[pos - 1].k === 'num') fail('two numbers in a row; put an operation between them');
        const f = factor();
        if (open && cur.t === 'mul') cur.args.push(f); else { cur = { t: 'mul', args: [cur, f] }; open = true; }
      } else {
        break;
      }
    }
    leave();
    return cur;
  }

  /** @returns {Node} */
  function signedFactor() {
    enter();
    const t = peek();
    /** @type {Node} */
    let out;
    if (t && t.k === '-') { pos++; out = { t: 'neg', arg: signedFactor() }; }
    else if (t && t.k === '+') { pos++; out = signedFactor(); }
    else out = factor();
    leave();
    return out;
  }

  /** @returns {Node} */
  function factor() {
    const base = atom();
    const t = peek();
    if (t && t.k === '^') { pos++; return { t: 'pow', base, exp: exponent() }; }
    return base;
  }

  /** @returns {Node} */
  function exponent() {
    enter();
    const t = peek();
    /** @type {Node} */
    let out;
    if (t && t.k === '-') { pos++; out = { t: 'neg', arg: exponent() }; }
    else if (t && t.k === '+') { pos++; out = exponent(); }
    else {
      const b = atom();
      const t2 = peek();
      if (t2 && t2.k === '^') { pos++; out = { t: 'pow', base: b, exp: exponent() }; } else out = b;
    }
    leave();
    return out;
  }

  /** @returns {Node} */
  function atom() {
    const t = peek();
    if (!t) return fail('unexpected end of input');
    if (t.k === 'num') { pos++; return { t: 'num', q: { n: t.v, d: 1n } }; }
    if (t.k === 'var') { pos++; return { t: 'var', name: t.v }; }
    if (t.k === '(') {
      pos++;
      const inner = expr();
      const close = peek();
      if (!close || close.k !== ')') fail(`expected ")" but found ${describe(close)}`);
      pos++;
      return { t: 'group', arg: inner };
    }
    if (t.k === 'sqrt') {
      pos++;
      const a = peek();
      if (a && a.k === '(') {
        pos++;
        const inner = expr();
        const close = peek();
        if (!close || close.k !== ')') fail(`expected ")" but found ${describe(close)}`);
        pos++;
        return { t: 'root', index: 2, radicand: inner };
      }
      if (a && a.k === 'num') { pos++; return { t: 'root', index: 2, radicand: { t: 'num', q: { n: a.v, d: 1n } } }; }
      if (a && a.k === 'var') { pos++; return { t: 'root', index: 2, radicand: { t: 'var', name: a.v } }; }
      return fail(`sqrt needs a number, a letter or "(" after it, found ${describe(a)}`);
    }
    if (t.k === 'pm') return fail('plus-minus is only allowed in a solution list');
    if (t.k === ',') return fail('a comma is only allowed in a list');
    return fail(`unexpected ${describe(t)}`);
  }

  if (toks.length === 0) fail('empty');
  const result = expr();
  if (pos < toks.length) {
    const t = toks[pos];
    if (t.k === 'pm') fail('plus-minus is only allowed in a solution list');
    if (t.k === ',') fail('a comma is only allowed in a list');
    fail(`unexpected ${describe(t)}`);
  }
  return result;
}

/**
 * @param {Tok[]} toks
 * @returns {Node | Equation}
 */
function parseTokens(toks) {
  if (toks.length === 0) fail('empty');
  const eqAt = [];
  for (let i = 0; i < toks.length; i++) if (toks[i].k === '=') eqAt.push(i);
  if (eqAt.length === 0) return parseExprTokens(toks);
  if (eqAt.length > 1) fail('more than one "="');
  const left = toks.slice(0, eqAt[0]);
  const right = toks.slice(eqAt[0] + 1);
  if (left.length === 0) fail('nothing before "="');
  if (right.length === 0) fail('nothing after "="');
  return { t: 'eq', lhs: parseExprTokens(left), rhs: parseExprTokens(right) };
}

/**
 * @template T
 * @param {unknown} text
 * @param {(t: string) => T} body
 * @returns {T | { error: string }}
 */
function guarded(text, body) {
  try {
    if (typeof text !== 'string') return { error: 'not text' };
    if (text.length > MAX_INPUT) return { error: 'too long' };
    return body(text);
  } catch (err) {
    if (err instanceof ParseError) return { error: err.message };
    if (err instanceof RangeError) return { error: 'too deeply nested' };
    return { error: 'could not read that' };
  }
}

/**
 * Parse an expression or an equation. Never throws.
 * @param {string} text
 * @returns {Node | Equation | { error: string }}
 */
export function parse(text) {
  return guarded(text, (t) => parseTokens(tokenize(t)));
}

/**
 * Split tokens at top-level commas.
 * @param {Tok[]} toks
 * @returns {Tok[][]}
 */
function splitCommas(toks) {
  /** @type {Tok[][]} */
  const parts = [[]];
  let depth = 0;
  for (const t of toks) {
    if (t.k === '(') depth++;
    if (t.k === ')') depth--;
    if (t.k === ',' && depth === 0) parts.push([]); else parts[parts.length - 1].push(t);
  }
  return parts;
}

/**
 * Parse a comma-separated list ("2, -4, -6"), e.g. for the read-a-b-c tuple.
 * Every item must parse; an empty item is an error. Never throws.
 * @param {string} text
 * @returns {(Node | Equation)[] | { error: string }}
 */
export function parseList(text) {
  return guarded(text, (t) => splitCommas(tokenize(t)).map((part) => parseTokens(part)));
}

/**
 * Parse a typed solution set. Never throws. Accepts:
 *   "no solution" / "all reals" (the two keypad keys; case and spacing ignored);
 *   a comma list of values, each optionally written "x = value";
 *   plus-minus (U+00B1, "+/-", or "+-" with nothing between the two
 *   characters) once per item: "1 +/- sqrt(3)" is two roots. "1 + -2" with a
 *   space is still the single value -1.
 * Every value must be variable-free and evaluate exactly. Repeated values
 * collapse; roots come back in ascending order. `nodes` holds the trees as
 * typed (plus-minus items expanded), for form predicates.
 * If v is given, any "letter =" prefix must name v.
 * @param {string} text
 * @param {string} [v]
 * @returns {{ set: SolutionSet; nodes: Node[] } | { error: string }}
 */
export function parseSolutions(text, v) {
  return guarded(text, (raw) => {
    const word = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (word === 'no solution' || word === 'no solutions' || word === 'none') return { set: { kind: 'none' }, nodes: [] };
    if (word === 'all reals' || word === 'all real numbers') return { set: { kind: 'all' }, nodes: [] };
    /** @type {Node[]} */
    const nodes = [];
    /** @type {Surd[]} */
    const roots = [];
    for (let part of splitCommas(tokenize(raw))) {
      if (part.length >= 2 && part[0].k === 'var' && part[1].k === '=') {
        if (v !== undefined && part[0].v !== v) fail(`expected ${v} = ...`);
        part = part.slice(2);
      }
      if (part.length === 0) fail('empty');
      // "+-" typed as two adjacent characters is the plus-minus key here.
      for (let i = 0; i + 1 < part.length; i++) {
        if (part[i].k === '+' && part[i + 1].k === '-' && !part[i + 1].sp) {
          part = [...part.slice(0, i), /** @type {Tok} */ ({ k: 'pm', sp: part[i].sp }), ...part.slice(i + 2)];
        }
      }
      const pmAt = [];
      for (let i = 0; i < part.length; i++) if (part[i].k === 'pm') pmAt.push(i);
      if (pmAt.length > 1) fail('more than one plus-minus');
      /** @type {Tok[][]} */
      const variants = pmAt.length === 0 ? [part] : (['+', '-']).map((sign) => {
        const copy = part.slice();
        copy[pmAt[0]] = /** @type {Tok} */ ({ k: sign, sp: part[pmAt[0]].sp });
        return copy;
      });
      for (const toks of variants) {
        if (toks.some((t) => t.k === '=')) fail('unexpected "="');
        const node = parseExprTokens(toks);
        const value = evaluateS(node, {});
        if (!value) fail('not a number I can evaluate exactly');
        nodes.push(node);
        if (!roots.some((r) => seq(r, /** @type {Surd} */ (value)))) roots.push(/** @type {Surd} */ (value));
      }
    }
    roots.sort(scmp);
    return { set: { kind: 'finite', roots }, nodes };
  });
}
