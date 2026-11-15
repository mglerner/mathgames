// @ts-check
// The in-game keypad (DESIGN.md section 9, "Keypad" and "Touch"). The pure
// core (keyDefs, press, inputText, readInput, previewVNode, keypadVNode,
// physicalKey) is DOM-free and tested under node; mountKeypad() wires it to a
// document. There are no <input> or <textarea> elements anywhere, so the
// system keyboard never opens. Keys are <button type="button"> handled on
// pointerdown (preventDefault, so no focus, no double-tap zoom, no click).
//
// Keys, exactly the section 9 set: 0-9, /, -, +, ^, sqrt, (, ), =, +-, ",",
// "no solution", "all reals", backspace, plus 1-4 variable keys declared by
// the item (x when the item declares nothing; [] means no letter keys).
//
// Input is a list of key ids; backspace removes one KEY (sqrt is one token).
// inputText() is the raw response string (Attempt.response):
//   - digits join into numbers; sqrt emits "sqrt" (sqrt3 reads as sqrt(3));
//   - the plus-minus key emits the single character U+00B1, never "+-";
//   - "+" then "-" emits "+ -" WITH a space: parseSolutions() would read the
//     two adjacent characters "+-" as plus-minus, but section 9 says typed
//     "+-" always means plus, negative;
//   - "+" then "/" emits "+ /" WITH a space, so the keys + / - can never spell
//     "+/-", which parse.js reads as ONE plus-minus token;
//   - two letter keys in a row get a space between them, so letter keys can
//     never spell the keyword "sqrt";
//   - "no solution" / "all reals" are whole answers: pressing one replaces the
//     input with it, and any later key (backspace included) starts over. They
//     are live only in 'solutions' mode (solution-set items). In the other
//     modes the judge reads text with parse() / parseList(), which would read
//     the words as a product of letters, so there the two keys are drawn
//     disabled (same grid, so the layout does not change), press() ignores
//     them, and readInput() reports the words as 'unread', never as a word.
//
// Physical keyboard (desktop testing; see physicalKey): digits, + - / ^ ( ) = ,
// type themselves; a declared letter types that variable (case-sensitive);
// "\" or "#" (or "s", unless s is a declared variable) is sqrt; "~" is
// plus-minus; "[" is "no solution"; "]" is "all reals"; Backspace / Delete is
// backspace; Enter calls onEnter. Keys with Ctrl, Cmd or Alt held are ignored.

import { h, materialize } from './vnode.js';
import { renderMath, renderList, vnodeEm, WIDTH_SAFETY, DISPLAY_CAP_PX } from './mathdom.js';
import { parse, parseList, parseSolutions, MAX_INPUT } from '../math/parse.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../types.d.ts').AnswerSpec} AnswerSpec */
/** @typedef {import('./vnode.js').VNode} VNode */

/**
 * id: what press() takes; emit: the text it adds; label: what the key shows;
 * span: grid columns of 12.
 * @typedef {{ id: string; emit: string; label: string; aria: string;
 *             kind: 'digit' | 'op' | 'var' | 'whole' | 'back'; span: number; disabled?: boolean }} KeyDef
 */
/**
 * single: one expression or equation (parse); solutions: a solution list with
 * plus-minus and the whole-answer words (parseSolutions); list: a comma list
 * (parseList).
 * @typedef {'single' | 'solutions' | 'list'} ReadMode
 */
/**
 * @typedef {{ status: 'empty' }
 *   | { status: 'word'; word: 'no solution' | 'all reals' }
 *   | { status: 'read'; mode: ReadMode; items: (Node | Equation)[] }
 *   | { status: 'unread'; error: string }} Reading
 */
/** @typedef {{ tokens: string[]; vars: string[]; mode: ReadMode; solveFor?: string }} KeypadState */

export const MAX_VARIABLE_KEYS = 4;
/** Longest input in keys (well under parse.js MAX_INPUT characters). */
export const MAX_TOKENS = 60;
export const PLUS_MINUS = '\u00b1';
/** Smallest height of the key grid: 5 rows of 48px keys and 4px gaps (KEYPAD_CSS). */
export const KEY_GRID_MIN_PX = 5 * 48 + 4 * 4;
export const NO_SOLUTION = 'no solution';
export const ALL_REALS = 'all reals';

