// @ts-check
// The rules of episode 3's corridor defence, with no drawing and no math in them.
//
// A corridor is `lane` squares long. The trophy case is at square 0 and drones come in at the
// far end. NOTHING MOVES ON A CLOCK: the drones take one step each time an answer is entered,
// right or wrong. So thinking is free and guessing is what costs ground.
//
//   right answer   the drone you aimed at loses a plate (most have one, so it is gone),
//                  then every drone still flying steps forward
//   wrong answer   that drone gets fresh numbers, then every drone steps forward
//   square 0       a drone that reaches the case takes one shutter with it
//
// Towers sit on squares:
//   glue   a drone arriving on this square is held there for one extra move (once per drone)
//   fan    when any plate is solved, a drone on this square is blown back two squares
//
// Everything here is plain data, so a wave can be saved and reloaded half-way through.

/**
 * @typedef {{skill: string, form: number}} Plate
 * @typedef {{plates: Plate[], boss?: boolean}} Spec  one drone to come
 * @typedef {{id: number, plates: Plate[], at: number, boss: boolean, pos: number, held: number, glued: number[], ref: any}} Drone
 * @typedef {{lane: number, queue: Spec[], drones: Drone[], shutters: number, tick: number, nextId: number,
 *   kills: number, breaches: number, over: '' | 'won' | 'lost'}} Wave
 * @typedef {Record<string, string>} Towers  square -> 'glue' | 'fan'
 * @typedef {{t: 'down' | 'crack' | 'miss' | 'blown' | 'held' | 'breach' | 'in', id: number}} Ev
 */

/** @param {Wave} w @param {number} pos */
function bringIn(w, pos) {
  const spec = w.queue.shift();
  if (!spec) return null;
  /** @type {Drone} */
  const d = { id: w.nextId++, plates: spec.plates, at: 0, boss: !!spec.boss, pos, held: 0, glued: [], ref: null };
  w.drones.push(d);
  return d;
}

/**
 * Start a wave. The first few drones are already in the corridor, one square apart, so there is
 * something to choose between from the first answer.
 * @param {Spec[]} specs @param {{lane: number, pack: number, shutters: number}} o @returns {Wave}
 */
export function newWave(specs, o) {
  /** @type {Wave} */
  const w = { lane: o.lane, queue: specs.map((s) => ({ ...s })), drones: [], shutters: o.shutters, tick: 0, nextId: 1, kills: 0, breaches: 0, over: '' };
  const n = Math.min(o.pack, w.queue.length);
  for (let i = 0; i < n; i++) bringIn(w, o.lane - (n - 1) + i);
  return w;
}

/** The plate a drone is showing now. @param {Drone} d */
export const plateOf = (d) => d.plates[d.at];
/** The drone nearest the case. @param {Wave} w */
export const front = (w) => w.drones.reduce((/** @type {Drone | null} */ a, d) => (!a || d.pos < a.pos ? d : a), null);

/**
 * Enter an answer against one drone, then let everything move.
 * Any drone left with `ref: null` afterwards needs a fresh problem from the caller.
 * @param {Wave} w @param {number} id @param {boolean} ok @param {Towers} towers @returns {Ev[]}
 */
export function answer(w, id, ok, towers = {}) {
  /** @type {Ev[]} */ const ev = [];
  const d = w.drones.find((x) => x.id === id);
  if (!d || w.over) return ev;
  if (ok) {
    d.at++;
    d.ref = null;
    if (d.at >= d.plates.length) {
      w.drones = w.drones.filter((x) => x !== d);
      w.kills++;
      ev.push({ t: 'down', id });
    } else ev.push({ t: 'crack', id });
    for (const x of w.drones) {
      if (towers[x.pos] === 'fan') { x.pos = Math.min(w.lane, x.pos + 2); ev.push({ t: 'blown', id: x.id }); }
    }
  } else {
    d.ref = null;
    ev.push({ t: 'miss', id });
  }
  // everything steps forward; the big one moves on every second answer
  w.tick++;
  for (const x of [...w.drones].sort((a, b) => a.pos - b.pos)) {
    if (x.held > 0) { x.held--; continue; }
    if (x.boss && w.tick % 2 === 1) continue;
    x.pos--;
    if (x.pos <= 0) {
      w.drones = w.drones.filter((y) => y !== x);
      w.shutters--;
      w.breaches++;
      ev.push({ t: 'breach', id: x.id });
    } else if (towers[x.pos] === 'glue' && !x.glued.includes(x.pos)) {
      x.glued.push(x.pos);
      x.held = 1;
      ev.push({ t: 'held', id: x.id });
    }
  }
  const fresh = bringIn(w, w.lane);
  if (fresh) ev.push({ t: 'in', id: fresh.id });
  if (w.shutters <= 0) w.over = 'lost';
  else if (!w.drones.length && !w.queue.length) w.over = 'won';
  return ev;
}
