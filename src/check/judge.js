// @ts-check
// The judge (DESIGN.md section 3, per-interaction rules; section 11 Domain
// policy). judge(problem, rawResponse) never throws and never answers
// 'wrong' when the math core says undefined (that is 'unverifiable').
//
// Verdicts (Attempt['verdict']):
//   correct       right, and every form predicate holds
//   form          "same value, not finished": NOT a miss. `note` names what is
//                 left (from the failing predicate) without giving the answer.
//   legal-idle    a form of 1 / 0 that is exactly 1 / 0 but misses the goal, or
//                 a legal Cast chip that gets no closer ("Legal. Not closer.")
//   risky         a Cast chip that multiplies or divides by something that may
//                 be 0; or a typed form of 1 / 0 that is 1 / 0 only where a
//                 variable is nonzero (x/x)
//   wrong         provably not the answer. Mal-rule tagging is NOT done here
//                 (src/misc/diagnose.js); `parsed` is returned for it.
//   unparsed      not an attempt: could not be read, or the wrong shape (an
//                 expression where an equation is due, a list of the wrong length)
//   unverifiable  the math core cannot decide, or the item itself is broken
//
// Response text: the keypad's plus-minus key emits U+00B1; "+/-" is also read
// as plus-minus. The two characters "+-" typed together always mean plus,
// negative (section 9): judge() inserts a space between them before calling
// parseSolutions(), whose own convention reads "+-" as plus-minus.
//
// Tap or typed: judge(problem, raw, { tapped }) says which. A tapped response
// must be a choice id. An untapped one on a constructed item is always typed
// math, even when it happens to equal a choice id ("1" typed on a Forge item
// whose choices are numbered); on an item that is not constructed there is
// nothing to type, so it is matched against the choice ids (the two-argument
// form, kept for callers that only ever pass choice ids there).
//
// Choice items (problem.choices non-empty and the response is a choice id):
// the verdict is the generator's label (progress -> correct, illegal ->
// wrong), but it is first recomputed from the math where this file can:
// Cast chips (Move displays) with classify(), and progress vs legal-idle
// against problem.moveGraph.distance; Next Line and Forge candidates by
// judging the displayed line or coin as if it had been typed (a Next Line
// expression candidate with the right value but a failing form predicate is
// 'wrong', section 3 I2). A label that disagrees with the math gives
// 'unverifiable' with labelMismatch: true, never the label.
// See answer-spec.js for what `expected` means for each AnswerSpec kind.

import { isEquation, stripGroups, vars, some } from '../math/ast.js';
import { parse, parseList, parseSolutions } from '../math/parse.js';
import { print } from '../math/print.js';
import { equivExpr, sameSides, isMultiple, sameSolutions, WHERE_DEFINED } from '../math/equiv.js';
import { failedForms as formsFailing, forms } from '../math/forms.js';
import { evaluateS, constValue } from '../math/evaluate.js';
import { toPoly, toRat, polyToNode, polyVars } from '../math/poly.js';
import { toRadicalNormalForm } from '../math/radical.js';
import { seq, smul, sdiv, toQ, surdToNode, sIsZero } from '../math/surd.js';
import { qeq, ONE, isZero } from '../math/rational.js';
import { classifyDetail } from '../moves/classify.js';
import { nonRealPart, realZeros } from '../moves/real.js';
import { validateSpec, isNode, KINDS, SCALABLE_TUPLE_VARIANT } from './answer-spec.js';

/** @typedef {import('../../types.d.ts').Q} Q */
/** @typedef {import('../../types.d.ts').Surd} Surd */
/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Env} Env */
/** @typedef {import('../../types.d.ts').Move} Move */
/** @typedef {import('../../types.d.ts').MoveVerdict} MoveVerdict */
/** @typedef {import('../../types.d.ts').Choice} Choice */
/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Assumption} Assumption */
/** @typedef {import('../../types.d.ts').AnswerSpec} AnswerSpec */
/** @typedef {import('../../types.d.ts').SolutionSet} SolutionSet */
/** @typedef {import('../../types.d.ts').Attempt['verdict']} Verdict */

/**
 * @typedef {{
 *   verdict: Verdict;
 *   kind: AnswerSpec['kind'] | 'choice';
 *   parsed?: Node | Equation | Node[] | SolutionSet | Move;
 *   parsedNodes?: Node[];
 *   note?: string;
 *   failedForms: string[];
 *   witness?: Env;
 *   missing?: Surd[];
 *   extra?: Surd[];
 *   scale?: Q;
 *   choice?: Choice;
 *   moveVerdict?: MoveVerdict;
 *   riskyExpr?: Node;
 *   labelMismatch?: boolean;
 *   nonReal?: Node[];
 *   error?: string;
 * }} JudgeResult
 *   parsed: the response as read (Node / Equation / Node[] for a tuple /
 *     SolutionSet; for a choice, its display). parsedNodes: the typed values
 *     of a solution set, plus-minus expanded.
 *   witness: an exact point where a wrong expression differs (Lantern).
 *   missing / extra: roots of the key that were not typed / typed values
 *     that are not roots (solution sets; both empty unless wrong).
 *   scale: the k of an accepted scaled read-abc tuple.
 *   nonReal: typed solution-set values that are not real numbers (sqrt(-4));
 *     the verdict is then 'wrong' and `parsed` is absent (no SolutionSet
 *     can hold them). missing / extra then compare the key with the typed
 *     values that are real and exactly computable; with 'all reals' as the
 *     key, missing stays empty.
 */

