// Independent whole-loop simulator for the adversarial review. It drives the
// code under review (planner, controller, reducer, charting.placementFor)
// with its OWN stub generators, student and event-log writer; nothing here
// imports test/session/sim.js, stubs.js or test/learner/helpers.js.
//
// The student only ever sees what a real student sees: the Problem the
// generator returns (interaction, choices, constructed). It never reads the
// learner state, the plan's kind/evidence flags, or the box.

import { makeRng } from '../../../src/gen/prng.js';
import { skills } from '../../../src/data/skills.js';
import { replay } from '../../../src/learner/model.js';
import { placementFor } from '../../../src/learner/charting.js';
import { epTotal, wardenEligible } from '../../../src/learner/season.js';
import { planRun } from '../../../src/session/planner.js';
import { startRun, nextItem, recordAttempt, chooseDoor } from '../../../src/session/controller.js';
import { dateOf } from './xlog.js';

const ONE = { t: 'num', q: { n: 1n, d: 1n } };

/** constructed iff section 3 says the produced form is constructed */
function isCR(interaction, fade) {
  if (interaction === 'predict' || interaction === 'strike') return true;
  if (interaction === 'forge') return fade >= 2; // typed form at fade 2+ (builder contract)
  return false;
}

/** Own registry: every skill gets one generator, d1-d4, all 8 interactions. */
export function xRegistry(graph = skills) {
  return graph.map((d) => {
    const interactions = ['predict', 'strike', 'forge', 'nextline', 'twin', 'trace', 'cast', 'why'];
    const id = `x.${d.id}`;
    return {
      id, version: 1, skill: d.id, difficulty: [1, 4], interactions,
      generate(rng, o) {
        if (!interactions.includes(o.interaction)) throw new Error(`${id}: bad interaction ${o.interaction}`);
        if (o.difficulty < 1 || o.difficulty > 4) throw new Error(`${id}: bad difficulty ${o.difficulty}`);
        const constructed = isCR(o.interaction, o.fadeLevel);
        return {
          id: `${id}:${rng.seed}`, gen: id, version: 1, seed: rng.seed, skill: d.id,
          difficulty: o.difficulty, interaction: o.interaction,
          ...(o.interaction === 'why' ? { variant: rng.pick(['hidden-1', 'hidden-0', 'which-invariant']) } : {}),
          constructed, fadeLevel: o.fadeLevel, prompt: { verb: 'Solve', math: ONE }, assumptions: [], variableKeys: ['x'],
          ...(constructed ? {} : { choices: [{ id: 'a', display: ONE, verdict: 'correct' }, { id: 'b', display: ONE, verdict: 'wrong' }] }),
          answer: { kind: 'expr', expected: ONE, formPredicates: [], assumptions: [] },
          visuals: o.fadeLevel < 3 ? ['numberline'] : [], probes: [],
        };
      },
    };
  });
}

/**
 * @param {{ seed: string; p: number; pProbe?: number; days?: number; graph?: any; onRun?: Function; params?: object }} o
 */
export function xsimulate(o) {
  const graph = o.graph ?? skills;
  const days = o.days ?? 66;
  const reg = xRegistry(graph);
  const shipped = new Set(reg.map((g) => g.skill));
  const genById = new Map(reg.map((g) => [g.id, g]));
  const rng = makeRng(`xs:${o.seed}`);
  const events = [];
  let n = 0;
  let sec = 0;
  const emit = (day, type, data) => {
    const s = sec++;
    const t = `${dateOf(day)}T17:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}-05:00`;
    events.push({ id: `${dateOf(day)}-${String(n++).padStart(7, '0')}`, v: 1, t, build: 'x', device: 'x', type, data });
  };
  const res = { gate: null, balPlanned: null, balEligible: null, balCleared: null, ev: {}, runs: [] };
  let state = replay(events, { graph });
  for (let day = 0; day < days; day++) {
    if (day % 7 >= 5) continue; // 5 days a week
    sec = 0;
    const plan = planRun({ state, registry: reg, now: `${dateOf(day)}T16:59:00-05:00`, rng: makeRng(`xp:${o.seed}:${day}`), graph, params: o.params });
    if (plan.boss === 'balance' && res.balPlanned === null) res.balPlanned = day;
    let run = startRun(plan, { state, registry: reg, rng: makeRng(`xr:${o.seed}:${day}`), graph });
    for (let f = 0; f < plan.forks.length; f++) run = chooseDoor(run, f, rng.int(0, plan.forks[f].doors.length - 1));
    emit(day, 'session-start', { knots: plan.knots });
    const served = [];
    let it;
    while ((it = nextItem(run))) {
      const g = genById.get(it.gen);
      if (!g) throw new Error(`unknown gen ${it.gen}`);
      const prob = g.generate(makeRng(it.seed), { difficulty: it.difficulty, interaction: it.interaction, fadeLevel: it.fadeLevel });
      const probe = it.context === 'charting'; // a fogged Knot is visible to them
      const ok = rng.bool(probe ? (o.pProbe ?? o.p) : o.p);
      const a = {
        problem: { gen: prob.gen, version: 1, seed: prob.seed, skill: prob.skill, difficulty: prob.difficulty, interaction: prob.interaction, constructed: prob.constructed, ...(prob.variant ? { variant: prob.variant } : {}) },
        response: ok ? 'a' : 'b', verdict: ok ? 'correct' : 'wrong', firstTry: true, hintsUsed: 0,
        fadeLevel: prob.fadeLevel, evidence: it.evidence, context: it.context, misconceptions: [], ambiguous: false, ms: 9000,
      };
      emit(day, 'attempt', a);
      if (probe) emit(day, 'placement', placementFor(replay(events, { graph }), a, shipped, graph));
      served.push({ it, a });
      run = recordAttempt(run, a);
    }
    emit(day, 'session-end', {});
    const before = state;
    state = replay(events, { graph });
    o.onRun?.({ day, plan, run, served, before, after: state });
    if (res.gate === null && epTotal(state, graph) >= 100) res.gate = day;
    if (res.balEligible === null && wardenEligible(state, 'balance', graph)) res.balEligible = day;
    if (res.balCleared === null && state.wardens.balance?.cleared != null) res.balCleared = day;
    for (const id of ['sqrt-product-rule', 'quadratic-formula']) {
      const e = state.skills[id].evidence;
      if (res.ev[id] === undefined && e.length) res.ev[id] = { day, charting: e[0].context === 'charting' };
    }
  }
  res.state = state;
  res.events = events;
  return res;
}
