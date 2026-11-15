// Adversarial review of src/render/keypad.js (M4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeKeypad, press, inputText, readInput, previewVNode, keyDefs } from '../../../src/render/keypad.js';
import { parse, parseList, parseSolutions } from '../../../src/math/parse.js';
import { judge } from '../../../src/check/judge.js';
import { rng, evalAst, readTokens, evalTokens, ENVS, close } from './_reader.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}n` : v);
const J = (x) => JSON.stringify(x, big);

/** Type a string on the keypad: one key per character; "sqrt" and U+00B1 are one key each. */
function keysFor(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('sqrt', i)) { out.push('sqrt'); i += 3; continue; }
    const c = s[i];
    if (c === ' ') continue;
    if (c === '±') out.push('pm');
    else if (/[A-Za-z]/.test(c)) out.push(`var:${c}`);
    else out.push(c);
  }
  return out;
}
function typeOn(st, s) { for (const k of keysFor(s)) st = press(st, k); return st; }

// ---------------------------------------------------------------- forms from sections 3 and 9
const FORMS = [
  // [mode, vars, text]
  ['single', ['x'], '-2/3'],
  ['single', ['x'], 'sqrt(3)/3'],
  ['single', ['x'], '2sqrt3'],
  ['single', ['x'], 'x^(1/2)'],
  ['single', ['x'], '9^(1/2)'],
  ['single', ['x'], '2x^2-4x-6=0'],
  ['single', ['x'], '0=2x^2-4x-6'],
  ['single', ['l', 'w', 'A'], 'w=A/l'],
  ['single', ['l', 'w', 'A'], 'A=lw'],
  ['single', [], '4/1'],
  ['single', [], '3+4'],
  ['single', [], 'sqrt(3)/sqrt(3)'],
  ['single', ['x'], '9-9'],
  ['single', ['x'], '(x+3)^2'],
  ['list', ['x'], '2,-4,-6'],
  ['list', [], '1,-2,-3'],
  ['solutions', ['x'], '1±sqrt3'],
  ['solutions', ['x'], 'x=1±sqrt3'],
  ['solutions', ['x'], '(2±sqrt(12))/4'],
  ['solutions', ['x'], 'x=3,x=-1'],
  ['solutions', ['x'], '3,-1'],
  ['solutions', ['x'], '-3/2'],
  ['solutions', ['x'], '±3'],
];
for (const [mode, vars, text] of FORMS) {
  test(`form ${mode} ${J(vars)} ${J(text)} can be typed and is read as typed`, () => {
    const st = typeOn(makeKeypad({ variableKeys: vars, mode }), text);
    const typed = inputText(st);
    const ref = mode === 'single' ? parse(text) : mode === 'list' ? parseList(text) : parseSolutions(text, vars.length === 1 ? vars[0] : undefined);
    assert.ok(!('error' in ref), `reference parse of ${text} failed: ${J(ref)}`);
    const r = readInput(typed, { mode: st.mode, solveFor: st.solveFor });
    assert.equal(r.status, 'read', `${J(typed)} -> ${J(r)}`);
  });
}
test('whole-answer keys read as words in solution mode', () => {
  for (const id of ['none', 'all']) {
    const st = press(makeKeypad({ answerKind: 'solution-set' }), id);
    assert.equal(readInput(inputText(st), { mode: st.mode, solveFor: st.solveFor }).status, 'word');
  }
});
test('8-digit pairing code (section 9 screen 7) can at least be typed as digits', () => {
  const st = typeOn(makeKeypad({ variableKeys: [] }), '12345678');
  assert.equal(inputText(st), '12345678');
});

// ---------------------------------------------------------------- key text corruption fuzz
// Reference text: every key separated by a space, except digit after digit.
// Whatever inputText() adds or omits, it must parse exactly like the reference
// in every mode (spaces only matter for "+ -" and digit runs).
const ALL_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '/', '-', '+', '^', 'sqrt', '(', ')', '=', 'pm', ','];
function fuzzKeys(skipPlusSlashMinus) {
  const R = rng(31337);
  const varSets = [['x'], ['s', 'q', 'r', 't'], ['l', 'w', 'A'], []];
  const bad = [];
  for (let i = 0; i < 20000 && bad.length < 5; i++) {
    const vars = varSets[i % varSets.length];
    const keys = [...ALL_KEYS, ...vars.map((v) => `var:${v}`), 'back'];
    let st = makeKeypad({ variableKeys: vars, mode: 'single' });
    const n = 1 + Math.floor(R() * 14);
    for (let k = 0; k < n; k++) st = press(st, keys[Math.floor(R() * keys.length)]);
    const text = inputText(st);
    if (skipPlusSlashMinus && text.includes('+/-')) continue; // finding 2, pinned separately below
    let ref = '';
    st.tokens.forEach((id, j) => {
      const prev = st.tokens[j - 1];
      const e = id.startsWith('var:') ? id.slice(4) : id === 'pm' ? '±' : id;
      ref += (j > 0 && !(/^\d$/.test(id) && /^\d$/.test(prev)) ? ' ' : '') + e;
    });
    for (const [name, f] of [['parse', parse], ['parseList', parseList], ['parseSolutions', (t) => parseSolutions(t)]]) {
      const a = J(f(text)); const b = J(f(ref));
      const ae = a.startsWith('{"error"'); const be = b.startsWith('{"error"');
      if (ae !== be || (!ae && a !== b)) bad.push({ name, tokens: st.tokens, text, ref, a: a.slice(0, 120), b: b.slice(0, 120) });
    }
  }
  return bad;
}
test('20000 random key sequences: inputText parses like a fully spaced reference, in every mode (except "+/-")', () => {
  assert.deepEqual(fuzzKeys(true), []);
});
// Finding 2: the three keys "+", "/", "-" emit "+/-", which parse.js tokenizes
// as ONE plus-minus token, so in solution mode garbage keys become a +- answer.
test('keys + / - are not silently fused into plus-minus', () => {
  let st = makeKeypad({ answerKind: 'solution-set' });
  for (const k of ['8', '+', '/', '-', '2']) st = press(st, k);
  const r = readInput(inputText(st), { mode: st.mode, solveFor: st.solveFor });
  assert.notEqual(r.status, 'read', `${J(inputText(st))} read as ${J(r).slice(0, 160)}`);
});

