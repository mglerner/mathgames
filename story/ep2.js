// @ts-check
// Episode 2 player: "The Other One". Four floors, one skill each.
//   doors       multiple choice; a wrong pick gets an explanation and a lockout
//   floor lock  typed answers; three right in a row opens it; these are the only
//               answers that count toward mastery (see mastery.js)
// State lives in localStorage.
import { content } from './episodes/heist2.js';
import { problem, count, SKILLS } from './episodes/heist2-skills.js';
import { levels2 } from './game/levels2.js';
import { paras, lines, button, optionList, shuffled, radios, TESTER, post, newSid, cleanup, runScreen, notesScreen, footer, typedPanel, reflect, matchForm, noteLabel } from './lib.js';
import { today, loadLog, recordAttempt, status, visibleMs } from './mastery.js';

const KEY = `story:${content.id}:v1`;
const TUMBLERS = 3; // right answers in a row to open a floor lock
const MAX_MISSES = 3; // on the third miss at one floor lock, Wrench drills it and the story moves on
const AWAY_MS = 180000; // a single answer slower than this is flagged "probably away"
const levelById = Object.fromEntries(levels2.map((l) => [l.id, l]));

/** The episode as a straight line of steps. */
const STEPS = (() => {
  /** @type {any[]} */ const s = [{ t: 'story', id: 'intro' }];
  content.floors.forEach((f, fi) => {
    if (fi === 2) s.push({ t: 'break' }, { t: 'recheck' });
    // a running section leads up to each of the first two doors; a third door, if any, follows straight on
    f.doors.forEach((_, di) => {
      if (f.runs[di]) s.push({ t: 'run', level: f.runs[di], fi });
      s.push({ t: 'door', fi, di });
    });
    s.push({ t: 'lock', fi }, { t: 'shop', fi });
  });
  s.push({ t: 'run', level: 'getaway2' }, { t: 'story', id: 'ending' }, { t: 'debrief' }, { t: 'notes' });
  // A name for each step that stays the same when steps are added or moved. Saved games remember
  // the name as well as the position, so a later version of the episode can find the right place.
  for (const x of s) x.key = [x.t, x.id ?? x.level ?? '', x.fi ?? '', x.di ?? ''].join(':');
  return s;
})();
// The step list as it was before the third doors were added: saves from then have no step name.
const STEPS_V1 = STEPS.filter((s) => !(s.t === 'door' && s.di > 1));
const BREAK_AT = STEPS.findIndex((s) => s.t === 'break');

const fresh = () => ({
  sid: newSid(), // names this play-through's feedback file on the server
  step: 0, sub: '',
  parts: 0, earned: 0, /** @type {string[]} */ gear: [],
  /** @type {Record<string, number>} */ k: {}, // "skill:form" -> how many problems of that form have been dealt
  /** @type {any} */ cur: null, // the problem on screen, as {skill, form, n}
  /** @type {string[]} */ struck: [], /** @type {string | null} */ opt: null, cleared: false,
  /** @type {any} */ lv: null, /** @type {string | null} */ vopt: null, // lockout problem and the wrong pick on it
  /** @type {any} */ fl: null, // floor lock in progress: {streak, misses, tries}
  /** @type {any} */ miss: null, // last typed miss: {ref, got, slip}
  /** @type {any} */ rc: null, // chapter 2 re-check: {q: skills to ask, i}
  /** @type {any} */ near: null, // "right value, not finished" note for the problem on screen: {key, slip}
  /** @type {Record<string, number>} */ nears: {}, // skill -> how many of those (they do not count either way)
  tryMiss: false, // the last keypad test entry did not match the card
  hide: pickHidden(), // ids of the doors whose right answer is left off the list
  /** @type {Record<string, any>} */ doors: {}, // door id -> {ask, wrong: [...], lockFails, ms}
  /** @type {any[]} */ typed: [], // every typed answer, in order
  /** @type {Record<string, any>} */ floors: {}, // floor id -> {result: 'open' | 'drilled', tries}
  /** @type {Record<string, number>} */ runHits: {}, /** @type {string[]} */ runSkips: [],
  active: { 1: 0, 2: 0 }, // on-screen milliseconds per chapter
  /** @type {string[]} */ days: [], /** @type {any} */ debrief: null,
});

/**
 * Now and then the right answer is not among the choices, so "My answer is not here" can be true.
 * One door per play-through (1 in 10 here), never the first door on a floor: that is where a new
 * shape is first met.
 */
