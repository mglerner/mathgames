// Per-item checks for the gen2 exponent / radical review (lens: answer keys,
// distractors and tags). Uses only ./_oracle.js for math; the generator's
// Problem is read as data. checkItem(p) -> [{ code, msg }].
import {
  F, Q, ev, tryEv, compare, envs, varsIn, radicalVars, radicands, walk, stripGroup as un,
  solveQuad, fromSurd, malReproduces, MAL, isSquarefree, gcd, Domain, Unsupported, BLANK,
} from './_oracle.js';

const isNode = (x) => x && typeof x === 'object' && typeof x.t === 'string' && x.t !== 'move';
const isEq = (x) => isNode(x) && x.t === 'eq';

/** Every displayed / keyed tree of an item. */
export function trees(p) {
  const out = [];
  const push = (where, x) => { if (isNode(x)) out.push([where, x]); };
  push('prompt', p.prompt.math); push('twin', p.prompt.twin);
  for (const c of p.choices ?? []) push(`choice ${c.id}`, c.display);
  for (const [i, s] of (p.steps ?? []).entries()) push(`step ${i}`, s.line);
  const ex = p.answer.expected;
  if (Array.isArray(ex)) ex.forEach((x, i) => push(`key ${i}`, x)); else push('key', ex);
  return out;
}

const varsOf = (x) => varsIn(x);
/** Variables that need a nonzero declaration: in a denominator, or a base with a power <= 0. */
function nonzeroVars(x) {
  const s = new Set();
  walk(x, (n) => {
    if (n.t === 'frac') for (const v of varsOf(n.den)) s.add(v);
    if (n.t === 'pow') {
      let e; try { const val = ev(n.exp, {}); e = F.isRational(val) ? F.rat(val) : undefined; } catch { e = undefined; }
      if (e && e.n <= 0n) for (const v of varsOf(n.base)) s.add(v);
    }
  });
  return s;
}

/** Probe point named by a goal: "... at x = 2", "at b = -1". */
export function goalPoint(goal) {
  const m = /at ([a-zA-Z]) = (-?\d+)(?:\/(\d+))?/.exec(goal ?? '');
  if (!m) return undefined;
  return { [m[1]]: F.q(Q(BigInt(m[2]), BigInt(m[3] ?? '1'))) };
}

const fstr = (v) => (v === undefined ? 'undefined' : F.str(v));

/** Value of a node at env, or a tag string on failure. */
function val(x, env) {
  try { return ev(x, env); } catch (e) { return e instanceof Domain ? 'DOMAIN' : 'UNSUPPORTED:' + e.message; }
}

/** Blank substituted with a value node. */
function fill(x, by) {
  if (x.t === 'var' && x.name === BLANK) return by;
  const o = { ...x };
  for (const k of ['arg', 'num', 'den', 'base', 'exp', 'radicand', 'lhs', 'rhs']) if (x[k]) o[k] = fill(x[k], by);
  if (x.args) o.args = x.args.map((a) => fill(a, by));
  return o;
}

/** Is the equation an identity over envs (both sides defined somewhere and equal everywhere both are)? */
function eqHolds(eqn, es) {
  const c = compare(eqn.lhs, eqn.rhs, es);
  return c.same;
}

/** Radicand / form checks on a key Node. */
function formIssues(key, preds) {
  const iss = [];
  const want = new Set(preds ?? []);
  walk(key, (n) => {
    if (n.t === 'root') {
      const r = un(n.radicand);
      if (r.t === 'num') {
        if (r.q.d !== 1n || !isSquarefree(r.q.n) || r.q.n === 1n) iss.push(`radicand ${r.q.n}/${r.q.d} not squarefree > 1`);
      } else if (want.has('radical-simplified') && varsOf(r).size === 0) iss.push('numeric radicand not a plain number');
    }
  });
  if (want.has('no-radical-in-denominator')) walk(key, (n) => { if (n.t === 'frac') walk(n.den, (m) => { if (m.t === 'root') iss.push('root in a denominator'); }); });
  if (want.has('no-radical')) walk(key, (n) => { if (n.t === 'root') iss.push('root in a no-radical key'); });
  if (want.has('lowest-terms')) {
    const u = un(key);
    if (u.t === 'frac') {
      // content of the numerator's integer coefficients and the denominator
      const d = un(u.den);
      if (d.t === 'num') {
        const coefs = [];
        const collect = (n) => {
          n = un(n);
          if (n.t === 'num') coefs.push(n.q.n);
          else if (n.t === 'neg') collect(n.arg);
          else if (n.t === 'add') n.args.forEach(collect);
          else if (n.t === 'mul') { const k = n.args.map(un).find((a) => a.t === 'num'); coefs.push(k ? k.q.n : 1n); }
          else coefs.push(1n);
        };
        collect(u.num);
        const g = coefs.reduce((a, b) => gcd(a, b), d.q.n);
        if (g > 1n) iss.push(`not in lowest terms (common factor ${g})`);
      }
    }
  }
  return iss;
}

