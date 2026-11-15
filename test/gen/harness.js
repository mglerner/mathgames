// @ts-check
// The generator property suite (DESIGN.md section 11, "Tests"). ONE entry
// point: runGeneratorSuite(generator, opts). A generator's test file is:
//
//   import { runGeneratorSuite } from './harness.js';
//   import generator from '../../src/gen/<zone>/<skill>.<name>.js';
//   runGeneratorSuite(generator, {
//     separates: ['mal-rule-id', ...],        // rules this generator must detect
//     independentKey(problem) { ... },        // the answer by another path
//   });
//
// Run: node scripts/gen-registry.js && node --test test/gen/<skill>.test.js
// (the registry must be regenerated first; the suite fails if it is stale).
// Reference: test/gen/frac-times-whole.test.js.
//
// For every difficulty x interaction the generator offers it runs `seeds`
// seeds (default 5000; fade levels 0-3 in rotation) and checks, per item:
//   shape         Problem fields, id, seed, constructed (the planner's
//                 expectConstructed), a valid AnswerSpec, probes in the
//                 section 3 sets, visuals none at fade 3, choices exactly
//                 when not constructed.
//   determinism   the same seed gives the same item, twice.
//   answer key    verified two ways:
//                 (A) built in, by exact substitution / evaluation: an
//                     'expr' key has the value of opts.reference(problem)
//                     (default prompt.math) at exact points; every root of a
//                     solution set satisfies the original equation; an
//                     'equation-sides' key is the stated move applied to the
//                     original; a form of 1 / 0 is worth 1 / 0; a Twin's
//                     Same / Different is recomputed with equivExpr AND by
//                     exact evaluation; a fill-the-blank key balances.
//                 (B) an independent path: solve.js for solution sets; the
//                     solution set kept by a legal move for 'equation-sides';
//                     otherwise opts.independentKey(problem): the answer as
//                     keypad text, computed from the PROMPT ONLY with plain
//                     arithmetic (never from generator internals, the
//                     AnswerSpec, or src/math/equiv). It must be judged
//                     'correct' and, for a value, equal the key. An item
//                     with no path (B) fails: write independentKey for it.
//                     A "tap the hidden 1 / 0" Why has no typed key: its
//                     correct target must be worth exactly 1 / 0, and
//                     independentKey must return that target's data-path.
//                     Cast chips and Trace lines are recomputed instead
//                     (cast, steps below).
//   judge         the key is judged 'correct' in several typed forms (spaces,
//                 parentheses, swapped sides, reordered roots, "x =", plus
//                 opts.correctForms(problem)); opts.notCorrect(problem) forms
//                 are not; no response is 'unverifiable'.
//   choices       ids unique; exactly one correct (Cast: at least one
//                 progress); every label re-judged from the math; displays
//                 pairwise different in VALUE (Next Line) or as written
//                 (Forge, whose second form of 1 / 0 has the key's value by
//                 design, section 3 I4; Cast chips); a wrong Next Line choice
//                 always carries a mal-rule tag; a wrong Twin "same" carries
//                 one whenever a rule explains it (an untagged near-miss
//                 pair is allowed: no rule may match it).
//   tag honesty   diagnose() on each choice gives exactly its tag (and
//                 nothing for an untagged or correct choice): re-running the
//                 tagged mal-rule reproduces the distractor.
//   separation    common.js separated(): no mal-rule output is the answer;
//                 different rules never share an output.
//   detector      for EVERY registered mal-rule M, a simulated student who
//                 applies M (diagnose.js simulate) is judged wrong and tagged
//                 M and nothing else, on every item where M shows; the
//                 always-correct student gets no tag.
//   side-wise     'equation-sides' items: the original line retyped is
//                 rejected, and so is the fully solved line.
//   cast          every chip verdict recomputed with classify(); no multiply
//                 or divide by an undeclared-variable expression is legal;
//                 progress / idle and each distance from a fresh BFS
//                 (needs opts.isGoal); minPath replays to the goal in exactly
//                 `distance` legal moves; the search is not capped; in a
//                 one-way generator the tagged chips really change the roots.
//   steps         worked chains: each legal step is equivalent to the line
//                 before (and is the stated move, if one is given); a bad
//                 line really changes the value / solution set; at most one.
//   round trip    print -> parse -> print for every displayed tree, value
//                 preserved; the key's text parses.
//   render        every displayed tree renders (render/mathdom.js) and fits
//                 the real display-width estimate; Why targets resolve.
//   radicands     no negative radicand anywhere; no root 0 or 1 in a
//                 solution set (opts.allowRoots01 for one-way items).
// and, per generator: refusal of opts it does not offer; enough distinct
// prompts for Echo siblings (opts.minDistinct, default 8); every id in
// opts.separates tagged at least once; a counting Why variant if it offers
// 'why'.
//
// A failure message starts with
//   [<generator id> d<difficulty> <interaction> fade<f> seed "<seed>"]
// Replay: generator.generate(makeRng(seed), { difficulty, interaction, fadeLevel }).
//
// Options:
//   seeds            default 5000 (env KEYSTONE_SEEDS overrides, for a quick
//                    local run only; the suite prints the count it ran)
//   difficulties, interactions, fadeLevels   subsets to run (default: all)
//   separates        mal-rule ids that must each be detected at least once
//   independentKey   (problem) => string | undefined          see (B)
//   reference        (problem) => Node | undefined            see (A)
//   correctForms     (problem) => string[]   extra typed forms judged correct
//   notCorrect       (problem) => string[]   typed forms NOT judged correct
//   isGoal           (state, problem) => boolean   required for Cast
//   allowRoots01     allow 0 or 1 as a root
//   minDistinct      distinct prompts needed per difficulty x interaction

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeRng } from '../../src/gen/prng.js';
import { separated, displayedTrees, nodeAtPath as genNodeAtPath, followUp, BLANK, PROBE_VALUES, PROBE_VALUES_NONNEG, PROBE_VALUES_ROOT, V_FILL_BLANK, V_ONE_WAY, TWIN_SAME, TWIN_DIFFERENT, TRACE_NONE } from '../../src/gen/common.js';
import { malrules, diagnose, diagnoseJudged, simulate } from '../../src/misc/diagnose.js';
import { judge, judgeParsed } from '../../src/check/judge.js';
import { validateSpec, answerText, isNode, isSolutionSet } from '../../src/check/answer-spec.js';
import { isEquation, vars, some } from '../../src/math/ast.js';
import { parse } from '../../src/math/parse.js';
import { print } from '../../src/math/print.js';
import { q, qeq } from '../../src/math/rational.js';
import { evaluate, constValue } from '../../src/math/evaluate.js';
import { seq, ssign, surdToNode, sq, SZERO, SONE } from '../../src/math/surd.js';
import { equivExpr, sameSides, sameSolutions } from '../../src/math/equiv.js';
import { solve, checkRoot, sameSolutionSet } from '../../src/math/solve.js';
import { applyMove } from '../../src/moves/apply.js';
import { classify, rootSetChange } from '../../src/moves/classify.js';
import { canonicalize, step, search, DEFAULT_MAX_DEPTH } from '../../src/moves/graph.js';
import { expectConstructed } from '../../src/session/planner.js';
import { COUNTING_WHY_VARIANTS } from '../../src/learner/mastery.js';
import { renderMath, fitsDisplay, nodeAtPath as domNodeAtPath } from '../../src/render/mathdom.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').Env} Env */
/** @typedef {import('../../types.d.ts').Move} Move */
/** @typedef {import('../../types.d.ts').Problem} Problem */
/** @typedef {import('../../types.d.ts').Generator} Generator */
/** @typedef {import('../../types.d.ts').Interaction} Interaction */
/**
 * @typedef {{
 *   seeds?: number; difficulties?: number[]; interactions?: Interaction[]; fadeLevels?: number[];
 *   separates?: string[];
 *   independentKey?: (p: Problem) => string | undefined;
 *   reference?: (p: Problem) => Node | undefined;
 *   correctForms?: (p: Problem) => string[];
 *   notCorrect?: (p: Problem) => string[];
 *   isGoal?: (state: Equation, p: Problem) => boolean;
 *   allowRoots01?: boolean; minDistinct?: number;
 * }} SuiteOpts
 */
