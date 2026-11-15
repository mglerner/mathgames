// @ts-check
// Tests for the M0 scripts (gen-registry, audit). Lives under test/data/ only
// because that is a path M0 owns; move to test/scripts/ if the integrator wants.
// Fixture trees are built in a scratch directory under test/data/ and removed.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { genRegistry } from '../../scripts/gen-registry.js';
import { audit } from '../../scripts/audit.js';
import { skills } from '../../src/data/skills.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SCRATCH = join(HERE, `.scratch-${process.pid}`);
after(() => rmSync(SCRATCH, { recursive: true, force: true }));

/** @param {string} name */
function freshRoot(name) {
  const r = join(SCRATCH, name);
  rmSync(r, { recursive: true, force: true });
  mkdirSync(r, { recursive: true });
  return r;
}
/** @param {string} p @param {string} s */
function put(p, s) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); }

test('gen-registry on an empty tree writes three empty, importable registries', async () => {
  const r = freshRoot('empty');
  const res = genRegistry(r);
  assert.deepEqual([res.generators, res.malrules, res.mounts], [[], [], []]);
  assert.equal(res.written.length, 3);
  const g = await import(pathToFileURL(join(r, 'src/gen/registry.generated.js')).href);
  const m = await import(pathToFileURL(join(r, 'src/misc/malrules.generated.js')).href);
  const a = await import(pathToFileURL(join(r, 'src/app/mounts.generated.js')).href);
  assert.deepEqual([g.generators, m.malrules, a.mounts], [[], [], []]);
  assert.equal(genRegistry(r).written.length, 0, 'second run is a no-op');
});

test('gen-registry globs generators, mal-rules and mounts in sorted order', async () => {
  const r = freshRoot('full');
  put(join(r, 'src/gen/scales/solve-linear.cast.js'), "export default { id: 'b' };\n");
  put(join(r, 'src/gen/mint/frac-times-whole.forge.js'), "export default { id: 'a' };\n");
  put(join(r, 'src/gen/prng.js'), 'export const notAGenerator = 1;\n');
  put(join(r, 'src/gen/mint/.hidden.js'), 'throw new Error("must not be imported");\n');
  put(join(r, 'src/misc/malrules/one-sided-operation.js'), "export default { id: 'one-sided-operation' };\n");
  put(join(r, 'src/misc/diagnose.js'), 'export {};\n');
  put(join(r, 'src/app/mounts/game.js'), 'export function mount(app) { return "game:" + app; }\n');
  const res = genRegistry(r);
  assert.deepEqual(res.generators, ['./mint/frac-times-whole.forge.js', './scales/solve-linear.cast.js']);
  assert.deepEqual(res.malrules, ['./malrules/one-sided-operation.js']);
  assert.deepEqual(res.mounts, ['./mounts/game.js']);
  const g = await import(pathToFileURL(join(r, 'src/gen/registry.generated.js')).href);
  assert.deepEqual(g.generators.map((/** @type {any} */ x) => x.id), ['a', 'b']);
  const a = await import(pathToFileURL(join(r, 'src/app/mounts.generated.js')).href);
  assert.equal(a.mounts[0]('x'), 'game:x');
});

test('gen-registry: a generator file without a default export fails loudly on import', async () => {
  const r = freshRoot('nodefault');
  put(join(r, 'src/gen/mint/oops.js'), 'export const g = {};\n');
  genRegistry(r);
  await assert.rejects(import(pathToFileURL(join(r, 'src/gen/registry.generated.js')).href), /oops\.js has no default export/);
});

/** @param {string} skill @param {import('../../types.d.ts').Interaction[]} interactions @param {string} [id] */
const fakeGen = (skill, interactions, id = `${skill}.${interactions.join('-')}`) =>
  /** @type {import('../../types.d.ts').Generator} */ ({
    id, version: 1, skill, difficulty: [1, 2], interactions,
    generate() { throw new Error('not used'); },
    ...(interactions.includes('cast') ? { alphabet: () => [] } : {}),
  });
const sliceIds = skills.filter((s) => s.slice).map((s) => s.id);

test('audit: empty registry fails on the 12 slice skills; --allow-missing passes', () => {
  const strict = audit(skills, [], []);
  assert.equal(strict.ok, false);
  assert.equal(strict.failures.length, 12);
  const lax = audit(skills, [], [], { allowMissing: true });
  assert.equal(lax.ok, true);
  assert.equal(lax.warnings.length, 12);
  assert.equal(lax.lines.filter((l) => /^\d/.test(l)).length, 41, 'one matrix row per skill');
});

test('audit: full slice coverage passes without the flag; bad generators fail', () => {
  const gens = sliceIds.map((id) => fakeGen(id, ['forge', 'why', 'strike']));
  assert.deepEqual(audit(skills, gens, []).failures, []);
  const noWhy = audit(skills, [...gens.slice(1), fakeGen(sliceIds[0], ['forge'], 'x')], []);
  assert.match(noWhy.failures.join('\n'), /no Why form/);
  const noBox = audit(skills, [...gens.slice(1), fakeGen(sliceIds[0], ['strike', 'why'], 'x')], []);
  assert.match(noBox.failures.join('\n'), /no box 0-1 interaction/);
  const unknown = audit(skills, [...gens, fakeGen('no-such-skill', ['forge', 'why'])], []);
  assert.match(unknown.failures.join('\n'), /unknown skill/);
  const dup = audit(skills, [...gens, gens[0]], []);
  assert.match(dup.failures.join('\n'), /duplicate id/);
  const castNoAlpha = { ...fakeGen('solve-linear', ['cast', 'forge', 'why'], 'c'), alphabet: undefined };
  assert.match(audit(skills, [...gens, castNoAlpha], []).failures.join('\n'), /without alphabet/);
  const mr = /** @type {any} */ ({ id: 'm', skills: ['nope'] });
  assert.match(audit(skills, gens, [mr]).failures.join('\n'), /mal-rule m: unknown skill/);
});

test('audit CLI on the real tree: prints the 41-row matrix; exit code matches its verdict', () => {
  const script = join(ROOT, 'scripts', 'audit.js');
  /** @param {string[]} args @returns {{ out: string; status: number }} */
  const run = (args) => {
    try {
      return { out: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' }), status: 0 };
    } catch (/** @type {any} */ e) {
      return { out: String(e.stdout), status: e.status };
    }
  };
  const lax = run(['--allow-missing']);
  assert.equal(lax.out.split('\n').filter((l) => /^\d+ +[a-z]/.test(l)).length, 41);
  assert.equal(lax.status, /audit: OK/.test(lax.out) ? 0 : 1);
  // While the real registry is empty (M0), the strict run must fail on missing generators.
  const reg = readFileSync(join(ROOT, 'src/gen/registry.generated.js'), 'utf8');
  if (!/^import /m.test(reg)) {
    assert.equal(lax.status, 0, lax.out);
    const strict = run([]);
    assert.equal(strict.status, 1);
    assert.match(strict.out, /FAIL skill frac-times-whole: slice skill has no generator/);
  }
  assert.ok(existsSync(join(ROOT, 'src/misc/malrules.generated.js')));
});
