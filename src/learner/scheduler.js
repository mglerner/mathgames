// @ts-check
// Leitner scheduler (DESIGN.md section 6). Pure. Time enters only as day
// numbers derived from event timestamps (dayOf) or an injected clock.

/** Leitner box intervals in days, by box 0..4. */
export const INTERVALS = Object.freeze([0, 1, 2, 4, 8]);
export const MAX_BOX = 4;

/**
 * Day number of an ISO-8601 timestamp: the calendar date written in its own
 * YYYY-MM-DD prefix, counted in days since 1970-01-01. The offset in the
 * string is deliberately NOT applied, so an event written with the local
 * offset ("2026-11-12T21:30:00-05:00") lands on the local calendar day.
 * Date.UTC is used only as calendar arithmetic; no clock is read.
 * @param {string} t
 * @returns {number}
 */
export function dayOf(t) {
  const d = tryDayOf(t);
  if (d === undefined) throw new RangeError(`dayOf: not an ISO date: ${JSON.stringify(t)}`);
  return d;
}

/**
 * dayOf that returns undefined instead of throwing (for untrusted synced
 * events). Requires a string with a YYYY-MM-DD prefix, month 01-12, day 01-31.
 * @param {unknown} t
 * @returns {number | undefined}
 */
export function tryDayOf(t) {
  if (typeof t !== 'string') return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return undefined;
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return undefined;
  return Date.UTC(Number(m[1]), mo - 1, da) / 86400000;
}

/**
 * @param {number} box
 * @returns {number}
 */
export function intervalOf(box) {
  return INTERVALS[Math.max(0, Math.min(MAX_BOX, box))];
}

/**
 * First day the skill is due, or undefined for a skill never reviewed.
 * @param {{ box: number; lastReviewDay: number | null }} sk
 * @returns {number | undefined}
 */
export function dueDay(sk) {
  if (sk.lastReviewDay === null) return undefined;
  return sk.lastReviewDay + intervalOf(sk.box);
}

/**
 * @param {{ seen: boolean; box: number; lastReviewDay: number | null }} sk
 * @param {number} today
 */
export function isDue(sk, today) {
  if (!sk.seen) return false;
  const d = dueDay(sk);
  return d !== undefined && today >= d;
}

/**
 * Days past the due day (0 on the due day, negative before it).
 * @param {{ box: number; lastReviewDay: number | null }} sk
 * @param {number} today
 */
export function overdueBy(sk, today) {
  const d = dueDay(sk);
  return d === undefined ? 0 : today - d;
}
