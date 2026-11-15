// @ts-check
// Episode 3 player: "Open House". Vark's drones come down the school corridor, each carrying a
// problem; a solved plate folds its drone up. Each wave runs:
//   brief   story for the wave
//   scout   multiple choice, for teaching: one per shape of problem that is new or not solid yet
//   cart    spend parts on towers
//   wave    typed answers; these are the only answers that count toward mastery (see mastery.js)
// Which drones a wave sends is decided when the wave starts, from this device's log of typed
// answers and the knobs in episodes/siege3.js.
// The corridor plays one of two ways, and each is its own episode in the menu:
//   turns   episode 3a: drones step once per answer; rules in game/siege.js
//   live    episode 3b: real time, towers that shoot, formations behind plates; rules in game/live.js
// State lives in localStorage.
import { content, TUNING } from './episodes/siege3.js';
import { problem, count, SKILLS } from './episodes/siege3-skills.js';
import { newWave, answer, plateOf, front } from './game/siege.js';
import { drawSiege, squareX, SIEGE_W, SIEGE_H } from './game/drawsiege.js';
import { newLive, step as liveStep, answerPlate, plateOf as squadPlate, reach, SOCKETS, MAP_W, MAP_H } from './game/live.js';
import { drawLive, squadAt, socketAt } from './game/drawlive.js';
import { paras, lines, button, optionList, shuffled, radios, TESTER, post, newSid, cleanup, onCleanup, notesScreen, footer, typedPanel, reflect, matchForm, noteLabel } from './lib.js';
import { today, loadLog, recordAttempt, status, visibleMs } from './mastery.js';

const AWAY_MS = 180000; // a single answer slower than this is flagged "probably away"
const BREAK_BEFORE = 2; // the chapter break comes before this wave (counting from 0)
const MAX_SPARE = 2;
const L = TUNING.live;
// This file is loaded twice by the menu: as episode 3a (turns) and, with ?mode=live on its
// address, as episode 3b (live). Each copy has its own state and its own saved game.
const MODE = new URL(import.meta.url).searchParams.get('mode') === 'live' ? 'live' : 'turns';
const EID = MODE === 'live' ? `${content.id}b` : content.id; // names the saved game and tags the mastery log
const TITLE = MODE === 'live' ? content.titleLive : content.title;
const KEY = `story:${EID}:v1`;
const OTHER = `story:${MODE === 'live' ? content.id : `${content.id}b`}:v1`; // the other copy's saved game

/** The episode as a straight line of steps. A wave's steps are skipped when it has nothing to send. */
const STEPS = (() => {
  /** @type {any[]} */ const s = [{ t: 'story', id: 'intro' }];
  content.waves.forEach((w, wi) => {
    if (wi === BREAK_BEFORE) s.push({ t: 'break' });
    s.push({ t: 'brief', wi }, { t: 'scout', wi }, { t: 'cart', wi }, { t: 'wave', wi });
  });
  s.push({ t: 'story', id: 'ending' }, { t: 'debrief' }, { t: 'notes' });
  // A name for each step that stays the same when steps are added or moved (see ep2.js).
  for (const x of s) x.key = [x.t, x.id ?? '', x.wi !== undefined ? content.waves[x.wi].id : ''].join(':');
  return s;
})();
const BREAK_AT = STEPS.findIndex((s) => s.t === 'break');

const fresh = (mode = MODE) => ({
  sid: newSid(), // names this play-through's feedback file on the server
  mode,
  step: 0, sub: '',
  parts: mode === 'live' ? L.startParts : TUNING.startParts, earned: 0,
  /** @type {Record<string, string>} */ towers: {}, spare: 0, // square (live: spot on the map, from 0) -> tower id; extra shutters bought
  /** @type {Record<string, number>} */ k: {}, // "skill:form" -> how many problems of that form have been dealt
  /** @type {Record<string, any>} */ plan: {}, // wave id -> {scouts, specs, levels}, fixed when the wave is reached
  /** @type {any} */ sc: null, // scout in progress: {i, r} (which scout, and its record in `scouts`)
  /** @type {any} */ cur: null, /** @type {string | null} */ opt: null, // the scout problem on screen and the wrong pick on it
  /** @type {any} */ w: null, // the wave in progress (game/siege.js or game/live.js)
  /** @type {number | null} */ target: null, // id of the drone aimed at (live: the formation whose plate is open)
  /** @type {Record<string, number>} */ retry: {}, // wave id -> times lost so far
  /** @type {any} */ miss: null, // last typed miss: {ref, ti, id, got, slip}
  /** @type {any} */ near: null, /** @type {Record<string, number>} */ nears: {},
  flash: '', // one line about what just happened, shown once
  /** @type {any[]} */ typed: [], // every typed answer, in order
  /** @type {any[]} */ scouts: [], // every scout: {wave, skill, form, ask, wrong: [...], ms}
  /** @type {Record<string, any>} */ waves: {}, // wave id -> {tries, lost, breaches, kills, result}
  active: { 1: 0, 2: 0 }, // on-screen milliseconds per chapter
  /** @type {string[]} */ days: [], /** @type {any} */ debrief: null,
});

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s || typeof s.step !== 'number' || (s.mode && s.mode !== MODE)) return fresh(); // (a save made while trying the other corridor under this name is dropped)
    const step = STEPS.findIndex((x) => x.key === s.at);
    return { ...fresh(), ...s, mode: MODE, step: step < 0 ? 0 : step };
  } catch {
    return fresh();
  }
}
let S = load();
let frozen = false; // true while drawing a preview: nothing is saved or sent
function save() {
  if (frozen) return;
  /** @type {any} */ (S).at = STEPS[S.step].key;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: play on without saving */ }
}

/** @type {HTMLElement} */ let app;
let toMenu = () => {};
let mark = visibleMs(); // start of the current stretch of on-screen time
let pmark = 0; // when the problem now being worked on was first shown
let holdMark = false; // the next draw is the same stretch of thinking (aim changed, or an unfinished entry): the clock keeps running
/** @type {Record<string, number> | undefined} */ let slideFrom; // where each drone was before the last answer
const chapter = () => (S.step <= BREAK_AT ? 1 : 2);
function charge() {
  const now = visibleMs();
  S.active[chapter()] += now - mark;
  mark = now;
  const d = today();
  if (!S.days.includes(d)) S.days.push(d);
}
let live = false; // true while this episode is the one on screen
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => { if (live && document.visibilityState === 'hidden') { charge(); save(); } });
}
const go = (/** @type {object} */ patch = {}) => { charge(); Object.assign(S, patch); save(); render(); window.scrollTo(0, 0); };
const send = () => (frozen ? Promise.resolve(false) : post(S.sid, report()));

/**
 * Which problem to deal as the k-th of a form here. Episode 2 dealt `used` of them from the front
 * of the list (and showed the last one of form 0 on a demo card), so this episode deals from the
 * back and stops before it reaches those. If a short list runs out it starts again from the back,
 * and `again` says so: those numbers have been seen before in this episode.
 * @param {number} total @param {number} form @param {number} used @param {number} k
 */
