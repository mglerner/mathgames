// Per-item independent checks (adversarial review, M1b). checkProblem(p)
// returns a list of { code, msg } issues; [] means every key, label and
// display the oracle could re-derive holds. Uses only ./_oracle.js plus
// print() for building messages.
import { print } from '../../../src/math/print.js';
import {
  Q, ev, sQ, sEq, sToQ, sIsRational, sStr, sameValue, toRF, rfIsZero, rfSub, solveEq, sameSet, setFromWire, setStr,
  applyMove, sidewise, isEq, isMoveObj, goalProbe, nodeAt, deepEq, hasVar, walk, qeq, qstr, ZERO, ONE, OracleError, sMul, sAdd, sNeg,
  pEval, gcd, hasRoot,
} from './_oracle.js';

export const PROBE_SET = ['2', '3', '-1', '5', '-2'];
const P = (x) => { try { return isMoveObj(x) ? `${x.op} ${x.operand ? print(x.operand) : ''}` : print(x); } catch { return JSON.stringify(x); } };

function blankToVar(n) { // replace var '_' by var 'u'
  if (!n || typeof n !== 'object') return n;
  if (n.t === 'var' && n.name === '_') return { t: 'var', name: 'u' };
  const out = { ...n };
  for (const k of ['args', 'arg', 'num', 'den', 'base', 'exp', 'radicand', 'lhs', 'rhs']) {
    if (!n[k]) continue;
    out[k] = Array.isArray(n[k]) ? n[k].map(blankToVar) : blankToVar(n[k]);
  }
  return out;
}
/** Solve for the blank: f(u, x) = L - R must vanish for every x (or numerically). */
function solveBlank(eq) {
  const e = blankToVar(eq);
  const f = (u, x) => { const env = { u, x }; return sAdd(ev(e.lhs, env), sNeg(ev(e.rhs, env))); };
  const xs = [Q(2), Q(3), Q(-1), Q(7), Q(5, 3)];
  const f0 = sToQ(f(ZERO, xs[0])), f1 = sToQ(f(ONE, xs[0]));
  if (!f0 || !f1) throw new OracleError('blank: irrational');
  const slope = Q(f1.n * f0.d - f0.n * f1.d, f0.d * f1.d);
  if (slope.n === 0n) return undefined;
  const u = Q(-f0.n * slope.d, f0.d * slope.n);
  for (const x of xs) if (!sEq(f(u, x), sQ(ZERO))) return { u, identity: false };
  return { u, identity: true };
}
const val = (n, env) => ev(n, env ?? {});
const isNumeric = (n) => !hasVar(n);
/** value equality, numeric or as rational functions in x. */
function same(a, b) { return sameValue(a, b, 'x'); }

function isZeroSide(n) { try { return rfIsZero(toRF(n)); } catch { return false; } }
function isSolvedLine(eq) { // x = c or c = x
  const xOnly = (n) => { try { const r = toRF(n); return r.n.length === 2 && qz0(r.n[0]) && r.d.length === 1 && qeq(r.n[1], r.d[0]); } catch { return false; } };
  const konst = (n) => { try { const r = toRF(n); return r.n.length <= 1 && r.d.length === 1; } catch { return false; } };
  return (xOnly(eq.lhs) && konst(eq.rhs)) || (xOnly(eq.rhs) && konst(eq.lhs));
}
const qz0 = (q) => q.n === 0n;

