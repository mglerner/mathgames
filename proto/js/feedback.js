// @ts-check
// Four-beat feedback, as plain data (DOM-free):
//  1. line: names the move, <= 15 words (math segments count as one word each)
//  2. instrument: Lantern (expressions: exact values + "about" decimals) or Scale (equations:
//     both sides at a true solution)
//  3. why: one sentence plus a representation spec
//  4. echo: set by the run when a miss queues a fresh sibling
import { num, frac, root, times, mul, astEq, eq as eqNode, v } from './ast.js';
import { q, qstr } from './rational.js';
import { seq, approx, ssub, sfloat, sq } from './surd.js';
import { pevalQ } from './poly.js';
import { surdToNode } from './build.js';
import { malrule } from './malrules.js';
import { polyOfNode } from './exact.js';

/** @typedef {import('./malrules.js').Seg} Seg */
/** @typedef {import('./surd.js').Surd} Surd */

/** @param {Seg[]} segs */
export function wordCount(segs) {
  let n = 0;
  for (const s of segs) {
    if (typeof s === 'string') n += s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    else n += 1;
  }
  return n;
}

/** @param {any} p @returns {Seg[]} */
function correctLine(p) {
  const d = p.data;
  switch (p.gen) {
    case 'ftw':
      if (p.interaction === 'forge') return ['Clean. ', { m: num(d.n) }, ' is ', { m: frac(num(d.n), num(1)) }, '. Now multiply across.'];
      return ['Clean. ', { m: num(d.n) }, ' is ', { m: frac(num(d.n), num(1)) }, ': it multiplies the numerator.'];
    case 'sqrtsq':
      return ['Clean. ', { m: root(num(d.n)) }, ' times itself gives back ', { m: num(d.n) }, '.'];
    case 'rat':
      if (p.interaction === 'forge')
        return ['Clean coin. ', { m: frac(root(num(d.n)), root(num(d.n))) }, ' is 1 and clears the root.'];
      return ['Clean. A form of 1 cleared the root from the denominator.'];
    case 'quad':
      if (p.interaction === 'nextline') return ['Clean. You subtracted a whole side from both sides.'];
      return ['Clean. One side is 0, and the solutions did not move.'];
  }
  return ['Clean.'];
}

/** @param {any} p */
function whyOf(p) {
  const d = p.data;
  switch (p.gen) {
    case 'ftw':
      return {
        sentence: [
          { m: num(d.n) },
          ' is ',
          { m: frac(num(d.n), num(1)) },
          ', so ',
          { m: times(num(d.n), frac(num(d.a), num(d.b))) },
          ' is ',
          { m: num(d.n) },
          ' jumps of ',
          { m: frac(num(d.a), num(d.b)) },
          ' and lands on ',
          { m: frac(num(d.n * d.a), num(d.b)) },
          '.',
        ],
        rep: { kind: 'jumps', n: Number(d.n), a: Number(d.a), b: Number(d.b) },
      };
    case 'sqrtsq':
      return {
        sentence: [{ m: root(num(d.n)) }, ' is the side of a square of area ', { m: num(d.n) }, ', and side times side = area.'],
        rep: { kind: 'square', n: Number(d.n) },
      };
    case 'rat':
      return {
        sentence: [
          { m: frac(root(num(d.n)), root(num(d.n))) },
          ' is a form of 1, so the value stays put, and ',
          { m: times(root(num(d.n)), root(num(d.n))) },
          ' = ',
          { m: num(d.n) },
          ' clears the denominator.',
        ],
        rep: { kind: 'coin', k: Number(d.k), n: Number(d.n), value: sfloat(p.answer.value) },
      };
    case 'quad': {
      const r = d.roots[1];
      const Lv = pevalQ(polyOfNode(d.L), q(r));
      const Rv = pevalQ(polyOfNode(d.R), q(r));
      return {
        sentence: ['Subtracting a whole side from both sides keeps the solutions, and either side may be the zero side.'],
        rep: {
          kind: 'balance',
          x: `${r}`,
          before: [approxOrExact(Lv), approxOrExact(Rv)],
          after: ['0', approxOrExact(ssub(Rv, Lv))],
          answer: p.answer.display || null,
        },
      };
    }
  }
  return { sentence: [''], rep: { kind: 'none' } };
}

