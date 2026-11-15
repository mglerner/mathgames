// @ts-check
// Episode 1 player: "The Vark Job". Five hand-written locks, multiple choice.
// State lives in localStorage.
import { episode } from './episodes/pilot.js';
import { variant } from './episodes/pilot-variants.js';
import { levels } from './game/levels.js';
import { paras, lines, button, optionList, shuffled, radios, TESTER, post, newSid, cleanup, runScreen, notesScreen, footer } from './lib.js';

const KEY = `story:${episode.id}:v2`;
const fresh = () => ({
  sid: newSid(), // names this play-through's feedback file on the server
  screen: 'intro', i: 0, opt: null, vopt: null, cleared: false,
  struck: {}, // lock id -> wrong option ids already tried
  vk: {}, // lock id -> how many lockout problems have been served
  lockFails: {}, // lock id -> wrong answers on lockout problems
  runHits: {}, // level id -> stumbles in the running sections
  runSkips: [], // level ids where the student pressed Skip
  notes: [], debrief: null,
});

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.screen ? { ...fresh(), ...s } : fresh();
  } catch {
    return fresh();
  }
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: play on without saving */ }
}

/** @type {HTMLElement} */ let app;
let toMenu = () => {};
const go = (/** @type {object} */ patch) => { Object.assign(S, patch); save(); render(); window.scrollTo(0, 0); };

/** @type {[string, string, string[]][]} */
const DEBRIEF = [
  ['feel', 'Did it feel like a game, or like homework with a story stuck on?', ['A game', 'Somewhere in between', 'Homework']],
  ['level', 'The math was...', ['Too easy', 'About right', 'Too hard']],
  ['story', 'How much story between locks?', ['More story', 'About right', 'Less story, get to the locks']],
  ['explain', 'The explanations after a wrong answer were...', ['Helpful', 'Too long', 'Confusing', 'Never saw one']],
  ['lockout', 'The lockout panel (fresh numbers before you can retry) was...', ['Fair', 'Annoying but fair', 'Too much', 'Never saw one']],
  ['running', 'The running parts were...', ['Fun', 'Fine', 'Annoying', 'Too easy', 'Too hard']],
  ['theme', 'For the next one...', ['Keep the heist going', 'Different story (say what below)']],
];

function report() {
  const d = S.debrief || {};
  const where = S.debrief ? 'finished, debrief done' : S.screen === 'intro' ? 'not started' : `at lock ${S.i + 1} of ${episode.problems.length} (${S.screen})`;
  const out = [`${episode.title}: feedback${TESTER ? ' (TEST RUN by a teacher, not the student)' : ''}`, `Progress: ${where}`, ''];
  for (const p of episode.problems) {
    const mine = S.notes.filter((n) => n.pid === p.id);
    out.push(`${p.title}: ${mine.length ? `${mine.length} wrong` : 'no wrong answers'}${S.lockFails[p.id] ? `, ${S.lockFails[p.id]} lockout miss(es)` : ''}`);
    for (const n of mine) out.push(`  picked ${n.txt} | "probably wrote" matched: ${n.match || 'no answer'} | their words: ${n.text}`);
  }
  out.push('', `Running sections, stumbles: ${levels.map((l) => `${l.id} ${S.runHits[l.id] ?? '-'}`).join(', ')}`,
    `Running sections skipped: ${S.runSkips.length ? S.runSkips.join(', ') : 'none'}`);
  out.push('', `Hardest lock: ${d.hardest || '-'}`);
  for (const [name, legend] of DEBRIEF) out.push(`${legend} ${d[name] || '-'}`);
  out.push(`Theme / what next: ${d.next || '-'}`, `Annoying or broken: ${d.broken || '-'}`);
  return out.join('\n');
}

const send = () => post(S.sid, report());

