// @ts-check
// Seeded deterministic PRNG: xmur3 string hash -> sfc32 generator.
// Pure: no Math.random, no Date. The output sequence for a given seed is part
// of the save format (Problem.seed must reproduce the same item forever), so
// test/gen/prng.test.js pins a golden sequence. Do not change the algorithm.

/** @typedef {import('../../types.d.ts').Rng} Rng */

const TWO32 = 4294967296;

/**
 * xmur3: string -> stream of uint32 seed words.
 * @param {string} str
 * @returns {() => number}
 */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/**
 * sfc32: four uint32 words of state -> uint32 stream.
 * @param {number} a @param {number} b @param {number} c @param {number} d
 * @returns {() => number}
 */
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
}

/**
 * @param {string} seed
 * @returns {Rng}
 */
export function makeRng(seed) {
  if (typeof seed !== 'string') throw new TypeError('makeRng: seed must be a string');
  const h = xmur3(seed);
  const raw = sfc32(h(), h(), h(), h());
  for (let i = 0; i < 12; i++) raw(); // warm-up: decorrelate similar seeds

  /** @type {Rng} */
  const rng = {
    seed,
    next: raw,
    int(lo, hi) {
      if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || lo > hi) {
        throw new RangeError(`rng.int: need safe integers lo <= hi, got ${lo}, ${hi}`);
      }
      const span = hi - lo + 1;
      if (span > TWO32) throw new RangeError('rng.int: range wider than 2^32');
      // Rejection sampling: unbiased for every span.
      const limit = TWO32 - (TWO32 % span);
      let x = raw();
      while (x >= limit) x = raw();
      return lo + (x % span);
    },
    pick(arr) {
      if (arr.length === 0) throw new RangeError('rng.pick: empty array');
      return arr[rng.int(0, arr.length - 1)];
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
      }
      return out;
    },
    bool(p = 0.5) {
      if (!(p >= 0 && p <= 1)) throw new RangeError(`rng.bool: p must be in [0, 1], got ${p}`);
      return raw() < p * TWO32;
    },
    fork(label) {
      if (typeof label !== 'string') throw new TypeError('rng.fork: label must be a string');
      return makeRng(`${seed}#fork:${label}`);
    },
  };
  return rng;
}