// ---------------------------------------------------------------- notes

/** @type {Record<string, string>} */
const FORM_NOTES = {
  'lowest-terms': 'the fraction can still be reduced',
  'no-radical-in-denominator': 'a root is still in the denominator',
  'no-radical': 'a root is still in it',
  'expanded': 'a product is not multiplied out yet',
  'combined': 'like terms are not combined yet',
  'descending-order': 'the terms are not in descending order yet',
  'standard-form': 'one side must be 0 and the other in descending order',
  'single-number': 'write it as a single number',
  'integer': 'write it as a whole number',
  'integer-fraction': 'write it as one fraction',
  'isolated': 'the variable is not alone on one side yet',
  'factored-gcf': 'take out the greatest common factor',
};

/**
 * A note naming what is left, without the answer. For radical-simplified it
 * names the first radicand that still hides a square (the student's own
 * number, as in "8 still hides a square").
 * @param {string} name @param {Node | Equation | undefined} x
 * @returns {string}
 */
function formNote(name, x) {
  if (name === 'radical-simplified') {
    /** @type {Node | undefined} */
    let bad;
    /** @param {Node} n */
    const find = (n) => some(n, (m) => {
      if (m.t === 'root' && !forms['radical-simplified'](m)) { bad = m; return true; }
      return false;
    });
    if (x) {
      if (isEquation(x)) { if (!find(stripGroups(x.lhs))) find(stripGroups(x.rhs)); } else find(stripGroups(x));
    }
    if (bad && bad.t === 'root') return `${print(bad.radicand)} still hides a square`;
    return 'a root or power can still be simplified';
  }
  if (FORM_NOTES[name]) return FORM_NOTES[name];
  const iso = /^isolated:(.)$/.exec(name);
  if (iso) return `${iso[1]} is not alone on one side yet`;
  const den = /^denominator:(\d+)$/.exec(name);
  if (den) return `use denominator ${den[1]}`;
  return `not finished (${name})`;
}

// ---------------------------------------------------------------- results

/** @param {AnswerSpec['kind'] | 'choice'} kind @param {string} note @returns {JudgeResult} */
function unparsed(kind, note) { return { verdict: 'unparsed', kind, note, failedForms: [] }; }

/** @param {AnswerSpec['kind'] | 'choice'} kind @param {string} note @param {Partial<JudgeResult>} [rest] @returns {JudgeResult} */
function unverifiable(kind, note, rest = {}) { return { verdict: 'unverifiable', kind, note, failedForms: [], ...rest }; }

/**
 * correct, or form with the failing predicates.
 * @param {AnswerSpec['kind']} kind @param {string[]} preds @param {(Node | Equation)[]} trees
 * @param {Partial<JudgeResult>} rest
 * @returns {JudgeResult}
 */
function finish(kind, preds, trees, rest) {
  /** @type {string[]} */
  const failed = [];
  /** @type {Node | Equation | undefined} */
  let firstBad;
  for (const name of preds) {
    for (const t of trees) {
      if (formsFailing([name], t).length > 0) {
        if (!failed.includes(name)) failed.push(name);
        firstBad ??= t;
      }
    }
  }
  if (failed.length === 0) return { verdict: 'correct', kind, failedForms: [], ...rest };
  return { verdict: 'form', kind, failedForms: failed, ...rest, note: `Same value, not finished: ${formNote(failed[0], firstBad)}.` };
}

// ---------------------------------------------------------------- domain conditions

/** @param {Assumption[]} as @returns {Set<string>} */
function nonzeroSet(as) {
  return new Set(as.filter((a) => a.rel === 'nonzero' || a.rel === 'pos').map((a) => a.name));
}

/**
 * The conditions an expression needs to be defined ("x != 0", "x - 1 != 0"),
 * beyond the declared nonzero symbols; undefined outside the rational and
 * radical classes.
 * @param {Node} n @param {Assumption[]} as
 * @returns {string[] | undefined}
 */
function conditions(n, as) {
  const nz = nonzeroSet(as);
  const r = toRat(n);
  if (r) {
    return r.poles.flatMap((p) => (p.terms.size === 1
      ? polyVars(p).filter((v) => !nz.has(v)).map((v) => `${v} != 0`)
      : [`${print(polyToNode(p))} != 0`]));
  }
  const nf = toRadicalNormalForm(n, as);
  return nf ? nf.poles : undefined;
}