/** @typedef {{ items: number; tagged: Record<string, number>; prompts: Set<string>; variants: Set<string> }} Stats */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INTERACTIONS = ['cast', 'nextline', 'predict', 'forge', 'twin', 'trace', 'why', 'strike'];
const VISUALS = ['balance', 'numberline', 'bars', 'coin', 'zeropair', 'squareplot', 'tiles', 'grid'];
const KNOWN_WHY = [...COUNTING_WHY_VARIANTS, 'which-invariant'];
const DEFAULT_SEEDS = 5000;

/** JSON with BigInt, for deep comparison and messages. @param {unknown} x */
function dump(x) { return JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)); }

/** @param {unknown} cond @param {string} msg @returns {asserts cond} */
function must(cond, msg) { if (!cond) throw new Error(msg); }

/** Rename the blank so a tree can be printed and parsed. @template {Node | Equation} T @param {T} x @returns {T} */
function unblank(x) {
  return JSON.parse(dump(x).replaceAll(`"name":"${BLANK}"`, '"name":"z"'), (_k, v) => (typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v));
}

/** Exact points to evaluate at: the item's probes, else every allowed value for its variables. @param {Problem} p @param {Node[]} trees @returns {Env[]} */
function points(p, trees) {
  const names = [...new Set(trees.flatMap((t) => vars(t)))].filter((n) => n !== BLANK);
  if (names.length === 0) return [{}];
  const nonneg = (/** @type {string} */ n) => p.assumptions.some((a) => a.name === n && (a.rel === 'nonneg' || a.rel === 'pos'));
  /** @type {Env[]} */
  const out = [];
  for (let k = 0; k < 5; k++) {
    /** @type {Env} */
    const env = {};
    names.forEach((n, i) => { const ps = nonneg(n) ? [2, 3, 5, 4, 9] : PROBE_VALUES; env[n] = q(ps[(k + 2 * i) % ps.length]); });
    out.push(env);
  }
  return out;
}

/**
 * Exact agreement of two expressions at every point where both are defined.
 * @param {Problem} p @param {Node} a @param {Node} b
 * @returns {{ defined: number; differs: boolean }}
 */
function compareAtPoints(p, a, b) {
  let defined = 0;
  let differs = false;
  for (const env of points(p, [a, b])) {
    const x = evaluate(a, env);
    const y = evaluate(b, env);
    if (!x || !y) continue;
    defined++;
    if (!seq(x, y)) differs = true;
  }
  return { defined, differs };
}

/** The typed item: a tap item's typed follow-up, or the item itself. @param {Problem} p */
function typedItem(p) { return p.constructed ? p : followUp(p); }

/** Does the item have a typed key at all? @param {Problem} p */
function hasTypedKey(p) {
  if (p.constructed) return true;
  return p.interaction === 'nextline' || p.interaction === 'twin' || p.interaction === 'forge';
}

/** Typed forms of the key that must all be judged correct. @param {Problem} p @returns {string[]} */
function typedForms(p) {
  const spec = p.answer;
  const base = answerText(spec);
  const x = spec.expected;
  const out = [base, `  ${base} `];
  if (!(isSolutionSet(x) && x.kind !== 'finite')) out.push(base.replaceAll(' ', '')); // "no solution" is a keypad word
  if (spec.kind === 'expr' || spec.kind === 'form-of-1') out.push(`(${base})`);
  if (isEquation(x)) out.push(`${print(x.rhs)} = ${print(x.lhs)}`);
  if (isSolutionSet(x) && x.kind === 'finite') {
    const texts = x.roots.map((r) => print(surdToNode(r)));
    out.push(texts.slice().reverse().join(', '));
    const v = p.variableKeys.length === 1 ? p.variableKeys[0] : undefined;
    if (v) out.push(texts.map((t) => `${v} = ${t}`).join(', '));
    out.push([...texts, texts[0]].join(',')); // a repeated root is the same set
  }
  if (Array.isArray(x)) out.push(x.map((n) => `(${print(n)})`).join(','));
  return [...new Set(out)];
}

