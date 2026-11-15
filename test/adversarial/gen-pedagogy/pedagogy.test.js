// Adversarial pedagogy review of src/gen/** and src/misc/malrules/**.
// Each test measures one way an item can be answered WITHOUT the concept
// (surface patterns in the options, the prompt, the chain) or one way the
// feedback text is false for the item on screen. A test marked todo
// demonstrates an unfixed defect ("finding N" in the review); un-todo it
// when the defect is fixed. Run:
//   node scripts/gen-registry.js && node --test test/adversarial/gen-pedagogy/
// Companion scripts (not tests): dump.js prints items as the learner sees
// them; stats.js prints position / length / shape statistics per cell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allGenerators, gen, items, text, shape, isOk, chi2Uniform, twinShapeAccuracy, majorityVote } from './metrics.js';
import { malrules, malruleById } from '../../../src/misc/diagnose.js';
import { print } from '../../../src/math/print.js';

const N = Number(process.env.PEDAGOGY_SEEDS || 2000);
const cells = (interaction) => allGenerators.filter((g) => g.interactions.includes(interaction))
  .flatMap((g) => Array.from({ length: g.difficulty[1] - g.difficulty[0] + 1 }, (_, i) => ({ g, d: g.difficulty[0] + i })));
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');

// ------------------------------------------------------------ passing checks

test('answer position: the correct choice is uniformly placed in every shuffled cell (5000 seeds)', () => {
  // chi-square against uniform; 13.8 (df 2) and 16.3 (df 3) are p = 0.001, and
  // about 40 cells are tested, so the bound is the p = 0.0001 value.
  const bound = { 2: 15.2, 3: 18.4, 4: 21.1 };
  for (const it of ['forge', 'nextline']) for (const { g, d } of cells(it)) {
    const byK = {};
    for (const p of items(g, d, it, 5000, { fade: 0, prefix: 'pos' })) {
      const k = p.choices.length; byK[k] ||= new Array(k).fill(0); byK[k][p.choices.findIndex(isOk)]++;
    }
    for (const [k, counts] of Object.entries(byK)) {
      if (counts.reduce((a, b) => a + b, 0) < 200) continue;
      assert.ok(chi2Uniform(counts) < bound[k], `${g.id} d${d} ${it} (${k} choices): correct position counts ${counts}`);
    }
  }
});

test('mal-rule scripts: main line is 15 words or fewer, never says "move ... over", and does not scold', () => {
  for (const r of malrules) {
    assert.ok(r.script.split(/\s+/).length <= 15, `${r.id}: ${r.script}`);
    assert.doesNotMatch(r.script, /move (it|that|this|the \w+) over/i, r.id);
    assert.doesNotMatch(r.script, /careless|forgot|wrong|should have|silly|again\?/i, r.id);
    assert.ok(r.standardTerm && r.haunt, `${r.id}: needs a Haunt name and a standard term`);
  }
});

test('no option, goal or verb names a bug (section 3)', () => {
  const names = malrules.flatMap((r) => [r.id, r.haunt.replace(/^the /, '')]);
  for (const g of allGenerators) for (const it of g.interactions) for (const p of items(g, g.difficulty[0], it, 100)) {
    const s = `${p.prompt.verb} ${p.prompt.goal || ''}`;
    for (const n of names) assert.ok(!s.toLowerCase().includes(n.toLowerCase()), `${g.id} ${it}: "${s}" names ${n}`);
  }
});

test('Twin pools are about half equivalent (40% to 60%)', () => {
  for (const { g, d } of cells('twin')) {
    let same = 0; let n = 0;
    for (const p of items(g, d, 'twin', N)) { n++; if (p.choices.find((c) => c.id === 'same').verdict === 'correct') same++; }
    assert.ok(same / n > 0.4 && same / n < 0.6, `${g.id} d${d}: ${pct(same, n)} same`);
  }
});

test('Trace: about 1 in 3 chains have no bad line (25% to 42%)', () => {
  for (const { g, d } of cells('trace')) {
    let none = 0; let n = 0;
    for (const p of items(g, d, 'trace', N)) { n++; if (p.choices.find(isOk).id === 'none') none++; }
    assert.ok(none / n > 0.25 && none / n < 0.42, `${g.id} d${d}: ${pct(none, n)} with no bad line`);
  }
});