/**
 * @param {any} p a generated Problem
 * @returns {{ code: string, msg: string }[]}
 */
export function checkItem(p) {
  const iss = [];
  const add = (code, msg) => iss.push({ code, msg });
  const as = [...(p.assumptions ?? []), ...(p.answer.assumptions ?? [])];
  const rel = Object.fromEntries(as.map((a) => [a.name, a.rel]));
  const goal = p.prompt.goal ?? '';
  const allTrees = trees(p);
  const vars = new Set();
  for (const [, x] of allTrees) for (const v of varsOf(x)) vars.add(v);
  const varKeysIsSolve = p.answer.kind === 'solution-set';
  const es = envs([...vars].filter((v) => !(varsIsSolve(p) && v === p.variableKeys?.[0])), as);
  function varsIsSolve(pp) { return pp.answer.kind === 'solution-set'; }

  // ---------------- declarations and radicands
  for (const [where, x] of allTrees) {
    for (const v of radicalVars(x)) {
      if (v === BLANK) continue;
      if (rel[v] !== 'nonneg' && rel[v] !== 'pos') add('undeclared-radical-var', `${where}: ${v} under a root / rational power without x >= 0 (${JSON.stringify(as)})`);
      else if (!new RegExp(`\\b${v} (>=|>|≥) 0`).test(goal)) add('declaration-not-printed', `${where}: ${v} ${rel[v]} declared but goal "${goal}" does not print it`);
    }
    for (const v of nonzeroVars(x)) {
      if (v === BLANK) continue;
      if (!['nonzero', 'pos'].includes(rel[v])) add('undeclared-nonzero-var', `${where}: ${v} in a denominator / power <= 0 without x != 0`);
      else if (!new RegExp(`\\b${v} (is not 0|>|!=|≠)`).test(goal)) add('nonzero-not-printed', `${where}: ${v} nonzero declared but goal "${goal}" does not print it`);
    }
    for (const r of radicands(x)) {
      if (varsOf(r).has(BLANK)) continue;
      const rv = varsOf(r);
      const pts = rv.size ? envs([...rv], as) : [{}];
      for (const e of pts) {
        const v = val(r, e);
        if (v === 'DOMAIN' || typeof v === 'string') continue;
        if (F.sign(v) < 0) { add('negative-radicand', `${where}: radicand ${fstr(v)} at ${JSON.stringify(Object.fromEntries(Object.entries(e).map(([k, z]) => [k, F.str(z)])))}`); break; }
      }
    }
  }

  const math = p.prompt.math;
  const key = p.answer.expected;
  const kind = p.answer.kind;

  // ---------------- answer key
  try {
    if (p.interaction === 'twin') checkTwin(p, es, add);
    else if (p.variant === 'hidden-1') checkWhy(p, es, add);
    else if (p.interaction === 'forge' && p.variant === 'which-power') checkWhichPower(p, add);
    else if (p.interaction === 'forge') checkForge(p, es, add);
    else if (kind === 'solution-set') {
      const v = p.variableKeys[0];
      const sol = solveQuad(math, v);
      if (sol === 'all') add('key-solve', 'equation is an identity');
      else {
        const want = key.kind === 'none' ? [] : key.kind === 'finite' ? key.roots.map(fromSurd) : 'all';
        const ok = Array.isArray(want) && want.length === sol.length && sol.every((s) => want.some((w) => F.eq(w, s)));
        if (!ok) add('key-solution-set', `oracle {${sol.map(fstr).join(', ')}} vs key ${JSON.stringify(key.kind === 'finite' ? want.map(fstr) : key.kind)}`);
      }
    } else if (kind === 'expr') {
      if (p.variant === 'fill-blank') {
        const filled = fill(math, key);
        if (!eqHolds(filled, es)) add('key-fill-blank', `blank = ${fstr(val(key, {}))} does not balance`);
      } else if (p.variant === 'lantern') {
        const pt = goalPoint(goal);
        if (!pt) add('key-lantern', 'no probe in goal');
        else if (!F.eq(ev(math, pt), ev(key, pt))) add('key-lantern', `value ${fstr(ev(math, pt))} vs key ${fstr(ev(key, pt))}`);
      } else {
        const c = compare(math, key, es);
        if (!c.same) add('key-expr', `key not equal to prompt (compared ${c.compared})`);
      }
      for (const f of formIssues(key, p.answer.formPredicates)) add('key-form', f);
    } else add('key-kind-unchecked', `${p.interaction} ${kind}`);
  } catch (e) {
    if (e instanceof Unsupported) add('oracle-unsupported', e.message); else throw e;
  }

  // ---------------- worked chain
  try { checkSteps(p, es, add); } catch (e) { if (e instanceof Unsupported) add('oracle-unsupported', 'steps: ' + e.message); else throw e; }
  return iss;
}

