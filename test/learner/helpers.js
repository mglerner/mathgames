// @ts-check
// Fake-clock event builders for the learner tests.

/** @typedef {import('../../types.d.ts').Event} Event */
/** @typedef {import('../../types.d.ts').Attempt} Attempt */
/** @typedef {import('../../types.d.ts').Interaction} Interaction */

/** Day 0 = 2026-01-05. @param {number} day */
export function date(day) {
  return new Date(Date.UTC(2026, 0, 5) + day * 86400000).toISOString().slice(0, 10);
}

/**
 * A log builder with a fake clock: every event gets a sortable id and a
 * timestamp on the current day.
 */
export function logBuilder() {
  /** @type {Event[]} */
  const events = [];
  let seq = 0;
  let day = 0;
  let k = 0;
  let sess = 0;
  let item = 0;
  /** @param {Event['type']} type @param {unknown} data */
  const push = (type, data) => {
    const s = k++;
    const t = `${date(day)}T${String(10 + Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:00-05:00`;
    events.push({ id: String(seq++).padStart(8, '0'), v: 1, t, build: 'test', device: 'test', type, data });
  };
  const api = {
    events,
    /** @param {number} d */
    day(d) { day = d; k = 0; return api; },
    start(knots = 10) { push('session-start', { id: `s${sess++}`, knots }); return api; },
    end() { push('session-end', {}); return api; },
    /** @param {string} skill */
    unlock(skill) { push('unlock', { skill }); return api; },
    /** @param {unknown} data */
    placement(data) { push('placement', data); return api; },
    /** @param {unknown} data */
    award(data) { push('award', data); return api; },
    /**
     * @param {string} skill
     * @param {Partial<Attempt> & { interaction?: Interaction; constructed?: boolean; variant?: string; difficulty?: number; seed?: string; gen?: string }} o
     */
    attempt(skill, o = {}) {
      const interaction = o.interaction ?? 'strike';
      const constructed = o.constructed ?? (interaction === 'strike' || interaction === 'predict');
      /** @type {Attempt} */
      const a = {
        problem: {
          gen: o.gen ?? `g.${skill}`, version: 1, seed: o.seed ?? `seed${item++}`, skill,
          difficulty: o.difficulty ?? 2, interaction, constructed,
          ...(o.variant !== undefined ? { variant: o.variant } : {}),
        },
        response: 'r', verdict: o.verdict ?? 'correct', firstTry: o.firstTry ?? true, hintsUsed: o.hintsUsed ?? 0,
        fadeLevel: o.fadeLevel ?? (o.evidence ? 3 : 0), evidence: o.evidence ?? false, context: o.context ?? 'mixed',
        misconceptions: o.misconceptions ?? [], ambiguous: o.ambiguous ?? false, ms: o.ms ?? 8000,
      };
      push('attempt', a);
      return api;
    },
    /** @param {string} skill @param {Partial<Attempt> & { interaction?: Interaction }} [o] */
    evidence(skill, o = {}) {
      return api.attempt(skill, { evidence: true, fadeLevel: 3, interaction: 'strike', ...o });
    },
    /** @param {string} skill @param {Partial<Attempt> & { variant?: string }} [o] */
    why(skill, o = {}) {
      return api.attempt(skill, { interaction: 'why', constructed: false, variant: 'hidden-1', ...o });
    },
  };
  return api;
}
