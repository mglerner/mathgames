// @ts-check
// The "realistic learner" timeline report (M2 follow-up). Not the M2 gate:
// timeline.test.js is the gate. This answers the teacher's question, "how far
// does a kid who finds Algebra 1 shaky get in 10 weeks?", for the learner
// model in sim.js (realisticStudent). Every number here is a simulation over
// modelling guesses; the report says so wherever it is printed.
//
// Run by hand:  node test/session/realistic-report.js [students] [json overrides]
//   e.g.        node test/session/realistic-report.js 300 '{"student":{"learnRate":0.1}}'
//               node test/session/realistic-report.js sensitivity [students]
//
// HOW TO READ IT (adversarial review, m2tune): the baseline is nearer an
// upper estimate than a central one. Its unmodelled or default-off effects
// mostly point the optimistic way (see sim.js REALISTIC), and "share reaching
// 100 EP" is a knife-edge number: a few sessions more or less moves it from
// near 0% to near 100%. Quote the RANGE printed by `sensitivity`, never the
// baseline share alone, and do not rank the levers from one-off rows: only
// the "common scale" rows (each input moved by the same +-10%) are comparable.

import { skills } from '../../src/data/skills.js';
import { epTotal, tierFor, wardenEligible } from '../../src/learner/season.js';
import { stubRegistry } from './stubs.js';
import { simulate, realisticStudent, weekdaysWithMisses, isoDate, dayOf, REALISTIC } from './sim.js';

export const PAIN_POINTS = Object.freeze([
  'frac-times-whole', 'rationalize-denominator', 'sqrt-product-rule', 'rational-exponents',
  'quadratic-to-standard', 'quadratic-formula',
]);
export const CLUSTER_IDS = Object.freeze(['balance', 'mint', 'stack', 'root', 'factor', 'quadratic', 'ridge']);
export const DAYS = 66; // days 0..65
export const MISS = 0.15;

/**
 * Quantile of a list in which null means "never" (sorted last).
 * @param {(number | null)[]} xs @param {number} f
 * @returns {number} Infinity for "never"
 */
export function quantile(xs, f) {
  const s = xs.map((x) => (x === null ? Infinity : x)).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))];
}

/** @param {(number | null)[]} xs */
export function spread(xs) {
  const v = (/** @type {number} */ f) => { const x = quantile(xs, f); return x === Infinity ? 'never' : String(x); };
  return `min ${v(0)} p10 ${v(0.1)} median ${v(0.5)} p90 ${v(0.9)} max ${v(1)}`;
}

/**
 * @param {{
 *   n?: number; seedPrefix?: string; miss?: number; days?: number;
 *   student?: Partial<typeof REALISTIC>; plannerParams?: object; learnerParams?: { evidenceGap?: number };
 * }} [o]
 */
export function realisticRun(o = {}) {
  const n = o.n ?? 300;
  const days = o.days ?? DAYS;
  const last = days - 1;
  const reg = stubRegistry();
  const A = skills.filter((d) => d.priority === 'A');
  const rows = [];
  for (let i = 0; i < n; i++) {
    const seed = `${o.seedPrefix ?? 'realistic'}${i}`;
    const student = realisticStudent(seed, o.student);
    /** @type {Record<string, number | null>} */
    const firstSeen = {};
    let probes = 0; let probeHits = 0; let items = 0; let firstTry = 0;
    const r = simulate({
      seed, days, student, registry: reg, watch: [...PAIN_POINTS], playDay: weekdaysWithMisses(seed, o.miss ?? MISS, days),
      plannerParams: o.plannerParams, learnerParams: o.learnerParams,
      onRun: ({ day, state, run }) => {
        for (const d of skills) if (firstSeen[d.id] === undefined && state.skills[d.id].seen) firstSeen[d.id] = day;
        for (const p of run.played) {
          if (p.item.kind === 'probe') { probes++; if (p.attempt.verdict === 'correct') probeHits++; } else { items++; if (p.attempt.verdict === 'correct') firstTry++; }
        }
      },
    });
    const st = r.state;
    const end = dayOf(`${isoDate(last)}T12:00:00-05:00`);
    const ep = epTotal(st);
    /** @type {Record<string, { seen: number; of: number; eligible: boolean }>} */
    const clusters = {};
    for (const c of CLUSTER_IDS) {
      const ids = skills.filter((d) => d.cluster === c).map((d) => d.id);
      clusters[c] = { seen: ids.filter((id) => st.skills[id].seen).length, of: ids.length, eligible: wardenEligible(st, c) };
    }
    rows.push({
      seed, ep, tier: tierFor(ep), gateDay: r.gateDay, runs: r.runs,
      mastered: A.filter((d) => st.skills[d.id].mastered).length,
      box2: A.filter((d) => st.skills[d.id].seen && st.skills[d.id].box >= 2).length,
      seen: A.filter((d) => st.skills[d.id].seen).length,
      ep3: A.filter((d) => st.skills[d.id].evidence.length >= 3).length,
      dueAtEnd: A.filter((d) => st.skills[d.id].seen && st.skills[d.id].lastReviewDay !== null && end >= st.skills[d.id].lastReviewDay + [0, 1, 2, 4, 8][st.skills[d.id].box]).length,
      clusters, balancePlanned: r.balancePlannedDay, balanceCleared: r.balanceClearedDay,
      firstEvidence: r.firstEvidence, firstSeen, probes, probeHits, items, firstTry, belowBand: r.belowBand,
      knownAtEnd: A.filter((d) => student.pSymbolic(d.id, last) >= 0.7).length,
    });
  }
  return rows;
}

