// @ts-check
// Explicit judging tables on the teacher's examples (seeds documented in README.md), plus
// garbage-input robustness: unparsed is never a crash and never a miss.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../js/gens/index.js';
import { judge } from '../js/judge.js';
import { print } from '../js/print.js';
import { buildFeedback } from '../js/feedback.js';
import { makeRng } from '../js/rng.js';
import { EXAMPLES } from '../js/examples.js';

const ex = (/** @type {string} */ name, /** @type {string} */ inter) => {
  const e = /** @type {any} */ (EXAMPLES)[name];
  return generate(e.gen, e.seed, inter);
};

/** @param {any} p @param {[string, string, string[]?][]} rows [input, verdict, tags] */
function table(p, rows) {
  for (const [input, verdict, tags] of rows) {
    const r = judge(p, input);
    assert.equal(r.verdict, verdict, `${print(p.prompt.math)}: "${input}" -> ${r.verdict} (${r.why || ''})`);
    if (tags) assert.deepEqual(r.tags, tags, `"${input}" tags`);
    const fb = buildFeedback(p, r);
    assert.equal(fb.miss, verdict === 'wrong', `"${input}" miss flag`);
  }
}

test('4 x 1/3 (Strike): lowest terms required; 8/6 is same value, not finished', () => {
  const p = ex('fracTimesWhole', 'strike');
  assert.equal(print(p.prompt.math), '4*1/3');
  table(p, [
    ['4/3', 'correct', []],
    ['(4)/(3)', 'correct'],
    ['8/6', 'form'],
    ['12/9', 'form'],
    ['4/1*1/3', 'form'],
    ['--4/3', 'form'],
    ['1/3', 'wrong', ['scalar-times-both-parts']],
    ['4/12', 'wrong', ['scalar-times-both-parts']],
    ['1/12', 'wrong', ['scalar-into-denominator']],
    ['5/3', 'wrong', []],
    ['4', 'wrong', []],
    ['4/0', 'unparsed'],
    ['4/', 'unparsed'],
    ['', 'unparsed'],
    ['4/3=4/3', 'unparsed'],
    ['9^9^9', 'unverifiable'],
  ]);
});

test('sqrt(3) x sqrt(3) (Strike)', () => {
  const p = ex('sqrtSquared', 'strike');
  assert.equal(print(p.prompt.math), 'sqrt3*sqrt3');
  table(p, [
    ['3', 'correct', []],
    ['(3)', 'correct'],
    ['9', 'wrong', ['root-square-overshoot']],
    ['sqrt9', 'form'],
    ['sqrt3sqrt3', 'form'],
    ['sqrt3^2', 'form'],
    ['(sqrt3)^2', 'form'],
    ['6/2', 'form'],
    ['3/1', 'form'],
    ['sqrt3', 'wrong', []],
    ['sqrt', 'unparsed'],
    ['sqrt(-3)', 'unverifiable'],
  ]);
});

test('6/sqrt(3) (Strike): no root in the denominator, simplified', () => {
  const p = ex('rationalize', 'strike');
  assert.equal(print(p.prompt.math), '6/sqrt3');
  table(p, [
    ['2sqrt3', 'correct', []],
    ['2sqrt(3)', 'correct'],
    ['sqrt3*2', 'correct'],
    ['6sqrt3/3', 'form'],
    ['(6sqrt3)/3', 'form'],
    ['sqrt12', 'form'],
    ['6/sqrt3', 'form'],
    ['12/sqrt12', 'form'],
    ['2sqrt3/1', 'form'],
    ['6', 'wrong', ['one-part-coin']],
    ['2', 'wrong', ['one-part-coin']],
    ['6sqrt3/9', 'wrong', ['root-square-overshoot']],
    ['2sqrt3/3', 'wrong', ['root-square-overshoot']],
    ['3sqrt2', 'wrong', []],
    ['6/sqrt(3-3)', 'unparsed'],
    ['sqrt(sqrt3)', 'unverifiable'],
  ]);
});

test('3/sqrt(2)-style coefficient forms are all accepted when finished', () => {
  // find a seed with k = 3, n = 2 by search (deterministic)
  let p;
  for (let i = 0; i < 20000 && !p; i++) {
    const c = generate('rat', `k3n2-${i}`, 'strike');
    if (c.data.k === 3n && c.data.n === 2n) p = c;
  }
  assert.ok(p);
  table(p, [
    ['3sqrt2/2', 'correct'],
    ['3/2sqrt2', 'correct'],
    ['sqrt2*3/2', 'correct'],
    ['(3sqrt2)/2', 'correct'],
    ['6sqrt2/4', 'form'],
    ['3/sqrt2', 'form'],
  ]);
});

