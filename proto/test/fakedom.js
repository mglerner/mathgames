// @ts-check
// Minimal fake DOM: just enough for app.js (createElement[NS], text nodes, attributes,
// classList, children, pointerdown listeners). Not a browser; see README for what that misses.

export class FakeNode {
  /** @param {string} tag @param {string | null} [ns] */
  constructor(tag, ns = null) {
    this.tagName = tag.toUpperCase();
    this.namespaceURI = ns;
    /** @type {FakeNode[]} */
    this.childNodes = [];
    /** @type {FakeNode | null} */
    this.parentNode = null;
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {Record<string, Function[]>} */
    this.listeners = {};
    /** @type {Record<string, string>} */
    this.style = {};
    this._text = '';
    this.value = '';
    const self = this;
    this.classList = {
      /** @param {string[]} c */
      add: (...c) => self._setClasses([...new Set([...self._classes(), ...c])]),
      /** @param {string[]} c */
      remove: (...c) => self._setClasses(self._classes().filter((x) => !c.includes(x))),
      /** @param {string} c @param {boolean} [force] */
      toggle: (c, force) => {
        const has = self._classes().includes(c);
        const want = force === undefined ? !has : force;
        if (want && !has) self.classList.add(c);
        if (!want && has) self.classList.remove(c);
        return want;
      },
      /** @param {string} c */
      contains: (c) => self._classes().includes(c),
    };
  }
  _classes() {
    return (this.attrs.get('class') || '').split(/\s+/).filter(Boolean);
  }
  /** @param {string[]} cs */
  _setClasses(cs) {
    this.attrs.set('class', cs.join(' '));
  }
  /** @param {string} k @param {string} v */
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
  }
  /** @param {string} k */
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null;
  }
  /** @param {FakeNode} c */
  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  /** @param {FakeNode} c */
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i < 0) throw new Error('removeChild: not a child');
    this.childNodes.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null;
  }
  get textContent() {
    if (this.tagName === '#TEXT') return this._text;
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(t) {
    this.childNodes = [];
    if (this.tagName === '#TEXT') this._text = t;
    else if (t) {
      const n = new FakeNode('#text');
      n._text = t;
      this.appendChild(n);
    }
  }
  /** @param {string} type @param {Function} fn */
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  /** @param {string} type */
  dispatch(type) {
    let prevented = false;
    const ev = { type, button: 0, preventDefault: () => (prevented = true), target: this };
    for (const fn of this.listeners[type] || []) fn(ev);
    return prevented;
  }
}

export function makeDocument() {
  return {
    /** @param {string} tag */
    createElement: (tag) => new FakeNode(tag),
    /** @param {string} ns @param {string} tag */
    createElementNS: (ns, tag) => new FakeNode(tag, ns),
    /** @param {string} t */
    createTextNode: (t) => {
      const n = new FakeNode('#text');
      n._text = t;
      return n;
    },
  };
}

/** @param {FakeNode} root @param {(n: FakeNode) => boolean} pred @returns {FakeNode[]} */
export function findAll(root, pred) {
  /** @type {FakeNode[]} */
  const out = [];
  const walk = (/** @type {FakeNode} */ n) => {
    if (pred(n)) out.push(n);
    for (const c of n.childNodes) walk(c);
  };
  walk(root);
  return out;
}

/** @param {FakeNode} root @param {string} act */
export function byAct(root, act) {
  return findAll(root, (n) => n.getAttribute('data-act') === act);
}
