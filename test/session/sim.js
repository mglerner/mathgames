// @ts-check
// Whole-loop simulation driver for M2's tests: planner -> controller ->
// stub generator -> simulated student -> event log -> reducer, one run per
// play day. Everything is seeded; there is no Math.random and no Date.now.

import { makeRng } from '../../src/gen/prng.js';
import { skills } from '../../src/data/skills.js';
import { replay } from '../../src/learner/model.js';
import { placementFor } from '../../src/learner/charting.js';
import { epTotal } from '../../src/learner/season.js';
import { planRun } from '../../src/session/planner.js';
import { startRun, nextItem, recordAttempt, chooseDoor } from '../../src/session/controller.js';
import { dayOf } from '../../src/learner/scheduler.js';

/** @typedef {import('../../types.d.ts').Generator} Generator */
/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Attempt} Attempt */
/** @typedef {import('../../types.d.ts').Event} Event */
/** @typedef {import('../../types.d.ts').SkillDef} SkillDef */
/** @typedef {import('../../types.d.ts').Rng} Rng */
/** @typedef {import('../../src/session/planner.js').PlanItem} PlanItem */
/** @typedef {import('../../src/session/planner.js').Plan} Plan */

const TAGS = ['one-sided-operation', 'partial-distribution', 'sqrt-splits-sum', 'copy-coefficients'];

