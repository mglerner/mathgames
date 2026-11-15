// @ts-check
// Content audit (DESIGN.md section 11). Prints the skill x generator coverage
// matrix and the sampled content checks, and exits nonzero on a failure.
//
// Two parts:
//   audit(skills, generators, malrules, opts)        structural, no generation:
//     - a required skill has no generator. Required = the 12 slice skills.
//       --allow-missing downgrades ONLY this check to a warning.
//     - a served skill (one with >= 1 generator) has no box 0-1 interaction
//       (I4 forge, I2 nextline, I5 twin, I3 predict; section 6) or no 'why'
//       interaction.
//     - a generator names an unknown skill, has a duplicate id, a bad
//       difficulty range, or a cast interaction without alphabet().
//     - a mal-rule names an unknown skill or has a duplicate id.
//   auditItems(skills, generators, malrules, opts)   sampled, async: every
//     generator x difficulty x interaction it offers, `seeds` seeds each
//     (default 300, seeds "s0".."s<n-1>", fade levels 0-3 in rotation, the
//     same seeds and rotation as test/gen/harness.js, so a failure replays
//     with generator.generate(makeRng(seed), { difficulty, interaction, fadeLevel })).
//     - generate() throws               FAIL (the generator cannot serve that cell)
//     - unverifiable answers            the keyed answer is judged: the typed key
//                                       (on its typed follow-up for a tap item)
//                                       and every choice as a tap. FAIL on any
//                                       'unverifiable' / 'unparsed', on a typed
//                                       key not judged 'correct', and on a
//                                       correct / progress choice not judged
//                                       'correct'. Also FAIL when a simulated
//                                       mal-rule student's response is judged
//                                       'unverifiable' (a real student types it).
//     - negative radicands              every root and every rational power
//                                       (non-integer constant exponent) in the
//                                       prompt, twin, stated move, choices (Move
//                                       operands too), answer, worked steps and
//                                       their moves, and moveGraph path. A
//                                       constant radicand must be exactly >= 0.
//                                       A radicand with variables must be a
//                                       polynomial with every coefficient >= 0
//                                       in which each variable NOT declared
//                                       x >= 0 (nonneg / pos) has only even
//                                       exponents: that is a proof it is >= 0
//                                       wherever the item lives. Anything else
//                                       FAILS ("cannot show >= 0"). A radicand
//                                       holding the fill-the-blank placeholder
//                                       is checked with the key and with each
//                                       choice put in the blank. Solution-set
//                                       surd radicands must be > 0.
//     - mal-rule separation             for each mal-rule, at least one item on
//                                       which a simulated student applying it
//                                       (diagnose.js simulate) is judged a miss
//                                       ('wrong', or 'risky' on a tap) and tagged
//                                       with that rule alone, not ambiguous: the
//                                       detector check of test/gen/harness.js.
//                                       A rule with no such item FAILS, unless
//                                       none of its skills has a generator yet:
//                                       then it is listed as "pending content".
//     - counting Why                    each served skill must produce at least
//                                       one counting Why form, by the learner's
//                                       own test (learner/mastery.js
//                                       isCountingWhyForm: a 'why' item with
//                                       variant hidden-1 / hidden-0 / repair, or
//                                       a constructed repair Trace). A
//                                       'which-invariant' Why does not count.
//   A sampled audit is evidence, not proof: a defect on a seed beyond the
//   sample is not seen. The property suite (5000 seeds) is the deeper check.
//
// Run: node scripts/audit.js [--allow-missing] [--seeds N]

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { genRegistry } from './gen-registry.js';

/** @typedef {import('../types.d.ts').Generator} Generator */
/** @typedef {import('../types.d.ts').MalRule} MalRule */
/** @typedef {import('../types.d.ts').SkillDef} SkillDef */
/** @typedef {import('../types.d.ts').Interaction} Interaction */
/** @typedef {import('../types.d.ts').Problem} Problem */
/** @typedef {import('../types.d.ts').Node} Node */
/** @typedef {import('../types.d.ts').Equation} Equation */
/** @typedef {import('../types.d.ts').Move} Move */
/** @typedef {import('../types.d.ts').Assumption} Assumption */