export function checkProblem(p) {
  const issues = [];
  const bad = (code, msg) => issues.push({ code, msg });
  const m = p.prompt.math;
  const a = p.answer;
  const it = p.interaction;
  const goal = p.prompt.goal ?? '';
  try {
    // ---------------- probes, radicands
    for (const env of p.probes ?? []) for (const [k, v] of Object.entries(env)) {
      const s = qstr(Q(BigInt(v.n), BigInt(v.d)));
      if (s === '0' || s === '1') bad('probe-01', `probe ${k}=${s}`);
      else if (!PROBE_SET.includes(s)) bad('probe-not-in-set', `probe ${k}=${s}`);
    }
    const gp = goalProbe(goal);
    if (gp && (qstr(gp) === '0' || qstr(gp) === '1')) bad('goal-probe-01', goal);
    if (gp && !PROBE_SET.includes(qstr(gp))) bad('goal-probe-not-in-set', goal);
    const trees = [m, p.prompt.twin, a.kind !== 'solution-set' ? a.expected : undefined, ...(p.choices ?? []).map((c) => c.display), ...(p.steps ?? []).map((s) => s.line)];
    for (const t of trees) {
      if (!t || isMoveObj(t)) continue;
      const list = Array.isArray(t) ? t : [t];
      for (const tt of list) walk(tt, (n) => {
        if (n.t !== 'root') return;
        if (!hasVar(n.radicand)) { const v = sToQ(val(n.radicand)); if (v && v.n < 0n) bad('negative-radicand', P(tt)); }
        else for (const x of [Q(2), Q(3), Q(-1), Q(5), Q(-2)]) { try { const v = sToQ(val(n.radicand, { x })); if (v && v.n < 0n) bad('negative-radicand-at-probe', P(tt)); } catch {} }
      });
    }

    // ---------------- answer key
    if (it === 'why') checkWhy(p, bad);
    else if (it === 'twin') checkTwin(p, bad);
    else if (a.kind === 'solution-set') {
      const want = solveEq(m);
      const got = setFromWire(a.expected);
      if (!want) bad('oracle-cannot-solve', P(m));
      else if (!sameSet(want, got)) bad('key-wrong-solution-set', `${P(m)}: key ${setStr(got)} oracle ${setStr(want)}`);
      if (want && want.kind === 'finite' && p.variant !== 'one-way') for (const r of want.roots) {
        const q = sToQ(r); if (q && (qstr(q) === '0' || qstr(q) === '1')) bad('solution-01', `${P(m)} root ${qstr(q)}`);
      }
      if (it === 'cast') checkCast(p, bad, want);
      if (it === 'trace') checkTrace(p, bad, want);
    } else if (a.kind === 'equation-sides') {
      const want = applyMove(p.prompt.move, m);
      if (!sidewise(a.expected, want)) bad('key-wrong-sides', `${P(m)} ${P(p.prompt.move)}: key ${P(a.expected)}`);
      checkMoveText(p, bad);
      for (const c of p.choices ?? []) {
        const ok = sidewise(c.display, want);
        if (c.verdict === 'correct' && !ok) bad('choice-correct-but-wrong', `${P(m)} ${P(p.prompt.move)}: ${P(c.display)}`);
        if (c.verdict === 'wrong' && ok) bad('choice-wrong-but-correct', `${P(m)} ${P(p.prompt.move)}: ${P(c.display)}`);
      }
    } else if (a.kind === 'tuple') checkTuple(p, bad);
    else if (a.kind === 'form-of-1' || a.kind === 'form-of-0') checkForge(p, bad);
    else if (a.kind === 'expr') checkExpr(p, bad);
    else bad('unhandled-kind', a.kind);
  } catch (e) {
    if (e instanceof OracleError) bad('oracle-error', `${e.message} on ${P(m)}`);
    else throw e;
  }
  return issues;
}

function checkMoveText(p, bad) {
  const mv = p.prompt.move; const goal = p.prompt.goal ?? '';
  const t = print(mv.operand);
  const word = { add: 'Add', sub: 'Subtract', div: 'Divide', mul: 'Multiply' }[mv.op];
  if (!goal.startsWith(word)) bad('move-text-op', `${goal} vs ${mv.op}`);
  if (!goal.includes(t) && !goal.includes(`(${t})`)) bad('move-text-operand', `${goal} vs ${t}`);
}

