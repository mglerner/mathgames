// @ts-check
// Shared generator plumbing: rejection loop, choice ids, problem skeleton.
import { makeRng } from '../rng.js';

/** @typedef {import('../rng.js').Rng} Rng */
/** @typedef {'forge' | 'nextline' | 'strike'} Interaction */

export const MAX_TRIES = 400;
const IDS = ['a', 'b', 'c', 'd'];

/**
 * Draw parameters until `accept` passes. Parameters are drawn BEFORE anything that depends on
 * the interaction, so one seed gives the same math in every interaction.
 * @template T
 * @param {string} genId @param {string} seed
 * @param {(rng: Rng) => T | undefined} draw
 * @param {(params: T) => boolean} accept
 * @returns {{ params: T, rng: Rng }}
 */
export function rejectionSample(genId, seed, draw, accept) {
  const rng = makeRng(`${genId}|${seed}`);
  for (let i = 0; i < MAX_TRIES; i++) {
    const params = draw(rng);
    if (params !== undefined && accept(params)) return { params, rng };
  }
  throw new Error(`${genId}: no valid item for seed ${seed}`);
}

/**
 * @param {Rng} rng
 * @param {{ display: any, verdict: string, malrule?: string, [k: string]: any }[]} opts
 */
export function shuffleChoices(rng, opts) {
  return rng.shuffle(opts).map((o, i) => ({ id: IDS[i], ...o }));
}

/**
 * @param {{ gen: string, version: number, seed: string, skill: string, interaction: Interaction }} g
 * @param {string} key a canonical description of the math; Echo uses it to avoid repeats
 */
export function skeleton(g, key) {
  return {
    id: `${g.gen}:${g.seed}:${g.interaction}`,
    gen: g.gen,
    version: g.version,
    seed: g.seed,
    skill: g.skill,
    difficulty: 1,
    interaction: g.interaction,
    constructed: g.interaction === 'strike',
    fadeLevel: 0,
    key,
    assumptions: [],
    probes: [],
  };
}

/** @param {bigint} a @param {bigint} b */
export function bgcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a;
}
