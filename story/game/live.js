// @ts-check
// Episode 3, "live" mode: a real-time tower defence, with no drawing and no math in it.
//
// Drones fly along a winding path toward the trophy case, in formations. Each formation hides
// behind one brass plate: while it is up, nothing can hurt them. The player opens a plate (the
// game is paused for as long as the keypad is open), and:
//   right answer   the formation's shield drops, and the towers can hit its drones
//   wrong answer   the formation surges forward and shows a new plate
// So time is never short for thinking; what a wrong answer costs is ground.
//
// Towers sit on fixed sockets and act on their own:
//   launcher   hits the unshielded drone in range that is furthest along
//   wax        every drone in range moves slowly
//   fan        blows each drone back along the path, once, the first time it comes in range
//              (once only, so no arrangement of towers can hold a drone forever)
//
// A wave is plain data (no functions, no cycles), so it can be saved mid-flight.

export const MAP_W = 400;
export const MAP_H = 300;
/** The path, corner to corner. The trophy case is at the last point. */
export const PATH = [[410, 50], [70, 50], [70, 150], [330, 150], [330, 250], [66, 250]];
/** Where towers can be built: between the rows, so one tower covers two stretches of path. */
export const SOCKETS = [[150, 100], [250, 100], [330, 100], [70, 200], [150, 200], [250, 200]];

const SEG = PATH.slice(1).map(([x, y], i) => Math.hypot(x - PATH[i][0], y - PATH[i][1]));
export const PATH_LEN = SEG.reduce((a, b) => a + b, 0);
/** The point `d` pixels along the path (before the start it runs on in a straight line). */
export function pointAt(/** @type {number} */ d) {
  if (d <= 0) return { x: PATH[0][0] - d, y: PATH[0][1] };
  let left = d;
  for (let i = 0; i < SEG.length; i++) {
    if (left <= SEG[i]) {
      const f = left / SEG[i];
      return { x: PATH[i][0] + (PATH[i + 1][0] - PATH[i][0]) * f, y: PATH[i][1] + (PATH[i + 1][1] - PATH[i][1]) * f };
    }
    left -= SEG[i];
  }
  return { x: PATH[PATH.length - 1][0], y: PATH[PATH.length - 1][1] };
}

/**
 * @typedef {{skill: string, form: number}} Plate
 * @typedef {{plates: Plate[], boss?: boolean}} Spec
 * @typedef {{id: number, d: number, hp: number, max: number, blown?: number[]}} Drone  `blown`: fans that have had their go
 * @typedef {{id: number, plates: Plate[], at: number, boss: boolean, shield: boolean, until: number, ref: any, drones: Drone[]}} Squad
 *   `at` is the plate showing; `until` is the hit points at which the big one's shield comes back.
 * @typedef {{t: number, lives: number, queue: Spec[], nextAt: number, squads: Squad[], cool: Record<string, number>,
 *   nextId: number, kills: number, breaches: number, over: '' | 'won' | 'lost', o: Opts}} Live
 * @typedef {{size: number, hp: number, bossHp: number, speed: number, gap: number, lives: number, surge: number,
 *   range: number, rate: number, slow: number, fanPush: number}} Opts
 * @typedef {Record<string, string>} Towers  socket index -> 'launcher' | 'wax' | 'fan'
 * @typedef {{t: 'in' | 'shot' | 'kill' | 'breach' | 'clear' | 'reshield' | 'blow', id?: number, from?: number, x?: number, y?: number}} Ev
 */

const SPACING = 26; // pixels between drones in a formation

/** @param {Spec[]} specs @param {Opts} o @returns {Live} */
export function newLive(specs, o) {
  return { t: 0, lives: o.lives, queue: specs.map((s) => ({ ...s })), nextAt: 0, squads: [], cool: {}, nextId: 1, kills: 0, breaches: 0, over: '', o: { ...o } };
}

/** @param {Live} w @returns {Squad | null} */
function bringIn(w) {
  const spec = w.queue.shift();
  if (!spec) return null;
  const boss = !!spec.boss;
  const hp = boss ? w.o.bossHp * spec.plates.length : w.o.hp;
  /** @type {Squad} */
  const s = {
    id: w.nextId++, plates: spec.plates, at: 0, boss, shield: true, until: 0, ref: null,
    drones: Array.from({ length: boss ? 1 : w.o.size }, (_, i) => ({ id: w.nextId++, d: -i * SPACING, hp, max: hp })),
  };
  w.squads.push(s);
  w.nextAt = w.t + w.o.gap;
  return s;
}

