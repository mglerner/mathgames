// @ts-check
// Front door: the episode menu, and handing the page to whichever episode is open.
// Remembers which one was open, so a reload lands back in the same place.
import * as ep1 from './ep1.js';
import * as ep2 from './ep2.js';
import * as ep3 from './ep3.js';
import { button, cleanup } from './lib.js';

const AT = 'story:at';
const EPISODES = [
  { id: 'pilot', n: 1, mod: ep1, blurb: 'Five locks. Get the school trophy back out of Vark Tower.' },
  { id: 'heist2', n: 2, mod: ep2, blurb: 'Four floors, two chapters. Vark has dared you to come back for his own cup.' },
  { id: 'siege3', n: 3, mod: ep3, blurb: 'Vark comes to the school. His problems fly down the corridor at you. Stop them.' },
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
  if (ep) { ep.mod.open(app, toMenu); window.scrollTo(0, 0); return; }
  app.innerHTML = '';
  const head = document.createElement('header');
  head.innerHTML = '<span>The Vark Job</span><span>Episodes</span>';
  const main = document.createElement('main');
  main.innerHTML = '<h1>The Vark Job</h1><p>Pick an episode. Each one keeps its own progress on this device.</p>';
  for (const e of EPISODES) {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `<b>Episode ${e.n}: ${e.mod.title}</b><br><span>${e.blurb}</span><br><span>${e.mod.summary()}</span>`;
    row.append(button(`Play episode ${e.n}`, () => setAt(e.id)));
    main.append(row);
  }
  app.append(head, main);
  window.scrollTo(0, 0);
}

let at = null;
try { at = localStorage.getItem(AT); } catch { /* private mode */ }
show(at);
