// @ts-check
// Tiny property-test helper. forSeeds(n, fn) runs fn over n deterministic
// string seeds and, on the first failure, throws an Error naming the seed so
// the case can be replayed with makeRng(seed).

import { makeRng } from '../src/gen/prng.js';

/** @typedef {import('../types.d.ts').Rng} Rng */

/**
 * @param {number} n number of seeds
 * @param {(rng: Rng, seed: string) => (void | boolean)} fn
 *   fails if it throws or returns exactly false
 * @param {{ prefix?: string }} [opts] seeds are `${prefix}${i}`, default prefix 'p'
 * @returns {number} the number of seeds run
 */
export function forSeeds(n, fn, opts = {}) {
  const prefix = opts.prefix ?? 'p';
  for (let i = 0; i < n; i++) {
    const seed = `${prefix}${i}`;
    let ok;
    try {
      ok = fn(makeRng(seed), seed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`property failed at seed ${JSON.stringify(seed)}: ${msg}`, { cause: err });
    }
    if (ok === false) throw new Error(`property failed at seed ${JSON.stringify(seed)}: returned false`);
  }
  return n;
}