// ---------------------------------------------------------------- per-item checks

/** @param {Generator} gen @param {Problem} p @param {{ difficulty: number; interaction: Interaction; fadeLevel: number }} o @param {string} seed */
function checkShape(gen, p, o, seed) {
  must(p && typeof p === 'object', 'generate() did not return a Problem');
  must(p.gen === gen.id && p.version === gen.version && p.skill === gen.skill, `gen / version / skill do not match the generator: ${p.gen} ${p.version} ${p.skill}`);
  must(p.seed === seed, `problem.seed is ${dump(p.seed)}, not the seed of the rng passed to generate()`);
  must(typeof p.id === 'string' && p.id.includes(seed) && p.id.includes(gen.id), `problem.id ${dump(p.id)} must contain the generator id and the seed`);
  must(p.difficulty === o.difficulty && p.interaction === o.interaction && p.fadeLevel === o.fadeLevel, 'difficulty / interaction / fadeLevel do not match the request');
  must(p.constructed === expectConstructed(p.interaction, p.fadeLevel), `constructed is ${p.constructed}; the planner expects ${expectConstructed(p.interaction, p.fadeLevel)}`);
  must(p.prompt && typeof p.prompt.verb === 'string' && p.prompt.verb.length > 0 && p.prompt.math, 'prompt.verb / prompt.math missing');
  must(/^[\x20-\x7e]*$/.test(p.prompt.verb + (p.prompt.goal ?? '')), 'prompt text must be plain ASCII');
  must(Array.isArray(p.assumptions) && Array.isArray(p.variableKeys) && Array.isArray(p.visuals) && Array.isArray(p.probes), 'assumptions / variableKeys / visuals / probes must be arrays');
  const errs = validateSpec(p.answer);
  must(errs.length === 0, `invalid AnswerSpec: ${errs.join('; ')}`);
  must(p.variableKeys.every((k) => /^[A-Za-z]$/.test(k)), `variableKeys must be single letters: ${dump(p.variableKeys)}`);
  if (p.constructed) {
    const typedVars = Array.isArray(p.answer.expected) ? p.answer.expected.flatMap((n) => vars(n)) : isSolutionSet(p.answer.expected) ? [] : vars(p.answer.expected);
    for (const v of typedVars) must(p.variableKeys.includes(v), `the key uses ${v} but variableKeys ${dump(p.variableKeys)} has no key for it`);
    if (p.answer.kind === 'solution-set') must(p.variableKeys.length === 1, 'a solve item needs exactly one variable key');
  }
  for (const v of p.visuals) must(VISUALS.includes(v), `unknown visual ${dump(v)}`);
  if (p.fadeLevel === 3) must(p.visuals.length === 0, 'fade 3 is symbol-only: visuals must be empty');
  for (const env of p.probes) {
    for (const [name, val] of Object.entries(env)) {
      must(p.variableKeys.includes(name), `probe variable ${name} is not in variableKeys`);
      const nonneg = p.assumptions.some((a) => a.name === name && (a.rel === 'nonneg' || a.rel === 'pos'));
      const pool = nonneg ? [...PROBE_VALUES_NONNEG, ...PROBE_VALUES_ROOT] : PROBE_VALUES;
      must(pool.some((k) => qeq(q(k), val)), `probe ${name} = ${val.n}/${val.d} is outside the section 3 set ${dump(pool)}`);
    }
  }
  const choices = p.choices ?? [];
  if (p.constructed) must(choices.length === 0, 'a constructed item must not carry choices');
  else must(choices.length >= 2, `a ${p.interaction} item that is not constructed needs choices`);
  must(new Set(choices.map((c) => c.id)).size === choices.length, 'choice ids are not unique');
  if (p.interaction === 'why') must(p.variant !== undefined && KNOWN_WHY.includes(p.variant), `a Why needs variant ${KNOWN_WHY.join(' / ')}, got ${dump(p.variant)}`);
  if (p.interaction === 'cast') must(typeof gen.alphabet === 'function' && p.moveGraph !== undefined, 'a Cast item needs generator.alphabet and problem.moveGraph');
  if (p.interaction === 'twin') must(p.prompt.twin !== undefined, 'a Twin item needs prompt.twin');
}

/** @param {Node | Equation} x @param {string} what */
function checkRadicands(x, what) {
  /** @param {Node} n */
  const bad = (n) => some(n, (m) => {
    if (m.t !== 'root' || vars(m.radicand).length > 0) return false;
    const val = constValue(m.radicand);
    return !val || ssign(val) < 0;
  });
  must(!(isEquation(x) ? bad(x.lhs) || bad(x.rhs) : bad(x)), `${what} ${print(unblank(x))} has a negative or uncomputable radicand`);
}

