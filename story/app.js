// @ts-check
// Front door: the episode menu, and handing the page to whichever episode is open.
// Remembers which one was open, so a reload lands back in the same place.
import * as ep1 from './ep1.js';
import * as ep2 from './ep2.js';
import * as ep3a from './ep3.js';
import * as ep3b from './ep3.js?mode=live'; // the same file again, as its own copy: see MODE in ep3.js
import { button, cleanup, TESTER } from './lib.js';

const AT = 'story:at';
const EPISODES = [
  { id: 'pilot', n: '1', mod: ep1, blurb: 'Five locks. Get the school trophy back out of Vark Tower.' },
  { id: 'heist2', n: '2', mod: ep2, blurb: 'Four floors, two chapters. Vark has dared you to come back for his own cup.' },
  // Episode 3 decides what to ask from how episode 2 went, so it waits for it (a teacher's test device does not).
  { id: 'siege3', n: '3a', mod: ep3a, after: ep2, afterN: '2', blurb: 'Vark comes to the school. His problems fly down the corridor at you. Stop them. No clock: they move when you answer.' },
  // 3b is the same night as real-time tower defence, for speed on what 3a taught.
  { id: 'siege3b', n: '3b', mod: ep3b, after: ep3a, afterN: '3a', blurb: 'The same night, at full speed. Build launchers, crack the plates, and be quick: this time they do not wait.' },
];
const app = /** @type {HTMLElement} */ (document.getElementById('app'));

function setAt(/** @type {string} */ id) {
  try { localStorage.setItem(AT, id); } catch { /* private mode */ }
  show(id);
}
const toMenu = () => setAt('menu');

function show(/** @type {string | null} */ id) {
  cleanup();
  const ep = EPISODES.find((e) => e.id === id);
  if (ep && (!ep.after || TESTER || ep.after.summary() === 'Finished')) { ep.mod.open(app, toMenu); window.scrollTo(0, 0); return; }
  app.innerHTML = '';
  const head = document.createElement('header');
  head.innerHTML = '<span>The Vark Job</span><span>Episodes</span>';
  const main = document.createElement('main');
  main.innerHTML = '<h1>The Vark Job</h1><p>Pick an episode. Each one keeps its own progress on this device.</p>';
  for (const e of EPISODES) {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `<b>Episode ${e.n}: ${e.mod.title}</b><br><span>${e.blurb}</span><br><span>${e.mod.summary()}</span>`;
    if (e.after && !TESTER && e.after.summary() !== 'Finished') {
      const wait = document.createElement('p');
      wait.className = 'hint';
      wait.textContent = `Opens when episode ${e.afterN} is finished.`;
      row.append(wait);
    } else row.append(button(`Play episode ${e.n}`, () => setAt(e.id)));
    main.append(row);
  }
  app.append(head, main);
  window.scrollTo(0, 0);
}

let at = null;
try { at = localStorage.getItem(AT); } catch { /* private mode */ }
show(at);