export function dealIndex(total, form, used, k) {
  const start = form === 0 ? total - 2 : total - 1;
  const free = Math.max(1, start + 1 - used);
  return { n: start - (k % free), again: k >= free };
}
/** How many problems of one form episode 2 has dealt on this device. */
function usedByEp2(/** @type {string} */ key) {
  try { return (JSON.parse(localStorage.getItem('story:heist2:v1') || '{}').k || {})[key] || 0; } catch { return 0; }
}
/** How many problems of one form the other copy of this episode (3a or 3b) has dealt on this device. */
function usedByOther(/** @type {string} */ key) {
  try { return (JSON.parse(localStorage.getItem(OTHER) || '{}').k || {})[key] || 0; } catch { return 0; }
}
/** Deal the next problem of one form of a skill. */
function take(/** @type {string} */ skill, /** @type {number} */ form) {
  const key = `${skill}:${form}`;
  const k = S.k[key] || 0;
  S.k[key] = k + 1;
  // 3b carries on down the list from where 3a stopped, so the two do not ask the same numbers
  const { n, again } = dealIndex(count(skill, form), form, usedByEp2(key), k + (MODE === 'live' ? usedByOther(key) : 0));
  return { skill, form, n, ...(again ? { again: true } : {}) };
}
const P = (/** @type {any} */ ref) => problem(ref.skill, ref.form, ref.n);
const earn = (/** @type {number} */ n) => { S.parts += n; S.earned += n; };
const refKey = (/** @type {any} */ ref) => `${ref.skill}:${ref.form}:${ref.n}`;

// ---------------------------------------------------------------- what a wave sends
const RANK = { none: 0, practicing: 1, fluent: 2, mastered: 3 };
/**
 * Decide a wave's scouts and drones from where each skill stands on this device right now.
 * @param {any} wave @returns {{scouts: {skill: string, form: number}[], specs: any[], levels: Record<string, string>}}
 */
export function makePlan(wave, log = loadLog()) {
  const level = (/** @type {string} */ s) => status(log[s]).code;
  const weakest = wave.review === 'weakest';
  /** @type {string[]} */
  const review = weakest
    ? Object.keys(SKILLS).map((s, i) => ({ s, i, r: RANK[/** @type {keyof typeof RANK} */ (level(s))] })).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, TUNING.bossPlates).map((x) => x.s)
    : wave.review;
  /** @type {Record<string, string>} */ const levels = {};
  /** @type {{skill: string, form: number}[]} */ const scouts = [];
  /** @type {{skill: string, form: number}[][]} */ const per = [];
  /** @type {string[]} */ const sent = []; // review skills with at least one drone: the only ones the big drone may carry
  for (const s of review) {
    const lv = level(s);
    levels[s] = lv;
    const forms = SKILLS[s].forms;
    // In the last wave the ordinary drones are an escort for the big one, so at most two a skill.
    const n = TUNING.force[s] ?? (weakest ? Math.min(2, TUNING.review[lv]) : TUNING.review[lv]);
    // the hardest shape first: a student with one drone to answer gets the one that says the most
    const list = Array.from({ length: n }, (_, i) => ({ skill: s, form: forms - 1 - (i % forms) }));
    per.push(list);
    if (n > 0) sent.push(s);
    if (TUNING.reteach.includes(lv)) for (const f of [...new Set(list.map((x) => x.form))].sort()) scouts.push({ skill: s, form: f });
  }
  for (const s of wave.fresh) {
    levels[s] = 'new';
    const forms = SKILLS[s].forms;
    per.push(Array.from({ length: TUNING.force[s] ?? TUNING.fresh }, (_, i) => ({ skill: s, form: i % forms })));
    for (let f = 0; f < forms; f++) scouts.push({ skill: s, form: f });
  }
  /** @type {{skill: string, form: number}[]} */ const order = [];
  for (let i = 0; per.some((l) => l[i]); i++) for (const l of per) if (l[i]) order.push(l[i]);
  for (let i = 0; order.length && order.length < TUNING.minWave; i++) order.push({ ...order[i] });
  /** @type {any[]} */ const specs = order.map((p) => ({ plates: [p] }));
  if (wave.boss && sent.length) {
    specs.push({ boss: true, plates: Array.from({ length: TUNING.bossPlates }, (_, i) => { const s = sent[i % sent.length]; return { skill: s, form: SKILLS[s].forms - 1 }; }) });
  }
  return { scouts, specs, levels };
}
function planFor(/** @type {number} */ wi) {
  const wave = content.waves[wi];
  if (!S.plan[wave.id]) S.plan[wave.id] = makePlan(wave);
  return S.plan[wave.id];
}
/** Move on, passing over a wave with nothing to send and a scout step with nothing to teach. */
function advance(/** @type {object} */ keep = {}) {
  let i = S.step + 1;
  for (; STEPS[i].wi !== undefined; i++) {
    const pl = planFor(STEPS[i].wi);
    if (pl.specs.length && !(STEPS[i].t === 'scout' && !pl.scouts.length)) break;
  }
  go({ step: i, sub: '', cur: null, opt: null, sc: null, miss: null, near: null, w: null, target: null, flash: '', ...keep });
}

// ---------------------------------------------------------------- report
const secs = (/** @type {number} */ ms) => `${Math.round(ms / 1000)}s${ms > AWAY_MS ? ' (probably away)' : ''}`;
const mins = (/** @type {number} */ ms) => `${Math.round(ms / 60000)} min`;

/** @type {[string, string, string[]][]} */
const DEBRIEF_TURNS = [
  ['feel', 'Did it feel like a game, or like homework with a story stuck on?', ['A game', 'Somewhere in between', 'Homework']],
  ['level', 'The math was...', ['Too easy', 'About right', 'Too hard']],
  ['pace', 'The drones only move when you answer. That was...', ['Good: I could think', 'I wanted them to move on their own', 'Still stressful']],
  ['towers', 'The glue mats and fans...', ['Made a difference', 'Did not change much', 'Did not build any']],
  ['length', 'One chapter was...', ['Too short', 'About right', 'Too long']],
  ['story', 'How much story between waves?', ['More story', 'About right', 'Less story, get to the drones']],
];
/** @type {Record<string, [string, string, string[]]>} */
const DEBRIEF_LIVE = {
  pace: ['pace', 'The drones keep coming while you work on a plate. That was...', ['Fun: I liked the rush', 'OK', 'Too stressful to think']],
  towers: ['towers', 'The launchers, wax and fans...', ['Made a difference', 'Did not change much', 'Did not build any']],
};
const debriefQs = () => DEBRIEF_TURNS.map((q) => (S.mode === 'live' && DEBRIEF_LIVE[q[0]]) || q);
const median = (/** @type {number[]} */ a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : 0; };