/** @param {Problem} p */
function checkTrees(p) {
  const trees = displayedTrees(p);
  for (const raw of trees) {
    checkRadicands(raw, 'displayed tree');
    const x = unblank(raw);
    const text = print(x);
    const back = parse(text);
    must(!('error' in back), `print/parse round trip: ${dump(text)} does not parse (${'error' in back ? back.error : ''})`);
    const again = /** @type {Node | Equation} */ (back);
    must(print(again) === text, `print/parse round trip: ${dump(text)} reprints as ${dump(print(again))}`);
    must(isEquation(again) === isEquation(x), `print/parse round trip: ${dump(text)} changed kind`);
    if (isEquation(again) && isEquation(x)) {
      must(sameSides(again, x, p.assumptions) !== false, `print/parse round trip: ${dump(text)} parses to a different line`);
    } else if (!isEquation(again) && !isEquation(x)) {
      must(equivExpr(again, x, p.assumptions).equal !== false, `print/parse round trip: ${dump(text)} parses to a different value`);
    }
    try { renderMath(raw); } catch (err) { throw new Error(`renderMath threw on ${dump(text)}: ${err instanceof Error ? err.message : err}`); }
    must(fitsDisplay(raw), `${dump(text)} does not fit the display width cap (render/mathdom.js fitsDisplay)`);
  }
  if (p.interaction === 'why' && (p.variant === 'hidden-1' || p.variant === 'hidden-0')) {
    for (const c of p.choices ?? []) {
      const a = genNodeAtPath(p.prompt.math, c.id);
      const b = domNodeAtPath(p.prompt.math, c.id);
      must(a !== undefined && a === b && dump(a) === dump(c.display), `Why target ${dump(c.id)} is not the sub-expression at that data-path`);
    }
  }
}

/**
 * Answer key, way (A): exact substitution / evaluation.
 * @param {Problem} p @param {SuiteOpts} opts
 */
function checkKeyA(p, opts) {
  const spec = p.answer;
  const x = spec.expected;
  const math = p.prompt.math;
  const as = p.assumptions;
  if (p.interaction === 'why' && (p.variant === 'hidden-1' || p.variant === 'hidden-0')) {
    const target = (p.choices ?? []).find((c) => c.verdict === 'correct');
    must(target !== undefined && isNode(target.display), 'a hidden-1 / hidden-0 Why needs one correct target');
    const want = p.variant === 'hidden-1' ? SONE : SZERO;
    let defined = 0;
    for (const env of points(p, [/** @type {Node} */ (target.display)])) {
      const v = evaluate(/** @type {Node} */ (target.display), env);
      if (!v) continue;
      defined++;
      must(seq(v, want), `the correct Why target ${print(/** @type {Node} */ (target.display))} is not worth ${p.variant === 'hidden-1' ? 1 : 0}`);
    }
    must(defined > 0, 'the correct Why target cannot be evaluated');
    // no second right answer: a wrong target is not itself worth the 1 (or 0) at every point
    for (const c of p.choices ?? []) {
      if (c === target || !isNode(c.display)) continue;
      const vals = points(p, [/** @type {Node} */ (c.display)]).map((env) => evaluate(/** @type {Node} */ (c.display), env)).filter((v) => v !== undefined);
      must(vals.length === 0 || !vals.every((v) => seq(/** @type {any} */ (v), want)), `the wrong Why target ${print(/** @type {Node} */ (c.display))} is also worth ${p.variant === 'hidden-1' ? 1 : 0}`);
    }
    const mine = opts.independentKey ? opts.independentKey(p) : undefined;
    must(mine !== undefined, 'no independent path names the hidden target: return its data-path from opts.independentKey(problem)');
    must(mine === target.id, `independentKey names target ${dump(mine)}; the item marks ${dump(target.id)} correct`);
    return;
  }
  if (p.interaction === 'trace' && !p.constructed) {
    const steps = p.steps ?? [];
    must(steps.length >= 3 && steps.length <= 5, `a Trace shows a 3-5 line worked solution (section 3 I6); this one has ${steps.length}`);
    const bad = steps.findIndex((s) => !s.legal);
    const want = bad < 0 ? TRACE_NONE : `L${bad}`;
    const right = (p.choices ?? []).filter((c) => c.verdict === 'correct').map((c) => c.id);
    must(right.length === 1 && right[0] === want, `the Trace marks ${dump(right)} correct; the chain's bad line is ${dump(want)}`);
    must((p.choices ?? []).some((c) => c.id === TRACE_NONE), 'a Trace needs the "No bad line" choice');
    return;
  }
  if (p.interaction === 'why' || p.interaction === 'cast') return;
  if (p.interaction === 'twin') {
    const twin = /** @type {Node | Equation} */ (p.prompt.twin);
    const label = (p.choices ?? []).find((c) => c.id === TWIN_SAME)?.verdict === 'correct';
    must((p.choices ?? []).some((c) => c.id === TWIN_SAME) && (p.choices ?? []).some((c) => c.id === TWIN_DIFFERENT), 'a Twin needs the choices "same" and "different"');
    if (isEquation(math) || isEquation(twin)) {
      must(isEquation(math) && isEquation(twin) && p.variableKeys.length === 1, 'an equation Twin needs two equations in one variable');
      const r = sameSolutions(/** @type {Equation} */ (math), /** @type {Equation} */ (twin), p.variableKeys[0]).equal;
      must(r === label, `Twin label says ${label ? 'same' : 'different'} but sameSolutions says ${r}`);
      return;
    }
    const r = equivExpr(math, twin, as).equal;
    must(r === label, `Twin label says ${label ? 'same' : 'different'} but equivExpr says ${r}`);
    const pts = compareAtPoints(p, math, twin);
    must(pts.defined > 0, 'Twin forms cannot be evaluated at any probe');
    if (label) must(!pts.differs, 'Twin labelled same, but the two forms differ at an exact point');
    else if (vars(math).length + vars(twin).length === 0) must(pts.differs, 'Twin labelled different, but the two numbers are equal');
    if (Array.isArray(x)) {
      must(x.length === 2, 'a different Twin pair keys both values');
      must(!compareAtPoints(p, x[0], math).differs && !compareAtPoints(p, x[1], twin).differs, 'the keyed values are not the values of the two forms');
    } else if (spec.kind === 'expr' && isNode(x) && vars(x).length === 0 && vars(math).length === 0) {
      must(!compareAtPoints(p, x, math).differs, 'the keyed common value is not the value of the forms');
    }
    return;
  }
  switch (spec.kind) {
    case 'expr': {
      const key = /** @type {Node} */ (x);
      if (p.variant === V_FILL_BLANK) {
        must(isEquation(math), 'fill-the-blank needs an equation');
        const fill = (/** @type {Node} */ side) => /** @type {Node} */ (JSON.parse(dump(side).replaceAll(`{"t":"var","name":"${BLANK}"}`, dump({ t: 'group', arg: key })), (_k, v) => (typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v)));
        const e = /** @type {Equation} */ (math);
        const pts = compareAtPoints(p, fill(e.lhs), fill(e.rhs));
        must(pts.defined > 0 && !pts.differs, 'the key does not balance the fill-the-blank equation');
        return;
      }
      const ref = opts.reference ? opts.reference(p) : undefined;
      const target = ref ?? (isEquation(math) ? undefined : math);
      must(target !== undefined, 'no reference value for this expr item: pass opts.reference(problem)');
      const pts = compareAtPoints(p, key, /** @type {Node} */ (target));
      must(pts.defined > 0, 'the key cannot be evaluated at any exact point');
      must(!pts.differs, `the key ${print(key)} does not have the value of ${print(/** @type {Node} */ (target))}`);
      return;
    }
    case 'form-of-1': case 'form-of-0': {
      const key = /** @type {Node} */ (x);
      const want = spec.kind === 'form-of-1' ? SONE : SZERO;
      let defined = 0;
      for (const env of points(p, [key])) {
        const v = evaluate(key, env);
        if (!v) continue;
        defined++;
        must(seq(v, want), `the reference ${print(key)} is not worth ${spec.kind === 'form-of-1' ? 1 : 0}`);
      }
      must(defined > 0, 'the reference coin cannot be evaluated');
      return;
    }
    case 'solution-set': {
      must(isEquation(math) && p.variableKeys.length === 1, 'a solve item needs an equation in one variable');
      const set = /** @type {import('../../types.d.ts').SolutionSet} */ (x);
      if (set.kind === 'finite') {
        for (const r of set.roots) {
          must(checkRoot(/** @type {Equation} */ (math), p.variableKeys[0], r) === true, `the keyed root ${print(surdToNode(r))} does not satisfy the equation`);
          if (!opts.allowRoots01 && p.variant !== V_ONE_WAY) must(!seq(r, SZERO) && !seq(r, SONE), `root ${print(surdToNode(r))}: no 0 or 1 solutions (opts.allowRoots01 to permit)`);
        }
      }
      return;
    }
    case 'equation-sides': {
      must(isEquation(math) && p.prompt.move, 'an equation-sides item needs an equation and prompt.move');
      const raw = applyMove(/** @type {Move} */ (p.prompt.move), /** @type {Equation} */ (math));
      must(sameSides(/** @type {Equation} */ (x), raw, as) === true, 'the key is not the stated move applied to both sides of the original');
      return;
    }
    case 'equation-multiple': {
      must(isEquation(math) && sameSides(/** @type {Equation} */ (x), /** @type {Equation} */ (math), as) === true, 'an equation-multiple key must be the original line');
      return;
    }
    case 'tuple':
      must(typeof opts.independentKey === 'function', 'a tuple key has no built-in check: pass opts.independentKey');
  }
}

