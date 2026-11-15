// @ts-check
// Canvas drawing for the running sections. Everything is drawn from shapes in
// code (no image files). Logical size is VIEW_W x VIEW_H; the caller scales.
import { VIEW_W, VIEW_H, GROUND, PLAYER_X, SHAPES } from './sim.js';

const GOLD = '#e2b65a';
const THEMES = {
  dock: { sky: ['#0b1020', '#1a2340'], wall: null, floor: '#23262e', trim: '#3a3f4c' },
  vent: { sky: ['#14171c', '#1d2228'], wall: '#262c34', floor: '#1a1e24', trim: '#3d4651' },
  corridor: { sky: ['#181b24', '#20242f'], wall: '#2a2f3c', floor: '#1c1f28', trim: '#454c5e' },
  gallery: { sky: ['#1b1622', '#241c2c'], wall: '#33283b', floor: '#221a26', trim: '#5a4760' },
  vault: { sky: ['#12181a', '#182124'], wall: '#243236', floor: '#161d1f', trim: '#3e5358' },
  server: { sky: ['#0e1420', '#131b2b'], wall: '#1a2436', floor: '#111724', trim: '#34507a' },
  green: { sky: ['#10201a', '#162a22'], wall: '#1d3329', floor: '#13211b', trim: '#3f6b55' },
  alarm: { sky: ['#1b1622', '#2a1820'], wall: '#33283b', floor: '#221a26', trim: '#5a4760' },
};