/** Column order and short labels (I1..I8, section 3). */
const INTERACTIONS = /** @type {const} */ ([
  ['cast', 'I1'], ['nextline', 'I2'], ['predict', 'I3'], ['forge', 'I4'],
  ['twin', 'I5'], ['trace', 'I6'], ['why', 'I7'], ['strike', 'I8'],
]);
const BOX01 = new Set(['forge', 'nextline', 'twin', 'predict']);
export const DEFAULT_AUDIT_SEEDS = 300;

/**
 * Pure audit over in-memory data, so tests can feed it fixtures.
 * @param {readonly SkillDef[]} skills
 * @param {readonly Generator[]} generators
 * @param {readonly MalRule[]} malrules
 * @param {{ allowMissing?: boolean }} [opts]
 * @returns {{ ok: boolean; failures: string[]; warnings: string[]; lines: string[] }}
 */
export function audit(skills, generators, malrules, opts = {}) {
  /** @type {string[]} */ const failures = [];
  /** @type {string[]} */ const warnings = [];
  /** @type {string[]} */ const lines = [];
  const ids = new Set(skills.map((s) => s.id));

  /** @type {Map<string, Generator[]>} */
  const bySkill = new Map(skills.map((s) => [s.id, []]));
  const genIds = new Set();
  for (const g of generators) {
    if (genIds.has(g.id)) failures.push(`generator ${g.id}: duplicate id`);
    genIds.add(g.id);
    const list = bySkill.get(g.skill);
    if (!list) { failures.push(`generator ${g.id}: unknown skill ${JSON.stringify(g.skill)}`); continue; }
    list.push(g);
    const [lo, hi] = g.difficulty ?? [];
    if (!(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && hi <= 4 && lo <= hi)) {
      failures.push(`generator ${g.id}: difficulty must be [lo, hi] with 1 <= lo <= hi <= 4`);
    }
    if (!Array.isArray(g.interactions) || g.interactions.length === 0) {
      failures.push(`generator ${g.id}: no interactions`);
    } else if (g.interactions.includes('cast') && typeof g.alphabet !== 'function') {
      failures.push(`generator ${g.id}: cast generator without alphabet()`);
    }
  }

  const mrIds = new Set();
  for (const m of malrules) {
    if (mrIds.has(m.id)) failures.push(`mal-rule ${m.id}: duplicate id`);
    mrIds.add(m.id);
    for (const s of m.skills ?? []) if (!ids.has(s)) failures.push(`mal-rule ${m.id}: unknown skill ${JSON.stringify(s)}`);
  }

  const pad = (/** @type {string} */ x, /** @type {number} */ w) => x.padEnd(w);
  const idW = Math.max(...skills.map((s) => s.id.length), 5);
  lines.push(`${pad('n', 3)} ${pad('skill', idW)} ${pad('zone', 12)} S  gens d1 d2 d3 d4 ${INTERACTIONS.map(([, l]) => l).join(' ')}`);
  for (const s of skills) {
    const gs = bySkill.get(s.id) ?? [];
    const inter = new Set(gs.flatMap((g) => g.interactions ?? []));
    const dcov = [1, 2, 3, 4].map((d) => gs.some((g) => g.difficulty && g.difficulty[0] <= d && d <= g.difficulty[1]) ? ' x' : ' .');
    const icov = INTERACTIONS.map(([k]) => (inter.has(/** @type {Interaction} */ (k)) ? ' x' : ' .'));
    lines.push(`${pad(String(s.n), 3)} ${pad(s.id, idW)} ${pad(s.zone, 12)} ${s.slice ? 'S' : ' '}  ${String(gs.length).padStart(4)} ${dcov.join(' ')} ${icov.join(' ')}`);

    if (gs.length === 0) {
      if (s.slice) {
        const msg = `skill ${s.id}: slice skill has no generator`;
        (opts.allowMissing ? warnings : failures).push(msg);
      }
      continue;
    }
    if (![...inter].some((k) => BOX01.has(k))) failures.push(`skill ${s.id}: no box 0-1 interaction (forge/nextline/twin/predict)`);
    if (!inter.has('why')) failures.push(`skill ${s.id}: no Why form`);
  }
  const served = skills.filter((s) => (bySkill.get(s.id) ?? []).length > 0).length;
  lines.push('');
  lines.push(`skills served: ${served}/${skills.length}; generators: ${generators.length}; mal-rules registered: ${malrules.length} (spec: 19)`);
  return { ok: failures.length === 0, failures, warnings, lines };
}

