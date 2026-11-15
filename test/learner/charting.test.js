// @ts-check
// Charting simulations: a scripted student who knows a fixed set of skills
// answers every probe (right iff they know the skill), on the 12-skill slice
// graph and on the full 41-entry graph.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skills } from '../../src/data/skills.js';
import { replay } from '../../src/learner/model.js';
import { probesForRun, chartingTargets, chartingBranches, placementFor, probeDifficulty, ancestors, PROBE_STARTS } from '../../src/learner/charting.js';
import { forSeeds } from '../prop.js';

/** @typedef {import('../../types.d.ts').SkillDef} SkillDef */
/** @typedef {import('../../types.d.ts').Event} Event */
/** @typedef {import('../../types.d.ts').Attempt} Attempt */

const SLICE = skills.filter((d) => d.slice);
const byId = new Map(skills.map((d) => [d.id, d]));

/**
 * Run Charting to completion for a student who knows `known`.
 * @param {readonly SkillDef[]} graph
 * @param {Set<string>} known
 */
function chart(graph, known) {
  const shipped = new Set(graph.map((d) => d.id));
  /** @type {Event[]} */
  const events = [];
  let seq = 0;
  /** @param {number} day @param {Event['type']} type @param {unknown} data */
  const emit = (day, type, data) => events.push({ id: String(seq++).padStart(6, '0'), v: 1, t: `2026-01-${String(5 + day).padStart(2, '0')}T10:00:00-05:00`, build: 't', device: 't', type, data });
  const probed = [];
  let run = 0;
  for (; run < 60; run++) {
    const st = replay(events, { graph });
    const ps = probesForRun(st, shipped, graph);
    if (ps.length === 0) break;
    assert.ok(ps.length <= 2, 'at most 2 probes per run');
    emit(run, 'session-start', { id: `s${run}` });
    for (const skill of ps) {
      const def = /** @type {SkillDef} */ (byId.get(skill));
      const ok = known.has(skill);
      /** @type {Attempt} */
      const a = {
        problem: { gen: `g.${skill}`, version: 1, seed: `p${seq}`, skill, difficulty: probeDifficulty(def), interaction: 'strike', constructed: true },
        response: 'r', verdict: ok ? 'correct' : 'wrong', firstTry: true, hintsUsed: 0, fadeLevel: 3, evidence: false,
        context: 'charting', misconceptions: [], ambiguous: false, ms: 9000,
      };
      const before = replay(events, { graph });
      assert.equal(before.skills[skill].seen, false, `probe on an unlocked skill ${skill}`);
      emit(run, 'attempt', a);
      emit(run, 'placement', placementFor(replay(events, { graph }), a, shipped, graph));
      probed.push(skill);
    }
    emit(run, 'session-end', {});
  }
  const state = replay(events, { graph });
  return { state, probed, runs: run, shipped };
}

/**
 * Close a set downward under full and slice-gate prerequisites.
 * @param {Set<string>} s
 * @param {readonly SkillDef[]} graph
 */
function closeDown(s, graph) {
  const ids = new Set(graph.map((d) => d.id));
  const out = new Set();
  const stack = [...s];
  while (stack.length) {
    const id = /** @type {string} */ (stack.pop());
    if (out.has(id) || !ids.has(id)) continue;
    out.add(id);
    const d = /** @type {SkillDef} */ (byId.get(id));
    stack.push(...d.pre, ...(d.sliceGate ? d.sliceGate.pre : []));
  }
  return out;
}

/**
 * What a hit on h at difficulty d may infer, written from section 4/6: the
 * slice-gate prerequisites at or below the gate difficulty, else the full
 * list; then everything below those through full prerequisites.
 * @param {string} h
 * @param {number} d
 */
function inferable(h, d) {
  const def = /** @type {SkillDef} */ (byId.get(h));
  const first = def.sliceGate && d <= def.sliceGate.maxDifficulty ? def.sliceGate.pre : def.pre;
  const out = new Set();
  for (const p of first) { out.add(p); for (const a of ancestors(p)) out.add(a); }
  return out;
}

/**
 * Invariants every completed Charting must satisfy.
 * @param {ReturnType<typeof chart>} r
 * @param {Set<string>} known downward closed
 * @param {readonly SkillDef[]} graph
 */
function checkInvariants(r, known, graph) {
  const { state, shipped } = r;
  assert.deepEqual(chartingTargets(state, shipped, graph), [], 'Charting finished');
  const hits = Object.entries(state.charting).filter(([, v]) => v.result === 'hit').map(([k]) => k);
  for (const d of graph) {
    const sk = state.skills[d.id];
    if (!sk.seen) {
      assert.equal(sk.box, 0);
      continue;
    }
    assert.ok(known.has(d.id), `${d.id} placed but not known`);
    if (state.charting[d.id]?.result === 'hit') {
      assert.equal(sk.box, 3);
      assert.equal(sk.evidence.length, 1, 'one evidence day');
    } else {
      assert.equal(state.charting[d.id], undefined, 'a missed probe leaves the skill unseen');
      assert.equal(sk.box, 2);
      assert.equal(sk.inferred, true);
      assert.equal(sk.evidence.length, 0, 'inferred skills get no evidence');
      assert.ok(hits.some((h) => inferable(h, state.charting[h].difficulty).has(d.id)), `${d.id} inferred without a hit above it`);
    }
  }
  // each branch: at most 2 misses
  /** @type {Record<string, number>} */
  const missesByBranch = {};
  for (const v of Object.values(state.charting)) if (v.result === 'miss') missesByBranch[v.branch] = (missesByBranch[v.branch] ?? 0) + 1;
  for (const [b, n] of Object.entries(missesByBranch)) assert.ok(n <= 2, `branch ${b} has ${n} misses`);
  // every known start that was shipped is placed (it is probed first)
  for (const s of PROBE_STARTS) if (shipped.has(s) && known.has(s)) assert.ok(state.skills[s].seen, `known start ${s} not placed`);
  assert.equal(new Set(r.probed).size, r.probed.length, 'no skill probed twice');
}

