// @ts-check
// applyMove: the raw, unsimplified result of doing one Move to both sides of
// an Equation (DESIGN.md section 11 moves API). Nothing here simplifies or
// judges: "- (6 + 4x)" on 6 + 4x = 2x^2 gives
//   6 + 4x - (6 + 4x) = 2x^2 - (6 + 4x)
// exactly, so that the I2/I3 side-wise judge can compare a typed line with
// op(L0) and op(R0) as expressions. graph.js canonicalize() makes the
// displayed / searched line.
//
// Shapes (L is one side; the same is done to the other):
//   add o -> L + o        sub o -> L - o  (add[L, neg(o)])
//   mul o -> L o (mul)    div o -> L / o  (frac)
//   square -> L^2         sqrt   -> sqrt(L)
// add/sub/mul/div need an operand; square/sqrt ignore it. A move without a
// required operand, or an unknown op, is a programming error and throws.

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Move} Move */

/** @type {Node} */
const TWO = { t: 'num', q: { n: 2n, d: 1n } };

/**
 * @param {Move} m
 * @param {Node} side
 * @returns {Node}
 */
export function applyToSide(m, side) {
  switch (m.op) {
    case 'add': return { t: 'add', args: [side, operandOf(m)] };
    case 'sub': return { t: 'add', args: [side, { t: 'neg', arg: operandOf(m) }] };
    case 'mul': return { t: 'mul', args: [side, operandOf(m)] };
    case 'div': return { t: 'frac', num: side, den: operandOf(m) };
    case 'square': return { t: 'pow', base: side, exp: TWO };
    case 'sqrt': return { t: 'root', index: 2, radicand: side };
    default: throw new TypeError(`applyMove: unknown op ${JSON.stringify(/** @type {{op: unknown}} */ (m).op)}`);
  }
}

/** @param {Move} m @returns {Node} */
function operandOf(m) {
  if (!m.operand) throw new TypeError(`applyMove: op "${m.op}" needs an operand`);
  return m.operand;
}

/**
 * The same move on both sides. Pure; the input is not mutated (subtrees are shared).
 * @param {Move} m
 * @param {Equation} e
 * @returns {Equation}
 */
export function applyMove(m, e) {
  return { t: 'eq', lhs: applyToSide(m, e.lhs), rhs: applyToSide(m, e.rhs) };
}