test('6 + 4x = 2x^2 (Strike, rewrite as ... = 0): both orientations and any rational multiple', () => {
  const p = ex('quadratic', 'strike');
  assert.equal(print(p.prompt.math), '6+4x=2x^2');
  table(p, [
    ['0=2x^2-4x-6', 'correct', []],
    ['2x^2-4x-6=0', 'correct', []],
    ['x^2-2x-3=0', 'correct'],
    ['0=x^2-2x-3', 'correct'],
    ['-2x^2+4x+6=0', 'correct'],
    ['0=-x^2+2x+3', 'correct'],
    ['1/2x^2-x-3/2=0', 'correct'],
    ['4x^2-8x-12=0', 'correct'],
    ['2x^2=4x+6', 'form'],
    ['6+4x=2x^2', 'form'],
    ['0=-4x+2x^2-6', 'form'],
    ['0=2(x^2-2x-3)', 'form'],
    ['(x-3)(x+1)=0', 'form'],
    ['2x^2-4x-6+0=0', 'form'],
    ['x^3-2x^2-3x=0', 'wrong', []],
    ['2x^2+4x+6=0', 'wrong', ['transpose-no-sign-change', 'copy-coefficients']],
    ['0=2x^2+4x+6', 'wrong', ['transpose-no-sign-change', 'copy-coefficients']],
    ['2x^2-4x+6=0', 'wrong', ['copy-coefficients']],
    ['2x^2+4x-6=0', 'wrong', ['copy-coefficients']],
    ['0=2x^2', 'wrong', ['one-sided-operation']],
    ['6+4x=0', 'wrong', ['one-sided-operation']],
    ['x=3', 'wrong', []],
    ['0=0', 'wrong', []],
    ['2x^2-4x-6', 'unparsed'],
    ['x^2=', 'unparsed'],
    ['=0', 'unparsed'],
    ['1/x=0', 'unverifiable'],
    ['(x+1)^99=0', 'unverifiable'],
  ]);
  const amb = judge(p, '2x^2+4x+6=0');
  assert.equal(amb.ambiguous, true);
  const fb = buildFeedback(p, amb);
  assert.equal(fb.haunt, undefined, 'ambiguous is never tagged to one Haunt');
});

test('6 + 4x = 2x^2 (Next Line): side-wise, the teacher example', () => {
  const p = ex('quadratic', 'nextline');
  const shown = p.choices.map((/** @type {any} */ c) => `${print(c.display)}:${c.verdict}`);
  assert.ok(shown.some((/** @type {string} */ s) => /^(0=2x\^2-4x-6|2x\^2-4x-6=0):correct$/.test(s)), shown.join(' '));
  assert.equal(print(p.prompt.move[1].m), '(6+4x)');
});

test('garbage never crashes and is never a miss, on every proto item type', () => {
  const rng = makeRng('garbage');
  const keys = ['0', '1', '2', '3', '9', '/', '-', '+', '^', 'sqrt', '(', ')', '=', 'x'];
  const items = [ex('fracTimesWhole', 'strike'), ex('sqrtSquared', 'strike'), ex('rationalize', 'strike'), ex('quadratic', 'strike')];
  let unparsed = 0;
  for (let i = 0; i < 8000; i++) {
    const p = items[i % items.length];
    let s = '';
    const len = rng.int(1, 16);
    for (let j = 0; j < len; j++) s += rng.pick(keys);
    const r = judge(p, s);
    assert.ok(['correct', 'form', 'wrong', 'unparsed', 'unverifiable'].includes(r.verdict));
    if (r.verdict === 'unparsed') unparsed++;
    // anything that does not parse is unparsed, never wrong
    if (!r.parsed) assert.notEqual(r.verdict, 'wrong', s);
    buildFeedback(p, r);
  }
  assert.ok(unparsed > 1000);
  for (const p of items) for (const s of ['((((', '))', 'sqrtsqrtsqrt', '^^^', '=====', 'x'.repeat(50), '9'.repeat(13), '\u0000', 'hello']) {
    const r = judge(p, s);
    assert.ok(r.verdict === 'unparsed' || r.verdict === 'unverifiable', `${s}: ${r.verdict}`);
  }
});