/** @type {Record<string, Omit<KeyDef, 'id' | 'span'>>} */
const FIXED = {
  '/': { emit: '/', label: '/', aria: 'divided by, fraction bar', kind: 'op' },
  '-': { emit: '-', label: '\u2212', aria: 'minus', kind: 'op' },
  '+': { emit: '+', label: '+', aria: 'plus', kind: 'op' },
  '^': { emit: '^', label: '^', aria: 'to the power', kind: 'op' },
  sqrt: { emit: 'sqrt', label: '\u221a', aria: 'square root', kind: 'op' },
  '(': { emit: '(', label: '(', aria: 'open parenthesis', kind: 'op' },
  ')': { emit: ')', label: ')', aria: 'close parenthesis', kind: 'op' },
  '=': { emit: '=', label: '=', aria: 'equals', kind: 'op' },
  pm: { emit: PLUS_MINUS, label: '\u00b1', aria: 'plus or minus', kind: 'op' },
  ',': { emit: ',', label: ',', aria: 'comma', kind: 'op' },
  none: { emit: NO_SOLUTION, label: 'no solution', aria: 'no solution', kind: 'whole' },
  all: { emit: ALL_REALS, label: 'all reals', aria: 'all real numbers', kind: 'whole' },
  back: { emit: '', label: '\u232b', aria: 'backspace', kind: 'back' },
};
for (let d = 0; d <= 9; d++) FIXED[`${d}`] = { emit: `${d}`, label: `${d}`, aria: `${d}`, kind: 'digit' };

/** Rows 1-4: six keys of span 2; '' marks the variable column. */
const LAYOUT = [
  ['7', '8', '9', '(', ')', ''],
  ['4', '5', '6', '/', '^', ''],
  ['1', '2', '3', '+', '-', ''],
  ['0', ',', '=', 'sqrt', 'pm', ''],
];
const LAST_ROW = [['none', 5], ['all', 4], ['back', 3]];

/**
 * Validate and normalize an item's variable keys.
 * @param {readonly string[] | undefined} vars undefined = ['x']
 * @returns {string[]}
 */
export function normalizeVars(vars) {
  const list = vars === undefined ? ['x'] : [...new Set(vars)];
  if (list.length > MAX_VARIABLE_KEYS) throw new RangeError(`keypad: at most ${MAX_VARIABLE_KEYS} variable keys, got ${list.length}`);
  for (const v of list) {
    if (!/^[A-Za-z]$/.test(v)) throw new RangeError(`keypad: variable keys are single ASCII letters, got ${JSON.stringify(v)}`);
  }
  return list;
}

/** @param {string} v */
const varId = (v) => `var:${v}`;
/** @param {string} id */
const isWhole = (id) => id === 'none' || id === 'all';

/**
 * Every key, in layout order. Variable slot i (rows 1-4, last column) is
 * vars[i] or an empty slot (null).
 * Whole-answer keys get disabled: true outside 'solutions' mode.
 * @param {readonly string[]} [vars]
 * @param {ReadMode} [mode] default 'solutions' (every key live)
 * @returns {(KeyDef | null)[]}
 */
export function keyDefs(vars, mode = 'solutions') {
  const vs = normalizeVars(vars);
  /** @type {(KeyDef | null)[]} */
  const out = [];
  LAYOUT.forEach((row, ri) => {
    for (const id of row) {
      if (id === '') {
        const v = vs[ri];
        out.push(v === undefined ? null : { id: varId(v), emit: v, label: v, aria: `letter ${v}`, kind: 'var', span: 2 });
      } else {
        out.push({ id, ...FIXED[id], span: 2 });
      }
    }
  });
  for (const [id, span] of LAST_ROW) {
    const k = /** @type {string} */ (id);
    out.push({ id: k, ...FIXED[k], span: /** @type {number} */ (span), ...(isWhole(k) && mode !== 'solutions' ? { disabled: true } : {}) });
  }
  return out;
}

/** Map an AnswerSpec kind to how input is read. @param {AnswerSpec['kind'] | undefined} kind @returns {ReadMode} */
export function readModeFor(kind) {
  if (kind === 'solution-set') return 'solutions';
  if (kind === 'tuple') return 'list';
  return 'single';
}

/**
 * @param {{ variableKeys?: readonly string[]; answerKind?: AnswerSpec['kind']; mode?: ReadMode; solveFor?: string }} [opts]
 * @returns {KeypadState}
 */
export function makeKeypad(opts = {}) {
  const vars = normalizeVars(opts.variableKeys);
  const mode = opts.mode ?? readModeFor(opts.answerKind);
  const solveFor = opts.solveFor ?? (mode === 'solutions' && vars.length === 1 ? vars[0] : undefined);
  return { tokens: [], vars, mode, solveFor };
}

/** @param {string} id */
const isVar = (id) => id.startsWith('var:');

