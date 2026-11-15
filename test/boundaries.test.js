// @ts-check
// Import-boundary test (DESIGN.md section 11):
//   math <- gen, misc, check, moves <- learner, session <- render, game, teacher, app
// A module may import from its own layer or any lower one, never upward.
// Placement of directories the layering line does not name (simplest reading):
//   data  -> layer 0 with math (pure data, importable by everyone)
//   store -> layer 3 with app (persistence; nothing below the UI may touch it)
// Also enforced: every import in src/ is a relative .js path that stays inside
// src/ (zero runtime dependencies, browser-loadable). proto/ is never scanned:
// only src/ is walked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** @type {Record<string, number>} */
export const LAYER = {
  math: 0, data: 0,
  gen: 1, misc: 1, check: 1, moves: 1,
  learner: 2, session: 2,
  render: 3, game: 3, teacher: 3, app: 3, store: 3,
};

/** Strip block and line comments (good enough for import scanning; strings containing comment markers are rare in this codebase). */
/** @param {string} src */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

/**
 * Every static or dynamic import / re-export specifier in a module.
 * @param {string} src
 * @returns {string[]}
 */
export function importSpecifiers(src) {
  const s = stripComments(src);
  const out = [];
  const patterns = [
    /\bimport\s+(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g, // import x from '...'; import '...'
    /\bexport\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g, // export ... from '...'
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // import('...')
  ];
  for (const re of patterns) for (const m of s.matchAll(re)) out.push(m[1]);
  // A dynamic import with a non-literal argument cannot be checked: flag it.
  if (/\bimport\s*\(\s*[^'"\s)]/.test(s)) out.push('<non-literal dynamic import>');
  return out;
}

/**
 * Violations for one module, as strings. Paths are repo-relative with '/'.
 * @param {string} fromRel e.g. 'src/gen/mint/x.js'
 * @param {string[]} specs
 * @returns {string[]}
 */
export function violations(fromRel, specs) {
  const errs = [];
  const fromTop = fromRel.split('/')[1];
  const fromLayer = LAYER[fromTop];
  if (fromLayer === undefined) errs.push(`${fromRel}: directory src/${fromTop}/ has no layer`);
  for (const spec of specs) {
    if (!spec.startsWith('./') && !spec.startsWith('../')) { errs.push(`${fromRel}: non-relative import ${JSON.stringify(spec)}`); continue; }
    if (!spec.endsWith('.js')) { errs.push(`${fromRel}: import must name a .js file: ${JSON.stringify(spec)}`); continue; }
    const target = relative(ROOT, resolve(ROOT, dirname(fromRel), spec)).split(sep).join('/');
    const parts = target.split('/');
    if (parts[0] !== 'src' || parts.length < 3) { errs.push(`${fromRel}: import leaves src/: ${JSON.stringify(spec)}`); continue; }
    const toLayer = LAYER[parts[1]];
    if (toLayer === undefined) { errs.push(`${fromRel}: imports unlayered src/${parts[1]}/`); continue; }
    if (fromLayer !== undefined && toLayer > fromLayer) {
      errs.push(`${fromRel}: upward import of ${target} (layer ${parts[1]}=${toLayer} > ${fromTop}=${fromLayer})`);
    }
  }
  return errs;
}

/** @param {string} dir @returns {string[]} absolute paths of .js files under dir */
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && e.name.endsWith('.js') ? [p] : [];
  });
}

test('src/ has no upward, external or out-of-tree imports', () => {
  const errs = [];
  for (const abs of walk(SRC)) {
    const rel = relative(ROOT, abs).split(sep).join('/');
    if (rel.split('/').length < 3) { errs.push(`${rel}: module directly in src/ has no layer`); continue; }
    errs.push(...violations(rel, importSpecifiers(readFileSync(abs, 'utf8'))));
  }
  assert.deepEqual(errs, []);
});

test('checker self-test: import scanning', () => {
  const src = `
    import a from './a.js';
    import { b, c } from "../b.js";
    import * as d from './d.js';
    import './side.js';
    export { e } from './e.js';
    export * from './f.js';
    const g = await import('./g.js');
    // import nope from './comment.js';
    /* import nope2 from './block.js'; */
  `;
  assert.deepEqual(importSpecifiers(src).sort(), ['../b.js', './a.js', './d.js', './e.js', './f.js', './g.js', './side.js'].sort());
  assert.deepEqual(importSpecifiers('const m = import(name);'), ['<non-literal dynamic import>']);
});

test('checker self-test: layering verdicts', () => {
  assert.deepEqual(violations('src/gen/mint/x.js', ['../../math/rational.js', '../prng.js', '../../data/skills.js']), []);
  assert.deepEqual(violations('src/app/boot.js', ['../learner/model.js', '../store/idb.js', './mounts.generated.js']), []);
  assert.deepEqual(violations('src/misc/diagnose.js', ['../gen/registry.generated.js']), [], 'lateral import is allowed');
  assert.equal(violations('src/math/poly.js', ['../gen/prng.js']).length, 1);
  assert.equal(violations('src/gen/x.js', ['../learner/model.js']).length, 1);
  assert.equal(violations('src/learner/model.js', ['../render/mathdom.js']).length, 1);
  assert.equal(violations('src/learner/model.js', ['../store/idb.js']).length, 1);
  assert.equal(violations('src/math/a.js', ['../../proto/x.js']).length, 1, 'src may not reach into proto/');
  assert.equal(violations('src/math/a.js', ['node:fs']).length, 1);
  assert.equal(violations('src/math/a.js', ['lodash']).length, 1);
  assert.equal(violations('src/math/a.js', ['./b']).length, 1);
  assert.equal(violations('src/widgets/a.js', []).length, 1, 'unknown directory');
});
