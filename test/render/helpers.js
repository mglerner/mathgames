// @ts-check
// Test helpers for src/render:
//   readBack(vnode)  reads a rendered tree back to keypad text using only what
//                    is VISIBLE (classes for 2-D layout, glyph text), never the
//                    AST or data-path. A stacked fraction reads as one unit,
//                    an exponent as a group, a radical as sqrt( ). It also
//                    throws on the layout hazards a human would misread: a
//                    digit right after an exponent, a fraction or a radical,
//                    and a digit right before a stacked fraction whose
//                    numerator starts with a digit or minus (a mixed number).
//   norm(x)          display-invariant normal form for comparing trees:
//                    strips groups, writes negative / fractional literals as
//                    neg / frac, flattens nested sums and products, and pulls
//                    one minus sign out of the FIRST factor of a product only,
//                    and only when that factor is not parenthesized
//                    ((-2)x stored as a num and -(2x) both draw as -2x; x(-y)
//                    and (-2)x typed with a group keep their parentheses).
//   FakeDoc          just enough DOM for materialize() and mountKeypad().

import { hasClass } from '../../src/render/vnode.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('../../src/render/vnode.js').VNode} VNode */

const GLYPH = { '\u2212': '-', '\u00b7': '*', '\u00d7': '*' };

/**
 * @param {VNode | string} v
 * @returns {string}
 */
export function readBack(v) {
  let out = '';
  /** @type {'sup' | 'frac' | 'root' | null} */
  let closed = null;
  const lastChar = () => out.trimEnd().slice(-1);
  /** @param {VNode} el @param {string} cls */
  const child = (el, cls) => {
    const c = el.children.find((k) => typeof k !== 'string' && hasClass(k, cls));
    if (!c || typeof c === 'string') throw new Error(`readBack: missing .${cls}`);
    return c;
  };
  /** @param {VNode | string} n @param {boolean} inMi */
  const go = (n, inMi) => {
    if (typeof n === 'string') {
      for (const c of n) {
        if (c >= '0' && c <= '9' && closed) throw new Error(`readBack: digit "${c}" right after a ${closed} (reads ambiguously)`);
        if (inMi) {
          if (!/^[A-Za-z]$/.test(c)) throw new Error(`readBack: non-letter ${JSON.stringify(c)} in .mi`);
          out += ` ${c}`;
        } else if (Object.prototype.hasOwnProperty.call(GLYPH, c)) {
          out += GLYPH[/** @type {keyof typeof GLYPH} */ (c)];
        } else if (/^[0-9+()= ,]$/.test(c)) {
          out += c;
        } else {
          throw new Error(`readBack: unexpected glyph ${JSON.stringify(c)}`);
        }
        if (c !== ' ') closed = null;
      }
      return;
    }
    if (hasClass(n, 'rhook')) return;
    if (hasClass(n, 'rindex')) throw new Error('readBack: root index other than 2 cannot be typed');
    if (hasClass(n, 'frac')) {
      const num = readBack(child(n, 'fnum')).trim();
      const den = readBack(child(n, 'fden')).trim();
      if (/[0-9]$/.test(lastChar()) && /^[0-9-]/.test(num)) throw new Error('readBack: digit before a numeric fraction (looks like a mixed number)');
      out += `((${num})/(${den}))`;
      closed = 'frac';
      return;
    }
    if (n.tag === 'sup' && hasClass(n, 'msup')) {
      out += `^(${n.children.map((c) => readBack(c)).join('').trim()})`;
      closed = 'sup';
      return;
    }
    if (hasClass(n, 'mroot')) {
      out += `sqrt(${readBack(child(n, 'radicand')).trim()})`;
      closed = 'root';
      return;
    }
    const mi = inMi || hasClass(n, 'mi');
    for (const c of n.children) go(c, mi);
  };
  go(v, false);
  return out;
}

/** Normalized nodes that came from a group: a minus inside parentheses is not pulled. */
const GROUPED = new WeakSet();

/**
 * @param {Node} n
 * @returns {Node}
 */