/** Day 0 is a Monday. @param {number} day */
export function isoDate(day) {
  const ms = Date.UTC(2026, 0, 5) + day * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * @typedef {(problem: Problem, item: PlanItem, rng: Rng, day: number) => { verdict: Attempt['verdict']; misconceptions?: string[]; ms?: number }} Student
 * `day` is the simulated day index (0 = first day).
 */

/**
 * A student who is right with probability p on every item (pProbe on probes).
 * @param {number} p
 * @param {number} [pProbe]
 * @returns {Student}
 */
export function accurateStudent(p, pProbe = p) {
  return (problem, item, rng) => {
    const ok = rng.bool(item.kind === 'probe' ? pProbe : p);
    if (ok) return { verdict: 'correct' };
    if (problem.interaction === 'cast') return { verdict: rng.pick(['wrong', 'legal-idle', 'risky']) };
    return { verdict: 'wrong', misconceptions: rng.bool(0.3) ? [rng.pick(TAGS)] : [] };
  };
}

/**
 * Parameters of the "realistic" learner: they have seen Algebra 1 but little of
 * it stuck. These are modelling GUESSES, not measurements of the real
 * learner; realistic.test.js reports how the outcome moves with them.
 *   pStart     first-try rate on a symbol-only d2 item of a skill the game
 *              has not taught yet (a per-skill value is drawn in
 *              pStart +- pSpread)
 *   pCeil      what that rate approaches with practice
 *   learnRate  share of the remaining gap closed by one practiced item
 *              (a probe, which has real feedback, closes probeShare of that)
 *   Forgetting: a skill keeps for `stability` days after its last practice,
 *              stability = baseStability * 2^(practice days - 1), capped at
 *              maxStability; past that, knowledge halves for every further
 *              `stability` days.
 *   Supports:  the planner's own section 6 guesses (fade +25/+15/+7/0,
 *              difficulty +5/0/-7/-14 points), +10 on a worked example, and
 *              on a choice item a blind guess among the choices when they do
 *              not know.
 *
 * FLATTERING BY CONSTRUCTION: at supportScale 1 this learner responds to
 * fade and difficulty with exactly the planner's own prior tables (planner.js
 * FADE_ADJ / DIFF_ADJ), so the planner's band-fill predictions are right for
 * them by design. The defaults of the four knobs below are also the optimistic
 * end of each; realistic-report.js `sensitivity` shows the other end.
 *   supportScale  how much the visuals (fade bonus) and a worked example
 *                 really help, as a multiple of what the planner assumes
 *   choiceLearns  learning from a choice item, as a share of a constructed one
 *   wrongLearns   learning from an item they got wrong, as a share of a right one
 *   prereqDrag    0..1: a skill's usable knowledge is capped at (mean
 *                 knowledge of its prerequisites) + (1 - prereqDrag); 0 = no
 *                 dependence on prerequisites
 * Still NOT modelled (would lower the outcome): fatigue; forgetting beyond
 * maxStability. Not modelled (would raise it): transfer between skills.
 */
export const REALISTIC = Object.freeze({
  pStart: 0.25, pSpread: 0.10, pCeil: 0.80, learnRate: 0.20, probeShare: 0.5,
  baseStability: 2, maxStability: 32,
  supportScale: 1, choiceLearns: 1, wrongLearns: 1, prereqDrag: 0,
});

// Same numbers as planner.js FADE_ADJ / DIFF_ADJ on purpose (see REALISTIC).
const FADE_BONUS = [0.25, 0.15, 0.07, 0];
/** @type {Record<number, number>} */
const DIFF_BONUS = { 1: 0.05, 2: 0, 3: -0.07, 4: -0.14 };

/**
 * A learner whose accuracy on a skill starts low, rises with practice and
 * decays when the skill is left alone too long. Stateful: make one per
 * simulated student. `knowledge(skill, day)` exposes the latent 0..1 level.
 * @param {string} seed
 * @param {Partial<typeof REALISTIC>} [params]
 * @param {readonly SkillDef[]} [graph] used only when prereqDrag > 0
 * @returns {Student & { knowledge: (skill: string, day: number) => number; pSymbolic: (skill: string, day: number) => number }}
 */
export function realisticStudent(seed, params = {}, graph = skills) {
  const q = { ...REALISTIC, ...params };
  const pre = new Map(graph.map((d) => [d.id, d.pre]));
  const init = makeRng(`${seed}:realistic`);
  /** @type {Map<string, { p0: number; k: number; last: number | null; days: number }>} */
  const mem = new Map();
  /** @param {string} skill */
  const rec = (skill) => {
    let m = mem.get(skill);
    if (!m) {
      // per-skill start, fixed by the seed and the skill id (not by play order)
      const u = init.fork(`p0:${skill}`).int(0, 1000) / 1000;
      m = { p0: q.pStart + (2 * u - 1) * q.pSpread, k: 0, last: null, days: 0 };
      mem.set(skill, m);
    }
    return m;
  };
  /** @param {{ k: number; last: number | null; days: number }} m @param {number} day */
  const decayed = (m, day) => {
    if (m.last === null) return m.k;
    const stab = Math.min(q.maxStability, q.baseStability * 2 ** Math.max(0, m.days - 1));
    const over = day - m.last - stab;
    return over > 0 ? m.k * 0.5 ** (over / stab) : m.k;
  };
  /** @param {string} skill @param {number} day */
  /** Latent knowledge after the prerequisite cap. @param {string} skill @param {number} day */
  const usable = (skill, day) => {
    let k = decayed(rec(skill), day);
    const ps = q.prereqDrag > 0 ? (pre.get(skill) ?? []) : [];
    if (ps.length) {
      const mean = ps.reduce((t, p) => t + decayed(rec(p), day), 0) / ps.length;
      k = Math.min(k, mean + (1 - q.prereqDrag));
    }
    return k;
  };
  /** @param {string} skill @param {number} day */
  const pSymbolic = (skill, day) => {
    const m = rec(skill);
    return m.p0 + (q.pCeil - m.p0) * usable(skill, day);
  };
  /** @type {any} */
  const student = (/** @type {Problem} */ problem, /** @type {PlanItem} */ item, /** @type {Rng} */ rng, /** @type {number} */ day) => {
    const m = rec(problem.skill);
    let p = pSymbolic(problem.skill, day) + q.supportScale * (FADE_BONUS[problem.fadeLevel] + (item.workedExample ? 0.10 : 0)) + (DIFF_BONUS[problem.difficulty] ?? 0);
    p = Math.max(0.03, Math.min(0.97, p));
    let ok = rng.bool(p);
    const cs = problem.choices ?? [];
    if (!ok && !problem.constructed && cs.length) {
      const c = rng.pick(cs); // does not know: taps one
      ok = c.verdict === 'correct' || c.verdict === 'progress';
    }
    // practice: the item is answered with real feedback either way
    const gain = q.learnRate * (item.kind === 'probe' ? q.probeShare : 1) * (problem.constructed ? 1 : q.choiceLearns) * (ok ? 1 : q.wrongLearns);
    const k = decayed(m, day);
    m.k = k + gain * (1 - k);
    if (m.last !== day) m.days++;
    m.last = day;
    if (ok) return { verdict: 'correct' };
    if (problem.interaction === 'cast') return { verdict: rng.pick(['wrong', 'legal-idle', 'risky']) };
    return { verdict: 'wrong', misconceptions: rng.bool(0.3) ? [rng.pick(TAGS)] : [] };
  };
  student.knowledge = (/** @type {string} */ skill, /** @type {number} */ day) => decayed(rec(skill), day);
  student.pSymbolic = pSymbolic;
  return student;
}

/**
 * Weekdays only, each one skipped with probability `miss` (fixed by the seed).
 * @param {string} seed
 * @param {number} miss
 * @param {number} [days]
 * @returns {(day: number) => boolean}
 */
export function weekdaysWithMisses(seed, miss, days = 400) {
  const r = makeRng(`${seed}:attendance`);
  const play = Array.from({ length: days }, (_, d) => d % 7 < 5 && !r.bool(miss));
  play[0] = true; // day 0 is the first session by definition
  return (d) => play[d] === true;
}

/**
 * Taps uniformly at random among the offered choices; types garbage.
 * @returns {Student}
 */
export function guesser() {
  return (problem, _item, rng) => {
    if (problem.constructed) return { verdict: rng.pick(['wrong', 'unparsed']), ms: 900 };
    const cs = problem.choices ?? [];
    if (!cs.length) return { verdict: 'wrong', ms: 900 };
    const c = rng.pick(cs);
    /** @type {Record<string, Attempt['verdict']>} */
    const map = { progress: 'correct', correct: 'correct', 'legal-idle': 'legal-idle', risky: 'risky', illegal: 'wrong', wrong: 'wrong' };
    return { verdict: map[c.verdict], ms: 900 };
  };
}

/**
 * @param {Problem} problem
 * @param {PlanItem} item
 * @param {{ verdict: Attempt['verdict']; misconceptions?: string[]; ms?: number }} r
 * @returns {Attempt}
 */
export function toAttempt(problem, item, r) {
  return {
    problem: {
      gen: problem.gen, version: problem.version, seed: problem.seed, skill: problem.skill,
      difficulty: problem.difficulty, interaction: problem.interaction, constructed: problem.constructed,
      ...(problem.variant ? { variant: problem.variant } : {}),
    },
    response: r.verdict === 'correct' ? 'ok' : 'x',
    verdict: r.verdict, firstTry: true, hintsUsed: 0, fadeLevel: problem.fadeLevel,
    evidence: item.evidence, context: item.context,
    misconceptions: r.verdict === 'wrong' ? (r.misconceptions ?? []) : [], ambiguous: false, ms: r.ms ?? 8000,
  };
}

/**
 * @param {{
 *   seed: string; days?: number; student: Student; registry: Generator[];
 *   graph?: readonly SkillDef[]; plannerParams?: object; learnerParams?: { evidenceGap?: number };
 *   gateEP?: number; playDay?: (day: number) => boolean;
 *   onRun?: (info: { day: number; plan: Plan; run: any; state: any }) => void;
 *   watch?: string[];
 * }} o
 */
export function simulate(o) {
  const graph = o.graph ?? skills;
  const days = o.days ?? 66;
  const playDay = o.playDay ?? ((d) => d % 7 < 5);
  const gateEP = o.gateEP ?? 100;
  const genById = new Map(o.registry.map((g) => [g.id, g]));
  const shipped = new Set(o.registry.map((g) => g.skill));
  const ropts = { graph, params: o.learnerParams };
  /** @type {Event[]} */
  const events = [];
  let seq = 0;
  let daySeq = 0;
  let lastDay = -1;
  const srng = makeRng(`${o.seed}:student`);
  /** @param {number} day @param {Event['type']} type @param {unknown} data */
  const emit = (day, type, data) => {
    const s = seq++;
    if (day !== lastDay) { lastDay = day; daySeq = 0; }
    const k = daySeq++; // fake clock: 20 s per event from 16:00 local
    const hh = String(16 + Math.floor((k * 20) / 3600)).padStart(2, '0');
    const mm = String(Math.floor((k * 20) / 60) % 60).padStart(2, '0');
    const ss = String((k * 20) % 60).padStart(2, '0');
    events.push({ id: String(s).padStart(10, '0'), v: 1, t: `${isoDate(day)}T${hh}:${mm}:${ss}-05:00`, build: 'test', device: 'sim', type, data });
  };
  const out = {
    gateDay: /** @type {number | null} */ (null),
    balancePlannedDay: /** @type {number | null} */ (null),
    balanceClearedDay: /** @type {number | null} */ (null),
    firstEvidence: /** @type {Record<string, number | null>} */ ({}),
    epByDay: /** @type {number[]} */ ([]),
    runs: 0,
    endedOnWin: 0,
    belowBand: 0,
    plans: /** @type {Plan[]} */ ([]),
    events,
    state: /** @type {any} */ (null),
  };
  for (const w of o.watch ?? []) out.firstEvidence[w] = null;
  let state = replay(events, ropts);
  for (let day = 0; day < days; day++) {
    if (!playDay(day)) { out.epByDay.push(epTotal(state, graph)); continue; }
    const now = `${isoDate(day)}T15:59:00-05:00`;
    const plan = planRun({ state, registry: o.registry, now, rng: makeRng(`${o.seed}:plan:${day}`), graph, params: o.plannerParams });
    out.plans.push(plan);
    if (plan.belowBand) out.belowBand++;
    if (plan.boss === 'balance' && out.balancePlannedDay === null) out.balancePlannedDay = day;
    let run = startRun(plan, { state, registry: o.registry, rng: makeRng(`${o.seed}:run:${day}`), graph });
    for (let f = 0; f < plan.forks.length; f++) run = chooseDoor(run, f, srng.int(0, plan.forks[f].doors.length - 1));
    emit(day, 'session-start', { id: `${o.seed}:s${day}`, knots: plan.knots });
    let item;
    while ((item = nextItem(run))) {
      const gen = genById.get(item.gen);
      if (!gen) throw new Error(`sim: plan names unknown generator ${item.gen}`);
      const problem = gen.generate(makeRng(item.seed), { difficulty: item.difficulty, interaction: item.interaction, fadeLevel: item.fadeLevel });
      if (problem.skill !== item.skill) throw new Error('sim: generator returned another skill');
      if (problem.constructed !== item.constructed) throw new Error(`sim: plan expected constructed=${item.constructed} for ${item.interaction}`);
      const attempt = toAttempt(problem, item, o.student(problem, item, srng, day));
      emit(day, 'attempt', attempt);
      if (item.kind === 'probe') {
        const st = replay(events, ropts);
        emit(day, 'placement', placementFor(st, attempt, shipped, graph));
      }
      run = recordAttempt(run, attempt);
    }
    out.runs++;
    if (run.endedOnWin) out.endedOnWin++;
    emit(day, 'session-end', {});
    state = replay(events, ropts);
    o.onRun?.({ day, plan, run, state });
    const ep = epTotal(state, graph);
    out.epByDay.push(ep);
    if (out.gateDay === null && ep >= gateEP) out.gateDay = day;
    const w = state.wardens.balance;
    if (w && w.cleared !== null && out.balanceClearedDay === null) out.balanceClearedDay = w.cleared - /** @type {number} */ (state.firstDay);
    for (const id of Object.keys(out.firstEvidence)) {
      const ev = state.skills[id]?.evidence[0];
      if (out.firstEvidence[id] === null && ev) out.firstEvidence[id] = ev.day - /** @type {number} */ (state.firstDay);
    }
  }
  out.state = state;
  return out;
}

export { dayOf };
