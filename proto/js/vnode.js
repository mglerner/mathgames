// @ts-check
// Tiny virtual DOM so all rendering logic is DOM-free and testable; materialize() is the only
// function that touches a real (or fake) document.

/** @typedef {{ tag: string, ns?: string, attrs: Record<string, string>, children: (VNode | string)[] }} VNode */
/** @typedef {VNode | string | null | undefined | false | (VNode | string | null | undefined | false)[]} Child */

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

/** @param {string} tag @param {Record<string, string | number> | null} attrs @param {Child[]} children @returns {VNode} */
export function h(tag, attrs, ...children) {
  /** @type {Record<string, string>} */
  const a = {};
  for (const [k, val] of Object.entries(attrs || {})) a[k] = String(val);
  return { tag, attrs: a, children: flat(children) };
}

/** @param {string} tag @param {Record<string, string | number> | null} attrs @param {Child[]} children @returns {VNode} */
export function s(tag, attrs, ...children) {
  return { ...h(tag, attrs, ...children), ns: SVG_NS };
}

/**
 * @param {any} doc a Document (or the test fake)
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

/** All text in a vnode tree (tests and accessibility labels). @param {VNode | string} v @returns {string} */
export function textOf(v) {
  if (typeof v === 'string') return v;
  return v.children.map(textOf).join('');
}
