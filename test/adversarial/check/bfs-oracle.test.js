// Adversarial: moves/graph.js BFS against an independent brute force.
// States a x + b = c x + d are tuples of _oracle.js fractions; the alphabet
// is fixed (state-independent), every move in it is invertible, so the true
// distance is a plain BFS over tuples. Checks: distance optimality, minPath
// replay, chip progress / legal-idle verdicts, termination under caps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../../src/math/parse.js';
import { bfs, search, step, chipVerdicts, canonicalize } from '../../../src/moves/graph.js';
import { classify } from '../../../src/moves/classify.js';
import { rng, F, fadd, fmul, fdiv, feq, fz, ptext, ONE, ZERO } from './_oracle.js';

function node(s) { const r = parse(s); if ('error' in r) throw new Error(`did not parse: ${s}: ${r.error}`); return r; }

// The alphabet, both as Moves and as tuple maps.
const ALPHA = [
  { m: { op: 'add', operand: node('1') }, f: ([a, b, c, d]) => [a, fadd(b, ONE), c, fadd(d, ONE)] },
  { m: { op: 'sub', operand: node('1') }, f: ([a, b, c, d]) => [a, fadd(b, F(-1n)), c, fadd(d, F(-1n))] },
  { m: { op: 'add', operand: node('x') }, f: ([a, b, c, d]) => [fadd(a, ONE), b, fadd(c, ONE), d] },
  { m: { op: 'sub', operand: node('x') }, f: ([a, b, c, d]) => [fadd(a, F(-1n)), b, fadd(c, F(-1n)), d] },
  { m: { op: 'mul', operand: node('2') }, f: (t) => t.map((z) => fmul(z, F(2n))) },
  { m: { op: 'div', operand: node('2') }, f: (t) => t.map((z) => fdiv(z, F(2n))) },
  { m: { op: 'div', operand: node('3') }, f: (t) => t.map((z) => fdiv(z, F(3n))) },
];
const key = (t) => t.map((z) => `${z.n}/${z.d}`).join(',');
const goalT = ([a, b, c, d]) => (feq(a, ONE) && fz(b) && fz(c)) || (fz(a) && feq(c, ONE) && fz(d));

/** Brute-force distance from tuple t (undefined beyond maxDepth). */
function bruteDist(t, maxDepth) {
  if (goalT(t)) return 0;
  const seen = new Set([key(t)]);
  let frontier = [t];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = [];
    for (const s of frontier) for (const { f } of ALPHA) {
      const u = f(s); const k = key(u);
      if (seen.has(k)) continue;
      if (goalT(u)) return depth;
      seen.add(k); next.push(u);
    }
    frontier = next;
  }
  return undefined;
}

const isNum = (n) => n.t === 'num' || (n.t === 'neg' && n.arg.t === 'num');
const isGoal = (e) => (e.lhs.t === 'var' && e.lhs.name === 'x' && isNum(e.rhs)) || (e.rhs.t === 'var' && e.rhs.name === 'x' && isNum(e.lhs));
const alphabet = () => ALPHA.map((x) => x.m);
const toText = ([a, b, c, d]) => `${ptext([b, a])} = ${ptext([d, c])}`;

test('oracle: BFS distance, minPath replay, chip verdicts vs brute force (linear, 7-move alphabet)', () => {
  const bad = [];
  let compared = 0; let capped = 0; let none = 0;
  for (let seed = 0; seed < 150; seed++) {
    const R = rng(60000 + seed);
    let a; let c; do { a = F(R.big(-3, 3)); c = F(R.big(-3, 3)); } while (feq(a, c));
    const t0 = [a, F(R.big(-5, 5)), c, F(R.big(-5, 5))];
    const text = toText(t0);
    const start = node(text);
    const truth = bruteDist(t0, 6);
    const res = search(start, alphabet, isGoal, { maxDepth: 6, nodeCap: 20000 });
    if (res.nodes > 20000 + ALPHA.length) bad.push(`${text}: nodes ${res.nodes} beyond the cap`);
    if (res.capped) { capped++; if (res.found && truth !== undefined && res.found.distance < truth) bad.push(`${text}: capped path shorter than optimal?`); continue; }
    const got = res.found?.distance;
    if (got !== truth) { bad.push(`${text}: bfs distance ${got}, brute force ${truth}`); continue; }
    if (truth === undefined) { none++; continue; }
    compared++;
    // replay
    let s = canonicalize(start);
    for (const m of res.found.minPath) {
      if (classify(m, s) !== 'legal') bad.push(`${text}: minPath move not legal`);
      s = step(m, s);
    }
    if (res.found.minPath.length !== truth || !isGoal(s)) bad.push(`${text}: replay length ${res.found.minPath.length} goal ${isGoal(s)}`);
    // the bfs() wrapper agrees
    const b = bfs(start, alphabet, isGoal);
    if (!b || b.distance !== truth) bad.push(`${text}: bfs() wrapper ${b?.distance}`);
    // chip verdicts
    const cv = chipVerdicts(start, alphabet(), alphabet, isGoal, {});
    if (!cv) { bad.push(`${text}: chipVerdicts undefined although the search was complete`); continue; }
    if (cv.distance !== truth) bad.push(`${text}: chipVerdicts distance ${cv.distance} vs ${truth}`);
    cv.chips.forEach((ch, i) => {
      const after = ALPHA[i].f(t0);
      const dAfter = bruteDist(after, 6);
      const progress = dAfter !== undefined && dAfter < truth;
      const want = progress ? 'progress' : 'legal-idle';
      if (ch.verdict !== want) bad.push(`${text}: chip ${i} ${ch.verdict}, brute force ${want} (after ${dAfter})`);
      if (progress && ch.distance !== dAfter) bad.push(`${text}: chip ${i} distance ${ch.distance} vs ${dAfter}`);
    });
  }
  // eslint-disable-next-line no-console
  console.log(`bfs oracle: ${compared} compared, ${none} with no path within 6, ${capped} capped`);
  assert.equal(bad.length, 0, bad.slice(0, 15).join('\n'));
  assert.ok(compared > 60);
});

test('BFS terminates under small caps and depth 0', () => {
  const start = node('3x + 5 = x - 7');
  for (const cap of [0, 1, 5, 50, 500]) {
    const t = Date.now();
    const r = search(start, alphabet, isGoal, { maxDepth: 6, nodeCap: cap });
    assert.ok(Date.now() - t < 5000);
    assert.ok(r.nodes <= cap + ALPHA.length + 1, `cap ${cap}: nodes ${r.nodes}`);
    if (!r.found) assert.equal(r.capped, true, `cap ${cap}: not found and not capped`);
  }
  assert.equal(bfs(start, alphabet, isGoal, 0), undefined);
  assert.deepEqual(bfs(node('x = 4'), alphabet, isGoal, 0), { distance: 0, minPath: [] });
  // An alphabet that grows the state forever (mul 2 only) never finds a goal and stops.
  const grow = () => [{ op: 'mul', operand: node('2') }];
  assert.equal(bfs(node('3x = 1'), grow, isGoal, 6, 100000), undefined);
});