/** @param {Surd} s */
function approxOrExact(s) {
  const t = s.terms;
  if (t.length === 0) return '0';
  if (t.length === 1 && t[0].rad === 1n && t[0].coef.d === 1n) return `${t[0].coef.n}`;
  return approx(s);
}

/** @param {any} p */
export const knotValue = (p) => /** @type {Surd} */ (p.answer.value);

/**
 * Their response as they gave it, for a Knot that is still open: the typed expression (Strike),
 * or the prompt times the coin they picked (Forge). Same value as r.value, never the answer key.
 * @param {any} p @param {import('./judge.js').JudgeResult} r
 */
function openExpr(p, r) {
  if (p.interaction === 'forge' && r.choice) {
    if (p.gen === 'ftw') return times(r.choice.display, p.prompt.math.args[1]);
    return times(p.prompt.math, r.choice.display);
  }
  if (r.parsed && r.parsed.t !== 'eq') return r.parsed;
  return surdToNode(/** @type {Surd} */ (r.value));
}

/**
 * @param {any} p problem
 * @param {import('./judge.js').JudgeResult} r
 */
function instrumentOf(p, r) {
  if (p.gen !== 'quad') {
    const kv = knotValue(p);
    // While the Knot is still open ('form', 'legal-idle') the finished answer is not printed:
    // the Knot row shows the prompt as given, and their row shows what they typed or picked.
    const open = r.verdict === 'form' || r.verdict === 'legal-idle';
    const rows = [{ label: 'Knot', exact: open ? p.prompt.math : surdToNode(kv), approx: approx(kv), x: sfloat(kv) }];
    if (r.value) {
      rows.push({
        label: p.interaction === 'strike' ? 'Yours' : 'Your pick',
        exact: open ? openExpr(p, r) : surdToNode(r.value),
        approx: approx(r.value),
        x: sfloat(r.value),
      });
    }
    return { kind: 'lantern', rows, same: !!r.value && seq(r.value, kv) };
  }
  // Scale: both sides at a true solution of the original
  const d = p.data;
  const L0 = polyOfNode(d.L);
  const R0 = polyOfNode(d.R);
  const eq = /** @type {any} */ (r.parsed);
  let x = q(d.roots[1]);
  /** @type {{ label: string, L: string, R: string, balanced: boolean, tilt: number }[]} */
  const rows = [];
  /** @param {string} label @param {any} Lp @param {any} Rp */
  const row = (label, Lp, Rp) => {
    const lv = pevalQ(Lp, x);
    const rv = pevalQ(Rp, x);
    const diff = sfloat(ssub(lv, rv));
    return { label, L: approxOrExact(lv), R: approxOrExact(rv), balanced: seq(lv, rv), tilt: diff === 0 ? 0 : diff > 0 ? 1 : -1 };
  };
  if (eq && eq.t === 'eq') {
    const Lp = polyOfNode(eq.lhs);
    const Rp = polyOfNode(eq.rhs);
    // show the solution where the student's line fails, if there is one
    for (const cand of [d.roots[1], d.roots[0]]) {
      if (!seq(pevalQ(Lp, q(cand)), pevalQ(Rp, q(cand)))) {
        x = q(cand);
        break;
      }
    }
    // the student's line holds at both true solutions but has another one: show that one
    if (r.extraRoot && seq(pevalQ(Lp, q(d.roots[0])), pevalQ(Rp, q(d.roots[0]))) && seq(pevalQ(Lp, q(d.roots[1])), pevalQ(Rp, q(d.roots[1]))))
      x = r.extraRoot;
    rows.push(row('Knot', L0, R0));
    rows.push(row(p.interaction === 'nextline' ? 'Your pick' : 'Yours', Lp, Rp));
  } else rows.push(row('Knot', L0, R0));
  return { kind: 'scale', x: qstr(x), rows };
}

