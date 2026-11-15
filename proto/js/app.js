// @ts-check
// Thin DOM layer. All math, judging and feedback content comes from the DOM-free modules.
// Everything environmental (document, storage, clock, randomness, download) is injected, so a
// fake document can drive a whole run under node --test.
import { h, s, materialize } from './vnode.js';
import { renderMath } from './mathview.js';
import { parse } from './parse.js';
import { judge } from './judge.js';
import { buildFeedback, forgeChain } from './feedback.js';
import { createRun, current, slot, resolve, advance, done } from './run.js';
import { makeLog, makeAttempt, BUILD } from './events.js';
import { makeSighting } from './vocab.js';
import { malrule } from './malrules.js';
import { knotSvg, keeperSvg, lanternSvg, scaleSvg, jumpsSvg, squareSvg, coinSvg, balanceSvg } from './visuals.js';

/** @typedef {import('./vnode.js').VNode} VNode */
/**
 * @typedef {{ doc: any, storage: any, nowMs(): number, randomBytes(n: number): Uint8Array,
 *   search: string, download(name: string, text: string): boolean, win?: any }} Env
 */

const MAX_TOKENS = 40;
/** Next ignores taps this soon after the feedback panel appears: the second tap of a double
 *  tap on Commit/Strike must not skip the feedback (Next sits where Commit was). */
export const NEXT_GUARD_MS = 600;
const CROCK = '0123456789abcdefghjkmnpqrstvwxyz';

/** Keypad: [token, label, kind]. label null = rendered specially. */
const KEYS = [
  ['7', '7'], ['8', '8'], ['9', '9'], ['(', '('], [')', ')'], ['del', null],
  ['4', '4'], ['5', '5'], ['6', '6'], ['+', '+'], ['-', '\u2212'], ['^', '^'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['sqrt', '\u221a'], ['x', 'x'], ['=', '='],
  ['0', '0'], ['/', '/'], ['clr', 'clr'], ['commit', 'Strike'],
];

/**
 * @param {Seg[]} segs
 * @typedef {import('./malrules.js').Seg} Seg
 * @returns {(VNode | string)[]}
 */
const segs = (segs) => segs.map((x) => (typeof x === 'string' ? x : renderMath(x.m)));

/** @param {string} search */
export function parseQuery(search) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of search.replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v);
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