/** Cheap repeatable pseudo-random number in [0,1) from an integer. */
const rnd = (/** @type {number} */ n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** @param {CanvasRenderingContext2D} c */
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

/** Background for one theme, scrolled by camera x. @param {CanvasRenderingContext2D} c */
function backdrop(c, theme, cam, t) {
  const T = THEMES[theme];
  const g = c.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]);
  c.fillStyle = g; c.fillRect(0, 0, VIEW_W, GROUND);

  if (theme === 'dock') {
    c.fillStyle = '#e9e6df'; c.beginPath(); c.arc(320, 50, 16, 0, 7); c.fill();
    c.fillStyle = T.sky[0]; c.beginPath(); c.arc(313, 46, 14, 0, 7); c.fill();
    // far skyline, slow parallax
    const off = cam * 0.2;
    for (let i = Math.floor(off / 60) - 1; i < Math.floor(off / 60) + 9; i++) {
      const bx = i * 60 - off, bh = 60 + rnd(i) * 90, bw = 44;
      c.fillStyle = '#141a30'; c.fillRect(bx, GROUND - bh, bw, bh);
      c.fillStyle = 'rgba(226,182,90,.55)';
      for (let k = 0; k < 6; k++) if (rnd(i * 13 + k) > 0.55) c.fillRect(bx + 6 + (k % 3) * 12, GROUND - bh + 10 + Math.floor(k / 3) * 22 + rnd(i + k) * 20, 5, 7);
    }
    // the tower wall the dock runs along
    const o2 = cam * 0.6;
    for (let i = Math.floor(o2 / 140) - 1; i < Math.floor(o2 / 140) + 5; i++) {
      const x = i * 140 - o2;
      c.fillStyle = '#1f2433'; c.fillRect(x, GROUND - 120, 120, 120);
      c.strokeStyle = '#2f3649'; c.lineWidth = 2;
      for (let k = 1; k < 6; k++) { c.beginPath(); c.moveTo(x, GROUND - k * 20); c.lineTo(x + 120, GROUND - k * 20); c.stroke(); }
    }
    return;
  }

  // indoor themes: a wall with repeating panels at half parallax
  c.fillStyle = T.wall; c.fillRect(0, 24, VIEW_W, GROUND - 24);
  c.fillStyle = T.trim; c.fillRect(0, 24, VIEW_W, 5); c.fillRect(0, GROUND - 14, VIEW_W, 4);
  const off = cam * 0.5, W = 150;
  for (let i = Math.floor(off / W) - 1; i < Math.floor(off / W) + 5; i++) {
    const x = i * W - off;
    if (theme === 'vent') {
      c.strokeStyle = T.trim; c.lineWidth = 2; c.strokeRect(x + 4, 34, W - 8, GROUND - 54);
      c.fillStyle = T.trim;
      for (const [px, py] of [[10, 40], [W - 12, 40], [10, GROUND - 28], [W - 12, GROUND - 28]]) { c.beginPath(); c.arc(x + px, py, 2, 0, 7); c.fill(); }
    } else if (theme === 'corridor') {
      c.fillStyle = '#232835'; rr(c, x + 40, GROUND - 120, 54, 106, 3); c.fill();
      c.fillStyle = GOLD; c.fillRect(x + 84, GROUND - 68, 4, 8);
      c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(x + 110, 34, 26, 6);
    } else if (theme === 'gallery' || theme === 'alarm') {
      const hue = Math.floor(rnd(i) * 360), pw = 50 + rnd(i + 5) * 30, ph = 44 + rnd(i + 9) * 30;
      c.fillStyle = GOLD; c.fillRect(x + 30, 70, pw + 8, ph + 8);
      c.fillStyle = `hsl(${hue} 35% 30%)`; c.fillRect(x + 34, 74, pw, ph);
      c.fillStyle = `hsl(${(hue + 60) % 360} 45% 45%)`; c.beginPath(); c.arc(x + 34 + pw * 0.4, 74 + ph * 0.55, ph * 0.22, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,240,200,.07)'; c.beginPath(); c.moveTo(x + 34 + pw / 2, 30); c.lineTo(x + 20, 74 + ph + 14); c.lineTo(x + 48 + pw, 74 + ph + 14); c.fill();
    } else if (theme === 'server') {
      // racks of blinking lights
      for (let a = 0; a < 3; a++) {
        c.fillStyle = '#0d121c'; rr(c, x + 8 + a * 46, 44, 38, GROUND - 62, 3); c.fill();
        for (let b = 0; b < 9; b++) {
          const on = rnd(i * 31 + a * 7 + b + Math.floor(t * 3 + rnd(i + a + b) * 5)) > 0.45;
          c.fillStyle = on ? (b % 3 ? '#6fc98a' : GOLD) : '#243044';
          c.fillRect(x + 14 + a * 46, 52 + b * 18, 10, 3); c.fillRect(x + 28 + a * 46, 52 + b * 18, 10, 3);
        }
      }
    } else if (theme === 'green') {
      // glass panes and potted plants
      c.strokeStyle = T.trim; c.lineWidth = 1.5; c.strokeRect(x + 4, 34, W - 8, 90);
      c.beginPath(); c.moveTo(x + W / 2, 34); c.lineTo(x + W / 2, 124); c.stroke();
      c.fillStyle = '#6b4a34'; c.fillRect(x + 54, GROUND - 34, 34, 20);
      c.strokeStyle = '#4f9a6c'; c.lineWidth = 4; c.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const a = -2.4 + k * 0.42 + Math.sin(t * 1.5 + i + k) * 0.05, len = 34 + rnd(i * 5 + k) * 26;
        c.beginPath(); c.moveTo(x + 71, GROUND - 34); c.quadraticCurveTo(x + 71 + Math.cos(a) * len * 0.5, GROUND - 34 + Math.sin(a) * len, x + 71 + Math.cos(a) * len, GROUND - 34 + Math.sin(a) * len * 0.8); c.stroke();
      }
    } else if (theme === 'vault') {
      c.strokeStyle = T.trim; c.lineWidth = 1.5;
      for (let a = 0; a < 5; a++) for (let b = 0; b < 6; b++) {
        c.strokeRect(x + 6 + a * 28, 40 + b * 30, 24, 26);
        c.fillStyle = GOLD; c.fillRect(x + 16 + a * 28, 51 + b * 30, 4, 3);
      }
    }
  }
  if (theme === 'alarm') {
    c.fillStyle = `rgba(224,60,50,${0.1 + 0.1 * Math.sin(t * 9)})`; c.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

/** @param {CanvasRenderingContext2D} c */
function obstacle(c, o, sx, t) {
  const s = SHAPES[o.kind];
  const top = GROUND - s.y1, left = sx - s.w / 2;
  if (o.skin === 'laser') {
    // two emitter posts with a beam between them, in depth; the beam is the hazard
    const y = o.kind === 'low' ? GROUND - 16 : GROUND - 34;
    c.fillStyle = '#555c6e';
    if (o.kind === 'low') { c.fillRect(sx - 3, GROUND - 22, 6, 22); } else { c.fillRect(sx - 3, 24, 6, GROUND - 52); }
    const glow = 0.6 + 0.4 * Math.sin(t * 14 + o.x);
    c.strokeStyle = `rgba(255,70,60,${0.25 * glow})`; c.lineWidth = 9;
    c.beginPath(); c.moveTo(left - 4, y); c.lineTo(left + s.w + 4, y); c.stroke();
    c.strokeStyle = '#ff5a4d'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(left - 4, y); c.lineTo(left + s.w + 4, y); c.stroke();
    if (o.kind === 'high') { // a curtain of beams up to the ceiling, so it is clear you cannot jump it
      c.strokeStyle = 'rgba(255,90,77,.55)'; c.lineWidth = 1.5;
      for (let yy = y - 14; yy > 30; yy -= 14) { c.beginPath(); c.moveTo(left - 4, yy); c.lineTo(left + s.w + 4, yy); c.stroke(); }
    }
    return;
  }
  if (o.skin === 'crate') {
    c.fillStyle = '#7a5a36'; c.fillRect(left, top, s.w, s.y1);
    c.strokeStyle = '#4e3920'; c.lineWidth = 2; c.strokeRect(left + 1, top + 1, s.w - 2, s.y1 - 2);
    c.beginPath(); c.moveTo(left + 2, top + 2); c.lineTo(left + s.w - 2, top + s.y1 - 2); c.moveTo(left + s.w - 2, top + 2); c.lineTo(left + 2, top + s.y1 - 2); c.stroke();
  } else if (o.skin === 'box') {
    c.fillStyle = '#5b6573'; rr(c, left, top, s.w, s.y1, 3); c.fill();
    c.fillStyle = GOLD; c.fillRect(left + 4, top + 5, s.w - 8, 3);
  } else if (o.skin === 'pedestal') {
    c.fillStyle = '#cfc8ba'; c.fillRect(left + 3, top + 6, s.w - 6, s.y1 - 6); c.fillRect(left, top + 3, s.w, 4);
    c.fillStyle = GOLD; c.beginPath(); c.arc(sx, top - 2, 5, 0, 7); c.fill();
  } else { // pipe, fan: hangs from above, slide under it
    const bottom = GROUND - s.y0;
    c.fillStyle = '#4b5361'; c.fillRect(left, 0, s.w, bottom);
    c.fillStyle = '#343a45'; c.fillRect(left - 3, bottom - 12, s.w + 6, 12);
    for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? '#1b1d22' : GOLD; c.fillRect(left - 3 + k * (s.w + 6) / 4, bottom - 5, (s.w + 6) / 4, 5); }
    if (o.skin === 'fan') {
      c.strokeStyle = '#8b94a3'; c.lineWidth = 2;
      for (let k = 0; k < 3; k++) { const a = t * 10 + k * 2.094; c.beginPath(); c.moveTo(sx, bottom - 30); c.lineTo(sx + Math.cos(a) * 11, bottom - 30 + Math.sin(a) * 11); c.stroke(); }
    }
  }
}

