// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skills, skillById, ZONES, CLUSTERS } from '../../src/data/skills.js';

// Independent transcription of DESIGN.md section 4 by NUMBER (skills.js uses ids),
// so a typo in either one shows up as a mismatch.
/** @type {Record<number, number[]>} */
const PRE_BY_NUMBER = {
  1: [], 2: [1], 3: [1], 4: [1, 3], 5: [2], 6: [4], 7: [6],
  8: [3], 9: [8], 10: [9], 11: [9], 12: [], 13: [12, 3], 14: [13, 9], 15: [14, 4], 16: [14],
  17: [7], 18: [17], 19: [18], 20: [18], 21: [3], 22: [17], 23: [22, 19], 24: [23], 25: [24, 3, 21], 26: [18, 22],
  27: [10], 28: [9, 18], 29: [28, 11], 30: [29], 31: [29], 32: [13, 27], 33: [29, 32], 34: [22, 24], 35: [34, 30, 3], 36: [32, 24],
  37: [7, 9], 38: [6, 5], 39: [38, 16], 40: [12, 37], 41: [14, 13],
};
const SLICE_NUMBERS = [1, 2, 3, 8, 9, 12, 13, 14, 21, 23, 25, 32];
/** section 8 Warden clusters by number */
const CLUSTER_BY_NUMBER = /** @type {Record<string, number[]>} */ ({
  balance: [8, 9, 12, 13, 14],
  mint: [1, 2, 3, 4, 5, 6, 7],
  stack: [17, 18, 19, 20, 26],
  root: [21, 22, 23, 24, 25],
  factor: [10, 11, 27, 28, 29, 30, 31],
  quadratic: [32, 33, 34, 35, 36],
  ridge: [15, 16, 37, 38, 39, 40],
  none: [41],
});
/** @param {number} n */
const zoneOf = (n) => (n <= 7 ? 'mint' : n <= 16 ? 'scales' : n <= 26 ? 'stacks-roots' : n <= 36 ? 'arch' : 'ridge');

const byN = new Map(skills.map((s) => [s.n, s]));
/** @param {number} n */
const idOf = (n) => {
  const s = byN.get(n);
  assert.ok(s, `no skill numbered ${n}`);
  return s.id;
};

test('41 entries numbered 1..41 in order, unique ids', () => {
  assert.equal(skills.length, 41);
  skills.forEach((s, i) => assert.equal(s.n, i + 1));
  assert.equal(new Set(skills.map((s) => s.id)).size, 41);
  assert.equal(skillById.size, 41);
  for (const s of skills) assert.match(s.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('40 A + 1 B; the B is systems-linear', () => {
  assert.equal(skills.filter((s) => s.priority === 'A').length, 40);
  const b = skills.filter((s) => s.priority === 'B');
  assert.deepEqual(b.map((s) => s.id), ['systems-linear']);
});

test('exactly the 12 section-4 slice skills', () => {
  const slice = skills.filter((s) => s.slice).map((s) => s.n);
  assert.deepEqual(slice, SLICE_NUMBERS);
});

test('every pre exists, and matches the by-number transcription', () => {
  for (const s of skills) {
    for (const p of s.pre) assert.ok(skillById.has(p), `${s.id}: unknown pre ${p}`);
    assert.deepEqual([...s.pre].sort(), PRE_BY_NUMBER[s.n].map(idOf).sort(), `pre of ${s.n} ${s.id}`);
  }
});

test('graph is acyclic (topological sort covers every skill)', () => {
  const indeg = new Map(skills.map((s) => [s.id, s.pre.length]));
  /** @type {Map<string, string[]>} */
  const out = new Map(skills.map((s) => [s.id, []]));
  for (const s of skills) for (const p of s.pre) out.get(p)?.push(s.id);
  const queue = skills.filter((s) => s.pre.length === 0).map((s) => s.id);
  let seen = 0;
  while (queue.length) {
    const id = /** @type {string} */ (queue.shift());
    seen++;
    for (const c of out.get(id) ?? []) {
      const d = /** @type {number} */ (indeg.get(c)) - 1;
      indeg.set(c, d);
      if (d === 0) queue.push(c);
    }
  }
  assert.equal(seen, skills.length, 'cycle in skill graph');
  // Also acyclic including slice gates as edges.
  for (const s of skills) for (const p of s.sliceGate?.pre ?? []) assert.ok(/** @type {any} */ (skillById.get(p)).n < s.n);
});

test('zones match section 4 and are in ZONES', () => {
  for (const s of skills) {
    assert.ok(ZONES.includes(s.zone));
    assert.equal(s.zone, zoneOf(s.n), `${s.id} zone`);
  }
});

test('clusters match section 8', () => {
  for (const s of skills) assert.ok(CLUSTERS.includes(s.cluster), `${s.id}: cluster ${s.cluster}`);
  for (const [c, ns] of Object.entries(CLUSTER_BY_NUMBER)) {
    assert.deepEqual(skills.filter((s) => s.cluster === c).map((s) => s.n), ns, `cluster ${c}`);
  }
});

test('exactly the three slice gates from section 4', () => {
  const gated = skills.filter((s) => s.sliceGate);
  assert.deepEqual(gated.map((s) => s.id), ['sqrt-product-rule', 'rationalize-denominator', 'quadratic-to-standard']);
  assert.deepEqual(skillById.get('sqrt-product-rule')?.sliceGate, { maxDifficulty: 1, pre: ['sqrt-squared'] });
  assert.deepEqual(skillById.get('rationalize-denominator')?.sliceGate, { maxDifficulty: 1, pre: ['identity-moves', 'sqrt-squared'] });
  assert.deepEqual(skillById.get('quadratic-to-standard')?.sliceGate, { maxDifficulty: 2, pre: ['balance-moves'] });
  for (const s of gated) assert.ok(s.slice, `${s.id} gated but not slice`);
});

test('the slice is closed: each slice skill is reachable from slice skills only', () => {
  for (const s of skills.filter((x) => x.slice)) {
    const eff = s.sliceGate ? s.sliceGate.pre : s.pre;
    for (const p of eff) assert.ok(skillById.get(p)?.slice, `${s.id} depends on non-slice ${p} within the slice`);
  }
});

test('entries are frozen', () => {
  assert.ok(Object.isFrozen(skills));
  for (const s of skills) {
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.pre));
    if (s.sliceGate) assert.ok(Object.isFrozen(s.sliceGate) && Object.isFrozen(s.sliceGate.pre));
  }
});
