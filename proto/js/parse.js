// @ts-check
// Parser for keypad input. Never throws: returns { error } for anything it cannot read.
//
// Grammar (precedence low -> high). Juxtaposition is multiplication; "/" binds tighter
// than juxtaposition, so "1/2x" is (1/2) x and "3sqrt2/2" is 3 (sqrt2 / 2). The live
// preview renders the parse, so the reading is always visible before commit.
//   line     := expr ('=' expr)?
//   expr     := '+'? term (('+' | '-') term)*   (a leading '+' is dropped)
//   term     := '-' term | product
//   product  := quotient (('*')? quotient)*
//   quotient := power ('/' power)*
//   power    := atom ('^' expon)?
//   expon    := '-'? atom ('^' expon)?
//   atom     := NUMBER | VAR | '(' expr ')' | 'sqrt' sqrtarg
//   sqrtarg  := atom            ("sqrt3^2" is (sqrt 3)^2; "sqrt(3^2)" needs parentheses)
import { num, v, add, neg, frac, pow, root, group, eq } from './ast.js';

/** @typedef {import('./ast.js').Node} Node */
/** @typedef {import('./ast.js').Equation} Equation */
/** @typedef {{ k: string, v?: string }} Tok */
/** @typedef {{ kind: 'expr', node: Node } | { kind: 'eq', eq: Equation } | { error: string }} ParseResult */

export const MAX_INPUT = 120;
const MAX_DIGITS = 12;
const MAX_DEPTH = 60;

/**
 * @param {string} text
 * @param {string[]} vars
 * @returns {{ toks: Tok[] } | { error: string }}
 */
export function tokenize(text, vars) {
  /** @type {Tok[]} */
  const toks = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ') {
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      if (j - i > MAX_DIGITS) return { error: 'number too long' };
      toks.push({ k: 'num', v: text.slice(i, j) });
      i = j;
      continue;
    }
    if (text.startsWith('sqrt', i)) {
      toks.push({ k: 'sqrt' });
      i += 4;
      continue;
    }
    if ('+-/^()=*'.includes(c)) {
      toks.push({ k: c });
      i++;
      continue;
    }
    if (vars.includes(c)) {
      toks.push({ k: 'var', v: c });
      i++;
      continue;
    }
    return { error: 'unexpected character' };
  }
  return { toks };
}

class Fail extends Error {}

/**
 * @param {unknown} text
 * @param {string[]} [vars]
 * @returns {ParseResult}
 */
export function parse(text, vars = ['x']) {
  try {
    if (typeof text !== 'string') return { error: 'no input' };
    if (text.length > MAX_INPUT) return { error: 'too long' };
    const tk = tokenize(text, vars);
    if ('error' in tk) return tk;
    const toks = tk.toks;
    if (toks.length === 0) return { error: 'empty' };
    let i = 0;
    let depth = 0;
    const peek = () => (i < toks.length ? toks[i].k : '');
    const take = () => toks[i++];
    const expect = (/** @type {string} */ k) => {
      if (peek() !== k) throw new Fail(`expected ${k}`);
      return take();
    };
    const atomStart = () => {
      const k = peek();
      return k === 'num' || k === 'var' || k === 'sqrt' || k === '(';
    };
    const enter = () => {
      if (++depth > MAX_DEPTH) throw new Fail('too deep');
    };

    /** @returns {Node} */
    function atom() {
      enter();
      try {
        const k = peek();
        if (k === 'num') return num(BigInt(/** @type {string} */ (take().v)));
        if (k === 'var') return v(/** @type {string} */ (take().v));
        if (k === '(') {
          take();
          const e = expr();
          expect(')');
          return group(e);
        }
        if (k === 'sqrt') {
          take();
          if (!atomStart()) throw new Fail('sqrt needs a number');
          const a = atom();
          return root(a.t === 'group' ? a.arg : a);
        }
        throw new Fail('expected a number');
      } finally {
        depth--;
      }
    }
    /** @returns {Node} */
    function expon() {
      enter();
      try {
        if (peek() === '-') {
          take();
          return neg(exponTail(atom()));
        }
        return exponTail(atom());
      } finally {
        depth--;
      }
    }
    /** @param {Node} base @returns {Node} */
    function exponTail(base) {
      if (peek() === '^') {
        take();
        return pow(base, expon());
      }
      return base;
    }
    /** @returns {Node} */
    function power() {
      const a = atom();
      if (peek() === '^') {
        take();
        return pow(a, expon());
      }
      return a;
    }
    /** @returns {Node} */
    function quotient() {
      let a = power();
      while (peek() === '/') {
        take();
        a = frac(a, power());
      }
      return a;
    }
    /** @returns {Node} */
    function product() {
      /** @type {Node[]} */
      const fs = [quotient()];
      let explicit = false;
      for (;;) {
        if (peek() === '*') {
          take();
          explicit = true;
          fs.push(quotient());
        } else if (atomStart()) {
          fs.push(quotient());
        } else break;
      }
      if (fs.length === 1) return fs[0];
      return explicit ? { t: 'mul', args: fs, explicit: true } : { t: 'mul', args: fs };
    }
    /** @returns {Node} */
    function term() {
      enter();
      try {
        if (peek() === '-') {
          take();
          return neg(term());
        }
        return product();
      } finally {
        depth--;
      }
    }
    /** @returns {Node} */
    function expr() {
      enter();
      try {
        // a leading unary '+' (start of a side or of a parenthesis) changes nothing: drop it
        if (peek() === '+') take();
        /** @type {Node[]} */
        const args = [term()];
        for (;;) {
          if (peek() === '+') {
            take();
            args.push(term());
          } else if (peek() === '-') {
            take();
            args.push(neg(term()));
          } else break;
        }
        return args.length === 1 ? args[0] : add(...args);
      } finally {
        depth--;
      }
    }

    const lhs = expr();
    if (peek() === '=') {
      take();
      const rhs = expr();
      if (i !== toks.length) throw new Fail('unexpected input after the equation');
      return { kind: 'eq', eq: eq(lhs, rhs) };
    }
    if (i !== toks.length) throw new Fail('unexpected input');
    return { kind: 'expr', node: lhs };
  } catch (e) {
    if (e instanceof Fail) return { error: e.message };
    return { error: 'unreadable' };
  }
}