/** A small hooded runner. @param {CanvasRenderingContext2D} c */
function person(c, sx, h, sliding, phase, body, accent, moving) {
  const y = GROUND - h;
  c.lineCap = 'round';
  if (sliding) {
    c.strokeStyle = body; c.lineWidth = 5;
    c.beginPath(); c.moveTo(sx - 14, y - 4); c.lineTo(sx + 2, y - 4); c.stroke(); // legs out behind
    c.fillStyle = body; rr(c, sx - 6, y - 14, 20, 11, 5); c.fill();
    c.fillStyle = accent; c.fillRect(sx - 2, y - 14, 5, 4);
    c.fillStyle = '#e8c9a0'; c.beginPath(); c.arc(sx + 15, y - 12, 5.5, 0, 7); c.fill();
    c.fillStyle = body; c.beginPath(); c.arc(sx + 13.5, y - 13.5, 6, 2.2, 5.6); c.fill();
    return;
  }
  const air = h > 0;
  const sw = air ? 0.9 : (moving ? Math.sin(phase) : 0);
  c.strokeStyle = body; c.lineWidth = 5;
  c.beginPath(); c.moveTo(sx, y - 17); c.lineTo(sx + sw * 9, y - (air ? 6 : 2)); c.stroke();
  c.beginPath(); c.moveTo(sx, y - 17); c.lineTo(sx - sw * 9, y - (air ? 9 : 2)); c.stroke();
  c.fillStyle = body; rr(c, sx - 7, y - 35, 14, 20, 5); c.fill();
  c.fillStyle = accent; rr(c, sx - 10, y - 33, 6, 13, 2); c.fill(); // backpack
  c.strokeStyle = body; c.lineWidth = 4;
  c.beginPath(); c.moveTo(sx + 2, y - 30); c.lineTo(sx + 2 - sw * 8, y - 21); c.stroke();
  c.fillStyle = '#e8c9a0'; c.beginPath(); c.arc(sx + 1.5, y - 40, 5.5, 0, 7); c.fill();
  c.fillStyle = body; c.beginPath(); c.arc(sx, y - 41, 6.2, 2.4, 5.9); c.fill(); // hood
}

