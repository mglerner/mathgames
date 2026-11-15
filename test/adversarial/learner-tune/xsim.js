// Independent whole-loop simulator for the adversarial review of the M2
// tuning change. It drives the code under review (planner, controller,
// reducer, charting.placementFor) with its OWN student models, PRNG, event
// writer and invariant checker. It does not import test/session/sim.js and
// uses test/session/stubs.js only when asked to (registry: 'stubs'), so a
// difference between the two registries can be separated from a difference
// in the driver.
//
// The student sees only what a real student sees: the Problem (interaction,
// choices, constructed, fade, difficulty), whether the Knot is fogged (a
// Charting probe) and whether it is a worked example. It never reads the
// learner state, box, evidence flag or plan kind.

import { skills } from '../../../src/data/skills.js';
import { makeRng } from '../../../src/gen/prng.js';
import { replay } from '../../../src/learner/model.js';
import { placementFor } from '../../../src/learner/charting.js';
import { epTotal, wardenEligible } from '../../../src/learner/season.js';
import { planRun } from '../../../src/session/planner.js';
import { startRun, nextItem, recordAttempt, chooseDoor } from '../../../src/session/controller.js';
import { stubRegistry } from '../../session/stubs.js';

// ---------- own PRNG (cyrb53-style hash -> mulberry32) ----------
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}
export function xrand(seed) {
  let a = hash(seed);
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, bool: (p) => next() < p, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) };
}

const ONE = { t: 'num', q: { n: 1n, d: 1n } };
function isCR(interaction, fade) {
  if (interaction === 'predict' || interaction === 'strike') return true;
  if (interaction === 'forge') return fade >= 2;
  return false;
}

/** Own registry: one generator per skill, d1-d4, all 8 interactions, 3 choices. */
export function ownRegistry(graph = skills) {
  return graph.map((d) => {
    const interactions = ['predict', 'strike', 'forge', 'nextline', 'twin', 'trace', 'cast', 'why'];
    const id = `lt.${d.id}`;
    return {
      id, version: 1, skill: d.id, difficulty: [1, 4], interactions,
      generate(rng, o) {
        if (!interactions.includes(o.interaction)) throw new Error(`${id}: bad interaction ${o.interaction}`);
        if (o.difficulty < 1 || o.difficulty > 4) throw new Error(`${id}: bad difficulty ${o.difficulty}`);
        if (![0, 1, 2, 3].includes(o.fadeLevel)) throw new Error(`${id}: bad fade ${o.fadeLevel}`);
        const constructed = isCR(o.interaction, o.fadeLevel);
        const choices = constructed ? undefined
          : o.interaction === 'cast'
            ? ['progress', 'legal-idle', 'risky', 'illegal'].map((v, i) => ({ id: `c${i}`, display: ONE, verdict: v }))
            : ['correct', 'wrong', 'wrong'].map((v, i) => ({ id: `c${i}`, display: ONE, verdict: v }));
        return {
          id: `${id}:${rng.seed}`, gen: id, version: 1, seed: rng.seed, skill: d.id,
          difficulty: o.difficulty, interaction: o.interaction,
          ...(o.interaction === 'why' ? { variant: rng.pick(['hidden-1', 'hidden-0', 'which-invariant']) } : {}),
          constructed, fadeLevel: o.fadeLevel, prompt: { verb: 'Solve', math: ONE }, assumptions: [], variableKeys: ['x'],
          ...(choices ? { choices } : {}),
          answer: { kind: 'expr', expected: ONE, formPredicates: [], assumptions: [] },
          visuals: o.fadeLevel < 3 ? ['numberline'] : [], probes: [],
        };
      },
    };
  });
}

// ---------- students ----------
/** Right with probability p on every first try, probes included. */
export function accurate(p) {
  return (prob, seen, r) => r.bool(p);
}

/**
 * Independent re-implementation of the builder's stated realistic model
 * (report section 4), written from the prose, not the code:
 *  - per-skill symbol-only d2 start rate uniform in [pStart - pSpread, pStart + pSpread]
 *  - each item closes learnRate of the gap to 1 in latent k (probe: half);
 *    rate = p0 + (pCeil - p0) * k
 *  - forgetting: holds 2 * 2^(practice days - 1) days (cap 32), then halves per period
 *  - supports: fade +.25/+.15/+.07/0, difficulty +.05/0/-.07/-.14, worked example +.10
 *  - blind guess on choice items when they do not know
 * Extra (off by default): supportScale scales the fade and worked-example
 * bonuses; choiceLearns scales learning from choice items; prereqDrag in [0,1] caps a skill's latent k by the
 * mean latent k of its prerequisites plus (1 - prereqDrag).
 */