function pickHidden() {
  const later = content.floors.flatMap((f) => f.doors.slice(1));
  return later.length ? [later[Math.floor(Math.random() * later.length)].id] : [];
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s || typeof s.step !== 'number') return fresh();
    const at = s.at || (STEPS_V1[s.step] || STEPS[0]).key;
    const step = STEPS.findIndex((x) => x.key === at);
    return { ...fresh(), ...s, step: step < 0 ? 0 : step };
  } catch {
    return fresh();
  }
}
let S = load();
let frozen = false; // true while drawing a preview: nothing is saved
function save() {
  if (frozen) return;
  /** @type {any} */ (S).at = STEPS[S.step].key;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: play on without saving */ }
}

/** @type {HTMLElement} */ let app;
let toMenu = () => {};
let mark = visibleMs(); // start of the current stretch of on-screen time
let pmark = 0; // when the problem now on screen was shown
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
  // Leaving the page (closing Safari, switching apps) banks the time spent on the current screen.
  document.addEventListener('visibilitychange', () => { if (live && document.visibilityState === 'hidden') { charge(); save(); } });
}
const go = (/** @type {object} */ patch = {}) => { charge(); Object.assign(S, patch); save(); render(); window.scrollTo(0, 0); };
const advance = () => go({ step: S.step + 1, sub: '', cur: null, struck: [], opt: null, cleared: false, lv: null, vopt: null, fl: null, miss: null, rc: null, near: null, tryMiss: false });
const send = () => (frozen ? Promise.resolve(false) : post(S.sid, report()));

/** Deal the next unused problem of one form of a skill. */
function take(/** @type {string} */ skill, /** @type {number} */ form) {
  const key = `${skill}:${form}`;
  const n = S.k[key] || 0;
  S.k[key] = n + 1;
  return { skill, form, n };
}
const P = (/** @type {any} */ ref) => problem(ref.skill, ref.form, ref.n);
const earn = (/** @type {number} */ n) => { S.parts += n; S.earned += n; };
const partsLine = (/** @type {number} */ n) => `<p class="cleared">+${n} part${n === 1 ? '' : 's'}. You have ${S.parts}.</p>`;

// ---------------------------------------------------------------- typed answers
const refKey = (/** @type {any} */ ref) => `${ref.skill}:${ref.form}:${ref.n}`;
/** The note shown above the keypad after a "right value, not finished" entry on this same problem. */
const nearNote = () => (S.near && S.cur && S.near.key === refKey(S.cur)
  ? `<div class="why"><h3>Not finished</h3><p>${S.near.slip}</p><p>Same problem. This did not count against you: finish it.</p></div>` : '');

/**
 * Record one typed answer everywhere it needs to go. Returns the grade, or null when the entry
 * had the right value but was not finished (e.g. 3 root 8 for root 72): that is neither a right
 * answer nor a miss, and the student gets the same problem again with a note.
 */
function recordTyped(/** @type {string} */ where, /** @type {number[]} */ vals) {
  const p = P(S.cur);
  const g = p.grade(vals);
  if (g.near) {
    S.nears[p.skill] = (S.nears[p.skill] || 0) + 1;
    go({ near: { key: refKey(S.cur), slip: g.slip } });
    return null;
  }
  const ms = visibleMs() - pmark;
  S.typed.push({ skill: p.skill, where, ask: p.askTxt, ans: p.ansTxt, got: p.gotTxt(vals), ok: g.ok, ms });
  recordAttempt(p.skill, g.ok, ms, `${content.id}:${where}`);
  if (g.ok) earn(1);
  else S.miss = missOf(S.cur, vals, S.typed.length - 1);
  return g;
}
/** What the miss page needs to know about one wrong typed answer. */
function missOf(/** @type {any} */ ref, /** @type {number[]} */ vals, /** @type {number} */ ti) {
  const p = P(ref);
  const g = p.grade(vals);
  return { ref, ti, id: g.id, got: p.gotHtml(vals), slip: g.slip };
}

/**
 * The page after a typed miss: what the student typed, the likely slip (with the working they
 * probably wrote, when their answer matches a known slip), the working done correctly, and the reflection.
 * @param {HTMLElement} main @param {string} heading @param {string} after @param {string} label @param {(note: any) => void} onNext
 */