/** The thing at the end of the level. @param {CanvasRenderingContext2D} c */
function goal(c, kind, sx) {
  if (kind === 'vent') {
    c.fillStyle = '#39404d'; c.fillRect(sx, GROUND - 150, 70, 150);
    c.fillStyle = '#12151a'; rr(c, sx + 12, GROUND - 110, 46, 34, 4); c.fill();
    c.strokeStyle = '#6a7484'; c.lineWidth = 2;
    for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(sx + 14, GROUND - 104 + k * 8); c.lineTo(sx + 56, GROUND - 104 + k * 8); c.stroke(); }
    return;
  }
  c.fillStyle = kind === 'exit' ? '#1f3a2a' : '#2a2f3c'; c.fillRect(sx, GROUND - 130, 76, 130);
  c.strokeStyle = GOLD; c.lineWidth = 3; c.strokeRect(sx + 8, GROUND - 118, 60, 118);
  if (kind === 'vault') {
    c.beginPath(); c.arc(sx + 38, GROUND - 62, 24, 0, 7); c.stroke();
    for (let k = 0; k < 8; k++) { const a = k * 0.785; c.beginPath(); c.moveTo(sx + 38 + Math.cos(a) * 16, GROUND - 62 + Math.sin(a) * 16); c.lineTo(sx + 38 + Math.cos(a) * 24, GROUND - 62 + Math.sin(a) * 24); c.stroke(); }
  } else if (kind === 'case') {
    c.fillStyle = 'rgba(160,220,255,.18)'; c.fillRect(sx + 18, GROUND - 84, 40, 50);
    c.fillStyle = GOLD; c.fillRect(sx + 32, GROUND - 62, 12, 22); c.beginPath(); c.arc(sx + 38, GROUND - 66, 9, 0, 7); c.fill();
    c.fillStyle = '#4a4352'; c.fillRect(sx + 14, GROUND - 34, 48, 34);
  } else if (kind === 'elevator') {
    c.beginPath(); c.moveTo(sx + 38, GROUND - 118); c.lineTo(sx + 38, GROUND); c.stroke();
  } else {
    c.fillStyle = GOLD; c.fillRect(sx + 56, GROUND - 64, 5, 10);
  }
}