function report() {
  const d = S.debrief || {};
  const at = STEPS[S.step];
  const where = S.debrief ? 'finished, debrief done' : `step ${S.step + 1} of ${STEPS.length} (${at.t}${at.wi !== undefined ? `, ${content.waves[at.wi].title}` : ''}${S.sub ? `, ${S.sub}` : ''})`;
  const log = loadLog();
  const out = [
    `The Vark Job 3${MODE === 'live' ? 'b' : 'a'} (${TITLE}): feedback${TESTER ? ' (TEST RUN by a teacher, not the student)' : ''}`,
    `Progress: ${where}`,
    `Played on: ${S.days.join(', ') || '-'}`,
    `Time on screen: chapter 1 ${mins(S.active[1])}, chapter 2 ${mins(S.active[2])} (stops counting when the page is hidden)`,
    S.mode === 'live'
      ? `Corridor: live (real time; while a plate is open the corridor runs at ${L.think} of normal speed, and it is stopped while a miss is explained)`
      : 'Corridor: turns (drones step once per answer; nothing is timed)',
    `Parts earned: ${S.earned}. Towers: ${Object.entries(S.towers).map(([sq, id]) => (S.mode === 'live' ? `${id} at spot ${Number(sq) + 1}` : `${id} at locker ${sq}`)).join(', ') || 'none'}${S.spare ? `. Spare shutters: ${S.spare}` : ''}`,
    '',
    'SKILLS (typed answers only; Y = right, n = wrong, in order)',
  ];
  for (const [id, sk] of Object.entries(SKILLS)) {
    const mine = S.typed.filter((t) => t.skill === id);
    out.push(`${sk.name}: ${mine.map((t) => (t.ok ? 'Y' : 'n')).join(' ') || '-'}${S.nears[id] ? ` (plus ${S.nears[id]} right-value-but-unfinished entries, not counted either way)` : ''}`,
      `  status, all typed answers on this device, every episode: ${status(log[id]).text}`);
    const right = mine.filter((t) => t.ok && t.ms <= AWAY_MS).map((t) => t.ms);
    if (right.length >= 2) {
      const h = Math.floor(right.length / 2);
      out.push(`  time on a right answer in this episode: median ${secs(median(right))}${right.length >= 4 ? ` (first half ${secs(median(right.slice(0, h)))}, second half ${secs(median(right.slice(h)))})` : ''}`);
    }
  }
  out.push('', 'WAVES (what was sent is decided from the status of each skill when the wave starts)');
  for (const wave of content.waves) {
    const pl = S.plan[wave.id];
    const r = S.waves[wave.id];
    if (!pl) { out.push(`${wave.title}: not reached`); continue; }
    out.push(`${wave.title}: ${Object.entries(pl.levels).map(([s, lv]) => `${s} was ${lv}`).join(', ')} -> ${pl.scouts.length} scouts, ${pl.specs.length} drones`
      + (r ? ` | ${r.result || 'in progress'}, ${r.tries} attempt(s), ${r.breaches} drone(s) reached the case over all attempts` : ' | not started'));
  }
  out.push('', `TYPED ANSWERS, in order (the time is ${S.mode === 'live' ? 'from opening the plate to pressing Enter' : 'from the previous answer, or the start of the wave, to this one'})`);
  for (const t of S.typed) {
    out.push(`  [${t.where} ${t.skill}${t.boss ? ', Chairman' : ''}] ${t.ask} | typed ${t.got} | ${t.ok ? 'right' : `WRONG (answer ${t.ans})`} | ${secs(t.ms)}${t.again ? ' | numbers seen before in this episode' : ''}`);
    if (!t.ok) out.push(`      ${t.match === undefined ? 'no note yet' : `${t.match ? `"probably wrote" matched: ${t.match}` : 'no known slip matched, so no working was guessed'} | their words: ${t.text}`}`);
  }
  out.push('', 'SCOUTS (multiple choice, for teaching)');
  for (const r of S.scouts) {
    out.push(`  [${r.wave} ${r.skill}] ${r.ask} | ${r.done ? (r.wrong.length ? `${r.wrong.length} wrong first` : 'right first try') : 'not finished'} | ${secs(r.ms)}`);
    for (const n of r.wrong) out.push(`      picked ${n.txt} for ${n.ask} | "probably wrote" matched: ${n.match || 'no answer'} | their words: ${n.text}`);
  }
  out.push('');
  for (const [name, legend] of debriefQs()) out.push(`${legend} ${d[name] || '-'}`);
  out.push(`What next: ${d.next || '-'}`, `Annoying or broken: ${d.broken || '-'}`);
  return out.join('\n');
}

// ---------------------------------------------------------------- screens
const partsLine = (/** @type {number} */ n) => `<p class="cleared">+${n} part${n === 1 ? '' : 's'}. You have ${S.parts}.</p>`;
const nearNote = (/** @type {any} */ ref) => (S.near && ref && S.near.key === refKey(ref)
  ? `<div class="why"><h3>Not finished</h3><p>${S.near.slip}</p><p>Same plate. This did not count against you${S.mode === 'live' ? '' : ', and the drones did not move'}: finish it.</p></div>` : '');
/** A paragraph that may differ by mode (see `intro` in episodes/siege3.js). */
const byMode = (/** @type {any} */ t) => (typeof t === 'string' ? t : t[S.mode]);

/** The corridor picture. Returns the canvas; it keeps itself moving until the next screen is drawn. */
function corridor(/** @type {{lane: number, shutters: number, sockets?: number[]}} */ o) {
  const canvas = document.createElement('canvas');
  canvas.className = 'stage siege';
  const ctx = canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) return canvas; // no canvas (tests): the buttons under it do everything
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 3);
  canvas.width = SIEGE_W * dpr;
  canvas.height = SIEGE_H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // What to draw is fixed now: this picture belongs to this screen, whatever the game does next.
  const from = slideFrom, wave = S.w, towers = S.towers, target = S.target;
  const draw = (/** @type {number} */ t, /** @type {number} */ now) => drawSiege(ctx, wave, towers, { ...o, target, from, t, now });
  draw(from ? 0 : 1, 0);
  if (typeof requestAnimationFrame === 'undefined') return canvas;
  let raf = 0, alive = true, t0 = 0;
  const frame = (/** @type {number} */ now) => {
    if (!alive) return;
    t0 = t0 || now;
    draw(Math.min(1, (now - t0) / 350), now);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  onCleanup(() => { alive = false; cancelAnimationFrame(raf); });
  return canvas;
}

function render() {
  cleanup();
  app.innerHTML = '';
  const step = STEPS[S.step];
  const wave = step.wi !== undefined ? content.waves[step.wi] : null;
  const head = document.createElement('header');
  head.innerHTML = `<span>${TITLE}</span><span>${wave ? `Wave ${step.wi + 1} &middot; ` : ''}${S.parts} parts</span>`;
  app.append(head);
  const main = document.createElement('main');
  app.append(main);
  if (!holdMark) pmark = visibleMs();
  holdMark = false;
  const flash = S.flash ? `<p class="cleared">${S.flash}</p>` : '';
  S.flash = '';

  if (step.t === 'story') {
    const page = step.id === 'intro' ? { title: TITLE, text: content.intro.map(byMode) } : content.ending;
    main.innerHTML = `<h1>${page.title}</h1>${paras(page.text)}`;
    main.append(button(step.id === 'intro' ? 'Pick up the keypad' : 'Debrief', () => advance()));
  } else if (step.t === 'break') {
    const b = content.chapterBreak;
    if (S.sub === 'stopped') {
      main.innerHTML = `<h2>${b.title}</h2>${paras(b.stopped)}`;
      main.append(button('I am back. Start chapter 2', () => advance()));
    } else {
      main.innerHTML = `<h2>${b.title}</h2>${paras(b.text)}`;
      main.append(button('Stop here for today', () => { go({ sub: 'stopped' }); send(); }),
        button('Keep going now', () => { send(); advance(); }, 'btn quiet'));
    }
  } else if (step.t === 'brief') {
    const pl = planFor(step.wi);
    const names = [...new Set(pl.specs.flatMap((/** @type {any} */ s) => s.plates.map((/** @type {any} */ p) => SKILLS[p.skill].name)))];
    main.innerHTML = `<h2>Wave ${step.wi + 1}: ${wave.title}</h2>${paras(wave.story)}
      ${step.wi === 0 ? `<div class="similar">${paras(S.mode === 'live' ? content.howToLive : content.howTo)}</div>` : ''}
      <p class="hint">On the plates: ${names.join('; ')}.</p>`;
    main.append(button('Get ready', () => advance()));
  } else if (step.t === 'scout') {
    scoutScreens(main, /** @type {any} */ (wave), planFor(step.wi), flash);
  } else if (step.t === 'cart') {
    if (S.mode === 'live') liveCart(main, flash); else cartScreen(main, flash);
  } else if (step.t === 'wave') {
    if (S.mode === 'live') liveScreens(main, /** @type {any} */ (wave), step.wi, planFor(step.wi), flash);
    else waveScreens(main, /** @type {any} */ (wave), planFor(step.wi), flash);
  } else if (step.t === 'debrief') {
    main.innerHTML = `<h2>Debrief</h2><p>The corridor is yours. Same deal as before: your answers decide what the next one looks like.</p>
      <form id="debrief">
        ${debriefQs().map(([name, legend, choices]) => radios(name, legend, choices)).join('')}
        <label for="next">What should the next one have in it?</label>
        <textarea id="next" name="next" rows="3"></textarea>
        <label for="broken">Anything annoying, confusing, or broken?</label>
        <textarea id="broken" name="broken" rows="3"></textarea>
      </form>`;
    main.append(button('Done', () => {
      const f = new FormData(/** @type {HTMLFormElement} */ (document.getElementById('debrief')));
      S.debrief = Object.fromEntries(f.entries());
      advance();
    }));
  } else {
    notesScreen(main, report(), send());
  }
  footer(app, toMenu, () => { S = fresh(); mark = visibleMs(); save(); render(); window.scrollTo(0, 0); });
}

