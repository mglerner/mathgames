// @ts-check
import * as ftw from './ftw.js';
import * as sqrtsq from './sqrtsq.js';
import * as rat from './rat.js';
import * as quad from './quad.js';

/** @type {Record<string, { ID: string, VERSION: number, SKILL: string, INTERACTIONS: readonly string[], generate(seed: string, interaction: any): any }>} */
export const GENS = { ftw, sqrtsq, rat, quad };

/**
 * @param {string} gen @param {string} seed @param {string} interaction
 * @returns {any} Problem
 */
export function generate(gen, seed, interaction) {
  const g = GENS[gen];
  if (!g) throw new Error(`unknown generator ${gen}`);
  if (!g.INTERACTIONS.includes(interaction)) throw new Error(`${gen} has no ${interaction}`);
  return g.generate(seed, interaction);
}