export function realistic(seed, o = {}) {
  const q = { pStart: 0.25, pSpread: 0.10, pCeil: 0.80, learnRate: 0.20, probeShare: 0.5, base: 2, cap: 32, choiceLearns: 1, prereqDrag: 0, supportScale: 1, ...o };
  const init = xrand(`${seed}:init`);
  const p0 = new Map();
  for (const d of skills) p0.set(d.id, q.pStart + (2 * init.next() - 1) * q.pSpread);
  const mem = new Map(); // skill -> { k, last, days }
  const defs = new Map(skills.map((d) => [d.id, d]));
  const latent = (id, day) => {
    const m = mem.get(id);
    if (!m || m.last === null) return 0;
    const stab = Math.min(q.cap, q.base * 2 ** Math.max(0, m.days - 1));
    const over = day - m.last - stab;
    return over > 0 ? m.k * 0.5 ** (over / stab) : m.k;
  };
  const eff = (id, day) => {
    let k = latent(id, day);
    if (q.prereqDrag > 0) {
      const pre = defs.get(id).pre;
      if (pre.length) {
        const mk = pre.reduce((t, p) => t + latent(p, day), 0) / pre.length;
        k = Math.min(k, mk + (1 - q.prereqDrag));
      }
    }
    return k;
  };
  const rate = (id, day) => p0.get(id) + (q.pCeil - p0.get(id)) * eff(id, day);
  const FADE = [0.25, 0.15, 0.07, 0];
  const DIFF = { 1: 0.05, 2: 0, 3: -0.07, 4: -0.14 };
  const st = (prob, seen, r) => {
    let p = rate(prob.skill, seen.day) + q.supportScale * (FADE[prob.fadeLevel] + (seen.workedExample ? 0.10 : 0)) + (DIFF[prob.difficulty] ?? 0);
    p = Math.max(0.03, Math.min(0.97, p));
    let ok = r.bool(p);
    if (!ok && !prob.constructed && prob.choices?.length) {
      const c = prob.choices[r.int(0, prob.choices.length - 1)];
      ok = c.verdict === 'correct' || c.verdict === 'progress';
    }
    const m = mem.get(prob.skill) ?? { k: 0, last: null, days: 0 };
    const k = latent(prob.skill, seen.day);
    const g = q.learnRate * (seen.probe ? q.probeShare : 1) * (prob.constructed ? 1 : q.choiceLearns);
    m.k = k + g * (1 - k);
    if (m.last !== seen.day) m.days++;
    m.last = seen.day;
    mem.set(prob.skill, m);
    return ok;
  };
  st.rate = rate;
  return st;
}

/** weekday attendance with misses */
export function attendance(seed, miss) {
  const r = xrand(`${seed}:att`);
  const play = Array.from({ length: 400 }, (_, d) => d % 7 < 5 && !r.bool(miss));
  play[0] = true;
  return (d) => play[d];
}

const BASE = Date.UTC(2026, 8, 7); // a Monday
const dateOf = (d) => new Date(BASE + d * 86400000).toISOString().slice(0, 10);

/** Independent new-skill cap, written from section 6. */
export function specCap(state, graph = skills) {
  const counts = (a) => a.firstTry && a.context !== 'charting' && a.verdict !== 'unparsed' && a.verdict !== 'unverifiable';
  const recent = state.sessions.filter((s) => s.attempts.some(counts)).slice(-2);
  if (!recent.length) return 1;
  const as = recent.flatMap((s) => s.attempts).filter(counts);
  const k = as.filter((a) => a.verdict === 'correct').length;
  const lowBox = graph.filter((d) => state.skills[d.id].seen && state.skills[d.id].box <= 1).length;
  if (100 * k >= 80 * as.length && lowBox <= 6) return 2;
  if (100 * k >= 70 * as.length) return 1;
  return 0;
}

/**
 * @param {{ seed: string; student: Function; days?: number; registry?: 'own' | 'stubs';
 *   playDay?: (d: number) => boolean; params?: object; check?: boolean; gap?: number; sliceOnly?: boolean }} o
 */
