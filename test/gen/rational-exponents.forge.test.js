// @ts-check
// rational-exponents.forge: the property suite (one runGeneratorSuite() call),
// the documented named Forge seed, and a surface-tell check on the offered
// options. Run: node --test test/gen/rational-exponents.forge.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneratorSuite, print, makeRng } from './harness.js';
import generator, { NAMED_SEED } from '../../src/gen/stacks-roots/rational-exponents.forge.js';
import { judge } from '../../src/check/judge.js';

/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Node} Node */

// ---- an independent path to the key, from the PRINTED prompt only:
// (B^a)^b = B^(a b) and B^a B^a = B^(a + a); one of a, b, c in
// (B^a)^b = B^c (or B^a B^a = B^c) is the blank "_", and the two exponents
// must agree. Plain BigInt fractions.

/** The printed prompt with the blank shown as "_". @param {Problem} p */
function promptText(p) { return print(/** @type {Node} */ (p.prompt.math)); }

/** @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
/** "1/2", "2", "(1/2)" -> [n, d] @param {string} t @returns {[bigint, bigint]} */
function fr(t) { const m = /^\(?(-?\d+)(?:\/(\d+))?\)?$/.exec(t); if (!m) throw new Error(`cannot read ${t}`); return [BigInt(m[1]), BigInt(m[2] ?? '1')]; }
/** @param {bigint} n @param {bigint} d */
function show(n, d) { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; n /= g; d /= g; return d === 1n ? `${n}` : `${n}/${d}`; }

/** @param {Problem} p @returns {[bigint, bigint]} the key as a fraction */
function keyOf(p) {
  const t = promptText(p);
  const E = '(_|\\d+|\\(-?\\d+/\\d+\\))';
  const sq = new RegExp(`^\\((\\d+)\\^${E}\\)\\^${E} = (\\d+)\\^${E}$`).exec(t);
  const pr = new RegExp(`^(\\d+)\\^_\\((\\d+)\\^_\\) = (\\d+)\\^${E}$`).exec(t);
  if (pr && pr[1] === pr[2] && pr[2] === pr[3] && pr[4] !== '_') { const [n, d] = fr(pr[4]); return [n, 2n * d]; } // a + a = c
  if (!sq || sq[1] !== sq[4]) throw new Error(`cannot read the forge ${t}`);
  const [a, b, c] = [sq[2], sq[3], sq[5]];
  if ([a, b, c].filter((x) => x === '_').length !== 1) throw new Error(`not one blank: ${t}`);
  // a b = c
  if (a === '_') { const [bn, bd] = fr(b); const [cn, cd] = fr(c); return [cn * bd, cd * bn]; }
  if (b === '_') { const [an, ad] = fr(a); const [cn, cd] = fr(c); return [cn * ad, cd * an]; }
  const [an, ad] = fr(a); const [bn, bd] = fr(b); return [an * bn, ad * bd];
}

/** @param {Problem} p @returns {string} */
function independentKey(p) { const [n, d] = keyOf(p); return show(n, d); }

runGeneratorSuite(generator, {
  separates: [],
  independentKey,
  reference: (p) => { const [n, d] = fr(independentKey(p)); return { t: 'num', q: { n, d } }; },
  notCorrect: (p) => ['2', '1', '1/2', '-1', '-1/2', '1/4', '9/2'].filter((x) => x !== independentKey(p)),
  minDistinct: 8,
});

test('documented seed: the named Forge (9^?)^2 = 9^1', () => {
  const p = generator.generate(makeRng(NAMED_SEED), { difficulty: 1, interaction: 'forge', fadeLevel: 0 });
  assert.equal(promptText(p), '(9^_)^2 = 9^1');
  assert.deepEqual((p.choices ?? []).map((c) => `${print(/** @type {Node} */ (c.display))}:${c.verdict}`).sort(), ['-1/2:wrong', '1/2:correct', '1:wrong', '2:wrong']);
  for (const c of p.choices ?? []) assert.equal(judge(p, c.id, { tapped: true }).verdict, c.verdict === 'correct' ? 'correct' : 'wrong');
  const typed = generator.generate(makeRng(NAMED_SEED), { difficulty: 1, interaction: 'forge', fadeLevel: 2 });
  assert.equal(typed.constructed, true);
  assert.equal(judge(typed, '1/2').verdict, 'correct');
  assert.equal(judge(typed, '2').verdict, 'wrong');
});

test('offered options carry no surface tell, and the key moves around', () => {
  /** @type {Record<string, number>} */
  const at = {};
  const keys = new Set();
  let n = 0;
  for (const difficulty of [1, 2]) {
    for (let i = 0; i < 2000; i++) {
      const p = generator.generate(makeRng(`tell${i}`), { difficulty, interaction: 'forge', fadeLevel: i % 2 });
      const cs = p.choices ?? [];
      const texts = cs.map((c) => print(/** @type {Node} */ (c.display)));
      const k = cs.findIndex((c) => c.verdict === 'correct');
      const others = texts.filter((_, i2) => i2 !== k);
      if (texts[k].includes('/')) assert.ok(others.some((t) => t.includes('/')), `the key is the only fraction: ${texts}`);
      else assert.ok(others.some((t) => !t.includes('/')), `the key is the only whole number: ${texts}`);
      assert.ok(others.some((t) => !t.startsWith('-') && t !== '0'), `the key is the only positive option: ${texts}`);
      keys.add(texts[k]);
      const len = texts.map((t) => t.length);
      const uniqueAt = (/** @type {number} */ x) => len.filter((l) => l === x).length === 1;
      assert.ok(!(len[k] === Math.max(...len) && uniqueAt(len[k])), `the key is the unique longest: ${texts}`);
      assert.ok(!(len[k] === Math.min(...len) && uniqueAt(len[k])), `the key is the unique shortest: ${texts}`);
      at[cs[k].id] = (at[cs[k].id] ?? 0) + 1;
      n++;
    }
  }
  for (const id of ['a', 'b', 'c', 'd']) assert.ok((at[id] ?? 0) > n / 6, `the key sits at ${id} only ${at[id] ?? 0} times in ${n}`);
  // review finding 4: the key is not 1/2 on every item
  assert.deepEqual([...keys].sort(), ['1', '1/2', '2']);
});
