// @ts-check
// frac-times-whole d1: n x a/b with a/b in lowest terms and n a/b not reducible.
import { num, frac, times } from '../ast.js';
import { q } from '../rational.js';
import { sq, seq } from '../surd.js';
import { valueOf } from '../exact.js';
import { malrule } from '../malrules.js';
import { rejectionSample, shuffleChoices, skeleton, bgcd } from './common.js';

export const ID = 'ftw';
export const VERSION = 1;
export const SKILL = 'frac-times-whole';
export const INTERACTIONS = /** @type {const} */ (['forge', 'nextline', 'strike']);

/** @param {{ n: bigint, a: bigint, b: bigint }} d */
const malData = (d) => ({ data: d, skill: SKILL, interaction: 'strike' });

/** @param {{ n: bigint, a: bigint, b: bigint }} d */
function accept(d) {
  const ans = sq(q(d.n * d.a, d.b));
  const outs = [
    ...malrule('scalar-times-both-parts').apply(malData(d)),
    ...malrule('scalar-into-denominator').apply(malData(d)),
  ].map((o) => valueOf(/** @type {any} */ (o)));
  if (outs.some((o) => seq(o, ans))) return false;
  for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) if (seq(outs[i], outs[j])) return false;
  // forge alphabet: n/1, n/n, 1/n must be three different values (n >= 2 guarantees it)
  return d.n >= 2n;
}

/**
 * @param {string} seed
 * @param {'forge' | 'nextline' | 'strike'} interaction
 */
export function generate(seed, interaction) {
  const { params: d, rng } = rejectionSample(
    ID,
    seed,
    (r) => {
      const n = BigInt(r.int(2, 9));
      const b = BigInt(r.int(2, 9));
      const a = BigInt(r.int(1, Number(b) - 1));
      if (bgcd(a, b) !== 1n || bgcd(n * a, b) !== 1n) return undefined;
      return { n, a, b };
    },
    accept,
  );
  const { n, a, b } = d;
  const math = times(num(n), frac(num(a), num(b)));
  const answerNode = frac(num(n * a), num(b));
  const p = {
    ...skeleton({ gen: ID, version: VERSION, seed, skill: SKILL, interaction }, `${n}x${a}/${b}`),
    data: d,
    variableKeys: [],
    answer: { kind: 'expr', value: sq(q(n * a, b)), display: answerNode, form: 'lowest-terms' },
    visuals: ['lantern', 'numberline-jumps'],
  };
  if (interaction === 'forge') {
    return {
      ...p,
      prompt: { verb: 'Forge', math, goal: [`Write `, { m: num(n) }, ` as a fraction with the same value.`] },
      choices: shuffleChoices(rng, [
        { display: frac(num(n), num(1)), verdict: 'correct' },
        { display: frac(num(n), num(n)), verdict: 'wrong', malrule: 'scalar-times-both-parts' },
        { display: frac(num(1), num(n)), verdict: 'wrong', malrule: 'scalar-into-denominator' },
      ]),
    };
  }
  if (interaction === 'nextline') {
    const pd = { ...p, interaction };
    return {
      ...p,
      prompt: { verb: 'Next line', math, move: ['Multiply: ', { m: math }] },
      choices: shuffleChoices(rng, [
        { display: answerNode, verdict: 'correct' },
        { display: malrule('scalar-times-both-parts').apply(pd)[0], verdict: 'wrong', malrule: 'scalar-times-both-parts' },
        { display: malrule('scalar-into-denominator').apply(pd)[0], verdict: 'wrong', malrule: 'scalar-into-denominator' },
      ]),
    };
  }
  return {
    ...p,
    prompt: { verb: 'Evaluate', math, goal: ['Type one fraction in lowest terms.'] },
  };
}