export function xsim(o) {
  const graph = skills;
  const days = o.days ?? 66;
  const reg0 = o.registry === 'stubs' ? stubRegistry(graph) : ownRegistry(graph);
  const reg = o.sliceOnly ? reg0.filter((g) => graph.find((d) => d.id === g.skill).slice) : reg0;
  const shipped = new Set(reg.map((g) => g.skill));
  const genById = new Map(reg.map((g) => [g.id, g]));
  const r = xrand(`${o.seed}:student`);
  const doors = xrand(`${o.seed}:doors`);
  const playDay = o.playDay ?? ((d) => d % 7 < 5);
  const gap = o.gap ?? 2;
  const ropts = { graph, params: { evidenceGap: gap } };
  const events = [];
  let n = 0; let sec = 0;
  const emit = (day, type, data) => {
    const s = (sec++) * 15;
    const t = `${dateOf(day)}T${String(16 + Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}-05:00`;
    events.push({ id: `lt${String(n++).padStart(9, '0')}`, v: 1, t, build: 'lt', device: 'lt', type, data });
  };
  const res = { gate: null, balPlanned: null, firstEv: {}, firstSeen: {}, violations: [], runs: 0, items: 0, ok: 0, probes: 0, probeHits: 0, choiceInferredDrop: 0 };
  const watch = ['frac-times-whole', 'rationalize-denominator', 'sqrt-product-rule', 'rational-exponents', 'quadratic-to-standard', 'quadratic-formula'];
  const V = (day, msg) => { if (res.violations.length < 50) res.violations.push(`day ${day}: ${msg}`); };
  let state = replay(events, ropts);
  for (let day = 0; day < days; day++) {
    if (!playDay(day)) continue;
    sec = 0;
    const plan = planRun({ state, registry: reg, now: `${dateOf(day)}T15:59:00-05:00`, rng: makeRng(`ltp:${o.seed}:${day}`), graph, params: { ...(o.params ?? {}), evidenceGap: gap } });
    if (plan.boss === 'balance' && res.balPlanned === null) res.balPlanned = day;
    const cap = specCap(state, graph);
    if (o.check !== false && plan.newSkills.length > Math.max(cap, state.sessions.length === 0 ? 1 : 0)) V(day, `plan has ${plan.newSkills.length} new skills, spec cap ${cap}`);
    let run = startRun(plan, { state, registry: reg, rng: makeRng(`ltr:${o.seed}:${day}`), graph });
    for (let f = 0; f < plan.forks.length; f++) run = chooseDoor(run, f, doors.int(0, plan.forks[f].doors.length - 1));
    emit(day, 'session-start', { id: `lt:${o.seed}:${day}`, knots: plan.knots });
    const served = [];
    const placements = [];
    let it;
    while ((it = nextItem(run))) {
      const g = genById.get(it.gen);
      if (!g) throw new Error(`unknown gen ${it.gen}`);
      const prob = g.generate(makeRng(it.seed), { difficulty: it.difficulty, interaction: it.interaction, fadeLevel: it.fadeLevel });
      const probe = it.context === 'charting';
      const ok = o.student(prob, { probe, workedExample: it.workedExample === true, day }, r);
      if (probe) { res.probes++; if (ok) res.probeHits++; } else { res.items++; if (ok) res.ok++; }
      const a = {
        problem: { gen: prob.gen, version: 1, seed: prob.seed, skill: prob.skill, difficulty: prob.difficulty, interaction: prob.interaction, constructed: prob.constructed, ...(prob.variant ? { variant: prob.variant } : {}) },
        response: ok ? 'a' : 'b', verdict: ok ? 'correct' : (prob.interaction === 'cast' ? 'legal-idle' : 'wrong'), firstTry: true, hintsUsed: 0,
        fadeLevel: prob.fadeLevel, evidence: it.evidence, context: it.context, misconceptions: [], ambiguous: false, ms: 9000,
      };
      emit(day, 'attempt', a);
      if (probe) { const pl = placementFor(replay(events, ropts), a, shipped, graph); placements.push(pl); emit(day, 'placement', pl); }
      served.push({ it, a });
      run = recordAttempt(run, a);
    }
    emit(day, 'session-end', {});
    const before = state;
    state = replay(events, ropts);
    res.runs++;
    if (o.check !== false) checkRun(day, before, state, plan, served, placements, gap, V, res);
    for (const d of graph) if (res.firstSeen[d.id] === undefined && state.skills[d.id].seen) res.firstSeen[d.id] = day;
    if (res.gate === null && epTotal(state, graph) >= 100) res.gate = day;
    for (const id of watch) if (res.firstEv[id] === undefined && state.skills[id].evidence.length) res.firstEv[id] = state.skills[id].evidence[0].day - state.firstDay;
  }
  res.state = state;
  res.ep = epTotal(state, graph);
  res.eligible = Object.fromEntries(['balance', 'mint', 'stack', 'root', 'factor', 'quadratic', 'ridge'].map((c) => [c, wardenEligible(state, c, graph)]));
  return res;
}

