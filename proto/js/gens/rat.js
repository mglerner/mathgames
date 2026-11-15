// @ts-check
// rationalize-denominator d1: k / sqrt(n), n squarefree. Answer (k/n) sqrt(n).
import { num, frac, root } from '../ast.js';
import { q } from '../rational.js';
import { seq, isSquarefree } from '../surd.js';
import { valueOf } from '../exact.js';
import { surdToNode } from '../build.js';
import { malrule } from '../malrules.js';
import { rejectionSample, shuffleChoices, skeleton } from './common.js';

export const ID = 'rat';
export const VERSION = 1;
export const SKILL = 'rationalize-denominator';
export const INTERACTIONS = /** @type {const} */ (['forge', 'strike']);

/** @param {bigint} k @param {bigint} n */
export const ratAnswer = (k, n) => ({ terms: [{ coef: q(k, n), rad: n }] });

/**
 * @param {string} seed
 * @param {'forge' | 'strike'} interaction
 */
export function generate(seed, interaction) {
  const { params: d, rng } = rejectionSample(
    ID,
    seed,
    (r) => {
      const n = BigInt(r.int(2, 11));
      const k = BigInt(r.int(1, 12));
      return isSquarefree(n) ? { k, n } : undefined;
    },
    (d) => {
      const ans = ratAnswer(d.k, d.n);
      const outs = ['one-part-coin', 'root-square-overshoot']
        .flatMap((id) => malrule(id).apply({ data: d, skill: SKILL, interaction: 'strike' }))
        .map((o) => valueOf(/** @type {any} */ (o)));
      if (outs.some((o) => seq(o, ans))) return false;
      for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) if (seq(outs[i], outs[j])) return false;
      return true;
    },
  );
  const { k, n } = d;
  const math = frac(num(k), root(num(n)));
  const value = ratAnswer(k, n);
  const p = {
    ...skeleton({ gen: ID, version: VERSION, seed, skill: SKILL, interaction }, `${k}/sqrt${n}`),
    data: d,
    variableKeys: [],
    answer: { kind: 'expr', value, display: surdToNode(value), form: 'radical-finished' },
    visuals: ['lantern', 'coin'],
  };
  if (interaction === 'forge') {
    const r = () => root(num(n));
    return {
      ...p,
      prompt: { verb: 'Forge', math, goal: ['Goal: no root in the denominator. Pick a coin.'] },
      choices: shuffleChoices(rng, [
        { display: frac(r(), r()), verdict: 'correct' },
        { display: frac(r(), num(1)), verdict: 'wrong', malrule: 'one-part-coin' },
        { display: frac(num(1), r()), verdict: 'wrong', malrule: 'one-part-coin' },
        { display: frac(num(n), num(n)), verdict: 'legal-idle' },
      ]),
    };
  }
  return {
    ...p,
    prompt: { verb: 'Rationalize', math, goal: ['No root in the denominator. Simplify.'] },
  };
}
