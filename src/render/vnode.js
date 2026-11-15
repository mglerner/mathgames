// @ts-check
// Tiny virtual-node layer so every rendering decision is plain data and can be
// tested under node. materialize() is the only function that touches a
// Document (a real one, or a test fake with createElement / createElementNS /
// createTextNode / setAttribute / appendChild).

/** @typedef {{ tag: string; ns?: string; attrs: Record<string, string>; children: (VNode | string)[] }} VNode */
/** @typedef {VNode | string | null | undefined | false | Child[]} Child */

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** @param {Child[]} cs @returns {(VNode | string)[]} */
function flat(cs) {
  /** @type {(VNode | string)[]} */
  const out = [];
  for (const c of cs) {
    if (Array.isArray(c)) out.push(...flat(c));
    else if (c !== null && c !== undefined && c !== false) out.push(c);
  }
  return out;
}

/**
 * HTML element.
 * @param {string} tag
 * @param {Record<string, string | number | undefined> | null} attrs undefined values are dropped
 * @param {...Child} children
 * @returns {VNode}
 */
export function h(tag, attrs, ...children) {
  /** @type {Record<string, string>} */
  const a = {};
  for (const [k, val] of Object.entries(attrs || {})) if (val !== undefined) a[k] = String(val);
  return { tag, attrs: a, children: flat(children) };
}

/**
 * SVG element.
 * @param {string} tag
 * @param {Record<string, string | number | undefined> | null} attrs
 * @param {...Child} children
 * @returns {VNode}
 */
export function s(tag, attrs, ...children) {
  return { ...h(tag, attrs, ...children), ns: SVG_NS };
}

/**
 * Build real (or fake) DOM from a vnode.
 * @param {any} doc a Document
 * @param {VNode | string} v
 * @returns {any}
 */
export function materialize(doc, v) {
  if (typeof v === 'string') return doc.createTextNode(v);
  const el = v.ns ? doc.createElementNS(v.ns, v.tag) : doc.createElement(v.tag);
  for (const [k, val] of Object.entries(v.attrs)) el.setAttribute(k, val);
  for (const c of v.children) el.appendChild(materialize(doc, c));
  return el;
}

/** All text in a vnode tree. @param {VNode | string} v @returns {string} */
export function textOf(v) {
  if (typeof v === 'string') return v;
  return v.children.map(textOf).join('');
}

/** @param {VNode} v @param {string} cls @returns {boolean} */
export function hasClass(v, cls) {
  return (v.attrs.class || '').split(/\s+/).includes(cls);
}

/**
 * Every element in the tree (pre-order), optionally filtered.
 * @param {VNode | string} v
 * @param {(n: VNode) => boolean} [pred]
 * @returns {VNode[]}
 */
export function findAll(v, pred = () => true) {
  /** @type {VNode[]} */
  const out = [];
  /** @param {VNode | string} n */
  const go = (n) => {
    if (typeof n === 'string') return;
    if (pred(n)) out.push(n);
    n.children.forEach(go);
  };
  go(v);
  return out;
}
