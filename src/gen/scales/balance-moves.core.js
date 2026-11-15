// @ts-check
// balance-moves (skill 13, DESIGN.md section 4): the same invertible operation
// on both sides keeps the solutions. One-step and two-step linear equations
// with the variable on ONE side. The one-way moves ("/ x" loses a root) are
// the sibling generator balance-moves.one-way.js. Recipe: ../common.js.
//
// This file also exports the line helpers the other scales-b generators use
// (solve-linear.core, quadratic-to-standard.core, balance-moves.one-way):
// termMove, linearAlphabet, isSolvedLinear, linearChain, quadAlphabet,
// isZeroSided, castChoices, moveText, hiddenZeroStep. They are named exports
// of a generator file because every .js file in a zone directory is a
// generator (scripts/gen-registry.js); there is no shared helper slot.
//
// Difficulty (section 4 gives none for this skill; my reading, reported):
//   d1  x + b = d, the stated move adds or subtracts b. Root an integer in
//       -9..9, never 0 or 1.
//   d2  a x = d (move "/ a") or a x + b = d (move "- b"), a in +-2..9.
//   d3  a x + b = d with the move "/ a" on the whole side (the Slicer's
//       bait), or "- b"; sides may be swapped (d = a x + b).
//
// Interactions:
//   nextline  the stated move; candidates: the line, the Lopsider's line
//             (one side only), and the Carrier's (add / sub) or the
//             Peeler's and the Slicer's (divide).
//   predict   the same move, typed.
//   strike    "Solve", typed: the solution set.
//   cast      the chip alphabet linearAlphabet(): remove each term from both
//             sides, divide by the coefficient, plus "/ x" (risky) and "x 0"
//             (illegal). Verdicts and distances from moves/graph.js.
//   why       counting: 'hidden-0' (the zero-pair b - b that the move
//             added, in "3x + (5 - 5) = (11 - 5)") on items with a constant
//             term; 'hidden-1' (the a/a in "(3/3)x = 12/3") on a x = d.
// Every item carries the worked chain in `steps`.

import {
  defineGenerator, rejectionSample, makeProblem, separated, fitsAll, voteProofChoices, shuffledChoices,
  tapTargets, probeEnvs,
} from '../common.js';
import { num, v, add, mul, neg, frac, group, eq, vars, isEquation } from '../../math/ast.js';
import { q, ONE, ZERO, isZero, qeq, sign, abs, gcd } from '../../math/rational.js';
import { toPoly, coeffsIn } from '../../math/poly.js';
import { fromQ, toQ, seq } from '../../math/surd.js';
import { sameSolutions } from '../../math/equiv.js';
import { outputsOf } from '../../misc/diagnose.js';
import { print } from '../../math/print.js';
import { solve } from '../../math/solve.js';
import { applyMove, applyToSide } from '../../moves/apply.js';
import { canonicalize, step, chipVerdicts } from '../../moves/graph.js';
import { qNode, polyNode } from '../../misc/kit.js';
import lopsider from '../../misc/malrules/one-sided-operation.js';
import carrier from '../../misc/malrules/transpose-no-sign-change.js';
import peeler from '../../misc/malrules/transpose-coefficient-as-subtract.js';
import slicer from '../../misc/malrules/divide-one-term.js';

/** @typedef {import('../../../types.d.ts').Q} Q */
/** @typedef {import('../../../types.d.ts').Node} Node */
/** @typedef {import('../../../types.d.ts').Equation} Equation */
/** @typedef {import('../../../types.d.ts').Move} Move */
/** @typedef {import('../../../types.d.ts').Rng} Rng */
/** @typedef {import('../../../types.d.ts').Problem} Problem */
/** @typedef {import('../../../types.d.ts').Step} Step */
/** @typedef {import('../../../types.d.ts').Choice} Choice */
/** @typedef {import('../../../types.d.ts').SolutionSet} SolutionSet */
/** @typedef {import('../../misc/kit.js').MalRuleX} MalRuleX */
/** @typedef {import('../common.js').GenOpts} GenOpts */

