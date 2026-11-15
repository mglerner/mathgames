// @ts-check
// Headless smoke test: the real app.js driven through a fake document, one full run end to end
// (Descend -> 10 Knots + Echoes -> Haul -> export), tapping the same buttons a thumb would.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from '../js/app.js';
import { makeDocument, FakeNode, byAct, findAll } from './fakedom.js';
import { print } from '../js/print.js';
import { malrule, applicable } from '../js/malrules.js';
import { toKeys } from './helpers.js';

function memStorage() {
  /** @type {Map<string, string>} */
  const m = new Map();
  return { getItem: (/** @type {string} */ k) => (m.has(k) ? /** @type {string} */ (m.get(k)) : null), setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, v), m };
}

/** @param {any} storage @param {string} search */
function boot(storage, search) {
  const doc = makeDocument();
  const root = new FakeNode('div');
  let t = 1700000000000;
  let rb = 0;
  /** @type {string[]} */
  const downloads = [];
  const app = startApp(root, {
    doc,
    storage,
    nowMs: () => (t += 750),
    randomBytes: (n) => Uint8Array.from({ length: n }, () => (rb = (rb * 73 + 41) % 256)),
    search,
    download: (_name, text) => {
      downloads.push(text);
      return true;
    },
  });
  /** @param {string} act */
  const tap = (act) => {
    const b = byAct(root, act);
    assert.ok(b.length >= 1, `no button ${act} on screen ${app.ui.screen}`);
    b[0].dispatch('pointerdown');
  };
  /** @param {string} text */
  const type = (text) => {
    tap('key-clr');
    for (const k of toKeys(text)) tap(`key-${k}`);
  };
  return { root, app, tap, type, downloads };
}

/** @param {any} p */
function correctResponse(p) {
  if (p.interaction !== 'strike') return p.choices.find((/** @type {any} */ c) => c.verdict === 'correct').id;
  return print(p.answer.display);
}

/** @param {any} p */
function wrongResponse(p) {
  if (p.interaction !== 'strike') return p.choices.find((/** @type {any} */ c) => c.verdict === 'wrong').id;
  return print(applicable(p)[0].apply(p)[0]);
}