/**
 * After a Forge pick: the multiply-across chain, e.g. 4/1 x 1/3 = 4/3. Only for the correct
 * option, so every line shown is a true equality.
 * @param {any} p @returns {any[] | null}
 */
export function forgeChain(p) {
  if (p.interaction !== 'forge') return null;
  const c = p.choices.find((/** @type {any} */ x) => x.verdict === 'correct').display;
  const d = p.data;
  if (p.gen === 'ftw') return [times(c, frac(num(d.a), num(d.b))), p.answer.display];
  const mid = frac(d.k === 1n ? root(num(d.n)) : mul(num(d.k), root(num(d.n))), num(d.n));
  const chain = [times(p.prompt.math, c), mid];
  if (!astEq(mid, p.answer.display)) chain.push(p.answer.display);
  return chain;
}

/** @param {any} p */
function shownAnswer(p) {
  if (p.choices) return p.choices.find((/** @type {any} */ c) => c.verdict === 'correct').display;
  return p.answer.display;
}

/**
 * @param {any} p
 * @param {import('./judge.js').JudgeResult} r
 */
export function buildFeedback(p, r) {
  const isEq = p.gen === 'quad';
  /** @type {Seg[]} */
  let line;
  /** @type {string | undefined} */
  let sub;
  /** @type {{ name: string, term: string } | undefined} */
  let haunt;
  /** @type {{ name: string, term: string }[]} */
  let maybe = [];
  switch (r.verdict) {
    case 'correct':
      line = correctLine(p);
      if (r.scaled) sub = 'That is an equivalent equation: a multiple of the standard form. Accepted.';
      break;
    case 'form':
      line = [isEq ? 'Same solutions, not finished.' : 'Same value, not finished.'];
      sub = r.why;
      break;
    case 'legal-idle':
      line = ['Legal. Not closer.'];
      sub = 'That coin is worth 1, but the root is still in the denominator.';
      break;
    case 'unparsed':
    case 'unverifiable':
      line = ['Not read. Nothing counted.'];
      sub = r.why;
      break;
    default: {
      if (r.tags.length === 1) {
        const m = malrule(r.tags[0]);
        line = m.script(p);
        haunt = { name: m.haunt, term: m.standardTerm };
      } else if (r.tags.length > 1) {
        line = ['That matches more than one known slip. The numbers show the gap.'];
        maybe = r.tags.map((t) => ({ name: malrule(t).haunt, term: malrule(t).standardTerm }));
      } else if (isEq && r.extraRoot) {
        const xr = r.extraRoot;
        line = ['Extra solution: ', { m: eqNode(v('x'), surdToNode(sq(xr))) }, ' works in yours, not in the Knot.'];
        if (r.why) sub = r.why;
      } else if (isEq && r.rootsKept) {
        line = ['Not the Knot rewritten. The Scale shows both lines.'];
        sub = r.why;
      } else {
        // Strike: they typed a value, they did not make a move
        const what = isEq ? 'Different solutions' : 'Different value';
        line = [p.interaction === 'strike' ? `${what}: the ${isEq ? 'Scale' : 'Lantern'} shows the gap.` : `${what}. That move changed the Knot.`];
        if (r.why) sub = r.why;
      }
    }
  }
  const counted = r.verdict !== 'unparsed' && r.verdict !== 'unverifiable';
  return {
    verdict: r.verdict,
    resolved: r.verdict === 'correct' || r.verdict === 'wrong',
    miss: r.verdict === 'wrong',
    line,
    sub,
    haunt,
    maybe,
    instrument: counted ? instrumentOf(p, r) : null,
    why: whyOf(p),
    answer: r.verdict === 'wrong' ? shownAnswer(p) : null,
  };
}

