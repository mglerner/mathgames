// @ts-check
// Live run controller (DESIGN.md sections 2 and 6). A pure state machine over
// one planned run: the caller asks nextItem(), plays it, and hands the item's
// FIRST-TRY attempt to recordAttempt(), which returns a new run. Retries on
// the same item are the game's business (they go to the event log, not here).
//
// It handles: Why follow-ups, Echoes (a fresh sibling at the start of the next
// room, at most 3 per run, never for probes), the three live triggers (each at
// most once per run), door choices, and the closer, which repeats with an
// easier item until one is won first-try, so a run never ends on a miss.
// After every change to the queue it re-applies the section 6 choice cap to
// the run as served (played items, Whys, Echoes and closer retries included)
// by turning queued choice items into constructed ones.

import { skills as ALL_SKILLS } from '../data/skills.js';
import { lowRateTrigger, highRateTrigger, fastWrongTrigger } from '../learner/fading.js';
import { makeContext, pickInteraction, rangeOf, predictedPct, enforceChoiceCap } from './planner.js';

/** @typedef {import('./planner.js').Plan} Plan */
/** @typedef {import('./planner.js').PlanItem} PlanItem */
/** @typedef {import('../../types.d.ts').Attempt} Attempt */
/** @typedef {import('../../types.d.ts').Generator} Generator */
/** @typedef {import('../../types.d.ts').SkillDef} SkillDef */
/** @typedef {import('../../types.d.ts').Rng} Rng */
/** @typedef {import('../learner/model.js').LearnerState} LearnerState */

export const MAX_ECHOES = 3;
/** A guard, not a design limit: the closer escalates to choice items, which any tapper eventually wins. */
export const MAX_CLOSER_TRIES = 500;

/**
 * @typedef {{
 *   plan: Plan; queue: PlanItem[]; played: { item: PlanItem; attempt: Attempt }[];
 *   attempts: Attempt[]; echoes: number; closerTries: number;
 *   fired: { low: boolean; high: boolean; fast: boolean };
 *   finished: boolean; endedOnWin: boolean; seq: number; log: string[];
 *   ctx: ReturnType<typeof makeContext>; rng: Rng;
 * }} Run
 */

/**
 * @param {Plan} plan
 * @param {{ state: LearnerState; registry: readonly Generator[]; rng: Rng; graph?: readonly SkillDef[] }} env
 * @returns {Run}
 */
export function startRun(plan, env) {
  const ctx = makeContext(env.state, env.registry, env.graph ?? ALL_SKILLS);
  /** @type {Run} */
  const run = {
    plan, queue: plan.items.map((x) => ({ ...x })), played: [], attempts: [], echoes: 0, closerTries: 0,
    fired: { low: false, high: false, fast: false }, finished: plan.items.length === 0, endedOnWin: false,
    seq: 0, log: [], ctx, rng: env.rng,
  };
  capQueue(run, run.queue);
  return run;
}

/**
 * Re-apply the choice cap (section 6) to the run as it will be served: the
 * played items (as generated) plus `queue`, which is mutated in place and
 * must hold this run's own copies.
 * @param {Run} r
 * @param {PlanItem[]} queue
 */
function capQueue(r, queue) {
  const extra = { choice: r.played.filter((p) => !p.attempt.problem.constructed).length, total: r.played.length };
  if (!enforceChoiceCap(r.ctx, queue, extra)) r.log.push('choice cap not met');
}


/**
 * @param {Run} run
 * @returns {PlanItem | undefined}
 */
export function nextItem(run) {
  return run.finished ? undefined : run.queue[0];
}

/**
 * Pick a door for a fork whose room has not started yet.
 * @param {Run} run
 * @param {number} forkIndex
 * @param {number} doorIndex
 * @returns {Run}
 */
export function chooseDoor(run, forkIndex, doorIndex) {
  const fork = run.plan.forks[forkIndex];
  if (!fork) throw new RangeError('chooseDoor: no such fork');
  const door = fork.doors[doorIndex];
  if (!door) throw new RangeError('chooseDoor: no such door');
  if (run.played.some((p) => p.item.room === fork.room)) throw new Error('chooseDoor: room already started');
  const at = run.queue.findIndex((x) => x.room === fork.room);
  if (at < 0) return run;
  const rest = run.queue.filter((x) => x.room !== fork.room).map((x) => ({ ...x }));
  const queue = [...rest.slice(0, at), ...door.items.map((x) => ({ ...x })), ...rest.slice(at)];
  const r = { ...run, queue, log: [...run.log] };
  capQueue(r, queue);
  return r;
}