function missPage(main, heading, after, label, onNext) {
  const p = P(S.miss.ref);
  const o = S.miss.id ? p.options.find((/** @type {any} */ x) => x.id === S.miss.id) : null;
  main.innerHTML = `<h2>${heading}</h2>
    <div class="why"><h3>What happened</h3><p>For &nbsp;${p.show}&nbsp; you typed <span class="picked">${S.miss.got}</span>.</p>
      ${o ? `<p>You probably wrote something like this:</p>${lines(o.guess)}` : ''}<p>${S.miss.slip}</p></div>
    <div class="fixed"><h3>Written correctly</h3>${lines(p.worked)}</div>
    ${p.quick ? `<div class="quick"><h3>Where this is heading: one step</h3>${p.quick}</div>` : ''}
    <p>${after}</p>${o ? matchForm : ''}${noteLabel}`;
  reflect(main, !!o, label, (note) => {
    if (S.typed[S.miss.ti]) Object.assign(S.typed[S.miss.ti], note);
    onNext(note);
  });
}

// ---------------------------------------------------------------- report
const secs = (/** @type {number} */ ms) => `${Math.round(ms / 1000)}s${ms > AWAY_MS ? ' (probably away)' : ''}`;
const mins = (/** @type {number} */ ms) => `${Math.round(ms / 60000)} min`;

/** @type {[string, string, string[]][]} */
const DEBRIEF = [
  ['feel', 'Did it feel like a game, or like homework with a story stuck on?', ['A game', 'Somewhere in between', 'Homework']],
  ['level', 'The math was...', ['Too easy', 'About right', 'Too hard']],
  ['typed', 'The floor locks (typing the answer, three in a row) were...', ['Fair', 'Hard but fair', 'Too many in a row', 'Too easy']],
  ['gear', 'The gear from Wrench...', ['Made the running more fun', 'Did not change much', 'Did not buy any']],
  ['length', 'One chapter was...', ['Too short', 'About right', 'Too long']],
  ['story', 'How much story between locks?', ['More story', 'About right', 'Less story, get to the locks']],
];

function report() {
  const d = S.debrief || {};
  const at = STEPS[S.step];
  const where = S.debrief ? 'finished, debrief done' : `step ${S.step + 1} of ${STEPS.length} (${at.t}${at.fi !== undefined ? `, ${content.floors[at.fi].name}` : ''}${S.sub ? `, ${S.sub}` : ''})`;
  const log = loadLog();
  const out = [
    `The Vark Job 2 (${content.title}): feedback${TESTER ? ' (TEST RUN by a teacher, not the student)' : ''}`,
    `Progress: ${where}`,
    `Played on: ${S.days.join(', ') || '-'}`,
    `Time on screen: chapter 1 ${mins(S.active[1])}, chapter 2 ${mins(S.active[2])} (stops counting when the page is hidden)`,
    `Parts earned: ${S.earned}. Gear bought: ${S.gear.join(', ') || 'none'}`,
    '',
    'SKILLS (typed answers only; Y = right, n = wrong, in order)',
  ];
  for (const f of content.floors) {
    const mine = S.typed.filter((t) => t.skill === f.skill);
    const fl = S.floors[f.id];
    out.push(`${SKILLS[f.skill].name}: ${mine.map((t) => (t.ok ? 'Y' : 'n')).join(' ') || '-'}`,
      `  floor lock: ${fl ? `${fl.result === 'open' ? 'opened' : 'DRILLED (not opened)'} after ${fl.tries} typed answers` : 'not reached'}${S.nears[f.skill] ? `; ${S.nears[f.skill]} right-value-but-unfinished entries (not counted either way)` : ''}`,
      `  status, all typed answers on this device (includes earlier runs if the student restarted): ${status(log[f.skill]).text}`);
  }
  out.push('', 'TYPED ANSWERS, in order');
  for (const t of S.typed) {
    out.push(`  [${t.where} ${t.skill}] ${t.ask} | typed ${t.got} | ${t.ok ? 'right' : `WRONG (answer ${t.ans})`} | ${secs(t.ms)}`);
    if (!t.ok) out.push(`      ${t.match === null ? 'no known slip matched, so no working was guessed' : `"probably wrote" matched: ${t.match || '-'}`} | their words: ${t.text || '-'}`);
  }
  out.push('', 'DOORS (multiple choice)');
  for (const f of content.floors) for (const door of f.doors) {
    const r = S.doors[door.id];
    if (!r) { out.push(`${door.title}: not reached`); continue; }
    out.push(`${door.title} (${f.skill}): ${r.ask} | ${r.wrong.length ? `${r.wrong.length} wrong` : 'right first try'}${r.lockFails ? `, ${r.lockFails} lockout miss(es)` : ''}${S.hide.includes(door.id) ? ' | RIGHT ANSWER LEFT OFF THE LIST' : ''}${r.own ? ` | ${r.own}` : ''} | ${secs(r.ms)}`);
    for (const n of r.wrong) out.push(`  ${n.typed ? 'said "not here" and typed' : 'picked'} ${n.txt} | ${n.typed && !n.match ? 'no known slip matched, so no working was guessed' : `"probably wrote" matched: ${n.match || 'no answer'}`} | their words: ${n.text}`);
  }
  out.push('', `Running sections, stumbles: ${levels2.map((l) => `${l.id} ${S.runHits[l.id] ?? '-'}`).join(', ')}`,
    `Running sections skipped: ${S.runSkips.length ? S.runSkips.join(', ') : 'none'}`, '');
  for (const [name, legend] of DEBRIEF) out.push(`${legend} ${d[name] || '-'}`);
  out.push(`What next: ${d.next || '-'}`, `Annoying or broken: ${d.broken || '-'}`);
  return out.join('\n');
}