// ------------------------------------------------------------ finding 1: scripts

test('mal-rule scripts are true for the item on screen: every number they quote is in the item', () => {
  const bad = [];
  for (const r of malrules) {
    const nums = r.script.match(/\d+/g) || [];
    if (!nums.length) continue;
    let shows = 0; let absent = 0; let ex = '';
    for (const g of allGenerators) for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) for (const it of g.interactions) {
      for (const p of items(g, d, it, 40)) {
        if (!r.applyAll(p).length) continue;
        shows++;
        const shown = print(p.prompt.math) + ' ' + (p.prompt.twin ? print(p.prompt.twin) : '');
        const have = shown.match(/\d+/g) || [];
        if (!nums.every((x) => have.includes(x))) { absent++; ex ||= `${g.id} d${d} ${it} seed ${p.seed}: ${shown}`; }
      }
    }
    if (absent) bad.push(`${r.id} "${r.script}": numbers not in the item on ${pct(absent, shows)} of ${shows} items, e.g. ${ex}`);
  }
  assert.deepEqual(bad, []);
});

test('the Carrier script does not say "Subtract" when the stated move is "Add"', () => {
  const r = malruleById('transpose-no-sign-change');
  for (const p of items(gen('balance-moves.core'), 1, 'nextline', 200)) {
    if (p.prompt.move.op !== 'add') continue;
    assert.doesNotMatch(r.script, /Subtract/, `${print(p.prompt.math)}, "${p.prompt.goal}": script says "${r.script}"`);
  }
});

test('the Smuggler script describes the direction of the item (factor going IN on k sqrt(m) vs sqrt(k m))', () => {
  const r = malruleById('sqrt-product-misapplied');
  for (const p of items(gen('sqrt-product-rule.core'), 1, 'twin', 800)) {
    if (!p.choices.some((c) => c.malrule === r.id)) continue;
    assert.doesNotMatch(r.script, /inside leaves/, `${print(p.prompt.math)} vs ${print(p.prompt.twin)}: script says "${r.script}"`);
  }
});

// ------------------------------------------------------------ finding 2: forge