/** Scouts: one drone at a time, pinned down, multiple choice. A wrong pick is explained and the scout gets new numbers. */
function scoutScreens(/** @type {HTMLElement} */ main, /** @type {any} */ wave, /** @type {any} */ pl, /** @type {string} */ flash) {
  if (!S.sc) {
    const sp = pl.scouts[0];
    S.cur = take(sp.skill, sp.form);
    S.scouts.push({ wave: wave.id, skill: sp.skill, form: sp.form, ask: P(S.cur).askTxt, wrong: [], ms: 0 });
    S.sc = { i: 0, r: S.scouts.length - 1 };
    save();
  }
  const sp = pl.scouts[S.sc.i];
  const p = P(S.cur);
  const rec = S.scouts[S.sc.r];
  if (S.sub === '') {
    main.innerHTML = `<h2>Scout ${S.sc.i + 1} of ${pl.scouts.length}</h2>${flash}
      <p>${rec.wrong.length ? 'The scout shakes itself and shows a new plate.' : S.sc.i === 0
    ? 'A scout drifts in ahead of the rest. Wrench drops a mop bucket over it. "Practice on this one," she says. "It is not going anywhere, and it does not count."'
    : 'Wrench has the next scout under the bucket already.'}</p>
      <div class="ask">${p.ask}</div><p class="hint">Work it out on paper first, then choose.</p>`;
    const list = optionList(p.options);
    for (const o of shuffled(p.options)) {
      list.append(button(o.html, () => {
        rec.ms += visibleMs() - pmark;
        if (!o.right) { go({ sub: 'dead', opt: o.id }); return; }
        rec.done = true;
        const gain = rec.wrong.length ? 0 : 1;
        earn(gain);
        S.flash = `The scout folds up.${gain ? ` +1 part. You have ${S.parts}.` : ''}`;
        const i = S.sc.i + 1;
        if (i >= pl.scouts.length) { send(); advance({ flash: S.flash }); return; }
        const nx = pl.scouts[i];
        const cur = take(nx.skill, nx.form);
        S.scouts.push({ wave: wave.id, skill: nx.skill, form: nx.form, ask: P(cur).askTxt, wrong: [], ms: 0 });
        go({ cur, sc: { i, r: S.scouts.length - 1 } });
      }, 'opt'));
    }
    main.append(list);
  } else {
    const o = p.options.find((/** @type {any} */ x) => x.id === S.opt);
    main.innerHTML = `<h2>Not that one</h2>
      <div class="why"><h3>What happened</h3><p>For &nbsp;${p.show}&nbsp; you chose <span class="picked">${o.html}</span>. You probably wrote something like this:</p>
        ${lines(o.guess)}<p>${o.slip}</p></div>
      <div class="fixed"><h3>Written correctly</h3>${lines(p.worked)}</div>
      ${p.quick ? `<div class="quick"><h3>Where this is heading: one step</h3>${p.quick}</div>` : ''}
      <p>Nothing lost: it is a scout. It gets new numbers and you go again.</p>${matchForm}${noteLabel}`;
    reflect(main, true, 'New numbers', (note) => {
      rec.wrong.push({ txt: o.txt, ask: p.askTxt, ...note });
      go({ sub: '', opt: null, cur: take(sp.skill, sp.form) });
      send();
    });
  }
}

/** Wrench's cart: towers go on lockers, bought with parts. They stay for the rest of the episode. */
function cartScreen(/** @type {HTMLElement} */ main, /** @type {string} */ flash) {
  main.innerHTML = `<h2>Wrench's cart</h2>${flash}
    <p>Wrench wheels the caretaker's cart into the corridor. "Parts get you kit. Kit buys you room to think. Where do you want it?"</p>`;
  main.append(corridor({ lane: TUNING.lane, shutters: TUNING.shutters + S.spare, sockets: TUNING.sockets }));
  const have = document.createElement('p');
  have.className = 'cleared';
  have.innerHTML = `You have ${S.parts} part${S.parts === 1 ? '' : 's'}. The trophy case is on the left; drones come from the right.`;
  main.append(have);
  for (const sq of TUNING.sockets) {
    const row = document.createElement('div');
    row.className = 'item';
    const built = content.towers.find((t) => t.id === S.towers[sq]);
    row.innerHTML = `<b>Locker ${sq}</b> &middot; ${sq} move${sq === 1 ? '' : 's'} from the case<br><span>${built ? `${built.name}. ${built.what}` : 'Nothing here yet.'}</span>`;
    if (!built) {
      for (const t of content.towers) {
        const b = button(`${t.name} at locker ${sq} &middot; ${t.cost} parts`, () => { S.parts -= t.cost; S.towers[sq] = t.id; go(); }, 'btn quiet');
        b.disabled = S.parts < t.cost;
        row.append(b);
      }
    }
    main.append(row);
  }
  const kit = document.createElement('div');
  kit.className = 'item';
  kit.innerHTML = `${content.towers.map((t) => `<b>${t.name}</b> &middot; <span>${t.what}</span>`).join('<br>')}<br><b>Spare shutter</b> &middot; <span>${content.spare.what}${S.spare ? ` You have fitted ${S.spare}.` : ''}</span>`;
  const sb = button(`Fit a spare shutter &middot; ${content.spare.cost} parts`, () => { S.parts -= content.spare.cost; S.spare++; go(); }, 'btn quiet');
  sb.disabled = S.parts < content.spare.cost || S.spare >= MAX_SPARE;
  kit.append(sb);
  main.append(kit, button('To the corridor', () => advance()));
}

/** Give every drone that needs one a fresh problem. */
function deal() {
  for (const d of S.w.drones) if (!d.ref) { const pl = plateOf(d); d.ref = take(pl.skill, pl.form); }
}
/** What a plate is about, in a word, for the buttons under the picture. */
const KIND = { dist: 'brackets', solve: 'equation', simplify: 'root', rationalize: 'root below', frac: 'fractions' };
const EVENT = {
  down: 'Solved. The drone folds up.', crack: 'One plate down. The Chairman shows the next.', blown: 'The fan blows one back.',
  held: 'One is stuck on the glue.', breach: 'One reached the trophy case. A shutter comes down.',
};

