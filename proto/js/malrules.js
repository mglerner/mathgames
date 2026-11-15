// @ts-check
// The seven proto mal-rules (DESIGN.md section 5: 3, 4, 5, 8, 11, 18, 19), as executable
// functions. apply(problem) returns the wrong result(s) that the modelled bug produces on that
// item, as ASTs (some bugs have more than one faithful output, e.g. numerator-only vs
// denominator-only for the Half-Coin). An empty list means "does not apply to this item".
import { num, eq, frac, root, times, mul, group } from './ast.js';
import { polyToNode } from './build.js';
import { q } from './rational.js';

/** @typedef {import('./ast.js').Node} Node */
/** @typedef {import('./ast.js').Equation} Equation */
/** @typedef {string | { m: Node | Equation }} Seg */
/**
 * @typedef {{ id: string, n: number, haunt: string, standardTerm: string, skills: string[],
 *   interactions: string[], apply(p: any): (Node | Equation)[], script(p: any): Seg[] }} MalRule
 */

/** @param {any} p */
const quadOutputsBase = (p) => p.data;

/** @type {MalRule[]} */
export const MALRULES = [
  {
    id: 'one-sided-operation',
    n: 3,
    haunt: 'the Lopsider',
    standardTerm: 'operated on one side only',
    skills: ['quadratic-to-standard'],
    interactions: ['nextline', 'strike'],
    apply(p) {
      const { L, R, side } = quadOutputsBase(p);
      if (p.interaction === 'nextline') return [side === 'L' ? eq(num(0), R) : eq(L, num(0))];
      return [eq(num(0), R), eq(L, num(0))];
    },
    script: () => ['You changed one side only.'],
  },
  {
    id: 'one-part-coin',
    n: 4,
    haunt: 'the Half-Coin',
    standardTerm: 'multiplied only one part of the fraction',
    skills: ['rationalize-denominator'],
    interactions: ['forge', 'strike'],
    apply(p) {
      const { k, n } = p.data;
      // numerator only: k sqrt(n) / sqrt(n) -> k ; denominator only: k / (sqrt(n) sqrt(n)) -> k/n
      return [num(k), frac(num(k), num(n))];
    },
    script: () => ['That multiplier was not worth 1.'],
  },
  {
    id: 'scalar-times-both-parts',
    n: 5,
    haunt: 'the Stacker',
    standardTerm: 'multiplied numerator and denominator by the whole number',
    skills: ['frac-times-whole'],
    interactions: ['forge', 'nextline', 'strike'],
    apply(p) {
      const { n, a, b } = p.data;
      return [frac(num(n * a), num(n * b))];
    },
    script(p) {
      const { n, a, b } = p.data;
      return ['That is still ', { m: frac(num(a), num(b)) }, '. Multiplying by ', { m: frac(num(n), num(n)) }, ' moved nothing.'];
    },
  },
  {
    id: 'transpose-no-sign-change',
    n: 8,
    haunt: 'the Carrier',
    standardTerm: 'moved a term across without changing its sign',
    skills: ['quadratic-to-standard'],
    interactions: ['nextline', 'strike'],
    apply(p) {
      const { side, sumCoefs } = p.data;
      const sum = polyToNode(sumCoefs);
      if (p.interaction === 'nextline') return [side === 'L' ? eq(num(0), sum) : eq(sum, num(0))];
      return [eq(sum, num(0))];
    },
    script(p) {
      if (p.interaction === 'nextline') {
        const S = p.data.side === 'L' ? p.data.L : p.data.R;
        return ['You carried ', { m: S.t === 'add' ? group(S) : S }, ' across. Subtract it from both sides.'];
      }
      return ['You carried terms across without changing their signs.'];
    },
  },
  {
    id: 'copy-coefficients',
    n: 11,
    haunt: 'the Copyist',
    standardTerm: 'read a, b, c before one side was 0',
    skills: ['quadratic-to-standard'],
    interactions: ['strike'],
    apply(p) {
      // coefficients read straight off the unrearranged equation, with or without sign flips,
      // excluding the patterns that ARE the true standard form (or its negative)
      const { sumCoefs, pCoefs } = p.data;
      /** @type {Equation[]} */
      const out = [];
      for (let mask = 0; mask < 8; mask++) {
        const c = sumCoefs.map((/** @type {import('./rational.js').Q} */ x, /** @type {number} */ i) => {
          const abs = x.n < 0n ? -x.n : x.n;
          return q(mask & (1 << i) ? -abs : abs, x.d);
        });
        const same = c.every((x, i) => x.n === pCoefs[i].n && x.d === pCoefs[i].d);
        const opp = c.every((x, i) => x.n === -pCoefs[i].n && x.d === pCoefs[i].d);
        if (same || opp) continue;
        if (mask & 4) continue; // keep the x^2 coefficient positive: one representative per +/- pair
        out.push(eq(polyToNode(c), num(0)));
      }
      return out;
    },
    script: () => ['You copied coefficients. Subtract a whole side instead.'],
  },
  {
    id: 'root-square-overshoot',
    n: 18,
    haunt: 'the Overshoot',
    standardTerm: 'squared the radicand instead of undoing the root',
    skills: ['sqrt-squared', 'rationalize-denominator'],
    interactions: ['strike'],
    apply(p) {
      if (p.skill === 'sqrt-squared') return [num(p.data.n * p.data.n)];
      // k/sqrt(n) x sqrt(n)/sqrt(n) with sqrt(n) x sqrt(n) read as n^2: k sqrt(n) / n^2
      const { k, n } = p.data;
      return [frac(mul(num(k), root(num(n))), num(n * n))];
    },
    script(p) {
      const n = p.data.n;
      if (p.skill === 'sqrt-squared') return [{ m: root(num(n)) }, ' is the number whose square is ', { m: num(n) }, '.'];
      return [{ m: times(root(num(n)), root(num(n))) }, ' is ', { m: num(n) }, ', not ', { m: num(n * n) }, '.'];
    },
  },
  {
    id: 'scalar-into-denominator',
    n: 19,
    haunt: 'the Sinker',
    standardTerm: 'multiplied the denominator by the whole number',
    skills: ['frac-times-whole'],
    interactions: ['forge', 'nextline', 'strike'],
    apply(p) {
      const { n, a, b } = p.data;
      return [frac(num(a), num(n * b))];
    },
    script(p) {
      const n = p.data.n;
      return [{ m: num(n) }, ' is ', { m: frac(num(n), num(1)) }, '. It multiplies the numerator, not the denominator.'];
    },
  },
];

/** @param {string} id */
export const malrule = (id) => {
  const m = MALRULES.find((r) => r.id === id);
  if (!m) throw new Error(`unknown mal-rule ${id}`);
  return m;
};

/** Mal-rules that model a bug on this problem's skill and interaction. @param {any} p */
export const applicable = (p) => MALRULES.filter((m) => m.skills.includes(p.skill) && m.interactions.includes(p.interaction));