/**
 * The expressions that must be nonzero for n to be defined (the same list as
 * conditions(), as trees): a monomial pole gives one variable per undeclared
 * symbol in it. undefined outside the rational and radical classes.
 * @param {Node} n @param {Assumption[]} as
 * @returns {Node[] | undefined}
 */
function poleNodes(n, as) {
  const nz = nonzeroSet(as);
  const r = toRat(n);
  if (r) {
    return r.poles.flatMap((p) => (p.terms.size === 1
      ? polyVars(p).filter((v) => !nz.has(v)).map((v) => /** @type {Node} */ ({ t: 'var', name: v }))
      : [polyToNode(p)]));
  }
  const nf = toRadicalNormalForm(n, as);
  if (!nf) return undefined;
  /** @type {Node[]} */
  const out = [];
  for (const c of nf.poles) {
    const m = / != 0$/.exec(c);
    const t = m ? parse(c.slice(0, m.index)) : undefined;
    if (!t || 'error' in t || isEquation(t)) return undefined;
    out.push(t);
  }
  return out;
}

/**
 * Compare the domain of a response with the key's after equivExpr said
 * "equal where defined". 'same': no extra restriction. 'extra': the response
 * is undefined somewhere the key is defined (x/x for 1), with the list.
 * 'unknown': anything else.
 * One variable (the usual case): the exact real zeros of every pole, minus
 * the points the assumptions exclude, are compared as sets, so x(x + 1) and
 * x, x + 1 are the same domain and x^2 + 1 restricts nothing. Otherwise only
 * an identical list of printed conditions counts as 'same'; a different list
 * is 'unknown' (an extra condition string can still restrict nothing).
 * @param {Node} got @param {Node} want @param {Assumption[]} as
 * @returns {{ rel: 'same' | 'unknown' } | { rel: 'extra'; extra: string[] }}
 */
function domainRelation(got, want, as) {
  const pg = poleNodes(got, as);
  const pw = poleNodes(want, as);
  if (!pg || !pw) return { rel: 'unknown' };
  const zg = pg.map((p) => realZeros(p, as));
  const zw = pw.map((p) => realZeros(p, as));
  const names = new Set([...zg, ...zw].map((z) => z && z.v).filter((v) => v !== undefined));
  if (zg.every((z) => z) && zw.every((z) => z) && names.size <= 1) {
    const [v] = names;
    /** @param {typeof zg} zs @returns {Surd[]} */
    const flat = (zs) => zs.flatMap((z) => (z ? z.roots : []));
    const rg = flat(zg);
    const rw = flat(zw);
    const missing = rw.filter((x) => !rg.some((y) => seq(x, y)));
    /** @type {Surd[]} */
    const extra = [];
    for (const x of rg) if (!rw.some((y) => seq(x, y)) && !extra.some((y) => seq(x, y))) extra.push(x);
    if (missing.length > 0) return { rel: 'unknown' };
    if (extra.length === 0) return { rel: 'same' };
    return { rel: 'extra', extra: extra.map((x) => `${v} != ${surdText(x)}`) };
  }
  const sg = new Set(pg.map((p) => print(p)));
  const sw = new Set(pw.map((p) => print(p)));
  return sg.size === sw.size && [...sg].every((c) => sw.has(c)) ? { rel: 'same' } : { rel: 'unknown' };
}

// ---------------------------------------------------------------- per kind

/**
 * @param {Problem} problem @param {AnswerSpec} spec @param {Node | Equation} got @param {Assumption[]} as
 * @returns {JudgeResult}
 */
function judgeExpr(problem, spec, got, as) {
  if (isEquation(got)) {
    // A "Solve for v" item takes the solved line "v = E" or "E = v" (v not in E) as E.
    const v = spec.solvedFor;
    if (v !== undefined) {
      const isV = (/** @type {Node} */ n) => { const s = stripGroups(n); return s.t === 'var' && s.name === v; };
      const side = isV(got.lhs) && !vars(got.rhs).includes(v) ? got.rhs : isV(got.rhs) && !vars(got.lhs).includes(v) ? got.lhs : undefined;
      if (side) return judgeExpr(problem, spec, side, as);
      return unparsed('expr', `Type ${v} = ..., with ${v} alone on one side, or only what ${v} equals.`);
    }
    return unparsed('expr', 'Type an expression, not an equation.');
  }
  const want = /** @type {Node} */ (spec.expected);
  const r = equivExpr(got, want, as);
  if (r.equal === undefined) return unverifiable('expr', 'Cannot check that form. Try writing it another way.', { parsed: got });
  if (r.equal === false) return { verdict: 'wrong', kind: 'expr', parsed: got, failedForms: [], ...(r.witness ? { witness: r.witness } : {}) };
  if (r.note && r.note.startsWith(WHERE_DEFINED)) {
    const d = domainRelation(got, want, as);
    if (d.rel === 'extra') {
      return { verdict: 'form', kind: 'expr', parsed: got, failedForms: [], note: `Same value where defined, but it needs ${d.extra.join(', ')}. Cancel it.` };
    }
    if (d.rel === 'unknown') return unverifiable('expr', 'Cannot check where that is defined.', { parsed: got });
  }
  const res = finish('expr', spec.formPredicates, [got], { parsed: got });
  const math = problem.prompt && problem.prompt.math;
  if (res.verdict === 'form' && isNode(math) && print(stripGroups(got)) === print(stripGroups(math))) {
    res.note = 'Same value, not finished: the move has not been applied yet.';
  }
  return res;
}