const ROOMS = ['A', 'B', 'C', 'D'];

/**
 * Index range [start, end) of the next room (A-D) after the item at the head,
 * skipping Training Rooms (a trigger never cancels a skill's introduction).
 * @param {PlanItem[]} rest queue after the current item
 * @param {string} room the current room
 */
function nextRoomRange(rest, room) {
  const isTraining = (/** @type {string} */ l) => rest.some((x) => x.room === l && x.kind === 'training');
  const start = rest.findIndex((x) => ROOMS.includes(x.room) && x.room !== room && !isTraining(x.room));
  if (start < 0) return undefined;
  const label = rest[start].room;
  let end = start;
  while (end < rest.length && rest[end].room === label) end++;
  return { start, end, label };
}

/**
 * @param {Run} run
 * @param {string} label
 */
function seedFor(run, label) {
  return run.rng.fork(`${label}:${run.seq}`).seed;
}

/**
 * Hand the controller the first-try attempt for the item at the head.
 * @param {Run} run
 * @param {Attempt} attempt
 * @returns {Run}
 */
export function recordAttempt(run, attempt) {
  if (run.finished) throw new Error('recordAttempt: run is finished');
  const [cur, ...rest0] = run.queue;
  if (attempt.problem.skill !== cur.skill) throw new Error('recordAttempt: attempt is not for the current item');
  const r = { ...run, seq: run.seq + 1, played: [...run.played, { item: cur, attempt }], attempts: [...run.attempts, attempt], fired: { ...run.fired }, log: [...run.log] };
  let rest = rest0.map((x) => ({ ...x }));
  const ctx = r.ctx;
  const won = attempt.verdict === 'correct';
  const miss = attempt.verdict === 'wrong';

  if (cur.kind === 'closer') {
    r.closerTries++;
    if (won) {
      r.finished = rest.length === 0;
      r.endedOnWin = r.finished;
      r.queue = rest;
      return r;
    }
    if (r.closerTries >= MAX_CLOSER_TRIES) throw new Error('recordAttempt: closer never won');
    rest = [easierCloser(r, cur), ...rest];
    capQueue(r, rest);
    r.queue = rest;
    return r;
  }

  if (cur.whyAfter && cur.kind !== 'why') {
    const g = (ctx.bySkill.get(cur.skill) ?? []).find((x) => x.interactions.includes('why') && cur.difficulty >= x.difficulty[0] && cur.difficulty <= x.difficulty[1])
      ?? (ctx.bySkill.get(cur.skill) ?? []).find((x) => x.interactions.includes('why'));
    if (g) {
      const d = Math.max(g.difficulty[0], Math.min(g.difficulty[1], cur.difficulty));
      rest = [{ ...cur, kind: 'why', interaction: 'why', gen: g.id, difficulty: d, constructed: false, evidence: false, whyAfter: false, seed: seedFor(r, 'why'), workedExample: undefined }, ...rest];
    }
  }

  if (miss && cur.kind !== 'probe' && cur.kind !== 'why' && r.echoes < MAX_ECHOES) {
    const nr = nextRoomRange(rest, cur.room);
    const at = nr ? nr.start : Math.max(0, rest.findIndex((x) => x.kind === 'closer'));
    const label = nr ? nr.label : (rest[at]?.room ?? cur.room);
    rest.splice(at, 0, { ...cur, kind: 'echo', context: 'echo', evidence: false, whyAfter: false, room: label, seed: seedFor(r, 'echo'), workedExample: undefined, fadeLevel: Math.min(cur.fadeLevel, ctx.sk(cur.skill).fade) });
    r.echoes++;
  }

  const live = r.attempts;
  if (!r.fired.fast && fastWrongTrigger(live)) {
    const nr = nextRoomRange(rest, cur.room);
    if (nr) {
      r.fired.fast = true;
      r.log.push('fast-wrong: scaffolded training room');
      const keep = rest.slice(nr.start, nr.end).filter((x) => x.kind === 'echo' || x.kind === 'probe');
      rest.splice(nr.start, nr.end - nr.start, ...keep, ...scaffold(r, attempt.problem.skill, nr.label));
    }
  }
  if (!r.fired.low && lowRateTrigger(live)) {
    const nr = nextRoomRange(rest, cur.room);
    if (nr) {
      r.fired.low = true;
      r.log.push('low rate: higher-box review');
      const room = rest.slice(nr.start, nr.end);
      const reviews = reviewItems(r, room, cur);
      rest.splice(nr.start, nr.end - nr.start, ...reviews);
    }
  } else if (!r.fired.high && highRateTrigger(live)) {
    const nr = nextRoomRange(rest, cur.room);
    if (nr) {
      r.fired.high = true;
      r.log.push('high rate: harder room');
      for (let i = nr.start; i < nr.end; i++) {
        const x = rest[i];
        if (x.kind === 'probe' || x.kind === 'echo') continue;
        const d = x.difficulty + 1;
        const g = ctx.genFor(x.skill, x.interaction, d);
        if (d <= rangeOf(ctx, x.skill)[1] && g) rest[i] = { ...x, difficulty: d, gen: g.id, predicted: predictedPct(ctx.state, ctx.sk(x.skill).box, x.fadeLevel, d) };
      }
    }
  }

  capQueue(r, rest);
  r.queue = rest;
  r.finished = rest.length === 0;
  r.endedOnWin = r.finished && won;
  return r;
}

