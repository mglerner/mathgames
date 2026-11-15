// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shardsFor, epTotal, tierFor, gateStatus, wardenEligible, wardenAvailable, clusterSkills, seasonSummary } from '../../src/learner/season.js';
import { replay } from '../../src/learner/model.js';
import { skills } from '../../src/data/skills.js';
import { dayOf } from '../../src/learner/scheduler.js';
import { logBuilder } from './helpers.js';

/** @typedef {import('../../types.d.ts').Attempt} Attempt */

/** @param {Partial<Attempt>} o @param {Partial<Attempt['problem']>} [p] @returns {Attempt} */
const att = (o, p = {}) => ({
  problem: { gen: 'g', version: 1, seed: 's', skill: 'distribute', difficulty: 2, interaction: 'strike', constructed: true, ...p },
  response: 'r', verdict: 'correct', firstTry: true, hintsUsed: 0, fadeLevel: 3, evidence: false, context: 'mixed',
  misconceptions: [], ambiguous: false, ms: 1, ...o,
});

test('shards: 2 first-try, 1 corrected, 0 idle/risky/form/wrong/non-counting Why, double in Fracture', () => {
  assert.equal(shardsFor(att({})), 2);
  assert.equal(shardsFor(att({ firstTry: false })), 1);
  assert.equal(shardsFor(att({ context: 'fracture' })), 4);
  assert.equal(shardsFor(att({ context: 'fracture', firstTry: false })), 1);
  for (const verdict of /** @type {Attempt['verdict'][]} */ (['legal-idle', 'risky', 'form', 'wrong', 'unparsed', 'unverifiable'])) assert.equal(shardsFor(att({ verdict })), 0, verdict);
  assert.equal(shardsFor(att({}, { interaction: 'why', constructed: false, variant: 'which-invariant' })), 0);
  assert.equal(shardsFor(att({}, { interaction: 'why', constructed: false })), 0);
  assert.equal(shardsFor(att({}, { interaction: 'why', constructed: false, variant: 'hidden-1' })), 2);
});

test('tiers: 10t EP reaches tier t, capped at 10', () => {
  assert.deepEqual([0, 9, 10, 55, 99, 100, 120].map(tierFor), [0, 0, 1, 5, 9, 10, 10]);
});

test('clusters match section 8', () => {
  assert.deepEqual(clusterSkills('balance'), ['equivalent-expressions', 'distribute', 'solution-meaning', 'balance-moves', 'solve-linear']);
  assert.equal(clusterSkills('mint').length, 7);
});

test('EP totals, Warden eligibility and the Gate from a log', () => {
  const b = logBuilder();
  const bal = clusterSkills('balance');
  // two sessions to box 2, then evidence on days 3 and 5 for every balance skill
  b.day(0).start(); for (const s of bal) b.attempt(s); b.end();
  b.day(1).start(); for (const s of bal) b.attempt(s); b.end();
  b.day(3).start(); for (const s of bal) b.evidence(s); b.end();
  let st = replay(b.events);
  assert.equal(epTotal(st), 5);
  assert.equal(wardenEligible(st, 'balance'), false);
  b.day(5).start(); for (const s of bal.slice(0, 4)) b.evidence(s); b.end();
  st = replay(b.events);
  assert.equal(wardenEligible(st, 'balance'), false, 'one skill still at 1 EP');
  b.day(5).start().evidence('solve-linear').end(); // same day: does it count? gap from day 3 is 2: yes
  st = replay(b.events);
  assert.equal(wardenEligible(st, 'balance'), true);
  const d0 = dayOf('2026-01-05');
  assert.equal(wardenAvailable(st, 'balance', d0 + 5), true);
  assert.equal(wardenEligible(st, 'none'), false);
  const g = gateStatus(st, d0 + 5);
  assert.deepEqual(g, { open: false, reason: null, ep: 10, tier: 1 });
  assert.deepEqual(gateStatus(st, d0 + 65), { open: true, reason: 'day', ep: 10, tier: 1 }, 'opens anyway on day 65');
  assert.equal(gateStatus(st, d0 + 64).open, false);
  assert.equal(gateStatus(st, d0 + 5, { gateEP: 10 }).reason, 'ep');
  const sum = seasonSummary(st, d0 + 5);
  assert.equal(sum.epMax, 120);
  assert.equal(sum.wardens.balance.eligible, true);
});

test('EP counts A-priority skills only', () => {
  const b = logBuilder();
  b.day(0).start().attempt('systems-linear').end();
  b.day(1).start().attempt('systems-linear').end();
  b.day(3).start().evidence('systems-linear').end();
  const st = replay(b.events);
  assert.equal(st.skills['systems-linear'].evidence.length, 1);
  assert.equal(epTotal(st), 0);
  assert.equal(skills.filter((d) => d.priority === 'A').length, 40);
});