/**
 * @param {Problem} problem @param {AnswerSpec} spec @param {Node | Equation} got @param {Assumption[]} as
 * @returns {JudgeResult}
 */
function judgeSides(problem, spec, got, as) {
  if (!isEquation(got)) return unparsed('equation-sides', 'Type the whole line: it needs an = sign.');
  const want = /** @type {Equation} */ (spec.expected);
  const s = sameSides(got, want, as);
  if (s === undefined) return unverifiable('equation-sides', 'Cannot check that form. Try writing it another way.', { parsed: got });
  if (s === true) return finish('equation-sides', spec.formPredicates, [got], { parsed: got });
  /** @type {string | undefined} */
  let note;
  const orig = problem.prompt && problem.prompt.math;
  if (isEquation(orig) && sameSides(got, orig, as) === true) {
    note = 'That is the line before the move. The move has not been applied yet.';
  } else {
    const vs = vars(want);
    if (vs.length === 1 && sameSolutions(got, want, vs[0]).equal === true) {
      note = 'Same solutions, but not the line this move gives. Type the very next line.';
    }
  }
  return { verdict: 'wrong', kind: 'equation-sides', parsed: got, failedForms: [], ...(note ? { note } : {}) };
}

/**
 * @param {AnswerSpec} spec @param {Node | Equation} got @param {Assumption[]} as
 * @returns {JudgeResult}
 */
function judgeMultiple(spec, got, as) {
  if (!isEquation(got)) return unparsed('equation-multiple', 'Type an equation: it needs an = sign.');
  const want = /** @type {Equation} */ (spec.expected);
  const m = isMultiple(got, want, as);
  if (m === undefined) return unverifiable('equation-multiple', 'Cannot check that form. Try writing it another way.', { parsed: got });
  if (m === true) return finish('equation-multiple', spec.formPredicates, [got], { parsed: got });
  /** @type {string | undefined} */
  let note;
  const vs = vars(want);
  if (vs.length === 1 && sameSolutions(got, want, vs[0]).equal === true) {
    note = 'Same solutions, but not this equation rewritten. Move a whole side across.';
  }
  return { verdict: 'wrong', kind: 'equation-multiple', parsed: got, failedForms: [], ...(note ? { note } : {}) };
}

/** Plus-minus as typed: U+00B1 or "+/-" (the two characters "+-" were already split). */
const PM = /\u00b1|\+\/-/g;

/**
 * Split at top-level commas (the same split as parse.js splitCommas: commas
 * inside parentheses do not separate items).
 * @param {string} text @returns {string[]}
 */
function splitTop(text) {
  /** @type {string[]} */
  const parts = [''];
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) parts.push(''); else parts[parts.length - 1] += ch;
  }
  return parts;
}

/**
 * When parseSolutions refuses, tell apart:
 *   unparsed      could not read it, or the wrong shape: a letter in a value,
 *                 or "y = 3" when the item's one variable is x (note names it);
 *   nonreal       read it, and a typed value is provably not a real number
 *                 (sqrt(-4), the classic x = +-2i): the response is wrong,
 *                 since the solution set is a set of real numbers;
 *   unverifiable  read it, but a value cannot be computed exactly (1/0, 2^(1/3)).
 * Each item is parsed on its own with plus-minus read as + and as -, so both
 * typed values of "a +- b" are seen (more than one plus-minus in an item is
 * unparsed, as in parseSolutions).
 * @param {string} text @param {string | undefined} v the item's one variable, if it has one
 * @returns {{ why: 'unparsed'; note?: string } | { why: 'unverifiable' } | { why: 'nonreal'; nodes: Node[]; nonReal: Node[] }}
 */