/**
 * Answer key, way (B): an independent path; plus the judge on typed forms.
 * @param {Problem} p @param {SuiteOpts} opts
 */
function checkKeyB(p, opts) {
  if (!hasTypedKey(p)) return;
  const spec = p.answer;
  const item = typedItem(p);
  const math = p.prompt.math;
  let independent = false;
  if (spec.kind === 'solution-set' && isEquation(math)) {
    const s = solve(math, p.variableKeys[0]);
    must(s !== undefined, 'solve.js cannot solve the item: it is unverifiable');
    must(sameSolutionSet(s, /** @type {import('../../types.d.ts').SolutionSet} */ (spec.expected)), 'solve.js disagrees with the keyed solution set');
    independent = true;
  }
  if (spec.kind === 'equation-sides' && isEquation(math) && p.prompt.move && p.variableKeys.length === 1) {
    if (classify(p.prompt.move, math, p.assumptions) === 'legal') {
      const r = sameSolutions(/** @type {Equation} */ (spec.expected), math, p.variableKeys[0]).equal;
      must(r === true, `the stated move is legal but the keyed line does not keep the solution set (sameSolutions: ${r})`);
      independent = true;
    }
  }
  const mine = opts.independentKey ? opts.independentKey(p) : undefined;
  if (mine !== undefined) {
    const j = judge(item, mine);
    must(j.verdict === 'correct', `independentKey gave ${dump(mine)}, judged ${j.verdict}${j.note ? ` (${j.note})` : ''}; the key is ${dump(answerText(spec))}`);
    independent = true;
  }
  must(independent, `no independent path verifies this key (kind ${spec.kind}): return it from opts.independentKey(problem)`);

  for (const text of [...typedForms(p), ...(opts.correctForms ? opts.correctForms(p) : [])]) {
    const j = judge(item, text);
    must(j.verdict === 'correct', `the correct answer typed as ${dump(text)} is judged ${j.verdict}${j.note ? ` (${j.note})` : ''}${j.error ? ` [${j.error}]` : ''}`);
  }
  for (const text of (opts.notCorrect ? opts.notCorrect(p) : [])) {
    const j = judge(item, text);
    must(j.verdict !== 'correct' && j.verdict !== 'unverifiable', `${dump(text)} must not be correct, but is judged ${j.verdict}`);
  }
  const none = diagnose(item, /** @type {any} */ (spec.expected));
  must(none.misconceptions.length === 0, `the correct answer is tagged ${none.misconceptions.join(', ')}`);
}

