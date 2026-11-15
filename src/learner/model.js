// @ts-check
// The learner model: one pure reducer over the event log (DESIGN.md section 6).
// The same code runs in the game and in the teacher view.
//
// Event data shapes this reducer reads (types.d.ts leaves Event.data unknown):
//   session-start  { id?: string, knots?: number }        id defaults to event.id
//   session-end    {}                                       closes the open session
//   attempt        Attempt (types.d.ts)
//   unlock         { skill: string }                        skill reaches 'learning'
//   placement      PlacementData (learner/charting.js)      Charting result
//   award          { kind: string, amount?: number }        kind 'shards' adds bonus shards
//                                                            (charms etc.); attempt shards are
//                                                            derived here, never sent as awards
//   report, paper-bridge, setting                           recorded counts only
// Attempts outside any open session go to an implicit per-day session. An
// open session is treated as abandoned (closed without an end time) when an
// attempt arrives on a later calendar day more than STALE_MS after the
// session's last event, so a crashed session cannot absorb later days.
// A non-charting attempt on an unseen skill unlocks it implicitly.
//
// Time comes only from event timestamps (scheduler.dayOf). replay() sorts by
// event id (ULIDs sort by time) and drops duplicate ids, because sync is a
// set union. reduce() also ignores an id it has already applied (state.applied),
// but it applies events in arrival order: an out-of-order arrival needs a full
// replay() to land in id order.
// A malformed event (not an object, no string id, or no parseable YYYY-MM-DD
// timestamp) is counted in state.rejected and skipped; it never throws.

import { skills as ALL_SKILLS } from '../data/skills.js';
import { MAX_BOX, isDue, tryDayOf } from './scheduler.js';
import { fadeForBox, lowRateTrigger } from './fading.js';
import {
  DEFAULT_LEARNER_PARAMS, evidenceQualifies, isConstructed, isCountingWhyForm, cleanFirstTryCorrect,
  masteryMet, isDecaying,
} from './mastery.js';
import { shardsFor } from './season.js';

/** @typedef {import('../../types.d.ts').Event} Event */
/** @typedef {import('../../types.d.ts').Attempt} Attempt */
/** @typedef {import('../../types.d.ts').SkillDef} SkillDef */
/** @typedef {import('./mastery.js').EvidenceDay} EvidenceDay */

/**
 * @typedef {{
 *   box: number; fade: number; seen: boolean; inferred: boolean; placed: boolean;
 *   unlockDay: number | null; lastReviewDay: number | null; lastMissDay: number | null;
 *   evidence: EvidenceDay[]; countingWhy: boolean;
 *   mastered: boolean; masteredDay: number | null; missSinceMastery: boolean;
 *   firstCRSession: string | null; downSession: string | null;
 * }} SkillState
 */
/**
 * @typedef {{
 *   key: string; day: number; startT: string; endT: string | null; lastT: string; knots: number;
 *   attempts: Attempt[]; lowFired: boolean; bossClusters: Record<string, boolean>;
 * }} SessionRec
 */
/**
 * @typedef {{
 *   skills: Record<string, SkillState>;
 *   sessions: SessionRec[];
 *   open: string | null;
 *   cells: Record<string, { n: number; k: number }>;
 *   shards: number;
 *   awards: { day: number; kind: string; amount: number }[];
 *   repairs: { skill: string; tag: string; day: number }[];
 *   charting: Record<string, { result: 'hit' | 'miss'; day: number; difficulty: number; branch: string }>;
 *   wardens: Record<string, { cleared: number | null; retreatUntil: number | null }>;
 *   misconceptions: Record<string, { day: number; skill: string; gen: string; seed: string; charting: boolean }[]>;
 *   seen: Record<string, true>;
 *   firstDay: number | null; lastDay: number | null;
 *   counts: Record<string, number>;
 *   rejected: number;
 *   applied: Record<string, true>;
 * }} LearnerState
 */
/** @typedef {{ graph?: readonly SkillDef[]; params?: { evidenceGap?: number } }} ReduceOpts */

/** @returns {SkillState} */
export function emptySkill() {
  return {
    box: 0, fade: 0, seen: false, inferred: false, placed: false,
    unlockDay: null, lastReviewDay: null, lastMissDay: null,
    evidence: [], countingWhy: false,
    mastered: false, masteredDay: null, missSinceMastery: false,
    firstCRSession: null, downSession: null,
  };
}

/**
 * @param {readonly SkillDef[]} [graph]
 * @returns {LearnerState}
 */