/**
 * Text lines for a set of rows.
 * @param {ReturnType<typeof realisticRun>} rows
 */
export function reportLines(rows) {
  const n = rows.length;
  /** @param {number} k */
  const pct = (k) => `${Math.round((1000 * k) / n) / 10}%`;
  /** @param {(r: (typeof rows)[number]) => boolean} f */
  const share = (f) => pct(rows.filter(f).length);
  const lines = [
    `students ${n}; runs played in 66 days: ${spread(rows.map((r) => r.runs))}`,
    `first-try rate on non-probe items: ${Math.round((1000 * rows.reduce((t, r) => t + r.firstTry, 0)) / rows.reduce((t, r) => t + r.items, 0)) / 10}%; Charting probes hit: ${Math.round((1000 * rows.reduce((t, r) => t + r.probeHits, 0)) / Math.max(1, rows.reduce((t, r) => t + r.probes, 0))) / 10}% of ${Math.round(rows.reduce((t, r) => t + r.probes, 0) / n)} per student`,
    `EP on day 65 (of 120; Gate = 100): ${spread(rows.map((r) => r.ep))}`,
    `tier on day 65 (of 10): ${spread(rows.map((r) => r.tier))}; reached the Gate by EP: ${share((r) => r.gateDay !== null)}`,
    `share of students at or above EP 70 / 80 / 90 / 100 on day 65: ${[70, 80, 90, 100].map((e) => share((r) => r.ep >= e)).join(' / ')}`,
    `A-skills mastered on day 65 (of 40): ${spread(rows.map((r) => r.mastered))}`,
    `A-skills with all 3 evidence days: ${spread(rows.map((r) => r.ep3))}`,
    `A-skills at box 2 or higher: ${spread(rows.map((r) => r.box2))}`,
    `A-skills unlocked at all: ${spread(rows.map((r) => r.seen))}`,
    `A-skills the simulated learner really has (latent symbol-only rate >= 70% on day 65): ${spread(rows.map((r) => r.knownAtEnd))}`,
    `A-skills due or overdue on day 65: ${spread(rows.map((r) => r.dueAtEnd))}`,
    `Balance Warden first planned, day: ${spread(rows.map((r) => r.balancePlanned))}; by day 21: ${share((r) => r.balancePlanned !== null && r.balancePlanned <= 21)}; by day 65: ${share((r) => r.balancePlanned !== null)}`,
    'clusters on day 65 (median skills unlocked / size; share with every skill unlocked; share Warden-eligible):',
  ];
  for (const c of CLUSTER_IDS) {
    lines.push(`  ${c}: ${quantile(rows.map((r) => r.clusters[c].seen), 0.5)}/${rows[0].clusters[c].of}; all unlocked ${share((r) => r.clusters[c].seen === r.clusters[c].of)}; eligible ${share((r) => r.clusters[c].eligible)}`);
  }
  lines.push('pain points: day first unlocked (taught or placed) | day of first evidence | share with evidence by day 65');
  for (const id of PAIN_POINTS) {
    lines.push(`  ${id}: unlocked ${spread(rows.map((r) => r.firstSeen[id] ?? null))} | first evidence ${spread(rows.map((r) => r.firstEvidence[id]))} | ${share((r) => r.firstEvidence[id] !== null)}`);
  }
  return lines;
}

/** One-line caveat printed wherever the report is. */
export const CAVEAT = 'CAVEAT: learner parameters are guesses and the baseline sits at the optimistic end of them; treat the share reaching 100 EP as an upper estimate and quote the sensitivity range.';

