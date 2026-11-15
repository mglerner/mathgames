// @ts-check
// Skill graph v1 (DESIGN.md section 4): 40 A-priority skills + 1 B stretch = 41.
// Clusters are the section 8 Warden clusters. sliceGate carries the three
// deliberate slice deviations: at or below maxDifficulty, the skill is gated on
// sliceGate.pre instead of pre; above it, the full pre applies.
// Written once in M0; only the integrator edits it afterwards.

/** @typedef {import('../../types.d.ts').SkillDef} SkillDef */

/** Zone ids; also the directory names under src/gen/<zone>/. */
export const ZONES = Object.freeze(['mint', 'scales', 'stacks-roots', 'arch', 'ridge']);

/**
 * Warden cluster ids (section 8). 'none' is used only by the B-priority
 * stretch skill systems-linear, which belongs to no Warden.
 */
export const CLUSTERS = Object.freeze(['balance', 'mint', 'stack', 'root', 'factor', 'quadratic', 'ridge', 'none']);

/**
 * @param {number} n
 * @param {string} id
 * @param {string} zone
 * @param {string[]} pre
 * @param {'A' | 'B'} priority
 * @param {string} cluster
 * @param {boolean} slice
 * @param {{ maxDifficulty: number; pre: string[] }} [sliceGate]
 * @returns {SkillDef}
 */
function s(n, id, zone, pre, priority, cluster, slice, sliceGate) {
  /** @type {SkillDef} */
  const def = { n, id, zone, pre: /** @type {string[]} */ (Object.freeze(pre.slice())), priority, cluster, slice };
  if (sliceGate) {
    def.sliceGate = Object.freeze({ maxDifficulty: sliceGate.maxDifficulty, pre: /** @type {string[]} */ (Object.freeze(sliceGate.pre.slice())) });
  }
  return Object.freeze(def);
}

/** @type {readonly SkillDef[]} */
export const skills = Object.freeze([
  // Zone 1, the Mint
  s(1, 'frac-equivalence', 'mint', [], 'A', 'mint', true),
  s(2, 'frac-times-whole', 'mint', ['frac-equivalence'], 'A', 'mint', true),
  s(3, 'identity-moves', 'mint', ['frac-equivalence'], 'A', 'mint', true),
  s(4, 'frac-add-sub', 'mint', ['frac-equivalence', 'identity-moves'], 'A', 'mint', false),
  s(5, 'frac-mult-div', 'mint', ['frac-times-whole'], 'A', 'mint', false),
  s(6, 'signed-arith', 'mint', ['frac-add-sub'], 'A', 'mint', false),
  s(7, 'order-of-ops', 'mint', ['signed-arith'], 'A', 'mint', false),

  // Zone 2, the Scales
  s(8, 'equivalent-expressions', 'scales', ['identity-moves'], 'A', 'balance', true),
  s(9, 'distribute', 'scales', ['equivalent-expressions'], 'A', 'balance', true),
  s(10, 'combine-like-terms', 'scales', ['distribute'], 'A', 'factor', false),
  s(11, 'factor-gcf', 'scales', ['distribute'], 'A', 'factor', false),
  s(12, 'solution-meaning', 'scales', [], 'A', 'balance', true),
  s(13, 'balance-moves', 'scales', ['solution-meaning', 'identity-moves'], 'A', 'balance', true),
  s(14, 'solve-linear', 'scales', ['balance-moves', 'distribute'], 'A', 'balance', true),
  s(15, 'clear-fractions', 'scales', ['solve-linear', 'frac-add-sub'], 'A', 'ridge', false),
  s(16, 'literal-equations', 'scales', ['solve-linear'], 'A', 'ridge', false),

  // Zone 3, Stacks and Roots
  s(17, 'exp-meaning', 'stacks-roots', ['order-of-ops'], 'A', 'stack', false),
  s(18, 'exp-product-quotient', 'stacks-roots', ['exp-meaning'], 'A', 'stack', false),
  s(19, 'exp-power-rules', 'stacks-roots', ['exp-product-quotient'], 'A', 'stack', false),
  s(20, 'exp-zero-negative', 'stacks-roots', ['exp-product-quotient'], 'A', 'stack', false),
  s(21, 'sqrt-squared', 'stacks-roots', ['identity-moves'], 'A', 'root', true),
  s(22, 'square-roots', 'stacks-roots', ['exp-meaning'], 'A', 'root', false),
  s(23, 'sqrt-product-rule', 'stacks-roots', ['square-roots', 'exp-power-rules'], 'A', 'root', true,
    { maxDifficulty: 1, pre: ['sqrt-squared'] }),
  s(24, 'simplify-radicals', 'stacks-roots', ['sqrt-product-rule'], 'A', 'root', false),
  s(25, 'rationalize-denominator', 'stacks-roots', ['simplify-radicals', 'identity-moves', 'sqrt-squared'], 'A', 'root', true,
    { maxDifficulty: 1, pre: ['identity-moves', 'sqrt-squared'] }),
  s(26, 'rational-exponents', 'stacks-roots', ['exp-product-quotient', 'square-roots'], 'A', 'stack', false),

  // Zone 4, the Arch
  s(27, 'poly-add-sub', 'arch', ['combine-like-terms'], 'A', 'factor', false),
  s(28, 'poly-multiply', 'arch', ['distribute', 'exp-product-quotient'], 'A', 'factor', false),
  s(29, 'factor-monic', 'arch', ['poly-multiply', 'factor-gcf'], 'A', 'factor', false),
  s(30, 'factor-special', 'arch', ['factor-monic'], 'A', 'factor', false),
  s(31, 'factor-nonmonic', 'arch', ['factor-monic'], 'A', 'factor', false),
  s(32, 'quadratic-to-standard', 'arch', ['balance-moves', 'poly-add-sub'], 'A', 'quadratic', true,
    { maxDifficulty: 2, pre: ['balance-moves'] }),
  s(33, 'zero-product', 'arch', ['factor-monic', 'quadratic-to-standard'], 'A', 'quadratic', false),
  s(34, 'sqrt-method', 'arch', ['square-roots', 'simplify-radicals'], 'A', 'quadratic', false),
  s(35, 'complete-square', 'arch', ['sqrt-method', 'factor-special', 'identity-moves'], 'A', 'quadratic', false),
  s(36, 'quadratic-formula', 'arch', ['quadratic-to-standard', 'simplify-radicals'], 'A', 'quadratic', false),

  // Zone 5, the Ridge
  s(37, 'function-notation', 'ridge', ['order-of-ops', 'distribute'], 'A', 'ridge', false),
  s(38, 'slope-meaning', 'ridge', ['signed-arith', 'frac-mult-div'], 'A', 'ridge', false),
  s(39, 'linear-forms', 'ridge', ['slope-meaning', 'literal-equations'], 'A', 'ridge', false),
  s(40, 'graph-is-solutions', 'ridge', ['solution-meaning', 'function-notation'], 'A', 'ridge', false),
  s(41, 'systems-linear', 'ridge', ['solve-linear', 'balance-moves'], 'B', 'none', false),
]);

/** @type {ReadonlyMap<string, SkillDef>} */
export const skillById = new Map(skills.map((d) => [d.id, d]));