export function initialState(graph = ALL_SKILLS) {
  /** @type {Record<string, SkillState>} */
  const sk = {};
  for (const d of graph) sk[d.id] = emptySkill();
  return {
    skills: sk, sessions: [], open: null, cells: {}, shards: 0, awards: [], repairs: [],
    charting: {}, wardens: {}, misconceptions: {}, seen: {}, firstDay: null, lastDay: null,
    counts: {}, rejected: 0, applied: {},
  };
}

/** Key for the predicted-success cell. */
/** @param {number} box @param {number} fade @param {number} difficulty */
export function cellKey(box, fade, difficulty) {
  return `${box}|${fade}|${difficulty}`;
}

/**
 * @param {LearnerState} s
 * @param {string} skill
 * @param {number} day
 */
function unlock(s, skill, day) {
  const sk = s.skills[skill];
  if (!sk || sk.seen) return;
  sk.seen = true;
  sk.box = 0;
  sk.fade = 0;
  sk.unlockDay = day;
  sk.lastReviewDay = day;
}

/**
 * @param {LearnerState} s
 * @param {SessionRec} sess
 * @param {number} day
 */
function closeSession(s, sess, day) {
  for (const c of Object.keys(sess.bossClusters)) {
    const w = s.wardens[c] ?? (s.wardens[c] = { cleared: null, retreatUntil: null });
    if (w.cleared === null && !sess.bossClusters[c]) w.retreatUntil = day + 2;
  }
}

/**
 * @param {LearnerState} s
 * @param {string} key
 * @param {number} day
 * @param {string} t
 * @param {number} knots
 * @returns {SessionRec}
 */
function openSession(s, key, day, t, knots) {
  /** @type {SessionRec} */
  const rec = { key, day, startT: t, endT: null, lastT: t, knots, attempts: [], lowFired: false, bossClusters: {} };
  s.sessions.push(rec);
  s.open = key;
  return rec;
}

/**
 * @param {LearnerState} s
 * @param {number} day
 * @param {string} t
 */
function currentSession(s, day, t) {
  const last = s.sessions[s.sessions.length - 1];
  if (s.open !== null && last && last.key === s.open) {
    if (!isStale(last, day, t)) return last;
    abandon(s, last);
  }
  if (last && last.key.startsWith('implicit:') && last.day === day) return last;
  const sess = openSession(s, `implicit:${day}:${s.sessions.length}`, day, t, 10);
  s.open = null; // implicit sessions are never "open"; the next day starts another
  return sess;
}

/** An open session older than this, on an earlier calendar day, is abandoned. */
export const STALE_MS = 60 * 60 * 1000;

/**
 * Is an open session abandoned, as seen from an event on `day` at `t`? Only
 * when the event is on a later calendar day AND more than STALE_MS after the
 * session's last event (a run that crosses midnight stays one session). An
 * unparseable time counts as stale once the day has changed.
 * @param {SessionRec} sess
 * @param {number} day
 * @param {string} t
 */
function isStale(sess, day, t) {
  if (day <= sess.day) return false;
  const gap = Date.parse(t) - Date.parse(sess.lastT);
  return !(gap <= STALE_MS);
}

/**
 * Close an abandoned session. No end time is recorded (its length is unknown,
 * so knotsForRun leaves it out); the Warden retreat counts from its own day.
 * @param {LearnerState} s
 * @param {SessionRec} sess
 */
function abandon(s, sess) {
  closeSession(s, sess, sess.day);
  s.open = null;
}

/**
 * @param {any} a
 * @returns {a is Attempt}
 */
function isAttempt(a) {
  return a !== null && typeof a === 'object' && a.problem && typeof a.problem.skill === 'string'
    && typeof a.problem.gen === 'string' && typeof a.problem.seed === 'string'
    && typeof a.problem.interaction === 'string' && typeof a.verdict === 'string'
    && typeof a.firstTry === 'boolean';
}

/**
 * Apply one event to a draft state, in place.
 * @param {LearnerState} s
 * @param {Event} ev
 * @param {readonly SkillDef[]} graph
 * @param {number} gap
 */