function waveScreens(/** @type {HTMLElement} */ main, /** @type {any} */ wave, /** @type {any} */ pl, /** @type {string} */ flash) {
  if (!S.w) {
    const lost = S.retry[wave.id] || 0;
    S.w = newWave(pl.specs, { lane: TUNING.lane + lost * TUNING.retryLane, pack: TUNING.pack, shutters: TUNING.shutters + S.spare });
    deal();
    const r = S.waves[wave.id] = S.waves[wave.id] || { tries: 0, breaches: 0, kills: 0, result: '' };
    r.tries++;
    S.target = front(S.w).id;
    save();
  }
  const w = S.w;
  const rec = S.waves[wave.id];
  if (S.sub === '') {
    const aim = w.drones.find((/** @type {any} */ d) => d.id === S.target) || front(w);
    S.target = aim.id;
    const p = P(aim.ref);
    main.innerHTML = `<h2>${wave.title}</h2>`;
    const canvas = corridor({ lane: w.lane, shutters: w.shutters });
    slideFrom = undefined;
    const pick = (/** @type {number} */ id) => { if (id !== S.target) { holdMark = true; go({ target: id, near: null }); } };
    canvas.addEventListener('pointerdown', (/** @type {any} */ e) => {
      const box = canvas.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * SIEGE_W;
      const hit = w.drones.reduce((/** @type {any} */ a, /** @type {any} */ d) => (!a || Math.abs(squareX(d.pos, w.lane) - x) < Math.abs(squareX(a.pos, w.lane) - x) ? d : a), null);
      if (hit) pick(hit.id);
    });
    const info = document.createElement('p');
    info.className = 'hint';
    info.innerHTML = `${flash ? `${flash.replace(/<\/?p[^>]*>/g, '')} ` : ''}${w.shutters} shutter${w.shutters === 1 ? '' : 's'} left. ${w.queue.length} more to come.`;
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const d of [...w.drones].sort((a, b) => a.pos - b.pos || a.id - b.id)) {
      const left = d.plates.length - d.at;
      chips.append(button(`<b>${KIND[/** @type {keyof typeof KIND} */ (plateOf(d).skill)]}</b>${d.boss ? ` &times;${left}` : ''} &middot; ${d.pos} away`, () => pick(d.id), d.id === aim.id ? 'chip on' : 'chip'));
    }
    const note = document.createElement('div');
    note.innerHTML = nearNote(aim.ref);
    main.append(canvas, info, chips, note);
    typedPanel(main, p, (vals) => {
      const g = p.grade(vals);
      if (g.near) { S.nears[p.skill] = (S.nears[p.skill] || 0) + 1; holdMark = true; go({ near: { key: refKey(aim.ref), slip: g.slip } }); return; }
      const ms = visibleMs() - pmark;
      S.typed.push({ skill: p.skill, where: wave.id, ask: p.askTxt, ans: p.ansTxt, got: p.gotTxt(vals), ok: g.ok, ms, ...(aim.boss ? { boss: true } : {}), ...(aim.ref.again ? { again: true } : {}) });
      recordAttempt(p.skill, g.ok, ms, `${EID}:${wave.id}`);
      const ref = aim.ref;
      slideFrom = Object.fromEntries(w.drones.map((/** @type {any} */ d) => [d.id, d.pos]));
      const ev = answer(w, aim.id, g.ok, S.towers);
      deal();
      if (g.ok) earn(1);
      const said = [...new Set(ev.map((e) => EVENT[/** @type {keyof typeof EVENT} */ (e.t)]).filter(Boolean))].join(' ');
      const next = w.drones.find((/** @type {any} */ d) => d.id === S.target) || front(w);
      const patch = { near: null, target: next ? next.id : null, flash: said };
      if (!g.ok) { go({ ...patch, sub: 'miss', miss: { ref, ti: S.typed.length - 1, id: g.id, got: p.gotHtml(vals), slip: g.slip, did: aim.id } }); return; }
      if (w.over) settle(wave, patch); else go(patch);
    });
    const how = document.createElement('p');
    how.className = 'hint';
    how.innerHTML = 'On paper first. The drones only move when you press Enter, so there is no hurry. Tap a drone to aim at a different one.';
    main.append(how);
  } else if (S.sub === 'miss') {
    missScreen(main, wave, flash, w.drones.some((/** @type {any} */ d) => d.id === S.miss.did)
      ? 'That drone shuffles its plate: new numbers. Every drone has moved up one locker.'
      : 'That drone reached the trophy case with its plate unsolved.', { miss: null });
  } else {
    endScreens(main, wave, rec);
  }
}
/** A typed miss, explained. `what` says what it cost; `patch` is where to go after the note. */
function missScreen(/** @type {HTMLElement} */ main, /** @type {any} */ wave, /** @type {string} */ flash, /** @type {string} */ what, /** @type {object} */ patch) {
  const p = P(S.miss.ref);
  const o = S.miss.id ? p.options.find((/** @type {any} */ x) => x.id === S.miss.id) : null;
  main.innerHTML = `<h2>Not that one</h2>${flash}
    <div class="why"><h3>What happened</h3><p>For &nbsp;${p.show}&nbsp; you typed <span class="picked">${S.miss.got}</span>.</p>
      ${o ? `<p>You probably wrote something like this:</p>${lines(o.guess)}` : ''}<p>${S.miss.slip}</p></div>
    <div class="fixed"><h3>Written correctly</h3>${lines(p.worked)}</div>
    ${p.quick ? `<div class="quick"><h3>Where this is heading: one step</h3>${p.quick}</div>` : ''}
    <p>${what}</p>${o ? matchForm : ''}${noteLabel}`;
  reflect(main, !!o, 'Back to the corridor', (note) => {
    Object.assign(S.typed[S.miss.ti], { match: null, ...note });
    if (S.w.over) settle(wave, patch); else go({ sub: '', ...patch });
    send();
  });
}
/** The wave is over: lost (take it again) or won. */
function endScreens(/** @type {HTMLElement} */ main, /** @type {any} */ wave, /** @type {any} */ rec) {
  const isLive = S.mode === 'live';
  if (S.sub === 'lost') {
    main.innerHTML = `<h2>${wave.title}: shutters down</h2>${paras(wave.lost)}
      <p>Nothing you have earned is lost. ${isLive
    ? `Wrench turns the cart upside down and ${L.retryParts} more parts fall out.`
    : 'Wrench props the far doors open, which gives you one more locker of corridor.'} Same wave, new numbers.</p>`;
    const again = (/** @type {number} */ back) => {
      S.retry[wave.id] = (S.retry[wave.id] || 0) + 1;
      if (isLive) S.parts += L.retryParts;
      go({ step: S.step - back, sub: '', w: null, target: null });
    };
    main.append(button('Reset the corridor', () => again(0)), button(`Wrench's cart first (you have ${S.parts + (isLive ? L.retryParts : 0)} parts)`, () => again(1), 'btn quiet'));
  } else {
    main.innerHTML = `<h2>${wave.title}: clear</h2>${paras(wave.won)}${partsLine(rec.bonus)}
      ${rec.bonus === 2 ? '' : '<p class="hint">A wave where nothing reaches the case is worth 2 parts.</p>'}`;
    main.append(button('Keep going', () => advance()));
  }
}