/** @param {KeypadState} st @param {string} id */
function validKey(st, id) {
  if (isVar(id)) return st.vars.includes(id.slice(4));
  if (isWhole(id) && st.mode !== 'solutions') return false;
  return Object.prototype.hasOwnProperty.call(FIXED, id);
}

/**
 * Apply one key. Unknown keys, undeclared letters and (outside 'solutions'
 * mode) the whole-answer keys are ignored. Pure.
 * @param {KeypadState} st
 * @param {string} id
 * @returns {KeypadState}
 */
export function press(st, id) {
  if (!validKey(st, id)) return st;
  const whole = st.tokens.length === 1 && isWhole(st.tokens[0]);
  if (id === 'back') return { ...st, tokens: whole ? [] : st.tokens.slice(0, -1) };
  if (isWhole(id) || whole) return { ...st, tokens: [id] };
  if (st.tokens.length >= MAX_TOKENS) return st;
  return { ...st, tokens: [...st.tokens, id] };
}

/**
 * The raw response text for a token list.
 * @param {KeypadState | string[]} stOrTokens
 * @returns {string}
 */
export function inputText(stOrTokens) {
  const tokens = Array.isArray(stOrTokens) ? stOrTokens : stOrTokens.tokens;
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const id = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : undefined;
    if (prev !== undefined && ((prev === '+' && (id === '-' || id === '/')) || (isVar(prev) && isVar(id)))) out += ' ';
    out += isVar(id) ? id.slice(4) : FIXED[id].emit;
  }
  return out;
}

/**
 * How the input text is read, without judging it.
 * @param {string} text
 * @param {{ mode?: ReadMode; solveFor?: string }} [opts]
 * @returns {Reading}
 */
export function readInput(text, opts = {}) {
  const mode = opts.mode ?? 'single';
  const t = text.trim();
  if (t === '') return { status: 'empty' };
  if (t === NO_SOLUTION || t === ALL_REALS) {
    // parse() / parseList() would read the words as letters; never preview
    // a word the judge will not read as one.
    if (mode !== 'solutions') return { status: 'unread', error: 'this answer is not a no solution / all reals choice' };
    return { status: 'word', word: t };
  }
  if (text.length > MAX_INPUT) return { status: 'unread', error: 'too long' };
  if (mode === 'solutions') {
    const r = parseSolutions(text, opts.solveFor);
    if ('error' in r) return { status: 'unread', error: r.error };
    if (r.set.kind !== 'finite') return { status: 'word', word: r.set.kind === 'none' ? NO_SOLUTION : ALL_REALS };
    const sv = opts.solveFor;
    /** @type {(Node | Equation)[]} */
    const items = sv === undefined ? r.nodes : r.nodes.map((n) => /** @type {Equation} */ ({ t: 'eq', lhs: { t: 'var', name: sv }, rhs: n }));
    return { status: 'read', mode, items };
  }
  if (mode === 'list') {
    const r = parseList(text);
    if (!Array.isArray(r)) return { status: 'unread', error: r.error };
    return { status: 'read', mode, items: r };
  }
  const r = parse(text);
  if ('error' in r) return { status: 'unread', error: r.error };
  return { status: 'read', mode, items: [r] };
}

/** Content width of the preview on the narrowest phone: the display cap minus 2px border and 16px padding. */
export const PREVIEW_BOX_PX = DISPLAY_CAP_PX - 18;
/** Preview math font size (KEYPAD_CSS). */
const PREVIEW_FONT_PX = 24;

/**
 * Does a preview body (renderMath / renderList vnode) estimate wider than the
 * box? A list or equation counts by its widest unbreakable piece, since
 * .mlist wraps at commas and .meq before "=".
 * @param {VNode} body @returns {boolean}
 */
export function previewTooWide(body) {
  const px = PREVIEW_FONT_PX * WIDTH_SAFETY;
  /** @param {VNode} v @returns {number} */
  const widest = (v) => {
    const cls = (v.attrs.class || '').split(/\s+/);
    if (cls.includes('mlist') || cls.includes('meq')) {
      let w = 0;
      for (const c of v.children) if (typeof c !== 'string') w = Math.max(w, widest(c));
      return w;
    }
    return vnodeEm(v) * px;
  };
  return widest(body) > PREVIEW_BOX_PX;
}

/** Raw text with keypad glyphs, for the not-readable-yet state. @param {string} text */
export function prettyRaw(text) {
  return text.replace(/sqrt/g, '\u221a').replace(/-/g, '\u2212');
}

/**
 * The live preview: how the input was READ (preview-mode rendering).
 * @param {Reading} reading
 * @param {string} text the raw input (shown dimmed while unreadable)
 * @returns {VNode}
 */