const PLAYED = 1 - MISS;
/**
 * Variants for the sensitivity table. "common" rows move one input by the
 * same relative 10% (attendance = share of weekdays played); "pessimistic"
 * rows switch on one effect the baseline leaves out.
 * @type {{ group: 'baseline' | 'common' | 'pessimistic'; label: string; o: Parameters<typeof realisticRun>[0] }[]}
 */
export const VARIANTS = [
  { group: 'baseline', label: 'baseline', o: {} },
  { group: 'common', label: 'sessions -10%', o: { miss: 1 - 0.9 * PLAYED } },
  { group: 'common', label: 'sessions +10%', o: { miss: 1 - 1.1 * PLAYED } },
  { group: 'common', label: 'learnRate -10%', o: { student: { learnRate: 0.9 * REALISTIC.learnRate } } },
  { group: 'common', label: 'learnRate +10%', o: { student: { learnRate: 1.1 * REALISTIC.learnRate } } },
  { group: 'common', label: 'pCeil -10%', o: { student: { pCeil: 0.9 * REALISTIC.pCeil } } },
  { group: 'common', label: 'pCeil +10%', o: { student: { pCeil: 1.1 * REALISTIC.pCeil } } },
  { group: 'common', label: 'pStart -10%', o: { student: { pStart: 0.9 * REALISTIC.pStart } } },
  { group: 'common', label: 'pStart +10%', o: { student: { pStart: 1.1 * REALISTIC.pStart } } },
  { group: 'pessimistic', label: 'supports help half as much (supportScale 0.5)', o: { student: { supportScale: 0.5 } } },
  { group: 'pessimistic', label: 'choice items teach half as much (choiceLearns 0.5)', o: { student: { choiceLearns: 0.5 } } },
  { group: 'pessimistic', label: 'wrong answers teach half as much (wrongLearns 0.5)', o: { student: { wrongLearns: 0.5 } } },
  { group: 'pessimistic', label: 'prerequisite drag 0.5', o: { student: { prereqDrag: 0.5 } } },
  { group: 'pessimistic', label: 'all four of the above', o: { student: { supportScale: 0.5, choiceLearns: 0.5, wrongLearns: 0.5, prereqDrag: 0.5 } } },
];

/**
 * @param {number} n students per variant
 * @param {typeof VARIANTS} [variants]
 */
export function sensitivity(n, variants = VARIANTS) {
  return variants.map((v) => {
    const rows = realisticRun({ n, ...v.o });
    const share = (/** @type {(r: (typeof rows)[number]) => boolean} */ f) => rows.filter(f).length / n;
    return {
      group: v.group, label: v.label,
      runs: quantile(rows.map((r) => r.runs), 0.5),
      medianEP: quantile(rows.map((r) => r.ep), 0.5),
      gate: share((r) => r.ep >= 100),
      ep80: share((r) => r.ep >= 80),
      warden21: share((r) => r.balancePlanned !== null && r.balancePlanned <= 21),
    };
  });
}

/** @param {ReturnType<typeof sensitivity>} table */
export function sensitivityLines(table) {
  const pc = (/** @type {number} */ x) => `${Math.round(1000 * x) / 10}%`;
  const lines = [CAVEAT, 'variant | median runs | median EP day 65 | share >= 100 EP | share >= 80 EP | Balance Warden planned by day 21'];
  for (const r of table) lines.push(`  [${r.group}] ${r.label} | ${r.runs} | ${r.medianEP} | ${pc(r.gate)} | ${pc(r.ep80)} | ${pc(r.warden21)}`);
  /** @param {string} name @param {typeof table} rs */
  const range = (name, rs) => {
    const g = rs.map((r) => r.gate); const e = rs.map((r) => r.medianEP);
    return `range, ${name}: share reaching 100 EP ${pc(Math.min(...g))} to ${pc(Math.max(...g))}; median EP ${Math.min(...e)} to ${Math.max(...e)}`;
  };
  lines.push(range('baseline and the pessimistic rows (the range to quote)', table.filter((r) => r.group !== 'common')));
  lines.push(range('every row', table));
  lines.push('only the [common] rows are on one scale (each input moved 10%); the [pessimistic] rows are not comparable with them or with each other');
  return lines;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '\u0000')) {
  if (process.argv[2] === 'sensitivity') {
    for (const l of sensitivityLines(sensitivity(Number(process.argv[3] ?? 300)))) console.log(l);
  } else {
    const n = Number(process.argv[2] ?? 300);
    const extra = JSON.parse(process.argv[3] ?? '{}');
    console.log(CAVEAT);
    for (const l of reportLines(realisticRun({ n, ...extra }))) console.log(l);
  }
}