function whySolutionsFailed(text, v) {
  /** @type {Node[]} */
  const nodes = [];
  /** @type {Node[]} */
  const nonReal = [];
  for (const part of splitTop(text)) {
    const pms = part.match(PM) ?? [];
    if (pms.length > 1) return { why: 'unparsed' };
    const variants = pms.length === 0 ? [part] : [part.replace(PM, '+'), part.replace(PM, '-')];
    for (const src of variants) {
      const it = parse(src);
      if ('error' in it) return { why: 'unparsed' };
      /** @type {Node} */
      let n;
      if (isEquation(it)) {
        if (it.lhs.t !== 'var') return { why: 'unparsed' };
        if (v !== undefined && it.lhs.name !== v) return { why: 'unparsed', note: `Write each solution as ${v} = a number.` };
        n = it.rhs;
      } else n = it;
      if (vars(n).length > 0) return { why: 'unparsed' };
      nodes.push(n);
      if (nonRealPart(n)) nonReal.push(n);
    }
  }
  return nonReal.length > 0 ? { why: 'nonreal', nodes, nonReal } : { why: 'unverifiable' };
}

/** @param {Surd} s @returns {string} */
function surdText(s) { return print(surdToNode(s)); }

/**
 * @param {Problem} problem @param {AnswerSpec} spec @param {string} raw
 * @returns {JudgeResult}
 */
function judgeSolutionSet(problem, spec, raw) {
  const keys = problem.variableKeys ?? [];
  const v = keys.length === 1 ? keys[0] : undefined;
  // "+-" typed together is plus, negative (section 9); only U+00B1 / "+/-" is plus-minus.
  const text = raw.replace(/\+-/g, '+ -');
  const res = parseSolutions(text, v);
  const want = /** @type {SolutionSet} */ (spec.expected);
  if ('error' in res) {
    const why = whySolutionsFailed(text, v);
    if (why.why === 'unparsed') {
      return unparsed('solution-set', why.note ?? 'Type the solutions as numbers, separated by commas, or a no solution / all reals key.');
    }
    if (why.why === 'unverifiable') return unverifiable('solution-set', 'Cannot compute one of those values exactly. Try writing it another way.');
    // A typed value that is not a real number: provably not the (real) solution set.
    /** @type {Surd[]} */
    const typed = [];
    for (const n of why.nodes) {
      const val = nonRealPart(n) ? undefined : evaluateS(n, {});
      if (val && !typed.some((y) => seq(val, y))) typed.push(val);
    }
    const wr = want.kind === 'finite' ? want.roots : [];
    return {
      verdict: 'wrong', kind: 'solution-set', failedForms: [], parsedNodes: why.nodes, nonReal: why.nonReal,
      missing: wr.filter((x) => !typed.some((y) => seq(x, y))),
      extra: typed.filter((x) => !wr.some((y) => seq(x, y))),
      note: `${print(why.nonReal[0])} is not a real number.`,
    };
  }
  const got = res.set;
  const base = { parsed: got, parsedNodes: res.nodes };
  if (want.kind === 'all' || got.kind === 'all') {
    if (want.kind === got.kind) return finish('solution-set', spec.formPredicates, res.nodes, base);
    if (want.kind === 'all') {
      return { verdict: 'wrong', kind: 'solution-set', failedForms: [], ...base, missing: [], extra: [], note: 'Some solutions are missing.' };
    }
    return { verdict: 'wrong', kind: 'solution-set', failedForms: [], ...base, missing: want.kind === 'finite' ? want.roots : [], extra: [], note: 'Not every number is a solution.' };
  }
  const wr = want.kind === 'finite' ? want.roots : [];
  const gr = got.kind === 'finite' ? got.roots : [];
  const missing = wr.filter((x) => !gr.some((y) => seq(x, y)));
  const extra = gr.filter((x) => !wr.some((y) => seq(x, y)));
  if (missing.length === 0 && extra.length === 0) return finish('solution-set', spec.formPredicates, res.nodes, base);
  /** @type {string} */
  let note;
  if (extra.length > 0) {
    note = `${v ?? 'x'} = ${surdText(extra[0])} is not a solution.`;
    if (missing.length > 0) note += ' And a solution is missing.';
  } else if (got.kind === 'none') {
    note = 'There is a solution.';
  } else {
    note = missing.length === 1 ? 'One solution is missing.' : 'Some solutions are missing.';
  }
  return { verdict: 'wrong', kind: 'solution-set', failedForms: [], ...base, missing, extra, note };
}

/**
 * Split an expression into (numerator, denominator) for multiplying across.
 * @param {Node} n @returns {[Node, Node]}
 */
function numDen(n) {
  const s = stripGroups(n);
  if (s.t === 'frac') return [s.num, s.den];
  if (s.t === 'neg') { const [a, b] = numDen(s.arg); return [{ t: 'neg', arg: a }, b]; }
  return [s, { t: 'num', q: ONE }];
}

/**
 * A part of a multiplied-across result in its finished-looking form: the
 * exact value for numbers, the expanded polynomial for polynomials.
 * @param {Node} n @returns {Node}
 */
