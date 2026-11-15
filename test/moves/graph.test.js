// @ts-check
// BFS tests (DESIGN.md section 11): terminates under the node cap; replaying
// minPath reaches the goal in exactly `distance` moves; each chip's distance
// matches a fresh search; distance is minimal (checked by an independent
// depth-limited DFS that does not use search()); canonicalize keeps the
// solution set.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forSeeds } from '../prop.js';
import { applyMove } from '../../src/moves/apply.js';
import { classify, trueSolutions } from '../../src/moves/classify.js';
import { canonicalize, bfs, search, step, chipVerdicts, stateKey } from '../../src/moves/graph.js';
import { toPoly, coeffsIn, pConstValue } from '../../src/math/poly.js';
import { forms } from '../../src/math/forms.js';
import { sameSolutionSet, checkRoot } from '../../src/math/solve.js';
import { print } from '../../src/math/print.js';
import { numQ } from '../../src/math/ast.js';
import { neg, isZero } from '../../src/math/rational.js';
import { P, nz, polyText, sQ } from '../check/_items.js';

/** @typedef {import('../../types.d.ts').Move} Move */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Q} Q */

/** @param {Equation} s @returns {boolean} x = a number */
function linearGoal(s) {
  if (s.lhs.t !== 'var' || s.lhs.name !== 'x') return false;
  const p = toPoly(s.rhs);
  return p !== undefined && pConstValue(p) !== undefined;
}

/**
 * A generator-style alphabet for a x + b = c x + d (at most 9 moves): the
 * useful moves read off the state plus fixed distractors.
 * @param {Equation} s
 * @returns {Move[]}
 */
function linearAlphabet(s) {
  /** @type {Move[]} */
  const out = [];
  const lp = toPoly(s.lhs);
  const rp = toPoly(s.rhs);
  const lc = lp && coeffsIn(lp, 'x');
  const rc = rp && coeffsIn(rp, 'x');
  /** @param {Q} c @returns {Node} */
  const n = (c) => numQ(c);
  if (lc && rc) {
    if (rc[1] && !isZero(rc[1])) out.push({ op: 'sub', operand: { t: 'mul', args: [n(rc[1]), { t: 'var', name: 'x' }] } });
    if (lc[0] && !isZero(lc[0])) out.push({ op: 'sub', operand: n(lc[0]) });
    if (lc[1] && !isZero(lc[1])) out.push({ op: 'div', operand: n(lc[1]) });
    if (lc[0] && !isZero(lc[0])) out.push({ op: 'add', operand: n(neg(lc[0])) }); // same as sub: a duplicate edge
  }
  out.push({ op: 'add', operand: P('1') }, { op: 'mul', operand: P('2') }, { op: 'div', operand: P('x') }, { op: 'mul', operand: P('0') }, { op: 'sub', operand: P('x') });
  return out;
}

/**
 * Independent minimality check: is there ANY path of legal moves of length
 * <= depth to the goal? Plain recursion over raw applyMove + canonicalize;
 * no dedupe, no search().
 * @param {Equation} s @param {number} depth
 */
function reachable(s, depth) {
  if (linearGoal(s)) return true;
  if (depth === 0) return false;
  for (const m of linearAlphabet(s)) {
    if (classify(m, s, []) !== 'legal') continue;
    if (reachable(canonicalize(applyMove(m, s)), depth - 1)) return true;
  }
  return false;
}

test('BFS on 6 + 4x = 2x^2 (section 3 I1 example): verdicts and distances', () => {
  const start = P('6 + 4x = 2x^2');
  const alphabet = () => [
    { op: /** @type {const} */ ('sub'), operand: P('6 + 4x') },
    { op: /** @type {const} */ ('sub'), operand: P('2x^2') },
    { op: /** @type {const} */ ('div'), operand: P('2') },
    { op: /** @type {const} */ ('div'), operand: P('x') },
    { op: /** @type {const} */ ('mul'), operand: P('0') },
  ];
  const isGoal = forms['standard-form'];
  const res = chipVerdicts(start, alphabet(), alphabet, isGoal);
  assert.ok(res);
  assert.equal(res.distance, 1);
  assert.deepEqual(res.chips.map((c) => c.verdict), ['progress', 'progress', 'legal-idle', 'risky', 'illegal']);
  assert.equal(print(/** @type {Equation} */ (res.chips[0].next)), '0 = 2x^2 - 4x - 6');
  assert.equal(res.chips[0].distance, 0);
});

test('BFS: node cap and depth cap', () => {
  const start = P('3x + 5 = 11');
  const capped = search(start, linearAlphabet, linearGoal, { nodeCap: 3 });
  assert.equal(capped.capped, true);
  assert.equal(capped.found, undefined);
  assert.equal(bfs(start, linearAlphabet, linearGoal, 6, 3), undefined);
  const shallow = search(start, linearAlphabet, linearGoal, { maxDepth: 1 });
  assert.equal(shallow.capped, false);
  assert.equal(shallow.found, undefined);
  assert.equal(bfs(start, linearAlphabet, linearGoal)?.distance, 2);
  assert.equal(bfs(P('x = 4'), linearAlphabet, linearGoal)?.distance, 0);
  assert.equal(chipVerdicts(start, linearAlphabet(start), linearAlphabet, linearGoal, { nodeCap: 3 }), undefined, 'capped search is never trusted');
});