/** Section 6 invariants on one run. */
function checkRun(day, before, after, plan, served, placements, gap, V, res) {
  const today = after.lastDay;
  const chartedToday = new Set(Object.entries(after.charting).filter(([, c]) => c.day === today).map(([id]) => id));
  const placedOrInferredToday = new Set();
  for (const pl of placements) {
    if (pl.result !== 'hit') continue;
    if (!before.skills[pl.skill].seen) placedOrInferredToday.add(pl.skill);
    for (const id of pl.inferred ?? []) if (!before.skills[id].seen) placedOrInferredToday.add(id);
  }
  // choice cap, as served
  const choice = served.filter((s) => !s.a.problem.constructed).length;
  if (2 * choice > served.length) V(day, `choice items ${choice}/${served.length} > 50%`);
  for (const { it, a } of served) {
    if (it.evidence) {
      const b = before.skills[it.skill];
      if (!a.problem.constructed) V(day, `evidence item on ${it.skill} not constructed (${a.problem.interaction})`);
      if (a.fadeLevel !== 3) V(day, `evidence item on ${it.skill} at fade ${a.fadeLevel}`);
      if (b.box < 2) V(day, `evidence item on ${it.skill} at box ${b.box}`);
    }
    if ((it.kind === 'warmup' || it.kind === 'closer') && it.evidence) V(day, `${it.kind} is an evidence item`);
  }
  const newly = [];
  for (const d of skills) {
    const id = d.id;
    const b = before.skills[id]; const a = after.skills[id];
    const mine = served.filter((s) => s.a.problem.skill === id && s.a.context !== 'charting');
    const crs = mine.filter((s) => s.a.problem.constructed);
    // evidence days
    const ev = a.evidence;
    for (let i = 1; i < ev.length; i++) if (ev[i].day - ev[i - 1].day < gap) V(day, `${id} evidence days ${ev[i - 1].day} and ${ev[i].day} closer than ${gap}`);
    if (ev.length > 3) V(day, `${id} has ${ev.length} evidence days`);
    const added = ev.slice(b.evidence.length);
    for (const e of added) {
      if (e.context === 'charting') continue;
      const src = mine.find((s) => s.it.evidence && s.a.problem.constructed && s.a.fadeLevel === 3 && s.a.verdict === 'correct');
      if (!src) V(day, `${id} gained an evidence day without a correct symbol-only constructed evidence item`);
      if (b.box < 2) V(day, `${id} gained evidence at box ${b.box}`);
    }
    // boxes
    if (chartedToday.has(id) || placedOrInferredToday.has(id)) continue;
    if (Math.abs(a.box - b.box) > 1) V(day, `${id} box ${b.box} -> ${a.box} in one session`);
    if (a.box !== b.box && crs.length === 0) {
      if (b.inferred && a.box === 1) res.choiceInferredDrop++;
      else V(day, `${id} box ${b.box} -> ${a.box} with no constructed response`);
    }
    if (a.box > b.box && !(crs[0] && crs[0].a.verdict === 'correct')) V(day, `${id} moved up though its first constructed response missed`);
    if (!b.seen && a.seen) newly.push(id);
  }
  // new skills: within the spec cap, prerequisites at box >= 1, worked example first
  const cap = specCap(before);
  const allowed = Math.max(cap, before.sessions.length === 0 ? 1 : 0);
  if (newly.length > allowed) V(day, `${newly.length} skills newly taught (${newly.join(', ')}), spec cap ${cap}`);
  for (const id of newly) {
    const d = skills.find((x) => x.id === id);
    const pre = d.pre.every((p) => before.skills[p].seen && before.skills[p].box >= 1)
      || (d.sliceGate && d.sliceGate.pre.every((p) => before.skills[p].seen && before.skills[p].box >= 1));
    if (!pre) V(day, `${id} taught before its prerequisites reached box 1`);
    const first = served.find((s) => s.a.problem.skill === id && s.a.context !== 'charting');
    if (first && !first.it.workedExample && before.sessions.length > 0) V(day, `${id} first served as ${first.it.kind}/${first.a.problem.interaction}, not a worked example`);
  }
}

export function q(xs, f) {
  const s = xs.map((x) => (x === null || x === undefined ? Infinity : x)).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))];
}
export const spread = (xs) => `min ${q(xs, 0)} p10 ${q(xs, 0.1)} med ${q(xs, 0.5)} p90 ${q(xs, 0.9)} max ${q(xs, 1)}`;
export const by = (xs, d) => xs.filter((x) => x !== null && x !== undefined && x <= d).length / xs.length;
