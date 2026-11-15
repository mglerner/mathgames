// @ts-check
// Side-scroller simulation for the story's running sections. Pure: no DOM, no
// canvas, no clock. The player runs right automatically and can jump or slide.
// Hitting something is never fatal: you stumble back a short way and go again.
// All heights are measured up from the floor.

export const VIEW_W = 400;
export const VIEW_H = 300;
export const GROUND = 240; // screen y of the floor
export const PLAYER_X = 90; // screen x where the player is drawn
export const STEP = 1 / 120;
const G = 1400;
const JUMP_V = 460;
const SLIDE_T = 0.7;
const STUN_T = 0.55;
export const PLAYER_W = 18;
export const STAND_H = 40;
export const SLIDE_H = 20;

/** Collision boxes by obstacle kind: `low` must be jumped, `high` must be slid under. */
export const SHAPES = {
  low: { y0: 0, y1: 26, w: 22 },
  high: { y0: 28, y1: 110, w: 30 },
};

/**
 * @typedef {{x: number, kind: 'low' | 'high', skin: string}} Obstacle
 * @typedef {{x: number, who: string, text: string}} Beat
 * @typedef {{id: string, name: string, theme: string, speed: number, length: number, goal: string, beats: Beat[], obstacles: Obstacle[]}} Level
 */

/**
 * Gear bought at the workbench (episode 2): `boots` allow one extra jump in mid-air,
 * `dampers` soak up the first stumble of a run. The rest of the gear is drawing only.
 * @param {Level} level @param {string[]} [gear]
 */
export function createRun(level, gear = []) {
  return {
    level, gear, air: 0, damped: false, ghost: -1, x: 0, h: 0, vy: 0, slide: 0, stun: 0, t: 0, acc: 0, hits: 0, flash: 0,
    beat: 0, /** @type {Beat | null} */ paused: null, done: false, soaked: false,
    /** @type {{h: number, slide: boolean}[]} */ hist: [], // recent poses, for the companion who follows a beat behind
  };
}
/** @typedef {ReturnType<typeof createRun>} Run */

const live = (/** @type {Run} */ r) => !r.paused && !r.done && r.stun <= 0;

/** @param {Run} r */
export function jump(r) {
  if (!live(r)) return;
  if (r.h === 0) { r.vy = JUMP_V; r.slide = 0; r.air = 0; }
  else if (r.gear.includes('boots') && r.air === 0) { r.vy = JUMP_V * 0.85; r.air = 1; }
}
/** @param {Run} r */
export function slide(r) {
  if (live(r) && r.h === 0) r.slide = SLIDE_T;
}
/** Dismiss the current story beat. @param {Run} r */
export function resume(r) {
  r.paused = null;
}

/** Advance by real elapsed seconds, in fixed steps. @param {Run} r @param {number} dt */
export function step(r, dt) {
  r.acc += Math.min(dt, 0.1);
  while (r.acc >= STEP) { r.acc -= STEP; tick(r); }
}

/** One fixed step. @param {Run} r */
export function tick(r) {
  if (r.paused || r.done) return;
  r.t += STEP;
  r.flash = Math.max(0, r.flash - STEP);
  if (r.stun > 0) { r.stun -= STEP; return; }

  r.x += r.level.speed * STEP;
  if (r.h > 0 || r.vy > 0) {
    r.h += r.vy * STEP;
    r.vy -= G * STEP;
    if (r.h <= 0) { r.h = 0; r.vy = 0; }
  }
  if (r.slide > 0) r.slide = Math.max(0, r.slide - STEP);
  r.hist.push({ h: r.h, slide: r.slide > 0 });
  if (r.hist.length > 30) r.hist.shift();

  const b = r.level.beats[r.beat];
  if (b && r.x >= b.x) { r.paused = b; r.beat++; return; }

  const ph = r.slide > 0 ? SLIDE_H : STAND_H;
  const obs = r.level.obstacles;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    const s = SHAPES[o.kind];
    // Hit boxes are 4 units narrower per side than the drawing: near misses go the player's way.
    if (i !== r.ghost && Math.abs(o.x - r.x) < (s.w + PLAYER_W) / 2 - 4 && r.h < s.y1 && r.h + ph > s.y0) {
      if (r.gear.includes('dampers') && !r.damped) { r.damped = true; r.ghost = i; r.flash = 0.6; r.soaked = true; return; }
      // Stumble: back up to a fair run-up, never behind the previous obstacle.
      const prev = i > 0 ? obs[i - 1].x + 45 : 0;
      r.x = Math.max(o.x - 200, prev, 0);
      r.h = 0; r.vy = 0; r.slide = 0;
      r.hits++; r.flash = 0.6; r.stun = STUN_T; r.soaked = false;
      return;
    }
  }
  if (r.x >= r.level.length) r.done = true;
}