function reduced(n) {
  if (vars(n).length === 0) {
    const val = constValue(n);
    return val ? surdToNode(val) : stripGroups(n);
  }
  const p = toPoly(n);
  return p ? polyToNode(p) : stripGroups(n);
}

/** @param {Node} math @param {Node} coin @returns {{ num: Node; den: Node }} */
function across(math, coin) {
  const [a, b] = numDen(math);
  const [c, d] = numDen(coin);
  return { num: reduced({ t: 'mul', args: [a, c] }), den: reduced({ t: 'mul', args: [b, d] }) };
}

/**
 * Value check shared by form-of-1 and form-of-0.
 * @param {AnswerSpec['kind']} kind @param {Node} got @param {Node} target the number 1 or 0
 * @param {Assumption[]} as
 * @returns {JudgeResult | undefined} a final result, or undefined when got is exactly the target
 */
function identityValue(kind, got, target, as) {
  const r = equivExpr(got, target, as);
  const word = kind === 'form-of-1' ? '1' : '0';
  if (r.equal === undefined) return unverifiable(kind, 'Cannot check that form. Try writing it another way.', { parsed: got });
  if (r.equal === false) {
    return { verdict: 'wrong', kind, parsed: got, failedForms: [], note: `That is not worth exactly ${word}.`, ...(r.witness ? { witness: r.witness } : {}) };
  }
  if (r.note && r.note.startsWith(WHERE_DEFINED)) {
    // Defined wherever the number is (every pole has no admissible real
    // zero, as in (x^2 + 1)/(x^2 + 1)): exactly the target, not risky.
    const d = domainRelation(got, target, as);
    if (d.rel === 'same') return undefined;
    const c = d.rel === 'extra' ? d.extra : (conditions(got, as) ?? []);
    return { verdict: 'risky', kind, parsed: got, failedForms: [], note: `Risky: worth ${word} only if ${c.length ? c.join(', ') : 'it is defined'}.` };
  }
  return undefined;
}

/**
 * @param {Problem} problem @param {AnswerSpec} spec @param {Node | Equation} got @param {Assumption[]} as
 * @returns {JudgeResult}
 */
function judgeFormOf1(problem, spec, got, as) {
  if (isEquation(got)) return unparsed('form-of-1', 'Type a form of 1, not an equation.');
  const early = identityValue('form-of-1', got, { t: 'num', q: ONE }, as);
  if (early) return early;
  const math = problem.prompt && problem.prompt.math;
  if (!isNode(math)) return unverifiable('form-of-1', 'This item has no expression to multiply.', { parsed: got });
  const res = across(math, got);
  /** @type {Node} */
  const product = { t: 'frac', num: res.num, den: res.den };
  if (spec.formPredicates.length > 0) {
    const failed = formsFailing(spec.formPredicates, product);
    if (failed.length === 0) return { verdict: 'correct', kind: 'form-of-1', parsed: got, failedForms: [] };
    return { verdict: 'legal-idle', kind: 'form-of-1', parsed: got, failedForms: failed, note: `Legal. Not closer: ${formNote(failed[0], product)}.` };
  }
  const ref = across(math, /** @type {Node} */ (spec.expected));
  const same = equivExpr(res.den, ref.den, as).equal;
  if (same === undefined) return unverifiable('form-of-1', 'Cannot check that form. Try writing it another way.', { parsed: got });
  if (same) return { verdict: 'correct', kind: 'form-of-1', parsed: got, failedForms: [] };
  return { verdict: 'legal-idle', kind: 'form-of-1', parsed: got, failedForms: [], note: 'Legal. Not closer.' };
}

/** The first term of a sum (the part a zero-pair adds). @param {Node} n @returns {Node} */
function firstTerm(n) {
  const s = stripGroups(n);
  return s.t === 'add' && s.args.length > 0 ? firstTerm(s.args[0]) : s;
}

/**
 * @param {AnswerSpec} spec @param {Node | Equation} got @param {Assumption[]} as
 * @returns {JudgeResult}
 */
function judgeFormOf0(spec, got, as) {
  if (isEquation(got)) return unparsed('form-of-0', 'Type a zero-pair, not an equation.');
  const early = identityValue('form-of-0', got, { t: 'num', q: { n: 0n, d: 1n } }, as);
  if (early) return early;
  const same = equivExpr(firstTerm(got), firstTerm(/** @type {Node} */ (spec.expected)), as).equal;
  if (same === undefined) return unverifiable('form-of-0', 'Cannot check that form. Try writing it another way.', { parsed: got });
  if (!same) return { verdict: 'legal-idle', kind: 'form-of-0', parsed: got, failedForms: [], note: 'Legal. Not closer.' };
  return finish('form-of-0', spec.formPredicates, [got], { parsed: got });
}

/**
 * @param {Problem} problem @param {AnswerSpec} spec @param {string} raw @param {Assumption[]} as
 * @returns {JudgeResult}
 */
