// Independent fake-clock event-log builder for the adversarial learner
// tests. Written from DESIGN.md section 11 (Event / Attempt shapes) only; it
// does not import the builder's test helpers.

const BASE = Date.UTC(2026, 2, 2); // a Monday

/** ISO date string for day index d (local -05:00 offset). */
export function dateOf(d) {
  return new Date(BASE + d * 86400000).toISOString().slice(0, 10);
}

export class Log {
  constructor() {
    this.events = [];
    this.n = 0;
    this.day = 0;
    this.sec = 0;
    this.seedN = 0;
    this.sess = 0;
  }
  t() {
    const s = this.sec++;
    const hh = String(15 + Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${dateOf(this.day)}T${hh}:${mm}:${ss}-05:00`;
  }
  push(type, data) {
    const id = `X${String(this.n++).padStart(8, '0')}`;
    const ev = { id, v: 1, t: this.t(), build: 'adv', device: 'adv', type, data };
    this.events.push(ev);
    return ev;
  }
  goto(day) { this.day = day; this.sec = 0; return this; }
  start() { return this.push('session-start', { id: `adv-s${this.sess++}`, knots: 10 }); }
  end() { return this.push('session-end', {}); }
  /** constructed response */
  cr(skill, ok, o = {}) {
    return this.att(skill, { interaction: o.interaction ?? 'strike', constructed: true, ok, ...o });
  }
  /** choice item */
  choice(skill, ok, o = {}) {
    return this.att(skill, { interaction: o.interaction ?? 'nextline', constructed: false, ok, ...o });
  }
  ev(skill, ok, o = {}) {
    return this.cr(skill, ok, { evidence: true, fade: 3, context: 'mixed', ...o });
  }
  att(skill, o) {
    const seed = o.seed ?? `adv-seed-${this.seedN++}`;
    return this.push('attempt', {
      problem: {
        gen: o.gen ?? `g.${skill}`, version: 1, seed, skill, difficulty: o.difficulty ?? 2,
        interaction: o.interaction, constructed: o.constructed,
        ...(o.variant ? { variant: o.variant } : {}),
      },
      response: o.ok ? 'r' : 'w',
      verdict: o.verdict ?? (o.ok ? 'correct' : 'wrong'),
      firstTry: o.firstTry ?? true, hintsUsed: o.hints ?? 0, fadeLevel: o.fade ?? 1,
      evidence: o.evidence ?? false, context: o.context ?? 'mixed',
      misconceptions: o.tags ?? [], ambiguous: false, ms: o.ms ?? 7000,
    });
  }
  /** a whole session on one day */
  session(day, fn) { this.goto(day); this.start(); fn(this); this.end(); return this; }
}