/** The plate a formation is showing. @param {Squad} s */
export const plateOf = (s) => s.plates[Math.min(s.at, s.plates.length - 1)];
/** How far the leading drone of a formation has got. @param {Squad} s */
export const reach = (s) => Math.max(...s.drones.map((d) => d.d));

/**
 * A plate was answered. Any formation left with `ref: null` needs a fresh problem from the caller.
 * @param {Live} w @param {number} id @param {boolean} ok
 */
export function answerPlate(w, id, ok) {
  const s = w.squads.find((x) => x.id === id);
  if (!s || !s.shield) return;
  s.ref = null;
  if (!ok) { for (const d of s.drones) d.d = Math.min(PATH_LEN - 1, d.d + w.o.surge); return; }
  s.shield = false;
  s.at++;
  // the big one drops its shield for one plate's worth of damage at a time
  if (s.boss) s.until = s.at >= s.plates.length ? 0 : s.drones[0].max * (1 - s.at / s.plates.length);
}

/**
 * Move the world on by `dt` seconds. Call it only while the keypad is closed.
 * @param {Live} w @param {number} dt @param {Towers} towers @returns {Ev[]}
 */
export function step(w, dt, towers) {
  /** @type {Ev[]} */ const ev = [];
  if (w.over) return ev;
  const o = w.o;
  w.t += dt;
  if (w.queue.length && (w.t >= w.nextAt || !w.squads.length)) { const s = bringIn(w); if (s) ev.push({ t: 'in', id: s.id }); }
  const near = (/** @type {number} */ si, /** @type {Drone} */ d) => {
    const p = pointAt(d.d), [sx, sy] = SOCKETS[si];
    return d.d > 0 && Math.hypot(p.x - sx, p.y - sy) <= o.range;
  };
  const all = () => w.squads.flatMap((s) => s.drones.map((d) => ({ s, d })));
  const waxed = Object.entries(towers).filter(([, k]) => k === 'wax').map(([i]) => Number(i));
  // move
  for (const { s, d } of all()) {
    const slow = waxed.some((si) => near(si, d)) ? o.slow : 1;
    d.d += o.speed * (s.boss ? 0.6 : 1) * slow * dt;
  }
  // towers
  for (const [key, kind] of Object.entries(towers)) {
    const si = Number(key);
    if (kind === 'wax') continue;
    if (kind === 'fan') {
      const fresh = all().filter(({ d }) => near(si, d) && !(d.blown || []).includes(si));
      for (const { d } of fresh) { d.d = Math.max(1, d.d - o.fanPush); d.blown = [...(d.blown || []), si]; }
      if (fresh.length) ev.push({ t: 'blow', from: si });
      continue;
    }
    w.cool[key] = (w.cool[key] || 0) - dt;
    if (w.cool[key] > 0) continue;
    if (kind === 'launcher') {
      const hit = all().filter(({ s, d }) => !s.shield && d.hp > 0 && near(si, d)).sort((a, b) => b.d.d - a.d.d)[0];
      if (!hit) { w.cool[key] = 0; continue; }
      w.cool[key] = o.rate;
      hit.d.hp--;
      const p = pointAt(hit.d.d);
      ev.push({ t: 'shot', from: si, x: p.x, y: p.y });
      if (hit.s.boss && hit.s.at < hit.s.plates.length && hit.d.hp <= hit.s.until) { hit.s.shield = true; ev.push({ t: 'reshield', id: hit.s.id }); }
    }
  }
  // the dead, and the ones that got there
  for (const s of w.squads) {
    for (const d of s.drones) {
      if (d.hp <= 0) { w.kills++; const p = pointAt(d.d); ev.push({ t: 'kill', id: d.id, x: p.x, y: p.y }); } else if (d.d >= PATH_LEN) {
        const cost = s.boss ? 3 : 1;
        w.lives -= cost; w.breaches += cost; d.hp = 0;
        ev.push({ t: 'breach', id: d.id });
      }
    }
    s.drones = s.drones.filter((d) => d.hp > 0);
    if (!s.drones.length) ev.push({ t: 'clear', id: s.id });
  }
  w.squads = w.squads.filter((s) => s.drones.length);
  if (w.lives <= 0) w.over = 'lost';
  else if (!w.squads.length && !w.queue.length) w.over = 'won';
  return ev;
}
