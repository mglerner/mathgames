// Adversarial review of src/render/mathdom.js (M4). Independent of
// test/render/helpers.js and arb.js: our own random AST generator, our own
// reader of the rendered vnode (visible text plus 2-D layout classes only),
// our own text parser with textbook precedence, and our own float evaluator
// of the AST. A rendered tree whose visible reading has a different value
// from the AST at generic sample points misrepresents the AST.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMath } from '../../../src/render/mathdom.js';
import { rng, gen, evalAst, readTokens, evalTokens, ENVS, close, checkNode } from './_reader.js';

// ------------------------------------------------------------ tests
test('reader self-check: catches a dropped parenthesis', () => {
  // A hand-made vnode for "2x + 1" claimed to represent 2(x + 1).
  const fake = { tag: 'span', attrs: {}, children: ['2', { tag: 'span', attrs: { class: 'mi' }, children: ['x'] }, ' + 1'] };
  const node = { t: 'mul', args: [{ t: 'num', q: { n: 2n, d: 1n } }, { t: 'add', args: [{ t: 'var', name: 'x' }, { t: 'num', q: { n: 1n, d: 1n } }] }] };
  assert.notEqual(evalTokens(readTokens(fake), ENVS[0]), evalAst(node, ENVS[0]));
});

const N = (n, d = 1n) => ({ t: 'num', q: { n: BigInt(n), d: BigInt(d) } });
const V = (name) => ({ t: 'var', name });
const HAND = {
  '-(x+1)': { t: 'neg', arg: { t: 'add', args: [V('x'), N(1)] } },
  '(a+b)c': { t: 'mul', args: [{ t: 'add', args: [V('a'), V('b')] }, V('b')] },
  '(-2)^2': { t: 'pow', base: N(-2), exp: N(2) },
  '-(2^2)': { t: 'neg', arg: { t: 'pow', base: N(2), exp: N(2) } },
  '(neg 2)^2': { t: 'pow', base: { t: 'neg', arg: N(2) }, exp: N(2) },
  'a/(b+c)': { t: 'frac', num: V('a'), den: { t: 'add', args: [V('b'), V('x')] } },
  '(a/b)^c': { t: 'pow', base: { t: 'frac', num: V('a'), den: V('b') }, exp: V('x') },
  '2^(1/2)': { t: 'pow', base: N(2), exp: N(1, 2) },
  'sqrt(a)+b': { t: 'add', args: [{ t: 'root', index: 2, radicand: V('a') }, V('b')] },
  'sqrt(a+b)': { t: 'root', index: 2, radicand: { t: 'add', args: [V('a'), V('b')] } },
  '(a/b)/c': { t: 'frac', num: { t: 'frac', num: V('a'), den: V('b') }, den: V('x') },
  'a/(b/c)': { t: 'frac', num: V('a'), den: { t: 'frac', num: V('b'), den: V('x') } },
  '-(1/2)': { t: 'neg', arg: N(1, 2) },
  'x*(-3)': { t: 'mul', args: [V('x'), N(-3)] },
  'x*neg(y)': { t: 'mul', args: [V('x'), { t: 'neg', arg: V('y') }] },
  '2*3': { t: 'mul', args: [N(2), N(3)] },
  '2*(1/3)': { t: 'mul', args: [N(2), N(1, 3)] },
  'x^(-1/2)': { t: 'pow', base: V('x'), exp: N(-1, 2) },
  '(x^2)^3': { t: 'pow', base: { t: 'pow', base: V('x'), exp: N(2) }, exp: N(3) },
  'x^(2^3)': { t: 'pow', base: V('x'), exp: { t: 'pow', base: N(2), exp: N(3) } },
};
for (const [name, node] of Object.entries(HAND)) {
  test(`hand case ${name} reads back with the same value`, () => {
    assert.equal(checkNode(node, false), null, 'normal');
    assert.equal(checkNode(node, true), null, 'preview');
  });
}

for (const preview of [false, true]) {
  test(`50000 random ASTs read back with the same value (preview=${preview})`, () => {
    const R = rng(preview ? 9001 : 4242);
    const bad = [];
    for (let i = 0; i < 50000 && bad.length < 5; i++) {
      const node = gen(R, 1 + Math.floor(R() * 4));
      let res;
      try { res = checkNode(node, preview); } catch (e) { res = { err: e.message }; }
      if (res) bad.push({ node: JSON.stringify(node, (k, v) => (typeof v === 'bigint' ? Number(v) : v)), ...res });
    }
    assert.deepEqual(bad, []);
  });
}

test('equations read back side by side', () => {
  const R = rng(77);
  for (let i = 0; i < 5000; i++) {
    const eq = { t: 'eq', lhs: gen(R, 3), rhs: gen(R, 3) };
    const v = renderMath(eq);
    const [l, r] = v.children;
    const lt = readTokens(l); const rt = readTokens(r);
    assert.equal(rt[0].k, '=');
    for (const env of ENVS) {
      assert.ok(close(evalAst(eq.lhs, env), evalTokens(lt, env)));
      assert.ok(close(evalAst(eq.rhs, env), evalTokens(rt.slice(1), env)));
    }
  }
});

test('checker sensitivity: stripping parentheses or dots from the render is caught often', () => {
  const strip = (v, drop) => (typeof v === 'string' ? v.split('').filter((c) => !drop.includes(c)).join('')
    : { ...v, children: v.children.map((c) => strip(c, drop)) });
  const R = rng(5);
  let tried = 0; let caughtParen = 0; let finite = 0;
  for (let i = 0; i < 20000; i++) {
    const node = gen(R, 4);
    const v = renderMath(node);
    if (!JSON.stringify(v).includes('"("')) continue;
    tried++;
    const w = evalAst(node, ENVS[0]);
    if (Number.isFinite(w)) finite++;
    let got;
    try { got = evalTokens(readTokens(strip(v, '()')), ENVS[0]); } catch { caughtParen++; continue; }
    if (!close(w, got)) caughtParen++;
  }
  assert.ok(tried > 3000, `tried ${tried}`);
  assert.ok(finite / tried > 0.4, `finite ${finite}/${tried}`);
  assert.ok(caughtParen / tried > 0.25, `caught ${caughtParen}/${tried}`);
});

test('every node has exactly one data-path span and nodeAtPath maps it back (independent generator)', async () => {
  const { nodeAtPath } = await import('../../../src/render/mathdom.js');
  const R = rng(99);
  for (let i = 0; i < 5000; i++) {
    const node = gen(R, 4);
    const v = renderMath(node);
    const paths = [];
    const walk = (n) => { if (typeof n === 'string') return; if (n.attrs['data-path'] !== undefined) paths.push(n.attrs['data-path']); n.children.forEach(walk); };
    walk(v);
    let count = 0;
    const visit = (n, p) => {
      count++;
      assert.equal(paths.filter((q) => q === p).length, 1, `path ${p} in ${JSON.stringify(node, (k, x) => (typeof x === 'bigint' ? Number(x) : x))}`);
      assert.equal(nodeAtPath(node, p), n);
      const kids = n.t === 'add' || n.t === 'mul' ? n.args : n.t === 'neg' || n.t === 'group' ? [n.arg] : n.t === 'frac' ? [n.num, n.den] : n.t === 'pow' ? [n.base, n.exp] : n.t === 'root' ? [n.radicand] : [];
      kids.forEach((k, j) => visit(k, `${p}.${j}`));
    };
    visit(node, 'e');
    assert.equal(paths.length, count);
  }
});