/** The one variable of every scales-b item. */
export const X = 'x';

// ================================================================ shared line helpers

/** Coefficients [c0, c1, c2] of a side in x (padded), or undefined if it is not a polynomial in x of degree <= 2. @param {Node} side @returns {Q[] | undefined} */
export function coeffs(side) {
  const p = toPoly(side);
  const cs = p && coeffsIn(p, X);
  if (!cs || cs.length > 3) return undefined;
  return [cs[0] ?? ZERO, cs[1] ?? ZERO, cs[2] ?? ZERO];
}

/** The monomial c x^k as a display tree. @param {Q} c @param {number} k @returns {Node} */
export function mono(c, k) {
  /** @type {Q[]} */
  const cs = [ZERO, ZERO, ZERO];
  cs[k] = c;
  return polyNode(cs, X);
}

/**
 * The move that removes the term c x^k from the side holding it: "- 5" for
 * +5, "+ 4" for -4, "- 2x" for 2x. Operands are never negative.
 * @param {Q} c nonzero @param {number} k
 * @returns {Move}
 */
export function termMove(c, k) {
  return sign(c) > 0 ? { op: 'sub', operand: mono(c, k) } : { op: 'add', operand: mono(abs(c), k) };
}

/** "/ c" with c a number node. @param {Q} c @returns {Move} */
export function divMove(c) { return { op: 'div', operand: qNode(c) }; }

/** The two refused chips every alphabet carries: "/ x" (risky) and "x 0" (illegal). @returns {Move[]} */
function trapChips() { return [{ op: 'div', operand: v(X) }, { op: 'mul', operand: num(0) }]; }

