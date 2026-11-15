// @ts-check
// Draws episode 3's live mode: the school from above, the path, towers, formations and shots.
// Pure drawing; the rules are in live.js.
import { MAP_W, MAP_H, PATH, SOCKETS, pointAt, plateOf, reach } from './live.js';
import { GLYPH } from './drawsiege.js';

const GOLD = '#e2b65a', GOOD = '#6fc98a', DIM = '#5b6686', BAD = '#e0736b';

/**
 * @param {CanvasRenderingContext2D} ctx @param {import('./live.js').Live | null} w @param {Record<string, string>} towers
 * @param {{lives: number, now?: number, target?: number | null, range?: number, fx?: {t: string, x?: number, y?: number, from?: number, at: number}[]}} o
 *   `fx` are recent shots and kills (with the time they happened, in ms) for a brief flash.
 */
export function drawLive(ctx, w, towers, o) {
  const now = o.now || 0;
  ctx.clearRect(0, 0, MAP_W, MAP_H);
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, MAP_W, MAP_H);
  // classrooms: blocks between the corridors
  ctx.fillStyle = '#10172b';
  for (const [x, y, ww, hh] of [[96, 76, 208, 48], [96, 176, 208, 48], [0, 76, 44, 148], [356, 176, 44, 124], [0, 0, 400, 24], [0, 276, 400, 24]]) ctx.fillRect(x, y, ww, hh);
  // the corridor
  ctx.strokeStyle = '#1c2540'; ctx.lineWidth = 34; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  ctx.beginPath(); PATH.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.strokeStyle = '#263050'; ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
  ctx.beginPath(); PATH.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
  // trophy case at the end of the path, one bar per shutter left
  const [ex, ey] = PATH[PATH.length - 1];
  ctx.fillStyle = '#1e222b'; ctx.fillRect(ex - 62, ey - 26, 52, 52);
  ctx.strokeStyle = GOLD; ctx.strokeRect(ex - 61.5, ey - 25.5, 51, 51);
  ctx.fillStyle = GOLD;
  ctx.beginPath(); ctx.moveTo(ex - 46, ey - 8); ctx.lineTo(ex - 26, ey - 8); ctx.lineTo(ex - 30, ey + 6); ctx.lineTo(ex - 33, ey + 6); ctx.lineTo(ex - 33, ey + 14); ctx.lineTo(ex - 27, ey + 18); ctx.lineTo(ex - 45, ey + 18); ctx.lineTo(ex - 39, ey + 14); ctx.lineTo(ex - 39, ey + 6); ctx.lineTo(ex - 42, ey + 6); ctx.closePath(); ctx.fill();
  for (let i = 0; i < o.lives; i++) { ctx.fillStyle = GOOD; ctx.fillRect(ex - 58 + i * 6, ey - 22, 4, 9); }
  // sockets and towers
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  SOCKETS.forEach(([x, y], i) => {
    const kind = towers[i];
    if (!kind) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = DIM; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = DIM; ctx.font = '11px -apple-system, system-ui, sans-serif'; ctx.fillText(String(i + 1), x, y + 1);
      return;
    }
    if (o.range) { ctx.strokeStyle = 'rgba(226,182,90,.10)'; ctx.fillStyle = 'rgba(226,182,90,.03)'; ctx.beginPath(); ctx.arc(x, y, o.range, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (kind === 'wax') {
      ctx.fillStyle = 'rgba(111,201,138,.75)'; ctx.beginPath(); ctx.ellipse(x, y, 15, 10, 0, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'fan') {
      ctx.strokeStyle = '#9aa0ad'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke();
      for (let k = 0; k < 3; k++) { const a = now / 140 + (k * 2 * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 11 * Math.cos(a), y + 11 * Math.sin(a)); ctx.stroke(); }
      ctx.lineWidth = 1;
    } else {
      ctx.fillStyle = '#2b3350'; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#c8d65a'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1;
    }
  });
  // shots and puffs
  for (const f of o.fx || []) {
    const age = (now - f.at) / 160;
    if (age < 0 || age > 1 || f.x === undefined || f.y === undefined) continue;
    ctx.globalAlpha = 1 - age;
    if (f.t === 'shot' && f.from !== undefined) {
      const [sx, sy] = SOCKETS[f.from];
      ctx.fillStyle = '#c8d65a'; ctx.beginPath(); ctx.arc(sx + (f.x - sx) * age, sy + (f.y - sy) * age, 4, 0, Math.PI * 2); ctx.fill();
    } else if (f.t === 'kill') {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + 12 * age, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    }
    ctx.globalAlpha = 1;
  }
  if (!w) return;
  // formations
  for (const s of w.squads) {
    const big = s.boss;
    for (const d of s.drones) {
      if (d.d < -20) continue;
      const p = pointAt(d.d);
      const y = p.y + 2 * Math.sin(now / 350 + d.id);
      const bw = big ? 40 : 18, bh = big ? 26 : 12;
      ctx.strokeStyle = '#9aa0ad'; ctx.lineWidth = 2;
      const r = (big ? 9 : 5) * Math.abs(Math.cos(now / 60 + d.id));
      for (const dx of [-bw / 2 + 3, bw / 2 - 3]) { ctx.beginPath(); ctx.moveTo(p.x + dx - r, y - bh / 2 - 3); ctx.lineTo(p.x + dx + r, y - bh / 2 - 3); ctx.stroke(); }
      ctx.lineWidth = 1;
      ctx.fillStyle = big ? '#a58bd0' : '#9aa6c9'; ctx.fillRect(p.x - bw / 2, y - bh / 2, bw, bh);
      ctx.fillStyle = BAD; ctx.fillRect(p.x - 2, y - 2, 4, 4); // its eye
      if (s.shield) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, y, big ? 28 : 14, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(226,182,90,.10)'; ctx.fill(); ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = '#343a47'; ctx.fillRect(p.x - bw / 2, y + bh / 2 + 3, bw, 3);
        ctx.fillStyle = d.hp / d.max > 0.4 ? GOOD : BAD; ctx.fillRect(p.x - bw / 2, y + bh / 2 + 3, bw * Math.max(0, d.hp / d.max), 3);
      }
    }
    // the plate rides above the leading drone while the shield is up
    if (s.shield && reach(s) > -10) {
      const p = pointAt(reach(s));
      const lift = big ? 44 : 30;
      // above the leader on a level stretch; beside it on a climb, so it does not cover the drones behind
      const back = pointAt(reach(s) - 6);
      const upright = Math.abs(back.y - p.y) > Math.abs(back.x - p.x);
      const px0 = upright ? (p.x + lift + 8 > MAP_W - 22 ? p.x - lift - 8 : p.x + lift + 8) : p.x;
      const py = upright ? p.y : p.y - lift < 12 ? p.y + lift : p.y - lift;
      p.x = px0;
      ctx.fillStyle = GOLD; ctx.fillRect(p.x - 21, py - 10, 42, 20);
      ctx.fillStyle = '#1a1407'; ctx.font = '600 12px -apple-system, system-ui, sans-serif';
      ctx.fillText(GLYPH[plateOf(s).skill] || '?', p.x, py + 1);
      if (big) for (let i = 0; i < s.plates.length - s.at; i++) { ctx.fillStyle = GOLD; ctx.fillRect(p.x - 21 + i * 8, py + 13, 5, 5); }
      if (s.id === o.target) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 24, py - 13, 48, 26); ctx.lineWidth = 1; }
    }
  }
  ctx.textBaseline = 'alphabetic';
}

/** Which shielded formation, if any, is under a tap at map coordinates (x, y). @param {import('./live.js').Live} w */
export function squadAt(w, /** @type {number} */ x, /** @type {number} */ y) {
  let best = null, bestD = 44;
  for (const s of w.squads) {
    if (!s.shield) continue;
    for (const d of s.drones) {
      const p = pointAt(d.d);
      const dist = Math.min(Math.hypot(p.x - x, p.y - y), Math.hypot(p.x - x, p.y - 30 - y));
      if (dist < bestD) { bestD = dist; best = s; }
    }
  }
  return best;
}
/** Which socket, if any, is under a tap. */
export function socketAt(/** @type {number} */ x, /** @type {number} */ y) {
  const i = SOCKETS.findIndex(([sx, sy]) => Math.hypot(sx - x, sy - y) < 24);
  return i < 0 ? null : i;
}