function checkTwin(p, es, add) {
  const a = p.prompt.math; const b = p.prompt.twin;
  const c = compare(a, b, es);
  const same = p.choices.find((x) => x.id === 'same'); const diff = p.choices.find((x) => x.id === 'different');
  if (!same || !diff) { add('twin-shape', 'missing same/different'); return; }
  const labelSame = same.verdict === 'correct';
  if (labelSame !== c.same) add('twin-label', `labelled ${labelSame ? 'Same' : 'Different'}; oracle ${c.same ? 'Same' : 'Different'}${c.witness ? ' witness ' + JSON.stringify(Object.fromEntries(Object.entries(c.witness).map(([k, v]) => [k, F.str(v)]))) : ''}`);
  if (c.same && c.onlyOne) add('twin-domain-mismatch', `Same pair defined on different domains (${c.onlyOne} probes)`);
  if (!c.same && !c.witness) add('twin-no-witness', 'Different but no witness');
  // the item's own probes (what the stepper / Lantern can show) must hold a witness
  const vs = new Set([...varsIn(a), ...varsIn(b)]);
  if (!c.same && vs.size) {
    const own = (p.probes ?? []).map((e) => Object.fromEntries(Object.entries(e).map(([k, q]) => [k, F.q(Q(q.n, q.d))])));
    const w = compare(a, b, own);
    if (!w.witness) add('twin-no-probe-witness', `Different, but none of the item's probes ${JSON.stringify((p.probes ?? []).map((e) => Object.fromEntries(Object.entries(e).map(([k, q]) => [k, `${q.n}/${q.d}`]))))} separates them`);
  }
  // tags
  for (const ch of [same, diff]) {
    if (!ch.malrule) continue;
    if (ch.malrule === 'form-change-changes-value') { if (!c.same) add('twin-tag', 'form-change tag on a Different pair'); continue; }
    if (ch.id !== 'same' || c.same) { add('twin-tag', `tag ${ch.malrule} on ${ch.id} of a ${c.same ? 'Same' : 'Different'} pair`); continue; }
    const r = malReproduces(ch.malrule, a, b, es) || malReproduces(ch.malrule, b, a, es);
    if (r === undefined) add('tag-unmodelled', ch.malrule);
    else if (!r) add('twin-tag-not-reproduced', `${ch.malrule} does not turn one form into the other`);
  }
  // follow-up key
  const kind = p.answer.kind; const key = p.answer.expected;
  const pt = goalPoint(p.prompt.goal) ?? {};
  const pv = Object.keys(pt);
  const twinVars = new Set([...varsIn(a), ...varsIn(b)]);
  if (twinVars.size && !pv.length && kind !== 'form-of-1') add('twin-key', 'variable pair with no probe named');
  for (const v of pv) {
    const x = F.rat(pt[v]);
    const r0 = (p.assumptions ?? []).find((q) => q.name === v)?.rel;
    const allowed = r0 === 'nonneg' || r0 === 'pos' ? ['2', '3', '5', '4', '9'] : ['2', '3', '-1', '5', '-2'];
    if (!allowed.includes(F.str(pt[v]))) add('twin-probe-not-in-set', `probe ${v} = ${F.str(pt[v])} (${r0 ?? 'undeclared'})`);
    if ((x.n === 0n || (x.n === x.d)) ) add('twin-probe-01', `probe ${v} = ${F.str(pt[v])}`);
    const r = (p.assumptions ?? []).find((q) => q.name === v)?.rel;
    if ((r === 'nonneg' || r === 'pos') && x.n < 0n) add('twin-probe-domain', `probe ${v} = ${F.str(pt[v])} violates ${r}`);
  }
  if (kind === 'expr') {
    const va = val(a, pt); const vk = val(key, {});
    if (typeof va === 'string' || typeof vk === 'string' || !F.eq(va, vk)) add('twin-key-value', `first form ${typeof va === 'string' ? va : F.str(va)} at ${JSON.stringify(pv)} vs key ${typeof vk === 'string' ? vk : F.str(vk)}`);
    if (c.same) { const vb = val(b, pt); if (typeof vb === 'string' || typeof va === 'string' || !F.eq(va, vb)) add('twin-key-value', 'Same pair differ at the named probe'); }
    if (!c.same && pv.length === 0) add('twin-key-kind', 'numeric Different pair keyed by one value');
  } else if (kind === 'tuple') {
    if (c.same) add('twin-key-kind', 'Same pair keyed by a tuple');
    const va = val(a, pt); const vb = val(b, pt);
    const [k0, k1] = key.map((k) => val(k, {}));
    const ok = [va, vb, k0, k1].every((z) => typeof z !== 'string') && F.eq(va, k0) && F.eq(vb, k1);
    if (!ok) add('twin-key-value', `tuple key (${[k0, k1].map((z) => (typeof z === 'string' ? z : F.str(z)))}) vs values (${[va, vb].map((z) => (typeof z === 'string' ? z : F.str(z)))})`);
  } else if (kind === 'form-of-1') {
    if (!c.same) add('twin-key-kind', 'Different pair keyed by a form of 1');
    const one = compare(key, { t: 'num', q: Q(1n) }, es);
    if (!one.same) add('twin-key-value', 'form-of-1 key not worth 1');
    // the coin must actually JOIN the forms: with a = N/D, b = N'/D' and coin c/c,
    // N c / N' must be one constant (no variable left), rational (no root left).
    checkJoin(a, b, key, es, add);
  } else add('twin-key-kind', `unexpected kind ${kind}`);
}

