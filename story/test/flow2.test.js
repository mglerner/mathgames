// Drives episode 2 end to end against a minimal fake page: the menu, doors
// (with a miss and a lockout), typed floor locks (opened and drilled), the
// workbench, the chapter break and re-check, the debrief and the report.
import test from 'node:test';
import assert from 'node:assert/strict';

test('episode 2: full play-through', async () => {
  const store = {};
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

  // Which door leaves the right answer off its list is random; pin it to the last candidate (the Office Door).
  const realRandom = Math.random;
  Math.random = () => 0.999;
  test.after(() => { Math.random = realRandom; });
  await import('../app.js');
  const { content } = await import('../episodes/heist2.js');
  const { problem } = await import('../episodes/heist2-skills.js');

  const st = () => JSON.parse(store['story:heist2:v1'] || '{}');
  const main = () => appEl.children[1];
  const flat = (n) => [n, ...(n.children || []).flatMap(flat)];
  const btns = () => flat(appEl).filter((n) => n.tag === 'button');
  const has = (label) => btns().some((x) => x.innerHTML === label);
  const click = (label) => {
    const b = btns().find((x) => (label instanceof RegExp ? label.test(x.innerHTML) : x.innerHTML === label));
    assert.ok(b, `button ${label} at step ${st().step} ${st().sub}`);
    assert.ok(!b.disabled, `button ${label} enabled at step ${st().step} ${st().sub}`);
    b.listeners.click();
  };
  const cur = () => { const c = st().cur; return problem(c.skill, c.form, c.n); };
  const rightVals = (p) => {
    if (p.skill === 'dist') return p.options.find((o) => o.right).vals;
    if (p.skill === 'solve') return [Number(p.ansTxt.split('=')[1])];
    const m = /^(\d+) sqrt\((\d+)\)$/.exec(p.ansTxt);
    return [Number(m[1]), Number(m[2])];
  };
  /** Type whole numbers into the boxes with the on-screen keypad, then press Enter. */
  const type = (vals) => {
    assert.ok(btns().find((b) => b.innerHTML === 'Enter').disabled, 'Enter is off until every box is filled');
    const signed = cur().signed || [];
    assert.equal(btns().find((b) => b.innerHTML === '+/&minus;').disabled, !cur().neg, 'the sign key is only live where answers can be negative');
    vals.forEach((v, i) => {
      for (const ch of String(Math.abs(v))) click(ch);
      if (signed.includes(i)) {
        // the sign of a second term is chosen separately: nothing chosen yet, so Enter stays off
        if (i === vals.length - 1) assert.ok(btns().find((b) => b.innerHTML === 'Enter').disabled, 'Enter waits for a + or - to be chosen');
        click('+/&minus;'); // first press: +
        if (v < 0) click('+/&minus;'); // second press: -
      } else if (v < 0) click('+/&minus;');
      if (i < vals.length - 1) click('Next box');
    });
    click('Enter');
  };
  const typeRight = () => type(rightVals(cur()));
  const note = (text) => { const ta = flat(main()).find((n) => n.tag === 'textarea'); ta.value = text; ta.listeners.input(); };
  /** A typed miss, then the required reflection; `label` is the button that leaves the page. */
  const typeWrong = (label) => {
    type(rightVals(cur()).map((v) => v + 1));
    assert.equal(st().sub, 'miss');
    assert.match(main().innerHTML, /Written correctly/);
    assert.ok(btns().find((b) => b.innerHTML === label).disabled, 'a typed miss needs a note before moving on');
    note('typed it wrong');
    click(label);
  };
  /** A typed miss that matches a known slip: the guessed working is shown and the match question is required. */
  const typeSlip = (label) => {
    const p = cur();
    const o = p.options.find((x) => !x.right && x.vals);
    type(o.vals);
    assert.match(main().innerHTML, /You probably wrote/);
    assert.match(main().innerHTML, /class="bad"/);
    note('lost the sign');
    formData = {};
    click(label);
    assert.equal(st().sub, 'miss', 'cannot leave without answering the match question');
    formData = { match: 'No, I did something else' };
    click(label);
  };

  // menu
  assert.match(main().innerHTML, /Pick an episode/);
  assert.ok(!has('Play episode 3'), 'episode 3 waits for episode 2');
  assert.match(flat(appEl).map((n) => n.textContent).join(' '), /Opens when episode 2 is finished/);
  click('Play episode 2');
  assert.equal(store['story:at'], 'heist2');
  click('Start the job');

  let hiddenDoors = 0;
  const door = (missFirst, hasRun, notHere) => {
    if (hasRun) click('Skip the running'); else assert.ok(!has('Skip the running'), 'a third door follows straight on');
    const p = cur();
    const right = p.options.find((o) => o.right);
    assert.match(main().innerHTML, /Now and then the right answer is not on the list/);
    if (!has(right.html)) {
      // the one door whose right answer is left off: "not here" is true, and typing it opens the door
      hiddenDoors++;
      assert.equal(btns().filter((b) => b.className === 'opt').length, p.options.length - 1);
      click('My answer is not here');
      assert.equal(st().sub, 'own');
      typeRight();
      assert.equal(st().sub, 'win');
      assert.match(main().innerHTML, /was not on the list/);
      click('Keep going');
      return;
    }
    if (notHere) {
      // "not here" when it IS there: looking costs nothing, a wrong typed answer is a miss, a right one opens the door
      click('My answer is not here');
      click('Back to the list');
      assert.equal(st().sub, '');
      click('My answer is not here');
      const slip = p.options.find((o) => !o.right && o.vals);
      type(slip ? slip.vals : rightVals(p).map((v) => v + 1));
      assert.equal(st().sub, 'ownmiss');
      assert.match(main().innerHTML, /Written correctly/);
      note('typed my own');
      formData = { match: 'Sort of' };
      click('Continue');
      assert.equal(st().sub, 'lockout');
      const v = problem(st().lv.skill, st().lv.form, st().lv.n);
      click(v.options.find((o) => o.right).html);
      click('My answer is not here');
      typeRight();
      assert.equal(st().sub, 'win');
      assert.match(main().innerHTML, /it was on the list/);
      click('Keep going');
      return;
    }
    if (missFirst) {
      const wrong = p.options.find((o) => !o.right);
      click(wrong.html);
      assert.equal(st().sub, 'dead');
      assert.match(main().innerHTML, /You probably wrote/);
      assert.match(main().innerHTML, /class="bad"/);
      assert.ok(btns().find((b) => b.innerHTML === 'Continue').disabled, 'must write a note first');
      const ta = flat(main()).find((n) => n.tag === 'textarea');
      ta.value = 'sign slip';
      ta.listeners.input();
      formData = { match: 'Yes' };
      click('Continue');
      assert.equal(st().sub, 'lockout');
      const v1 = problem(st().lv.skill, st().lv.form, st().lv.n);
      assert.notEqual(v1.askTxt, p.askTxt, 'lockout has fresh numbers');
      assert.equal(v1.form, p.form, 'and is the same kind of problem');
      click(v1.options.find((o) => !o.right).html);
      assert.equal(st().sub, 'lockfail');
      click('New numbers');
      const v2 = problem(st().lv.skill, st().lv.form, st().lv.n);
      assert.notEqual(v2.askTxt, v1.askTxt);
      click(v2.options.find((o) => o.right).html);
      assert.match(main().innerHTML, /Lockout cleared/);
      assert.ok(btns().find((b) => b.innerHTML === wrong.html).disabled, 'tried option stays struck');
    }
    click(right.html);
    assert.equal(st().sub, 'win');
    click('Keep going');
  };

  let parts = 0;
  content.floors.forEach((floor, fi) => {
    if (fi === 2) {
      // chapter break, then the re-check: one miss earns one extra question
      assert.match(main().innerHTML, /End of chapter 1/);
      click('Stop here for today');
      assert.equal(st().sub, 'stopped');
      click('I am back. Start chapter 2');
      click('Step up to the panel');
      typeRight(); typeWrong('Next question');
      typeRight(); typeRight(); typeRight();
      assert.equal(st().sub, 'done');
      assert.equal(st().rc.q.length, 5);
      parts += 4;
      click('Keep going');
    }
    floor.doors.forEach((_, di) => { door(fi === 0 && di === 0, di < 2, fi === 1 && di === 0); parts += di === 0 && fi < 2 ? 1 : 2; });
    click('Step up to the lock');
    // the keypad test: nothing counts, and a wrong copy just asks again
    assert.equal(st().sub, 'try');
    assert.match(main().innerHTML, /Wrench's card/);
    const before = st().typed.length;
    type(rightVals(cur()).map((v) => v + 1));
    assert.equal(st().sub, 'try');
    assert.match(main().innerHTML, /not what the card says/);
    typeRight();
    assert.equal(st().sub, 'type');
    assert.deepEqual([st().typed.length, st().fl.tries, st().earned], [before, 0, parts], 'the keypad test is not recorded and earns nothing');
    if (fi === 2) {
      // right value, not finished (root N typed as 1 root N): same problem again, no miss, no credit
      const p = cur();
      const [s, m] = rightVals(p);
      type([1, s * s * m]);
      assert.equal(st().sub, 'type');
      assert.match(main().innerHTML, /Not finished/);
      assert.deepEqual([st().fl.tries, st().fl.misses, st().typed.length], [0, 0, before]);
      assert.equal(cur().askTxt, p.askTxt, 'same problem');
    }
    if (fi === 1) {
      // three misses: Wrench drills it, no bonus
      typeRight(); typeRight(); parts += 2;
      typeWrong('New numbers');
      assert.equal(st().fl.streak, 0, 'a miss drops every tumbler');
      typeWrong('New numbers');
      assert.ok(!has('New numbers'));
      typeWrong('Continue');
      assert.equal(st().sub, 'drilled');
      assert.equal(st().floors[floor.id].result, 'drilled');
    } else {
      typeRight(); if (fi === 0) typeSlip('New numbers'); else typeWrong('New numbers');
      typeRight(); typeRight();
      assert.equal(st().sub, 'type', 'two in a row is not enough');
      typeRight();
      assert.equal(st().sub, 'open');
      assert.deepEqual(st().floors[floor.id], { result: 'open', tries: 5 });
      parts += 4 + 2;
    }
    click('To the workbench');
    assert.equal(st().earned, parts, `parts after ${floor.name}`);
    if (fi === 0) {
      click('Build Scanner');
      assert.ok(btns().find((b) => b.innerHTML === 'Build Dampers').disabled, 'cannot afford dampers after buying the scanner');
      assert.deepEqual(st().gear, ['scanner']);
      assert.equal(st().parts, parts - 5);
      assert.ok(btns().find((b) => b.innerHTML === 'Built').disabled);
    }
    click('Back to the job');
  });

  click('Skip the running');
  assert.match(main().innerHTML, /Defend a what/);
  click('Debrief');
  formData = { feel: 'A game', typed: 'Hard but fair', next: 'tower defense', broken: '' };
  click('Done');
  const rep = flat(main()).find((n) => n.tag === 'textarea').value;
  assert.match(rep, /finished, debrief done/);
  assert.match(rep, /Distributing a negative: Y n Y Y Y Y Y\n {2}floor lock: opened after 5 typed answers/);
  assert.match(rep, /Solving with negatives: Y Y n n n n Y Y\n {2}floor lock: DRILLED/);
  assert.match(rep, /The Archive Door \(dist\): .* \| 1 wrong, 1 lockout miss\(es\)/);
  assert.match(rep, /picked .* \| "probably wrote" matched: Yes \| their words: sign slip/);
  assert.equal(hiddenDoors, 1, 'exactly one door in a play-through leaves the right answer off');
  assert.deepEqual(st().hide, ['f35b']);
  assert.match(rep, /The Duct Hatch \(solve\): .* \| 1 wrong \| said "not here" but typed the right answer, which was on the list/);
  assert.match(rep, /said "not here" and typed x = 4 \| no known slip matched, so no working was guessed \| their words: typed my own/);
  assert.match(rep, /The Office Door \(rationalize\): .* \| right first try \| RIGHT ANSWER LEFT OFF THE LIST \| typed the right answer/);
  assert.match(rep, /The Cabinet Row \(dist\): .* \| right first try/);
  assert.match(rep, /The Reading Desk \(dist\): \d+ - .* \| right first try/);
  assert.match(rep, /The Velvet Rope \(solve\): -\d\(x .* \| right first try/);
  assert.match(rep, /\[recheck solve\] .* WRONG \(answer /);
  assert.match(rep, /\[lock dist\] .* WRONG .*\n {6}"probably wrote" matched: No, I did something else \| their words: lost the sign/);
  assert.match(rep, /their words: typed it wrong/);
  assert.match(rep, /Simplifying square roots: .*\n {2}floor lock: opened after 5 typed answers; 1 right-value-but-unfinished/);
  assert.match(rep, /Gear bought: scanner/);
  assert.match(rep, /Hard but fair/);
  assert.match(rep, /tower defense/);
  assert.match(rep, /Running sections skipped: stairs, archive, ducts, servers, cellar, glass, hall, office, getaway2/);
  assert.match(rep, /status, all typed answers on this device .*: (fluent today|not yet|mastered)/);
  assert.ok(rep.length < 20000, 'fits the server limit');
  assert.equal(posts.at(-1).body.report, rep);
  for (const post of posts) {
    assert.equal(post.url, 'feedback.php');
    assert.match(post.body.sid, /^[0-9a-f]{16}$/);
  }

  // the typed log is shared across episodes, and the menu shows progress
  const log = JSON.parse(store['story:skills:v1']);
  assert.equal(log.dist.length, 7);
  assert.ok(log.dist.every((e) => /^\d{4}-\d\d-\d\d$/.test(e.d) && typeof e.ok === 'boolean'));
  click('Episodes');
  const menu = flat(main()).map((n) => n.innerHTML).join('\n');
  assert.match(menu, /Episode 2: The Other One.*Finished/);
  assert.ok(has('Play episode 3'), 'finishing episode 2 opens episode 3');
  assert.match(menu, /Episode 1: The Vark Job.*Not started/);

  // starting over wipes this episode only
  click('Play episode 2');
  click('Start this episode over');
  click(/Sure\?/);
  assert.equal(st().step, 0);
  assert.equal(JSON.parse(store['story:skills:v1']).dist.length, 7);
});
