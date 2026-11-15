// @ts-check
// Seeded random ASTs for the renderer tests and gallery.html. Covers every
// Node kind, including shapes the parser never produces (negative and
// fractional literals, nested sums and products, groups anywhere, negations
// of negations), because generators build trees by hand.

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Rng} Rng */

/** Letters include s, q, r, t so a product can spell "sqrt". */
export const VAR_POOL = Object.freeze(['x', 'y', 'a', 'b', 's', 'q', 'r', 't', 'A', 'l', 'w', 'm']);

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }

/** @param {Rng} rng @returns {Node} */
export function randomLeaf(rng) {
  const k = rng.int(0, 9);
  if (k <= 3) return { t: 'num', q: { n: BigInt(rng.int(0, 12)), d: 1n } };
  if (k === 4) return { t: 'num', q: { n: BigInt(-rng.int(1, 12)), d: 1n } };
  if (k === 5) {
    const d = BigInt(rng.int(2, 7));
    let n = BigInt(rng.int(-9, 9));
    if (n === 0n) n = 1n;
    const g = gcd(n, d);
    if (d / g === 1n) return { t: 'num', q: { n: n / g, d: 1n } };
    return { t: 'num', q: { n: n / g, d: d / g } };
  }
  if (k === 6 && rng.bool(0.5)) return { t: 'num', q: { n: BigInt(rng.int(10, 999)), d: 1n } };
  return { t: 'var', name: rng.pick(VAR_POOL) };
}

/**
 * @param {Rng} rng
 * @param {number} depth remaining depth
 * @returns {Node}
 */
export function randomNode(rng, depth = 3) {
  if (depth <= 0 || rng.bool(0.22)) return randomLeaf(rng);
  const d = depth - 1;
  const k = rng.int(0, 15);
  if (k <= 2) return { t: 'add', args: Array.from({ length: rng.int(2, 3) }, () => randomNode(rng, d)) };
  if (k <= 5) return { t: 'mul', args: Array.from({ length: rng.int(2, 3) }, () => randomNode(rng, d)) };
  if (k <= 7) return { t: 'neg', arg: randomNode(rng, d) };
  if (k <= 9) return { t: 'frac', num: randomNode(rng, d), den: randomNode(rng, d) };
  if (k <= 11) {
    const e = rng.int(0, 5);
    /** @type {Node} */
    const exp = e <= 1 ? { t: 'num', q: { n: BigInt(rng.int(2, 3)), d: 1n } }
      : e === 2 ? { t: 'num', q: { n: BigInt(rng.pick([-1, 1, 3, -3])), d: 2n } }
      : e === 3 ? { t: 'neg', arg: { t: 'num', q: { n: BigInt(rng.int(1, 4)), d: 1n } } }
      : randomNode(rng, d - 1);
    return { t: 'pow', base: randomNode(rng, d), exp };
  }
  if (k <= 13) return { t: 'root', index: 2, radicand: randomNode(rng, d) };
  return { t: 'group', arg: randomNode(rng, d) };
}

/**
 * A Node (about 75%) or an Equation.
 * @param {Rng} rng
 * @param {number} [depth]
 * @returns {Node | Equation}
 */
export function randomMath(rng, depth = 3) {
  if (rng.bool(0.25)) return { t: 'eq', lhs: randomNode(rng, depth - 1), rhs: randomNode(rng, depth - 1) };
  return randomNode(rng, depth);
}

/**
 * Every Node in x with its data-path, in pre-order.
 * @param {Node | Equation} x
 * @returns {{ path: string; node: Node }[]}
 */
export function nodesWithPaths(x) {
  /** @type {{ path: string; node: Node }[]} */
  const out = [];
  /** @param {Node} n @param {string} p */
  const go = (n, p) => {
    out.push({ path: p, node: n });
    /** @type {Node[]} */
    let kids = [];
    switch (n.t) {
      case 'add': case 'mul': kids = n.args; break;
      case 'neg': case 'group': kids = [n.arg]; break;
      case 'frac': kids = [n.num, n.den]; break;
      case 'pow': kids = [n.base, n.exp]; break;
      case 'root': kids = [n.radicand]; break;
      default:
    }
    kids.forEach((c, i) => go(c, `${p}.${i}`));
  };
  if (x.t === 'eq') { go(x.lhs, 'l'); go(x.rhs, 'r'); } else go(x, 'e');
  return out;
}
