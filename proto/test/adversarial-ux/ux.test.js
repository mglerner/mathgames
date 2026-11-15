// @ts-check
// Adversarial review (DOM layer, pedagogy-as-experienced). Drives the real app.js through the
// builder's fake document. Tests marked `todo` reproduce defects found in review: they run and
// report, but do not turn the suite red. When a defect is fixed, drop its `todo`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from '../../js/app.js';
import { makeDocument, FakeNode, byAct, findAll } from '../fakedom.js';
import { generate } from '../../js/gens/index.js';
import { judge } from '../../js/judge.js';
import { buildFeedback } from '../../js/feedback.js';
import { makeRng } from '../../js/rng.js';
import { toKeys } from '../helpers.js';

function memStorage() {
  /** @type {Map<string, string>} */
  const m = new Map();
  return { getItem: (/** @type {string} */ k) => (m.has(k) ? m.get(k) ?? null : null), setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, v) };
}

/** @param {string} search @param {any} [storage] */
function boot(search, storage = memStorage()) {
  const doc = makeDocument();
  const root = new FakeNode('div');
  let t = 1700000000000;
  let rb = 7;
  /** @type {any} */
  const winListeners = {};
  const win = { addEventListener: (/** @type {string} */ ty, /** @type {any} */ fn) => ((winListeners[ty] ||= []).push(fn)) };
  const app = startApp(root, {
    doc,
    storage,
    nowMs: () => (t += 500),
    randomBytes: (n) => Uint8Array.from({ length: n }, () => (rb = (rb * 73 + 41) % 256)),
    search,
    download: () => true,
    win,
  });
  /** @param {string} act */
  const tap = (act) => {
    const b = byAct(root, act);
    assert.ok(b.length >= 1, `no button ${act} on screen ${app.ui.screen}`);
    b[0].dispatch('pointerdown');
  };
  /** @param {string} key */
  const key = (key) => {
    for (const fn of winListeners.keydown || []) fn({ key, preventDefault() {} });
  };
  /** @param {string} text */
  const type = (text) => {
    tap('key-clr');
    for (const k of toKeys(text)) tap(`key-${k}`);
  };
  return { root, app, tap, type, key };
}

const KEYTOKS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '(', ')', '+', '-', '^', '/', '=', 'x', 'sqrt', 'del'];

/** An enabled way forward must exist on every encounter state. @param {any} root @param {any} app */
function assertNotDeadEnd(root, app) {
  if (app.ui.screen !== 'encounter') return;
  if (app.ui.locked) {
    assert.equal(byAct(root, 'next').length, 1, 'locked Knot must show exactly one Next');
    return;
  }
  if (app.ui.problem.interaction === 'strike') {
    assert.equal(byAct(root, 'key-commit').length, 1, 'open Strike must show the Strike key');
  } else {
    const live = findAll(root, (n) => (n.getAttribute('class') || '').split(' ').includes('chip') && !n.classList.contains('spent'));
    assert.ok(live.some((n) => app.ui.problem.choices.find((/** @type {any} */ c) => c.id === n.getAttribute('data-choice')).verdict !== 'legal-idle'), 'a resolving chip must remain');
  }
}

test('fuzz: random keypad input on every Strike generator never throws and never dead-ends', () => {
  const rng = makeRng('adv-ux-fuzz');
  for (const gen of ['ftw', 'sqrtsq', 'rat', 'quad']) {
    for (let s = 0; s < 60; s++) {
      const { root, app, tap } = boot(`?item=${gen}:fz${s}:strike`);
      tap('descend');
      for (let a = 0; a < 25 && app.ui.screen === 'encounter' && !app.ui.locked; a++) {
        tap('key-clr');
        const len = 1 + rng.int(0, 13);
        for (let i = 0; i < len; i++) tap(`key-${KEYTOKS[rng.int(0, KEYTOKS.length - 1)]}`);
        tap('key-commit');
        assertNotDeadEnd(root, app);
      }
      if (app.ui.locked) {
        tap('why');
        tap('next');
        assert.ok(['encounter', 'haul'].includes(app.ui.screen));
      }
    }
  }
});

test('every pick order on every choice item resolves, never re-commits a spent chip, never throws', () => {
  for (const [gen, inter] of [['ftw', 'forge'], ['ftw', 'nextline'], ['rat', 'forge'], ['quad', 'nextline']]) {
    for (let s = 0; s < 40; s++) {
      const p = generate(gen, `ch${s}`, inter);
      for (const first of p.choices) {
        const { root, app, tap } = boot(`?item=${gen}:ch${s}:${inter}`);
        tap('descend');
        tap(`choice-${first.id}`);
        tap('commit');
        if (!app.ui.locked) tap('commit'); // double commit on an open Knot
        assertNotDeadEnd(root, app);
        if (!app.ui.locked) {
          // the spent chip cannot be picked again
          tap(`choice-${first.id}`);
          assert.equal(app.ui.selected, null);
          const other = p.choices.find((/** @type {any} */ c) => c.verdict === 'correct');
          tap(`choice-${other.id}`);
          tap('commit');
        }
        assert.ok(app.ui.locked);
        const attempts = app.log.all().filter((e) => e.type === 'attempt');
        assert.ok(attempts.length <= 2, 'double commit must not log twice');
      }
    }
  }
});

test('physical keyboard: Enter after a resolve goes to the next item exactly once', () => {
  const { app, type, tap, key } = boot('?item=sqrtsq:parent-5:strike,sqrtsq:parent-5:strike');
  tap('descend');
  type('3');
  key('Enter');
  assert.ok(app.ui.locked);
  key('Enter');
  assert.equal(app.ui.run.pos, 1);
  key('Enter'); // empty input: no commit
  assert.equal(app.ui.locked, false);
});

