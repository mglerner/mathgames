// @ts-check
// Seeded PRNG: xmur3 string hash -> sfc32. Pure; no Math.random, no Date.

/**
 * @typedef {{ u32(): number, int(lo: number, hi: number): number,
 *   pick<T>(a: readonly T[]): T, shuffle<T>(a: readonly T[]): T[], bool(): boolean }} Rng
 */

/** @param {string} seed @returns {Rng} */
export function makeRng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const mix = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  let a = mix();
  let b = mix();
  let c = mix();
  let d = mix();
  function u32() {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  }
  for (let i = 0; i < 12; i++) u32();
  /** @type {Rng} */
  const rng = {
    u32,
    int(lo, hi) {
      return lo + (u32() % (hi - lo + 1));
    },
    pick(arr) {
      return arr[u32() % arr.length];
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = u32() % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    bool() {
      return (u32() & 1) === 1;
    },
  };
  return rng;
}