// ---------------------------------------------------------------- sampled content checks

/**
 * The modules the sampled checks need. Loaded lazily: diagnose.js imports the
 * generated mal-rule registry, which the CLI regenerates first.
 */
export async function loadDeps() {
  const [prng, diag, judgeM, spec, common, ast, evalM, surd, poly, mastery] = await Promise.all([
    import('../src/gen/prng.js'), import('../src/misc/diagnose.js'), import('../src/check/judge.js'),
    import('../src/check/answer-spec.js'), import('../src/gen/common.js'), import('../src/math/ast.js'),
    import('../src/math/evaluate.js'), import('../src/math/surd.js'), import('../src/math/poly.js'),
    import('../src/learner/mastery.js'),
  ]);
  return {
    makeRng: prng.makeRng, simulate: diag.simulate, diagnoseJudged: diag.diagnoseJudged,
    judge: judgeM.judge, answerText: spec.answerText, isNode: spec.isNode, followUp: common.followUp, BLANK: common.BLANK,
    displayedTrees: common.displayedTrees, isEquation: ast.isEquation, some: ast.some, vars: ast.vars,
    constValue: evalM.constValue, constQ: evalM.constQ, ssign: surd.ssign, toPoly: poly.toPoly,
    polyTerms: poly.polyTerms, isCountingWhyForm: mastery.isCountingWhyForm,
  };
}
/** @typedef {Awaited<ReturnType<typeof loadDeps>>} Deps */

/** Does the item have a typed key? Mirrors test/gen/harness.js hasTypedKey. @param {Problem} p */
function hasTypedKey(p) {
  if (p.constructed) return true;
  return p.interaction === 'nextline' || p.interaction === 'twin' || p.interaction === 'forge';
}

/** @param {unknown} e */
function msgOf(e) { return e instanceof Error ? e.message : String(e); }

/**
 * Every radicand problem in an item, as short descriptions ([] = clean).
 * @param {Problem} p @param {Deps} D
 * @returns {string[]}
 */