function judgeTuple(problem, spec, raw, as) {
  const want = /** @type {Node[]} */ (spec.expected);
  const list = parseList(raw);
  const shape = `Type ${want.length} values separated by commas.`;
  if ('error' in list) return unparsed('tuple', shape);
  if (list.length !== want.length) return unparsed('tuple', shape);
  if (list.some((x) => isEquation(x))) return unparsed('tuple', shape);
  const got = /** @type {Node[]} */ (list);
  if (problem.variant === SCALABLE_TUPLE_VARIANT) return judgeScaledTuple(spec, got, want);
  let unknown = false;
  for (let i = 0; i < want.length; i++) {
    const r = equivExpr(got[i], want[i], as);
    if (r.equal === false) {
      return { verdict: 'wrong', kind: 'tuple', parsed: got, failedForms: [], ...(r.witness ? { witness: r.witness } : {}) };
    }
    if (r.equal === undefined || (r.note && r.note.startsWith(WHERE_DEFINED) && domainRelation(got[i], want[i], as).rel !== 'same')) unknown = true;
  }
  if (unknown) return unverifiable('tuple', 'Cannot check one of those values. Try writing it another way.', { parsed: got });
  return finish('tuple', spec.formPredicates, got, { parsed: got });
}

/**
 * Read a, b, c: any (ka, kb, kc), k a nonzero rational.
 * @param {AnswerSpec} spec @param {Node[]} got @param {Node[]} want
 * @returns {JudgeResult}
 */
function judgeScaledTuple(spec, got, want) {
  const gv = got.map((n) => (vars(n).length === 0 ? evaluateS(n, {}) : undefined));
  const wv = want.map((n) => evaluateS(n, {}));
  if (wv.some((x) => x === undefined)) return unverifiable('tuple', 'This item cannot be checked.', { parsed: got });
  const wvals = /** @type {Surd[]} */ (wv);
  const i0 = wvals.findIndex((x) => !sIsZero(x));
  if (i0 < 0) return unverifiable('tuple', 'This item cannot be checked.', { parsed: got });
  if (gv.some((x) => x === undefined)) {
    // A letter in a coefficient is provably not a number; an undefined number is not checkable.
    return got.some((n) => vars(n).length > 0)
      ? { verdict: 'wrong', kind: 'tuple', parsed: got, failedForms: [] }
      : unverifiable('tuple', 'Cannot compute one of those values exactly.', { parsed: got });
  }
  const gvals = /** @type {Surd[]} */ (gv);
  const ks = sdiv(gvals[i0], wvals[i0]);
  const k = ks && toQ(ks);
  if (!k || isZero(k)) return { verdict: 'wrong', kind: 'tuple', parsed: got, failedForms: [] };
  const kS = /** @type {Surd} */ (ks);
  for (let i = 0; i < want.length; i++) {
    if (!seq(gvals[i], smul(wvals[i], kS))) return { verdict: 'wrong', kind: 'tuple', parsed: got, failedForms: [] };
  }
  const res = finish('tuple', spec.formPredicates, got, { parsed: got, scale: k });
  if (res.verdict === 'correct' && !qeq(k, ONE)) res.note = 'That is a, b, c of an equivalent equation.';
  return res;
}

// ---------------------------------------------------------------- parsed dispatch

/**
 * Judge an already-parsed tree (typed responses after parse(), and choice
 * displays). Not for solution-set or tuple, which need the raw text.
 * @param {Problem} problem @param {Node | Equation} got
 * @returns {JudgeResult}
 */
export function judgeParsed(problem, got) {
  const spec = problem.answer;
  const as = [...(problem.assumptions ?? []), ...(spec.assumptions ?? [])];
  switch (spec.kind) {
    case 'expr': return judgeExpr(problem, spec, got, as);
    case 'equation-sides': return judgeSides(problem, spec, got, as);
    case 'equation-multiple': return judgeMultiple(spec, got, as);
    case 'form-of-1': return judgeFormOf1(problem, spec, got, as);
    case 'form-of-0': return judgeFormOf0(spec, got, as);
    default: return unverifiable(spec.kind, `judgeParsed does not take ${spec.kind}`);
  }
}

// ---------------------------------------------------------------- choices

/** @param {Choice['verdict']} v @returns {Verdict} */
function choiceVerdict(v) {
  if (v === 'progress') return 'correct';
  if (v === 'illegal') return 'wrong';
  return v;
}

/** @param {unknown} d @returns {d is Move} */
function isMove(d) {
  return typeof d === 'object' && d !== null && typeof /** @type {{op?: unknown}} */ (d).op === 'string' && !('t' in d);
}

/**
 * @param {Problem} problem @param {Choice} choice
 * @returns {JudgeResult}
 */