function step(s, ev, graph, gap) {
  if (ev === null || typeof ev !== 'object' || typeof ev.id !== 'string') { s.rejected++; return; }
  if (s.applied[ev.id]) return; // sync is a set union: a re-delivered event is a no-op
  s.applied[ev.id] = true;
  const day = tryDayOf(ev.t);
  if (day === undefined) { s.rejected++; return; }
  if (s.firstDay === null && (ev.type === 'session-start' || ev.type === 'attempt')) s.firstDay = day;
  s.lastDay = s.lastDay === null ? day : Math.max(s.lastDay, day);
  s.counts[ev.type] = (s.counts[ev.type] ?? 0) + 1;
  const data = /** @type {any} */ (ev.data ?? {});

  switch (ev.type) {
    case 'session-start': {
      const last = s.sessions[s.sessions.length - 1];
      if (s.open !== null && last && last.key === s.open) {
        if (isStale(last, day, ev.t)) abandon(s, last);
        else { last.endT = ev.t; closeSession(s, last, day); }
      }
      const knots = Number.isInteger(data.knots) ? data.knots : 10;
      openSession(s, typeof data.id === 'string' ? data.id : ev.id, day, ev.t, knots);
      return;
    }
    case 'session-end': {
      const last = s.sessions[s.sessions.length - 1];
      if (s.open !== null && last && last.key === s.open) {
        last.endT = ev.t;
        closeSession(s, last, day);
        s.open = null;
      }
      return;
    }
    case 'unlock': {
      if (typeof data.skill === 'string') unlock(s, data.skill, day);
      return;
    }
    case 'award': {
      const amount = Number.isInteger(data.amount) && data.amount > 0 ? data.amount : 0;
      s.awards.push({ day, kind: String(data.kind ?? ''), amount });
      if (data.kind === 'shards') s.shards += amount;
      return;
    }
    case 'placement': {
      applyPlacement(s, data, day);
      return;
    }
    case 'attempt': {
      if (!isAttempt(data)) { s.rejected++; return; }
      applyAttempt(s, data, day, ev.t, graph, gap);
      return;
    }
    default:
      return;
  }
}

/**
 * @param {LearnerState} s
 * @param {any} p
 * @param {number} day
 */
function applyPlacement(s, p, day) {
  if (!p || typeof p.skill !== 'string' || !s.skills[p.skill]) { s.rejected++; return; }
  if (s.charting[p.skill]) return; // a skill is charted once
  const result = p.result === 'hit' ? 'hit' : 'miss';
  s.charting[p.skill] = { result, day, difficulty: Number(p.difficulty) || 0, branch: typeof p.branch === 'string' ? p.branch : p.skill };
  const sk = s.skills[p.skill];
  if (result !== 'hit' || sk.seen) return;
  sk.seen = true;
  sk.placed = true;
  sk.box = 3;
  sk.fade = fadeForBox(3);
  sk.unlockDay = day;
  sk.lastReviewDay = day;
  sk.evidence.push({ day, context: 'charting', interaction: 'strike' });
  for (const id of Array.isArray(p.inferred) ? p.inferred : []) {
    const o = s.skills[id];
    if (!o || o.seen || s.charting[id]) continue;
    o.seen = true;
    o.inferred = true;
    o.box = 2;
    o.fade = fadeForBox(2);
    o.unlockDay = day;
    o.lastReviewDay = day;
  }
}

/**
 * @param {LearnerState} s
 * @param {Attempt} a
 * @param {number} day
 * @param {string} t
 * @param {readonly SkillDef[]} graph
 * @param {number} gap
 */