function render() {
  cleanup();
  app.innerHTML = '';
  const P = episode.problems[S.i];
  const inJob = !['intro', 'end', 'notes'].includes(S.screen);
  const head = document.createElement('header');
  head.innerHTML = `<span>${episode.title}</span><span>${S.screen === 'escape' ? 'Getaway' : inJob ? `Lock ${S.i + 1} of ${episode.problems.length}` : ''}</span>`;
  app.append(head);
  const main = document.createElement('main');
  app.append(main);

  if (S.screen === 'intro') {
    main.innerHTML = `<h1>${episode.title}</h1>${paras(episode.intro)}
      <p class="hint">This is a test run. What you pick and what you write in the notes gets sent to your teacher, so the next job can be built around it.</p>`;
    main.append(button('Start the job', () => go({ screen: 'run', i: 0 })));
  } else if (S.screen === 'run') {
    runScreen(main, levels[S.i], [], ran(S.i, { screen: 'problem' }));
  } else if (S.screen === 'escape') {
    runScreen(main, levels[episode.problems.length], [], ran(episode.problems.length, { screen: 'end' }));
  } else if (S.screen === 'problem') {
    const struck = S.struck[P.id] || [];
    main.innerHTML = `<h2>${P.title}</h2>${S.cleared ? '<p class="cleared">Lockout cleared. The lock wakes back up.</p>' : paras(P.story)}
      <div class="ask">${P.ask}</div><p class="hint">Work it out on paper first, then choose.</p>`;
    S.cleared = false;
    const list = optionList(P.options);
    for (const o of shuffled(P.options)) {
      const b = button(o.html, () => go(o.right ? { screen: 'win' } : { screen: 'dead', opt: o.id }), 'opt');
      if (struck.includes(o.id)) { b.disabled = true; b.classList.add('struck'); }
      list.append(b);
    }
    main.append(list, button('My answer is not here', () => go({ screen: 'recheck' }), 'btn quiet'));
  } else if (S.screen === 'recheck') {
    main.innerHTML = `<h2>Not on the list</h2>
      <p>Then do not guess. If your answer is not one of the choices, something slipped in the working, and it is usually something small: a sign, or one term that got missed.</p>
      <p>Go back over each line and ask the same question of every step: <i>what did I do, and did I do it to everything?</i></p>`;
    main.append(button('Back to the lock', () => go({ screen: 'problem' })));
  } else if (S.screen === 'dead') {
    const o = P.options.find((x) => x.id === S.opt);
    main.innerHTML = `<h2>${o.near ? 'Close' : 'Setback'}</h2><p>${o.setback}</p>
      <div class="why"><h3>What happened</h3><p>You chose <span class="picked">${o.html}</span>. You probably wrote something like this:</p>
        ${lines(o.guess)}${o.guess2 ? `<p>Or, if you divided by 2 first:</p>${lines(o.guess2)}` : ''}<p>${o.why}</p></div>
      <div class="fixed"><h3>Written correctly</h3>${lines(o.fix)}${o.fix2 ? `<p>Dividing by 2 first works just as well:</p>${lines(o.fix2)}` : ''}</div>
      ${o.quick ? `<div class="quick"><h3>Where this is heading: one step</h3>${o.quick}</div>` : ''}
      ${o.near ? '' : `<div class="similar"><p>${P.similar}</p></div>`}
      <form id="match">${radios('match', 'Was the red working above what you actually wrote?', ['Yes', 'Sort of', 'No, I did something else'])}</form>
      <label for="note">In your own words: what went wrong?</label>`;
    const ta = document.createElement('textarea');
    ta.id = 'note';
    ta.rows = 3;
    ta.placeholder = 'One sentence is fine.';
    const next = button(o.near ? 'Back to the lock' : 'Continue', () => {
      const match = new FormData(/** @type {HTMLFormElement} */ (document.getElementById('match'))).get('match');
      S.notes.push({ pid: P.id, lock: P.title, picked: o.html, txt: o.txt, text: ta.value.trim(), match });
      S.struck[P.id] = [...(S.struck[P.id] || []), o.id];
      // A near miss goes straight back. A real miss has to clear the lockout panel first.
      go(o.near ? { screen: 'problem', opt: null } : { screen: 'lockout', opt: null });
      send(); // keep the server copy current even if the student never reaches the debrief
    });
    next.disabled = true;
    ta.addEventListener('input', () => { next.disabled = ta.value.trim().length < 5; });
    main.append(ta, next);
  } else if (S.screen === 'lockout') {
    const V = variant(P.id, S.vk[P.id] || 0);
    main.innerHTML = `<h2>Lockout</h2>
      <p>Vark's locks do not let you just try again. A second, smaller screen lights up: <i>"Prove you learned something. Then we can talk."</i></p>
      <p>Same idea, fresh numbers. Open this and ${P.title} wakes back up.</p>
      <div class="ask small">${V.ask}</div><p class="hint">On paper first. A wrong answer here gets you new numbers.</p>`;
    const list = optionList(V.options);
    for (const o of shuffled(V.options)) {
      list.append(button(o.html, () => {
        if (o.right) {
          S.vk[P.id] = (S.vk[P.id] || 0) + 1;
          go({ screen: 'problem', cleared: true });
        } else {
          S.lockFails[P.id] = (S.lockFails[P.id] || 0) + 1;
          go({ screen: 'lockfail', vopt: o.id });
        }
      }, 'opt'));
    }
    main.append(list);
  } else if (S.screen === 'lockfail') {
    const V = variant(P.id, S.vk[P.id] || 0);
    const o = V.options.find((x) => x.id === S.vopt);
    main.innerHTML = `<h2>Still locked out</h2>
      <div class="why"><h3>What happened</h3><p>For &nbsp;${V.ask}&nbsp; you chose <span class="picked">${o.html}</span>.</p><p>${o.slip}</p></div>
      <div class="fixed"><h3>Written correctly</h3>${lines(V.worked)}</div>
      <p>The little screen clears and deals you new numbers.</p>`;
    main.append(button('New numbers', () => {
      S.vk[P.id] = (S.vk[P.id] || 0) + 1;
      go({ screen: 'lockout', vopt: null });
    }));
  } else if (S.screen === 'win') {
    const last = S.i === episode.problems.length - 1;
    main.innerHTML = `<h2>${P.title}: open</h2>${paras(P.win)}`;
    main.append(button(last ? 'Run for it' : 'Keep going', () => go(last ? { screen: 'escape' } : { screen: 'run', i: S.i + 1 })));
  } else if (S.screen === 'end') {
    main.innerHTML = `<h2>Debrief</h2><p>You are out, with the trophy. That was a short test run: five locks. Your answers here decide what the next one looks like, so be honest. Nobody's feelings are involved.</p>
      <form id="debrief">
        ${radios('hardest', 'Which lock was hardest?', episode.problems.map((p) => p.title))}
        ${DEBRIEF.map(([name, legend, choices]) => radios(name, legend, choices)).join('')}
        <label for="next">What story would you rather be in? Or: what should happen next in this one?</label>
        <textarea id="next" name="next" rows="3"></textarea>
        <label for="broken">Anything annoying, confusing, or broken?</label>
        <textarea id="broken" name="broken" rows="3"></textarea>
      </form>`;
    main.append(button('Done', () => {
      const f = new FormData(/** @type {HTMLFormElement} */ (document.getElementById('debrief')));
      go({ screen: 'notes', debrief: Object.fromEntries(f.entries()) });
    }));
  } else {
    notesScreen(main, report(), send());
  }
  footer(app, toMenu, () => { S = fresh(); save(); render(); window.scrollTo(0, 0); });
}

/** After a running section: record stumbles and skips, then move on. */
const ran = (/** @type {number} */ i, /** @type {object} */ patch) => (/** @type {number} */ hits, /** @type {boolean} */ skipped) => {
  const id = levels[i].id;
  S.runHits[id] = (S.runHits[id] || 0) + hits;
  if (skipped) S.runSkips.push(id);
  go(patch);
};

/** One line for the episode menu. */
export function summary() {
  if (S.debrief) return 'Finished';
  if (S.screen === 'intro') return 'Not started';
  return `In progress: lock ${S.i + 1} of ${episode.problems.length}`;
}
export const title = episode.title;

/** @param {HTMLElement} el @param {() => void} menu */
export function open(el, menu) {
  app = el;
  toMenu = menu;
  render();
}