/** @param {Move[]} ms @returns {Move[]} */
function dedupeMoves(ms) {
  const seen = new Set();
  return ms.filter((m) => {
    const k = `${m.op} ${m.operand ? print(m.operand) : ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * The chip alphabet of a linear state (section 3 I1): remove each term of
 * each side from both sides; when x is on one side only, divide by its
 * coefficient (if it is not 1); "/ x"; "x 0". At most 8 moves.
 * @param {Equation} state @returns {Move[]}
 */
export function linearAlphabet(state) {
  const L = coeffs(state.lhs);
  const R = coeffs(state.rhs);
  if (!L || !R || !isZero(L[2]) || !isZero(R[2])) return trapChips();
  /** @type {Move[]} */
  const out = [];
  for (const side of [L, R]) for (const k of [1, 0]) if (!isZero(side[k])) out.push(termMove(side[k], k));
  const xl = !isZero(L[1]);
  const xr = !isZero(R[1]);
  if (xl !== xr) {
    const c = xl ? L[1] : R[1];
    if (!qeq(c, ONE)) out.push(divMove(c));
  }
  return dedupeMoves([...out, ...trapChips()]);
}

/** Solved: x alone on one side and no x on the other, or no x at all (a true or false number line). @param {Equation} s */
export function isSolvedLinear(s) {
  const lv = vars(s.lhs).length > 0;
  const rv = vars(s.rhs).length > 0;
  if (!lv && !rv) return true;
  if (s.lhs.t === 'var' && !rv) return true;
  return s.rhs.t === 'var' && !lv;
}

/**
 * The next move of the standard linear solution: collect x on the side that
 * has it (the left when both do: remove the right's x term), then remove the
 * constant beside x, then divide by the coefficient.
 * @param {Equation} cur canonical @returns {Move | undefined}
 */
function nextLinearMove(cur) {
  const L = coeffs(cur.lhs);
  const R = coeffs(cur.rhs);
  if (!L || !R || !isZero(L[2]) || !isZero(R[2])) return undefined;
  if (!isZero(L[1]) && !isZero(R[1])) return termMove(R[1], 1);
  if (isZero(L[1]) && isZero(R[1])) return undefined;
  const S = isZero(L[1]) ? R : L;
  if (!isZero(S[0])) return termMove(S[0], 0);
  if (!qeq(S[1], ONE)) return divMove(S[1]);
  return undefined;
}

/**
 * The worked steps from a line to its solved form (the line itself not
 * included), every step a legal stated move; undefined if more than 4 moves
 * or the line is not linear.
 * @param {Equation} start canonical
 * @returns {Step[] | undefined}
 */
export function linearChain(start) {
  /** @type {Step[]} */
  const out = [];
  let cur = start;
  for (let i = 0; i < 4 && !isSolvedLinear(cur); i++) {
    const m = nextLinearMove(cur);
    if (!m) return undefined;
    cur = step(m, cur);
    out.push({ line: cur, move: m, legal: true });
  }
  return isSolvedLinear(cur) ? out : undefined;
}

/** The rules that model a wrong way of doing this stated move. @param {Move} m */
export const rulesFor = (m) => (m.op === 'div' ? [lopsider, peeler, slicer] : [lopsider, carrier]);

/** A line item at `prev` with move `m`, for the rules to read (they read only prompt and answer). @param {Equation} prev @param {Move} m @returns {Problem} */
function lineProblem(prev, m) {
  return /** @type {Problem} */ ({
    id: 'scratch', gen: 'scratch', version: 1, seed: '', skill: 'balance-moves', difficulty: 1, interaction: 'nextline',
    constructed: false, fadeLevel: 0, prompt: { verb: 'Next line', math: prev, move: m },
    assumptions: [], variableKeys: [X], visuals: [], probes: [],
    answer: { kind: 'equation-sides', expected: canonicalize(applyMove(m, prev)), formPredicates: [], assumptions: [] },
  });
}

/**
 * Every way of planting one bad line in a worked linear chain (Trace, I6):
 * each stated move of the chain, done each way a rule models (the
 * Lopsider's, Carrier's, Peeler's, Slicer's). Kept only when: the bad line
 * changes the solution set; exactly one rule gives it; the chain that
 * follows correctly from it ends on a whole-number root that is not 0 or 1
 * (a clean chain ends on a whole number, so a fraction on the last line
 * would announce the plant; 0 and 1 are the coincidence values of section
 * 3); no line repeats.
 * @param {Step[]} good the correct chain, first line included; steps made by a stated move carry it
 * @returns {Step[][]} each with one step { legal: false, malrule }
 */
export function plantedChains(good) {
  /** @type {Step[][]} */
  const cands = [];
  for (let j = 1; j < good.length; j++) {
    const m = good[j].move;
    if (!m) continue;
    const prev = /** @type {Equation} */ (good[j - 1].line);
    const lp = lineProblem(prev, m);
    /** @type {Map<string, { bad: Equation; rules: Set<string> }>} */
    const lines = new Map();
    for (const rule of rulesFor(m)) {
      for (const out of outputsOf(rule, lp)) {
        if (!isEquation(out)) continue;
        const bad = canonicalize(out);
        const k = print(bad);
        const e = lines.get(k) ?? { bad, rules: new Set() };
        e.rules.add(rule.id);
        lines.set(k, e);
      }
    }
    for (const { bad, rules } of lines.values()) {
      if (rules.size !== 1) continue;
      if (sameSolutions(prev, bad, X).equal !== false) continue;
      const end = solve(bad, X);
      if (!end || end.kind !== 'finite' || end.roots.length !== 1) continue;
      const root = toQ(end.roots[0]);
      if (!root || root.d !== 1n || root.n === 0n || root.n === 1n) continue;
      const rest = linearChain(bad);
      if (!rest) continue;
      /** @type {Step[]} */
      const steps = [...good.slice(0, j), { line: bad, move: m, legal: false, malrule: [...rules][0] }, ...rest];
      if (steps.some((st, i) => i > 0 && print(st.line) === print(steps[i - 1].line))) continue;
      cands.push(steps);
    }
  }
  return cands;
}

/** Is n literally the number 0? @param {Node} n */
function isZeroLit(n) { return n.t === 'num' && n.q.n === 0n; }

/** Quadratic solved-for-this-skill form: one side is literally 0 and the other has x. @param {Equation} s */
export function isZeroSided(s) {
  return (isZeroLit(s.lhs) && vars(s.rhs).length > 0) || (isZeroLit(s.rhs) && vars(s.lhs).length > 0);
}

/**
 * The chip alphabet of a quadratic state: remove each term from both sides;
 * subtract a whole side that has 2+ terms; divide by the gcd of every
 * coefficient (if it is not 1); "/ x"; "x 0". At most 12 moves.
 * @param {Equation} state @returns {Move[]}
 */
export function quadAlphabet(state) {
  const L = coeffs(state.lhs);
  const R = coeffs(state.rhs);
  if (!L || !R) return trapChips();
  /** @type {Move[]} */
  const out = [];
  for (const [side, cs] of /** @type {[Node, Q[]][]} */ ([[state.lhs, L], [state.rhs, R]])) {
    if (cs.filter((c) => !isZero(c)).length >= 2) out.push({ op: 'sub', operand: side });
    for (const k of [2, 1, 0]) if (!isZero(cs[k])) out.push(termMove(cs[k], k));
  }
  const all = [...L, ...R].filter((c) => !isZero(c));
  if (all.length > 0 && all.every((c) => c.d === 1n)) {
    const g = all.reduce((acc, c) => gcd(acc, c.n), 0n);
    if (g > 1n) out.push(divMove(q(g)));
  }
  return dedupeMoves([...out, ...trapChips()]);
}

/**
 * Chips shown beside the alphabet's so that a Cast has a "Legal. Not
 * closer." tap: each term of each side done the unhelpful way round ("+ 5"
 * where "- 5" removes the term). They are offered on the first state only;
 * the move search itself runs on the alphabet.
 * @param {Equation} state @returns {Move[]}
 */
export function idleDecoys(state) {
  const L = coeffs(state.lhs);
  const R = coeffs(state.rhs);
  if (!L || !R) return [];
  /** @type {Move[]} */
  const out = [];
  for (const side of [L, R]) {
    for (const k of [2, 1, 0]) {
      if (isZero(side[k])) continue;
      out.push(sign(side[k]) > 0 ? { op: 'add', operand: mono(side[k], k) } : { op: 'sub', operand: mono(abs(side[k]), k) });
    }
  }
  return dedupeMoves(out);
}

/** "x 0". @param {Move} m */
function isTimesZero(m) { return m.op === 'mul' && m.operand !== undefined && isZeroLit(m.operand); }
/** One of the two refused chips, "/ x" or "x 0". @param {Move} m */
function isTrap(m) { return isTimesZero(m) || (m.op === 'div' && m.operand !== undefined && m.operand.t === 'var'); }

/**
 * Cast choices on a canonical state: every chip of the alphabet is
 * classified and searched by chipVerdicts(); one progress chip plus up to 3
 * others, shuffled: a legal-idle chip when there is one, at most 2 progress
 * chips, at most one of "/ x" and "x 0" (and never "x 0" on an all-reals
 * line). undefined (reject) if the state is already solved, has
 * no path within 6, the search was capped, or no chip makes progress.
 * @param {Rng} r @param {Equation} start canonical
 * @param {(s: Equation) => Move[]} alphabet @param {(s: Equation) => boolean} isGoal
 * @param {(m: Move) => string | undefined} [tag] a mal-rule tag for a chip (one-way generators)
 * @param {(m: Move) => boolean} [mustShow] chips that are always among the 4 shown
 * @param {Move[]} [extra] chips offered on this state beside the alphabet's (idleDecoys)
 * @returns {{ choices: Choice[]; moveGraph: { distance: number; minPath: Move[] } } | undefined}
 */
export function castChoices(r, start, alphabet, isGoal, tag, mustShow, extra = []) {
  const cv = chipVerdicts(start, dedupeMoves([...alphabet(start), ...extra]), alphabet, isGoal);
  if (!cv || cv.distance === 0) return undefined;
  const prog = cv.chips.filter((c) => c.verdict === 'progress');
  if (prog.length === 0) return undefined;
  const first = r.pick(prog);
  // "x 0" on a line every number solves keeps the solution set: it is not
  // the Illegal move this chip stands for, so it is not offered there.
  const whole = solve(start, X);
  const chips = whole && whole.kind === 'all' ? cv.chips.filter((c) => !isTimesZero(c.move)) : cv.chips;
  const forced = chips.filter((c) => c !== first && mustShow !== undefined && mustShow(c.move));
  const pool = r.shuffle(chips.filter((c) => c !== first && !forced.includes(c)));
  const rest = forced.slice(0, 3);
  // A "Legal. Not closer." chip whenever the alphabet has one, then the
  // rest: at most 2 progress chips and at most one refused chip in all.
  const idle = pool.find((c) => c.verdict === 'legal-idle');
  if (idle && rest.length < 3) rest.push(idle);
  for (const c of pool) {
    if (rest.length >= 3) break;
    if (rest.includes(c)) continue;
    const shown = [first, ...rest];
    if (c.verdict === 'progress' && shown.filter((x) => x.verdict === 'progress').length >= 2) continue;
    if (isTrap(c.move) && shown.some((x) => isTrap(x.move))) continue;
    rest.push(c);
  }
  if (rest.length < 2) return undefined;
  const items = [first, ...rest].map((c) => {
    /** @type {Omit<Choice, 'id'>} */
    const o = { display: c.move, verdict: c.verdict };
    if (c.distance !== undefined) o.distance = c.distance;
    const t = tag ? tag(c.move) : undefined;
    if (t) o.malrule = t;
    return o;
  });
  return { choices: shuffledChoices(r, items), moveGraph: { distance: cv.distance, minPath: cv.minPath } };
}

/** The stated move in words (ASCII). @param {Move} m @returns {string} */
export function moveText(m) {
  const o = m.operand ? (m.operand.t === 'add' ? `(${print(m.operand)})` : print(m.operand)) : '';
  switch (m.op) {
    case 'add': return `Add ${o} to both sides.`;
    case 'sub': return `Subtract ${o} from both sides.`;
    case 'mul': return `Multiply both sides by ${o}.`;
    case 'div': return `Divide both sides by ${o}.`;
    default: return 'Do the move to both sides.';
  }
}

/**
 * The hidden-0 worked step of "remove the term c x^k": the side that held the
 * term shows it next to the added opposite, grouped (the zero-pair); the
 * other side shows the move done to it, with a second group that is not
 * worth 0. Returns the line and the data-paths
 * of the zero-pair and of the other targets.
 * @param {Equation} e the line before (as displayed)
 * @param {'l' | 'r'} where the side holding the term
 * @param {Q} c @param {number} k
 * @returns {{ line: Equation; zero: string; others: string[] } | undefined}
 */
export function hiddenZeroStep(e, where, c, k) {
  const m = termMove(c, k);
  const holder = where === 'l' ? e.lhs : e.rhs;
  const other = where === 'l' ? e.rhs : e.lhs;
  const C = coeffs(holder);
  if (!C || qeq(C[k], ZERO)) return undefined;
  // the holder side, in descending order, with the term replaced by (term - term)
  /** @type {Node[]} */
  const parts = [];
  let at = -1;
  for (const j of [2, 1, 0]) {
    if (isZero(C[j])) continue;
    if (j === k) {
      at = parts.length;
      const t = mono(C[j], j);
      const back = sign(c) > 0 ? neg(mono(c, k)) : mono(abs(c), k);
      parts.push(group(add(t, back)));
    } else parts.push(mono(C[j], j));
  }
  const held = parts.length === 1 ? parts[0] : add(...parts);
  // The other side with the move done to it, and a second bracket that is NOT
  // worth 0 (so "tap the only bracket" does not find the zero pair): its like
  // term with the moved term, "(5x - 2x) + 3"; with no like term, the whole
  // side, "(12 - 5)".
  const O = coeffs(other);
  if (!O) return undefined;
  const back = sign(c) > 0 ? neg(mono(c, k)) : mono(abs(c), k);
  /** @type {Node[]} */
  const oparts = [];
  let dat = -1;
  for (const j of [2, 1, 0]) {
    if (isZero(O[j])) continue;
    if (j === k) {
      if (qeq(O[j], c)) return undefined; // a second zero pair: two right targets
      dat = oparts.length;
      oparts.push(group(add(mono(O[j], j), back)));
    } else oparts.push(mono(O[j], j));
  }
  if (oparts.length === 0) return undefined;
  const moved = dat >= 0 ? (oparts.length === 1 ? oparts[0] : add(...oparts)) : group(add(...oparts, back));
  const line = where === 'l' ? eq(held, moved) : eq(moved, held);
  const o = where === 'l' ? 'r' : 'l';
  const zero = parts.length === 1 ? where : `${where}.${at}`;
  /** @type {string[]} */
  const others = [dat >= 0 && oparts.length > 1 ? `${o}.${dat}` : o];
  if (parts.length > 1) others.push(`${where}.${at === 0 ? 1 : 0}`);
  if (dat >= 0 && oparts.length > 1) others.push(`${o}.${dat === 0 ? 1 : 0}`);
  return { line, zero, others };
}

/** Is s exactly the one root x? @param {SolutionSet} s @param {Q} x */
export function isOnly(s, x) { return s.kind === 'finite' && s.roots.length === 1 && seq(s.roots[0], fromQ(x)); }

// ================================================================ balance-moves.core

const GEN = Object.freeze({ id: 'balance-moves.core', version: 1, skill: 'balance-moves' });

/** @typedef {{ a: bigint; b: bigint; root: bigint; flip: boolean; move: 'const' | 'div' }} Params */

/** @param {Rng} r @param {number} d @returns {Params | undefined} */
function draw(r, d) {
  const root = BigInt(r.int(-9, 9));
  if (root === 0n || root === 1n) return undefined;
  const nz = () => BigInt(r.pick([-9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  if (d === 1) {
    // The first equation items: a root in 2..9, and the constant beside x
    // negative on about 1 item in 3 (so most items have no negative number).
    const b1 = BigInt(r.int(1, 9));
    const root1 = BigInt(r.int(2, 9));
    if (root1 === b1) return undefined; // x - 9 = 0, or x + 9 = 18 (b = root is a tell)
    return { a: 1n, b: r.bool(0.35) ? -b1 : b1, root: root1, flip: false, move: 'const' };
  }
  const a = BigInt(r.pick([-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9]));
  if (d === 2) return r.bool() ? { a, b: 0n, root, flip: false, move: 'div' } : { a, b: nz(), root, flip: false, move: 'const' };
  return { a, b: nz(), root, flip: r.bool(), move: r.bool(0.6) ? 'div' : 'const' };
}

/**
 * @param {Rng} r @param {Params} P @param {GenOpts} opts @param {string} seed
 * @returns {Problem | undefined}
 */
function item(r, P, opts, seed) {
  const { a, b, root } = P;
  const d = a * root + b;
  const xSide = polyNode([q(b), q(a), ZERO], X);
  const math = P.flip ? eq(qNode(q(d)), xSide) : eq(xSide, qNode(q(d)));
  const start = canonicalize(math);
  const chain = linearChain(start);
  if (!chain) return undefined;
  /** @type {Step[]} */
  const steps = [{ line: math, legal: true }, ...chain];
  /** @type {SolutionSet} */
  const solved = { kind: 'finite', roots: [fromQ(q(root))] };
  const s = solve(math, X);
  if (!s || !isOnly(s, q(root))) throw new Error(`${GEN.id}: built root is not the root (seed ${JSON.stringify(seed)})`);
  const shared = { variableKeys: [X], probes: probeEnvs([X]), visuals: ['balance', 'zeropair'], steps };
  const solveKey = { kind: /** @type {const} */ ('solution-set'), expected: solved, formPredicates: [], assumptions: [] };

  /** @type {Move} */
  const move = P.move === 'div' ? divMove(q(a)) : termMove(q(b), 0);
  if (P.move === 'const' && b === 0n) return undefined;
  // "Divide both sides by a" with a constant beside x: only when it divides evenly.
  if (P.move === 'div' && b % a !== 0n && (opts.interaction === 'nextline' || opts.interaction === 'predict')) return undefined;

  switch (opts.interaction) {
    case 'strike':
      return makeProblem(GEN, seed, opts, { prompt: { verb: 'Solve', math, goal: 'Solve for x.' }, answer: solveKey, ...shared });
    case 'nextline': case 'predict': {
      const after = canonicalize(applyMove(move, math));
      const p = makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Next line', math, move, goal: moveText(move) },
        answer: { kind: 'equation-sides', expected: after, formPredicates: [], assumptions: [] },
        ...shared,
      });
      if (opts.interaction === 'predict') return p;
      const wrong = voteProofChoices(r.fork('wrong'), p, rulesFor(move));
      if (!wrong) return undefined;
      return { ...p, choices: shuffledChoices(r.fork('choices'), [{ display: after, verdict: 'correct' }, ...wrong]) };
    }
    case 'cast': {
      const cc = castChoices(r.fork('cast'), start, linearAlphabet, isSolvedLinear, undefined, undefined, idleDecoys(start));
      if (!cc) return undefined;
      return makeProblem(GEN, seed, opts, {
        prompt: { verb: 'Cast', math: start, goal: 'Pick a move for both sides.' },
        choices: cc.choices, moveGraph: cc.moveGraph, answer: solveKey, ...shared,
      });
    }
    case 'why': {
      if (b !== 0n) {
        const hz = hiddenZeroStep(math, P.flip ? 'r' : 'l', q(b), 0);
        if (!hz) return undefined;
        return makeProblem(GEN, seed, opts, {
          variant: 'hidden-0',
          prompt: { verb: 'Tap the hidden 0', math: hz.line, goal: `${moveText(termMove(q(b), 0))} Tap the 0 that was added.` },
          choices: tapTargets(hz.line, [hz.zero, ...hz.others].sort(), hz.zero),
          answer: { kind: 'expr', expected: num(0), formPredicates: [], assumptions: [] },
          ...shared,
        });
      }
      if (a < 0n) return undefined; // (-3/-3)x reads badly; the positive-a siblings carry this form
      // "(3/3)x = 12/3" or "12/3 = (3/3)x": two fractions, one of them worth 1.
      const one = mul(frac(num(a), num(a)), v(X));
      const quot = frac(num(d), num(a));
      if (d === a) return undefined;
      const xLeft = r.fork('why').bool();
      const line = xLeft ? eq(one, quot) : eq(quot, one);
      const xs = xLeft ? 'l' : 'r';
      const qs = xLeft ? 'r' : 'l';
      return makeProblem(GEN, seed, opts, {
        variant: 'hidden-1',
        prompt: { verb: 'Tap the hidden 1', math: line, goal: `${moveText(divMove(q(a)))} Tap the 1 that is left with x.` },
        choices: tapTargets(line, [`${xs}.0`, `${xs}.1`, qs, `${qs}.0`].sort(), `${xs}.0`),
        answer: { kind: 'expr', expected: num(1), formPredicates: [], assumptions: [] },
        ...shared,
        visuals: ['coin', 'balance'],
      });
    }
    default:
      return undefined;
  }
}

export default defineGenerator({
  ...GEN,
  difficulty: [1, 3],
  interactions: ['nextline', 'predict', 'strike', 'cast', 'why'],
  alphabet: linearAlphabet,
  build(rng, opts) {
    const seed = rng.seed;
    return rejectionSample(GEN.id, rng.fork('item'), (r) => {
      const P = draw(r.fork('params'), opts.difficulty);
      if (!P) return undefined;
      const p = item(r, P, opts, seed);
      return p && separated(p).ok && fitsAll(p) ? p : undefined;
    });
  },
});
