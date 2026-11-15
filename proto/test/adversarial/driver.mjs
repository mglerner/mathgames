// Adversarial-review driver: a thin JSON bridge so an independent Python oracle (oracle.py)
// can check the proto's generators, judge and feedback numbers. It does no checking itself.
//
//   node driver.mjs items <gen> <interaction> <count> [prefix]   -> JSONL, one item per line
//   node driver.mjs judge < requests.jsonl                       -> JSONL, one verdict per line
//
// Each judge request is { gen, seed, interaction, text } (text = typed string for Strike, or a
// choice id for Forge / Next Line).
import { readFileSync } from 'node:fs';
import { generate } from '../../js/gens/index.js';
import { judge } from '../../js/judge.js';
import { buildFeedback, wordCount } from '../../js/feedback.js';
import { print } from '../../js/print.js';

const big = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);
const out = (o) => process.stdout.write(JSON.stringify(o, big) + '\n');

/** printed form of a node or equation */
const P = (n) => (n.t === 'eq' ? `${print(n.lhs)}=${print(n.rhs)}` : print(n));

function itemRecord(p) {
  const d = { ...p.data };
  if (d.L) d.L = print(d.L);
  if (d.R) d.R = print(d.R);
  return {
    gen: p.gen,
    seed: p.seed,
    interaction: p.interaction,
    key: p.key,
    prompt: P(p.prompt.math),
    move: p.answer.subtract ? print(p.answer.subtract) : null,
    data: d,
    answer: p.answer.display ? P(p.answer.display) : null,
    choices: (p.choices || []).map((c) => ({ id: c.id, text: P(c.display), verdict: c.verdict, malrule: c.malrule || null })),
  };
}

const cache = new Map();
function gen(g, s, i) {
  const k = `${g}|${s}|${i}`;
  if (!cache.has(k)) {
    if (cache.size > 5000) cache.clear();
    cache.set(k, generate(g, s, i));
  }
  return cache.get(k);
}

const [mode, ...args] = process.argv.slice(2);
if (mode === 'items') {
  const [g, inter, count, prefix = 'adv'] = args;
  for (let i = 0; i < Number(count); i++) out(itemRecord(gen(g, `${prefix}-${i}`, inter)));
} else if (mode === 'judge') {
  const lines = readFileSync(0, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    const rq = JSON.parse(line);
    const p = gen(rq.gen, rq.seed, rq.interaction);
    let r;
    try {
      r = judge(p, rq.text);
    } catch (e) {
      out({ crash: String(e && e.stack) });
      continue;
    }
    let fb = null;
    try {
      const f = buildFeedback(p, r);
      fb = {
        line: f.line.map((x) => (typeof x === 'string' ? x : P(x.m))).join(''),
        words: wordCount(f.line),
        miss: f.miss,
        resolved: f.resolved,
        instrument: f.instrument
          ? f.instrument.kind === 'lantern'
            ? { kind: 'lantern', same: f.instrument.same, rows: f.instrument.rows.map((r) => ({ label: r.label, exact: P(r.exact), approx: r.approx })) }
            : { kind: 'scale', x: f.instrument.x, rows: f.instrument.rows }
          : null,
        answer: f.answer ? P(f.answer) : null,
      };
    } catch (e) {
      out({ crash: 'feedback: ' + String(e && e.stack) });
      continue;
    }
    out({ verdict: r.verdict, tags: r.tags, ambiguous: r.ambiguous, why: r.why || null, scaled: !!r.scaled, fb });
  }
} else {
  console.error('usage: driver.mjs items|judge ...');
  process.exit(2);
}
