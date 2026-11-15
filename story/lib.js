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

// A screen may own running loops and key listeners; whoever draws the next screen stops them all.
let stop = () => {};
export const cleanup = () => { const s = stop; stop = () => {}; s(); };
export const onCleanup = (/** @type {() => void} */ fn) => { const prev = stop; stop = () => { prev(); fn(); }; };

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

// ---------------------------------------------------------------- typed answers and the note after a miss
/**
 * A problem with empty boxes and an on-screen keypad (whole numbers, with a minus sign).
 * @param {HTMLElement} main @param {any} p @param {(vals: number[]) => void} onEnter
 */
export function typedPanel(main, p, onEnter) {
  const vals = Array(p.boxes).fill(''); // what is typed in each box
  // Some boxes are the second term of an expression. Their sign is not typed into the box: it is
  // the + or - written between the terms, chosen separately, so the line reads like "-4x + 12".
  /** @type {Record<number, string>} */ const signs = {};
  const split = (/** @type {number} */ i) => (p.signed || []).includes(i);
  let on = 0;
  const ask = document.createElement('div');
  ask.className = 'ask typed';
  const ok = () => vals.every((v, i) => (split(i) ? /^\d+$/.test(v) && !!signs[i] : /^-?\d+$/.test(v)));
  const numbers = () => vals.map((v, i) => Number(v) * (signs[i] === '-' ? -1 : 1));
  const enter = button('Enter', () => { if (ok()) onEnter(numbers()); }, 'key go');
  const flip = (/** @type {number} */ i) => { signs[i] = signs[i] === '+' ? '-' : '+'; };
  const paint = () => {
    ask.innerHTML = p.typed
      .replace(/\{s(\d)\}/g, (/** @type {string} */ _, /** @type {string} */ i) =>
        `<span class="sgn${signs[+i] ? '' : ' unset'}${!signs[+i] && vals[+i] ? ' need' : ''}" data-s="${i}">${signs[+i] === '-' ? '&minus;' : signs[+i] || '&plusmn;'}</span>`)
      .replace(/\{(\d)\}/g, (/** @type {string} */ _, /** @type {string} */ i) =>
        `<span class="box${+i === on ? ' on' : ''}" data-i="${i}">${vals[+i].replace('-', '&minus;') || '&nbsp;'}</span>`);
    enter.disabled = !ok();
  };
  const press = (/** @type {string} */ k) => {
    let v = vals[on];
    if (k === 'next') { on = (on + 1) % p.boxes; paint(); return; }
    if (k === '-' && split(on)) { flip(on); paint(); return; }
    if (k === 'del') v = v.slice(0, -1);
    else if (k === '-') v = v.startsWith('-') ? v.slice(1) : `-${v}`;
    else if (v.replace('-', '').length < 4) v += k;
    vals[on] = v;
    paint();
  };
  ask.addEventListener('click', (/** @type {any} */ e) => {
    const hit = e && e.target && e.target.closest ? e.target.closest('[data-i], [data-s]') : null;
    if (!hit) return;
    if (hit.dataset.s !== undefined) { on = +hit.dataset.s; flip(on); } else on = +hit.dataset.i;
    paint();
  });
  const keys = document.createElement('div');
  keys.className = 'keys';
  const key = (/** @type {string} */ label, /** @type {string} */ k, cls = 'key') => button(label, () => press(k), cls);
  const next = key('Next box', 'next', 'key fn');
  next.disabled = p.boxes < 2;
  const sign = key('+/&minus;', '-', 'key sign');
  sign.disabled = !p.neg; // square-root answers are never negative, so the key is switched off there
  keys.append(
    key('7', '7'), key('8', '8'), key('9', '9'), key('Del', 'del', 'key fn'),
    key('4', '4'), key('5', '5'), key('6', '6'), sign,
    key('1', '1'), key('2', '2'), key('3', '3'), next,
    key('0', '0', 'key zero'), enter,
  );
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.innerHTML = p.typedHint;
  main.append(ask, keys, hint);
  paint();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if ((e.key === '-' || e.key === '+') && split(on)) { signs[on] = e.key; paint(); } else if (e.key === '-' && p.neg) press('-');
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Tab' && p.boxes > 1) { e.preventDefault(); press('next'); } else if (e.key === 'Enter') {
        e.preventDefault(); // otherwise Enter also "clicks" whichever keypad button was tapped last
        if (ok()) onEnter(numbers());
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  }
}

const MATCH = ['Yes', 'Sort of', 'No, I did something else'];
/**
 * The reflection under every explanation: (when guessed working was shown) "was that what you
 * wrote?", and always one sentence in the student's own words. Both are required before the button works.
 * @param {HTMLElement} main @param {boolean} asked whether the match question is on this page
 * @param {string} label @param {(note: {match: any, text: string}) => void} onNext
 */
export function reflect(main, asked, label, onNext) {
  const ta = document.createElement('textarea');
  ta.id = 'note';
  ta.rows = 3;
  ta.placeholder = 'One sentence is fine.';
  const nudge = document.createElement('p');
  nudge.className = 'hint';
  const next = button(label, () => {
    const match = asked ? new FormData(/** @type {HTMLFormElement} */ (document.getElementById('match'))).get('match') : null;
    if (asked && !match) { nudge.textContent = 'Answer the question about the red working first.'; return; }
    onNext({ match, text: ta.value.trim() });
  });
  next.disabled = true;
  ta.addEventListener('input', () => { next.disabled = ta.value.trim().length < 5; });
  main.append(ta, nudge, next);
}
export const matchForm = `<form id="match">${radios('match', 'Was the red working above what you actually wrote?', MATCH)}</form>`;
export const noteLabel = '<label for="note">In your own words: what went wrong?</label>';
