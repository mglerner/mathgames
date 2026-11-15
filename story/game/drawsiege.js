// @ts-check
// Draws episode 3's corridor: the trophy case on the left, lockers along the wall, towers on the
// floor, and the drones with their brass plates. Pure drawing; the rules are in siege.js.
import { plateOf } from './siege.js';

export const SIEGE_W = 400;
export const SIEGE_H = 170;
const CASE_W = 56;
const FLOOR = 138;
/** What is engraved on a plate, small enough to read on a drone. */
export const GLYPH = { dist: '-( )', solve: 'x = ?', simplify: '√', rationalize: '/√', frac: 'a/b' };

/** Middle of a square, in pixels. @param {number} pos @param {number} lane */
export const squareX = (pos, lane) => CASE_W + (pos - 0.5) * ((SIEGE_W - CASE_W) / lane);

/**
 * @param {CanvasRenderingContext2D} ctx @param {import('./siege.js').Wave | null} w @param {Record<string, string>} towers
 * @param {{lane: number, shutters: number, target?: number | null, from?: Record<string, number>, t?: number, now?: number, sockets?: number[]}} o
 *   `from` and `t` slide each drone from where it was (t = 0) to where it is (t = 1).
 */
export function drawSiege(ctx, w, towers, o) {
  const lane = o.lane, sq = (SIEGE_W - CASE_W) / lane, now = o.now || 0, t = o.t ?? 1;
  ctx.clearRect(0, 0, SIEGE_W, SIEGE_H);
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, SIEGE_W, SIEGE_H);
  // lockers along the wall, one per square, and the floor
  for (let i = 1; i <= lane; i++) {
    const x = CASE_W + (i - 1) * sq;
    ctx.fillStyle = i % 2 ? '#161d33' : '#131a2e';
    ctx.fillRect(x + 1, 14, sq - 2, 78);
    ctx.fillStyle = '#263050';
    ctx.fillRect(x + sq / 2 - 8, 24, 16, 3); ctx.fillRect(x + sq / 2 - 8, 30, 16, 3);
    ctx.fillStyle = '#5b6686'; ctx.font = '10px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(i), x + sq / 2, 104);
  }
  ctx.fillStyle = '#1a2036'; ctx.fillRect(0, FLOOR, SIEGE_W, SIEGE_H - FLOOR);
  ctx.strokeStyle = '#343a47'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, FLOOR + 0.5); ctx.lineTo(SIEGE_W, FLOOR + 0.5); ctx.stroke();
  // the far doors
  ctx.fillStyle = '#263050'; ctx.fillRect(SIEGE_W - 5, 30, 5, FLOOR - 30);
  // trophy case, with one bar per fire shutter left
  ctx.fillStyle = '#1e222b'; ctx.fillRect(4, 40, CASE_W - 10, FLOOR - 40);
  ctx.strokeStyle = '#e2b65a'; ctx.strokeRect(4.5, 40.5, CASE_W - 11, FLOOR - 41);
  ctx.fillStyle = '#e2b65a';
  ctx.beginPath(); ctx.moveTo(18, 70); ctx.lineTo(34, 70); ctx.lineTo(31, 86); ctx.lineTo(29, 86); ctx.lineTo(29, 96); ctx.lineTo(35, 100); ctx.lineTo(17, 100); ctx.lineTo(23, 96); ctx.lineTo(23, 86); ctx.lineTo(21, 86); ctx.closePath(); ctx.fill();
  for (let i = 0; i < o.shutters; i++) { ctx.fillStyle = '#6fc98a'; ctx.fillRect(8 + i * 8, 46, 5, 12); }
  // towers and empty sockets
  for (const s of o.sockets || []) {
    if (towers[s]) continue;
    ctx.setLineDash([3, 3]); ctx.strokeStyle = '#5b6686';
    ctx.strokeRect(squareX(s, lane) - 14, FLOOR - 8, 28, 14); ctx.setLineDash([]);
  }
  for (const [pos, kind] of Object.entries(towers)) {
    const x = squareX(Number(pos), lane);
    if (kind === 'glue') {
      ctx.fillStyle = '#6fc98a'; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.ellipse(x, FLOOR + 6, 18, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = '#9aa0ad'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, FLOOR - 4, 12, 0, Math.PI * 2); ctx.stroke();
      const a = now / 150;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(x, FLOOR - 4);
        ctx.lineTo(x + 10 * Math.cos(a + (k * 2 * Math.PI) / 3), FLOOR - 4 + 10 * Math.sin(a + (k * 2 * Math.PI) / 3)); ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
  }
  if (!w) return;
  // drones; ones sharing a square are stacked
  /** @type {Record<number, number>} */ const stack = {};
  for (const d of [...w.drones].sort((a, b) => a.id - b.id)) {
    const was = o.from && o.from[d.id] !== undefined ? o.from[d.id] : d.pos;
    const pos = was + (d.pos - was) * t;
    const n = stack[d.pos] = (stack[d.pos] || 0) + 1;
    const big = d.boss;
    const bw = big ? 56 : 46, bh = big ? 32 : 24;
    const x = squareX(pos, lane);
    const y = (big ? 70 : 60) + (n - 1) * 30 + 3 * Math.sin(now / 400 + d.id);
    // rotors
    ctx.strokeStyle = '#9aa0ad'; ctx.lineWidth = 2;
    const r = 9 * Math.abs(Math.cos(now / 60 + d.id));
    for (const dx of [-bw / 2 + 6, bw / 2 - 6]) { ctx.beginPath(); ctx.moveTo(x + dx - r, y - bh / 2 - 5); ctx.lineTo(x + dx + r, y - bh / 2 - 5); ctx.stroke(); }
    ctx.lineWidth = 1;
    // body and brass plate
    ctx.fillStyle = big ? '#3a2f4f' : '#2b3350';
    ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
    ctx.fillStyle = '#e2b65a'; ctx.fillRect(x - bw / 2 + 4, y - bh / 2 + 4, bw - 8, bh - 8);
    ctx.fillStyle = '#1a1407'; ctx.font = `600 ${big ? 14 : 12}px -apple-system, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(GLYPH[plateOf(d).skill] || '?', x, y + 1);
    ctx.textBaseline = 'alphabetic';
    if (big) for (let i = 0; i < d.plates.length - d.at; i++) { ctx.fillStyle = '#e2b65a'; ctx.fillRect(x - bw / 2 + i * 8, y + bh / 2 + 3, 5, 5); }
    if (d.held) { ctx.fillStyle = '#6fc98a'; ctx.fillRect(x - 8, y + bh / 2 + (big ? 10 : 2), 16, 3); }
    if (d.id === o.target) {
      ctx.strokeStyle = '#e2b65a'; ctx.lineWidth = 2;
      ctx.strokeRect(x - bw / 2 - 4, y - bh / 2 - 10, bw + 8, bh + 16); ctx.lineWidth = 1;
    }
  }
}