function judgeChoice(problem, choice) {
  const label = choice.verdict;
  const base = { kind: /** @type {'choice'} */ ('choice'), parsed: choice.display, choice, failedForms: [] };
  /** @param {string} why @returns {JudgeResult} */
  const mismatch = (why) => ({ ...base, verdict: 'unverifiable', labelMismatch: true, note: 'Cannot check this choice.', error: why });
  const as = [...(problem.assumptions ?? []), ...(problem.answer?.assumptions ?? [])];
  const d = choice.display;
  if (isMove(d)) {
    const math = problem.prompt && problem.prompt.math;
    if (!isEquation(math)) return mismatch('a move chip on an item whose prompt is not an equation');
    const c = classifyDetail(d, math, as);
    const want = label === 'progress' || label === 'legal-idle' ? 'legal' : label;
    if (c.verdict !== want) return mismatch(`label ${label}, classify says ${c.verdict}`);
    if ((label === 'progress' || label === 'legal-idle') && choice.distance !== undefined && problem.moveGraph) {
      const closer = choice.distance < problem.moveGraph.distance;
      if (closer !== (label === 'progress')) return mismatch(`label ${label} but distance ${choice.distance} vs ${problem.moveGraph.distance}`);
    }
    /** @type {JudgeResult} */
    const out = { ...base, verdict: choiceVerdict(label), moveVerdict: c.verdict };
    if (c.riskyExpr && c.verdict === 'risky') {
      out.riskyExpr = c.riskyExpr;
      out.note = c.reason === 'possibly-zero' ? `Risky: only safe if ${print(c.riskyExpr)} is not 0.` : 'Risky: this can add or lose solutions.';
    } else if (c.verdict === 'risky') {
      out.note = 'Risky: this can add or lose solutions.';
    } else if (label === 'legal-idle') {
      out.note = 'Legal. Not closer.';
    }
    return out;
  }
  const recomputable = (problem.interaction === 'nextline' || problem.interaction === 'forge')
    && ['expr', 'equation-sides', 'equation-multiple', 'form-of-1', 'form-of-0'].includes(problem.answer.kind);
  if (recomputable && (isNode(d) || isEquation(d))) {
    const r = judgeParsed(problem, d);
    /** @type {Verdict} */
    const math = r.verdict === 'form' ? 'wrong' : r.verdict;
    if (math === 'unparsed' || math === 'unverifiable') return mismatch(`the display itself is ${math}`);
    if (math !== choiceVerdict(label)) return mismatch(`label ${label}, math says ${math}`);
    return { ...base, verdict: math, ...(r.note && math !== 'correct' ? { note: r.note } : {}), ...(r.witness ? { witness: r.witness } : {}) };
  }
  return { ...base, verdict: choiceVerdict(label) };
}

// ---------------------------------------------------------------- entry point

/**
 * @param {Problem} problem @param {unknown} raw @param {boolean | undefined} tapped
 * @returns {JudgeResult}
 */
function judgeInner(problem, raw, tapped) {
  const spec = problem && problem.answer;
  const kind = kindOf(spec && spec.kind);
  if (typeof raw !== 'string') return unparsed(kind, 'Nothing to check.');
  const choices = problem.choices ?? [];
  if (tapped || (choices.length > 0 && !problem.constructed)) {
    const hit = choices.find((c) => c.id === raw);
    return hit ? judgeChoice(problem, hit) : unparsed('choice', 'Pick one.');
  }
  const errs = validateSpec(spec);
  if (errs.length > 0) return unverifiable(kind, 'This item cannot be checked.', { error: errs.join('; ') });
  if (raw.trim() === '') return unparsed(spec.kind, 'Type an answer first.');
  if (spec.kind === 'solution-set') return judgeSolutionSet(problem, spec, raw);
  const as = [...(problem.assumptions ?? []), ...(spec.assumptions ?? [])];
  if (spec.kind === 'tuple') return judgeTuple(problem, spec, raw, as);
  const got = parse(raw);
  if ('error' in got) return unparsed(spec.kind, `Could not read that: ${got.error}.`);
  return judgeParsed(problem, got);
}

/** @param {unknown} k @returns {AnswerSpec['kind'] | 'choice'} */
function kindOf(k) {
  return typeof k === 'string' && KINDS.includes(k) ? /** @type {AnswerSpec['kind']} */ (k) : 'choice';
}

/**
 * Judge one response. Never throws.
 * @param {Problem} problem
 * @param {string} rawResponse typed keypad text, or a choice id
 * @param {{ tapped?: boolean }} [opts] tapped: the response is a choice id
 *   from a tap (see the header: required for a tap on a constructed item)
 * @returns {JudgeResult}
 */
export function judge(problem, rawResponse, opts = {}) {
  try {
    return judgeInner(problem, rawResponse, opts && opts.tapped);
  } catch (err) {
    const kind = kindOf(problem && problem.answer && problem.answer.kind);
    return unverifiable(kind, 'This item cannot be checked.', { error: err instanceof Error ? err.message : String(err) });
  }
}

