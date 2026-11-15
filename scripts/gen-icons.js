// @ts-check
// Draws the app icons (DESIGN.md section 9, "Icons") with a small pure-Node
// PNG encoder: 8-bit RGB, filter 0 on every row, node:zlib deflate, and a
// table CRC-32 written here. No dependencies, no external assets.
//
// The picture: a glowing line-art keystone (outer and inner outline joined by
// facet lines) on the dark slate background. Only +, -, x, / and sqrt touch
// the pixel math (no exp or trig), so the bytes are identical on every
// platform and the icons/ files can be checked for drift by a test.
//
// Outputs (into icons/ by default; the build writes the same files into dist/icons/):
//   apple-touch-icon.png      180 x 180  (index.html <link rel="apple-touch-icon">)
//   icon-192.png              192 x 192  (manifest, favicon)
//   icon-512.png              512 x 512  (manifest)
//   icon-maskable-512.png     512 x 512  (manifest, purpose "maskable": art kept in the
//                                         central 80% safe zone, background to the edges)
// Run: node scripts/gen-icons.js [outDir]

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Uint32Array} */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Uint8Array} buf @returns {number} */
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {string} type @param {Uint8Array} data */
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encode 8-bit RGB pixels (row-major, 3 bytes per pixel) as a PNG.
 * @param {number} w @param {number} h @param {Uint8Array} rgb
 */
export function encodePng(w, h, rgb) {
  if (rgb.length !== w * h * 3) throw new Error('encodePng: pixel buffer size mismatch');
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** @typedef {[number, number, number, number]} Seg */

/** Line segments of the keystone in unit coordinates (0..1, y down). */
function keystoneSegments() {
  /** @type {[number, number][]} */
  const outer = [[0.20, 0.22], [0.80, 0.22], [0.65, 0.80], [0.35, 0.80]];
  const cx = 0.5, cy = 0.49, k = 0.52;
  /** @type {[number, number][]} */
  const inner = outer.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
  /** @type {Seg[]} */
  const segs = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    segs.push([outer[i][0], outer[i][1], outer[j][0], outer[j][1]]);
    segs.push([inner[i][0], inner[i][1], inner[j][0], inner[j][1]]);
    segs.push([outer[i][0], outer[i][1], inner[i][0], inner[i][1]]);
  }
  return segs;
}

/** @param {number} px @param {number} py @param {Seg} s */
function segDist(px, py, [ax, ay, bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}

const BG = [0x0b, 0x11, 0x18];
const LINE = [0x7f, 0xe3, 0xff];

/**
 * @param {number} size pixels
 * @param {number} artScale fraction of the icon the art box spans (1 = full, 0.8 = maskable safe zone)
 * @returns {Uint8Array} RGB
 */
export function drawIcon(size, artScale) {
  const segs = keystoneSegments();
  const rgb = new Uint8Array(size * size * 3);
  const box = size * artScale;
  const off = (size - box) / 2;
  const halfW = Math.max(1, size / 96);
  const glow = size / 24;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ux = (x + 0.5 - off) / box, uy = (y + 0.5 - off) / box;
      let d = Infinity;
      for (const s of segs) { const v = segDist(ux, uy, s) * box; if (v < d) d = v; }
      const core = d <= halfW ? 1 : d >= halfW + 1 ? 0 : halfW + 1 - d;
      const g = d / glow;
      const a = Math.min(1, core + 0.45 / (1 + g * g * 4));
      const i = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) rgb[i + c] = Math.round(BG[c] + (LINE[c] - BG[c]) * a);
    }
  }
  return rgb;
}

export const ICONS = Object.freeze([
  { file: 'apple-touch-icon.png', size: 180, artScale: 1 },
  { file: 'icon-192.png', size: 192, artScale: 1 },
  { file: 'icon-512.png', size: 512, artScale: 1 },
  { file: 'icon-maskable-512.png', size: 512, artScale: 0.8 },
]);

/** @returns {{ file: string; png: Buffer }[]} */
export function renderIcons() {
  return ICONS.map(({ file, size, artScale }) => ({ file, png: encodePng(size, size, drawIcon(size, artScale)) }));
}

/** @param {string} outDir @returns {string[]} written paths */
export function writeIcons(outDir) {
  mkdirSync(outDir, { recursive: true });
  return renderIcons().map(({ file, png }) => { const p = join(outDir, file); writeFileSync(p, png); return p; });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'icons');
  for (const p of writeIcons(out)) console.log(`gen-icons: wrote ${p}`);
}
