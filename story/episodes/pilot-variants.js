// Fresh-number versions of each pilot lock, used by the lockout panel: after a
// wrong answer the reader must open one of these before the original lock will
// take another try. Wrong options are computed from the same slips as the
// originals. story/test/pilot.test.js checks every variant independently.
import { F, R, M, X2 } from './pilot.js';

const T = '&times;';
const int = (n) => (n < 0 ? `${M}${-n}` : `${n}`);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
/** Reduced fraction n/d (d > 0) as HTML. */
const frac = (n, d) => {
  const g = gcd(n, d);
  const [a, b] = [n / g, d / g];
  return b === 1 ? int(a) : `${a < 0 ? M : ''}${F(Math.abs(a), b)}`;
};
/** Drop wrong options that collide with an earlier one (same label or same value). */
const dedupe = (opts) => {
  const seen = new Set();
  return opts.filter((o) => {
    const keys = [o.html, o.num === undefined ? o.html : o.num.toFixed(6)];
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
};
const poly = (b, c) => `${X2} ${b < 0 ? M : '+'} ${Math.abs(b)}x ${c < 0 ? M : '+'} ${Math.abs(c)} = 0`;

export const variants = {
  cable: {
    params: [[3, 5], [5, 2], [7, 4], [2, 9]],
    make: ([n, d]) => ({
      ask: `${n} ${T} ${F(1, d)} = ?`,
      options: [
        { html: F(n, d), num: n / d, right: true },
        { html: F(n, n * d), num: 1 / d, slip: `Top and bottom both got multiplied by ${n}. That is multiplying by 1, so the amount did not change.` },
        { html: F(1, n * d), num: 1 / (n * d), slip: `Only the bottom got multiplied. That makes the pieces smaller: it divides.` },
        { html: `${n * d}`, num: n * d, slip: `That is how many of the fraction fit into ${n}: dividing, not multiplying.` },
        { html: `${n}${F(1, d)}`, num: n + 1 / d, slip: `Writing them side by side means plus, not times.` },
      ],
      worked: [`${n} ${T} ${F(1, d)} = ${F(`${n} ${T} 1`, d)}`, `= ${F(n, d)}`],
    }),
  },
  door: {
    // -a(x - b) = c, with a dividing c
    params: [[2, 6, 8], [3, 5, 6], [5, 1, 20], [2, 7, 4]],
    make: ([a, b, c]) => {
      const x = b - c / a;
      return {
        ask: `${M}${a}(x ${M} ${b}) = ${c}`,
        options: [
          { html: `x = ${int(x)}`, num: x, right: true },
          { html: `x = ${int(-(c / a + b))}`, num: -(c / a + b), slip: `Negative times negative is positive. Check the second product when you distribute.` },
          { html: `x = ${frac(-(c + b), a)}`, num: -(c + b) / a, slip: `The ${M}${a} multiplies both terms in the brackets, not just the x.` },
          { html: `x = ${int(-x)}`, num: -x, slip: `A minus sign went missing in the last division.` },
          { html: `x = ${int(b + c / a)}`, num: b + c / a, slip: `Dividing both sides by ${M}${a} should have made the right side negative.` },
        ],
        worked: [`${M}${a}x + ${a * b} = ${c}`, `${M}${a}x = ${int(c - a * b)}`, `x = ${int(x)}`],
      };
    },
  },
  elevator: {
    // kq + kp x = k x^2  ->  x^2 - p x - q = 0
    params: [[3, 2, 8], [2, 5, 6], [3, 3, 10], [4, 2, 15]],
    make: ([k, p, q]) => ({
      ask: `Rewrite <span class="nw">${k * q} + ${k * p}x = ${k}${X2}</span> in the form <span class="nw">${X2} + __x + __ = 0</span>`,
      options: [
        { html: poly(-p, -q), bc: [-p, -q], right: true },
        { html: poly(p, q), bc: [p, q], slip: `Terms crossed the equals sign without changing sign. Subtract them from both sides.` },
        { html: poly(-k * p, -k * q), bc: [-k * p, -k * q], slip: `Only the ${X2} term was divided by ${k}. Divide every term.` },
        { html: poly(-p, -k * q), bc: [-p, -k * q], slip: `The plain number was not divided by ${k}.` },
        { html: poly(-p, q), bc: [-p, q], slip: `One sign slipped. Both terms were subtracted, so both come out negative.` },
      ],
      worked: [`0 = ${k}${X2} ${M} ${k * p}x ${M} ${k * q}`, `0 = ${X2} ${M} ${p}x ${M} ${q}`, poly(-p, -q)],
    }),
  },
  dial: {
    // sqrt(s^2 m) = s sqrt(m)
    params: [[3, 2], [2, 3], [3, 5], [5, 3], [2, 7]],
    make: ([s, m]) => {
      const N = s * s * m;
      const opts = [
        { html: `${s}${R(m)}`, num: s * Math.sqrt(m), right: true },
        { html: `${s * s}${R(m)}`, num: s * s * Math.sqrt(m), slip: `The ${s * s} has to go through the root to come out: ${R(s * s)} is ${s}.` },
        { html: `${m}${R(s)}`, num: m * Math.sqrt(s), slip: `The wrong factor came out. The perfect square is the one that leaves.` },
        { html: `${s * m}`, num: s * m, slip: `The root sign fell off the ${m}, which has to stay under it.` },
      ];
      if (N % 2 === 0) opts.push({ html: `${N / 2}`, num: N / 2, slip: `A square root is not half. It asks what times itself gives ${N}.` });
      return {
        ask: `Simplify ${R(N)}`,
        options: opts,
        worked: [`${R(N)} = ${R(`${s * s} ${T} ${m}`)}`, `= ${R(s * s)} ${T} ${R(m)}`, `= ${s}${R(m)}`],
      };
    },
  },
  case: {
    // a / sqrt(m) = (a/m) sqrt(m), with m dividing a
    params: [[10, 2], [9, 3], [15, 5], [14, 7]],
    make: ([a, m]) => {
      const q = a / m;
      return {
        ask: `Rewrite ${F(a, R(m))} with no root on the bottom, fully simplified.`,
        options: [
          { html: `${q}${R(m)}`, num: q * Math.sqrt(m), right: true },
          { html: `${a}${R(m)}`, num: a * Math.sqrt(m), slip: `Only the top got multiplied, so the amount changed. Multiply by ${F(R(m), R(m))}, which is 1.` },
          { html: `${q}`, num: q, slip: `The ${R(m)} on the bottom was treated as a plain ${m}, or only the bottom got multiplied.` },
          { html: R(q), num: Math.sqrt(q), slip: `The ${a} was never under a root, so it cannot be pulled under one.` },
        ],
        worked: [`${F(a, R(m))} ${T} ${F(R(m), R(m))} = ${F(`${a}${R(m)}`, m)}`, `= ${q}${R(m)}`],
      };
    },
  },
};

/** The k-th lockout problem for a lock (cycles through its parameter sets). */
export function variant(pid, k) {
  const v = variants[pid];
  const params = v.params[k % v.params.length];
  const made = v.make(params);
  return { params, ...made, options: dedupe(made.options).map((o, i) => ({ id: `v${i}`, ...o })) };
}