test('Forge (offered faces): the student must choose WHICH 1 / 0; the key is not the only k/k or g - g shaped option', () => {
  const bad = [];
  for (const id of ['frac-equivalence.core', 'identity-moves.core', 'rationalize-denominator.core']) {
    const g = gen(id);
    for (let d = g.difficulty[0]; d <= g.difficulty[1]; d++) {
      let n = 0; let only = 0; let longest = 0;
      const xx = (c) => (c.display.t === 'frac' && print(c.display.num) === print(c.display.den)) || c.display.t === 'add';
      for (const p of items(g, d, 'forge', N, { fade: 0 })) {
        n++; const c = p.choices.find(isOk);
        if (xx(c) && p.choices.filter(xx).length === 1) only++;
        const len = print(c.display).length;
        if (p.choices.every((o) => o === c || print(o.display).length < len)) longest++;
      }
      if (only / n > 0.5) bad.push(`${id} d${d}: key is the only identity-shaped option on ${pct(only, n)}; uniquely longest on ${pct(longest, n)}`);
    }
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------ finding 3: counting Why

test('counting Why: the target is not findable by "tap the digit 1", "tap the only bracket" or a fixed place', { todo: 'finding 3' }, () => {
  const bad = [];
  for (const { g, d } of cells('why')) {
    let n = 0; let literal = 0; let whole = 0; let onlyMarked = 0; const ids = {};
    for (const p of items(g, d, 'why', N)) {
      n++; const c = p.choices.find(isOk); const want = p.variant === 'hidden-1' ? '1' : '0';
      if (print(c.display) === want && p.choices.filter((o) => print(o.display) === want).length === 1) literal++;
      if (c.id === 'e') whole++;
      const marked = p.choices.filter((o) => o.display.t === 'group' || o.display.t === 'frac');
      if (marked.length === 1 && marked[0] === c) onlyMarked++;
      ids[c.id] = (ids[c.id] || 0) + 1;
    }
    const fixed = Math.max(...Object.values(ids)) / n;
    const worst = Math.max(literal, whole, onlyMarked) / n;
    if (worst > 0.9 || (fixed === 1 && worst > 0.5)) bad.push(`${g.id} d${d}: literal digit ${pct(literal, n)}, whole expression ${pct(whole, n)}, only bracket/fraction ${pct(onlyMarked, n)}, same tap place ${(100 * fixed).toFixed(0)}%`);
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------ finding 4: twin

test('Twin: the way the two forms are WRITTEN does not settle Same / Different', () => {
  // Cells where the pair's shape is the concept itself (roots split products,
  // not sums; the sign flip under a negative multiplier) are left out.
  const bad = [];
  for (const [id, ds] of [['frac-equivalence.core', [1, 2, 3, 4]], ['identity-moves.core', [1, 2, 3, 4]], ['frac-times-whole.core', [1, 2, 3, 4]], ['equivalent-expressions.core', [3, 4]]]) {
    for (const d of ds) {
      const r = twinShapeAccuracy(gen(id), d, N);
      if (r.determined > 0.15) bad.push(`${id} d${d}: ${(100 * r.determined).toFixed(0)}% of pairs have a shape that is always one answer; best shape-only rule scores ${(100 * r.accuracy).toFixed(0)}%`);
    }
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------ finding 5: trace

test('Trace (solve-linear): a fraction on the last line does not announce a planted bad line', () => {
  for (let d = 1; d <= 4; d++) {
    let planted = 0; let fracPlanted = 0; let fracNone = 0; let none = 0;
    for (const p of items(gen('solve-linear.core'), d, 'trace', N)) {
      const isNone = p.choices.find(isOk).id === 'none'; const frac = /\//.test(print(p.steps[p.steps.length - 1].line));
      if (isNone) { none++; if (frac) fracNone++; } else { planted++; if (frac) fracPlanted++; }
    }
    assert.ok(Math.abs(fracPlanted / planted - fracNone / none) < 0.15, `d${d}: last line is a fraction on ${pct(fracPlanted, planted)} of planted chains and ${pct(fracNone, none)} of clean ones`);
  }
});

test('Trace (solve-linear d4): the number of lines does not give the answer', () => {
  const len = {};
  for (const p of items(gen('solve-linear.core'), 4, 'trace', N)) { const k = p.steps.length; len[k] ||= [0, 0]; len[k][p.choices.find(isOk).id === 'none' ? 0 : 1]++; }
  for (const [k, [none, planted]] of Object.entries(len)) {
    if (none + planted < 100) continue;
    assert.ok(none / (none + planted) < 0.9, `${k}-line chains: ${none} clean, ${planted} planted`);
  }
});

test('Trace (distribute): the bad line is not always the first line after the given one', () => {
  for (let d = 1; d <= 4; d++) {
    const where = {};
    for (const p of items(gen('distribute.core'), d, 'trace', N)) { const id = p.choices.find(isOk).id; where[id] = (where[id] || 0) + 1; }
    assert.ok(Object.keys(where).filter((k) => k !== 'none').length > 1, `d${d}: bad line places ${JSON.stringify(where)}`);
  }
});

test('Trace: a worked chain never shows the same line twice in a row', () => {
  for (const { g, d } of cells('trace')) {
    let dup = 0; let n = 0; let ex = '';
    for (const p of items(g, d, 'trace', N)) {
      n++;
      for (let i = 1; i < p.steps.length; i++) if (print(p.steps[i].line) === print(p.steps[i - 1].line)) { dup++; ex ||= `seed ${p.seed}: ${p.steps.map((s) => print(s.line)).join('  ->  ')}`; break; }
    }
    assert.equal(dup, 0, `${g.id} d${d}: ${pct(dup, n)} of chains repeat a line, e.g. ${ex}`);
  }
});

// ------------------------------------------------------------ finding 6: next line

test('Next Line (balance-moves d3): "take the most common left side and the most common right side" does not find the key', () => {
  // (fixer edit) This counted four-candidate items only. The fix draws the distractor set so that
  // the vote cannot land on the key, and that leaves no four-candidate item in this cell (three
  // wrong lines the vote cannot use do not exist here), so hit / four was 0 / 0 = NaN and the test
  // could not pass. Every item is counted now; `four` is the number of items.
  let four = 0; let hit = 0; let ex = '';
  for (const p of items(gen('balance-moves.core'), 3, 'nextline', N)) {
    assert.ok(p.choices.length >= 3 && p.choices.length <= 4, `seed ${p.seed}: ${p.choices.length} candidates`);
    four++; const pick = majorityVote(p);
    if (pick && isOk(pick)) { hit++; ex ||= `seed ${p.seed}: ${print(p.prompt.math)}, ${p.prompt.goal} -> ${p.choices.map((c) => print(c.display)).join(' | ')}`; }
  }
  assert.ok(hit / four < 0.5, `the attack is right on ${pct(hit, four)} of ${four} items, e.g. ${ex}`);
});

// ------------------------------------------------------------ finding 7: cast

test('Cast: no item has four "progress" chips (an item that cannot be missed)', () => {
  for (const { g, d } of cells('cast')) {
    let all = 0; let n = 0; let ex = '';
    for (const p of items(g, d, 'cast', N)) { n++; if (p.choices.every((c) => c.verdict === 'progress')) { all++; ex ||= `seed ${p.seed}: ${print(p.prompt.math)} chips ${p.choices.map((c) => text(c.display)).join(', ')}`; } }
    assert.equal(all, 0, `${g.id} d${d}: ${pct(all, n)}, e.g. ${ex}`);
  }
});

test('Cast: most items offer a "Legal. Not closer." chip, not only "/ x" and "x 0" as the wrong taps', () => {
  const bad = [];
  for (const { g, d } of cells('cast')) {
    let junk = 0; let n = 0;
    for (const p of items(g, d, 'cast', N)) { n++; if (p.choices.every((c) => c.verdict === 'progress' || ['div x', 'mul 0'].includes(text(c.display)))) junk++; }
    if (junk / n > 0.5) bad.push(`${g.id} d${d}: on ${pct(junk, n)} of items every chip is progress, "/ x" or "x 0"`);
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------ finding 8: number load

test('sqrt-product-rule d1 Twins stay inside the times table (no number of 400 or more)', () => {
  let big = 0; let n = 0; let mx = 0; let ex = '';
  for (const p of items(gen('sqrt-product-rule.core'), 1, 'twin', N)) {
    n++; const s = print(p.prompt.math) + ' vs ' + print(p.prompt.twin); const m = Math.max(...s.match(/\d+/g).map(Number));
    if (m >= 400) big++; if (m > mx) { mx = m; ex = s; }
  }
  assert.ok(big / n < 0.05, `${pct(big, n)} of pairs have a number >= 400; largest: ${ex}`);
});

// ------------------------------------------------------------ finding 9: twin follow-up

test('Twin "Same" on a pair joined by a form of 1 asks for that 1 (section 3, I5), not the common value', () => {
  for (const id of ['frac-equivalence.core', 'identity-moves.core', 'rationalize-denominator.core']) {
    for (const p of items(gen(id), 1, 'twin', 60)) {
      if (p.choices.find((c) => c.id === 'same').verdict !== 'correct') continue;
      assert.equal(p.answer.kind, 'form-of-1', `${id} seed ${p.seed}: ${print(p.prompt.math)} vs ${print(p.prompt.twin)} keys ${p.answer.kind} ${print(p.answer.expected)}`);
    }
  }
});

// ------------------------------------------------------------ finding 10: strike blank

test('equivalent-expressions d2 Strike blanks the term the Half-Hand and Sign-Thief get wrong at least half the time', () => {
  let coef = 0; let n = 0;
  for (const p of items(gen('equivalent-expressions.core'), 2, 'strike', N)) { n++; if (/^_x/.test(print(p.prompt.math.rhs))) coef++; }
  assert.ok(coef / n <= 0.5, `the blank is the x coefficient (and the constant is printed) on ${pct(coef, n)}`);
});

// ------------------------------------------------------------ finding 11: worked chains

test('worked chains: every non-Trace item of every generator but solution-meaning carries steps', () => {
  const bad = [];
  for (const g of allGenerators) {
    if (g.id === 'solution-meaning.core') continue; // disclosed: a substitution check is not a chain
    for (const it of g.interactions) {
      let w = 0; let n = 0;
      for (const p of items(g, g.difficulty[0], it, 50)) { n++; if (p.steps && p.steps.length >= 2) w++; }
      if (w < n) bad.push(`${g.id} ${it}: ${w}/${n} items have a worked chain`);
    }
  }
  assert.deepEqual(bad, []);
});

test('worked chains show the multiply-across / term-by-term line (frac-times-whole, distribute d4)', () => {
  for (const p of items(gen('frac-times-whole.core'), 1, 'strike', 20)) {
    const lines = p.steps.map((s) => print(s.line));
    assert.ok(p.steps.some((s) => s.line.t === 'frac' && (s.line.num.t === 'mul' || s.line.den.t === 'mul')), `seed ${p.seed}: ${lines.join('  ->  ')} never shows (n x a)/(1 x b)`);
  }
  for (const p of items(gen('distribute.core'), 4, 'strike', 20)) {
    assert.ok(p.steps.length >= 3, `seed ${p.seed}: ${p.steps.map((s) => print(s.line)).join('  ->  ')} has no A(bx) + A(c) line`);
  }
});

// ------------------------------------------------------------ finding 12: one object

test('the form of 1 carries the coin, and the form of 0 the zero-pair, wherever it is the tap target (section 7)', () => {
  const bad = new Set();
  for (const { g, d } of cells('why')) for (const p of items(g, d, 'why', 60, { fade: 0 })) {
    const c = p.choices.find(isOk);
    if (p.variant === 'hidden-1' && c.display.t !== 'num' && !p.visuals.includes('coin')) bad.add(`${g.id}: hidden-1 target ${shape(c.display)} without the coin (visuals ${p.visuals})`);
    if (p.variant === 'hidden-0' && c.display.t === 'group' && !p.visuals.includes('zeropair')) bad.add(`${g.id}: hidden-0 zero-pair without the zeropair visual (visuals ${p.visuals})`);
  }
  assert.deepEqual([...bad], []);
});

// ------------------------------------------------------------ finding 13: difficulty

test('balance-moves d1 (first equation items) is not mostly negative-number arithmetic', () => {
  let neg = 0; let n = 0;
  for (const p of items(gen('balance-moves.core'), 1, 'strike', N)) { n++; if (/-/.test(print(p.prompt.math)) || p.answer.expected.roots.some((r) => r.terms.some((t) => t.coef.n < 0n))) neg++; }
  assert.ok(neg / n < 0.5, `${pct(neg, n)} of d1 items have a negative number in the prompt or the root`);
});

test('difficulty levels differ: the same seed does not give the same Why at d1 and d2 (equivalent-expressions)', () => {
  const A = [...items(gen('equivalent-expressions.core'), 1, 'why', 200)]; const B = [...items(gen('equivalent-expressions.core'), 2, 'why', 200)];
  const same = A.filter((p, i) => print(p.prompt.math) === print(B[i].prompt.math)).length;
  assert.ok(same < 100, `${same}/200 identical`);
});

// ------------------------------------------------------------ finding 14: vocabulary

test('goals use classroom words (section 9): no bare "coin", "Lantern", "bracket", "under the root"', () => {
  const bad = new Set();
  for (const g of allGenerators) for (const it of g.interactions) for (const p of items(g, g.difficulty[0], it, 40)) {
    const s = p.prompt.goal || '';
    const m = s.match(/\bcoin\b|\bLantern\b|\bbracket\b|under the root/);
    if (m) bad.add(`${g.id} ${it}: "${s}"`);
  }
  assert.deepEqual([...bad].map((x) => x.replace(/-?\d+/g, 'N')).filter((x, i, a) => a.indexOf(x) === i), []);
});

// ------------------------------------------------------------ finding 15: option length

test('option length: the key is not the uniquely longest or uniquely shortest option on over 80% of a cell', { todo: 'finding 15' }, () => {
  const bad = [];
  for (const it of ['forge', 'nextline']) for (const { g, d } of cells(it)) {
    let n = 0; let lo = 0; let hi = 0;
    for (const p of items(g, d, it, N, { fade: 0 })) {
      n++; const c = p.choices.find(isOk); const L = text(c.display).length;
      if (p.choices.every((o) => o === c || text(o.display).length < L)) hi++;
      if (p.choices.every((o) => o === c || text(o.display).length > L)) lo++;
    }
    if (hi / n > 0.8 || lo / n > 0.8) bad.push(`${g.id} d${d} ${it}: key uniquely longest ${pct(hi, n)}, uniquely shortest ${pct(lo, n)}`);
  }
  assert.deepEqual(bad, []);
});
