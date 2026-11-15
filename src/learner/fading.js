// @ts-check
// Fade levels and the live-controller triggers (DESIGN.md sections 2 and 6).
// The triggers live here, not in session/controller.js, because the reducer
// needs the low-rate trigger to replay its fade drop; the controller imports
// the same predicates, so game and replay can never disagree.
// All rate comparisons are exact integer arithmetic.

/** @typedef {import('../../types.d.ts').Attempt} Attempt */

/**
 * Fade level for a box: box 0 -> 0, 1 -> 1, 2 -> 2, 3+ -> 3.
 * @param {number} box
 * @returns {0 | 1 | 2 | 3}
 */
export function fadeForBox(box) {
  return /** @type {0 | 1 | 2 | 3} */ (box >= 3 ? 3 : box <= 0 ? 0 : box);
}

/**
 * Does this attempt count toward a first-try rate? Charting probes are
 * excluded (section 2), and so are answers that are not attempts at all
 * (unparsed) or that the judge could not verify.
 * @param {Attempt} a
 */
export function countsForRate(a) {
  return a.firstTry && a.context !== 'charting' && a.verdict !== 'unparsed' && a.verdict !== 'unverifiable';
}

/**
 * First-try counts over a list of attempts.
 * @param {readonly Attempt[]} attempts
 * @returns {{ n: number; k: number }} n items, k first-try correct
 */
export function firstTryStats(attempts) {
  let n = 0;
  let k = 0;
  for (const a of attempts) {
    if (!countsForRate(a)) continue;
    n++;
    if (a.verdict === 'correct') k++;
  }
  return { n, k };
}

export const TRIGGER_MIN_ITEMS = 6;

/**
 * "Below 65% after 6 or more items": next room is a higher-box review and
 * the fade level drops one step.
 * @param {readonly Attempt[]} sessionAttempts
 */
export function lowRateTrigger(sessionAttempts) {
  const { n, k } = firstTryStats(sessionAttempts);
  return n >= TRIGGER_MIN_ITEMS && 100 * k < 65 * n;
}

/**
 * "Above 90% over 6 items": one room is swapped for a harder variant.
 * Read as the session first-try rate once at least 6 items are in.
 * @param {readonly Attempt[]} sessionAttempts
 */
export function highRateTrigger(sessionAttempts) {
  const { n, k } = firstTryStats(sessionAttempts);
  return n >= TRIGGER_MIN_ITEMS && 10 * k > 9 * n;
}

/**
 * "Three wrong taps under 2 seconds each": the last three attempts (charting
 * excluded) are all wrong and each took under 2000 ms.
 * @param {readonly Attempt[]} sessionAttempts
 */
export function fastWrongTrigger(sessionAttempts) {
  const xs = sessionAttempts.filter((a) => a.context !== 'charting' && a.verdict !== 'unparsed');
  if (xs.length < 3) return false;
  return xs.slice(-3).every((a) => a.verdict === 'wrong' && a.ms < 2000);
}
