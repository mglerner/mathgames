// @ts-check
// balance-moves, the one-way moves (skill 13, DESIGN.md sections 3 I1 and 5
// mal-rule 12): "/ x" on a x^2 = k x deletes the root x = 0. A Cast only
// (variant V_ONE_WAY): the chip "/ x" is Risky, refused, and in this
// generator a tagged miss (divide-by-variable-loses-root); the Scale runs the
// lost root 0 through both lines. Recipe: ../common.js.
//
// The goal of the move search is "one side is 0" (ready for the zero-product
// step, which is a later skill): "- k x" and "- a x^2" make progress,
// dividing by a number ("/ |k|") and "+ |k| x" are legal but not closer,
// "x 0" is illegal.
// "x x" is NOT offered: on a x^2 = k x it adds no new root (0 is already a
// root), so it would not be the one-way loss this item is about.
//
// Difficulty (my reading, reported):
//   d1  x^2 = k x, k in +-2..9
//   d2  a x^2 = k x, a in 2..4, k a multiple of a or not (root k/a may be a fraction)
//   d3  as d2, a may be negative, and the sides may be swapped (k x = a x^2)
// The answer key (shown after commit) is the full root set {0, k/a}.

import { defineGenerator, rejectionSample, makeProblem, separated, fitsAll, probeEnvs, V_ONE_WAY } from '../common.js';
import { eq, vars } from '../../math/ast.js';
import { q, ZERO, isZero, abs, sign } from '../../math/rational.js';
import { print } from '../../math/print.js';
import { fromQ, seq, SZERO } from '../../math/surd.js';
import { solve } from '../../math/solve.js';
import { canonicalize, step } from '../../moves/graph.js';
import { polyNode, qNode } from '../../misc/kit.js';
import { X, coeffs, quadAlphabet, isZeroSided, castChoices } from './balance-moves.core.js';

/** @typedef {import('../../../types.d.ts').Move} Move */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').SolutionSet} SolutionSet */

const GEN = Object.freeze({ id: 'balance-moves.one-way', version: 1, skill: 'balance-moves' });
const LOST_ROOT = 'divide-by-variable-loses-root';

/** The alphabet without "x x" chips (see the header). @param {Equation} s @returns {Move[]} */
function alphabet(s) {
  const base = quadAlphabet(s).filter((m) => !(m.op === 'mul' && m.operand && vars(m.operand).length > 0));
  // Two legal moves that do not help ("Legal. Not closer."), so the wrong
  // taps are not only "/ x" and "x 0": "/ |k|" and "+ |k| x" for the x term
  // k x of a side that is that term alone.
  /** @type {Move[]} */
  const idle = [];
  for (const side of [s.lhs, s.rhs]) {
    const c = coeffs(side);
    if (!c || !isZero(c[0]) || !isZero(c[2]) || isZero(c[1]) || c[1].d !== 1n) continue;
    const k = abs(c[1]);
    if (k.n > 1n) idle.push({ op: 'div', operand: qNode(k) });
    idle.push({ op: sign(c[1]) > 0 ? 'add' : 'sub', operand: polyNode([ZERO, k, ZERO], X) });
  }
  const seen = new Set(base.map((m) => `${m.op} ${m.operand ? print(m.operand) : ''}`));
  return [...base, ...idle.filter((m) => !seen.has(`${m.op} ${m.operand ? print(m.operand) : ''}`))];
}

/** A chip that multiplies or divides by an expression with x is the Lost Root's. @param {Move} m */
function tag(m) {
  return (m.op === 'div' || m.op === 'mul') && m.operand && vars(m.operand).length > 0 ? LOST_ROOT : undefined;
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 3],
  interactions: ['cast'],
  alphabet,
  build(rng, opts) {
    const seed = rng.seed;
    const d = opts.difficulty;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const pr = r.fork('params');
      const k = BigInt(pr.pick([-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9]));
      const a = d === 1 ? 1n : BigInt(pr.int(2, 4)) * (d === 3 && pr.bool() ? -1n : 1n);
      const flip = d === 3 && pr.bool();
      if (k === a) return undefined; // root 1
      const sq = polyNode([ZERO, ZERO, q(a)], X);
      const lin = polyNode([ZERO, q(k), ZERO], X);
      const math = flip ? eq(lin, sq) : eq(sq, lin);
      const start = canonicalize(math);
      const s = solve(math, X);
      /** @type {SolutionSet} */
      const other = q(k, a);
      const key = { kind: 'finite', roots: other.n < 0n ? [fromQ(other), SZERO] : [SZERO, fromQ(other)] };
      if (!s || s.kind !== 'finite' || s.roots.length !== 2 || !s.roots.some((x) => seq(x, SZERO)) || !s.roots.some((x) => seq(x, fromQ(other)))) {
        throw new Error(`${GEN.id}: built roots are not the roots (seed ${JSON.stringify(seed)})`);
      }
      const cc = castChoices(r.fork('cast'), start, alphabet, isZeroSided, tag, (m) => tag(m) !== undefined);
      if (!cc) return undefined;
      /** @type {import('../../../types.d.ts').Step[]} */
      const path = [];
      let cur = start;
      for (const m of cc.moveGraph.minPath) { cur = step(m, cur); path.push({ line: cur, move: m, legal: true }); }
      if (path.length === 0) return undefined;
      const p = makeProblem(GEN, seed, opts, {
        variant: V_ONE_WAY,
        prompt: { verb: 'Cast', math: start, goal: 'Pick a move for both sides. Keep every solution.' },
        choices: cc.choices, moveGraph: cc.moveGraph,
        answer: { kind: 'solution-set', expected: key, formPredicates: [], assumptions: [] },
        variableKeys: [X], probes: probeEnvs([X]), visuals: ['balance'],
        // the worked solution: the line, then the shortest legal way to "one side is 0"
        steps: [{ line: math, legal: true }, ...path],
      });
      return separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