/** @param {Problem} p */
function checkSideWise(p) {
  if (p.answer.kind !== 'equation-sides' || !isEquation(p.prompt.math)) return;
  const want = /** @type {Equation} */ (p.answer.expected);
  const orig = judgeParsed(p, p.prompt.math);
  must(orig.verdict === 'wrong', `retyping the original line is judged ${orig.verdict}, not wrong`);
  const v = p.variableKeys[0];
  const s = v ? solve(p.prompt.math, v) : undefined;
  if (v && s && s.kind === 'finite' && s.roots.length === 1) {
    /** @type {Equation} */
    const solved = { t: 'eq', lhs: { t: 'var', name: v }, rhs: surdToNode(s.roots[0]) };
    if (sameSides(solved, want, p.assumptions) !== true) {
      const j = judgeParsed(p, solved);
      must(j.verdict === 'wrong', `jumping to the solved line ${print(solved)} is judged ${j.verdict}, not wrong`);
    }
  }
}

/** @param {Problem} p */
function checkChoices(p) {
  const choices = p.choices ?? [];
  if (choices.length === 0) return;
  const right = choices.filter((c) => c.verdict === 'correct' || c.verdict === 'progress');
  if (p.interaction === 'cast') must(right.length >= 1, 'a Cast item needs at least one progress chip');
  else must(right.length === 1, `exactly one choice must be correct, found ${right.length}`);
  for (const c of choices) {
    const j = judge(p, c.id, { tapped: true });
    must(j.verdict !== 'unverifiable' && j.verdict !== 'unparsed', `choice ${c.id} is judged ${j.verdict}${j.error ? ` (${j.error})` : ''}${j.labelMismatch ? ' [label disagrees with the math]' : ''}`);
    const want = c.verdict === 'progress' ? 'correct' : c.verdict === 'illegal' ? 'wrong' : c.verdict;
    must(j.verdict === want, `choice ${c.id} is labelled ${c.verdict} but judged ${j.verdict}`);
    const d = diagnose(p, c.id);
    if (c.verdict === 'correct' || c.verdict === 'progress' || c.verdict === 'legal-idle') {
      must(c.malrule === undefined, `choice ${c.id} is ${c.verdict} but carries the tag ${c.malrule}`);
      must(d.misconceptions.length === 0, `the ${c.verdict} choice ${c.id} is diagnosed as ${d.misconceptions.join(', ')}`);
      continue;
    }
    if (c.malrule !== undefined) {
      must(malrules.some((r) => r.id === c.malrule), `choice ${c.id} is tagged with an unknown mal-rule ${dump(c.malrule)}`);
      must(d.misconceptions.length === 1 && d.misconceptions[0] === c.malrule && !d.ambiguous,
        `tag honesty: choice ${c.id} is tagged ${c.malrule} but re-running the mal-rules gives ${dump(d.misconceptions)}`);
    } else {
      must(d.misconceptions.length === 0, `choice ${c.id} has no tag but is the output of ${d.misconceptions.join(', ')}`);
      must(p.interaction !== 'nextline', `distractors are only mal-rule outputs: wrong choice ${c.id} has no mal-rule tag`);
    }
  }
  if (p.interaction === 'why' || p.interaction === 'twin' || p.interaction === 'trace') return;
  for (let i = 0; i < choices.length; i++) {
    for (let k = i + 1; k < choices.length; k++) {
      const a = /** @type {any} */ (choices[i].display);
      const b = /** @type {any} */ (choices[k].display);
      if (typeof a.t === 'string' && typeof b.t === 'string' && p.interaction === 'forge') {
        must(print(a) !== print(b), `choices ${choices[i].id} and ${choices[k].id} are written the same (${print(a)})`);
      } else if (typeof a.t === 'string' && typeof b.t === 'string') {
        if (isEquation(a) !== isEquation(b)) continue;
        const same = isEquation(a) ? sameSides(a, b, p.assumptions) : equivExpr(a, b, p.assumptions).equal;
        must(same === false, `choices ${choices[i].id} and ${choices[k].id} are not provably different (${print(a)} vs ${print(b)})`);
      } else {
        must(dump(a) !== dump(b), `choices ${choices[i].id} and ${choices[k].id} are the same chip`);
      }
    }
  }
}

/** @param {Problem} p @param {Stats} stats */
function checkDetector(p, stats) {
  const sep = separated(p);
  must(sep.ok, `mal-rule separation: ${sep.why}`);
  for (const rule of malrules) {
    for (const s of simulate(rule, p)) {
      const j = judge(p, s.response, { tapped: s.tapped });
      const miss = j.verdict === 'wrong' || (j.verdict === 'risky' && s.tapped);
      must(miss, `detector: a student applying ${rule.id} answers ${dump(s.response)}, which is judged ${j.verdict}${j.note ? ` (${j.note})` : ''}, not a miss`);
      const d = diagnoseJudged(p, j);
      must(d.misconceptions.length === 1 && d.misconceptions[0] === rule.id && !d.ambiguous,
        `detector: a student applying ${rule.id} answers ${dump(s.response)} and is tagged ${dump(d.misconceptions)}${d.ambiguous ? ' (ambiguous)' : ''}`);
      stats.tagged[rule.id] = (stats.tagged[rule.id] ?? 0) + 1;
    }
  }
}