export function previewVNode(reading, text) {
  switch (reading.status) {
    case 'empty':
      return h('div', { class: 'kp-preview kp-empty' }, h('span', { class: 'kp-ph' }, 'type your answer'));
    case 'word':
      return h('div', { class: 'kp-preview kp-word' }, h('span', { class: 'kp-wordtext' }, reading.word));
    case 'read': {
      const body = reading.items.length === 1 && reading.mode === 'single'
        ? renderMath(reading.items[0], { preview: true })
        : renderList(reading.items, { preview: true });
      // Too wide for the narrowest preview box (by the width estimate): say
      // so, since the end of the reading is off the right edge until scrolled.
      if (previewTooWide(body)) {
        return h('div', { class: 'kp-preview kp-read kp-wide' },
          h('div', { class: 'kp-scroll' }, body),
          h('span', { class: 'kp-hint' }, 'wider than the screen: swipe to see the rest'));
      }
      return h('div', { class: 'kp-preview kp-read' }, body);
    }
    case 'unread':
      return h('div', { class: 'kp-preview kp-unread', title: reading.error },
        h('span', { class: 'kp-raw' }, prettyRaw(text)),
        h('span', { class: 'kp-hint' }, 'not readable yet'));
  }
}

/**
 * The key grid.
 * @param {KeypadState} st
 * @returns {VNode}
 */
export function keypadVNode(st) {
  return h('div', { class: 'kp-grid', role: 'group', 'aria-label': 'keypad' }, keyDefs(st.vars, st.mode).map((k) => {
    if (!k) return h('span', { class: 'kp-slot', 'aria-hidden': 'true' });
    return h('button', {
      type: 'button', class: `kp-key kp-${k.kind} kp-w${k.span}${k.disabled ? ' kp-off' : ''}`, 'data-key': k.id, 'aria-label': k.aria,
      ...(k.disabled ? { disabled: '', 'aria-disabled': 'true' } : {}),
    }, k.label);
  }));
}

/**
 * Map a physical KeyboardEvent to a key id ('enter' for Enter), or undefined.
 * @param {{ key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }} ev
 * @param {readonly string[]} vars
 * @returns {string | undefined}
 */
export function physicalKey(ev, vars) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return undefined;
  const k = ev.key;
  if (k === 'Enter') return 'enter';
  if (k === 'Backspace' || k === 'Delete') return 'back';
  if (/^[0-9]$/.test(k) || ['+', '-', '/', '^', '(', ')', '=', ','].includes(k)) return k;
  if (k === '\u2212') return '-';
  if (/^[A-Za-z]$/.test(k) && vars.includes(k)) return varId(k);
  if (k === '\\' || k === '#' || k === 's') return 'sqrt';
  if (k === '~' || k === PLUS_MINUS) return 'pm';
  if (k === '[') return 'none';
  if (k === ']') return 'all';
  return undefined;
}

/**
 * Mount a keypad (preview above the grid) into container.
 * @param {any} doc Document
 * @param {any} container element to fill (emptied first)
 * @param {{ variableKeys?: readonly string[]; answerKind?: AnswerSpec['kind']; mode?: ReadMode; solveFor?: string;
 *           onChange?: (s: { tokens: string[]; text: string; reading: Reading }) => void;
 *           onEnter?: (text: string) => void;
 *           keyboardTarget?: any; previewContainer?: any }} [opts]
 *   keyboardTarget: where to listen for physical keydown (e.g. window).
 *   previewContainer: where the live preview goes (default: above the grid,
 *   inside container). Five rows of 48px keys fill a 40% input zone on a
 *   375 x 667 phone, so the app may need to put the preview in the math zone.
 */
