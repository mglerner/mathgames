// @ts-check
// Two small things shared across episodes:
//  1. A log of typed (no choices offered) answers per skill, and the mastery rule read from it.
//  2. A clock that only counts time while the page is actually on screen.

const LOG = 'story:skills:v1';
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
/** Local calendar day, e.g. 2026-11-15. */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** @typedef {{d: string, ok: boolean, ms: number, where: string}} Attempt */
/** @returns {Record<string, Attempt[]>} */
export function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG) || '{}') || {}; } catch { return {}; }
}
/** @param {string} skill @param {boolean} ok @param {number} ms @param {string} where */
export function recordAttempt(skill, ok, ms, where, day = today()) {
  const log = loadLog();
  (log[skill] = log[skill] || []).push({ d: day, ok, ms, where });
  try { localStorage.setItem(LOG, JSON.stringify(log)); } catch { /* private mode */ }
}

/**
 * The mastery rule. Only typed answers count, each one a first try on fresh numbers.
 *  mastered: at least 4 of the last 5 right, and those 5 span at least two different days
 *  fluent:   the last 3 are all right (what opening a floor lock takes)
 * @param {Attempt[]} [entries]
 */
export function status(entries = []) {
  if (!entries.length) return { code: 'none', text: 'no typed answers yet' };
  const last5 = entries.slice(-5);
  const right = last5.filter((e) => e.ok).length;
  const days = new Set(last5.map((e) => e.d)).size;
  if (last5.length === 5 && right >= 4 && days >= 2) return { code: 'mastered', text: `mastered (${right} of last 5 right, over ${days} days)` };
  if (last5.length === 5 && right >= 4) return { code: 'fluent', text: `fluent today (${right} of last 5 right; needs a right answer on another day to count as mastered)` };
  if (entries.length >= 3 && entries.slice(-3).every((e) => e.ok)) return { code: 'fluent', text: 'fluent today (last 3 right; needs more answers, on another day, to count as mastered)' };
  return { code: 'practicing', text: `not yet (${right} of last ${last5.length} right)` };
}

let acc = 0;
let since = Date.now();
const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (visible()) since = Date.now();
    else acc += Date.now() - since;
  });
}
/** Milliseconds this page has been on screen since it loaded. Switching apps or tabs stops the clock. */
export const visibleMs = () => acc + (visible() ? Date.now() - since : 0);