test('event log: every event and attempt has exactly the section 11 fields', () => {
  const { app, tap, type } = boot('?item=quad:parent-998:strike,ftw:parent-85:forge,rat:parent-15:forge');
  tap('descend');
  type('2x^2+4x+6=0');
  tap('key-commit');
  tap('report');
  tap('next');
  const p2 = app.ui.problem;
  tap(`choice-${p2.choices.find((/** @type {any} */ c) => c.verdict === 'correct').id}`);
  tap('commit');
  const ev = app.log.all();
  const EV = ['build', 'data', 'device', 'id', 't', 'type', 'v'];
  const AT = ['ambiguous', 'context', 'evidence', 'fadeLevel', 'firstTry', 'hintsUsed', 'misconceptions', 'ms', 'problem', 'response', 'verdict'];
  const PR = ['constructed', 'difficulty', 'gen', 'interaction', 'seed', 'skill', 'version'];
  const TYPES = ['attempt', 'award', 'session-start', 'session-end', 'unlock', 'placement', 'report', 'paper-bridge', 'setting'];
  for (const e of ev) {
    assert.deepEqual(Object.keys(e).sort(), EV);
    assert.ok(TYPES.includes(e.type));
    assert.match(e.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    if (e.type === 'attempt') {
      assert.deepEqual(Object.keys(e.data).sort(), AT);
      assert.deepEqual(Object.keys(e.data.problem).filter((k) => k !== 'variant').sort(), PR);
    }
  }
  const miss = ev.find((e) => e.type === 'attempt' && e.data.verdict === 'wrong');
  assert.ok(miss.data.ambiguous && miss.data.misconceptions.length === 2);
});

// ------------------------------------------------------------------ defects (todo)

test('DEFECT: after "same value, not finished" the Lantern prints the finished answer', () => {
  for (const [item, unfinished, answerText] of [
    ['rat:parent-15:strike', '6sqrt3/3', '23'], // the radical sign is an SVG hook with no text
    ['ftw:parent-85:strike', '8/6', '43'],
    ['sqrtsq:parent-5:strike', 'sqrt9', '3'],
  ]) {
    const { root, app, tap, type } = boot(`?item=${item}`);
    tap('descend');
    type(unfinished);
    tap('key-commit');
    assert.equal(app.ui.fb.verdict, 'form');
    assert.equal(app.ui.locked, false, 'Knot still open');
    const knotRow = findAll(root, (n) => (n.getAttribute('class') || '') === 'rrow rk')[0];
    const shown = knotRow.textContent.replace(/about.*/, '').replace('Knot', '');
    assert.notEqual(shown, answerText, `${item}: open Knot's Lantern shows the answer ${shown}`);
  }
});

test('DEFECT: a cubic with an extra root is told "Same solutions"', () => {
  const p = generate('quad', 'parent-998', 'strike'); // 6 + 4x = 2x^2, solutions {-1, 3}
  const r = judge(p, 'x^3-2x^2-3x=0'); // solutions {-1, 0, 3}
  const fb = buildFeedback(p, r);
  const line = fb.line.filter((x) => typeof x === 'string').join('');
  assert.ok(!/Same solutions/.test(line), `shown: "${line}" for an equation with the extra root x = 0`);
  assert.equal(r.verdict, 'wrong');
});

test('DEFECT: Commit and Next sit in the same spot and fire on pointerdown with no guard', () => {
  const { root, app, tap, type } = boot('?item=sqrtsq:parent-5:strike,ftw:parent-85:strike');
  tap('descend');
  type('9');
  tap('key-commit');
  // second tap of a double tap: the bottom of .input now holds the Next button
  const input = app.ui.refs.input;
  const bottom = input.lastChild.lastChild;
  assert.equal(bottom.getAttribute('data-act'), 'next');
  bottom.dispatch('pointerdown');
  assert.equal(app.ui.run.pos, 0, 'feedback panel was skipped by the second tap');
  void root;
});

test('DEFECT: the Haul says every Knot was untied even when every planned Knot was missed', () => {
  const { root, app, tap } = boot('?item=ftw:a:forge,rat:b:forge');
  tap('descend');
  for (let g = 0; app.ui.screen === 'encounter' && g < 20; g++) {
    const p = app.ui.problem;
    const isEcho = app.ui.run.queue[app.ui.run.pos].context === 'echo';
    tap(`choice-${p.choices.find((/** @type {any} */ c) => c.verdict === (isEcho ? 'correct' : 'wrong')).id}`);
    tap('commit');
    // fixer: Next now ignores taps within NEXT_GUARD_MS of the panel (the double-tap defect
    // below); this fake clock moves 500 ms per call, so a second tap is the "later" tap.
    for (let k = 0; k < 3 && app.ui.locked && app.ui.screen === 'encounter'; k++) tap('next');
  }
  assert.equal(app.ui.screen, 'haul');
  const lines = findAll(root, (n) => n.tagName === 'LI').map((n) => n.textContent);
  assert.ok(!lines.includes('Knots untied: 2 of 2'), `both planned Knots were missed, Haul shows: ${lines.join(' | ')}`);
  assert.ok(lines.includes('Knots untied: 0 of 2'), lines.join(' | '));
});

test('DEFECT: the report button is under the 48px tap-target minimum', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../style.css', import.meta.url), 'utf8');
  const rule = /\.hud \.ghost \{([^}]*)\}/.exec(css);
  assert.ok(rule);
  const mh = /min-height:\s*(\d+)px/.exec(rule[1]);
  assert.ok(mh && Number(mh[1]) >= 48, `report button min-height ${mh && mh[1]}px`);
});