function applyAttempt(s, a, day, t, graph, gap) {
  const sess = currentSession(s, day, t);
  const seedKey = `${a.problem.gen}|${a.problem.seed}`;
  const fresh = !s.seen[seedKey];
  s.seen[seedKey] = true;
  sess.attempts.push(a);
  sess.lastT = t;
  const charting = a.context === 'charting';

  // 'risky' counts too: the Lost Root (mal-rule 12) is only ever a risky Cast tap.
  // Same rule as isHit() in src/misc/diagnose.js.
  if ((a.verdict === 'wrong' || a.verdict === 'risky') && Array.isArray(a.misconceptions) && !a.ambiguous) {
    for (const tag of a.misconceptions) {
      (s.misconceptions[tag] ??= []).push({ day, skill: a.problem.skill, gen: a.problem.gen, seed: a.problem.seed, charting });
    }
  }

  s.shards += shardsFor(a);

  const sk = s.skills[a.problem.skill];
  if (!sk) { s.rejected++; return; }
  if (charting) return; // probes act only through placement events
  if (a.verdict === 'unparsed' || a.verdict === 'unverifiable') return;

  unlock(s, a.problem.skill, day);

  if (a.firstTry) {
    const key = cellKey(sk.box, a.fadeLevel, a.problem.difficulty);
    const c = s.cells[key] ?? (s.cells[key] = { n: 0, k: 0 });
    c.n++;
    if (a.verdict === 'correct') c.k++;
  }

  // Evidence and counting Why read the box BEFORE this attempt moves it.
  if (evidenceQualifies(sk, a, day, fresh, gap)) {
    sk.evidence.push({ day, context: a.context, interaction: a.problem.interaction, variant: a.problem.variant });
  }
  if (!sk.countingWhy && isCountingWhyForm(a.problem) && cleanFirstTryCorrect(a) && sk.box >= 1) {
    sk.countingWhy = true;
  }

  const miss = a.verdict === 'wrong';
  const cr = isConstructed(a.problem);
  if (miss) {
    sk.fade = Math.max(0, sk.fade - 1);
    sk.lastMissDay = day;
    if (sk.inferred) {
      // Charting rule (section 6): any miss on an inferred skill, choice or
      // constructed, sends it to box 1 and normal teaching. It counts as the
      // session's one drop.
      sk.box = Math.min(sk.box, 1);
      sk.fade = Math.min(sk.fade, fadeForBox(sk.box));
      sk.downSession = sess.key;
    }
    sk.inferred = false;
    if (sk.mastered) sk.missSinceMastery = true;
    if (Array.isArray(a.misconceptions) && a.misconceptions.length > 0 && !a.ambiguous) {
      for (const tag of a.misconceptions) {
        if (!s.repairs.some((r) => r.skill === a.problem.skill && r.tag === tag)) s.repairs.push({ skill: a.problem.skill, tag, day });
      }
    }
  }
  if (cr) {
    sk.lastReviewDay = day;
    if (sk.firstCRSession !== sess.key) {
      sk.firstCRSession = sess.key;
      if (cleanFirstTryCorrect(a) && fresh) {
        sk.box = Math.min(MAX_BOX, sk.box + 1);
        sk.fade = fadeForBox(sk.box);
        sk.inferred = false;
      }
    }
    if (miss && sk.downSession !== sess.key) {
      sk.downSession = sess.key;
      sk.box = Math.max(0, sk.box - 1);
      sk.fade = Math.min(sk.fade, fadeForBox(sk.box));
    }
    if (sk.mastered && cleanFirstTryCorrect(a)) sk.missSinceMastery = false;
  }
  if (a.verdict === 'correct' && a.firstTry) {
    s.repairs = s.repairs.filter((r) => r.skill !== a.problem.skill);
  }
  if (!sk.mastered && masteryMet(sk)) {
    sk.mastered = true;
    sk.masteredDay = day;
  }

  if (!sess.lowFired && lowRateTrigger(sess.attempts)) {
    sess.lowFired = true;
    const touched = new Set(sess.attempts.filter((x) => x.context !== 'charting').map((x) => x.problem.skill));
    for (const id of touched) {
      const o = s.skills[id];
      if (o) o.fade = Math.max(0, o.fade - 1);
    }
  }

  if (a.context === 'boss') {
    const def = graph.find((d) => d.id === a.problem.skill);
    if (def && def.cluster !== 'none') {
      const won = cr && a.verdict === 'correct';
      sess.bossClusters[def.cluster] = (sess.bossClusters[def.cluster] ?? false) || won;
      const w = s.wardens[def.cluster] ?? (s.wardens[def.cluster] = { cleared: null, retreatUntil: null });
      if (won && w.cleared === null) w.cleared = day;
    }
  }
}

/**
 * Deep copy of a state (for the single-step reduce()).
 * @param {LearnerState} s
 * @returns {LearnerState}
 */
function clone(s) {
  return structuredClone(s);
}

/**
 * Pure single step: returns a new state.
 * @param {LearnerState} state
 * @param {Event} event
 * @param {ReduceOpts} [opts]
 * @returns {LearnerState}
 */
export function reduce(state, event, opts = {}) {
  const graph = opts.graph ?? ALL_SKILLS;
  const gap = opts.params?.evidenceGap ?? DEFAULT_LEARNER_PARAMS.evidenceGap;
  const s = clone(state);
  step(s, event, graph, gap);
  return s;
}

/**
 * Derive the state from the whole log. Events are deduplicated by id and
 * applied in id order. The input array is not modified.
 * @param {readonly Event[]} events
 * @param {ReduceOpts} [opts]
 * @returns {LearnerState}
 */
export function replay(events, opts = {}) {
  const graph = opts.graph ?? ALL_SKILLS;
  const gap = opts.params?.evidenceGap ?? DEFAULT_LEARNER_PARAMS.evidenceGap;
  const seenIds = new Set();
  const evs = [];
  const s = initialState(graph);
  for (const e of events) {
    if (e === null || typeof e !== 'object' || typeof e.id !== 'string') { s.rejected++; continue; }
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    evs.push(e);
  }
  evs.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  for (const e of evs) step(s, e, graph, gap);
  return s;
}

/**
 * Displayed skill state (section 6).
 * @param {LearnerState} state
 * @param {string} id
 * @param {number} today day number (scheduler.dayOf)
 * @returns {'unseen' | 'learning' | 'due' | 'mastered' | 'decaying'}
 */
export function skillState(state, id, today) {
  const sk = state.skills[id];
  if (!sk || !sk.seen) return 'unseen';
  if (sk.mastered) return isDecaying(sk, today) ? 'decaying' : 'mastered';
  return isDue(sk, today) ? 'due' : 'learning';
}