/**
 * Next closer after a miss: lower difficulty, then more visuals, then a
 * choice item with full visuals.
 * @param {Run} r
 * @param {PlanItem} c
 * @returns {PlanItem}
 */
function easierCloser(r, c) {
  const ctx = r.ctx;
  const [lo] = rangeOf(ctx, c.skill);
  const base = { ...c, seed: seedFor(r, 'closer'), whyAfter: false, evidence: false };
  if (c.difficulty > lo) {
    const g = ctx.genFor(c.skill, c.interaction, c.difficulty - 1);
    if (g) return { ...base, difficulty: c.difficulty - 1, gen: g.id };
  }
  if (c.fadeLevel > 0 && c.constructed) {
    const pick = pickInteraction(ctx, c.skill, true, ctx.sk(c.skill).box, c.fadeLevel - 1, c.difficulty, 0);
    if (pick) return { ...base, fadeLevel: c.fadeLevel - 1, ...pick };
  }
  const pick = pickInteraction(ctx, c.skill, false, 0, 0, lo, r.seq % 3);
  return pick ? { ...base, fadeLevel: 0, difficulty: lo, ...pick } : { ...base, difficulty: lo };
}

/**
 * Scaffolded Training Room on a skill: worked example, a choice item, then a
 * constructed response, all with full visuals.
 * @param {Run} r
 * @param {string} skill
 * @param {string} room
 * @returns {PlanItem[]}
 */
function scaffold(r, skill, room) {
  const ctx = r.ctx;
  const [lo] = rangeOf(ctx, skill);
  /** @type {PlanItem[]} */
  const out = [];
  for (const [i, wantCR] of [false, false, true].entries()) {
    const pick = pickInteraction(ctx, skill, wantCR, 0, 0, lo, i);
    if (!pick) continue;
    out.push({
      room, kind: 'training', skill, seed: seedFor(r, `scaffold${i}`), difficulty: lo, fadeLevel: 0,
      evidence: false, context: 'blocked', predicted: predictedPct(ctx.state, ctx.sk(skill).box, 0, lo), whyAfter: false,
      ...(i === 0 ? { workedExample: true } : {}), ...pick,
    });
  }
  return out;
}

/**
 * Higher-box review: the room's items become reviews on the highest-box seen
 * skills (not the current item's skill), one fade step easier, served as
 * choice items so a struggling session cannot cost a box. Probes and Echoes
 * stay.
 * @param {Run} r
 * @param {PlanItem[]} room
 * @param {PlanItem} cur
 * @returns {PlanItem[]}
 */
function reviewItems(r, room, cur) {
  const ctx = r.ctx;
  const pool = ctx.graph.filter((d) => ctx.sk(d.id).seen && ctx.range(d.id) && d.id !== cur.skill)
    .sort((a, b) => ctx.sk(b.id).box - ctx.sk(a.id).box || a.n - b.n).map((d) => d.id);
  let k = 0;
  return room.map((x, i) => {
    if (x.kind === 'probe' || x.kind === 'echo' || pool.length === 0) return x;
    const skill = pool[k++ % pool.length];
    const s = ctx.sk(skill);
    const fade = Math.max(0, s.fade - 1);
    const [lo] = rangeOf(ctx, skill);
    const pick = pickInteraction(ctx, skill, false, s.box, fade, lo, i);
    if (!pick) return x;
    return { ...x, kind: 'review', skill, evidence: false, fadeLevel: fade, difficulty: lo, seed: seedFor(r, `review${i}`), whyAfter: false, predicted: predictedPct(ctx.state, s.box, fade, lo), ...pick };
  });
}