function checkExpr(p, bad) {
  const m = p.prompt.math; const a = p.answer; const goal = p.prompt.goal ?? '';
  const key = a.expected;
  let want; // a Node or a surd value the key must equal
  if (p.prompt.verb === 'Lantern') {
    const x = goalProbe(goal);
    const v = val(m, { x });
    if (!sEq(val(key), v)) bad('key-wrong-lantern', `${print(m)} at x=${qstr(x)}: key ${print(key)} oracle ${sStr(v)}`);
    const q = sToQ(v); if (q && (qstr(q) === '0' || qstr(q) === '1')) bad('lantern-key-01', print(m));
    return;
  }
  if (p.variant === 'whole-as-fraction') {
    const n = Q(BigInt(/Write (-?\d+) as/.exec(goal)[1]));
    if (!sEq(val(key), sQ(n))) bad('key-wrong-forge-whole', `${goal}: key ${print(key)}`);
    if (!(key.t === 'frac')) bad('key-not-fraction', print(key));
    // the whole number really is a factor of the prompt
    const facs = m.t === 'mul' ? m.args : [];
    if (!facs.some((f) => sEq(val(f), sQ(n)))) bad('forge-whole-not-in-prompt', `${print(m)} / ${goal}`);
    for (const c of p.choices ?? []) {
      const ok = sEq(val(c.display), sQ(n)) && c.display.t === 'frac';
      if (c.verdict === 'correct' && !ok) bad('choice-correct-but-wrong', `${goal}: ${print(c.display)}`);
      if (c.verdict === 'wrong' && sEq(val(c.display), sQ(n))) bad('choice-wrong-but-correct', `${goal}: ${print(c.display)}`);
    }
    return;
  }
  if (p.variant === 'root-pair') {
    // sqrt(_) sqrt(_) = n : the blank b satisfies b = n (b >= 0)
    const n = val(m.rhs);
    if (!sEq(val(key), n)) bad('key-wrong-root-pair', `${print(m)}: key ${print(key)}`);
    for (const c of p.choices ?? []) {
      const v = val(c.display); const q = sToQ(v);
      const ok = q && q.n >= 0n && sEq(v, n);
      if (c.verdict === 'correct' && !ok) bad('choice-correct-but-wrong', `${print(m)}: ${print(c.display)}`);
      if (c.verdict === 'wrong' && ok) bad('choice-wrong-but-correct', `${print(m)}: ${print(c.display)}`);
    }
    return;
  }
  if (p.variant === 'fill-blank') {
    const r = solveBlank(m);
    if (!r) { bad('blank-unsolvable', print(m)); return; }
    if (!r.identity) bad('blank-not-identity', `${print(m)}: u=${qstr(r.u)} does not balance for every x`);
    if (!sEq(val(key), sQ(r.u))) bad('key-wrong-blank', `${print(m)}: key ${print(key)} oracle ${qstr(r.u)}`);
    if (qstr(r.u) === '0' || qstr(r.u) === '1') bad('blank-key-01', print(m));
    return;
  }
  // plain value
  if (!same(key, m)) bad('key-wrong-value', `${print(m)}: key ${print(key)}`);
  const dm = /denominator (\d+)/.exec(goal);
  const fp = a.formPredicates;
  const denPred = fp.find((f) => f.startsWith('denominator:'));
  const D = dm ? dm[1] : denPred ? denPred.split(':')[1] : undefined;
  if (D) {
    if (key.t !== 'frac' || !sEq(val(key.den), sQ(Q(BigInt(D))))) bad('key-wrong-denominator', `${print(m)} den ${D}: key ${print(key)}`);
  }
  if (fp.includes('lowest-terms') && !hasVar(key) && !hasRoot(key)) {
    const q = sToQ(val(key));
    if (key.t === 'frac' && key.num.t === 'num' && key.den.t === 'num') {
      if (gcd(BigInt(key.num.q.n), BigInt(key.den.q.n)) !== 1n || BigInt(key.den.q.n) === 1n) bad('key-not-lowest', print(key));
    }
    if (q && q.d === 1n && key.t === 'frac') bad('key-not-lowest', print(key));
  }
  if (fp.includes('integer')) { const q = sToQ(val(key)); if (!q || q.d !== 1n) bad('key-not-integer', print(key)); }
  for (const c of p.choices ?? []) {
    const ok = same(c.display, m);
    if (c.verdict === 'correct' && !ok) bad('choice-correct-but-wrong', `${print(m)}: ${print(c.display)}`);
    if (c.verdict === 'wrong' && ok) bad('choice-wrong-same-value', `${print(m)}: ${print(c.display)}`);
  }
}

