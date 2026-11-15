// @ts-check
// AST -> vnode math renderer (DESIGN.md section 9, "Math"). Build the vnode with
// renderMath(), then materialize() it (vnode.js) into a real document; the
// stylesheet is MATH_CSS. Glyphs are written as escapes; source stays ASCII.
//
// Structure:
//   - Every Node is one <span data-path="...">. Paths: 'e' is the root of an
//     expression, 'l' / 'r' the two sides of an equation, and '.i' appends the
//     index of a child in ast.js children() order (add/mul args, neg/group arg,
//     frac num=0 den=1, pow base=0 exp=1, root radicand=0). nodeAtPath()
//     resolves one back to its Node.
//   - Fractions are flex columns (.frac > .fnum + .fden); exponents are <sup
//     class="msup">; the radical is an SVG hook (stretched, preserveAspectRatio
//     none) beside a .radicand whose top border is the vinculum, so it grows
//     with whatever is under it.
//   - An equation is .meq, a wrapping flex row of two nowrap .mside spans; the
//     second starts with "=", so a long equation breaks before "=" and nowhere
//     else.
//
// Parenthesization (from the AST; nothing is simplified or reordered):
//   - group nodes always draw their parentheses, EXCEPT directly under a
//     fraction bar, a radical, or as an exponent, where the 2-D layout already
//     groups (the group still gets its span and data-path). Preview mode keeps
//     those parentheses too, because it shows what was typed.
//   - Synthetic parentheses are added where the display would otherwise read
//     differently: a sum as a factor (3(x + 1)), as a negated term (-(a + b))
//     or as a base; anything that starts with a minus sign as a later factor
//     (x(-y)), after a binary minus (a - (-b)) or as a base ((-2)^2); and any
//     base that is not a nonnegative integer, a letter or a group ((1/2)^2,
//     (x^2)^3, (sqrt(x))^2, (2x)^2).
//   - Associativity is invisible: a sum inside a sum and a product inside a
//     product (when it needs no parentheses) are drawn flat.
//   - A term that starts with a minus sign, placed after another term, is drawn
//     with that minus as the binary operator: x + (-3) as a stored num is
//     "x - 3", x + (-2)y is "x - 2y" (the AST is unchanged; only the glyph).
// Implicit multiplication:
//   - Juxtaposition: 2x, 2 sqrt(3), 3(x + 1), x^2 y, (1/2)x with a stacked 1/2.
//   - A centered dot (U+00B7) goes before a factor that starts with a digit
//     (2 . 3, x . 2, sqrt(3) . 2, 2 . 3^x) and before a stacked fraction whose
//     numerator starts with a digit or a minus sign (2 . 1/3 is never drawn
//     like the mixed number 2 1/3).
// Preview mode (opts.preview, used by the keypad to show how input was READ):
//   additionally parenthesizes a fraction that is a factor ((1/2)x for typed
//   1/2x, (a/b)c for a/bc), a fraction directly over or under another fraction
//   bar, and a power directly under a unary minus (-(x^2) for typed -x^2, so
//   -3^2 is visibly not (-3)^2).
//
// Width: estimateWidth() walks the same vnode with per-glyph em widths that
// match MATH_CSS, times a safety factor; fitsDisplay() is the check generators
// call against DISPLAY_CAP_PX. It is an estimate calibrated by hand, not a
// measurement: gallery.html measures real widths in a browser and flags any
// item the estimate under-reports.

import { h, s } from './vnode.js';
import { print } from '../math/print.js';

/** @typedef {import('../../types.d.ts').Node} Node */
/** @typedef {import('../../types.d.ts').Equation} Equation */
/** @typedef {import('./vnode.js').VNode} VNode */
/** @typedef {{ preview?: boolean }} RenderOpts */
/**
 * Context a parent hands a child.
 *   bin: a leading minus sign is drawn as a binary operator (spaced)
 *   um: directly under a unary minus (preview parenthesizes a power here)
 *   elide: a group here needs no parentheses (fraction part, radicand, exponent)
 * @typedef {{ bin?: boolean; um?: boolean; elide?: boolean }} Ctx
 */

const MINUS = '\u2212';
const DOT = '\u00b7';

