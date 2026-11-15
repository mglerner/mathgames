// Keeps the screen previews honest: every kind of screen episode 2 can show must
// be in previews(), and every preview must draw with the real render code. If a
// new screen is added to ep2.js without a preview, this fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('previews cover every step type and every sub-screen, and all of them draw', async () => {
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

  const { previews, renderPreview } = await import('../ep2.js');
  const src = readFileSync(new URL('../ep2.js', import.meta.url), 'utf8');
  const list = previews();
  assert.equal(new Set(list.map((p) => p.name)).size, list.length, 'preview names are unique');
  for (const p of list) assert.match(p.name, /^[a-z0-9-]+$/, 'names are safe to put in a URL and a file name');

  // every step type the episode is built from
  const stepTypes = new Set([...src.matchAll(/\{ t: '(\w+)'/g)].map((m) => m[1]));
  assert.ok(stepTypes.size >= 8);
  // every sub-screen the code can move to
  const subs = new Set([...src.matchAll(/\bsub: '(\w*)'/g)].map((m) => m[1]));
  assert.ok(subs.has('miss') && subs.has('lockfail') && subs.has('drilled'));

  const seen = { types: new Set(), subs: new Set() };
  const flat = (n) => [n, ...(n.children || []).flatMap(flat)];
  for (const pv of list) {
    const el = mk('div');
    renderPreview(el, { patch: pv.patch }); // the keypad fill needs a real page; drawing is checked here
    const html = flat(el).map((n) => n.innerHTML).join('\n');
    assert.ok(html.length > 80, `${pv.name} draws something`);
    assert.ok(!/undefined|NaN|\[object/.test(html.replace(/<[^>]*>/g, '')), `${pv.name} has no broken text`);
    seen.subs.add(pv.patch.sub || '');
  }
  // which step type each preview lands on, read from the header the real render writes
  const steps = [...src.matchAll(/out\.push\(\{ name: '([a-z-]+)'/g)].length;
  assert.ok(steps > 5);
  for (const sub of subs) assert.ok(seen.subs.has(sub), `sub-screen "${sub}" has a preview`);
  for (const t of stepTypes) {
    const named = { story: 'intro', run: 'run', door: 'dist-door', lock: 'lock-intro', shop: 'shop', break: 'break', recheck: 'recheck-intro', debrief: 'debrief', notes: 'notes' }[t];
    assert.ok(named, `step type "${t}" is known to the preview test: add a preview for it`);
    assert.ok(list.some((p) => p.name === named), `step type "${t}" has a preview`);
  }
  assert.equal(posts, 0, 'drawing previews never sends a report');
  assert.deepEqual(store, {}, 'drawing previews never saves anything');
});