// ---------------------------------------------------------------- live mode
/** The map picture. Without a canvas (tests) `ctx` is null and the buttons under it do everything. */
function mapCanvas(small = false) {
  const canvas = document.createElement('canvas');
  canvas.className = small ? 'stage live small' : 'stage live';
  const ctx = canvas.getContext ? canvas.getContext('2d') : null;
  if (ctx) {
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 3);
    canvas.width = MAP_W * dpr;
    canvas.height = MAP_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return { canvas, ctx };
}
/** Give every shielded formation that needs one a fresh problem. */
function dealLive() {
  for (const s of S.w.squads) if (s.shield && !s.ref) { const pl = squadPlate(s); s.ref = take(pl.skill, pl.form); }
}
/**
 * Draw the wave, and keep it running at `rate` times normal speed until the next screen is drawn.
 * `rate` 0 is a still picture. `onEvents` is called after every frame, to keep the text under the picture up to date.
 * @param {any} wave @param {CanvasRenderingContext2D | null} ctx @param {number} rate @param {() => void} onEvents
 */
function runLive(wave, ctx, rate, onEvents) {
  // What this screen shows is fixed now, whatever the game does next.
  const w = S.w, towers = S.towers, target = S.sub === 'plate' ? S.target : null;
  /** @type {any[]} */ const fx = [];
  const draw = (/** @type {number} */ now) => { if (ctx) drawLive(ctx, w, towers, { lives: w.lives, now, target, fx }); };
  draw(0);
  if (frozen || !rate || typeof requestAnimationFrame === 'undefined') return;
  let alive = true, raf = 0, last = 0, saved = 0;
  const frame = (/** @type {number} */ now) => {
    if (!alive || S.w !== w) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) * rate : 0; // a long gap (page hidden) is not played back
    last = now;
    const ev = liveStep(w, dt, towers);
    for (const e of ev) if (e.t === 'shot' || e.t === 'kill') fx.push({ ...e, at: now });
    if (fx.length > 40) fx.splice(0, fx.length - 40);
    if (ev.length) dealLive();
    if (ev.some((e) => e.t !== 'shot') || now - saved > 2000) { save(); saved = now; }
    if (w.over) { alive = false; settle(wave, { target: null, near: null, miss: null }); return; }
    onEvents();
    if (!alive) return; // onEvents moved to another screen
    draw(now);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  onCleanup(() => { alive = false; cancelAnimationFrame(raf); });
}
/** What can be built, spot by spot. Used at the cart between waves and from the corridor during one. */
function buildList(/** @type {HTMLElement} */ main) {
  const have = document.createElement('p');
  have.className = 'cleared';
  have.innerHTML = `You have ${S.parts} part${S.parts === 1 ? '' : 's'}. The numbers on the map are the spots. Only ball launchers knock drones down; wax and fans buy them time.`;
  main.append(have);
  SOCKETS.forEach((_, i) => {
    const row = document.createElement('div');
    row.className = 'item';
    const built = content.towersLive.find((t) => t.id === S.towers[i]);
    row.innerHTML = `<b>Spot ${i + 1}</b><br><span>${built ? `${built.name}. ${built.what}` : 'Nothing here yet.'}</span>`;
    if (!built) {
      for (const t of content.towersLive) {
        const b = button(`${t.name} at spot ${i + 1} &middot; ${t.cost} parts`, () => { S.parts -= t.cost; S.towers[i] = t.id; go(); }, 'btn quiet');
        b.disabled = S.parts < t.cost;
        row.append(b);
      }
    }
    main.append(row);
  });
  const kit = document.createElement('div');
  kit.className = 'item';
  kit.innerHTML = `${content.towersLive.map((t) => `<b>${t.name}</b> &middot; <span>${t.what}</span>`).join('<br>')}<br><b>Spare shutter</b> &middot; <span>${content.spare.what}${S.spare ? ` You have fitted ${S.spare}.` : ''}</span>`;
  const sb = button(`Fit a spare shutter &middot; ${content.spare.cost} parts`, () => { S.parts -= content.spare.cost; S.spare++; if (S.w) S.w.lives++; go(); }, 'btn quiet');
  sb.disabled = S.parts < content.spare.cost || S.spare >= MAX_SPARE;
  kit.append(sb);
  main.append(kit);
}
function liveCart(/** @type {HTMLElement} */ main, /** @type {string} */ flash) {
  main.innerHTML = `<h2>Wrench's cart</h2>${flash}
    <p>Wrench wheels the caretaker's cart into the corridor and unrolls a floor plan of the school. "Parts get you kit. They come in top right and go round to the trophy case, bottom left. Where do you want it?"</p>`;
  const { canvas, ctx } = mapCanvas();
  if (ctx) drawLive(ctx, null, S.towers, { lives: L.lives + S.spare, range: L.range });
  main.append(canvas);
  buildList(main);
  main.append(button('To the corridor', () => advance()));
}