function checkForge(p, bad) {
  const m = p.prompt.math; const a = p.answer; const goal = p.prompt.goal ?? '';
  const target = a.kind === 'form-of-1' ? ONE : ZERO;
  const reaches = (coin) => {
    if (a.kind === 'form-of-1') {
      const dm = /denominator (\d+)/.exec(goal);
      if (dm) {
        if (m.t !== 'frac' || coin.t !== 'frac') return false;
        return sEq(sMul(val(m.den), val(coin.den)), sQ(Q(BigInt(dm[1]))));
      }
      if (/No root in the denominator/.test(goal)) {
        if (m.t !== 'frac' || coin.t !== 'frac') return false;
        return sIsRational(sMul(val(m.den), val(coin.den)));
      }
      throw new OracleError('forge goal ' + goal);
    }
    const gm = /Make x ([+-]) (\d+) appear/.exec(goal);
    if (!gm) throw new OracleError('forge0 goal ' + goal);
    const T = Q(BigInt(gm[2]) * (gm[1] === '-' ? -1n : 1n));
    // m is x + c ; coin is g - g (add [g, neg g]) or (-g + g); added term g: the first summand
    const c = sToQ(ev(m, { x: ZERO }));
    if (coin.t !== 'add' || coin.args.length !== 2) return false;
    const g = sToQ(val(coin.args[0]));
    return qeq(Q(c.n * g.d + g.n * c.d, c.d * g.d), T);
  };
  const isTarget = (n) => { try { return sEq(val(n), sQ(target)); } catch { return false; } };
  if (!isTarget(a.expected)) bad('forge-key-not-1-0', `${print(m)} ${goal}: ${print(a.expected)}`);
  else if (!reaches(a.expected)) bad('forge-key-misses-goal', `${print(m)} ${goal}: ${print(a.expected)}`);
  for (const c of p.choices ?? []) {
    const t = isTarget(c.display);
    const r = t && reaches(c.display);
    const want = r ? 'correct' : t ? 'legal-idle' : 'wrong';
    if (c.verdict !== want) bad('forge-choice-label', `${print(m)} ${goal}: ${print(c.display)} labelled ${c.verdict}, oracle ${want}`);
  }
}

function checkTuple(p, bad) {
  const m = p.prompt.math; const a = p.answer; const goal = p.prompt.goal ?? '';
  const key = a.expected.map((n) => sToQ(val(n)));
  if (p.variant === 'read-abc') {
    const f = rfSub(toRF(m.lhs), toRF(m.rhs));
    if (f.d.length !== 1 || f.n.length !== 3) { bad('read-abc-not-quadratic', print(m)); return; }
    const cs = [f.n[2], f.n[1], f.n[0]].map((c) => Q(c.n * f.d[0].d, c.d * f.d[0].n));
    // key = k cs, k != 0
    const k = Q(key[0].n * cs[0].d, key[0].d * cs[0].n);
    const ok = k.n !== 0n && cs.every((c, i) => qeq(Q(c.n * k.n, c.d * k.d), key[i]));
    if (!ok) bad('key-wrong-abc', `${print(m)}: key ${key.map(qstr)} oracle ${cs.map(qstr)}`);
    if (!qeq(k, ONE) && !qeq(k, Q(-1))) bad('key-abc-scaled', `${print(m)}: k=${qstr(k)}`);
    return;
  }
  if (p.prompt.verb === 'Check') {
    const x = goalProbe(goal);
    const L = sToQ(val(m.lhs, { x })), R = sToQ(val(m.rhs, { x }));
    if (!qeq(L, key[0]) || !qeq(R, key[1])) bad('key-wrong-check', `${print(m)} x=${qstr(x)}: key ${key.map(qstr)} oracle ${qstr(L)},${qstr(R)}`);
    return;
  }
  bad('unhandled-tuple', `${p.prompt.verb} ${print(m)}`);
}