/** @param {Generator} gen @param {Problem} p @param {SuiteOpts} opts */
function checkCast(gen, p, opts) {
  if (p.interaction !== 'cast') return;
  const math = p.prompt.math;
  must(isEquation(math), 'a Cast prompt must be an equation');
  must(typeof opts.isGoal === 'function', 'Cast checks need opts.isGoal(state, problem)');
  const alphabet = /** @type {(s: Equation) => Move[]} */ (gen.alphabet);
  const isGoal = (/** @type {Equation} */ s) => /** @type {(s: Equation, p: Problem) => boolean} */ (opts.isGoal)(s, p);
  const as = p.assumptions;
  const start = canonicalize(/** @type {Equation} */ (math), as);
  for (const s of [start]) must(alphabet(s).length <= 12, `alphabet(state) offers ${alphabet(s).length} moves; the cap is 12`);
  const here = search(start, alphabet, isGoal, { as });
  must(!here.capped, 'the BFS hit the node cap');
  must(here.found !== undefined && here.found.distance <= DEFAULT_MAX_DEPTH, 'no path to the solved form within 6 moves');
  const g = /** @type {{ distance: number; minPath: Move[] }} */ (p.moveGraph);
  must(g.distance === here.found.distance, `moveGraph.distance is ${g.distance}; a fresh search gives ${here.found.distance}`);
  must(g.minPath.length === g.distance, 'minPath length is not the distance');
  let state = start;
  g.minPath.forEach((m, i) => {
    must(classify(m, state, as) === 'legal', `minPath move ${i + 1} is not legal`);
    state = step(m, state, as);
  });
  must(isGoal(state), 'replaying minPath does not reach the goal');
  const v = p.variableKeys[0];
  for (const c of p.choices ?? []) {
    const m = /** @type {Move} */ (c.display);
    must(typeof m.op === 'string' && !('t' in m), `Cast choice ${c.id} is not a Move`);
    const verdict = classify(m, start, as);
    const label = c.verdict === 'progress' || c.verdict === 'legal-idle' ? 'legal' : c.verdict;
    must(verdict === label, `chip ${c.id} is labelled ${c.verdict}; classify() says ${verdict}`);
    if ((m.op === 'mul' || m.op === 'div') && m.operand) {
      const free = vars(m.operand).filter((n) => !as.some((a) => a.name === n && (a.rel === 'nonzero' || a.rel === 'pos')));
      if (free.length > 0) must(c.verdict !== 'progress' && c.verdict !== 'legal-idle', `chip ${c.id} multiplies or divides by an undeclared variable expression and is labelled ${c.verdict}`);
    }
    if (verdict === 'legal') {
      const there = search(step(m, start, as), alphabet, isGoal, { as });
      must(!there.capped, `the BFS after chip ${c.id} hit the node cap`);
      const dist = there.found ? there.found.distance : Infinity;
      must((dist < g.distance) === (c.verdict === 'progress'), `chip ${c.id} is labelled ${c.verdict}; distance after it is ${dist}, now ${g.distance}`);
      if (c.distance !== undefined) must(c.distance === dist, `chip ${c.id} says distance ${c.distance}; a fresh search gives ${dist}`);
    }
    if (p.variant === V_ONE_WAY && c.malrule !== undefined && v) {
      const ch = rootSetChange(/** @type {Equation} */ (math), applyMove(m, /** @type {Equation} */ (math)), v);
      must(ch !== undefined && ch.lost.length + ch.added.length > 0, `one-way chip ${c.id} is tagged ${c.malrule} but does not change the root set`);
    }
  }
}

/** @param {Problem} p */
function checkSteps(p) {
  const steps = p.steps ?? [];
  let bad = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    must(typeof s.legal === 'boolean' && s.line, `step ${i} is malformed`);
    if (s.malrule !== undefined) must(malrules.some((r) => r.id === s.malrule), `step ${i} is tagged with an unknown mal-rule ${dump(s.malrule)}`);
    if (i === 0) { must(s.legal, 'the first line of a chain cannot be the bad line'); continue; }
    const prev = steps[i - 1].line;
    must(isEquation(prev) === isEquation(s.line), `step ${i} changes between expression and equation`);
    /** @type {boolean | undefined} */
    let equal;
    if (isEquation(prev) && isEquation(s.line)) {
      must(p.variableKeys.length === 1, 'an equation chain needs exactly one variable key');
      equal = sameSolutions(prev, s.line, p.variableKeys[0]).equal;
      if (s.legal && s.move) must(sameSides(s.line, applyMove(s.move, prev), p.assumptions) === true, `step ${i} is not its stated move applied to the line before`);
    } else if (!isEquation(prev) && !isEquation(s.line)) {
      equal = equivExpr(prev, s.line, p.assumptions).equal;
    }
    must(equal !== undefined, `step ${i} cannot be verified against the line before`);
    if (s.legal) must(equal === true, `step ${i} (${print(s.line)}) is marked legal but is not equivalent to the line before`);
    else { bad++; must(equal === false, `step ${i} (${print(s.line)}) is the planted bad line but changes nothing`); }
  }
  must(bad <= 1, `a chain has at most one bad line, found ${bad}`);
}

/**
 * Generate the item twice from fresh rngs; throws unless both are identical.
 * @param {Generator} generator
 * @param {{ difficulty: number; interaction: Interaction; fadeLevel: number }} o
 * @param {string} seed
 * @returns {Problem}
 */
export function checkDeterminism(generator, o, seed) {
  const p = generator.generate(makeRng(seed), o);
  const again = generator.generate(makeRng(seed), o);
  must(dump(p) === dump(again), 'not deterministic: the same seed gave two different items');
  return p;
}

/**
 * Every per-item check, on one generated Problem; throws an Error that says
 * what is wrong. runGeneratorSuite() calls this for each seed (and adds the
 * generator / difficulty / interaction / seed prefix). Exported for the
 * harness's own tests (test/misc/harness-selftest.test.js); generator test
 * files call runGeneratorSuite() only.
 * @param {Generator} generator @param {Problem} p
 * @param {{ difficulty: number; interaction: Interaction; fadeLevel: number }} o the request
 * @param {string} seed @param {SuiteOpts} [opts] @param {Stats} [stats]
 */
export function checkItem(generator, p, o, seed, opts = {}, stats = { items: 0, tagged: {}, prompts: new Set(), variants: new Set() }) {
  checkShape(generator, p, o, seed);
  checkTrees(p);
  checkKeyA(p, opts);
  checkKeyB(p, opts);
  checkSideWise(p);
  checkChoices(p);
  checkDetector(p, stats);
  checkCast(generator, p, opts);
  checkSteps(p);
}

