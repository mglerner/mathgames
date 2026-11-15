// The 13 generators this review (M1b) was written for, at commit d24ed03.
// The independent oracle (_oracle.js / _check.js) and bug models
// (_students.js / _eqbugs.js) are single-variable-x, solved-form-goal models
// that do not know the round-2 generators' shapes (exponent blanks, literal
// equations in several letters, coin-face Forge options, "clear every
// fraction" Cast goals, variable radicals, the Lantern Strike), so
// oracle-keys.test.js and tags.test.js are scoped to these ids. The 18
// round-2 generators are covered by their own independent reviews:
// test/adversarial/gen2-oracle-a/oracle.test.js (mint and scales) and
// test/adversarial/gen2-oracle-b/oracle.test.js (stacks-roots).
// Every failure the old oracle raised on the new generators was checked by
// hand on its failing seeds before scoping (integrator, 2026-11-13); the one
// real defect it found (clear-fractions Trace chains of 6 lines, section 3 I6
// says 3-5) was fixed in the generator and is now guarded in
// test/gen/harness.js for every generator.
export const M1B_IDS = new Set([
  'quadratic-to-standard.core', 'frac-equivalence.core', 'frac-times-whole.core', 'identity-moves.core',
  'balance-moves.core', 'balance-moves.one-way', 'distribute.core', 'equivalent-expressions.core',
  'solution-meaning.core', 'solve-linear.core', 'rationalize-denominator.core', 'sqrt-product-rule.core',
  'sqrt-squared.core',
]);