function checkTwin(p, bad) {
  const m = p.prompt.math; const t = p.prompt.twin; const a = p.answer; const goal = p.prompt.goal ?? '';
  const eqv = same(m, t);
  const sameC = p.choices.find((c) => c.id === 'same'); const diffC = p.choices.find((c) => c.id === 'different');
  if (!sameC || !diffC) { bad('twin-choices', JSON.stringify(p.choices.map((c) => c.id))); return; }
  if ((sameC.verdict === 'correct') !== eqv) bad('twin-label-wrong', `${print(m)} vs ${print(t)}: oracle ${eqv ? 'same' : 'different'}, labelled same=${sameC.verdict}`);
  if ((diffC.verdict === 'correct') === eqv) bad('twin-label-wrong', `${print(m)} vs ${print(t)}: different=${diffC.verdict}`);
  const variable = hasVar(m) || hasVar(t);
  const gx = goalProbe(goal);
  // (fixer edit, findings 8 / 9 of both reviews) A Same pair joined by a form of 1 is now keyed
  // by that form of 1 (answer kind 'form-of-1', section 3 I5), not by the common value; such an
  // item names no probe. The oracle checks the coin independently: it is a k/k-shaped fraction
  // worth exactly 1, and multiplying the first form by it, part by part, gives the second form.
  const coinKey = eqv && a.kind === 'form-of-1';
  if (variable && !gx && !coinKey) bad('twin-no-goal-probe', `${print(m)} vs ${print(t)}`);
  if (!variable && gx) bad('twin-numeric-with-probe', goal);
  if (coinKey) {
    const e = a.expected;
    const times = (x, y) => ({ t: 'mul', args: [x, y] });
    if (!e || e.t !== 'frac' || hasVar(e) || !deepEq(e.num, e.den) || !sEq(val(e), sQ(ONE))) bad('twin-coin-not-a-form-of-1', `${print(m)} vs ${print(t)}: key ${e ? print(e) : e}`);
    else if (m.t !== 'frac') bad('twin-coin-on-non-fraction', print(m));
    else {
      // part by part (3/4 x 5/5 = 15/20); or, when the second form was reduced afterwards
      // (5/sqrt(10) x sqrt(10)/sqrt(10) = 5sqrt(10)/10 = sqrt(10)/2), the coin must at least do
      // its job: the product's denominator is a rational number and the value is the second form's.
      const direct = t.t === 'frac' && same(times(m.num, e.num), t.num) && same(times(m.den, e.den), t.den);
      const cleared = !hasVar(m) && !/sqrt/.test(sStr(val(times(m.den, e.den)))) && /sqrt/.test(sStr(val(m.den)))
        && same({ t: 'frac', num: times(m.num, e.num), den: times(m.den, e.den) }, t);
      if (!direct && !cleared) bad('twin-coin-does-not-connect', `${print(m)} x ${print(e)} is not ${print(t)}`);
    }
  } else if (eqv) {
    // a real identity: exact rational-function identity, or exact surd equality (sameValue). Also degree+1 point check.
    if (a.kind !== 'expr') bad('twin-same-key-kind', a.kind);
    const v = variable ? val(m, { x: gx }) : val(m);
    if (!sEq(val(a.expected), v)) bad('twin-same-key-wrong', `${print(m)} vs ${print(t)} goal ${goal}: key ${print(a.expected)} oracle ${sStr(v)}`);
  } else {
    if (variable) {
      const wit = PROBE_SET.filter((s) => { const [n, d] = s.split('/'); const x = Q(BigInt(n), BigInt(d ?? 1)); try { return !sEq(val(m, { x }), val(t, { x })); } catch { return true; } });
      if (wit.length === 0) bad('twin-diff-no-probe-witness', `${print(m)} vs ${print(t)}`);
      if (gx && !wit.includes(qstr(gx))) bad('twin-diff-goal-probe-not-witness', `${print(m)} vs ${print(t)} at ${qstr(gx)}`);
      const v = val(m, { x: gx });
      if (a.kind === 'expr') { if (!sEq(val(a.expected), v)) bad('twin-diff-key-wrong', `${print(m)} vs ${print(t)} ${goal}: key ${print(a.expected)} oracle ${sStr(v)}`); }
      else bad('twin-diff-key-kind', a.kind);
    } else {
      if (a.kind !== 'tuple') { bad('twin-diff-key-kind', a.kind); return; }
      const [k1, k2] = a.expected.map(val);
      if (!sEq(k1, val(m)) || !sEq(k2, val(t))) bad('twin-diff-key-wrong', `${print(m)} vs ${print(t)}: key ${a.expected.map(print)}`);
    }
  }
  // the displays are the two forms
  if (!deepEq(sameC.display, m) && !deepEq(sameC.display, t)) bad('twin-display', print(sameC.display));
}