// ---------------------------------------------------------------- the suite

/**
 * Register the full property suite for one generator with node:test.
 * @param {Generator} generator
 * @param {SuiteOpts} [opts]
 */
export function runGeneratorSuite(generator, opts = {}) {
  const env = Number(process.env.KEYSTONE_SEEDS);
  const seeds = Number.isInteger(env) && env > 0 ? env : (opts.seeds ?? DEFAULT_SEEDS);
  const [lo, hi] = generator.difficulty;
  const difficulties = opts.difficulties ?? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const interactions = opts.interactions ?? generator.interactions;
  const fades = opts.fadeLevels ?? [0, 1, 2, 3];
  /** @type {Record<string, number>} */
  const tagged = {};
  /** @type {Set<string>} */
  const whyVariants = new Set();
  let ran = 0;

  describe(`generator ${generator.id}`, () => {
    test(`${generator.id}: the mal-rule registry is fresh (19 rules)`, () => {
      const files = readdirSync(join(ROOT, 'src', 'misc', 'malrules')).filter((f) => f.endsWith('.js')).sort();
      const reg = readFileSync(join(ROOT, 'src', 'misc', 'malrules.generated.js'), 'utf8');
      for (const f of files) assert.ok(reg.includes(`./malrules/${f}`), `malrules.generated.js is stale (no ${f}): run node scripts/gen-registry.js`);
      assert.equal(malrules.length, files.length, 'malrules.generated.js is stale: run node scripts/gen-registry.js');
      assert.equal(malrules.length, 19, 'section 5 lists 19 mal-rules');
      for (const id of opts.separates ?? []) assert.ok(malrules.some((r) => r.id === id), `opts.separates names an unknown mal-rule ${id}`);
    });

    test(`${generator.id}: metadata, and refusal of what it does not offer`, () => {
      assert.match(generator.id, /^[a-z0-9-]+\.[a-z0-9-]+$/, 'generator id is <skill>.<name>');
      assert.ok(generator.id.startsWith(`${generator.skill}.`), 'generator id starts with its skill id');
      assert.ok(Number.isInteger(generator.version) && generator.version >= 1);
      assert.ok(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && hi <= 4 && lo <= hi, 'difficulty is [lo, hi] within 1..4');
      assert.ok(generator.interactions.length > 0 && generator.interactions.every((i) => INTERACTIONS.includes(i)));
      if (generator.interactions.includes('cast')) assert.equal(typeof generator.alphabet, 'function', 'a Cast generator needs alphabet()');
      const ok = generator.interactions[0];
      const missing = /** @type {Interaction | undefined} */ (INTERACTIONS.find((i) => !generator.interactions.includes(/** @type {Interaction} */ (i))));
      if (missing) assert.throws(() => generator.generate(makeRng('x'), { difficulty: lo, interaction: missing, fadeLevel: 0 }), `must throw for interaction ${missing}`);
      for (const d of [lo - 1, hi + 1]) assert.throws(() => generator.generate(makeRng('x'), { difficulty: d, interaction: ok, fadeLevel: 0 }), `must throw for difficulty ${d}`);
      assert.throws(() => generator.generate(makeRng('x'), { difficulty: lo, interaction: ok, fadeLevel: 4 }), 'must throw for fadeLevel 4');
    });

    for (const difficulty of difficulties) {
      for (const interaction of interactions) {
        test(`${generator.id} d${difficulty} ${interaction}: ${seeds} seeds`, (t) => {
          /** @type {Stats} */
          const stats = { items: 0, tagged: {}, prompts: new Set(), variants: new Set() };
          for (let i = 0; i < seeds; i++) {
            const seed = `s${i}`;
            const fadeLevel = fades[i % fades.length];
            const o = { difficulty, interaction, fadeLevel };
            try {
              const p = checkDeterminism(generator, o, seed);
              checkItem(generator, p, o, seed, opts, stats);
              stats.items++;
              stats.prompts.add(print(unblank(p.prompt.math)) + (p.prompt.twin ? ` | ${print(unblank(p.prompt.twin))}` : ''));
              if (p.variant) stats.variants.add(p.variant);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              throw new Error(`[${generator.id} d${difficulty} ${interaction} fade${fadeLevel} seed ${JSON.stringify(seed)}] ${msg}`, { cause: err });
            }
          }
          const need = Math.min(opts.minDistinct ?? 8, seeds);
          assert.ok(stats.prompts.size >= need, `[${generator.id} d${difficulty} ${interaction}] only ${stats.prompts.size} distinct prompts in ${seeds} seeds (need ${need} for Echo siblings)`);
          for (const [id, n] of Object.entries(stats.tagged)) tagged[id] = (tagged[id] ?? 0) + n;
          if (interaction === 'why') for (const v of stats.variants) whyVariants.add(v);
          ran += stats.items;
          t.diagnostic(`${stats.items} items, ${stats.prompts.size} distinct prompts; detected: ${Object.entries(stats.tagged).map(([k, n]) => `${k} x${n}`).join(', ') || 'none'}`);
        });
      }
    }

    test(`${generator.id}: coverage (separates, counting Why)`, (t) => {
      assert.ok(ran > 0, 'no items ran (did an earlier test fail?)');
      for (const id of opts.separates ?? []) {
        assert.ok((tagged[id] ?? 0) > 0, `[${generator.id}] opts.separates lists ${id}, but no item detected it`);
      }
      if (interactions.includes('why')) {
        assert.ok([...whyVariants].some((v) => COUNTING_WHY_VARIANTS.includes(v)), `[${generator.id}] offers 'why' but produced no counting Why variant (${COUNTING_WHY_VARIANTS.join(' / ')})`);
      }
      t.diagnostic(`${ran} items in all; mal-rules detected: ${Object.keys(tagged).sort().join(', ') || 'none'}`);
    });
  });
}

/** Re-exported for test files that build their independent key from the prompt text. */
export { print, makeRng, sq };
