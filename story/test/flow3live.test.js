// Drives episode 3 in live mode end to end against a minimal fake page, with a fake animation
// clock: building, opening plates (right, wrong, unfinished, closed), the corridor crawling
// while a plate is open and stopped at the cart, a lost wave and its retry, the Chairman, and
// the report.
import test from 'node:test';
import assert from 'node:assert/strict';

test('episode 3, live mode: full play-through', async () => {
  const store = { 'story:tester': '1' };
  const posts = [];
  const mk = (tag) => ({
    tag, children: [], className: '', _h: '', listeners: {}, disabled: false, value: '', textContent: '', dataset: {},
    classList: { add() {} }, select() {},
    set innerHTML(v) { this._h = v; this.children = []; }, get innerHTML() { return this._h; },
    append(...k) { this.children.push(...k); }, addEventListener(e, f) { this.listeners[e] = f; },
  });
  const appEl = mk('div');
  let formData = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  globalThis.document = { getElementById: (id) => (id === 'app' ? appEl : { id }), createElement: mk, execCommand: () => true };
  globalThis.window = { scrollTo() {}, isSecureContext: false };
  globalThis.FormData = class { get(k) { return formData[k] ?? null; } entries() { return Object.entries(formData); } };
  globalThis.fetch = async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  // the animation clock: frames only happen when the test pumps them
  let queue = [], clock = 1000, rafId = 0;
  globalThis.requestAnimationFrame = (f) => { queue.push({ id: ++rafId, f }); return rafId; };
  globalThis.cancelAnimationFrame = (id) => { queue = queue.filter((q) => q.id !== id); };
  const pump = (secs) => { for (let i = 0; i < secs * 20; i++) { clock += 50; const q = queue; queue = []; for (const { f } of q) f(clock); } };

  const { content, TUNING } = await import('../episodes/siege3.js');
  TUNING.mode = 'live';
  const L = TUNING.live;
  await import('../app.js');
  const { problem } = await import('../episodes/siege3-skills.js');
  const { reach } = await import('../game/live.js');

  const st = () => JSON.parse(store['story:siege3:v1'] || '{}');
  const main = () => appEl.children[1];
  const flat = (n) => [n, ...(n.children || []).flatMap(flat)];
  const btns = () => flat(appEl).filter((n) => n.tag === 'button');
  const find = (label) => btns().find((x) => (label instanceof RegExp ? label.test(x.innerHTML) : x.innerHTML === label));
  const click = (label) => {
    const b = find(label);
    assert.ok(b, `button ${label} at ${st().at} ${st().sub}`);
    assert.ok(!b.disabled, `button ${label} enabled at ${st().at} ${st().sub}`);
    b.listeners.click();
  };
  const html = () => flat(main()).map((n) => n.innerHTML).join('\n');
  const P = (ref) => problem(ref.skill, ref.form, ref.n);
  const chips = () => btns().filter((b) => b.className === 'chip');
  const open = () => st().w.squads.find((s) => s.id === st().target);
  const type = (vals) => {
    const p = P(open().ref);
    vals.forEach((v, i) => {
      for (const ch of String(Math.abs(v))) click(ch);
      if ((p.signed || []).includes(i)) { click('+/&minus;'); if (v < 0) click('+/&minus;'); } else if (v < 0) click('+/&minus;');
      if (i < vals.length - 1) click('Next box');
    });
    click('Enter');
  };
  const note = (text) => { const ta = flat(main()).find((n) => n.tag === 'textarea'); ta.value = text; ta.listeners.input(); };
  const scouts = (wi) => {
    const n = st().plan[content.waves[wi].id].scouts.length;
    for (let i = 0; i < n; i++) click(P(st().cur).options.find((o) => o.right).html);
  };
  /** Wait for a plate to be on offer and open the first one. */
  const openPlate = () => {
    for (let i = 0; i < 400 && !chips().length && st().sub === ''; i++) pump(0.5);
    assert.ok(chips().length, 'a formation with a plate comes into reach');
    chips()[0].listeners.click();
    assert.equal(st().sub, 'plate');
  };
  /** Answer every plate right as it comes, until the wave is over. */
  const playOut = () => {
    for (let i = 0; i < 3000 && (st().sub === '' || st().sub === 'plate'); i++) {
      if (st().sub === 'plate') type(P(open().ref).answer);
      else if (chips().length) chips()[0].listeners.click();
      else pump(0.5);
    }
  };
  const buyLaunchers = () => { while (btns().some((b) => /^Ball launcher at spot/.test(b.innerHTML) && !b.disabled)) click(/^Ball launcher at spot/); };

  click('Play episode 3');
  assert.equal(st().mode ?? 'live', 'live');
  assert.match(html(), /slow to a crawl/);
  assert.doesNotMatch(html(), /one locker closer/);
  click('Pick up the keypad');
  assert.equal(st().mode, 'live');
  assert.equal(st().parts, L.startParts);
  assert.match(html(), /it does not stop/);
  assert.doesNotMatch(html(), /Nothing moves on a clock/);
  click('Get ready');
  scouts(0);

  // ---- the cart: spots on the map
  assert.equal(st().at, 'cart::w1');
  assert.equal(st().parts, L.startParts + 6);
  click(/^Ball launcher at spot 4 /);
  click(/^Ball launcher at spot 1 /);
  click(/^Floor wax at spot 5 /);
  assert.deepEqual(st().towers, { 3: 'launcher', 0: 'launcher', 4: 'wax' });
  assert.equal(st().parts, L.startParts + 6 - 9);
  click('To the corridor');

  // ---- wave 1
  assert.equal(st().w.squads.length, 0, 'the corridor starts empty');
  assert.equal(chips().length, 0);
  openPlate();
  let w = st().w;
  assert.equal(w.squads.length, 1);
  assert.equal(w.squads[0].drones.length, L.size);
  assert.equal(w.o.hp, L.hp[0]);
  // the corridor crawls while the plate is open
  const t0 = w.t;
  pump(4);
  type(P(open().ref).answer);
  w = st().w;
  assert.ok(Math.abs((w.t - t0) - 4 * L.think) < 0.2, `4 seconds with a plate open is ${4 * L.think}s of corridor, got ${w.t - t0}`);
  assert.equal(st().sub, '');
  assert.equal(w.squads[0].shield, false);
  assert.equal(st().typed.length, 1);
  assert.equal(st().parts, 4);
  assert.match(html(), /Shields down/);
  // nothing moves at the cart, and a spare shutter bought mid-wave counts at once
  click(/^Wrench's cart/);
  assert.equal(st().sub, 'build');
  pump(3);
  assert.equal(st().w.t, w.t, 'stopped while building');
  click(/spare shutter/);
  assert.equal(st().w.lives, L.lives + 1);
  click('Back to the corridor');
  // the towers finish that formation off
  for (let i = 0; i < 200 && st().w.kills < L.size; i++) pump(0.5);
  assert.equal(st().w.kills, L.size);
  // a wrong answer: the formation surges and gets new numbers; nothing moves on the miss page
  openPlate();
  const before = open();
  const pb = P(before.ref);
  type(pb.answer.map((v, i) => (i === 0 ? v + 7 : v)));
  assert.equal(st().sub, 'miss');
  assert.match(html(), /Written correctly/);
  assert.match(html(), /surges forward/);
  const after = st().w.squads.find((s) => s.id === before.id);
  assert.ok(Math.abs(reach(after) - reach(before) - L.surge) < 1);
  assert.equal(after.shield, true);
  assert.notEqual(P(after.ref).askTxt, pb.askTxt);
  const tm = st().w.t;
  pump(3);
  assert.ok(find('Back to the corridor').disabled, 'a miss needs a note');
  note('rushed it');
  formData = { match: 'Yes' };
  click('Back to the corridor');
  assert.equal(st().w.t, tm, 'stopped while a miss is explained');
  assert.equal(st().sub, '');
  // closing a plate is free
  openPlate();
  const typed = st().typed.length;
  click(/^Close the plate/);
  assert.deepEqual([st().sub, st().typed.length], ['', typed]);
  playOut();
  assert.equal(st().sub, 'won');
  assert.equal(st().waves.w1.result, 'cleared');
  click('Keep going');

  // ---- wave 2: ignore it, lose it, and take it again with more parts
  click('Get ready');
  scouts(1);
  click('To the corridor');
  for (let i = 0; i < 400 && st().sub !== 'lost'; i++) pump(1);
  assert.equal(st().sub, 'lost');
  assert.match(html(), /more parts fall out/);
  const kept = st().parts;
  click(/^Wrench's cart first/);
  assert.equal(st().at, 'cart::w2');
  assert.equal(st().parts, kept + L.retryParts);
  buyLaunchers();
  click('To the corridor');
  assert.equal(st().waves.w2.tries, 2);
  assert.equal(st().w.o.hp, L.hp[1]);
  assert.equal(st().w.lives, L.lives + 1);
  // right value, not finished: stays on the plate and counts neither way
  for (let i = 0; i < 400 && !st().w.squads.some((s) => s.shield && s.ref && P(s.ref).skill === 'simplify'); i++) pump(0.5);
  const sm = st().w.squads.filter((s) => s.shield && s.ref).sort((a, b) => reach(b) - reach(a)).findIndex((s) => P(s.ref).skill === 'simplify');
  chips()[sm].listeners.click();
  const [sq, m] = P(open().ref).answer;
  const n0 = st().typed.length;
  type([1, sq * sq * m]);
  assert.match(html(), /Not finished/);
  assert.deepEqual([st().sub, st().typed.length], ['plate', n0]);
  playOut();
  assert.equal(st().sub, 'won');
  click('Keep going');

  // ---- chapter 2
  click('Keep going now');
  click('Get ready');
  scouts(2);
  buyLaunchers();
  click('To the corridor');
  playOut();
  assert.equal(st().sub, 'won');
  click('Keep going');
  click('Get ready');
  if (st().at.startsWith('scout')) scouts(3);
  buyLaunchers();
  click('To the corridor');
  playOut();
  assert.equal(st().sub, 'won', 'the Chairman can be beaten');
  const bossTyped = st().typed.filter((t) => t.boss);
  assert.equal(bossTyped.length, TUNING.bossPlates);
  click('Keep going');

  click('Debrief');
  assert.match(html(), /keep coming while you work/);
  formData = { feel: 'A game', pace: 'Fun: I liked the rush', next: '', broken: '' };
  click('Done');
  const rep = flat(main()).find((n) => n.tag === 'textarea').value;
  assert.match(rep, /Corridor: live/);
  assert.match(rep, /from opening the plate to pressing Enter/);
  assert.match(rep, /launcher at spot 4/);
  assert.match(rep, /time on a right answer in this episode: median/);
  assert.match(rep, new RegExp(`The Root Cellar Sends Its Regards: .*cleared, 2 attempt\\(s\\), ${L.lives + 1} drone\\(s\\) reached the case`));
  assert.match(rep, /Fun: I liked the rush/);
  assert.ok(posts.length > 5);
  assert.doesNotMatch(rep, /undefined|NaN/);
});