export function radicandProblems(p, D) {
  const as = [...(p.assumptions ?? []), ...((p.answer && p.answer.assumptions) ?? [])];
  const nonneg = new Set(as.filter((a) => a.rel === 'nonneg' || a.rel === 'pos').map((a) => a.name));
  /** @type {string[]} */
  const out = [];
  // The fill-the-blank placeholder stands for a value the item supplies: the
  // key, or a tapped choice. A radicand holding it is checked with each of
  // those put in its place (what the filled line shows), not as a variable.
  /** @type {Node[]} */
  const fills = [];
  if (D.isNode(p.answer.expected)) fills.push(/** @type {Node} */ (p.answer.expected));
  for (const c of p.choices ?? []) if (D.isNode(c.display)) fills.push(/** @type {Node} */ (c.display));
  /** @param {Node} n @param {Node} v @returns {Node} */
  const fill = (n, v) => JSON.parse(JSON.stringify(n, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x))
    .replaceAll(`{"t":"var","name":"${D.BLANK}"}`, JSON.stringify({ t: 'group', arg: v }, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x))),
  (_k, x) => (typeof x === 'string' && /^-?\d+n$/.test(x) ? BigInt(x.slice(0, -1)) : x));
  /** @param {Node} r @param {string} where @returns {string | undefined} */
  const check = (r, where) => {
    const vs = D.vars(r);
    if (vs.includes(D.BLANK)) {
      if (fills.length === 0) return `${where}: radicand holds the blank and the item supplies no value for it`;
      for (const v of fills) {
        const bad = check(fill(r, v), `${where} (blank filled)`);
        if (bad) return bad;
      }
      return undefined;
    }
    if (vs.length === 0) {
      const v = D.constValue(r);
      if (!v) return `${where}: radicand cannot be computed`;
      if (D.ssign(v) < 0) return `${where}: negative radicand`;
      return undefined;
    }
    const poly = D.toPoly(r);
    if (!poly) return `${where}: radicand with variables is not a polynomial; cannot show >= 0`;
    for (const t of D.polyTerms(poly)) {
      if (t.coef.n < 0n) return `${where}: radicand with variables has a negative coefficient; cannot show >= 0`;
      for (const [name, e] of t.mono) {
        if (!nonneg.has(name) && Number(e) % 2 !== 0) return `${where}: radicand has ${name} (not declared ${name} >= 0) to an odd power`;
      }
    }
    return undefined;
  };
  /** @param {Node} n @param {string} where */
  const walk = (n, where) => {
    D.some(n, (m) => {
      /** @type {Node | undefined} */
      let r;
      if (m.t === 'root') r = m.radicand;
      else if (m.t === 'pow' && D.vars(m.exp).length === 0) {
        const e = D.constQ(m.exp);
        if (e === undefined) out.push(`${where}: exponent cannot be computed`);
        else if (e.d !== 1n) r = m.base;
      }
      if (r) { const bad = check(r, where); if (bad) out.push(bad); }
      return false;
    });
  };
  /** @param {unknown} x @param {string} where */
  const visit = (x, where) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach((y, i) => visit(y, `${where}[${i}]`)); return; }
    const o = /** @type {any} */ (x);
    if (o.t === 'eq') { walk(o.lhs, where); walk(o.rhs, where); return; }
    if (typeof o.t === 'string') { walk(o, where); return; }
    if (typeof o.op === 'string') { if (o.operand) walk(o.operand, `${where} operand`); return; }
    if (o.kind === 'finite' && Array.isArray(o.roots)) {
      for (const s of o.roots) for (const t of s.terms) if (!(t.rad > 0n)) out.push(`${where}: root with radicand ${t.rad}`);
    }
  };
  visit(p.prompt.math, 'prompt');
  visit(p.prompt.twin, 'twin');
  visit(p.prompt.move, 'prompt move');
  (p.choices ?? []).forEach((c) => visit(c.display, `choice ${c.id}`));
  visit(p.answer.expected, 'answer');
  (p.steps ?? []).forEach((s, i) => { visit(s.line, `step ${i}`); visit(s.move, `step ${i} move`); });
  if (p.moveGraph) visit(p.moveGraph.minPath, 'moveGraph');
  return [...new Set(out)];
}

/**
 * Judging problems of an item ([] = clean): unverifiable / unparsed anywhere,
 * a typed key not judged correct, a correct choice not judged correct.
 * @param {Problem} p @param {Deps} D
 * @returns {string[]}
 */