function normN(n, preview = false) {
  const go = (/** @type {Node} */ m) => normN(m, preview);
  switch (n.t) {
    case 'group': { const m = go(n.arg); GROUPED.add(m); return m; }
    case 'var': return n;
    case 'num': {
      if (n.q.n < 0n) {
        /** @type {Node} */
        const m = { t: 'neg', arg: go({ t: 'num', q: { n: -n.q.n, d: n.q.d } }) };
        // Preview mode parenthesizes a fraction that is a factor, sign included.
        if (preview && n.q.d !== 1n) GROUPED.add(m);
        return m;
      }
      if (n.q.d !== 1n) return { t: 'frac', num: { t: 'num', q: { n: n.q.n, d: 1n } }, den: { t: 'num', q: { n: n.q.d, d: 1n } } };
      return n;
    }
    case 'neg': return { t: 'neg', arg: go(n.arg) };
    case 'frac': return { t: 'frac', num: go(n.num), den: go(n.den) };
    case 'pow': return { t: 'pow', base: go(n.base), exp: go(n.exp) };
    case 'root': return { t: 'root', index: n.index, radicand: go(n.radicand) };
    case 'add': {
      if (n.args.length === 0) return { t: 'num', q: { n: 0n, d: 1n } };
      if (n.args.length === 1) return go(n.args[0]);
      /** @type {Node[]} */
      const args = [];
      for (const a of n.args) {
        const m = go(a);
        if (m.t === 'add') args.push(...m.args); else args.push(m);
      }
      return { t: 'add', args };
    }
    case 'mul': {
      if (n.args.length === 0) return { t: 'num', q: { n: 1n, d: 1n } };
      if (n.args.length === 1) return go(n.args[0]);
      /** @type {Node[]} */
      const fs = [];
      for (const a of n.args) {
        const m = go(a);
        if (m.t === 'mul') fs.push(...m.args); else fs.push(m);
      }
      // A first factor -X draws as a bare leading minus only when X itself
      // does not start with a minus (else X is parenthesized): pull one layer.
      const f0 = fs[0];
      const pull = f0.t === 'neg' && !GROUPED.has(f0);
      if (pull) {
        if (f0.arg.t === 'mul') fs.splice(0, 1, ...f0.arg.args); else fs[0] = f0.arg;
      }
      /** @type {Node} */
      const prod = { t: 'mul', args: fs };
      const out = pull ? /** @type {Node} */ ({ t: 'neg', arg: prod }) : prod;
      return out;
    }
  }
  throw new Error('norm: unknown node');
}

/**
 * @template {Node | Equation} T
 * @param {T} x
 * @param {{ preview?: boolean }} [opts] compare against a preview-mode rendering
 * @returns {T}
 */
export function norm(x, opts = {}) {
  const pv = !!opts.preview;
  if (x.t === 'eq') return /** @type {T} */ ({ t: 'eq', lhs: normN(x.lhs, pv), rhs: normN(x.rhs, pv) });
  return /** @type {T} */ (normN(/** @type {Node} */ (x), pv));
}

// ------------------------------------------------------------------ fake DOM

export class FakeEl {
  /** @param {string} tag @param {string | null} [ns] @param {FakeDoc} [doc] */
  constructor(tag, ns = null, doc) {
    this.tagName = tag.toUpperCase();
    this.namespaceURI = ns;
    this.ownerDocument = doc;
    /** @type {any[]} */
    this.childNodes = [];
    /** @type {any} */
    this.parentNode = null;
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {Record<string, Function[]>} */
    this.listeners = {};
  }
  /** @param {string} k @param {string} v */
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  /** @param {string} k */
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  /** @param {string} k */
  removeAttribute(k) { this.attrs.delete(k); }
  /** @param {any} c */
  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  /** @param {any} c */
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) this.childNodes.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  /** @param {string} type @param {Function} fn */
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  /** @param {string} type @param {Function} fn */
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  /** @param {string} type @param {Record<string, unknown>} [props] */
  dispatch(type, props = {}) {
    let prevented = false;
    const ev = { type, target: this, button: 0, preventDefault() { prevented = true; }, ...props };
    for (const fn of this.listeners[type] || []) fn(ev);
    return { prevented };
  }
  /** @param {(e: FakeEl) => boolean} pred @returns {FakeEl[]} */
  findAll(pred) {
    /** @type {FakeEl[]} */
    const out = [];
    /** @param {any} n */
    const go = (n) => { if (n instanceof FakeEl) { if (pred(n)) out.push(n); n.childNodes.forEach(go); } };
    go(this);
    return out;
  }
}

export class FakeText {
  /** @param {string} t */
  constructor(t) { this.textContent = t; /** @type {any} */ this.parentNode = null; }
}

export class FakeDoc {
  /** @param {string} tag */
  createElement(tag) { return new FakeEl(tag, null, this); }
  /** @param {string} ns @param {string} tag */
  createElementNS(ns, tag) { return new FakeEl(tag, ns, this); }
  /** @param {string} t */
  createTextNode(t) { return new FakeText(t); }
}
