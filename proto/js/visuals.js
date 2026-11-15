// @ts-check
// Procedural SVG as vnodes: the Knot, the Keeper, the Lantern number line, the Scale, and the
// "why?" representations. Positions use floats: display only, never a check.
import { s } from './vnode.js';
import { makeRng } from './rng.js';

/** @typedef {import('./vnode.js').VNode} VNode */

const SQRT = '\u221a';
const MINUS = '\u2212';

/** @param {number} x */
const f = (x) => (Math.round(x * 10) / 10).toString();

/** @param {[number, number][]} pts */
const poly = (pts) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

/**
 * The Knot: a faceted, angular shard cluster seeded by the problem id. No face.
 * @param {string} id @param {number} layers number of shells (term count)
 */
export function knotSvg(id, layers) {
  const rng = makeRng(`knot|${id}`);
  const rand = () => rng.u32() / 4294967296;
  /** @type {VNode[]} */
  const shells = [];
  for (let L = layers; L >= 1; L--) {
    const R = 26 + L * 24;
    const m = 5 + L * 2;
    const off = rand() * Math.PI * 2;
    /** @type {VNode[]} */
    const shards = [];
    for (let j = 0; j < m; j++) {
      const th = off + ((j + (rand() - 0.5) * 0.5) / m) * Math.PI * 2;
      const w = (Math.PI / m) * (0.55 + rand() * 0.35);
      const rin = R - 12 - rand() * 8;
      const rout = R + 6 + rand() * 12;
      const tip = rout + 4 + rand() * 10;
      /** @type {[number, number][]} */
      const pts = [
        [Math.cos(th - w) * rin, Math.sin(th - w) * rin * 0.78],
        [Math.cos(th - w * 0.6) * rout, Math.sin(th - w * 0.6) * rout * 0.78],
        [Math.cos(th + (rand() - 0.5) * w * 0.4) * tip, Math.sin(th) * tip * 0.78],
        [Math.cos(th + w * 0.7) * rout, Math.sin(th + w * 0.7) * rout * 0.78],
        [Math.cos(th + w) * rin, Math.sin(th + w) * rin * 0.78],
      ];
      shards.push(s('polygon', { points: poly(pts), class: 'shard' }));
    }
    shells.push(s('g', { class: `kshell kshell${L}`, style: `--d:${(layers - L) * 0.12}s` }, shards));
  }
  /** @type {[number, number][]} */
  const core = [];
  const k = 6 + (rng.u32() % 3);
  for (let i = 0; i < k; i++) {
    const th = (i / k) * Math.PI * 2 + rand() * 0.4;
    const rr = 18 + rand() * 12;
    core.push([Math.cos(th) * rr, Math.sin(th) * rr * 0.8]);
  }
  return s(
    'svg',
    { class: 'knot', viewBox: '-125 -95 250 190', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' },
    s('g', { class: 'kbody' }, shells, s('polygon', { class: 'kcore', points: poly(core) })),
  );
}

/** The Keeper: a hooded figure built from triangles. */
export function keeperSvg() {
  return s(
    'svg',
    { class: 'keeper', viewBox: '0 0 120 160', 'aria-hidden': 'true' },
    s('polygon', { class: 'kp', points: '60,8 92,70 28,70' }),
    s('polygon', { class: 'kp dim', points: '60,30 78,66 42,66' }),
    s('polygon', { class: 'kp', points: '28,70 92,70 104,150 16,150' }),
    s('polygon', { class: 'kp dim', points: '60,70 80,150 40,150' }),
    s('polygon', { class: 'lamp', points: '100,96 108,110 100,124 92,110' }),
    s('line', { class: 'kp', x1: '92', y1: '80', x2: '100', y2: '96' }),
  );
}

/** @param {number} lo @param {number} hi */
function ticks(lo, hi) {
  const span = hi - lo;
  const step = span <= 6 ? 1 : span <= 14 ? 2 : span <= 30 ? 5 : span <= 70 ? 10 : span <= 200 ? 25 : Math.pow(10, Math.floor(Math.log10(span)));
  /** @type {number[]} */
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}

/**
 * Lantern: a number line with the Knot's value and the student's value.
 * @param {{ x: number, label: string }[]} dots first = Knot
 * @param {boolean} same
 */
export function lanternSvg(dots, same) {
  const xs = dots.map((d) => d.x);
  let lo = Math.min(0, ...xs);
  let hi = Math.max(1, ...xs);
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  const X = (/** @type {number} */ v) => 18 + ((v - lo) / (hi - lo)) * 284;
  return s(
    'svg',
    { class: 'lantern', viewBox: '0 0 320 44', 'aria-hidden': 'true' },
    s('line', { class: 'nl', x1: '10', y1: '18', x2: '310', y2: '18' }),
    ticks(lo, hi).map((t) => [
      s('line', { class: 'tick', x1: f(X(t)), y1: '13', x2: f(X(t)), y2: '23' }),
      s('text', { class: 'tl', x: f(X(t)), y: '40', 'text-anchor': 'middle' }, t < 0 ? `${MINUS}${-t}` : `${t}`),
    ]),
    // colors are keyed to the legend rows under the line (cyan = Knot, amber = yours)
    dots.map((d, i) => s('circle', { class: i === 0 ? 'dot dk' : same ? 'dot dy same' : 'dot dy', cx: f(X(d.x)), cy: '18', r: i === 0 ? '7' : same ? '11' : '6' })),
  );
}

/**
 * Scale: a beam that tips toward the heavier side (sign of L - R).
 * @param {string} L @param {string} R @param {number} tilt -1, 0, 1
 */
export function scaleSvg(L, R, tilt) {
  const deg = -tilt * 11;
  return s(
    'svg',
    { class: `scale ${tilt === 0 ? 'level' : 'tipped'}`, viewBox: '0 -6 220 112', 'aria-hidden': 'true' },
    s('polygon', { class: 'fulcrum', points: '110,44 98,90 122,90' }),
    s(
      'g',
      { class: 'beam', style: `--tilt:${deg}deg` },
      s('line', { class: 'bar', x1: '22', y1: '44', x2: '198', y2: '44' }),
      s('polyline', { class: 'pan', points: '22,44 8,70 36,70 22,44' }),
      s('polyline', { class: 'pan', points: '198,44 184,70 212,70 198,44' }),
      s('text', { class: 'pv', x: '22', y: '88', 'text-anchor': 'middle' }, L),
      s('text', { class: 'pv', x: '198', y: '88', 'text-anchor': 'middle' }, R),
    ),
  );
}

/** Number-line jumps: n jumps of a/b from 0. @param {number} n @param {number} a @param {number} b */
export function jumpsSvg(n, a, b) {
  const end = (n * a) / b;
  const hi = Math.max(1, Math.ceil(end));
  const X = (/** @type {number} */ v) => 16 + (v / hi) * 288;
  /** @type {VNode[]} */
  const parts = [s('line', { class: 'nl', x1: '10', y1: '60', x2: '310', y2: '60' })];
  for (let i = 0; i <= hi * b; i++) {
    const v = i / b;
    const major = i % b === 0;
    parts.push(s('line', { class: major ? 'tick' : 'tick minor', x1: f(X(v)), y1: major ? '53' : '56', x2: f(X(v)), y2: major ? '67' : '64' }));
    if (major) parts.push(s('text', { class: 'tl', x: f(X(v)), y: '80', 'text-anchor': 'middle' }, `${i / b}`));
  }
  for (let j = 0; j < n; j++) {
    const x0 = X((j * a) / b);
    const x1 = X(((j + 1) * a) / b);
    const top = 60 - Math.min(34, 12 + (x1 - x0) * 0.4);
    parts.push(s('path', { class: 'jump', d: `M${f(x0)} 60 Q${f((x0 + x1) / 2)} ${f(top)} ${f(x1)} 60`, style: `--i:${j}` }));
  }
  parts.push(s('circle', { class: 'land', cx: f(X(end)), cy: '60', r: '5' }));
  return s('svg', { class: 'rep jumps', viewBox: '0 0 320 88', 'aria-hidden': 'true' }, parts);
}

/** Square plot: a square of area n has side sqrt(n). @param {number} n */
export function squareSvg(n) {
  const u = Math.min(28, 96 / Math.sqrt(n));
  const side = Math.sqrt(n) * u;
  const x0 = 60;
  const y0 = 108 - side;
  return s(
    'svg',
    { class: 'rep square', viewBox: '0 0 240 124', 'aria-hidden': 'true' },
    s('rect', { class: 'unit', x: '12', y: f(108 - u), width: f(u), height: f(u) }),
    s('text', { class: 'tl', x: f(12 + u / 2), y: '120', 'text-anchor': 'middle' }, '1'),
    s('rect', { class: 'sq', x: f(x0), y: f(y0), width: f(side), height: f(side) }),
    s('text', { class: 'sql', x: f(x0 + side / 2), y: f(y0 + side / 2 + 5), 'text-anchor': 'middle' }, `area ${n}`),
    s('text', { class: 'tl', x: f(x0 + side / 2), y: '120', 'text-anchor': 'middle' }, `side ${SQRT}${n}`),
    s('text', { class: 'tl', x: f(x0 + side + 6), y: f(y0 + side / 2 + 4) }, `${SQRT}${n}`),
  );
}

/** The coin: sqrt(n)/sqrt(n) = 1; the value stays put. @param {number} n @param {number} value */
export function coinSvg(n, value) {
  return s(
    'svg',
    { class: 'rep coin', viewBox: '0 0 240 96', 'aria-hidden': 'true' },
    s('polygon', { class: 'coinface', points: '48,8 84,22 92,58 64,88 30,86 8,56 14,22' }),
    s('text', { class: 'cf', x: '50', y: '42', 'text-anchor': 'middle' }, `${SQRT}${n}`),
    s('line', { class: 'cbar', x1: '30', y1: '50', x2: '70', y2: '50' }),
    s('text', { class: 'cf', x: '50', y: '72', 'text-anchor': 'middle' }, `${SQRT}${n}`),
    s('text', { class: 'cf', x: '112', y: '56' }, '= 1'),
    s('text', { class: 'tl', x: '108', y: '84' }, `value stays near ${value.toFixed(2)}`),
  );
}

/**
 * Balance before and after subtracting a whole side, at a true solution.
 * @param {{ x: string, before: string[], after: string[] }} rep
 */
export function balanceSvg(rep) {
  /** @param {number} ox @param {string} a @param {string} b @param {string} cap */
  const mini = (ox, a, b, cap) =>
    s(
      'g',
      { transform: `translate(${ox} 0)` },
      s('polygon', { class: 'fulcrum', points: '60,30 52,58 68,58' }),
      s('line', { class: 'bar', x1: '12', y1: '30', x2: '108', y2: '30' }),
      s('text', { class: 'pv', x: '12', y: '22', 'text-anchor': 'middle' }, a),
      s('text', { class: 'pv', x: '108', y: '22', 'text-anchor': 'middle' }, b),
      s('text', { class: 'tl', x: '60', y: '76', 'text-anchor': 'middle' }, cap),
    );
  return s(
    'svg',
    { class: 'rep balance', viewBox: '0 0 260 84', 'aria-hidden': 'true' },
    mini(4, rep.before[0], rep.before[1], `before, x = ${rep.x}`),
    mini(136, rep.after[0], rep.after[1], `after, x = ${rep.x}`),
  );
}