function checkWhy(p, bad) {
  const m = p.prompt.math; const want = p.variant === 'hidden-1' ? ONE : p.variant === 'hidden-0' ? ZERO : undefined;
  if (!want) { bad('why-variant', String(p.variant)); return; }
  const worth = (n) => { try { if (!hasVar(n)) return sEq(val(n), sQ(want)); const r = toRF(n); return want === ZERO ? rfIsZero(r) : rfIsZero(rfSub(r, toRF({ t: 'num', q: ONE }))); } catch { return false; } };
  let correct = 0;
  for (const c of p.choices) {
    const n = nodeAt(m, c.id);
    if (!n || !deepEq(n, c.display)) bad('why-path-mismatch', `${c.id} in ${print(m)}`);
    if (c.verdict === 'correct') { correct++; if (!worth(c.display)) bad('why-correct-not-worth', `${print(m)}: ${print(c.display)} is not ${qstr(want)}`); }
    else if (worth(c.display)) bad('why-wrong-target-also-worth', `${print(m)}: wrong target ${c.id} "${print(c.display)}" is also worth ${qstr(want)} (goal: ${p.prompt.goal})`);
  }
  if (correct !== 1) bad('why-correct-count', `${correct}`);
}

function castGoal(p) {
  const quad = /one side 0/.test(p.prompt.goal ?? '') || p.variant === 'one-way';
  return (cur) => {
    const noX = (() => { try { const f = rfSub(toRF(cur.lhs), toRF(cur.rhs)); return f.n.length <= 1 && f.d.length <= 1; } catch { return false; } })();
    return quad ? isZeroSide(cur.lhs) || isZeroSide(cur.rhs) : isSolvedLine(cur) || noX;
  };
}
function checkCast(p, bad, orig) {
  const m = p.prompt.math;
  const isGoal = castGoal(p);
  let progress = 0;
  for (const c of p.choices) {
    const mv = c.display;
    if (!isMoveObj(mv)) { bad('cast-display', JSON.stringify(c.display)); continue; }
    const varOp = (mv.op === 'mul' || mv.op === 'div') && mv.operand && hasVar(mv.operand);
    const after = applyMove(mv, m);
    let s;
    try { s = solveEq(after); } catch (e) { if (!(e instanceof OracleError)) throw e; }
    let want;
    if (varOp) want = 'risky';
    else if (!s) { bad('cast-oracle-cannot', `${print(m)} ${P(mv)}`); continue; }
    else want = sameSet(s, orig) ? 'legal' : 'illegal';
    const got = c.verdict === 'progress' || c.verdict === 'legal-idle' ? 'legal' : c.verdict;
    if (got !== want) bad('cast-verdict', `${print(m)} chip ${P(mv)}: ${c.verdict}, oracle ${want} (${setStr(orig)} -> ${setStr(s)})`);
    if (c.verdict === 'progress' && c.distance === 0 && !isGoal(after)) bad('cast-distance0-not-goal', `${print(m)} ${P(mv)}`);
    if ((c.verdict === 'progress' || c.verdict === 'legal-idle') && c.distance > 0 && isGoal(after)) bad('cast-reaches-goal-but-distance', `${print(m)} ${P(mv)} d=${c.distance}`);
    if (c.verdict === 'progress') { progress++; if (!(c.distance < p.moveGraph.distance)) bad('cast-progress-no-closer', `${P(mv)} d=${c.distance} vs ${p.moveGraph.distance}`); }
    if (c.verdict === 'legal-idle' && c.distance !== undefined && c.distance < p.moveGraph.distance) bad('cast-idle-but-closer', `${P(mv)}`);
    if (c.malrule === 'divide-by-variable-loses-root') {
      if (sameSet(s, orig)) bad('cast-lostroot-no-change', `${print(m)} ${P(mv)}`);
    }
    if (varOp && p.variant === 'one-way' && s && !sameSet(s, orig) && c.malrule !== 'divide-by-variable-loses-root') bad('cast-oneway-untagged', `${print(m)} ${P(mv)}`);
  }
  if (progress < 1) bad('cast-no-progress', print(m));
  // minPath replays legally to the goal in `distance` moves
  const g = p.moveGraph;
  if (g) {
    if (g.minPath.length !== g.distance) bad('cast-minpath-length', `${g.minPath.length} vs ${g.distance}`);
    let cur = m;
    for (const mv of g.minPath) {
      const nxt = applyMove(mv, cur);
      const s = solveEq(nxt);
      if (!sameSet(s, orig)) bad('cast-minpath-illegal', `${print(m)} step ${P(mv)}`);
      cur = nxt;
    }
    if (!isGoal(cur)) bad('cast-minpath-not-goal', `${print(m)} via ${g.minPath.map(P).join(', ')}`);
  }
}

