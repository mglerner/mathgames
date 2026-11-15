// @ts-check
// sqrt-squared d1: sqrt(n) x sqrt(n) for squarefree n. Strike only in the proto: the only proto
// mal-rule on this skill (18) yields one distractor, too few for an I2/I4 option set.
import { num, root, times } from '../ast.js';
import { q } from '../rational.js';
import { sq, seq, isSquarefree } from '../surd.js';
import { valueOf } from '../exact.js';
import { malrule } from '../malrules.js';
import { rejectionSample, skeleton } from './common.js';

export const ID = 'sqrtsq';
export const VERSION = 1;
export const SKILL = 'sqrt-squared';
export const INTERACTIONS = /** @type {const} */ (['strike']);

/**
 * @param {string} seed
 * @param {'strike'} [interaction]
 */
export function generate(seed, interaction = 'strike') {
  if (interaction !== 'strike') throw new Error(`${ID} supports strike only`);
  const { params: d } = rejectionSample(
    ID,
    seed,
    (r) => {
      const n = BigInt(r.int(2, 19));
      return isSquarefree(n) ? { n } : undefined;
    },
    (d) => {
      const ans = sq(q(d.n));
      const outs = malrule('root-square-overshoot').apply({ data: d, skill: SKILL, interaction: 'strike' });
      return outs.every((o) => !seq(valueOf(/** @type {any} */ (o)), ans));
    },
  );
  const math = times(root(num(d.n)), root(num(d.n)));
  return {
    ...skeleton({ gen: ID, version: VERSION, seed, skill: SKILL, interaction: 'strike' }, `sqrt${d.n}^2`),
    data: d,
    variableKeys: [],
    prompt: { verb: 'Evaluate', math, goal: ['Type the value.'] },
    answer: { kind: 'expr', value: sq(q(d.n)), display: num(d.n), form: 'integer' },
    visuals: ['lantern', 'square-plot'],
  };
}
