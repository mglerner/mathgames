// @ts-check
// AST -> vnode math renderer: flex-column fractions, <sup> exponents, an SVG radical hook with
// a CSS vinculum. Every node is a span with data-path. Glyphs are written as escapes.
import { h, s } from './vnode.js';
import { stripGroups } from './ast.js';

/** @typedef {import('./ast.js').Node} Node */
/** @typedef {import('./ast.js').Equation} Equation */
/** @typedef {import('./vnode.js').VNode} VNode */

const MINUS = '\u2212';
const TIMES = '\u00d7';
const DOT = '\u00b7';

/** @param {string} t */
const mo = (t) => h('span', { class: 'mo' }, t);
/** @param {VNode} inner */
const parens = (inner) => h('span', { class: 'mparen' }, h('span', { class: 'po' }, '('), inner, h('span', { class: 'po' }, ')'));

/** @param {Node} n @returns {boolean} */
function startsWithNumber(n) {
  switch (n.t) {
    case 'num':
      return true;
    case 'frac':
      return startsWithNumber(n.num);
    case 'mul':
      return startsWithNumber(n.args[0]);
    case 'pow':
      return startsWithNumber(n.base);
    default:
      return false;
  }
}

const hook = () =>
  s(
    'svg',
    { class: 'rhook', viewBox: '0 0 12 24', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    s('path', { d: 'M0.5 14 L3.5 12 L7 22.5 L11 1 L12 1', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }),
  );

/** @param {Node} n @param {string} path @returns {VNode} */
function r(n, path) {
  const P = { 'data-path': path };
  switch (n.t) {
    case 'num': {
      const neg = n.q.n < 0n;
      const a = neg ? -n.q.n : n.q.n;
      const body =
        n.q.d === 1n
          ? h('span', { class: 'mn' }, `${a}`)
          : h('span', { class: 'frac' }, h('span', { class: 'fnum' }, h('span', { class: 'mn' }, `${a}`)), h('span', { class: 'fden' }, h('span', { class: 'mn' }, `${n.q.d}`)));
      return h('span', P, neg ? mo(MINUS) : null, body);
    }
    case 'var':
      return h('span', { ...P, class: 'mi' }, n.name);
    case 'group':
      return h('span', P, parens(r(n.arg, `${path}.0`)));
    case 'neg': {
      const a = stripGroups(n.arg) === n.arg && (n.arg.t === 'add' || n.arg.t === 'neg') ? parens(r(n.arg, `${path}.0`)) : r(n.arg, `${path}.0`);
      return h('span', P, mo(MINUS), a);
    }
    case 'add':
      return h(
        'span',
        P,
        n.args.map((a, i) => {
          const p = `${path}.${i}`;
          if (i === 0) return r(a, p);
          if (a.t === 'neg') {
            const inner = a.arg.t === 'add' || a.arg.t === 'neg' ? parens(r(a.arg, `${p}.0`)) : r(a.arg, `${p}.0`);
            return [mo(` ${MINUS} `), inner];
          }
          return [mo(' + '), r(a, p)];
        }),
      );
    case 'mul':
      return h(
        'span',
        P,
        n.args.map((a, i) => {
          const p = `${path}.${i}`;
          const body = a.t === 'add' || a.t === 'neg' ? parens(r(a, p)) : r(a, p);
          if (i === 0) return body;
          if (n.explicit) return [mo(` ${TIMES} `), body];
          return startsWithNumber(a) ? [mo(DOT), body] : body;
        }),
      );
    case 'frac':
      return h(
        'span',
        { ...P, class: 'frac' },
        h('span', { class: 'fnum' }, r(stripGroups(n.num), `${path}.0`)),
        h('span', { class: 'fden' }, r(stripGroups(n.den), `${path}.1`)),
      );
    case 'pow': {
      const b = n.base;
      const simple = (b.t === 'num' && b.q.n >= 0n && b.q.d === 1n) || b.t === 'var' || b.t === 'group';
      const base = simple ? r(b, `${path}.0`) : parens(r(b, `${path}.0`));
      return h('span', P, base, h('sup', { class: 'msup' }, r(n.exp, `${path}.1`)));
    }
    case 'root':
      return h('span', { ...P, class: 'root' }, hook(), h('span', { class: 'radicand' }, r(stripGroups(n.radicand), `${path}.0`)));
  }
  return h('span', P, '?');
}

/**
 * @param {Node | Equation} x
 * @returns {VNode}
 */
export function renderMath(x) {
  if (x.t === 'eq') {
    return h('span', { class: 'm meq' }, h('span', { class: 'mside' }, r(x.lhs, 'l')), h('span', { class: 'mside' }, mo(' = '), r(x.rhs, 'r')));
  }
  return h('span', { class: 'm' }, r(x, 'e'));
}