test('Charting, slice graph: a student who knows everything is placed everywhere', () => {
  const known = new Set(SLICE.map((d) => d.id));
  const r = chart(SLICE, known);
  checkInvariants(r, known, SLICE);
  for (const d of SLICE) assert.ok(r.state.skills[d.id].seen, d.id);
});

test('Charting, slice graph: a student who knows nothing stays unseen, every branch closes', () => {
  const r = chart(SLICE, new Set());
  checkInvariants(r, new Set(), SLICE);
  for (const d of SLICE) assert.equal(r.state.skills[d.id].seen, false, d.id);
  // solve-linear -> balance-moves closes; distribute -> equivalent-expressions closes;
  // sqrt-product-rule (d1, gated on sqrt-squared) -> sqrt-squared closes;
  // then rationalize-denominator -> identity-moves; quadratic-to-standard -> (balance-moves, charted) ;
  // frac-times-whole -> frac-equivalence.
  assert.deepEqual(r.probed.slice(0, 6).sort(), ['balance-moves', 'distribute', 'equivalent-expressions', 'solve-linear', 'sqrt-product-rule', 'sqrt-squared'].sort());
});

test('Charting, slice graph: a student who knows the Scales but no radicals', () => {
  const known = closeDown(new Set(['solve-linear', 'quadratic-to-standard', 'frac-times-whole']), SLICE);
  const r = chart(SLICE, known);
  checkInvariants(r, known, SLICE);
  const s = r.state.skills;
  for (const id of ['solve-linear', 'quadratic-to-standard', 'frac-times-whole']) assert.equal(s[id].box, 3, id);
  for (const id of ['balance-moves', 'distribute', 'solution-meaning', 'identity-moves', 'frac-equivalence', 'equivalent-expressions']) assert.equal(s[id].box, 2, id);
  for (const id of ['sqrt-squared', 'sqrt-product-rule', 'rationalize-denominator']) assert.equal(s[id].seen, false, id);
  assert.equal(r.state.charting['sqrt-product-rule'].result, 'miss');
});

test('Charting, slice graph: sqrt-product-rule d1 infers only its slice-gate prerequisites', () => {
  const known = closeDown(new Set(['sqrt-product-rule']), SLICE);
  const r = chart(SLICE, known);
  checkInvariants(r, known, SLICE);
  assert.equal(r.state.charting['sqrt-product-rule'].difficulty, 1);
  assert.equal(r.state.skills['sqrt-squared'].box, 2);
  assert.equal(r.state.skills['balance-moves'].seen, false);
});

test('Charting, full 41-entry graph: everything known -> all placed; nothing known -> nothing placed', () => {
  const all = new Set(skills.map((d) => d.id));
  const r = chart(skills, all);
  checkInvariants(r, all, skills);
  for (const d of skills) assert.ok(r.state.skills[d.id].seen, d.id);
  const z = chart(skills, new Set());
  checkInvariants(z, new Set(), skills);
  for (const d of skills) assert.equal(z.state.skills[d.id].seen, false, d.id);
});

test('Charting, full graph: the named starts are probed first, in order, two at a time', () => {
  const r = chart(skills, new Set());
  assert.deepEqual(r.probed.slice(0, 2), ['solve-linear', 'exp-product-quotient'], 'distribute is skipped in run 1: it is a prerequisite of solve-linear');
});

test('property: Charting places a scripted student correctly on both graphs (1000 random students each)', () => {
  for (const [name, graph] of /** @type {[string, readonly SkillDef[]][]} */ ([['slice', SLICE], ['full', skills]])) {
    forSeeds(1000, (rng) => {
      const pick = new Set(graph.filter(() => rng.bool(0.3)).map((d) => d.id));
      const known = closeDown(pick, graph);
      const r = chart(graph, known);
      checkInvariants(r, known, graph);
      assert.ok(r.runs < 60, 'terminates');
    }, { prefix: `chart-${name}-` });
  }
});

test('chartingBranches records the branch a probe belongs to', () => {
  const r = chart(skills, new Set());
  for (const v of Object.values(r.state.charting)) assert.equal(typeof v.branch, 'string');
  assert.equal(r.state.charting['balance-moves'].branch, 'solve-linear');
  assert.deepEqual(chartingBranches(r.state, r.shipped, skills), []);
});
