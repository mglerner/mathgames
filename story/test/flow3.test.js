// Drives episode 3 end to end against a minimal fake page: scouts (with a miss), the cart,
// waves of typed answers (a miss, a lost wave and its retry, an unfinished answer), the chapter
// break, the Chairman, the debrief and the report.
import test from 'node:test';
import assert from 'node:assert/strict';

test('episode 3: full play-through', async () => {
  const store = { 'story:tester': '1' }; // a teacher's device: episode 3 is open without finishing episode 2
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

  await import('../app.js');
  const { content, TUNING } = await import('../episodes/siege3.js');
  const { problem } = await import('../episodes/siege3-skills.js');

  const st = () => JSON.parse(store['story:siege3:v1'] || '{}');
  const main = () => appEl.children[1];
  const flat = (n) => [n, ...(n.children || []).flatMap(flat)];
  const btns = () => flat(appEl).filter((n) => n.tag === 'button');
  const has = (label) => btns().some((x) => (label instanceof RegExp ? label.test(x.innerHTML) : x.innerHTML === label));
  const click = (label) => {
    const b = btns().find((x) => (label instanceof RegExp ? label.test(x.innerHTML) : x.innerHTML === label));
    assert.ok(b, `button ${label} at ${st().at} ${st().sub}`);
    assert.ok(!b.disabled, `button ${label} enabled at ${st().at} ${st().sub}`);
    b.listeners.click();
  };
  const html = () => flat(main()).map((n) => n.innerHTML).join('\n');
  const P = (ref) => problem(ref.skill, ref.form, ref.n);
  const aim = () => st().w.drones.find((d) => d.id === st().target);
  const type = (vals) => {
    vals.forEach((v, i) => {
      for (const ch of String(Math.abs(v))) click(ch);
      if ((P(aim().ref).signed || []).includes(i)) { click('+/&minus;'); if (v < 0) click('+/&minus;'); } else if (v < 0) click('+/&minus;');
      if (i < vals.length - 1) click('Next box');
    });
    click('Enter');
  };
  const note = (text) => { const ta = flat(main()).find((n) => n.tag === 'textarea'); ta.value = text; ta.listeners.input(); };
  const typeRight = () => type(P(aim().ref).answer);
  /** A typed miss, then the required note. */
  const typeWrong = () => {
    const p = P(aim().ref);
    type(p.answer.map((v, i) => (i === 0 ? v + 7 : v)));
    assert.equal(st().sub, 'miss');
    assert.match(html(), /Written correctly/);
    assert.ok(btns().find((b) => b.innerHTML === 'Back to the corridor').disabled, 'a typed miss needs a note before moving on');
    note('typed it wrong');
    formData = { match: 'Sort of' };
    click('Back to the corridor');
  };
  /** Answer every scout in this step; the first one wrong first if asked. */
  const scouts = (wi, missFirst) => {
    const n = st().plan[content.waves[wi].id].scouts.length;
    for (let i = 0; i < n; i++) {
      assert.match(html(), new RegExp(`Scout ${i + 1} of ${n}`));
      let p = P(st().cur);
      if (missFirst && i === 0) {
        click(p.options.find((o) => !o.right).html);
        assert.equal(st().sub, 'dead');
        assert.match(html(), /You probably wrote/);
        assert.ok(btns().find((b) => b.innerHTML === 'New numbers').disabled);
        note('lost a sign');
        formData = { match: 'Yes' };
        click('New numbers');
        assert.notEqual(P(st().cur).askTxt, p.askTxt, 'the scout gets new numbers');
        assert.equal(st().cur.form, p.form);
        p = P(st().cur);
      }
      click(p.options.find((o) => o.right).html);
    }
  };

  assert.match(html(), /Episode 3a: Open House/);
  click('Play episode 3a');
  assert.equal(store['story:at'], 'siege3');
  assert.equal(st().parts ?? TUNING.startParts, TUNING.startParts);
  click('Pick up the keypad');

  // ---- wave 1: nothing on record, so every shape is taught first and the wave is full size
  assert.match(html(), /Wave 1: First Bell/);
  assert.match(html(), /Nothing moves on a clock/);
  assert.deepEqual(st().plan.w1.levels, { dist: 'none', solve: 'none' });
  assert.equal(st().plan.w1.scouts.length, 6);
  assert.equal(st().plan.w1.specs.length, 6);
  click('Get ready');
  scouts(0, true);
  assert.equal(st().at, 'cart::w1');
  assert.equal(st().parts, TUNING.startParts + 5, 'a scout solved first try is worth a part');
  assert.match(html(), /Wrench's cart/);
  click(/^Glue mat at locker 2 /);
  click(/^Gym fan at locker 3 /);
  assert.deepEqual(st().towers, { 2: 'glue', 3: 'fan' });
  assert.equal(st().parts, 0);
  assert.ok(btns().find((b) => /spare shutter/.test(b.innerHTML)).disabled, 'cannot afford a shutter now');
  click('To the corridor');

  let w = st().w;
  assert.deepEqual(w.drones.map((d) => d.pos), [4, 5, 6], 'three drones are already in the corridor');
  assert.equal(w.queue.length, 3);
  assert.equal(st().target, w.drones[0].id, 'aimed at the nearest one');
  assert.equal(btns().filter((b) => b.className.startsWith('chip')).length, 3);
  // aim at the one at the back, solve it: it goes, the others step forward, one more comes in
  const back = w.drones[2];
  btns().filter((b) => b.className.startsWith('chip'))[2].listeners.click();
  assert.equal(st().target, back.id);
  assert.equal(st().typed.length, 0, 'changing aim is not an answer');
  typeRight();
  w = st().w;
  assert.ok(!w.drones.some((d) => d.id === back.id));
  assert.deepEqual(w.drones.map((d) => d.pos).sort(), [3, 4, 6]);
  assert.match(html(), /Solved\. The drone folds up\./);
  assert.equal(st().typed.length, 1);
  assert.equal(st().parts, 1);
  // a miss: explained, noted, that drone gets new numbers, and everything has moved
  const before = aim();
  typeWrong();
  assert.equal(st().sub, '');
  const after = st().w.drones.find((d) => d.id === before.id);
  assert.notEqual(P(after.ref).askTxt, P(before.ref).askTxt, 'a missed drone shows new numbers');
  assert.equal(after.pos, before.pos - 1);
  while (st().sub === '') typeRight();
  assert.equal(st().sub, 'won');
  assert.equal(st().waves.w1.result, 'cleared');
  assert.match(html(), /First Bell: clear/);
  click('Keep going');

  // ---- wave 2: lose it on purpose, then take it again with a longer corridor
  assert.match(html(), /Wave 2/);
  click('Get ready');
  scouts(1, false);
  click('To the corridor');
  let guard = 0;
  while (st().sub !== 'lost') { typeWrong(); assert.ok(++guard < 40, 'enough misses lose the wave'); }
  assert.match(html(), /shutters down/);
  assert.match(html(), /Nothing you have earned is lost/);
  const kept = st().parts;
  click('Reset the corridor');
  assert.equal(st().w.lane, TUNING.lane + TUNING.retryLane, 'the retry has more room');
  assert.equal(st().w.shutters, TUNING.shutters);
  assert.equal(st().parts, kept);
  assert.equal(st().waves.w2.tries, 2);
  // right value, not finished (root N typed as 1 root N): no move, no miss, no credit
  const sm = st().w.drones.find((d) => P(d.ref).skill === 'simplify');
  btns().filter((b) => b.className.startsWith('chip'))[[...st().w.drones].sort((a, b) => a.pos - b.pos).findIndex((d) => d.id === sm.id)].listeners.click();
  const [s, m] = P(aim().ref).answer;
  const typedBefore = st().typed.length, tickBefore = st().w.tick;
  type([1, s * s * m]);
  assert.match(html(), /Not finished/);
  assert.deepEqual([st().typed.length, st().w.tick], [typedBefore, tickBefore]);
  while (st().sub === '') typeRight();
  assert.equal(st().sub, 'won');
  click('Keep going');

  // ---- chapter break, then the new skill
  assert.match(html(), /End of chapter 1/);
  click('Stop here for today');
  assert.equal(st().sub, 'stopped');
  click('I am back. Start chapter 2');
  assert.match(html(), /Wave 3: New Material/);
  assert.deepEqual(st().plan.w3.levels, { frac: 'new' });
  assert.equal(st().plan.w3.scouts.length, 2, 'a new skill gets a scout for each shape');
  click('Get ready');
  assert.match(html(), /Work out, in lowest terms/);
  scouts(2, false);
  click('To the corridor');
  assert.ok(st().w.drones.every((d) => P(d.ref).skill === 'frac'));
  while (st().sub === '') typeRight();
  click('Keep going');

  // ---- the Chairman
  assert.match(html(), /Wave 4: The Chairman/);
  const p4 = st().plan.w4;
  assert.equal(p4.specs.at(-1).boss, true);
  assert.equal(p4.specs.at(-1).plates.length, TUNING.bossPlates);
  click('Get ready');
  if (st().at.startsWith('scout')) scouts(3, false);
  click('To the corridor');
  while (st().sub === '') typeRight();
  assert.equal(st().sub, 'won');
  click('Keep going');

  assert.match(html(), /Bring a pencil/);
  click('Debrief');
  formData = { feel: 'A game', pace: 'Good: I could think', next: 'the math bowl', broken: '' };
  click('Done');
  const rep = flat(main()).find((n) => n.tag === 'textarea').value;
  assert.match(rep, /The Vark Job 3a \(Open House\): feedback \(TEST RUN by a teacher, not the student\)/);
  assert.match(rep, /finished, debrief done/);
  assert.match(rep, /Towers: glue at locker 2, fan at locker 3/);
  assert.match(rep, /Distributing a negative: [Yn ]+\n {2}status, all typed answers on this device, every episode: /);
  assert.match(rep, /First Bell: dist was none, solve was none -> 6 scouts, 6 drones \| cleared, 1 attempt\(s\), \d drone\(s\) reached the case/);
  assert.match(rep, /The Root Cellar Sends Its Regards: .* \| cleared, 2 attempt\(s\)/);
  assert.match(rep, /New Material: frac was new -> 2 scouts, 4 drones \| cleared/);
  assert.match(rep, /\[w1 \w+\] .* WRONG \(answer .*\n {6}.* \| their words: typed it wrong/);
  assert.match(rep, /\[w4 \w+, Chairman\]/);
  assert.match(rep, /\[w1 dist\] .* \| 1 wrong first/);
  assert.match(rep, /picked .* \| "probably wrote" matched: Yes \| their words: lost a sign/);
  assert.match(rep, /right-value-but-unfinished/);
  assert.match(rep, /The drones only move when you answer\. That was\.\.\. Good: I could think/);
  assert.ok(!/undefined|NaN|\[object/.test(rep), 'the report has no broken text');
  assert.ok(posts.length > 5 && posts.every((p) => p.url === 'feedback.php'));
  assert.equal(posts.at(-1).body.report, rep);
  // the shared log now has typed answers for all five skills
  const log = JSON.parse(store['story:skills:v1']);
  assert.deepEqual(Object.keys(log).sort(), ['dist', 'frac', 'rationalize', 'simplify', 'solve']);
  assert.ok(log.frac.every((e) => e.where === 'siege3:w3' || e.where === 'siege3:w4'));
});