function liveScreens(/** @type {HTMLElement} */ main, /** @type {any} */ wave, /** @type {number} */ wi, /** @type {any} */ pl, /** @type {string} */ flash) {
  if (!S.w) {
    const { size, bossHp, speed, gap, surge, range, rate, slow, fanPush } = L;
    S.w = newLive(pl.specs, { size, bossHp, speed, gap, surge, range, rate, slow, fanPush, hp: L.hp[Math.min(wi, L.hp.length - 1)], lives: L.lives + S.spare });
    const r = S.waves[wave.id] = S.waves[wave.id] || { tries: 0, breaches: 0, kills: 0, result: '' };
    r.tries++;
    S.target = null;
    save();
  }
  const w = S.w;
  if (S.sub === 'lost' || S.sub === 'won') { endScreens(main, wave, S.waves[wave.id]); return; }
  if (S.sub === 'miss') {
    missScreen(main, wave, flash, 'That formation surges forward, and its plate shows new numbers. Nothing moves while you read this.', { miss: null, target: null });
    return;
  }
  if (S.sub === 'build') {
    main.innerHTML = `<h2>Wrench's cart</h2><p>"Quick, then," says Wrench. Nothing moves while the cart is out.</p>`;
    const { canvas, ctx } = mapCanvas();
    main.append(canvas);
    runLive(wave, ctx, 0, () => {});
    buildList(main);
    main.append(button('Back to the corridor', () => go({ sub: '' })));
    return;
  }
  const sq = S.sub === 'plate' ? w.squads.find((/** @type {any} */ s) => s.id === S.target && s.shield && s.ref) : null;
  if (S.sub === 'plate' && !sq) S.sub = ''; // that formation is gone
  const kind = (/** @type {any} */ s) => `<b>${KIND[/** @type {keyof typeof KIND} */ (squadPlate(s).skill)]}</b>${s.boss ? ` &times;${s.plates.length - s.at}` : ''}`;
  if (sq) {
    const p = P(sq.ref);
    main.innerHTML = `<h2>${wave.title}</h2>`;
    const { canvas, ctx } = mapCanvas(true);
    const info = document.createElement('p');
    info.className = 'hint';
    info.innerHTML = `The plate marked in white${sq.boss ? ': the Chairman' : ''}. ${L.think ? 'The corridor has slowed to a crawl. It has not stopped.' : 'Nothing moves while a plate is open.'}`;
    const note = document.createElement('div');
    note.innerHTML = nearNote(sq.ref);
    main.append(canvas, info, note);
    typedPanel(main, p, (vals) => {
      const g = p.grade(vals);
      if (g.near) { S.nears[p.skill] = (S.nears[p.skill] || 0) + 1; holdMark = true; go({ near: { key: refKey(sq.ref), slip: g.slip } }); return; }
      const ms = visibleMs() - pmark;
      S.typed.push({ skill: p.skill, where: wave.id, ask: p.askTxt, ans: p.ansTxt, got: p.gotTxt(vals), ok: g.ok, ms, ...(sq.boss ? { boss: true } : {}), ...(sq.ref.again ? { again: true } : {}) });
      recordAttempt(p.skill, g.ok, ms, `${EID}:${wave.id}`);
      const ref = sq.ref;
      answerPlate(w, sq.id, g.ok);
      dealLive();
      if (!g.ok) { go({ sub: 'miss', near: null, miss: { ref, ti: S.typed.length - 1, id: g.id, got: p.gotHtml(vals), slip: g.slip, did: sq.id } }); return; }
      earn(1);
      go({ sub: '', target: null, near: null, flash: `Shields down. +1 part.` });
    });
    main.append(button('Close the plate (it stays up)', () => go({ sub: '', target: null, near: null }), 'btn quiet'));
    runLive(wave, ctx, L.think, () => {
      if (!w.squads.some((/** @type {any} */ s) => s.id === sq.id)) go({ sub: '', target: null, near: null, flash: 'That formation reached the trophy case with its plate still up.' });
    });
    return;
  }
  main.innerHTML = `<h2>${wave.title}</h2>`;
  const { canvas, ctx } = mapCanvas();
  const open = (/** @type {number} */ id) => go({ sub: 'plate', target: id, near: null });
  canvas.addEventListener('pointerdown', (/** @type {any} */ e) => {
    const box = canvas.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * MAP_W, y = ((e.clientY - box.top) / box.height) * MAP_H;
    const hit = squadAt(w, x, y);
    if (hit && hit.ref) open(hit.id); else if (socketAt(x, y) !== null) go({ sub: 'build' });
  });
  const info = document.createElement('p');
  info.className = 'hint';
  const chips = document.createElement('div');
  chips.className = 'chips';
  let sig = '-', shown = '';
  const said = flash ? `${flash.replace(/<\/?p[^>]*>/g, '')} ` : '';
  const refresh = () => {
    const line = `${said}${w.lives} shutter${w.lives === 1 ? '' : 's'} left. ${w.queue.length} more formation${w.queue.length === 1 ? '' : 's'} to come.`;
    if (line !== shown) info.innerHTML = shown = line;
    const up = w.squads.filter((/** @type {any} */ s) => s.shield && s.ref && reach(s) > 0).sort((/** @type {any} */ a, /** @type {any} */ b) => reach(b) - reach(a));
    const now = up.map((/** @type {any} */ s) => `${s.id}:${s.at}`).join();
    if (now === sig) return; // the buttons are only rebuilt when the list changes, so a tap is never lost
    sig = now;
    chips.innerHTML = '';
    up.forEach((/** @type {any} */ s, /** @type {number} */ i) => chips.append(button(`${kind(s)}${i === 0 && up.length > 1 ? ' &middot; nearest the case' : ''}`, () => open(s.id), 'chip')));
  };
  refresh();
  main.append(canvas, info, chips, button(`Wrench's cart (you have ${S.parts} part${S.parts === 1 ? '' : 's'})`, () => go({ sub: 'build' }), 'btn quiet'));
  const how = document.createElement('p');
  how.className = 'hint';
  how.innerHTML = 'Tap a formation, or its button, to open its plate. Towers can only hit a formation once its plate is solved.';
  main.append(how);
  runLive(wave, ctx, 1, refresh);
}
/** A wave has just ended: book it and show the result. */
function settle(/** @type {any} */ wave, /** @type {object} */ patch) {
  const rec = S.waves[wave.id];
  rec.breaches += S.w.breaches;
  rec.kills += S.w.kills;
  if (S.w.over === 'won') {
    rec.result = 'cleared';
    rec.bonus = S.w.breaches ? 1 : 2;
    earn(rec.bonus);
    go({ ...patch, sub: 'won', flash: '' });
  } else {
    rec.result = 'lost so far';
    go({ ...patch, sub: 'lost', flash: '' });
  }
  send();
}

/** One line for the episode menu. */
export function summary() {
  if (S.debrief) return 'Finished';
  if (S.step === 0) return 'Not started';
  const at = STEPS[S.step];
  return `In progress: chapter ${chapter()}${at.wi !== undefined ? `, wave ${at.wi + 1}` : ''}`;
}
export const title = TITLE;

/** Take over the page. `menu` is called when the student taps "Episodes". */
export function open(/** @type {HTMLElement} */ el, /** @type {() => void} */ menu) {
  app = el;
  toMenu = () => { charge(); save(); live = false; menu(); };
  live = true;
  mark = visibleMs();
  render();
}