/** Narrowest phone the game targets (CSS px). */
export const PHONE_WIDTH_PX = 375;
/** Side gutter on each edge (CSS px). */
export const GUTTER_PX = 16;
/** Display-width cap for a line of math: a 375px phone minus two 16px gutters. */
export const DISPLAY_CAP_PX = PHONE_WIDTH_PX - 2 * GUTTER_PX;
/** Math font size the cap is checked at by default (section 9: 22px or larger). */
export const DEFAULT_MATH_PX = 24;

// ------------------------------------------------------------------ display predicates

/**
 * The node as displayed: a 1-argument sum or product draws as its argument.
 * @param {Node} n @returns {Node}
 */
function dk(n) {
  while ((n.t === 'add' || n.t === 'mul') && n.args.length === 1) n = n.args[0];
  return n;
}

/** A sum drawn with an operator (2+ terms). @param {Node} n */
function isSum(n) { const d = dk(n); return d.t === 'add' && d.args.length >= 2; }

/** Drawn as a stacked fraction. @param {Node} n */
function isFracLike(n) { const d = dk(n); return d.t === 'frac' || (d.t === 'num' && d.q.d !== 1n); }

/** A first factor of a product that needs parentheses. @param {Node} f @param {RenderOpts} o */
function firstFactorParens(f, o) { return isSum(f) || (!!o.preview && isFracLike(f)); }

/**
 * Does the display begin with a minus sign (outside any parentheses)?
 * @param {Node} n @param {RenderOpts} o @returns {boolean}
 */
function startsMinus(n, o) {
  const d = dk(n);
  switch (d.t) {
    case 'neg': return true;
    case 'num': return d.q.n < 0n;
    case 'mul': return d.args.length >= 2 && !firstFactorParens(d.args[0], o) && startsMinus(d.args[0], o);
    case 'add': return d.args.length >= 2 && startsMinus(d.args[0], o);
    default: return false;
  }
}

/**
 * Does the display begin with a digit, or with a stacked fraction whose
 * numerator begins with a digit or a minus sign? (Decides the centered dot.)
 * @param {Node} n @param {RenderOpts} o @returns {boolean}
 */
function startsNumeric(n, o) {
  const d = dk(n);
  switch (d.t) {
    case 'num': return d.q.n >= 0n;
    case 'frac': {
      // Look through numerator groups whose parentheses are elided.
      let top = d.num;
      while (!o.preview && top.t === 'group') top = top.arg;
      return startsNumeric(top, o) || startsMinus(top, o);
    }
    case 'pow': return simpleBase(d.base) && startsNumeric(d.base, o);
    case 'mul': return d.args.length === 0 || (!firstFactorParens(d.args[0], o) && startsNumeric(d.args[0], o));
    case 'add': return d.args.length === 0 || startsNumeric(d.args[0], o);
    default: return false;
  }
}

/** A power base drawn without parentheses. @param {Node} b */
function simpleBase(b) {
  const d = dk(b);
  return d.t === 'var' || d.t === 'group' || (d.t === 'num' && d.q.n >= 0n && d.q.d === 1n) ||
    ((d.t === 'add' || d.t === 'mul') && d.args.length === 0);
}

// ------------------------------------------------------------------ pieces

/** @param {string} t @param {string} [cls] */
const mo = (t, cls) => h('span', { class: cls ? `mo ${cls}` : 'mo' }, t);
/** @param {string} t */
const mn = (t) => h('span', { class: 'mn' }, t);
const po = () => h('span', { class: 'po' }, '(');
const pc = () => h('span', { class: 'po' }, ')');
/** Synthetic parentheses (not a group node). @param {VNode} inner */
const parens = (inner) => h('span', { class: 'mparen' }, po(), inner, pc());
/** @param {Ctx} ctx */
const minusSign = (ctx) => (ctx.bin ? mo(` ${MINUS} `, 'mbin') : mo(MINUS, 'mun'));