export function keyProblems(p, D) {
  /** @type {string[]} */
  const out = [];
  if (hasTypedKey(p)) {
    const item = p.constructed ? p : D.followUp(p);
    let text;
    try { text = D.answerText(p.answer); } catch (e) { out.push(`the key cannot be written as keypad text (${msgOf(e)})`); }
    if (text !== undefined) {
      const j = D.judge(item, text);
      if (j.verdict !== 'correct') out.push(`the key ${JSON.stringify(text)} is judged ${j.verdict}${j.note ? ` (${j.note})` : ''}`);
    }
  }
  for (const c of p.choices ?? []) {
    const j = D.judge(p, c.id, { tapped: true });
    if (j.verdict === 'unverifiable' || j.verdict === 'unparsed') out.push(`choice ${c.id} is judged ${j.verdict}${j.note ? ` (${j.note})` : ''}`);
    else if ((c.verdict === 'correct' || c.verdict === 'progress') && j.verdict !== 'correct') out.push(`choice ${c.id} is labelled ${c.verdict} but judged ${j.verdict}`);
  }
  return out;
}

/**
 * Detector pass on one item, exactly as test/gen/harness.js checkDetector does
 * it: for each rule, each simulated response is judged; a miss tagged with the
 * rule alone (not ambiguous) separates the rule. Unverifiable responses are
 * reported.
 * @param {Problem} p @param {readonly MalRule[]} rules @param {Deps} D
 * @returns {{ separates: string[]; unverifiable: string[] }}
 */
export function detectorPass(p, rules, D) {
  /** @type {string[]} */ const separates = [];
  /** @type {string[]} */ const unverifiable = [];
  for (const rule of rules) {
    for (const s of D.simulate(/** @type {any} */ (rule), p)) {
      const j = D.judge(p, s.response, { tapped: s.tapped });
      if (j.verdict === 'unverifiable') { unverifiable.push(`${rule.id} answers ${JSON.stringify(s.response)}`); continue; }
      const miss = j.verdict === 'wrong' || (j.verdict === 'risky' && s.tapped);
      if (!miss) continue;
      const d = D.diagnoseJudged(p, j);
      if (d.misconceptions.length === 1 && d.misconceptions[0] === rule.id && !d.ambiguous) { separates.push(rule.id); break; }
    }
  }
  return { separates, unverifiable };
}

/**
 * The sampled content audit (see the header).
 * @param {readonly SkillDef[]} skills
 * @param {readonly Generator[]} generators
 * @param {readonly MalRule[]} malrules
 * @param {{ seeds?: number }} [opts]
 * @returns {Promise<{ ok: boolean; failures: string[]; pending: string[]; lines: string[]; items: number }>}
 */