export function mountKeypad(doc, container, opts = {}) {
  let st = makeKeypad(opts);
  while (container.firstChild) container.removeChild(container.firstChild);
  const root = materialize(doc, h('div', { class: 'kp' }));
  const previewHost = materialize(doc, h('div', { class: 'kp-previewhost', 'aria-live': 'polite' }));
  const grid = materialize(doc, keypadVNode(st));
  if (opts.previewContainer) opts.previewContainer.appendChild(previewHost); else root.appendChild(previewHost);
  root.appendChild(grid);
  container.appendChild(root);

  const refresh = () => {
    const text = inputText(st);
    const reading = readInput(text, { mode: st.mode, solveFor: st.solveFor });
    while (previewHost.firstChild) previewHost.removeChild(previewHost.firstChild);
    previewHost.appendChild(materialize(doc, previewVNode(reading, text)));
    if (opts.onChange) opts.onChange({ tokens: st.tokens.slice(), text, reading });
  };
  /** @param {string} id */
  const doPress = (id) => {
    if (id === 'enter') { if (opts.onEnter) opts.onEnter(inputText(st)); return; }
    st = press(st, id);
    refresh();
  };

  /** @param {any} e */
  const onPointer = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    let t = e.target;
    while (t && t !== grid && !(t.getAttribute && t.getAttribute('data-key'))) t = t.parentNode;
    if (!t || t === grid) return;
    if (e.preventDefault) e.preventDefault();
    doPress(t.getAttribute('data-key'));
  };
  grid.addEventListener('pointerdown', onPointer);

  /** @param {any} e */
  const onKey = (e) => {
    const id = physicalKey(e, st.vars);
    if (id === undefined) return;
    if (e.preventDefault) e.preventDefault();
    doPress(id);
  };
  if (opts.keyboardTarget) opts.keyboardTarget.addEventListener('keydown', onKey);

  refresh();
  return {
    /** @returns {KeypadState} */
    getState: () => st,
    getText: () => inputText(st),
    /** @param {string} id */
    press: doPress,
    clear: () => { st = { ...st, tokens: [] }; refresh(); },
    destroy: () => {
      grid.removeEventListener('pointerdown', onPointer);
      if (opts.keyboardTarget) opts.keyboardTarget.removeEventListener('keydown', onKey);
      if (root.parentNode) root.parentNode.removeChild(root);
      if (previewHost.parentNode) previewHost.parentNode.removeChild(previewHost);
    },
  };
}

/** Keypad stylesheet. Colors come from CSS variables with dark-slate fallbacks. */
export const KEYPAD_CSS = `
.kp { display: flex; flex-direction: column; gap: 4px; touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.kp-previewhost { flex: none; }
.kp-preview { min-height: 52px; display: flex; align-items: center; justify-content: flex-start; gap: 10px; padding: 2px 8px;
  overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch;
  background: var(--kp-preview-bg, #0f1823); border: 1px solid var(--kp-line, #26384b); color: var(--kp-ink, #e6f1ff); }
/* Centered by auto margins, not justify-content: auto margins drop to 0 when
   the content is wider than the box, so a too-wide reading keeps its START
   (a leading minus) visible and the rest scrolls; centering would clip both ends. */
.kp-preview > :first-child { margin-left: auto; }
.kp-preview > :last-child { margin-right: auto; }
.kp-preview > .m, .kp-preview > .mlist { flex: none; }
.kp-preview .m, .kp-preview .mlist { font-size: 24px; }
.kp-preview.kp-wide { flex-direction: column; align-items: stretch; gap: 0; }
.kp-preview.kp-wide > .kp-scroll { display: flex; overflow-x: auto; overflow-y: hidden; margin: 0; }
.kp-preview.kp-wide > .kp-scroll > * { flex: none; }
.kp-preview.kp-wide > .kp-hint { margin: 0; text-align: right; }
.kp-ph { color: var(--kp-muted, #5d7186); font-size: 15px; }
.kp-wordtext { font-size: 20px; letter-spacing: 0.04em; }
.kp-raw { color: var(--kp-muted, #8aa0b6); font-size: 22px; white-space: pre; overflow: hidden; text-overflow: ellipsis; }
.kp-hint { color: var(--kp-muted, #5d7186); font-size: 12px; white-space: nowrap; }
.kp-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: minmax(48px, 1fr); gap: 4px; }
.kp-key { grid-column: span 2; min-height: 48px; min-width: 48px; padding: 0; font: inherit; font-size: 22px; line-height: 1;
  color: var(--kp-ink, #e6f1ff); background: var(--kp-key-bg, #18273a); border: 1px solid var(--kp-line, #26384b); border-radius: 4px;
  touch-action: manipulation; -webkit-tap-highlight-color: transparent; cursor: pointer; }
.kp-key:active { background: var(--kp-key-active, #24405c); }
.kp-key.kp-digit { background: var(--kp-digit-bg, #1b2b3e); }
.kp-key.kp-var { font-style: italic; font-family: "Times New Roman", Georgia, serif; font-size: 24px; color: var(--kp-var, #7ff6ff); }
.kp-key.kp-whole { font-size: 16px; letter-spacing: 0.03em; }
.kp-key.kp-off { opacity: 0.3; cursor: default; }
.kp-w3 { grid-column: span 3; } .kp-w4 { grid-column: span 4; } .kp-w5 { grid-column: span 5; }
.kp-slot { grid-column: span 2; min-height: 48px; }
`;
