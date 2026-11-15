// @ts-check
// A run: a fixed rotation of 10 Knots, item seeds derived from the run seed, plus an Echo
// (fresh sibling from the same generator and interaction) queued after every miss. A miss
// always queues an item after itself, so a run can never end on a miss.
import { generate } from './gens/index.js';

/** Fixed rotation: [generator, interaction]. Slot 1 is the warm-up, slot 10 the closer. */
export const ROTATION = /** @type {const} */ ([
  ['ftw', 'forge'],
  ['ftw', 'nextline'],
  ['sqrtsq', 'strike'],
  ['rat', 'forge'],
  ['quad', 'nextline'],
  ['ftw', 'strike'],
  ['sqrtsq', 'strike'],
  ['rat', 'strike'],
  ['quad', 'strike'],
  ['rat', 'forge'],
]);

/** @typedef {{ gen: string, interaction: string, seed: string, context: string, echoOf?: string }} Slot */

const MAX_REDRAW = 50;
const MAX_ECHO_DRAWS = 1000;

/** Item identity across interactions: generator plus its canonical key. */
function itemKey(/** @type {string} */ gen, /** @type {string} */ seed, /** @type {string} */ interaction) {
  return `${gen}:${generate(gen, seed, interaction).key}`;
}

/**
 * @param {string} runSeed
 * @param {Slot[]} [custom] a fixed queue instead of the rotation (README: ?item=...)
 */
export function createRun(runSeed, custom) {
  /** @type {Slot[]} */
  let queue;
  if (custom) queue = custom.map((s) => ({ ...s }));
  else {
    // The same item is never dealt twice in one run (DESIGN.md section 3): a planned seed whose
    // item was already planned (same generator, any interaction) is redrawn.
    /** @type {Set<string>} */
    const planned = new Set();
    queue = ROTATION.map(([gen, interaction], i) => {
      let seed = `${runSeed}-${i + 1}`;
      for (let k = 1; k <= MAX_REDRAW && planned.has(itemKey(gen, seed, interaction)); k++) seed = `${runSeed}-${i + 1}.${k}`;
      planned.add(itemKey(gen, seed, interaction));
      return { gen, interaction, seed, context: i === 0 ? 'warmup' : i === ROTATION.length - 1 ? 'closer' : 'mixed' };
    });
  }
  return {
    seed: runSeed,
    queue,
    pos: 0,
    echoes: 0,
    /** @type {Set<string>} items already shown */
    keys: new Set(),
    /** @type {Set<string>} items they missed */
    missedKeys: new Set(),
    /** @type {any} */
    cached: null,
    planned: queue.length,
    misses: 0,
    firstTryCorrect: 0,
    /** Haul counts, split by planned Knot vs Echo. */
    tally: { plannedCorrect: 0, plannedMissed: 0, plannedFirstTry: 0, echoCorrect: 0, echoMissed: 0, echoFirstTry: 0 },
    /** @type {string[]} */
    tagsSeen: [],
  };
}

/** @typedef {ReturnType<typeof createRun>} Run */

/** @param {Run} run */
export function current(run) {
  if (run.pos >= run.queue.length) return null;
  if (run.cached && run.cached.pos === run.pos) return run.cached.problem;
  const s = run.queue[run.pos];
  const problem = generate(s.gen, s.seed, s.interaction);
  run.keys.add(`${s.gen}:${problem.key}`);
  run.cached = { pos: run.pos, problem };
  return problem;
}

/** @param {Run} run */
export const slot = (run) => run.queue[run.pos];

/**
 * Queue an Echo after a miss: same generator and interaction, new seed, a different item.
 * It goes after the next planned Knot (within 2), or next if nothing is left.
 * @param {Run} run
 * @returns {Slot}
 */
export function queueEcho(run) {
  const s = run.queue[run.pos];
  const missed = current(run);
  run.missedKeys.add(`${s.gen}:${missed.key}`);
  run.echoes++;
  // Not yet shown: every slot after this one (planned Knots and queued Echoes).
  /** @type {Set<string>} */
  const upcoming = new Set(run.queue.slice(run.pos + 1).map((u) => itemKey(u.gen, u.seed, u.interaction)));
  // Preference: (1) a fresh item; (2) else one that was shown and not missed, and is not coming
  // up later (small pools: sqrt-squared has a dozen items); (3) else anything but a missed item.
  /** @type {string | null} */
  let tier2 = null;
  /** @type {string | null} */
  let tier3 = null;
  /** @type {string | null} */
  let tier4 = null;
  /** @type {string | null} */
  let chosen = null;
  const thisMiss = `${s.gen}:${missed.key}`;
  for (let k = 0; k < MAX_ECHO_DRAWS && !chosen; k++) {
    const seed = `${run.seed}-echo${run.echoes}${k ? `.${k}` : ''}`;
    const key = itemKey(s.gen, seed, s.interaction);
    if (key === thisMiss) continue;
    if (run.missedKeys.has(key)) tier4 ??= seed; // (4) an earlier missed item, never this one
    else if (!run.keys.has(key) && !upcoming.has(key)) chosen = seed;
    else if (!upcoming.has(key)) tier2 ??= seed;
    else tier3 ??= seed;
  }
  chosen ??= tier2 ?? tier3 ?? tier4;
  // Every generator has more than one item, so 1000 draws that all hit this one item cannot
  // happen in practice; fail loudly rather than repeat the missed item.
  if (!chosen) throw new Error(`no Echo found for ${thisMiss}`);
  run.keys.add(itemKey(s.gen, chosen, s.interaction));
  /** @type {Slot} */
  const echo = { gen: s.gen, interaction: s.interaction, seed: chosen, context: 'echo', echoOf: s.seed };
  const at = Math.min(run.pos + 2, run.queue.length);
  run.queue.splice(at, 0, echo);
  return echo;
}

/**
 * Record a resolving result (correct or wrong). Returns the Echo slot if one was queued.
 * @param {Run} run @param {{ verdict: string, firstTry: boolean, tags: string[], ambiguous: boolean }} r
 */
export function resolve(run, r) {
  if (r.verdict === 'correct' && r.firstTry) run.firstTryCorrect++;
  const echo = run.queue[run.pos] && run.queue[run.pos].context === 'echo';
  const t = run.tally;
  if (r.verdict === 'correct') {
    if (echo) t.echoCorrect++;
    else t.plannedCorrect++;
    if (r.firstTry && echo) t.echoFirstTry++;
    if (r.firstTry && !echo) t.plannedFirstTry++;
  } else if (r.verdict === 'wrong') {
    if (echo) t.echoMissed++;
    else t.plannedMissed++;
  }
  if (r.verdict === 'wrong') {
    run.misses++;
    if (!r.ambiguous) for (const t of r.tags) if (!run.tagsSeen.includes(t)) run.tagsSeen.push(t);
    return queueEcho(run);
  }
  return null;
}

/** @param {Run} run */
export function advance(run) {
  run.pos++;
}

/** @param {Run} run */
export const done = (run) => run.pos >= run.queue.length;