/** @param {Env} env */
export function startApp(/** @type {any} */ root, env) {
  const doc = env.doc;
  const log = makeLog(env);
  const query = parseQuery(env.search || '');
  /** @type {any} */
  const ui = {
    screen: 'start',
    run: null,
    problem: null,
    tokens: [],
    selected: null,
    counted: 0, // parsed attempts on the current item
    shownAt: 0,
    fb: null,
    sight: makeSighting(),
    refs: {},
    locked: false,
  };

  /** @param {VNode | string} v */
  const el = (v) => materialize(doc, v);
  /** @param {any} node */
  const clear = (node) => {
    while (node.firstChild) node.removeChild(node.firstChild);
  };
  /**
   * @param {any} node @param {() => void} fn
   */
  const onTap = (node, fn) => {
    node.addEventListener('pointerdown', (/** @type {any} */ e) => {
      if (e && e.button !== undefined && e.button !== 0) return;
      if (e && e.preventDefault) e.preventDefault();
      fn();
    });
  };
  /**
   * @param {(VNode | string)[] | VNode | string} content @param {string} cls @param {string} act @param {() => void} fn
   */
  const button = (content, cls, act, fn) => {
    const b = el(h('button', { type: 'button', class: cls, 'data-act': act }, /** @type {any} */ (content)));
    onTap(b, fn);
    return b;
  };

  function newSeed() {
    return Array.from(env.randomBytes(6), (b) => CROCK[b % 32]).join('');
  }

  /** Optional fixed queue: ?item=ftw:SEED:strike,quad:SEED:nextline */
  function customQueue() {
    if (!query.item) return undefined;
    const slots = query.item.split(',').map((x) => {
      const [gen, seed, interaction] = x.split(':');
      return { gen, seed, interaction, context: 'mixed' };
    });
    return slots.length ? slots : undefined;
  }

  // ---------------------------------------------------------------- start
  function showStart() {
    ui.screen = 'start';
    clear(root);
    const scr = el(h('div', { class: 'screen start' }));
    scr.appendChild(el(h('div', { class: 'title' }, 'KEYSTONE DEEP')));
    scr.appendChild(el(h('div', { class: 'subtitle' }, 'proto slice')));
    scr.appendChild(el(keeperSvg()));
    scr.appendChild(
      el(
        h(
          'p',
          { class: 'lede' },
          'You are the Keeper (you, the solver). Ten Knots wait below: expressions and equations. ',
          'Only a legal move unties one. Nothing is timed. Nothing you bank is lost.',
        ),
      ),
    );
    scr.appendChild(button('Descend', 'big', 'descend', descend));
    scr.appendChild(el(h('div', { class: 'caption' }, 'Descend = start a run')));
    scr.appendChild(button('Export log (JSON)', 'small', 'export', exportLog));
    scr.appendChild(el(h('div', { class: 'build' }, `${BUILD} | ${log.all().length} events stored${log.persisted ? '' : ' | storage unavailable: export before closing'}`)));
    root.appendChild(scr);
  }

  function descend() {
    const seed = query.seed || newSeed();
    ui.run = createRun(seed, customQueue());
    ui.sight = makeSighting();
    log.append('session-start', { runSeed: seed, queue: ui.run.queue.map((/** @type {any} */ q) => `${q.gen}:${q.seed}:${q.interaction}`) });
    showItem();
  }

  // ---------------------------------------------------------------- encounter
  function showItem() {
    ui.screen = 'encounter';
    const p = current(ui.run);
    ui.problem = p;
    ui.tokens = [];
    ui.selected = null;
    ui.counted = 0;
    ui.fb = null;
    ui.locked = false;
    ui.shownAt = env.nowMs();
    clear(root);
    const sl = slot(ui.run);
    const planned = ui.run.planned;
    const idx = ui.run.queue.slice(0, ui.run.pos + 1).filter((/** @type {any} */ q) => q.context !== 'echo').length;
    const scr = el(h('div', { class: 'screen enc' }));

    const hud = el(h('header', { class: 'hud' }));
    hud.appendChild(el(h('span', { class: 'count' }, sl.context === 'echo' ? 'Echo' : `Knot ${idx} of ${planned}`)));
    ui.refs.report = button('report', 'ghost', 'report', reportItem);
    hud.appendChild(ui.refs.report);
    scr.appendChild(hud);

    const stage = el(h('section', { class: 'stage' }));
    const layers = p.gen === 'quad' ? 3 : 2;
    const knot = el(knotSvg(p.id, layers));
    ui.refs.knot = knot;
    stage.appendChild(knot);
    const vocabKey = p.gen === 'quad' ? 'knotEq' : 'knotExpr';
    const verbKey = p.interaction;
    stage.appendChild(
      el(
        h(
          'div',
          { class: 'prompt' },
          h('div', { class: 'verb' }, ui.sight.label(verbKey)),
          h('div', { class: 'mathline' }, renderMath(p.prompt.math)),
          p.prompt.move ? h('div', { class: 'move' }, segs(p.prompt.move)) : null,
          p.prompt.goal ? h('div', { class: 'goal' }, segs(p.prompt.goal)) : null,
          h('div', { class: 'vocab' }, ui.sight.label(vocabKey)),
          p.interaction === 'forge' && p.gen === 'rat' ? h('div', { class: 'vocab' }, ui.sight.label('coin')) : null,
        ),
      ),
    );
    scr.appendChild(stage);

    const instr = el(h('section', { class: 'instr' }));
    ui.refs.instr = instr;
    const instKey = p.gen === 'quad' ? 'scale' : 'lantern';
    instr.appendChild(el(h('div', { class: 'idle' }, h('span', { class: 'ilabel' }, ui.sight.label(instKey)), h('span', { class: 'ihint' }, 'reads after you commit'))));
    scr.appendChild(instr);

    const input = el(h('section', { class: `input${p.interaction === 'strike' ? ' typed' : ''}` }));
    ui.refs.input = input;
    scr.appendChild(input);
    root.appendChild(scr);
    if (p.interaction === 'strike') buildKeypad();
    else buildChoices();
  }

  function buildChoices() {
    const p = ui.problem;
    const input = ui.refs.input;
    clear(input);
    const note = el(h('div', { class: 'note' }));
    ui.refs.note = note;
    input.appendChild(note);
    const grid = el(h('div', { class: `chips n${p.choices.length}${p.gen === 'quad' ? ' wide' : ''}` }));
    ui.refs.chips = {};
    for (const c of p.choices) {
      const b = button([renderMath(c.display)], 'chip', `choice-${c.id}`, () => {
        if (ui.locked || b.classList.contains('spent')) return;
        ui.selected = c.id;
        for (const [id, node] of Object.entries(ui.refs.chips)) node.classList.toggle('sel', id === c.id);
        ui.refs.commit.classList.remove('off');
      });
      b.setAttribute('data-choice', c.id);
      ui.refs.chips[c.id] = b;
      grid.appendChild(b);
    }
    input.appendChild(grid);
    const commit = button(p.interaction === 'forge' ? 'Forge' : 'Commit', 'commit off', 'commit', () => {
      if (ui.locked || !ui.selected) return;
      commitResponse(ui.selected);
    });
    ui.refs.commit = commit;
    input.appendChild(commit);
  }

  function buildKeypad() {
    const p = ui.problem;
    const input = ui.refs.input;
    clear(input);
    const preview = el(h('div', { class: 'preview', 'aria-live': 'polite' }));
    ui.refs.preview = preview;
    input.appendChild(preview);
    const pad = el(h('div', { class: 'keypad' }));
    for (const [tok, label] of KEYS) {
      const disabled = tok === 'x' && !p.variableKeys.includes('x');
      /** @type {any} */
      let content = label;
      if (tok === 'del') {
        content = s('svg', { viewBox: '0 0 32 20', class: 'delicon', 'aria-hidden': 'true' }, s('polygon', { points: '10,1 31,1 31,19 10,19 1,10' }), s('line', { x1: '15', y1: '6', x2: '24', y2: '14' }), s('line', { x1: '24', y1: '6', x2: '15', y2: '14' }));
      }
      const cls = `key${tok === 'commit' ? ' strike' : ''}${disabled ? ' off' : ''}${/[0-9]/.test(tok) ? ' digit' : ''}`;
      const b = button([content], cls, `key-${tok}`, () => {
        if (disabled || ui.locked) return;
        keyPress(tok);
      });
      if (tok === 'del') b.setAttribute('aria-label', 'delete');
      pad.appendChild(b);
    }
    input.appendChild(pad);
    updatePreview();
  }

  /** @param {string} tok */
  function keyPress(tok) {
    if (tok === 'commit') {
      if (ui.tokens.length) commitResponse(ui.tokens.join(''));
      return;
    }
    if (tok === 'del') ui.tokens.pop();
    else if (tok === 'clr') ui.tokens = [];
    else if (ui.tokens.length < MAX_TOKENS) ui.tokens.push(tok);
    updatePreview();
  }

  /** @param {string} [noteText] */
  function updatePreview(noteText) {
    const pv = ui.refs.preview;
    if (!pv) return;
    clear(pv);
    if (noteText) {
      pv.appendChild(el(h('span', { class: 'pnote' }, noteText)));
      return;
    }
    const text = ui.tokens.join('');
    if (!text) {
      pv.appendChild(el(h('span', { class: 'pph' }, ui.problem.gen === 'quad' ? 'type an equation' : 'type the value')));
      return;
    }
    const pr = parse(text, ui.problem.variableKeys);
    if ('error' in pr) pv.appendChild(el(h('span', { class: 'praw' }, text.replace(/sqrt/g, '\u221a').replace(/-/g, '\u2212'))));
    else pv.appendChild(el(renderMath(pr.kind === 'eq' ? pr.eq : pr.node)));
  }

  /** @param {string} response */
  function commitResponse(response) {
    const p = ui.problem;
    const r = judge(p, response);
    const counted = r.verdict !== 'unparsed' && r.verdict !== 'unverifiable';
    const firstTry = ui.counted === 0;
    const sl = slot(ui.run);
    log.append(
      'attempt',
      makeAttempt(p, {
        response,
        verdict: r.verdict,
        firstTry,
        context: sl.context,
        misconceptions: r.verdict === 'wrong' ? r.tags : [],
        ambiguous: r.verdict === 'wrong' ? r.ambiguous : false,
        ms: env.nowMs() - ui.shownAt,
      }),
    );
    if (counted) ui.counted++;
    const fb = buildFeedback(p, r);
    ui.fb = fb;
    if (!counted) {
      if (p.interaction === 'strike') updatePreview(`${fb.sub || 'Not read.'} Nothing counted.`);
      return;
    }
    renderInstrument(fb);
    if (!fb.resolved) {
      // same value, not finished / legal, not closer: keep working on this Knot
      if (p.interaction === 'strike') updatePreview(`${fb.line.filter((/** @type {any} */ x) => typeof x === 'string').join('')} ${fb.sub || ''}`);
      else {
        const note = ui.refs.note;
        clear(note);
        note.appendChild(el(h('span', null, segs(fb.line), ' ', fb.sub || '')));
        const chip = ui.refs.chips[response];
        if (chip) {
          chip.classList.add('spent');
          chip.classList.remove('sel');
        }
        ui.selected = null;
        ui.refs.commit.classList.add('off');
      }
      return;
    }
    ui.locked = true;
    const echo = resolve(ui.run, { verdict: r.verdict, firstTry, tags: r.tags, ambiguous: r.ambiguous });
    ui.refs.knot.classList.add(fb.miss ? 'mutated' : 'untied');
    renderPanel(fb, !!echo);
  }

  /** @param {any} fb */
  function renderInstrument(fb) {
    const instr = ui.refs.instr;
    clear(instr);
    const ins = fb.instrument;
    if (!ins) return;
    if (ins.kind === 'lantern') {
      const box = el(h('div', { class: 'readout lanternbox' }));
      box.appendChild(el(lanternSvg(ins.rows.map((/** @type {any} */ r) => ({ x: r.x, label: r.label })), ins.same)));
      const rowsEl = el(h('div', { class: 'rrows' }));
      for (const [i, row] of ins.rows.entries()) {
        rowsEl.appendChild(
          el(h('div', { class: `rrow ${i === 0 ? 'rk' : 'ry'}` }, h('span', { class: 'sw' }), h('span', { class: 'rl' }, row.label), renderMath(row.exact), h('span', { class: 'ab' }, `about ${row.approx}`))),
        );
      }
      box.appendChild(rowsEl);
      if (ins.rows.length > 1) box.appendChild(el(h('div', { class: 'rnote' }, ins.same ? 'Same point: the value held.' : 'Different points: the value changed.')));
      instr.appendChild(box);
    } else {
      const yours = ins.rows[ins.rows.length - 1];
      const box = el(h('div', { class: 'readout scalebox' }));
      box.appendChild(el(scaleSvg(yours.L, yours.R, yours.tilt)));
      const txt = el(h('div', { class: 'stext' }));
      for (const row of ins.rows) {
        txt.appendChild(el(h('div', { class: `srow ${row.balanced ? 'bal' : 'off'}` }, `${row.label} at x = ${ins.x}: ${row.L} ${row.balanced ? '=' : 'vs'} ${row.R}`)));
      }
      box.appendChild(txt);
      instr.appendChild(box);
    }
  }

  /** @param {any} fb @param {boolean} echoQueued */
  function renderPanel(fb, echoQueued) {
    const p = ui.problem;
    const input = ui.refs.input;
    clear(input);
    input.classList.remove('typed');
    ui.panelAt = env.nowMs();
    const outer = el(h('div', { class: `fb ${fb.miss ? 'miss' : 'ok'}` }));
    const panel = el(h('div', { class: 'fbscroll' }));
    outer.appendChild(panel);
    panel.appendChild(el(h('div', { class: 'beat1' }, segs(fb.line))));
    if (fb.sub) panel.appendChild(el(h('div', { class: 'sub' }, fb.sub)));
    if (fb.haunt) panel.appendChild(el(h('div', { class: 'haunt' }, `Slip: ${fb.haunt.name} = ${fb.haunt.term}`)));
    if (fb.maybe && fb.maybe.length) panel.appendChild(el(h('div', { class: 'haunt' }, `Not tagged. Could be: ${fb.maybe.map((/** @type {any} */ m) => `${m.name} (${m.term})`).join('; ')}`)));
    if (fb.answer) panel.appendChild(el(h('div', { class: 'answer' }, h('span', { class: 'al' }, p.interaction === 'strike' ? 'One correct answer:' : 'The legal pick:'), renderMath(fb.answer))));
    if (p.gen === 'quad' && p.interaction === 'strike' && fb.answer) {
      panel.appendChild(el(h('div', { class: 'sub' }, 'Either side may be the zero side; any nonzero multiple also counts.')));
    }
    const chain = !fb.miss ? forgeChain(p) : null;
    if (chain) {
      /** @type {any[]} */
      const parts = [];
      chain.forEach((/** @type {any} */ n, /** @type {number} */ i) => {
        if (i) parts.push(h('span', { class: 'mo' }, ' = '));
        parts.push(renderMath(n));
      });
      panel.appendChild(el(h('div', { class: 'chain' }, parts)));
    }
    const whyBody = el(h('div', { class: 'whybody hidden' }, h('div', { class: 'whys' }, segs(fb.why.sentence)), repOf(fb.why.rep)));
    const whyBtn = button('why?', 'whybtn', 'why', () => {
      whyBody.classList.toggle('hidden');
    });
    panel.appendChild(whyBtn);
    panel.appendChild(whyBody);
    if (echoQueued) {
      const lab = ui.sight.label('echo');
      panel.appendChild(el(h('div', { class: 'echoq' }, lab === 'Echo' ? 'Echo queued.' : `Echo queued (${lab}).`)));
    }
    outer.appendChild(
      button(done({ ...ui.run, pos: ui.run.pos + 1 }) ? 'To the Haul' : 'Next', 'next', 'next', () => {
        if (env.nowMs() - ui.panelAt < NEXT_GUARD_MS) return;
        next();
      }),
    );
    input.appendChild(outer);
  }

  /** @param {any} rep @returns {VNode | null} */
  function repOf(rep) {
    switch (rep.kind) {
      case 'jumps':
        return jumpsSvg(rep.n, rep.a, rep.b);
      case 'square':
        return squareSvg(rep.n);
      case 'coin':
        return coinSvg(rep.n, rep.value);
      case 'balance':
        return h('div', null, balanceSvg(rep), rep.answer ? h('div', { class: 'both' }, renderMath(rep.answer), h('span', { class: 'mo' }, '  and  '), renderMath({ t: 'eq', lhs: rep.answer.rhs, rhs: rep.answer.lhs })) : null);
    }
    return null;
  }

  function next() {
    advance(ui.run);
    if (done(ui.run)) showHaul();
    else showItem();
  }

  function reportItem() {
    const p = ui.problem;
    if (!p) return;
    log.append('report', { gen: p.gen, version: p.version, seed: p.seed, interaction: p.interaction, build: BUILD });
    // confirm in the HUD, so it shows whatever state the instrument band is in
    const b = ui.refs.report;
    if (b) {
      clear(b);
      b.appendChild(el('reported'));
    }
  }

  // ---------------------------------------------------------------- haul
  function showHaul() {
    ui.screen = 'haul';
    const run = ui.run;
    log.append('session-end', { runSeed: run.seed, knots: run.planned, echoes: run.echoes, misses: run.misses, firstTryCorrect: run.firstTryCorrect });
    clear(root);
    const scr = el(h('div', { class: 'screen haul' }));
    scr.appendChild(el(h('div', { class: 'title' }, 'Haul')));
    scr.appendChild(el(h('div', { class: 'caption' }, 'Haul = end-of-run summary')));
    scr.appendChild(el(keeperSvg()));
    const list = el(h('ul', { class: 'haullist' }));
    const t = run.tally;
    list.appendChild(el(h('li', null, `Knots untied: ${t.plannedCorrect} of ${run.planned}`)));
    if (t.plannedMissed) list.appendChild(el(h('li', null, `Knots missed: ${t.plannedMissed} (each one sent an Echo)`)));
    list.appendChild(el(h('li', null, `Echoes worked: ${run.echoes}${run.echoes ? ` (${t.echoCorrect} untied)` : ''}`)));
    list.appendChild(el(h('li', null, `Clean on the first try: ${t.plannedFirstTry} of ${run.planned} Knots${run.echoes ? `, ${t.echoFirstTry} of ${run.echoes} Echoes` : ''}`)));
    if (run.tagsSeen.length) {
      for (const t of run.tagsSeen) {
        const m = malrule(t);
        list.appendChild(el(h('li', { class: 'slip' }, `Slip met: ${m.haunt} = ${m.standardTerm}`)));
      }
    } else list.appendChild(el(h('li', null, 'No named slips this run.')));
    scr.appendChild(list);
    scr.appendChild(el(h('div', { class: 'build' }, `run seed ${run.seed} | ${BUILD}`)));
    scr.appendChild(button('Export log (JSON)', 'small', 'export', exportLog));
    scr.appendChild(button('Descend again', 'big', 'descend', descend));
    root.appendChild(scr);
  }

  function exportLog() {
    const text = log.exportJSON();
    let ok = false;
    try {
      ok = env.download(`keystone-proto-log-${new Date(env.nowMs()).toISOString().slice(0, 10)}.json`, text);
    } catch {
      ok = false;
    }
    // always offer the text too: downloads from a home-screen app are not guaranteed
    const old = ui.refs.exportBox;
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const box = el(h('div', { class: 'exportbox' }, h('div', { class: 'caption' }, ok ? 'Download started. If nothing saved, copy the log below.' : 'Copy the log below.'), h('textarea', { readonly: 'readonly', rows: '6' })));
    const ta = box.lastChild;
    ta.value = text;
    ta.textContent = text;
    box.appendChild(button('Close', 'small', 'close-export', () => box.parentNode && box.parentNode.removeChild(box)));
    ui.refs.exportBox = box;
    const scr = root.firstChild;
    if (scr) scr.appendChild(box);
  }

  // physical keyboard, for testing on a laptop
  if (env.win && env.win.addEventListener) {
    env.win.addEventListener('keydown', (/** @type {any} */ e) => {
      if (ui.screen !== 'encounter' || !ui.problem || ui.locked) {
        if (ui.screen === 'encounter' && ui.locked && e.key === 'Enter') next();
        return;
      }
      if (ui.problem.interaction !== 'strike') return;
      /** @type {Record<string, string>} */
      const map = { Backspace: 'del', Enter: 'commit', Escape: 'clr', s: 'sqrt', r: 'sqrt', '*': '' };
      let tok = map[e.key] ?? e.key;
      if (tok === 'x' && !ui.problem.variableKeys.includes('x')) return;
      if (/^[0-9]$/.test(tok) || ['(', ')', '+', '-', '^', '/', '=', 'x', 'sqrt', 'del', 'clr', 'commit'].includes(tok)) {
        if (e.preventDefault) e.preventDefault();
        keyPress(tok);
      }
    });
  }

  showStart();
  return { ui, log };
}