test('BFS: literal equations need the declaration passed through', () => {
  const start = P('A = lw');
  const alphabet = () => [{ op: /** @type {const} */ ('div'), operand: P('l') }, { op: /** @type {const} */ ('div'), operand: P('w') }];
  /** @param {Equation} s */
  const isGoal = (s) => forms['isolated'](s) && (s.lhs.t === 'var' && s.lhs.name === 'w' || s.rhs.t === 'var' && s.rhs.name === 'w');
  assert.equal(bfs(start, alphabet, isGoal), undefined, 'no declaration: "/ l" is risky, no path');
  const r = bfs(start, alphabet, isGoal, 6, 1000, [{ name: 'l', rel: 'nonzero' }]);
  assert.ok(r);
  assert.equal(r.distance, 1);
  assert.equal(print(step(r.minPath[0], canonicalize(start), [{ name: 'l', rel: 'nonzero' }])), 'A/l = w');
});

test('property: BFS over 5000 linear equations (cap, replay, minimality, chip distances)', () => {
  forSeeds(5000, (rng) => {
    let a = nz(rng, -6, 6);
    const c = BigInt(rng.int(-6, 6));
    if (a === c) a += 1n;
    if (a === 0n) a = 7n;
    const r = BigInt(rng.int(-9, 9));
    const b = BigInt(rng.int(-9, 9));
    const d = (a - c) * r + b;
    const start = /** @type {Equation} */ (P(`${polyText([b, a])} = ${polyText([d, c])}`));
    assert.equal(checkRoot(start, 'x', sQ(r)), true, 'construction');
    const cap = 2000;
    const sr = search(start, linearAlphabet, linearGoal, { nodeCap: cap });
    assert.equal(sr.capped, false, 'terminates under the node cap');
    assert.ok(sr.nodes <= cap + 20, 'node count bounded');
    const found = sr.found;
    assert.ok(found, 'a path within 6');
    assert.ok(found.distance <= 6);
    // Replay minPath: every move legal, exactly `distance` moves, ends at the goal, which is x = r.
    let s = canonicalize(start);
    for (const m of found.minPath) {
      assert.equal(classify(m, s, []), 'legal', 'path moves are legal');
      s = step(m, s);
    }
    assert.equal(found.minPath.length, found.distance);
    assert.ok(linearGoal(s), 'replay reaches the goal');
    assert.equal(print(s), `x = ${r < 0n ? `-${-r}` : r}`, 'and the goal is the true root');
    // Minimality, independently.
    if (found.distance > 0) assert.equal(reachable(canonicalize(start), found.distance - 1), false, 'no shorter path');
    // Chips.
    const chips = linearAlphabet(canonicalize(start));
    const cv = chipVerdicts(start, chips, linearAlphabet, linearGoal);
    assert.ok(cv);
    assert.equal(cv.distance, found.distance);
    for (const ch of cv.chips) {
      const cls = classify(ch.move, canonicalize(start), []);
      if (ch.verdict === 'risky' || ch.verdict === 'illegal') { assert.equal(ch.verdict, cls); continue; }
      assert.equal(cls, 'legal');
      const fresh = bfs(/** @type {Equation} */ (ch.next), linearAlphabet, linearGoal);
      if (ch.verdict === 'progress') {
        assert.ok(fresh, 'progress chip has a path');
        assert.equal(ch.distance, fresh.distance, 'chip distance matches a fresh search');
        assert.ok(fresh.distance < found.distance);
      } else {
        assert.ok(!fresh || fresh.distance >= found.distance, 'legal-idle is really not closer');
      }
      assert.equal(stateKey(/** @type {Equation} */ (ch.next)), stateKey(step(ch.move, canonicalize(start))));
    }
    const m0 = chips.find((m) => m.op === 'div' && m.operand?.t === 'var');
    assert.ok(m0 && cv.chips[chips.indexOf(m0)].verdict === 'risky', '"/ x" is never a path edge or a progress chip');
  });
});

test('property: canonicalize keeps the solution set (5000 random lines)', () => {
  forSeeds(5000, (rng) => {
    const k = nz(rng, -6, 6);
    const r1 = BigInt(rng.int(-6, 6));
    const L = [BigInt(rng.int(-9, 9)), BigInt(rng.int(-9, 9)), BigInt(rng.int(-2, 2))];
    const R = [L[0] - k * r1, L[1] - k, L[2]]; // L - R = k (x - r1)
    const den = rng.pick(['', '2', '3', '6']);
    const wrap = (/** @type {bigint[]} */ cs) => (den ? `(${polyText(cs)})/${den}` : polyText(cs));
    const e = /** @type {Equation} */ (P(`${wrap(L)} = ${wrap(R)}`));
    const ce = canonicalize(e);
    const a = trueSolutions(e, 'x');
    const b = trueSolutions(ce, 'x');
    assert.ok(a && b);
    assert.ok(sameSolutionSet(a, b), `${print(e)} vs ${print(ce)}`);
    assert.ok(a.kind === 'finite' && a.roots.length === 1, 'construction: one root');
    assert.equal(stateKey(canonicalize(ce)), stateKey(ce), 'canonicalize is idempotent');
  });
});

test('canonicalize never cancels an undeclared variable denominator', () => {
  const e = P('(x^2)/x = (3x)/x');
  const ce = canonicalize(e);
  assert.notEqual(print(ce), 'x = 3');
  const s = trueSolutions(ce, 'x');
  assert.ok(s && s.kind === 'finite' && s.roots.length === 1);
  assert.equal(print(canonicalize(P('(lw)/l = A/l'), [{ name: 'l', rel: 'nonzero' }])), 'w = A/l');
});