export async function auditItems(skills, generators, malrules, opts = {}) {
  const D = await loadDeps();
  const seeds = opts.seeds ?? DEFAULT_AUDIT_SEEDS;
  /** @type {string[]} */ const failures = [];
  /** @type {string[]} */ const pending = [];
  /** @type {string[]} */ const lines = [];
  const known = new Set(skills.map((s) => s.id));
  /** @type {Map<string, Set<string>>} rule id -> generator ids that separate it */
  const sepBy = new Map(malrules.map((r) => [r.id, new Set()]));
  /** @type {Map<string, boolean>} skill -> has a counting Why */
  const counting = new Map();
  /** @type {Map<string, { n: number; first: string }>} */
  const tally = new Map();
  const note = (/** @type {string} */ key, /** @type {string} */ example) => {
    const t = tally.get(key);
    if (t) t.n++; else tally.set(key, { n: 1, first: example });
  };
  let items = 0;

  for (const g of generators) {
    if (!known.has(g.skill) || !Array.isArray(g.interactions) || !Array.isArray(g.difficulty)) continue; // audit() reports these
    if (!counting.has(g.skill)) counting.set(g.skill, false);
    const [lo, hi] = g.difficulty;
    for (let difficulty = lo; difficulty <= hi; difficulty++) {
      for (const interaction of g.interactions) {
        for (let i = 0; i < seeds; i++) {
          const seed = `s${i}`;
          const fadeLevel = i % 4;
          const where = `${g.id} d${difficulty} ${interaction} fade${fadeLevel} seed "${seed}"`;
          /** @type {Problem} */
          let p;
          try { p = g.generate(D.makeRng(seed), { difficulty, interaction, fadeLevel }); } catch (e) {
            note(`${g.id} d${difficulty} ${interaction}: generate() throws`, `[${where}] ${msgOf(e)}`);
            continue;
          }
          items++;
          try {
            for (const m of radicandProblems(p, D)) note(`${g.id}: negative radicand`, `[${where}] ${m}`);
            for (const m of keyProblems(p, D)) note(`${g.id}: unverifiable or misjudged answer`, `[${where}] ${m}`);
            const det = detectorPass(p, malrules, D);
            for (const id of det.separates) sepBy.get(id)?.add(g.id);
            for (const m of det.unverifiable) note(`${g.id}: a mal-rule student's answer is unverifiable`, `[${where}] ${m}`);
            if (D.isCountingWhyForm(p)) counting.set(g.skill, true);
          } catch (e) {
            note(`${g.id}: audit check threw`, `[${where}] ${msgOf(e)}`);
          }
        }
      }
    }
  }
  for (const [key, { n, first }] of tally) failures.push(`${key} (${n} item${n === 1 ? '' : 's'}; first: ${first})`);

  const served = new Set(counting.keys());
  for (const [skill, has] of counting) {
    if (!has) failures.push(`skill ${skill}: no counting Why form (hidden-1 / hidden-0 / repair) in ${seeds} seeds per cell; a which-invariant Why does not count`);
  }

  lines.push('');
  lines.push(`sampled content checks: ${items} items (${seeds} seeds per generator x difficulty x interaction)`);
  lines.push('mal-rule separation (generators on which a student applying the rule is tagged with it alone):');
  const idW = Math.max(...malrules.map((r) => r.id.length), 5);
  for (const r of malrules) {
    const by = [...(sepBy.get(r.id) ?? [])].sort();
    let status;
    if (by.length > 0) status = by.join(', ');
    else if (!(r.skills ?? []).some((s) => served.has(s))) {
      status = `pending content (no generator yet for ${(r.skills ?? []).join(', ') || 'any skill'})`;
      pending.push(r.id);
    } else {
      status = 'NONE';
      failures.push(`mal-rule ${r.id}: no separating generator (its served skills: ${(r.skills ?? []).filter((s) => served.has(s)).join(', ')})`);
    }
    lines.push(`  ${r.id.padEnd(idW)}  ${status}`);
  }
  lines.push(`counting Why: ${[...counting].filter(([, h]) => h).length}/${counting.size} served skills`);
  if (pending.length) lines.push(`pending content (not failures): ${pending.join(', ')}`);
  return { ok: failures.length === 0, failures, pending, lines, items };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  genRegistry(root);
  const imp = (/** @type {string} */ p) => import(pathToFileURL(resolve(root, p)).href);
  const { skills } = await imp('src/data/skills.js');
  const { generators } = await imp('src/gen/registry.generated.js');
  const { malrules } = await imp('src/misc/malrules.generated.js');
  const si = process.argv.indexOf('--seeds');
  const seeds = si >= 0 ? Number(process.argv[si + 1]) : DEFAULT_AUDIT_SEEDS;
  if (!Number.isInteger(seeds) || seeds < 1) { console.error('--seeds N needs a positive integer'); process.exit(2); }
  const r = audit(skills, generators, malrules, { allowMissing: process.argv.includes('--allow-missing') });
  const c = await auditItems(skills, generators, malrules, { seeds });
  for (const l of [...r.lines, ...c.lines]) console.log(l);
  for (const w of r.warnings) console.log(`WARN ${w}`);
  const failures = [...r.failures, ...c.failures];
  for (const f of failures) console.log(`FAIL ${f}`);
  const ok = failures.length === 0;
  console.log(ok ? `audit: OK${r.warnings.length ? ` with ${r.warnings.length} warning(s) (--allow-missing)` : ''}${c.pending.length ? `; ${c.pending.length} mal-rule(s) pending content` : ''}` : `audit: FAILED (${failures.length})`);
  process.exitCode = ok ? 0 : 1;
}