function checkTrace(p, bad, orig) {
  const st = p.steps ?? [];
  if (!st.length) { bad('trace-no-steps', ''); return; }
  if (!deepEq(st[0].line, p.prompt.math)) bad('trace-first-line', `${print(st[0].line)} vs ${print(p.prompt.math)}`);
  if (st.length < 3 || st.length > 5) bad('trace-length', `${st.length}`);
  let firstBad = -1; let firstChange = -1; let nBad = 0;
  let prevSet = orig;
  for (let i = 1; i < st.length; i++) {
    const s = solveEq(st[i].line);
    if (!s) { bad('trace-oracle-cannot', print(st[i].line)); return; }
    const follows = sameSet(s, prevSet);
    if (st[i].legal && !follows) bad('trace-legal-line-changes-set', `L${i} ${print(st[i].line)} ${setStr(prevSet)} -> ${setStr(s)}`);
    if (!st[i].legal) { nBad++; if (firstBad < 0) firstBad = i; if (follows) bad('trace-bad-line-keeps-set', `L${i} ${print(st[i - 1].line)} -> ${print(st[i].line)}`); }
    if (firstChange < 0 && !sameSet(s, orig)) firstChange = i;
    // a stated move: a legal line is that move's result (side-wise), a bad line is NOT
    if (st[i].move) {
      const want = applyMove(st[i].move, st[i - 1].line);
      const sw = sidewise(st[i].line, want);
      if (st[i].legal && !sw) bad('trace-legal-not-stated-move', `L${i} ${print(st[i - 1].line)} ${P(st[i].move)} -> ${print(st[i].line)}`);
      if (!st[i].legal && sw) bad('trace-bad-is-stated-move', `L${i}`);
    } else if (st[i].legal) {
      // no move given: must be an identity rewrite of each side
      if (!sidewise(st[i].line, st[i - 1].line)) {
        // allowed only if solution set is unchanged (already checked)
      }
    }
    if (st[i].malrule && st[i].legal) bad('trace-legal-with-tag', `L${i}`);
    prevSet = s;
  }
  if (nBad > 1) bad('trace-two-bad', `${nBad}`);
  if (firstBad !== firstChange) bad('trace-first-bad-vs-first-change', `${firstBad} vs ${firstChange}`);
  const correct = p.choices.filter((c) => c.verdict === 'correct').map((c) => c.id);
  const want = firstChange < 0 ? 'none' : `L${firstChange}`;
  if (correct.length !== 1 || correct[0] !== want) bad('trace-key', `${correct} vs oracle ${want}`);
  for (const c of p.choices) if (c.id !== 'none') { const i = Number(c.id.slice(1)); if (!deepEq(c.display, st[i]?.line)) bad('trace-choice-display', c.id); }
  // the final line's solution: planted chains land on a wrong root; flag 0/1 there
  const last = solveEq(st[st.length - 1].line);
  if (last && last.kind === 'finite') for (const r of last.roots) { const q = sToQ(r); if (q && (qstr(q) === '0' || qstr(q) === '1') && firstChange >= 0) bad('trace-wrong-root-01', `${print(p.prompt.math)} ... ${print(st[st.length - 1].line)}`); }
}
