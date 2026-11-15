// A saved game must reopen at the same place after the episode's step list changes.
import test from 'node:test';
import assert from 'node:assert/strict';

test('a save from before the third doors were added reopens on the same screen', async () => {
  // Old layout: 0 intro, 1 run, 2 door, 3 run, 4 door, 5 floor lock (floor 20), ...
  const store = { 'story:heist2:v1': JSON.stringify({ sid: 'a'.repeat(16), step: 5, sub: '', parts: 4, earned: 4 }), 'story:at': 'heist2' };
  const mk = (tag) => ({
    tag, children: [], className: '', _h: '', listeners: {}, disabled: false, value: '', textContent: '', dataset: {},
    classList: { add() {} }, select() {},
    set innerHTML(v) { this._h = v; this.children = []; }, get innerHTML() { return this._h; },
    append(...k) { this.children.push(...k); }, addEventListener(e, f) { this.listeners[e] = f; },
  });
  const appEl = mk('div');
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  globalThis.document = { getElementById: (id) => (id === 'app' ? appEl : { id }), createElement: mk };
  globalThis.window = { scrollTo() {} };
  globalThis.fetch = async () => ({ ok: true });
  await import('../app.js');
  assert.match(appEl.children[1].innerHTML, /Floor Lock 20/);
  assert.match(appEl.children[0].innerHTML, /4 parts/);
  // moving on saves the step by name, and that name is what a reload uses
  const flat = (n) => [n, ...(n.children || []).flatMap(flat)];
  flat(appEl).find((n) => n.tag === 'button' && n.innerHTML === 'Step up to the lock').listeners.click();
  const saved = JSON.parse(store['story:heist2:v1']);
  assert.equal(saved.at, 'lock::0:');
  assert.equal(saved.sub, 'try'); // the no-stakes keypad test comes first
});