// ---------------------------------------------------------------- screens
function render() {
  cleanup();
  app.innerHTML = '';
  const step = STEPS[S.step];
  const floor = step.fi !== undefined ? content.floors[step.fi] : null;
  const head = document.createElement('header');
  head.innerHTML = `<span>${content.title}</span><span>${floor ? `${floor.name} &middot; ` : ''}${S.parts} parts</span>`;
  app.append(head);
  const main = document.createElement('main');
  app.append(main);
  pmark = visibleMs();

  if (step.t === 'story') {
    const page = step.id === 'intro' ? { title: content.title, text: content.intro } : content.ending;
    main.innerHTML = `<h1>${page.title}</h1>${paras(page.text)}`;
    main.append(button(step.id === 'intro' ? 'Start the job' : 'Debrief', advance));
  } else if (step.t === 'run') {
    runScreen(main, levelById[step.level], S.gear, (hits, skipped) => {
      S.runHits[step.level] = (S.runHits[step.level] || 0) + hits;
      if (skipped) S.runSkips.push(step.level);
      advance();
    });
  } else if (step.t === 'door') {
    doorScreens(main, /** @type {any} */ (floor), /** @type {any} */ (floor).doors[step.di]);
  } else if (step.t === 'lock') {
    lockScreens(main, /** @type {any} */ (floor));
  } else if (step.t === 'shop') {
    shopScreen(main);
  } else if (step.t === 'break') {
    const b = content.chapterBreak;
    if (S.sub === 'stopped') {
      main.innerHTML = `<h2>${b.title}</h2>${paras(b.stopped)}`;
      main.append(button('I am back. Start chapter 2', advance));
    } else {
      main.innerHTML = `<h2>${b.title}</h2>${paras(b.text)}`;
      main.append(button('Stop here for today', () => { go({ sub: 'stopped' }); send(); }),
        button('Keep going now', () => { send(); advance(); }, 'btn quiet'));
    }
  } else if (step.t === 'recheck') {
    recheckScreens(main);
  } else if (step.t === 'debrief') {
    main.innerHTML = `<h2>Debrief</h2><p>You are out, with the cup. Same deal as last time: your answers decide what the next one looks like.</p>
      <form id="debrief">
        ${DEBRIEF.map(([name, legend, choices]) => radios(name, legend, choices)).join('')}
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

/** @param {HTMLElement} main @param {any} floor @param {any} door */
function doorScreens(main, floor, door) {
  if (!S.cur) {
    S.cur = take(floor.skill, door.form);
    S.doors[door.id] = { ask: P(S.cur).askTxt, wrong: [], lockFails: 0, ms: 0 };
    save();
  }
  const p = P(S.cur);
  const rec = S.doors[door.id];
  const hidden = S.hide.includes(door.id);
  const shown = hidden ? p.options.filter((/** @type {any} */ o) => !o.right) : p.options;
  const open = () => { rec.gain = rec.wrong.length ? 1 : 2; earn(rec.gain); go({ sub: 'win', near: null }); };
  if (S.sub === '') {
    main.innerHTML = `<h2>${door.title}</h2>${S.cleared ? '<p class="cleared">Lockout cleared. The lock wakes back up.</p>' : paras(door.story)}
      <div class="ask">${p.ask}</div><p class="hint">Work it out on paper first, then choose. Now and then the right answer is not on the list.</p>`;
    S.cleared = false;
    const list = optionList(shown);
    for (const o of shuffled(shown)) {
      const b = button(o.html, () => {
        rec.ms += visibleMs() - pmark;
        if (o.right) open(); else go({ sub: 'dead', opt: o.id });
      }, 'opt');
      if (S.struck.includes(o.id)) { b.disabled = true; b.classList.add('struck'); }
      list.append(b);
    }
    main.append(list, button('My answer is not here', () => { rec.ms += visibleMs() - pmark; go({ sub: 'own' }); }, 'btn quiet'));
  } else if (S.sub === 'own') {
    // Always the same page, whether or not the right answer is on the list, so asking gives nothing away.
    main.innerHTML = `<h2>Not on the list</h2>
      <p>Then do not guess. Type what you got. Sometimes the list really is missing the right answer, and sometimes something small slipped in the working: a sign, or one term that got missed.</p>${nearNote()}`;
    typedPanel(main, p, (vals) => {
      rec.ms += visibleMs() - pmark;
      const g = p.grade(vals);
      if (g.near) { S.nears[p.skill] = (S.nears[p.skill] || 0) + 1; go({ near: { key: refKey(S.cur), slip: g.slip } }); return; }
      if (g.ok) { rec.own = hidden ? 'typed the right answer' : 'said "not here" but typed the right answer, which was on the list'; open(); return; }
      go({ sub: 'ownmiss', near: null, miss: { ...missOf(S.cur, vals, -1), txt: p.gotTxt(vals) } });
    });
    main.append(button('Back to the list', () => { rec.ms += visibleMs() - pmark; go({ sub: '', near: null }); }, 'link'));
  } else if (S.sub === 'ownmiss') {
    missPage(main, 'Setback', 'So that was not it. The lock wants proof before it takes another try.', 'Continue', (note) => {
      rec.wrong.push({ txt: S.miss.txt, typed: true, ...note });
      go({ sub: 'lockout', miss: null, lv: take(floor.skill, door.form) });
      send();
    });
  } else if (S.sub === 'dead') {
    const idx = p.options.findIndex((/** @type {any} */ x) => x.id === S.opt);
    const o = p.options[idx];
    main.innerHTML = `<h2>Setback</h2><p>${door.setbacks[(idx + rec.wrong.length) % door.setbacks.length]}</p>
      <div class="why"><h3>What happened</h3><p>You chose <span class="picked">${o.html}</span>. You probably wrote something like this:</p>
        ${lines(o.guess)}<p>${o.slip}</p></div>
      <div class="fixed"><h3>Written correctly</h3>${lines(p.worked)}</div>
      ${p.quick ? `<div class="quick"><h3>Where this is heading: one step</h3>${p.quick}</div>` : ''}
      ${matchForm}${noteLabel}`;
    reflect(main, true, 'Continue', (note) => {
      rec.wrong.push({ txt: o.txt, ...note });
      // A miss has to clear the lockout panel (same kind of problem, fresh numbers) before the door takes another try.
      go({ sub: 'lockout', struck: [...S.struck, o.id], opt: null, lv: take(floor.skill, door.form) });
      send(); // keep the server copy current even if the student never reaches the debrief
    });
  } else if (S.sub === 'lockout') {
    const v = P(S.lv);
    main.innerHTML = `<h2>Lockout</h2>
      <p>Vark's locks still do not let you just try again. The smaller screen lights up: <i>"Prove you learned something. Then we can talk."</i></p>
      <p>Same idea, fresh numbers. Open this and ${door.title} wakes back up.</p>
      <div class="ask small">${v.ask}</div><p class="hint">On paper first. A wrong answer here gets you new numbers.</p>`;
    const list = optionList(v.options);
    for (const o of shuffled(v.options)) {
      list.append(button(o.html, () => {
        if (o.right) go({ sub: '', cleared: true, lv: null });
        else { rec.lockFails++; go({ sub: 'lockfail', vopt: o.id }); }
      }, 'opt'));
    }
    main.append(list);
  } else if (S.sub === 'lockfail') {
    const v = P(S.lv);
    const o = v.options.find((/** @type {any} */ x) => x.id === S.vopt);
    main.innerHTML = `<h2>Still locked out</h2>
      <div class="why"><h3>What happened</h3><p>For &nbsp;${v.show}&nbsp; you chose <span class="picked">${o.html}</span>.</p><p>${o.slip}</p></div>
      <div class="fixed"><h3>Written correctly</h3>${lines(v.worked)}</div>
      <p>The little screen clears and deals you new numbers.</p>`;
    main.append(button('New numbers', () => go({ sub: 'lockout', vopt: null, lv: take(floor.skill, door.form) })));
  } else {
    const right = p.options.find((/** @type {any} */ o) => o.right);
    const own = !rec.own ? '' : hidden
      ? '<p class="cleared">The right answer was not on the list. You trusted your working over the choices.</p>'
      : `<p class="hint">Your answer was right, and it was on the list, written as <span class="picked">${right.html}</span>. Worth a second look at the choices next time.</p>`;
    main.innerHTML = `<h2>${door.title}: open</h2>${own}${paras(door.win)}${partsLine(rec.gain)}
      ${rec.gain === 2 ? '' : '<p class="hint">A door opened on the first try is worth 2 parts.</p>'}`;
    main.append(button('Keep going', advance));
  }
}

const tumblers = (/** @type {number} */ n) => `<div class="tumblers">${Array.from({ length: TUMBLERS }, (_, i) => `<span class="${i < n ? 'set' : ''}"></span>`).join('')}</div>`;

/** @param {HTMLElement} main @param {any} floor */
function lockScreens(main, floor) {
  const lock = floor.lock;
  const forms = SKILLS[floor.skill].forms;
  if (S.sub === '') {
    main.innerHTML = `<h2>${lock.title}</h2>${paras(lock.story)}${tumblers(0)}`;
    // The demo is the last problem in the list, which the game is very unlikely ever to deal.
    main.append(button('Step up to the lock', () => go({ sub: 'try', cur: { skill: floor.skill, form: 0, n: count(floor.skill, 0) - 1 } })));
  } else if (S.sub === 'try') {
    // The keypad works differently on each floor. The student meets it here, where nothing counts,
    // not on the first problem that does.
    const p = P(S.cur);
    const right = p.options.find((/** @type {any} */ o) => o.right);
    main.innerHTML = `<h2>${lock.title}</h2>
      <p>"Test the keypad before it counts," says Wrench. She holds up a card with an answer already on it. "Copy that in. If it takes it, the keypad is fine and so are you."</p>
      <div class="similar"><h3>Wrench's card</h3><div class="work"><div>${p.skill === 'solve' ? `${p.show}<br>${right.html}` : `${p.show} = ${right.html}`}</div></div></div>
      ${S.tryMiss ? '<p class="cleared">That is not what the card says. Nothing lost. Look at each box, and at any + or &minus; between them, and try again.</p>' : ''}`;
    typedPanel(main, p, (vals) => {
      if (vals.every((v, i) => v === p.answer[i])) go({ sub: 'type', tryMiss: false, fl: { streak: 0, misses: 0, tries: 0 }, cur: take(floor.skill, 0) });
      else go({ tryMiss: true });
    });
  } else if (S.sub === 'type') {
    main.innerHTML = `<h2>${lock.title}</h2>${tumblers(S.fl.streak)}
      <p class="hint">${S.fl.streak ? `${S.fl.streak} set. ${TUMBLERS - S.fl.streak} to go.` : 'Three right in a row opens it.'} On paper first.</p>${nearNote()}`;
    typedPanel(main, P(S.cur), (vals) => {
      const g = recordTyped('lock', vals);
      if (!g) return;
      S.fl.tries++;
      if (!g.ok) { S.fl.misses++; S.fl.streak = 0; go({ sub: 'miss' }); return; }
      S.fl.streak++;
      if (S.fl.streak < TUMBLERS) { go({ cur: take(floor.skill, S.fl.tries % forms) }); return; }
      S.floors[floor.id] = { result: 'open', tries: S.fl.tries };
      earn(2);
      go({ sub: 'open' });
      send();
    });
  } else if (S.sub === 'miss') {
    const out = S.fl.misses >= MAX_MISSES;
    missPage(main, 'The tumblers drop', out ? 'Wrench puts a hand on your shoulder.' : 'All three tumblers reset. The keypad deals you new numbers.', out ? 'Continue' : 'New numbers', () => {
      if (!out) { go({ sub: 'type', cur: take(floor.skill, S.fl.tries % forms) }); send(); return; }
      S.floors[floor.id] = { result: 'drilled', tries: S.fl.tries };
      go({ sub: 'drilled' });
      send();
    });
  } else if (S.sub === 'open') {
    main.innerHTML = `<h2>${lock.title}: open</h2>${tumblers(TUMBLERS)}${paras(lock.open)}${partsLine(2)}`;
    main.append(button('To the workbench', advance));
  } else {
    main.innerHTML = `<h2>${lock.title}: drilled</h2>${paras(lock.bypass)}`;
    main.append(button('To the workbench', advance));
  }
}

/** Chapter 2 opens with typed problems from the chapter 1 skills, on (ideally) a different day. */
function recheckScreens(/** @type {HTMLElement} */ main) {
  const rc = content.recheck;
  const skills = content.floors.slice(0, 2).map((f) => f.skill);
  const nextRef = (/** @type {string[]} */ q, /** @type {number} */ i) => {
    const seen = q.slice(0, i).filter((s) => s === q[i]).length;
    return take(q[i], (seen + 1) % SKILLS[q[i]].forms);
  };
  const move = () => {
    const i = S.rc.i + 1;
    if (i >= S.rc.q.length) { go({ sub: 'done', rc: { ...S.rc, i } }); send(); } else go({ sub: 'type', rc: { ...S.rc, i }, cur: nextRef(S.rc.q, i) });
  };
  if (S.sub === '') {
    main.innerHTML = `<h2>${rc.title}</h2>${paras(rc.story)}`;
    const q = [...skills, ...skills];
    main.append(button('Step up to the panel', () => go({ sub: 'type', rc: { q, i: 0 }, cur: nextRef(q, 0) })));
  } else if (S.sub === 'type') {
    main.innerHTML = `<h2>${rc.title}</h2><p class="hint">Question ${S.rc.i + 1} of ${S.rc.q.length}. On paper first.</p>${nearNote()}`;
    typedPanel(main, P(S.cur), (vals) => {
      const g = recordTyped('recheck', vals);
      if (!g) return;
      if (g.ok) { move(); return; }
      // a miss earns one more question of that kind, once
      const skill = S.cur.skill;
      if (S.rc.q.filter((/** @type {string} */ s) => s === skill).length < 3) S.rc.q.push(skill);
      go({ sub: 'miss' });
    });
  } else if (S.sub === 'miss') {
    missPage(main, 'Not that one', 'Nothing drops here. The panel just moves on.', 'Next question', move);
  } else {
    main.innerHTML = `<h2>${rc.title}: open</h2>${paras(rc.done)}`;
    main.append(button('Keep going', advance));
  }
}

function shopScreen(/** @type {HTMLElement} */ main) {
  main.innerHTML = `<h2>Wrench's workbench</h2>
    <p>Wrench tips a handful of springs and tiny brass gears onto an upturned bucket. "Parts. What do you want built?"</p>
    <p class="cleared">You have ${S.parts} part${S.parts === 1 ? '' : 's'}.</p>`;
  for (const item of content.shop) {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `<b>${item.name}</b> &middot; ${item.cost} parts<br><span>${item.what}</span>`;
    const own = S.gear.includes(item.id);
    const b = button(own ? 'Built' : `Build ${item.name}`, () => { S.parts -= item.cost; S.gear.push(item.id); go(); }, 'btn quiet');
    b.disabled = own || S.parts < item.cost;
    row.append(b);
    main.append(row);
  }
  main.append(button('Back to the job', advance));
}

/** One line for the episode menu. */
export function summary() {
  if (S.debrief) return 'Finished';
  if (S.step === 0) return 'Not started';
  const at = STEPS[S.step];
  return `In progress: chapter ${chapter()}${at.fi !== undefined ? `, ${content.floors[at.fi].name}` : ''}`;
}
export const title = content.title;

/** @param {HTMLElement} el @param {() => void} menu */
export function open(el, menu) {
  app = el;
  toMenu = () => { charge(); save(); live = false; menu(); };
  live = true;
  mark = visibleMs();
  render();
}

// ---------------------------------------------------------------- previews
// Every kind of screen, as a saved-state patch. test/preview.html draws these with the real
// `render` above (so a preview can never show something the game does not), and
// test/preview.test.js fails if a screen exists that is not listed here.

/** Typed values that hit a known slip for each skill, worked out from the right answer. */
const SLIP = {
  dist: (/** @type {any} */ p) => p.options[1].vals,
  solve: (/** @type {any} */ p) => [-p.answer[0]],
  simplify: (/** @type {any} */ p) => [p.answer[0] ** 2, p.answer[1]],
  rationalize: (/** @type {any} */ p) => [p.answer[0] * p.answer[1], p.answer[1]],
};

/** @returns {{name: string, patch: object, fill?: boolean}[]} */
export function previews() {
  /** @type {{name: string, patch: object, fill?: boolean}[]} */ const out = [];
  const at = (/** @type {(s: any) => boolean} */ f) => STEPS.findIndex(f);
  out.push({ name: 'intro', patch: { step: 0 } });
  content.floors.forEach((floor, fi) => {
    const sk = floor.skill;
    const door = floor.doors[0];
    const dref = { skill: sk, form: door.form, n: 0 };
    const dp = P(dref);
    const dstate = { step: at((s) => s.t === 'door' && s.fi === fi && s.di === 0), cur: dref, doors: { [door.id]: { ask: dp.askTxt, wrong: [], lockFails: 0, ms: 0, gain: 2 } } };
    out.push({ name: `${sk}-door`, patch: { ...dstate, sub: '' } });
    out.push({ name: `${sk}-door-dead`, patch: { ...dstate, sub: 'dead', opt: 'o1' } });
    const lstep = at((s) => s.t === 'lock' && s.fi === fi);
    for (let form = 0; form < SKILLS[sk].forms; form++) {
      const ref = { skill: sk, form, n: 1 };
      const lock = { step: lstep, sub: 'type', cur: ref, fl: { streak: form % TUMBLERS, misses: 0, tries: form } };
      if (form === 0) out.push({ name: `${sk}-lock-try`, patch: { step: lstep, sub: 'try', tryMiss: fi === 0, cur: { skill: sk, form: 0, n: count(sk, 0) - 1 } }, fill: true });
      if (form === 0) out.push({ name: `${sk}-lock-empty`, patch: lock });
      out.push({ name: `${sk}-lock-filled-${form}`, patch: lock, fill: true });
      if (form === 0) out.push({ name: `${sk}-lock-miss`, patch: { ...lock, sub: 'miss', fl: { streak: 0, misses: 1, tries: 1 }, typed: [{}], miss: missOf(ref, SLIP[sk](P(ref)), 0) } });
    }
    if (fi === 0) {
      out.push({ name: 'door-hidden', patch: { ...dstate, sub: '', hide: [door.id] } });
      out.push({ name: 'door-own', patch: { ...dstate, sub: 'own' }, fill: true });
      out.push({ name: 'door-ownmiss', patch: { ...dstate, sub: 'ownmiss', miss: { ...missOf(dref, SLIP[sk](dp), -1), txt: dp.gotTxt(SLIP[sk](dp)) } } });
      out.push({ name: 'door-win-own', patch: { ...dstate, sub: 'win', parts: 2, hide: [door.id], doors: { [door.id]: { ...dstate.doors[door.id], own: 'typed the right answer' } } } });
      out.push({ name: 'door-lockout', patch: { ...dstate, sub: 'lockout', lv: { ...dref, n: 2 } } });
      out.push({ name: 'door-lockfail', patch: { ...dstate, sub: 'lockfail', lv: { ...dref, n: 2 }, vopt: 'o2' } });
      out.push({ name: 'door-win', patch: { ...dstate, sub: 'win', parts: 2 } });
      out.push({ name: 'lock-intro', patch: { step: lstep, sub: '' } });
      out.push({ name: 'lock-open', patch: { step: lstep, sub: 'open', parts: 9 } });
      out.push({ name: 'lock-drilled', patch: { step: lstep, sub: 'drilled' } });
      out.push({ name: 'shop', patch: { step: at((s) => s.t === 'shop'), parts: 9, gear: ['scanner'] } });
    }
  });
  const rstep = at((s) => s.t === 'recheck');
  const rref = { skill: 'solve', form: 1, n: 3 };
  out.push({ name: 'break', patch: { step: BREAK_AT } }, { name: 'break-stopped', patch: { step: BREAK_AT, sub: 'stopped' } });
  out.push({ name: 'recheck-intro', patch: { step: rstep } });
  out.push({ name: 'recheck-type', patch: { step: rstep, sub: 'type', cur: rref, rc: { q: ['dist', 'solve', 'dist', 'solve'], i: 1 } } });
  out.push({ name: 'recheck-miss', patch: { step: rstep, sub: 'miss', cur: rref, rc: { q: ['dist', 'solve', 'dist', 'solve'], i: 1 }, typed: [{}], miss: missOf(rref, [999], 0) } });
  out.push({ name: 'recheck-done', patch: { step: rstep, sub: 'done' } });
  out.push({ name: 'ending', patch: { step: at((s) => s.t === 'story' && s.id === 'ending') } });
  out.push({ name: 'debrief', patch: { step: at((s) => s.t === 'debrief') } });
  out.push({ name: 'notes', patch: { step: at((s) => s.t === 'notes') } });
  out.push({ name: 'run', patch: { step: at((s) => s.t === 'run'), gear: ['scanner', 'boots', 'trail'] } });
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
    S = /** @type {any} */ ({ ...fresh(), hide: [], ...JSON.parse(JSON.stringify(pv.patch)) });
    app = el;
    render();
    if (pv.fill) {
      const p = P(S.cur);
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