test('a full run plays end to end through the DOM layer, with misses, a form answer and garbage', () => {
  const storage = memStorage();
  const { root, app, tap, type, downloads } = boot(storage, '?seed=smoke');
  assert.equal(app.ui.screen, 'start');
  tap('descend');
  let knots = 0;
  let echoes = 0;
  let missesPlanned = 2;
  let last = '';
  let guard = 0;
  while (app.ui.screen === 'encounter') {
    assert.ok(guard++ < 40, 'run did not end');
    const p = app.ui.problem;
    const isEcho = app.ui.run.queue[app.ui.run.pos].context === 'echo';
    if (isEcho) echoes++;
    else knots++;
    // the Knot, the prompt and the instrument are on screen
    assert.equal(findAll(root, (n) => n.tagName === 'SVG' && (n.getAttribute('class') || '').includes('knot')).length, 1);
    if (p.interaction === 'strike') {
      // garbage first: unparsed, nothing counted, item stays
      type('((');
      tap('key-commit');
      assert.equal(app.ui.screen, 'encounter');
      assert.equal(byAct(root, 'next').length, 0, 'garbage must not resolve the Knot');
      assert.equal(app.ui.counted, 0);
    }
    if (p.gen === 'ftw' && p.interaction === 'strike') {
      const { n, a, b } = p.data;
      type(`${2n * n * a}/${2n * b}`);
      tap('key-commit');
      assert.equal(app.ui.fb.verdict, 'form');
      assert.equal(byAct(root, 'next').length, 0, 'same value, not finished keeps the Knot open');
    }
    if (p.gen === 'rat' && p.interaction === 'forge') {
      const idle = p.choices.find((/** @type {any} */ c) => c.verdict === 'legal-idle');
      tap(`choice-${idle.id}`);
      tap('commit');
      assert.equal(app.ui.fb.verdict, 'legal-idle');
      assert.equal(byAct(root, 'next').length, 0);
    }
    const miss = missesPlanned > 0 && !isEcho && knots >= 2;
    const resp = miss ? wrongResponse(p) : correctResponse(p);
    if (miss) missesPlanned--;
    if (p.interaction === 'strike') {
      type(resp);
      tap('key-commit');
    } else {
      tap(`choice-${resp}`);
      tap('commit');
    }
    assert.equal(app.ui.fb.verdict, miss ? 'wrong' : 'correct', `${p.id} ${resp}`);
    assert.ok(byAct(root, 'next').length === 1, 'resolved Knot shows Next');
    // the why? expander opens
    tap('why');
    const body = findAll(root, (n) => (n.getAttribute('class') || '').startsWith('whybody'));
    assert.equal(body.length, 1);
    assert.ok(!body[0].classList.contains('hidden'));
    // instrument readout is present (Lantern or Scale)
    assert.ok(findAll(root, (n) => /\b(lanternbox|scalebox)\b/.test(n.getAttribute('class') || '')).length === 1);
    if (miss) assert.ok(root.textContent.includes('Echo queued'));
    last = miss ? 'miss' : 'ok';
    tap('next');
  }
  assert.equal(app.ui.screen, 'haul');
  assert.equal(last, 'ok');
  assert.equal(knots, 10);
  assert.equal(echoes, 2);
  assert.ok(root.textContent.includes('Haul'));
  tap('export');
  assert.equal(downloads.length, 1);
  const out = JSON.parse(downloads[0]);
  const types = out.events.map((/** @type {any} */ e) => e.type);
  assert.equal(types[0], 'session-start');
  assert.equal(types[types.length - 1], 'session-end');
  const attempts = out.events.filter((/** @type {any} */ e) => e.type === 'attempt').map((/** @type {any} */ e) => e.data);
  assert.ok(attempts.some((/** @type {any} */ a) => a.verdict === 'unparsed'));
  assert.ok(attempts.some((/** @type {any} */ a) => a.verdict === 'form'));
  assert.ok(attempts.some((/** @type {any} */ a) => a.verdict === 'legal-idle'));
  assert.equal(attempts.filter((/** @type {any} */ a) => a.verdict === 'wrong').length, 2);
  assert.ok(attempts.some((/** @type {any} */ a) => a.context === 'echo'));
  // tagged misses carry their mal-rule id
  for (const a of attempts.filter((/** @type {any} */ x) => x.verdict === 'wrong')) assert.ok(a.misconceptions.length >= 1);
  // persisted to storage too
  const stored = JSON.parse(/** @type {string} */ (storage.getItem('keystone-proto.events')));
  assert.equal(stored.length, out.events.length);
  // ids unique and sortable
  const ids = out.events.map((/** @type {any} */ e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), ids);
  // descend again starts a fresh run
  tap('descend');
  assert.equal(app.ui.screen, 'encounter');
  assert.ok(malrule('copy-coefficients'));
});

test('the app runs with storage that throws on every access', () => {
  const bad = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceeded');
    },
  };
  const { app, tap, type } = boot(bad, '?item=quad:parent-998:strike,ftw:parent-85:nextline');
  tap('descend');
  type('0=2x^2-4x-6');
  tap('key-commit');
  assert.equal(app.ui.fb.verdict, 'correct');
  tap('next');
  const p = app.ui.problem;
  tap(`choice-${p.choices.find((/** @type {any} */ c) => c.verdict === 'correct').id}`);
  tap('commit');
  tap('next');
  assert.equal(app.ui.screen, 'haul');
  assert.equal(app.log.persisted, false);
  tap('export');
});

test('keypad: x key is disabled on numeric items; preview never throws on partial input', () => {
  const { root, app, tap } = boot(memStorage(), '?item=rat:parent-15:strike');
  tap('descend');
  tap('key-x');
  assert.equal(app.ui.tokens.length, 0);
  for (const k of ['6', '/', 'sqrt', '(', '3', '-', ')', '^', '=', 'del', 'del', 'del', 'del', 'del', 'del', 'del', 'del', 'del']) tap(`key-${k}`);
  assert.equal(app.ui.tokens.length, 0);
  for (let i = 0; i < 60; i++) tap('key-9');
  assert.ok(app.ui.tokens.length <= 40);
  tap('key-commit');
  assert.equal(byAct(root, 'next').length, 0, 'too-long garbage is unparsed');
});