// ---------------------------------------------------------------- previews (see test/preview.html)
/** @returns {{name: string, patch: object, fill?: boolean}[]} */
export function previews() {
  /** @type {{name: string, patch: object, fill?: boolean}[]} */ const out = [];
  const at = (/** @type {(s: any) => boolean} */ f) => STEPS.findIndex(f);
  const none = makePlan(content.waves[0], {});
  const plan = Object.fromEntries(content.waves.map((w) => [w.id, makePlan(w, {})]));
  const ref = (/** @type {string} */ skill, /** @type {number} */ form, n = 0) => ({ skill, form, n });
  /** A wave part-way through: three drones in the corridor, and one tower of each kind. */
  const mid = (/** @type {any[]} */ plates, /** @type {object} */ more = {}) => ({
    lane: TUNING.lane, queue: [{ plates: [plates[0]] }], shutters: 2, tick: 3, nextId: 9, kills: 2, breaches: 1, over: '',
    drones: plates.map((pl, i) => ({ id: i + 1, plates: [pl], at: 0, boss: false, pos: 2 + i * 2, held: i === 1 ? 1 : 0, glued: [], ref: ref(pl.skill, pl.form, i) })),
    ...more,
  });
  const base = { plan, towers: { 2: 'glue', 4: 'fan' }, parts: 6 };
  out.push({ name: 'e3-intro', patch: { step: 0 } });
  out.push({ name: 'e3-brief', patch: { ...base, step: at((s) => s.t === 'brief') } });
  out.push({ name: 'e3-brief-fractions', patch: { ...base, step: at((s) => s.t === 'brief' && s.wi === 2) } });
  const sstep = at((s) => s.t === 'scout');
  const sstate = { ...base, step: sstep, cur: ref('dist', none.scouts[0].form), sc: { i: 0, r: 0 }, scouts: [{ wave: 'w1', skill: 'dist', form: 0, ask: '', wrong: [], ms: 0 }] };
  out.push({ name: 'e3-scout', patch: sstate });
  out.push({ name: 'e3-scout-dead', patch: { ...sstate, sub: 'dead', opt: 'o1' } });
  const fstep = at((s) => s.t === 'scout' && s.wi === 2);
  out.push({ name: 'e3-scout-frac', patch: { ...base, step: fstep, cur: ref('frac', 0), sc: { i: 0, r: 0 }, scouts: [{ wave: 'w3', skill: 'frac', form: 0, ask: '', wrong: [], ms: 0 }] } });
  out.push({ name: 'e3-scout-frac-dead', patch: { ...base, step: fstep, sub: 'dead', opt: 'o2', cur: ref('frac', 1), sc: { i: 1, r: 0 }, scouts: [{ wave: 'w3', skill: 'frac', form: 1, ask: '', wrong: [], ms: 0 }] } });
  out.push({ name: 'e3-cart', patch: { ...base, step: at((s) => s.t === 'cart') } });
  const wstep = at((s) => s.t === 'wave');
  const waves = { w1: { tries: 1, breaches: 0, kills: 0, result: '', bonus: 2 }, w3: { tries: 1, breaches: 0, kills: 0, result: '' }, w4: { tries: 1, breaches: 0, kills: 0, result: '' } };
  const w1 = mid([{ skill: 'dist', form: 2 }, { skill: 'solve', form: 2 }, { skill: 'dist', form: 1 }]);
  out.push({ name: 'e3-wave', patch: { ...base, waves, step: wstep, w: w1, target: 1, flash: 'Solved. The drone folds up.' } });
  out.push({ name: 'e3-wave-filled', patch: { ...base, waves, step: wstep, w: w1, target: 2 }, fill: true });
  out.push({ name: 'e3-wave-miss', patch: { ...base, waves, step: wstep, sub: 'miss', w: w1, target: 1, typed: [{}], miss: { ref: ref('dist', 2), ti: 0, id: 'o1', got: P(ref('dist', 2)).options[1].html, slip: P(ref('dist', 2)).options[1].slip } } });
  out.push({ name: 'e3-wave-lost', patch: { ...base, waves, step: wstep, sub: 'lost', w: { ...w1, over: 'lost' } } });
  out.push({ name: 'e3-wave-won', patch: { ...base, waves, step: wstep, sub: 'won', w: { ...w1, over: 'won' } } });
  const w3 = mid([{ skill: 'frac', form: 0 }, { skill: 'frac', form: 1 }, { skill: 'frac', form: 0 }]);
  const f3 = at((s) => s.t === 'wave' && s.wi === 2);
  out.push({ name: 'e3-wave-frac', patch: { ...base, waves, step: f3, w: w3, target: 1 }, fill: true });
  out.push({ name: 'e3-wave-frac-miss', patch: { ...base, waves, step: f3, sub: 'miss', w: w3, target: 2, typed: [{}], miss: { ref: ref('frac', 1, 1), ti: 0, id: 'o1', got: P(ref('frac', 1, 1)).options[1].html, slip: P(ref('frac', 1, 1)).options[1].slip } } });
  const boss = { id: 7, boss: true, at: 1, pos: 5, held: 0, glued: [], ref: ref('rationalize', 1), plates: [{ skill: 'solve', form: 2 }, { skill: 'rationalize', form: 1 }, { skill: 'simplify', form: 1 }] };
  const w4 = mid([{ skill: 'simplify', form: 1 }, { skill: 'rationalize', form: 1 }], { queue: [] });
  w4.drones.push(/** @type {any} */ (boss));
  out.push({ name: 'e3-wave-boss', patch: { ...base, waves, step: at((s) => s.t === 'wave' && s.wi === 3), w: w4, target: 7 }, fill: true });
  // live mode
  /** A live wave part-way through: three formations on the path, the middle one with its shield down. */
  const lmid = (/** @type {any[]} */ plates, /** @type {object} */ more = {}) => ({
    t: 30, lives: 5, queue: [{ plates: [plates[0]] }], nextAt: 36, cool: {}, nextId: 30, kills: 2, breaches: 1, over: '',
    o: { ...L, hp: 4, lives: L.lives },
    squads: plates.map((pl, i) => ({
      id: i + 1, plates: [pl], at: 0, boss: false, shield: i !== 1, until: 0, ref: i === 1 ? null : ref(pl.skill, pl.form, i),
      drones: [0, 1, 2].map((j) => ({ id: 10 + i * 3 + j, d: 760 - i * 300 - j * 26, hp: i === 1 ? 3 - j : 4, max: 4 })),
    })),
    ...more,
  });
  const lbase = { mode: 'live', plan, towers: { 0: 'launcher', 3: 'launcher', 4: 'wax', 1: 'fan' }, parts: 4, waves };
  const l1 = lmid([{ skill: 'dist', form: 2 }, { skill: 'solve', form: 2 }, { skill: 'dist', form: 1 }]);
  out.push({ name: 'e3-live-intro', patch: { mode: 'live', step: 0 } });
  out.push({ name: 'e3-live-brief', patch: { ...lbase, step: at((s) => s.t === 'brief') } });
  out.push({ name: 'e3-live-cart', patch: { ...lbase, step: at((s) => s.t === 'cart') } });
  out.push({ name: 'e3-live-run', patch: { ...lbase, step: wstep, w: l1, flash: 'Shields down. +1 part.' } });
  out.push({ name: 'e3-live-plate', patch: { ...lbase, step: wstep, sub: 'plate', w: l1, target: 1 }, fill: true });
  out.push({ name: 'e3-live-miss', patch: { ...lbase, step: wstep, sub: 'miss', w: l1, target: 1, typed: [{}], miss: { ref: ref('dist', 2), ti: 0, id: 'o1', got: P(ref('dist', 2)).options[1].html, slip: P(ref('dist', 2)).options[1].slip } } });
  out.push({ name: 'e3-live-build', patch: { ...lbase, step: wstep, sub: 'build', w: l1 } });
  out.push({ name: 'e3-live-lost', patch: { ...lbase, step: wstep, sub: 'lost', w: { ...l1, over: 'lost' } } });
  out.push({ name: 'e3-live-won', patch: { ...lbase, step: wstep, sub: 'won', w: { ...l1, over: 'won' } } });
  const l4 = lmid([{ skill: 'frac', form: 1 }, { skill: 'rationalize', form: 1 }], { queue: [] });
  l4.squads.push(/** @type {any} */ ({ id: 9, boss: true, at: 1, shield: true, until: 10, ref: ref('rationalize', 1), plates: boss.plates, drones: [{ id: 29, d: 120, hp: 20, max: 30 }] }));
  out.push({ name: 'e3-live-boss', patch: { ...lbase, step: at((s) => s.t === 'wave' && s.wi === 3), sub: 'plate', w: l4, target: 9 }, fill: true });
  out.push({ name: 'e3-live-debrief', patch: { mode: 'live', step: at((s) => s.t === 'debrief') } });
  out.push({ name: 'e3-break', patch: { step: BREAK_AT } }, { name: 'e3-break-stopped', patch: { step: BREAK_AT, sub: 'stopped' } });
  out.push({ name: 'e3-ending', patch: { step: at((s) => s.t === 'story' && s.id === 'ending') } });
  out.push({ name: 'e3-debrief', patch: { step: at((s) => s.t === 'debrief') } });
  out.push({ name: 'e3-notes', patch: { ...base, waves, step: at((s) => s.t === 'notes') } });
  return out;
}

/**
 * Draw one preview into an element, using the real screens, without touching the saved game.
 * With `fill`, the right answer is typed in through the real on-screen keypad.
 * @param {HTMLElement} el @param {{patch: object, fill?: boolean}} pv
 */
export function renderPreview(el, pv) {
  const keep = { S, app, live };
  frozen = true;
  live = false;
  try {
    S = /** @type {any} */ ({ ...fresh('turns'), ...JSON.parse(JSON.stringify(pv.patch)) });
    app = el;
    render();
    if (pv.fill) {
      const p = P((S.mode === 'live' ? S.w.squads : S.w.drones).find((/** @type {any} */ d) => d.id === S.target).ref);
      const tap = (/** @type {string} */ label) => {
        const b = /** @type {any} */ ([...el.querySelectorAll('button')].find((x) => x.textContent === label));
        b.click();
      };
      p.answer.forEach((/** @type {number} */ v, /** @type {number} */ i) => {
        for (const ch of String(Math.abs(v))) tap(ch);
        if ((p.signed || []).includes(i)) { tap('+/−'); if (v < 0) tap('+/−'); } else if (v < 0) tap('+/−');
        if (i < p.answer.length - 1) tap('Next box');
      });
    }
  } finally {
    S = keep.S; app = keep.app; live = keep.live;
    frozen = false;
  }
}
