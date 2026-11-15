// @ts-check
// Hand-built Problems for the mal-rule and diagnosis tests. Every prompt is
// written as keypad text and parsed, so nothing here depends on a generator.

import { parse } from '../../src/math/parse.js';
import { BLANK } from '../../src/misc/kit.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').AnswerSpec} AnswerSpec */
/** @typedef {import('../../types.d.ts').Move} Move */

/** @param {string} s @returns {Node | Equation} */
export function P(s) {
  const r = parse(s);
  if ('error' in r) throw new Error(`fixture did not parse: ${s}: ${r.error}`);
  return r;
}
/** @param {string} s @returns {Node} */
export function N(s) { const r = P(s); if (r.t === 'eq') throw new Error(`not an expression: ${s}`); return r; }
/** @param {string} s @returns {Equation} */
export function E(s) { const r = P(s); if (r.t !== 'eq') throw new Error(`not an equation: ${s}`); return r; }

/**
 * @param {Problem['prompt']['math']} math @param {AnswerSpec} answer @param {Partial<Problem>} [over]
 * @returns {Problem}
 */
export function problem(math, answer, over = {}) {
  return /** @type {Problem} */ ({
    id: 'fx', gen: 'fixture.hand', version: 1, seed: 'fx', skill: 'test', difficulty: 1,
    interaction: 'strike', constructed: true, fadeLevel: 3,
    prompt: { verb: 'Do', math }, assumptions: [], variableKeys: ['x'],
    answer, visuals: [], probes: [],
    ...over,
  });
}

/** Expression item: "Simplify <text>", key `key`. @param {string} text @param {string} key @param {string[]} [formPredicates] @param {Partial<Problem>} [over] */
export function exprItem(text, key, formPredicates = [], over = {}) {
  return problem(N(text), { kind: 'expr', expected: N(key), formPredicates, assumptions: [] }, over);
}

/** Solve item with roots given as text ("3/2", "-1"); [] = no solution. @param {string} text @param {string[]} roots @param {Partial<Problem>} [over] */
export function solveItem(text, roots, over = {}) {
  const set = roots.length === 0 ? { kind: /** @type {const} */ ('none') }
    : { kind: /** @type {const} */ ('finite'), roots: roots.map((r) => /** @type {import('../../types.d.ts').Surd} */ (evalConst(r))) };
  return problem(E(text), { kind: 'solution-set', expected: set, formPredicates: [], assumptions: [] }, over);
}

/** Next-line item on an equation. @param {string} text @param {Move} move @param {string} key */
export function lineItem(text, move, key) {
  return problem(E(text), { kind: 'equation-sides', expected: E(key), formPredicates: [], assumptions: [] },
    { interaction: 'predict', prompt: { verb: 'Next line', math: E(text), move } });
}

/** Rewrite-as-zero item. @param {string} text */
export function rewriteItem(text) {
  return problem(E(text), { kind: 'equation-multiple', expected: E(text), formPredicates: ['standard-form'], assumptions: [] });
}

/** Read a, b, c item. @param {string} text @param {string[]} abc */
export function abcItem(text, abc) {
  return problem(E(text), { kind: 'tuple', expected: abc.map(N), formPredicates: [], assumptions: [] }, { variant: 'read-abc' });
}

/** "3 + 4 = [ ] + 2": write the blank as z. @param {string} text @param {string} key */
export function blankItem(text, key) {
  const e = /** @type {Equation} */ (JSON.parse(JSON.stringify(E(text), (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)).replaceAll('"name":"z"', `"name":"${BLANK}"`),
    (_k, v) => (typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v)));
  return problem(e, { kind: 'expr', expected: N(key), formPredicates: ['integer'], assumptions: [] }, { variant: 'fill-blank', variableKeys: [] });
}

/** Twin item; `same` is the truth. @param {string} a @param {string} b @param {boolean} same */
export function twinItem(a, b, same) {
  const prompt = { verb: 'Same value?', math: N(a), twin: N(b) };
  return problem(prompt.math, { kind: 'expr', expected: N(a), formPredicates: [], assumptions: [] }, {
    interaction: 'twin', constructed: false, prompt,
    choices: [
      { id: 'same', display: prompt.math, verdict: same ? 'correct' : 'wrong' },
      { id: 'different', display: prompt.twin, verdict: same ? 'wrong' : 'correct' },
    ],
  });
}

import { evaluateS } from '../../src/math/evaluate.js';
/** @param {string} s */
export function evalConst(s) {
  const v = evaluateS(N(s), {});
  if (!v) throw new Error(`fixture value not exact: ${s}`);
  return v;
}

/** @param {'add' | 'sub' | 'mul' | 'div'} op @param {string} operand @returns {Move} */
export function mv(op, operand) { return { op, operand: N(operand) }; }
