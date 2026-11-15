// @ts-check
// Season logic (DESIGN.md section 8): tiers, EP totals, Warden and Gate
// eligibility, and the shard rule. Everything here is a pure function of the
// reducer's state (learner/model.js), so the game and the teacher view agree.

import { skills as ALL_SKILLS } from '../data/skills.js';
import { evidencePoints, isNonCountingWhy } from './mastery.js';

/** @typedef {import('../../types.d.ts').Attempt} Attempt */
/** @typedef {import('../../types.d.ts').SkillDef} SkillDef */

export const DEFAULT_SEASON_PARAMS = Object.freeze({
  /** EP that opens the Gate (tier 10) */
  gateEP: 100,
  /** day index (0 = first session day) at which the Gate opens anyway */
  gateDay: 65,
});

export const TIER_COUNT = 10;

/**
 * Shards for one attempt (section 8): 2 for a first-try correct answer or
 * Progress cast, 1 for a corrected one, 0 for "Legal. Not closer.", Risky,
 * form, wrong, unparsed, and the non-counting Why. A first-try answer in a
 * Fracture room pays double. Never negative.
 * @param {Attempt} a
 * @returns {number}
 */
export function shardsFor(a) {
  if (a.verdict !== 'correct') return 0;
  if (isNonCountingWhy(a.problem)) return 0;
  if (!a.firstTry) return 1;
  return a.context === 'fracture' ? 4 : 2;
}

/**
 * EP summed over A-priority skills (max 3 each, 120 total).
 * @param {{ skills: Record<string, { evidence: unknown[] }> }} state
 * @param {readonly SkillDef[]} [graph]
 */
export function epTotal(state, graph = ALL_SKILLS) {
  let t = 0;
  for (const def of graph) {
    if (def.priority !== 'A') continue;
    const sk = state.skills[def.id];
    if (sk) t += evidencePoints(/** @type {any} */ (sk));
  }
  return t;
}

/**
 * Tier t is reached at 10t EP; capped at 10.
 * @param {number} ep
 */
export function tierFor(ep) {
  return Math.min(TIER_COUNT, Math.floor(ep / 10));
}

/**
 * Day index relative to the first session (day 0), or undefined before any.
 * @param {{ firstDay: number | null }} state
 * @param {number} today
 */
export function seasonDay(state, today) {
  return state.firstDay === null ? undefined : today - state.firstDay;
}

/**
 * Gate status. Opens at gateEP; opens anyway on gateDay.
 * @param {{ skills: Record<string, any>; firstDay: number | null }} state
 * @param {number} today
 * @param {{ gateEP?: number; gateDay?: number }} [params]
 * @param {readonly SkillDef[]} [graph]
 * @returns {{ open: boolean; reason: 'ep' | 'day' | null; ep: number; tier: number }}
 */
export function gateStatus(state, today, params = {}, graph = ALL_SKILLS) {
  const p = { ...DEFAULT_SEASON_PARAMS, ...params };
  const ep = epTotal(state, graph);
  const tier = tierFor(ep);
  if (ep >= p.gateEP) return { open: true, reason: 'ep', ep, tier };
  const d = seasonDay(state, today);
  if (d !== undefined && d >= p.gateDay) return { open: true, reason: 'day', ep, tier };
  return { open: false, reason: null, ep, tier };
}

/**
 * Skill ids of a Warden cluster.
 * @param {string} cluster
 * @param {readonly SkillDef[]} [graph]
 */
export function clusterSkills(cluster, graph = ALL_SKILLS) {
  return graph.filter((d) => d.cluster === cluster).map((d) => d.id);
}

/**
 * A Warden is eligible when every skill in its cluster has 2 of 3 evidence
 * days. The 'none' cluster has no Warden.
 * @param {{ skills: Record<string, any> }} state
 * @param {string} cluster
 * @param {readonly SkillDef[]} [graph]
 */
export function wardenEligible(state, cluster, graph = ALL_SKILLS) {
  if (cluster === 'none') return false;
  const ids = clusterSkills(cluster, graph);
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const sk = state.skills[id];
    return sk !== undefined && evidencePoints(sk) >= 2;
  });
}

/**
 * Can the Warden of this cluster appear today? Eligible, not yet cleared,
 * and not in its 2-day retreat.
 * @param {{ skills: Record<string, any>; wardens: Record<string, { cleared: number | null; retreatUntil: number | null }> }} state
 * @param {string} cluster
 * @param {number} today
 * @param {readonly SkillDef[]} [graph]
 */
export function wardenAvailable(state, cluster, today, graph = ALL_SKILLS) {
  if (!wardenEligible(state, cluster, graph)) return false;
  const w = state.wardens[cluster];
  if (!w) return true;
  if (w.cleared !== null) return false;
  return w.retreatUntil === null || today >= w.retreatUntil;
}

/**
 * One summary object for the game and the teacher view.
 * @param {{ skills: Record<string, any>; firstDay: number | null; shards: number; wardens: Record<string, any> }} state
 * @param {number} today
 * @param {{ gateEP?: number; gateDay?: number }} [params]
 * @param {readonly SkillDef[]} [graph]
 */
export function seasonSummary(state, today, params = {}, graph = ALL_SKILLS) {
  const gate = gateStatus(state, today, params, graph);
  const clusters = [...new Set(graph.map((d) => d.cluster))].filter((c) => c !== 'none');
  /** @type {Record<string, { eligible: boolean; available: boolean; cleared: number | null }>} */
  const wardens = {};
  for (const c of clusters) {
    wardens[c] = {
      eligible: wardenEligible(state, c, graph),
      available: wardenAvailable(state, c, today, graph),
      cleared: state.wardens[c]?.cleared ?? null,
    };
  }
  return { ep: gate.ep, tier: gate.tier, gate, wardens, shards: state.shards, epMax: 3 * graph.filter((d) => d.priority === 'A').length };
}