function parts(x) { x = un(x); return x.t === 'frac' ? [x.num, x.den] : [x, { t: 'num', q: Q(1n) }]; }
function checkJoin(a, b, coin, es, add) {
  const [c] = parts(coin);
  // either direction: a x coin -> b, or b x coin -> a
  const tryDir = (from, to) => {
    const [n1] = parts(from); const [n2] = parts(to);
    let r0;
    for (const e of es) {
      const v1 = tryEv(n1, e); const v2 = tryEv(n2, e); const vc = tryEv(c, e);
      if (!v1 || !v2 || !vc || F.isZero(v2)) continue;
      const r = F.mul(F.mul(v1, vc), F.inv(v2));
      if (!F.isRational(r)) return false;
      if (r0 && !F.eq(r, r0)) return false;
      r0 = r;
    }
    return r0 !== undefined;
  };
  if (!tryDir(a, b) && !tryDir(b, a)) add('twin-coin-does-not-join', 'the keyed form of 1 does not turn one form into the other');
}

function checkWhy(p, es, add) {
  const m = /still (-?\d+)(?:\/(\d+))?\./.exec(p.prompt.goal ?? '');
  if (m) {
    const want = F.q(Q(BigInt(m[1]), BigInt(m[2] ?? '1')));
    const c = compare(p.prompt.math, { t: 'num', q: want.size ? [...want.values()][0] : Q(0n) }, es);
    if (!c.same) add('why-goal-value', `goal says still ${m[1]}${m[2] ? '/' + m[2] : ''}, product differs`);
  }
  const correct = p.choices.filter((c) => c.verdict === 'correct');
  if (correct.length !== 1) add('why-count', `${correct.length} correct targets`);
  for (const c of p.choices) {
    const one = compare(c.display, { t: 'num', q: Q(1n) }, es);
    if (c.verdict === 'correct' && !one.same) add('why-key', `correct target ${c.id} not worth 1`);
    if (c.verdict === 'correct' && one.onlyOne) add('why-key-domain', `correct target ${c.id} undefined at some allowed probe`);
    if (c.verdict !== 'correct' && one.same) add('why-wrong-is-1', `wrong target ${c.id} IS worth 1`);
  }
}

