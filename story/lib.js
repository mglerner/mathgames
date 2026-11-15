// @ts-check
// Page-building helpers shared by the menu and both episodes.
import { createRun, step, jump, slide, resume, VIEW_W, VIEW_H } from './game/sim.js';
import { drawRun } from './game/draw.js';

export const paras = (/** @type {string[]} */ list) => list.map((p) => `<p>${p}</p>`).join('');
export const lines = (/** @type {string[]} */ xs) => `<div class="work">${xs.map((l) => `<div>${l}</div>`).join('')}</div>`;

// A running section can end while a finger is still on JUMP. The next screen then appears under
// that finger, and the phone may deliver the tap to whatever is there (an answer, say). So taps
// are ignored for a moment after a run ends by itself.
let quietUntil = 0;

/** @param {string} label @param {(e?: any) => void} fn @param {string} [cls] */
export function button(label, fn, cls = 'btn') {
  const b = document.createElement('button');
  b.className = cls;
  b.innerHTML = label;
  b.addEventListener('click', (/** @type {any} */ e) => { if (Date.now() >= quietUntil) fn(e); });
  return b;
}

/** Answer grid: two columns for short answers, one column when any label is long (phones are ~400px wide). */
export function optionList(/** @type {{html: string}[]} */ options) {
  const list = document.createElement('div');
  const longest = Math.max(...options.map((o) => o.html.replace(/<[^>]*>/g, '').replace(/&\w+;/g, 'x').length));
  list.className = longest > 7 ? 'options wide' : 'options';
  return list;
}

export function shuffled(/** @type {any[]} */ xs) {
  const a = xs.slice();
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

/** @param {string} name @param {string} legend @param {string[]} choices */
export const radios = (name, legend, choices) => `<fieldset><legend>${legend}</legend>${choices.map((v) =>
  `<label class="radio"><input type="radio" name="${name}" value="${v}"> ${v}</label>`).join('')}</fieldset>`;

// Visiting /teacher once marks this device as a teacher's test device (see teacher/index.html);
// every report sent from it is then labelled as a test run.
export const TESTER = (() => { try { return localStorage.getItem('story:tester') === '1'; } catch { return false; } })();

/** Send a plain-text report to the site (feedback.php). Resolves false offline or on a static-only server. */
export function post(/** @type {string} */ sid, /** @type {string} */ report) {
  try {
    return fetch('feedback.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, report }),
    }).then((r) => r.ok, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

export const newSid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

// One screen at a time may own a running loop or key listener; whoever draws the next screen stops it.
let stop = () => {};
export const cleanup = () => { const s = stop; stop = () => {}; s(); };
export const onCleanup = (/** @type {() => void} */ fn) => { stop = fn; };

/**
 * A running section: canvas, a line of dialogue, and two big buttons.
 * @param {HTMLElement} main @param {import('./game/sim.js').Level} level @param {string[]} gear
 * @param {(hits: number, skipped: boolean) => void} onDone
 */
export function runScreen(main, level, gear, onDone) {
  const r = createRun(level, gear);
  const canvas = document.createElement('canvas');
  canvas.className = 'stage';
  const beat = document.createElement('div');
  beat.className = 'beat';
  const showBeat = () => {
    beat.innerHTML = r.paused
      ? `<b>${r.paused.who}:</b> ${r.paused.text} <span class="tap">Tap a button to go.</span>`
      : `<span class="tap">JUMP the low things. SLIDE under the high ones.</span>`;
  };
  // While a line of dialogue is up, any press just dismisses it.
  const act = (/** @type {(r: any) => void} */ fn) => (/** @type {any} */ e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (r.paused) { resume(r); showBeat(); } else fn(r);
  };
  const padBtn = (/** @type {string} */ label, /** @type {(r: any) => void} */ fn) => {
    const b = document.createElement('button');
    b.className = 'padbtn';
    b.innerHTML = label;
    b.addEventListener('pointerdown', act(fn));
    return b;
  };
  const pad = document.createElement('div');
  pad.className = 'pad';
  pad.append(padBtn('SLIDE', slide), padBtn('JUMP', jump));
  canvas.addEventListener('pointerdown', act(jump));
  const finish = (/** @type {boolean} */ skipped) => { cleanup(); if (!skipped) quietUntil = Date.now() + 400; onDone(r.hits, skipped); };
  main.append(canvas, beat, pad, button('Skip the running', () => finish(true), 'link'));
  showBeat();

  const ctx = canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx || typeof requestAnimationFrame === 'undefined') return; // no canvas: the Skip link still works
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = VIEW_W * dpr;
  canvas.height = VIEW_H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') act(jump)(e);
    else if (e.code === 'ArrowDown') act(slide)(e);
  };
  window.addEventListener('keydown', onKey);
  let raf = 0, last = 0, alive = true;
  /** @type {any} */ let shown = null;
  const frame = (/** @type {number} */ now) => {
    if (!alive) return;
    step(r, last ? (now - last) / 1000 : 0);
    last = now;
    if (r.paused !== shown) { shown = r.paused; showBeat(); }
    drawRun(ctx, r);
    if (r.done) { finish(false); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  onCleanup(() => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
  });
}

/**
 * The last screen of an episode: the report as plain text, sent to the site, with a Copy fallback.
 * @param {HTMLElement} main @param {string} text @param {Promise<boolean>} sent
 */
export function notesScreen(main, text, sent) {
  main.innerHTML = `<h2>Job notes</h2><p>Everything from this run, as plain text.</p>`;
  const status = document.createElement('p');
  status.className = 'hint';
  status.textContent = 'Sending to your teacher...';
  sent.then((ok) => {
    status.textContent = ok ? 'Sent to your teacher. Nothing else to do.' : 'Could not send from here. Use the Copy button and send it to your teacher yourself.';
  });
  const box = document.createElement('textarea');
  box.readOnly = true;
  box.rows = 18;
  box.className = 'report';
  box.value = text; // user text goes in via .value, never innerHTML
  const copy = button('Copy the notes', () => {
    box.select();
    const done = () => { copy.innerHTML = 'Copied'; };
    // Clipboard API needs https or localhost; fall back to the old command elsewhere.
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(box.value).then(done, () => {});
    else if (document.execCommand('copy')) done();
    else copy.innerHTML = 'Select the text above and copy it';
  }, 'btn quiet');
  main.append(status, box, copy);
}

/**
 * Links under every screen: back to the episode list, and a two-tap restart of this episode.
 * @param {HTMLElement} app @param {() => void} toMenu @param {() => void} reset
 */
export function footer(app, toMenu, reset) {
  const foot = document.createElement('footer');
  let armed = false;
  const again = button('Start this episode over', () => {
    if (!armed) { armed = true; again.innerHTML = 'Sure? This wipes your progress in this episode on this device. Tap again.'; return; }
    reset();
  }, 'link');
  foot.append(button('Episodes', toMenu, 'link'), again);
  app.append(foot);
}