const hook = () =>
  s('svg', { class: 'rhook', viewBox: '0 0 12 24', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    s('path', {
      d: 'M0.5 14 L3.5 12 L7 22.5 L11 1 L12 1', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7',
      'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));

// ------------------------------------------------------------------ renderer

/**
 * @param {Node} n @param {string} path @param {Ctx} ctx @param {RenderOpts} o
 * @returns {VNode}
 */
function r(n, path, ctx, o) {
  const P = (/** @type {string} */ cls) => ({ 'data-path': path, class: cls });
  switch (n.t) {
    case 'num': {
      const neg = n.q.n < 0n;
      const a = neg ? -n.q.n : n.q.n;
      const body = n.q.d === 1n
        ? mn(`${a}`)
        : h('span', { class: 'frac' }, h('span', { class: 'fnum' }, mn(`${a}`)), h('span', { class: 'fden' }, mn(`${n.q.d}`)));
      return h('span', P('mnum'), neg ? minusSign(ctx) : null, body);
    }
    case 'var':
      return h('span', P('mi'), n.name);
    case 'group': {
      const inner = r(n.arg, `${path}.0`, {}, o);
      if (ctx.elide && !o.preview) return h('span', P('mgrp mgrp-elided'), inner);
      return h('span', P('mgrp'), po(), inner, pc());
    }
    case 'neg': {
      const par = isSum(n.arg) || startsMinus(n.arg, o);
      const inner = r(n.arg, `${path}.0`, par ? {} : { um: !ctx.bin }, o);
      return h('span', P('mneg'), minusSign(ctx), par ? parens(inner) : inner);
    }
    case 'add': {
      if (n.args.length === 0) return h('span', P('madd'), mn('0'));
      if (n.args.length === 1) return h('span', P('madd'), r(n.args[0], `${path}.0`, ctx, o));
      return h('span', P('madd'), n.args.map((a, i) => {
        const p = `${path}.${i}`;
        if (i === 0) return r(a, p, { bin: ctx.bin, um: ctx.um }, o);
        if (startsMinus(a, o)) return r(a, p, { bin: true }, o);
        return [mo(' + ', 'mbin'), r(a, p, {}, o)];
      }));
    }
    case 'mul': {
      if (n.args.length === 0) return h('span', P('mmul'), mn('1'));
      if (n.args.length === 1) return h('span', P('mmul'), r(n.args[0], `${path}.0`, ctx, o));
      return h('span', P('mmul'), n.args.map((f, i) => {
        const p = `${path}.${i}`;
        if (i === 0) {
          if (firstFactorParens(f, o)) return parens(r(f, p, {}, o));
          return r(f, p, { bin: ctx.bin, um: ctx.um }, o);
        }
        if (isSum(f) || startsMinus(f, o) || (o.preview && isFracLike(f))) return parens(r(f, p, {}, o));
        return startsNumeric(f, o) ? [mo(DOT, 'mdot'), r(f, p, {}, o)] : r(f, p, {}, o);
      }));
    }
    case 'frac': {
      /** @param {Node} part @param {string} p */
      const side = (part, p) => {
        const inner = r(part, p, { elide: true }, o);
        return o.preview && isFracLike(part) ? parens(inner) : inner;
      };
      return h('span', P('frac'),
        h('span', { class: 'fnum' }, side(n.num, `${path}.0`)),
        h('span', { class: 'fden' }, side(n.den, `${path}.1`)));
    }
    case 'pow': {
      const b = r(n.base, `${path}.0`, {}, o);
      const base = simpleBase(n.base) ? b : parens(b);
      const exp = h('sup', { class: 'msup' }, r(n.exp, `${path}.1`, { elide: true }, o));
      if (o.preview && ctx.um) return h('span', P('mpow'), po(), base, exp, pc());
      return h('span', P('mpow'), base, exp);
    }
    case 'root': {
      const idx = n.index !== 2 ? h('sup', { class: 'rindex' }, `${n.index}`) : null;
      return h('span', P('mroot'), idx, hook(), h('span', { class: 'radicand' }, r(n.radicand, `${path}.0`, { elide: true }, o)));
    }
  }
  throw new TypeError(`mathdom: unknown node ${JSON.stringify(/** @type {any} */ (n).t)}`);
}

/** @param {Node | Equation} x @returns {string} */
function label(x) {
  try { return print(x); } catch { return 'math'; }
}

/**
 * Render a Node or an Equation.
 * @param {Node | Equation} x
 * @param {RenderOpts} [opts]
 * @returns {VNode}
 */
export function renderMath(x, opts = {}) {
  const o = { preview: !!opts.preview };
  if (x.t === 'eq') {
    return h('span', { class: 'm meq', role: 'img', 'aria-label': label(x) },
      h('span', { class: 'mside' }, r(x.lhs, 'l', {}, o)),
      h('span', { class: 'mside' }, mo(' = ', 'meqop'), r(x.rhs, 'r', {}, o)));
  }
  return h('span', { class: 'm', role: 'img', 'aria-label': label(x) }, r(x, 'e', {}, o));
}

/**
 * Render a comma-separated list (solution lists, tuples) that wraps at commas.
 * Item k's paths are prefixed 'i<k>:' (e.g. 'i0:e.1').
 * @param {(Node | Equation)[]} items
 * @param {RenderOpts} [opts]
 * @returns {VNode}
 */
export function renderList(items, opts = {}) {
  return h('span', { class: 'mlist' }, items.map((it, k) => {
    const v = renderMath(it, opts);
    prefixPaths(v, `i${k}:`);
    return k === 0 ? v : [h('span', { class: 'm mcomma' }, mo(', ')), v];
  }));
}

/** @param {VNode} v @param {string} pre */
function prefixPaths(v, pre) {
  if (v.attrs['data-path'] !== undefined) v.attrs['data-path'] = pre + v.attrs['data-path'];
  for (const c of v.children) if (typeof c !== 'string') prefixPaths(c, pre);
}

/**
 * Resolve a data-path back to its Node, or undefined.
 * @param {Node | Equation} x
 * @param {string} path
 * @returns {Node | undefined}
 */
export function nodeAtPath(x, path) {
  const parts = path.split('.');
  /** @type {Node | undefined} */
  let n;
  if (x.t === 'eq') n = parts[0] === 'l' ? x.lhs : parts[0] === 'r' ? x.rhs : undefined;
  else n = parts[0] === 'e' ? x : undefined;
  for (let i = 1; i < parts.length && n; i++) {
    if (!/^\d+$/.test(parts[i])) return undefined;
    const k = Number(parts[i]);
    /** @type {Node[]} */
    let kids;
    switch (n.t) {
      case 'add': case 'mul': kids = n.args; break;
      case 'neg': case 'group': kids = [n.arg]; break;
      case 'frac': kids = [n.num, n.den]; break;
      case 'pow': kids = [n.base, n.exp]; break;
      case 'root': kids = [n.radicand]; break;
      default: kids = [];
    }
    n = kids[k];
  }
  return n;
}

// ------------------------------------------------------------------ width estimate

// Em widths, kept in step with MATH_CSS below. Deliberately generous.
const EM = Object.freeze({
  digit: 0.6, space: 0.3, op: 0.68, dot: 0.36, comma: 0.32, paren: 0.38, other: 0.7,
  /** .mi is a 1.08em serif italic */
  mi: 0.6, miWide: 0.88, miCap: 0.76, miCapWide: 1.0,
  hook: 0.55, radPad: 0.16,
  fracScale: 1, fracPad: 0.18, fracMargin: 0.08,
  supScale: 0.62, supMargin: 0.06,
});
/** Multiplies every estimate: covers font differences across devices. */
export const WIDTH_SAFETY = 1.1;

/** @param {string} c @param {boolean} inMi */
function charEm(c, inMi) {
  if (inMi) {
    if (c === 'M' || c === 'W') return EM.miCapWide;
    if (c === 'm' || c === 'w') return EM.miWide;
    if (c >= 'A' && c <= 'Z') return EM.miCap;
    return EM.mi;
  }
  if (c >= '0' && c <= '9') return EM.digit;
  if (c === ' ') return EM.space;
  if (c === '(' || c === ')') return EM.paren;
  if (c === DOT) return EM.dot;
  if (c === ',') return EM.comma;
  if (c === '+' || c === MINUS || c === '=' || c === '\u00b1') return EM.op;
  return EM.other;
}

/**
 * Width in em of a rendered vnode (before the safety factor).
 * @param {VNode | string} v
 * @param {boolean} [inMi]
 * @returns {number}
 */
export function vnodeEm(v, inMi = false) {
  if (typeof v === 'string') {
    let w = 0;
    for (const c of v) w += charEm(c, inMi);
    return w;
  }
  const cls = (v.attrs.class || '').split(/\s+/);
  if (cls.includes('rhook')) return EM.hook;
  const kids = v.children;
  const sum = (/** @type {boolean} */ mi) => kids.reduce((acc, c) => acc + vnodeEm(c, mi), 0);
  if (cls.includes('frac')) {
    let w = 0;
    for (const c of kids) w = Math.max(w, vnodeEm(c, inMi));
    return EM.fracScale * (w + 2 * EM.fracPad) + 2 * EM.fracMargin;
  }
  if (cls.includes('msup') || cls.includes('rindex')) return EM.supScale * sum(inMi) + EM.supMargin;
  if (cls.includes('radicand')) return sum(inMi) + EM.radPad;
  return sum(inMi || cls.includes('mi'));
}

/**
 * Estimated display width in CSS px. For an equation, also each side's width
 * (rhs includes the "= "), which is what a wrapped equation needs per line.
 * @param {Node | Equation} x
 * @param {{ fontPx?: number }} [opts]
 * @returns {{ oneLine: number; lhs?: number; rhs?: number }}
 */
export function estimateWidth(x, opts = {}) {
  const px = (opts.fontPx ?? DEFAULT_MATH_PX) * WIDTH_SAFETY;
  const v = renderMath(x);
  if (x.t === 'eq') {
    const [l, rr] = /** @type {VNode[]} */ (v.children);
    const lhs = vnodeEm(l) * px;
    const rhs = vnodeEm(rr) * px;
    return { oneLine: lhs + rhs, lhs, rhs };
  }
  return { oneLine: vnodeEm(v) * px };
}

/**
 * The width x will occupy in a box capPx wide (an equation wraps at "=" when
 * it must), in CSS px.
 * @param {Node | Equation} x
 * @param {{ fontPx?: number; capPx?: number }} [opts]
 */
export function displayWidth(x, opts = {}) {
  const cap = opts.capPx ?? DISPLAY_CAP_PX;
  const w = estimateWidth(x, opts);
  if (w.oneLine <= cap || w.lhs === undefined || w.rhs === undefined) return w.oneLine;
  return Math.max(w.lhs, w.rhs);
}

/**
 * Generators call this: does x fit the display cap (wrapping at "=" if needed)?
 * @param {Node | Equation} x
 * @param {{ fontPx?: number; capPx?: number }} [opts]
 * @returns {boolean}
 */
export function fitsDisplay(x, opts = {}) {
  return displayWidth(x, opts) <= (opts.capPx ?? DISPLAY_CAP_PX);
}

// ------------------------------------------------------------------ stylesheet

/**
 * Stylesheet for .m trees; inject once (a <style> element). Colors inherit.
 * Sizes (section 9: math at 22px or larger): .m is at least 22px whatever its
 * container sets; fraction parts are NOT shrunk (1em), so nested fractions
 * keep the full size. Exponents and root indices are 0.62em (about 15px at
 * 24px): a superscript is smaller by convention, and section 9 does not say
 * whether its 22px floor covers superscripts; that is an open question for
 * the spec owner, not a settled reading.
 */
export const MATH_CSS = `
.m { display: inline-block; white-space: nowrap; font-size: max(22px, 1em); font-family: -apple-system, "Helvetica Neue", system-ui, sans-serif; line-height: 1.2; }
.m .mi { font-style: italic; font-family: "Times New Roman", Georgia, serif; font-size: 1.08em; }
.m .mo { white-space: pre; }
.m .po { font-weight: 300; }
.m .frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; font-size: 1em; margin: 0 0.08em; }
.m .fnum { padding: 0 0.18em 0.04em; border-bottom: 0.07em solid currentColor; line-height: 1.12; }
.m .fden { padding: 0.04em 0.18em 0; line-height: 1.12; }
.m .mroot { display: inline-flex; align-items: stretch; vertical-align: middle; }
.m .rhook { width: 0.55em; min-height: 1.15em; height: auto; flex: none; display: block; overflow: visible; }
.m .radicand { border-top: 0.07em solid currentColor; padding: 0.06em 0.1em 0 0.06em; line-height: 1.1; }
.m .msup { font-size: 0.62em; vertical-align: 0.8em; line-height: 0; margin-left: 0.06em; }
.m .rindex { font-size: 0.62em; align-self: flex-start; margin-right: -0.3em; margin-left: 0.06em; line-height: 1; }
.meq { display: inline-flex; flex-wrap: wrap; justify-content: center; align-items: center; white-space: normal; max-width: 100%; }
.mside { display: inline-flex; align-items: center; white-space: nowrap; }
.mlist { display: inline-flex; flex-wrap: wrap; justify-content: center; align-items: center; max-width: 100%; }
`;
