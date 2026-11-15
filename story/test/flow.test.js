// Drives the story player end to end against a minimal fake page:
// wrong answer -> dead end -> lockout (one miss, then cleared) -> lock -> win, for all five locks,
// then the debrief and the feedback report.
import test from 'node:test';
import assert from 'node:assert/strict';

test('full play-through with a miss on every lock', async () => {
  const store = {};
  const posts = [];
  const mk = (tag) => ({
    tag, children: [], className: '', _h: '', listeners: {}, disabled: false, value: '', textContent: '',
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

  await import('../app.js');
  const { episode } = await import('../episodes/pilot.js');
  const { variant } = await import('../episodes/pilot-variants.js');

  const KEY = 'story:pilot:v2';
  const st = () => JSON.parse(store[KEY] || '{}');
  const main = () => appEl.children[1];
  const flat = (n) => [n, ...(n.children || []).flatMap(flat)];
  const btns = () => flat(main()).filter((n) => n.tag === 'button');
  const click = (label) => {
    const b = btns().find((x) => (label instanceof RegExp ? label.test(x.innerHTML) : x.innerHTML === label));
    assert.ok(b, `button ${label} on screen ${st().screen}`);
    assert.ok(!b.disabled, `button ${label} enabled`);
    b.listeners.click();
  };

  click('Play episode 1');
  assert.equal(store['story:at'], 'pilot');
  click('Start the job');
  assert.equal(st().screen, 'run');
  click('Skip the running');
  for (const p of episode.problems) {
    const wrong = p.options.find((o) => !o.right && !o.near);
    click(wrong.html);
    assert.equal(st().screen, 'dead');
    assert.match(main().innerHTML, /You probably wrote/);
    assert.ok(btns().find((b) => b.innerHTML === 'Continue').disabled, 'must write a note first');
    const ta = flat(main()).find((n) => n.tag === 'textarea');
    ta.value = 'lost a sign <b>';
    ta.listeners.input();
    formData = { match: 'Sort of' };
    click('Continue');
    assert.equal(st().screen, 'lockout');

    const v1 = variant(p.id, st().vk[p.id] || 0);
    click(v1.options.find((o) => !o.right).html);
    assert.equal(st().screen, 'lockfail');
    click('New numbers');
    const v2 = variant(p.id, st().vk[p.id]);
    assert.notEqual(v2.ask, v1.ask, 'a lockout miss deals fresh numbers');
    click(v2.options.find((o) => o.right).html);

    assert.equal(st().screen, 'problem');
    assert.match(main().innerHTML, /Lockout cleared/);
    assert.ok(btns().find((b) => b.innerHTML === wrong.html).disabled, 'tried option stays struck');
    click(p.options.find((o) => o.right).html);
    click(/Keep going|Run for it/);
    assert.match(st().screen, /run|escape/);
    click('Skip the running');
  }

  formData = { hardest: 'The Elevator', feel: 'A game', level: 'About right', next: 'space pirates', broken: '' };
  click('Done');
  assert.equal(st().screen, 'notes');
  const rep = flat(main()).find((n) => n.tag === 'textarea').value;
  for (const p of episode.problems) assert.match(rep, new RegExp(`${p.title}: 1 wrong, 1 lockout miss`));
  assert.match(rep, /matched: Sort of \| their words: lost a sign <b>/);
  assert.match(rep, /Hardest lock: The Elevator/);
  assert.match(rep, /space pirates/);
  assert.match(rep, /finished, debrief done/);
  assert.match(rep, /Running sections skipped: dock, vent, corridor, gallery, vault, getaway/);

  // one post per dead end plus one at the end, all to the relative endpoint with a valid id
  assert.equal(posts.length, episode.problems.length + 1);
  for (const post of posts) {
    assert.equal(post.url, 'feedback.php');
    assert.match(post.body.sid, /^[0-9a-f]{16}$/);
  }
  assert.equal(posts.at(-1).body.report, rep);
});