// ---------------------------------------------------------------- preview honesty
// The preview vnode, read back with the independent reader, must have the value
// of the tree parse() produced (for every readable random key sequence).
test('preview reading has the value of what parse() produced (random typed input)', () => {
  const R = rng(2024);
  const keys = ['1', '2', '3', '5', '/', '-', '+', '^', 'sqrt', '(', ')', 'var:x', 'var:y', '-', '/', '^'];
  let readable = 0; const bad = [];
  for (let i = 0; i < 40000 && bad.length < 5; i++) {
    let st = makeKeypad({ variableKeys: ['x', 'y'], mode: 'single' });
    const n = 1 + Math.floor(R() * 12);
    for (let k = 0; k < n; k++) st = press(st, keys[Math.floor(R() * keys.length)]);
    const text = inputText(st);
    const reading = readInput(text, { mode: 'single' });
    if (reading.status !== 'read') continue;
    readable++;
    const tree = parse(text);
    const v = previewVNode(reading, text);
    const toks = readTokens(v);
    for (const env of ENVS) {
      let got;
      try { got = evalTokens(toks, env); } catch (e) { bad.push({ text, err: e.message }); break; }
      const want = evalAst(tree, env);
      if (!close(want, got)) { bad.push({ text, want, got }); break; }
    }
  }
  assert.ok(readable > 3000, `readable ${readable}`);
  assert.deepEqual(bad, []);
});

// Finding: the whole-answer keys are on every item (builder deviation 5) and
// readInput() reports them as the word in every mode, but outside solution
// mode the judge reads the same text with parse() / parseList(), which gives a
// product of letters (n o s o l u t i o n), and judges it 'wrong' on an expr
// item instead of unparsed. The preview's reading is not what parse() produced.
test('whole-answer key outside solution mode: preview reading matches what the judge reads', () => {
  const st = press(makeKeypad({ answerKind: 'expr' }), 'none');
  const text = inputText(st);
  const reading = readInput(text, { mode: st.mode });
  const parsed = parse(text);
  // Either the preview says it cannot be read, or parse refuses it too.
  assert.ok(reading.status !== 'word' || 'error' in parsed, `preview ${J(reading)} but parse() gave ${J(parsed).slice(0, 80)}`);
  const N = (n) => ({ t: 'num', q: { n: BigInt(n), d: 1n } });
  const prob = { id: 'p', constructed: true, variableKeys: ['x'], assumptions: [],
    answer: { kind: 'expr', expected: { t: 'add', args: [{ t: 'var', name: 'x' }, N(1)] }, formPredicates: [], assumptions: [] } };
  assert.notEqual(judge(prob, text).verdict, 'wrong');
});

test('every key def is a 48px-class button and the set matches section 9', () => {
  const ids = keyDefs(['x']).filter(Boolean).map((k) => k.id).sort();
  const want = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '/', '-', '+', '^', 'sqrt', '(', ')', '=', 'pm', ',', 'none', 'all', 'back', 'var:x'].sort();
  assert.deepEqual(ids, want);
});

test('solution-mode preview: each shown item has the value of the parsed root it stands for', () => {
  const R = rng(555);
  const keys = ['1', '2', '3', '4', '/', '-', '+', '^', 'sqrt', '(', ')', 'pm', ',', 'var:x', '='];
  let readable = 0; const bad = [];
  for (let i = 0; i < 60000 && bad.length < 5; i++) {
    let st = makeKeypad({ answerKind: 'solution-set', variableKeys: ['x'] });
    const n = 1 + Math.floor(R() * 12);
    for (let k = 0; k < n; k++) st = press(st, keys[Math.floor(R() * keys.length)]);
    const text = inputText(st);
    const reading = readInput(text, { mode: st.mode, solveFor: st.solveFor });
    if (reading.status !== 'read') continue;
    readable++;
    const ps = parseSolutions(text, 'x');
    const v = previewVNode(reading, text);
    const items = v.children[0].children.filter((c) => !(c.attrs.class || '').includes('mcomma'));
    if (items.length !== ps.nodes.length) { bad.push({ text, shown: items.length, parsed: ps.nodes.length }); continue; }
    items.forEach((it, j) => {
      const toks = readTokens(it);
      if (!(toks[0] && toks[0].k === 'var' && toks[1] && toks[1].k === '=')) { bad.push({ text, j, why: 'no x =' }); return; }
      const got = evalTokens(toks.slice(2), {}); const want = evalAst(ps.nodes[j], {});
      if (!close(want, got)) bad.push({ text, j, want, got });
    });
  }
  assert.ok(readable > 1000, `readable ${readable}`);
  assert.deepEqual(bad, []);
});
