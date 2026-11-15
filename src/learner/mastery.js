// @ts-check
// Evidence, counting Why, mastery and decay (DESIGN.md section 6). Pure.

import { dueDay, intervalOf } from './scheduler.js';

/** @typedef {import('../../types.d.ts').Attempt} Attempt */
/** @typedef {import('../../types.d.ts').Interaction} Interaction */

/** Tunable learner parameters. The reducer and planner both take these. */
export const DEFAULT_LEARNER_PARAMS = Object.freeze({
  /** minimum days between two evidence days on one skill */
  evidenceGap: 2,
});

export const EP_CAP = 3;
export const EVIDENCE_MIN_BOX = 2;

/**
 * Interactions that have a constructed-response form (section 3): I3, I8,
 * typed I4, the I6 repair (also reachable as the I7 repair). An attempt whose
 * interaction is not one of these never counts as constructed, whatever its
 * flag says, so a mislabelled choice item cannot move a box.
 */
export const CONSTRUCTED_INTERACTIONS = Object.freeze(new Set(/** @type {Interaction[]} */ (['predict', 'strike', 'forge', 'trace', 'why'])));

/**
 * Problem variants that make an I7 Why "counting" (hidden 1 / hidden 0 tap,
 * or a repair). The "which invariant?" form ('which-invariant', or a Why with
 * no variant) counts for nothing. CONTRACT for generator authors (M1b+).
 */
export const COUNTING_WHY_VARIANTS = Object.freeze(['hidden-1', 'hidden-0', 'repair']);

/** @param {Attempt['problem']} p */
export function isConstructed(p) {
  return p.constructed === true && CONSTRUCTED_INTERACTIONS.has(p.interaction);
}

/** @param {Attempt['problem']} p */
export function isCountingWhyForm(p) {
  if (p.interaction === 'why') return p.variant !== undefined && COUNTING_WHY_VARIANTS.includes(p.variant);
  if (p.interaction === 'trace') return p.variant === 'repair' && p.constructed === true;
  return false;
}

/** @param {Attempt['problem']} p */
export function isNonCountingWhy(p) {
  return p.interaction === 'why' && !isCountingWhyForm(p);
}

/** @param {Attempt} a */
export function cleanFirstTryCorrect(a) {
  return a.verdict === 'correct' && a.firstTry === true && a.hintsUsed === 0;
}

/**
 * @typedef {{ day: number; context: Attempt['context']; interaction: Interaction; variant?: string }} EvidenceDay
 */

/**
 * Last evidence day, or undefined.
 * @param {{ evidence: EvidenceDay[] }} sk
 */
export function lastEvidenceDay(sk) {
  return sk.evidence.length ? sk.evidence[sk.evidence.length - 1].day : undefined;
}

/**
 * Has the evidence gap passed (or is there no evidence yet)?
 * @param {{ evidence: EvidenceDay[] }} sk
 * @param {number} day
 * @param {number} gap
 */
export function gapPassed(sk, day, gap) {
  const last = lastEvidenceDay(sk);
  return last === undefined || day - last >= gap;
}

/**
 * Does this attempt earn an evidence day? Checked against the skill state
 * BEFORE the attempt's own box move.
 * @param {{ box: number; evidence: EvidenceDay[] }} sk
 * @param {Attempt} a
 * @param {number} day
 * @param {boolean} fresh the (gen, seed) pair was never seen before
 * @param {number} gap
 */
export function evidenceQualifies(sk, a, day, fresh, gap) {
  return a.evidence === true
    && a.context !== 'charting'
    && isConstructed(a.problem)
    && a.fadeLevel === 3
    && sk.box >= EVIDENCE_MIN_BOX
    && cleanFirstTryCorrect(a)
    && fresh
    && gapPassed(sk, day, gap);
}

/**
 * Evidence points for a skill (at most 3).
 * @param {{ evidence: EvidenceDay[] }} sk
 */
export function evidencePoints(sk) {
  return Math.min(EP_CAP, sk.evidence.length);
}

/**
 * The evidence part of mastery: 3 evidence days, at least one in a mixed
 * room or a boss, at least one an I8 Strike. Evidence days can keep accruing
 * past 3 (EP stays capped) so a skill whose first three missed the Strike or
 * mixed condition can still finish.
 * @param {{ evidence: EvidenceDay[] }} sk
 */
export function evidenceComplete(sk) {
  return sk.evidence.length >= EP_CAP
    && sk.evidence.some((e) => e.context === 'mixed' || e.context === 'boss')
    && sk.evidence.some((e) => e.interaction === 'strike');
}

/**
 * @param {{ evidence: EvidenceDay[]; countingWhy: boolean }} sk
 */
export function masteryMet(sk) {
  return evidenceComplete(sk) && sk.countingWhy;
}

/**
 * Decaying: mastered and overdue by more than 2 intervals, or missed since
 * mastery and not yet re-checked by a clean constructed response.
 * @param {{ mastered: boolean; missSinceMastery: boolean; box: number; lastReviewDay: number | null }} sk
 * @param {number} today
 */
export function isDecaying(sk, today) {
  if (!sk.mastered) return false;
  if (sk.missSinceMastery) return true;
  const d = dueDay(sk);
  return d !== undefined && today - d > 2 * intervalOf(sk.box);
}
