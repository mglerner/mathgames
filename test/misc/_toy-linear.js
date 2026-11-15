// @ts-check
// A TEST-ONLY toy generator (two-step linear equations a x + b = d) built
// with src/gen/common.js. It exists so that the harness's equation paths
// (side-wise judging, Cast verdicts and BFS, Trace chains) run on real items
// before the real solve-linear generator is written. Not shipped: it is not
// under src/gen, so the registry never sees it.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, malChoices, shuffledChoices, traceChoices, probeEnvs,
} from '../../src/gen/common.js';
import { num, v, add, mul, eq, vars } from '../../src/math/ast.js';
import { q } from '../../src/math/rational.js';
import { toPoly, coeffsIn } from '../../src/math/poly.js';
import { fromQ } from '../../src/math/surd.js';
import { applyMove } from '../../src/moves/apply.js';
import { canonicalize, chipVerdicts } from '../../src/moves/graph.js';
import { qNode } from '../../src/misc/kit.js';
import lopsider from '../../src/misc/malrules/one-sided-operation.js';
import carrier from '../../src/misc/malrules/transpose-no-sign-change.js';

/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Move} Move */
/** @typedef {import('../../types.d.ts').Step} Step */
/** @typedef {import('../../types.d.ts').Problem} Problem */

const GEN = Object.freeze({ id: 'solve-linear.toy', version: 1, skill: 'solve-linear' });

/** Solved form: x alone on the left, a number on the right. @param {Equation} s */
export function isGoal(s) { return s.lhs.t === 'var' && vars(s.rhs).length === 0; }

/** @param {Equation} state @returns {Move[]} */
export function alphabet(state) {
  const p = toPoly(state.lhs);
  const cs = p && coeffsIn(p, 'x');
  if (!cs) return [];
  /** @type {Move[]} */
  const out = [];
  const c0 = cs[0];
  const c1 = cs[1];
  if (c0 && c0.n !== 0n) out.push({ op: 'sub', operand: qNode(c0) }, { op: 'add', operand: qNode(c0) });
  if (c1 && !(c1.n === 1n && c1.d === 1n)) out.push({ op: 'div', operand: qNode(c1) });
  return out;
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 1],
  interactions: ['strike', 'predict', 'nextline', 'cast', 'trace'],
  alphabet,
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const pr = r.fork('params');
      const a = BigInt(pr.int(2, 6));
      const root = BigInt(pr.int(2, 9));
      const b = BigInt(pr.int(1, 9));
      const d = a * root + b;
      const math = eq(add(mul(num(a), v('x')), num(b)), num(d));
      const solved = { kind: /** @type {const} */ ('finite'), roots: [fromQ(q(root))] };
      const shared = { variableKeys: ['x'], probes: probeEnvs(['x']), visuals: ['balance'] };
      /** @type {Move} */
      const subB = { op: 'sub', operand: num(b) };
      /** @type {Move} */
      const divA = { op: 'div', operand: num(a) };
      const line1 = canonicalize(applyMove(subB, math));
      /** @type {Problem | undefined} */
      let p;
      if (opts.interaction === 'strike') {
        p = makeProblem(GEN, seed, opts, { prompt: { verb: 'Solve', math }, answer: { kind: 'solution-set', expected: solved, formPredicates: [], assumptions: [] }, ...shared });
      } else if (opts.interaction === 'predict' || opts.interaction === 'nextline') {
        p = makeProblem(GEN, seed, opts, {
          prompt: { verb: 'Next line', math, move: subB },
          answer: { kind: 'equation-sides', expected: line1, formPredicates: [], assumptions: [] }, ...shared,
        });
        if (opts.interaction === 'nextline') {
          const wrong = malChoices(p, [lopsider, carrier]);
          if (!wrong || wrong.length !== 2) return undefined;
          p = { ...p, choices: shuffledChoices(r.fork('choices'), [{ display: line1, verdict: 'correct' }, ...wrong]) };
        }
      } else if (opts.interaction === 'cast') {
        /** @type {Move[]} */
        const chips = [subB, divA, { op: 'add', operand: num(b) }, { op: 'div', operand: v('x') }, { op: 'mul', operand: num(0) }];
        const cv = chipVerdicts(math, chips, alphabet, isGoal);
        if (!cv) return undefined;
        p = makeProblem(GEN, seed, opts, {
          prompt: { verb: 'Cast', math },
          answer: { kind: 'solution-set', expected: solved, formPredicates: [], assumptions: [] },
          choices: shuffledChoices(r.fork('choices'), cv.chips.map((c) => ({
            display: c.move, verdict: c.verdict === 'progress' ? 'progress' : c.verdict,
            ...(c.verdict === 'progress' ? { distance: /** @type {number} */ (c.distance) } : {}),
          }))),
          moveGraph: { distance: cv.distance, minPath: cv.minPath }, ...shared,
        });
      } else {
        const stub = makeProblem(GEN, seed, { ...opts, interaction: 'predict' }, {
          prompt: { verb: 'Next line', math, move: subB },
          answer: { kind: 'equation-sides', expected: line1, formPredicates: [], assumptions: [] }, ...shared,
        });
        const bad = r.fork('trace').bool(0.66) ? /** @type {Equation | undefined} */ (carrier.apply(stub)) : undefined;
        const second = bad ?? line1;
        /** @type {Step[]} */
        const steps = [
          { line: math, legal: true },
          bad ? { line: bad, legal: false, malrule: carrier.id } : { line: line1, move: subB, legal: true },
          { line: canonicalize(applyMove(divA, second)), move: divA, legal: true },
        ];
        p = makeProblem(GEN, seed, opts, {
          prompt: { verb: 'Find the bad line', math },
          answer: { kind: 'solution-set', expected: solved, formPredicates: [], assumptions: [] },
          steps, choices: traceChoices(steps), ...shared,
        });
      }
      return separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
