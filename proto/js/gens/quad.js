// @ts-check
// quadratic-to-standard d1: built backward from integer roots r1, r2 (not 0 or 1, distinct) and a
// leading coefficient; the three terms of a(x - r1)(x - r2) are split across the two sides.
// Moves terms only: no products to expand.
import { num, eq, add, group } from '../ast.js';
import { q, neg as qneg } from '../rational.js';
import { print } from '../print.js';
import { polyToNode } from '../build.js';
import { solveUpTo2, sameSet, polyOf } from '../exact.js';
import { malrule } from '../malrules.js';
import { rejectionSample, shuffleChoices, skeleton } from './common.js';

export const ID = 'quad';
export const VERSION = 1;
export const SKILL = 'quadratic-to-standard';
export const INTERACTIONS = /** @type {const} */ (['nextline', 'strike']);

/** @typedef {import('../rational.js').Q} Q */
/** @typedef {import('../ast.js').Node} Node */

/** @param {Q} c @param {number} k */
function mono(c, k) {
  /** @type {Q[]} */
  const a = [q(0), q(0), q(0)];
  a[k] = c;
  return polyToNode(a);
}

/** @param {Node[]} ts */
const side = (ts) => (ts.length === 1 ? ts[0] : add(...ts));

/**
 * @param {import('../rng.js').Rng} r
 */
function draw(r) {
  const pool = [-5, -4, -3, -2, -1, 2, 3, 4, 5];
  const r1 = r.pick(pool);
  const r2 = r.pick(pool);
  if (r1 === r2) return undefined;
  const a = r.pick([-3, -2, -1, 1, 2, 3]);
  const c2 = a;
  const c1 = -a * (r1 + r2);
  const c0 = a * r1 * r2;
  if (c1 === 0) return undefined;
  const pCoefs = [q(c0), q(c1), q(c2)];
  // which side each power's term sits on; L - R = P
  const onLeft = [r.bool(), r.bool(), r.bool()];
  if (onLeft.every(Boolean) || onLeft.every((b) => !b)) return undefined;
  /** @type {{ k: number, c: Q }[]} */
  const lt = [];
  /** @type {{ k: number, c: Q }[]} */
  const rt = [];
  for (let k = 0; k < 3; k++) (onLeft[k] ? lt : rt).push({ k, c: onLeft[k] ? pCoefs[k] : qneg(pCoefs[k]) });
  const L = side(r.shuffle(lt).map((t) => mono(t.c, t.k)));
  const R = side(r.shuffle(rt).map((t) => mono(t.c, t.k)));
  const sumCoefs = [0, 1, 2].map((k) => (onLeft[k] ? pCoefs[k] : qneg(pCoefs[k])));
  const subtractSide = r.bool() ? 'L' : 'R';
  const flip = r.bool();
  return {
    roots: [BigInt(Math.min(r1, r2)), BigInt(Math.max(r1, r2))],
    a: BigInt(a),
    L,
    R,
    pCoefs,
    sumCoefs,
    side: subtractSide,
    flip,
  };
}

/** @param {any} d */
function accept(d) {
  const P = polyOf(eq(d.L, d.R));
  const truth = /** @type {any} */ (solveUpTo2(P));
  const base = { data: d, skill: SKILL };
  const nl = { ...base, interaction: 'nextline' };
  const st = { ...base, interaction: 'strike' };
  const sets = (/** @type {any[]} */ eqs) => eqs.map((e) => solveUpTo2(polyOf(e)));
  const nlOuts = sets([...malrule('one-sided-operation').apply(nl), ...malrule('transpose-no-sign-change').apply(nl)]);
  const stOuts = sets(
    ['one-sided-operation', 'transpose-no-sign-change', 'copy-coefficients'].flatMap((id) => malrule(id).apply(st)),
  );
  if ([...nlOuts, ...stOuts].some((s) => !s || sameSet(s, truth))) return false;
  for (let i = 0; i < nlOuts.length; i++)
    for (let j = i + 1; j < nlOuts.length; j++) if (sameSet(/** @type {any} */ (nlOuts[i]), /** @type {any} */ (nlOuts[j]))) return false;
  return true;
}

/** @param {Q[]} c */
const negAll = (c) => c.map(qneg);

/**
 * @param {string} seed
 * @param {'nextline' | 'strike'} interaction
 */
export function generate(seed, interaction) {
  const { params: d, rng } = rejectionSample(ID, seed, draw, accept);
  const math = eq(d.L, d.R);
  // canonical answer: leading coefficient positive
  const canon = d.a < 0n ? negAll(d.pCoefs) : d.pCoefs;
  const p = {
    ...skeleton({ gen: ID, version: VERSION, seed, skill: SKILL, interaction }, print(math)),
    data: d,
    variableKeys: ['x'],
    visuals: ['scale', 'balance'],
  };
  if (interaction === 'nextline') {
    const S = d.side === 'L' ? d.L : d.R;
    // result of the stated move: S's side becomes 0, the other side loses S
    const otherMinusS = d.side === 'L' ? negAll(d.pCoefs) : d.pCoefs; // R - L, or L - R
    const orient = (/** @type {import('../ast.js').Equation} */ e) => (d.flip ? eq(e.rhs, e.lhs) : e);
    const correct = d.side === 'L' ? eq(num(0), polyToNode(otherMinusS)) : eq(polyToNode(otherMinusS), num(0));
    const pd = { ...p, interaction };
    return {
      ...p,
      prompt: { verb: 'Next line', math, move: ['Subtract ', { m: S.t === 'add' ? group(S) : S }, ' from both sides.'] },
      answer: { kind: 'equation-sides', subtract: S },
      choices: shuffleChoices(rng, [
        { display: orient(correct), verdict: 'correct' },
        { display: orient(/** @type {any} */ (malrule('one-sided-operation').apply(pd)[0])), verdict: 'wrong', malrule: 'one-sided-operation' },
        { display: orient(/** @type {any} */ (malrule('transpose-no-sign-change').apply(pd)[0])), verdict: 'wrong', malrule: 'transpose-no-sign-change' },
      ]),
    };
  }
  return {
    ...p,
    prompt: {
      verb: 'Rewrite',
      math,
      goal: ['Rewrite as ... = 0, powers in descending order. Either side may be the zero side.'],
    },
    answer: { kind: 'equation-multiple', display: eq(polyToNode(canon), num(0)), form: 'standard' },
  };
}
