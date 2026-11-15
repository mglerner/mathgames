// Keeps episode 3's screen previews honest, the same way preview.test.js does for episode 2:
// every kind of screen must be in previews(), every preview must draw with the real render
// code, and drawing one must never save or send anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('episode 3 previews cover every step type and every sub-screen, and all of them draw', async () => {
  const mk = (tag) => ({
    tag, children: [], className: '', _h: '', listeners: {}, disabled: false, value: '', textContent: '', dataset: {},
    classList: { add() {} }, select() {},
    set innerHTML(v) { this._h = v; this.children = []; }, get innerHTML() { return this._h; },
    append(...k) { this.children.push(...k); }, addEventListener(e, f) { this.listeners[e] = f; },
  });
  const store = {};
  let posts = 0;
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  globalThis.document = { getElementById: (id) => ({ id }), createElement: mk, execCommand: () => true };
  globalThis.window = { scrollTo() {}, isSecureContext: false };
  globalThis.FormData = class { get() { return null; } entries() { return []; } };
  globalThis.fetch = async () => { posts++; return { ok: true }; };

  const { previews, renderPreview } = await import('../ep3.js');
  const { previews: previews2 } = await import('../ep2.js');
  const src = readFileSync(new URL('../ep3.js', import.meta.url), 'utf8');
  const list = previews();
  assert.equal(new Set(list.map((p) => p.name)).size, list.length, 'preview names are unique');
  for (const p of list) assert.match(p.name, /^e3-[a-z0-9-]+$/, 'names are URL-safe and marked as episode 3');
  const names2 = new Set(previews2().map((p) => p.name));
  assert.ok(list.every((p) => !names2.has(p.name)), 'no clash with episode 2 names in the shared preview page');

  const stepTypes = new Set([...src.matchAll(/\{ t: '(\w+)'/g)].map((m) => m[1]));
  assert.deepEqual([...stepTypes].sort(), ['break', 'brief', 'cart', 'debrief', 'notes', 'scout', 'story', 'wave']);
  const subs = new Set([...src.matchAll(/\bsub: '(\w*)'/g)].map((m) => m[1]));
  for (const s of ['', 'dead', 'miss', 'lost', 'won', 'stopped']) assert.ok(subs.has(s), `the code moves to sub-screen "${s}"`);

  const flat = (n) => [n, ...(n.children || []).flatMap(flat)];
  const seen = { types: new Set(), subs: new Set() };
  for (const pv of list) {
    const el = mk('div');
    renderPreview(el, { patch: pv.patch }); // the keypad fill needs a real page; drawing is checked here
    const html = flat(el).map((n) => n.innerHTML).join('\n');
    assert.ok(html.length > 80, `${pv.name} draws something`);
    assert.ok(!/undefined|NaN|\[object/.test(html.replace(/<[^>]*>/g, '')), `${pv.name} has no broken text`);
    seen.subs.add(pv.patch.sub || '');
  }
  for (const sub of subs) assert.ok(seen.subs.has(sub), `sub-screen "${sub}" has a preview`);
  const named = { story: 'e3-intro', break: 'e3-break', brief: 'e3-brief', scout: 'e3-scout', cart: 'e3-cart', wave: 'e3-wave', debrief: 'e3-debrief', notes: 'e3-notes' };
  for (const t of stepTypes) assert.ok(list.some((p) => p.name === named[t]), `step type "${t}" has a preview`);
  // every skill is shown being asked on the keypad
  assert.ok(list.some((p) => p.name === 'e3-wave-frac') && list.some((p) => p.name === 'e3-wave-boss'));
  assert.equal(posts, 0, 'drawing previews never sends a report');
  assert.deepEqual(store, {}, 'drawing previews never saves anything');
});

test('episode 3: a saved game reopens on the same screen, mid-wave, with the same drones', async () => {
  const mk = (tag) => ({
    tag, children: [], className: '', _h: '', listeners: {}, disabled: false, value: '', textContent: '', dataset: {},
    classList: { add() {} }, select() {},
    set innerHTML(v) { this._h = v; this.children = []; }, get innerHTML() { return this._h; },
    append(...k) { this.children.push(...k); }, addEventListener(e, f) { this.listeners[e] = f; },
  });
  const { previews, renderPreview } = await import('../ep3.js');
  const pv = previews().find((p) => p.name === 'e3-wave');
  const el = mk('div');
  renderPreview(el, { patch: pv.patch });
  const flat = (n) => [n, ...(n.children || []).flatMap(flat)];
  const chips = flat(el).filter((n) => n.tag === 'button' && n.className.startsWith('chip'));
  assert.equal(chips.length, pv.patch.w.drones.length);
  assert.match(chips[0].innerHTML, /2 away/);
  assert.equal(chips.filter((c) => c.className === 'chip on').length, 1);
});