function checkWhichPower(p, add) {
  const eqn = p.prompt.math;
  for (const c of p.choices ?? []) {
    const holds = eqHolds(fill(eqn, c.display), [{}]);
    if (holds !== (c.verdict === 'correct')) add('forge-power-label', `option ${fstr(val(c.display, {}))} labelled ${c.verdict}, holds=${holds}`);
  }
  if (!eqHolds(fill(eqn, p.answer.expected), [{}])) add('forge-power-key', 'key does not balance');
}

function checkForge(p, es, add) {
  const math = un(p.prompt.math);
  const denOf = (x) => { x = un(x); return x.t === 'frac' ? x.den : { t: 'num', q: Q(1n) }; };
  const coinNum = (x) => { x = un(x); return x.t === 'frac' ? x.num : x; };
  const judgeCoin = (coin) => {
    const v = val(coin, {});
    if (typeof v === 'string') return 'undefined';
    if (!F.eq(v, F.int(1n))) return 'wrong';
    const prod = F.mul(ev(denOf(math), {}), ev(denOf(coin), {}));
    return F.isRational(prod) ? 'correct' : 'legal-idle';
  };
  const key = p.answer.expected;
  if (judgeCoin(key) !== 'correct') add('forge-key', `key coin judged ${judgeCoin(key)}`);
  for (const c of p.choices ?? []) {
    const j = judgeCoin(c.display);
    if (j !== c.verdict) add('forge-label', `option ${c.id} labelled ${c.verdict}, oracle ${j}`);
    if (c.malrule === 'one-part-coin') {
      // a half of the KEY coin: numerator over 1, or 1 over denominator
      const v = val(c.display, {});
      const top = ev(coinNum(key), {}); const bot = F.inv(ev(denOf(key), {}));
      if (typeof v === 'string' || !(F.eq(v, top) || F.eq(v, bot))) add('forge-tag-not-reproduced', `option ${c.id} is not half of the key coin`);
    } else if (c.malrule) add('tag-unmodelled', c.malrule);
  }
}

function checkSteps(p, es, add) {
  const steps = p.steps ?? [];
  if (!steps.length) return;
  const first = steps[0].line;
  if (isEq(first)) {
    if (p.variableKeys?.length !== 1) return;
    const v = p.variableKeys[0];
    const base = solveQuad(first, v);
    for (const [i, s] of steps.entries()) {
      if (!isEq(s.line)) { add('steps-mixed', `step ${i} not an equation`); continue; }
      const sol = solveQuad(s.line, v);
      const same = base === 'all' ? sol === 'all' : sol !== 'all' && sol.length === base.length && sol.every((x) => base.some((y) => F.eq(x, y)));
      if (s.legal && !same) add('steps-legal-changes', `step ${i} changes the solution set`);
      if (!s.legal && same) add('steps-bad-keeps', `bad step ${i} keeps the solution set`);
    }
    // start line must be the prompt
    const ps = solveQuad(p.prompt.math, v);
    const same0 = ps !== 'all' && base !== 'all' && ps.length === base.length && ps.every((x) => base.some((y) => F.eq(x, y)));
    if (!same0) add('steps-start', 'chain does not start from the prompt');
    return;
  }
  if (p.variant !== 'hidden-1' && p.variant !== 'fill-blank' && p.variant !== 'which-power' && p.interaction !== 'forge') {
    const s0 = compare(first, p.prompt.math, es); const s1 = p.prompt.twin ? compare(first, p.prompt.twin, es) : { same: false };
    // a Different twin's chain may start at the false twin; it must then be that tree, not a third value
    if (!s0.same && !s1.same) add('steps-start', 'chain starts at neither form');
  }
  for (const [i, s] of steps.entries()) {
    if (isEq(s.line)) { add('steps-mixed', `step ${i} is an equation`); continue; }
    const c = compare(first, s.line, es);
    if (s.legal && !c.same) add('steps-legal-changes', `step ${i} changes the value`);
    if (!s.legal && c.same) add('steps-bad-keeps', `bad step ${i} keeps the value`);
  }
}
