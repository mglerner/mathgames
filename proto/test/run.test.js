// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, GENS } from '../js/gens/index.js';
import { print } from '../js/print.js';
import { EXAMPLES } from '../js/examples.js';
import { createRun, current, resolve, advance, done, ROTATION } from '../js/run.js';
import { ulid, makeLog, makeAttempt, BUILD } from '../js/events.js';
import { VOCAB, makeSighting } from '../js/vocab.js';
import { MALRULES } from '../js/malrules.js';
import { makeRng } from '../js/rng.js';
import { buildFeedback, wordCount } from '../js/feedback.js';

test('teacher examples are reproducible by the documented seeds, in every interaction', () => {
  const want = { fracTimesWhole: '4*1/3', sqrtSquared: 'sqrt3*sqrt3', rationalize: '6/sqrt3', quadratic: '6+4x=2x^2' };
  for (const [name, e] of Object.entries(EXAMPLES)) {
    for (const inter of GENS[e.gen].INTERACTIONS) {
      assert.equal(print(generate(e.gen, e.seed, inter).prompt.math), /** @type {any} */ (want)[name], `${name} ${inter}`);
    }
  }
});

test('rotation: 10 Knots, seeded per run so runs differ; deterministic per seed', () => {
  assert.equal(ROTATION.length, 10);
  const a = createRun('alpha');
  const b = createRun('beta');
  const keysA = [];
  const keysB = [];
  for (let i = 0; i < 10; i++) {
    keysA.push(current(a).key);
    keysB.push(current(b).key);
    advance(a);
    advance(b);
  }
  assert.notDeepEqual(keysA, keysB);
  const a2 = createRun('alpha');
  for (let i = 0; i < 10; i++) {
    assert.equal(current(a2).key, keysA[i]);
    advance(a2);
  }
});

test('an Echo follows every miss; a run never ends on a miss (2000 simulated runs)', () => {
  const rng = makeRng('sim');
  for (let k = 0; k < 2000; k++) {
    const run = createRun(`sim${k}`);
    const missRate = [0, 0.3, 0.7, 0.95][k % 4];
    let last = '';
    let steps = 0;
    while (!done(run)) {
      const p = current(run);
      const miss = rng.u32() / 4294967296 < missRate && steps < 60;
      const before = run.queue.length;
      const echo = resolve(run, { verdict: miss ? 'wrong' : 'correct', firstTry: true, tags: [], ambiguous: false });
      if (miss) {
        assert.ok(echo, 'miss queues an Echo');
        assert.equal(run.queue.length, before + 1);
        const idx = run.queue.indexOf(/** @type {any} */ (echo));
        assert.ok(idx > run.pos && idx <= run.pos + 2, 'Echo within 2');
        const ep = generate(echo.gen, echo.seed, echo.interaction);
        assert.equal(ep.gen, p.gen);
        assert.equal(ep.interaction, p.interaction);
        assert.notEqual(ep.key, p.key, 'the same item is never repeated as its own Echo');
      }
      last = miss ? 'miss' : 'ok';
      advance(run);
      steps++;
    }
    assert.equal(last, 'ok', 'run ended on a miss');
  }
});

test('events: ULID shape and order; Attempt shape; storage failures never throw', () => {
  const r = new Uint8Array(10).fill(255);
  const a = ulid(1700000000000, r);
  const b = ulid(1700000000001, new Uint8Array(10));
  assert.match(a, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.ok(a.slice(0, 10) < b.slice(0, 10));
  const throwing = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  let t = 0;
  const env = { storage: throwing, nowMs: () => ++t, randomBytes: (/** @type {number} */ n) => new Uint8Array(n) };
  const log = makeLog(env);
  const p = generate('ftw', 'x', 'strike');
  const ev = log.append('attempt', makeAttempt(p, { response: '4/3', verdict: 'correct', firstTry: true, context: 'mixed', misconceptions: [], ambiguous: false, ms: 1234 }));
  assert.equal(log.persisted, false);
  assert.equal(log.all().length, 1, 'kept in memory for export');
  for (const k of ['id', 'v', 't', 'build', 'device', 'type', 'data']) assert.ok(k in ev, k);
  assert.equal(ev.build, BUILD);
  const att = /** @type {any} */ (ev.data);
  for (const k of ['problem', 'response', 'verdict', 'firstTry', 'hintsUsed', 'fadeLevel', 'evidence', 'context', 'misconceptions', 'ambiguous', 'ms']) assert.ok(k in att, k);
  for (const k of ['gen', 'version', 'seed', 'skill', 'difficulty', 'interaction', 'constructed']) assert.ok(k in att.problem, k);
  assert.equal(att.problem.constructed, true);
  assert.doesNotThrow(() => JSON.parse(log.exportJSON()));
  // null storage
  const log2 = makeLog({ storage: null, nowMs: () => 5, randomBytes: (/** @type {number} */ n) => new Uint8Array(n) });
  log2.append('setting', {});
  assert.equal(log2.all().length, 1);
});

test('vocabulary lint: every in-world name and Haunt has a standard term', () => {
  for (const [k, v] of Object.entries(VOCAB)) assert.ok(v.name && v.standardTerm && v.standardTerm.length > 2, k);
  for (const m of MALRULES) {
    assert.ok(m.haunt && m.standardTerm, m.id);
    assert.ok([3, 4, 5, 8, 11, 18, 19].includes(m.n));
  }
  assert.equal(MALRULES.length, 7);
  const s = makeSighting();
  assert.equal(s.label('lantern'), 'Lantern = substitution check');
  assert.equal(s.label('lantern'), 'Lantern');
});

test('fixed feedback lines are 15 words or fewer', () => {
  for (const verdict of ['form', 'legal-idle', 'unparsed', 'unverifiable', 'wrong']) {
    for (const [gen, inter] of ROTATION) {
      const p = generate(gen, 'w', inter);
      const fb = buildFeedback(p, /** @type {any} */ ({ verdict, tags: [], ambiguous: false, why: 'x' }));
      assert.ok(wordCount(fb.line) <= 15);
      const fb2 = buildFeedback(p, /** @type {any} */ ({ verdict: 'wrong', tags: ['copy-coefficients', 'transpose-no-sign-change'], ambiguous: true }));
      assert.ok(wordCount(fb2.line) <= 15);
    }
  }
});
