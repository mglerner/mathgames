// @ts-check
// Stub generators for M2's tests: they follow the Generator contract
// (types.d.ts) but carry no real math, because real generators do not exist
// yet. Each stub THROWS when asked for an interaction it does not declare or
// a difficulty outside its range, so every simulation also checks that the
// planner only ever asks generators for what they offer.

import { skills } from '../../src/data/skills.js';
import { expectConstructed } from '../../src/session/planner.js';

/** @typedef {import('../../types.d.ts').Generator} Generator */
/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Interaction} Interaction */
/** @typedef {import('../../types.d.ts').SkillDef} SkillDef */

/** @type {import('../../types.d.ts').Node} */
const ONE = { t: 'num', q: { n: 1n, d: 1n } };

/**
 * @param {string} id
 * @param {string} skill
 * @param {[number, number]} difficulty
 * @param {Interaction[]} interactions
 * @param {{ whyVariants?: string[] }} [o]
 * @returns {Generator}
 */
export function stubGenerator(id, skill, difficulty, interactions, o = {}) {
  const whyVariants = o.whyVariants ?? ['hidden-1'];
  return {
    id, version: 1, skill, difficulty, interactions,
    generate(rng, opts) {
      if (!interactions.includes(opts.interaction)) throw new Error(`${id}: interaction ${opts.interaction} not offered`);
      if (!(opts.difficulty >= difficulty[0] && opts.difficulty <= difficulty[1])) throw new Error(`${id}: difficulty ${opts.difficulty} out of range`);
      if (![0, 1, 2, 3].includes(opts.fadeLevel)) throw new Error(`${id}: bad fade ${opts.fadeLevel}`);
      const interaction = opts.interaction;
      const variant = interaction === 'why' ? rng.pick(whyVariants) : undefined;
      const constructed = expectConstructed(interaction, opts.fadeLevel);
      const nChoices = interaction === 'twin' ? 2 : 4;
      /** @type {Problem['choices']} */
      const choices = constructed ? undefined : Array.from({ length: nChoices }, (_, i) => ({
        id: `c${i}`, display: ONE,
        verdict: interaction === 'cast' ? (/** @type {const} */ (['progress', 'legal-idle', 'risky', 'illegal']))[i] : (i === 0 ? 'correct' : 'wrong'),
      }));
      return {
        id: `${id}:${rng.seed}`, gen: id, version: 1, seed: rng.seed, skill,
        difficulty: /** @type {1 | 2 | 3 | 4} */ (opts.difficulty), interaction, ...(variant ? { variant } : {}),
        constructed, fadeLevel: /** @type {0 | 1 | 2 | 3} */ (opts.fadeLevel),
        prompt: { verb: 'Solve', math: ONE }, assumptions: [], variableKeys: ['x'],
        ...(choices ? { choices } : {}),
        answer: { kind: 'expr', expected: ONE, formPredicates: [], assumptions: [] },
        visuals: opts.fadeLevel < 3 ? ['numberline'] : [], probes: [],
      };
    },
  };
}

/**
 * A full registry: one or two stubs per skill, with varied interaction sets
 * (every skill has predict, strike, a choice interaction and a Why).
 * @param {readonly SkillDef[]} [graph]
 * @returns {Generator[]}
 */
export function stubRegistry(graph = skills) {
  /** @type {Generator[]} */
  const out = [];
  for (const d of graph) {
    /** @type {Interaction[]} */
    const base = ['predict', 'strike', 'nextline', 'twin'];
    if (d.n % 2 === 0) base.push('forge');
    if (d.n % 3 === 0) base.push('trace');
    if (d.n % 4 === 0) base.push('cast');
    const hi = d.n % 7 === 0 ? 3 : 4;
    if (d.n % 5 === 0) {
      // split across two generators
      out.push(stubGenerator(`stub.${d.id}.a`, d.id, [1, hi], base.filter((i) => i !== 'strike')));
      out.push(stubGenerator(`stub.${d.id}.b`, d.id, [1, hi], ['strike', 'why'], { whyVariants: ['hidden-1', 'which-invariant'] }));
    } else {
      out.push(stubGenerator(`stub.${d.id}`, d.id, [1, hi], [...base, 'why']));
    }
  }
  return out;
}