/**
 * Draw one frame of a run.
 * @param {CanvasRenderingContext2D} c
 * @param {import('./sim.js').Run} r
 */
export function drawRun(c, r) {
  const L = r.level, cam = r.x - PLAYER_X, T = THEMES[L.theme];
  backdrop(c, L.theme, cam, r.t);

  c.fillStyle = T.floor; c.fillRect(0, GROUND, VIEW_W, VIEW_H - GROUND);
  c.fillStyle = T.trim; c.fillRect(0, GROUND, VIEW_W, 3);
  c.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = Math.floor(cam / 50); i < Math.floor(cam / 50) + 10; i++) c.fillRect(i * 50 - cam, GROUND + 14, 26, 3);

  goal(c, L.goal, L.length + 30 - cam);
  for (const o of L.obstacles) {
    const sx = o.x - cam;
    if (sx > -60 && sx < VIEW_W + 60) obstacle(c, o, sx, r.t);
  }

  const moving = !r.paused && !r.done && r.stun <= 0;
  const phase = r.x * 0.11;
  const past = r.hist[0] || { h: 0, slide: false };
  person(c, PLAYER_X - 34, past.h, past.slide, phase + 2, '#5d6b86', '#8a5a3a', moving); // Wrench, a beat behind
  const gear = r.gear || [];
  if (gear.includes('trail') && moving) {
    for (let k = 1; k <= 5; k++) {
      const q = r.hist[r.hist.length - 1 - k * 4];
      if (!q) break;
      c.fillStyle = `rgba(226,182,90,${0.3 - k * 0.05})`;
      c.beginPath(); c.arc(PLAYER_X - 6 - k * 6, GROUND - q.h - (q.slide ? 8 : 24), 5 - k * 0.6, 0, 7); c.fill();
    }
  }
  if (gear.includes('scanner')) {
    // the scanner tags what is coming: an up arrow to jump, a down arrow to slide
    for (const o of L.obstacles) {
      const sx = o.x - cam;
      if (sx < PLAYER_X + 10 || sx > VIEW_W + 20) continue;
      const up = o.kind === 'low', y = up ? GROUND - 60 : GROUND - 14;
      c.fillStyle = GOLD; c.beginPath();
      if (up) { c.moveTo(sx, y - 9); c.lineTo(sx + 7, y); c.lineTo(sx - 7, y); } else { c.moveTo(sx, y + 9); c.lineTo(sx + 7, y); c.lineTo(sx - 7, y); }
      c.fill();
    }
  }
  person(c, PLAYER_X, r.h, r.slide > 0, phase, '#2f6f73', GOLD, moving);
  if (gear.includes('boots')) { c.fillStyle = GOLD; c.fillRect(PLAYER_X - 5, GROUND - r.h - 3, 10, 3); }

  // progress bar and level name
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, VIEW_W, 22);
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(150, 9, 236, 4);
  c.fillStyle = GOLD; c.fillRect(150, 9, 236 * Math.min(1, r.x / L.length), 4);
  c.fillStyle = '#e9e6df'; c.font = '600 11px -apple-system, system-ui, sans-serif'; c.textBaseline = 'middle';
  c.fillText(L.name.toUpperCase(), 10, 11.5);

  if (r.flash > 0) {
    c.fillStyle = `rgba(224,60,50,${0.35 * (r.flash / 0.6)})`; c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.fillStyle = '#fff'; c.font = '600 15px -apple-system, system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText(r.soaked ? 'Dampers took that one.' : 'Tripped it. Back a few steps.', VIEW_W / 2, 60); c.textAlign = 'left';
  }
}
