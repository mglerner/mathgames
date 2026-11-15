// @ts-check
// AST -> keypad-style text that parse.js reads back to the same value
// (and to the same tree, for trees that came from parse.js).

/** @typedef {import('./ast.js').Node} Node */
/** @typedef {import('./ast.js').Equation} Equation */

/** @param {Node} n @returns {number} binding level: add 1, neg 2, mul 3, frac 4, pow 5, atom 6 */
function level(n) {
  switch (n.t) {
    case 'add':
      return 1;
    case 'neg':
      return 2;
    case 'mul':
      return 3;
    case 'frac':
      return 4;
    case 'pow':
      return 5;
    case 'num':
      if (n.q.n < 0n) return 2;
      if (n.q.d !== 1n) return 4;
      return 6;
    default:
      return 6;
  }
}

/**
 * Can this exponent be printed without parentheses? (expon := '-'? atom ('^' expon)?)
 * @param {Node} e @returns {boolean}
 */
function bareExp(e) {
  if (e.t === 'neg') return e.arg.t !== 'neg' && bareExp(e.arg);
  if (e.t === 'pow') return level(e.base) >= 6 && bareExp(e.exp);
  return level(e) >= 6;
}

/** @param {Node} n @param {number} min */
function at(n, min) {
  const s = pr(n);
  return level(n) < min ? `(${s})` : s;
}

/** @param {Node} n @returns {string} */
function pr(n) {
  switch (n.t) {
    case 'num': {
      const a = n.q.n < 0n ? -n.q.n : n.q.n;
      const body = n.q.d === 1n ? `${a}` : `${a}/${n.q.d}`;
      return n.q.n < 0n ? `-${body}` : body;
    }
    case 'var':
      return n.name;
    case 'group':
      return `(${pr(n.arg)})`;
    case 'root': {
      const r = n.radicand;
      const inner = pr(r);
      // sqrt takes one atom; anything bigger needs parentheses
      return level(r) >= 6 && r.t !== 'group' ? `sqrt${inner}` : r.t === 'group' ? `sqrt${inner}` : `sqrt(${inner})`;
    }
    case 'pow': {
      const e = n.exp;
      return `${at(n.base, 6)}^${bareExp(e) ? pr(e) : `(${pr(e)})`}`;
    }
    case 'frac':
      return `${at(n.num, 4)}/${at(n.den, 5)}`;
    case 'mul': {
      let s = '';
      n.args.forEach((a, i) => {
        const part = at(a, 4);
        if (i > 0) {
          // a digit right after a digit (or after "sqrt3") would merge; use "*"
          const needStar = n.explicit || /^[0-9]/.test(part) || (/[0-9]$/.test(s) && /^[0-9]/.test(part));
          s += needStar ? '*' : '';
        }
        s += part;
      });
      return s;
    }
    case 'neg':
      return `-${at(n.arg, 2)}`;
    case 'add': {
      let s = at(n.args[0], 2);
      for (let i = 1; i < n.args.length; i++) {
        const a = n.args[i];
        if (a.t === 'neg') s += `-${at(a.arg, 2)}`;
        else s += `+${at(a, 2)}`;
      }
      return s;
    }
  }
  return '?';
}

/** @param {Node | Equation} x @returns {string} */
export function print(x) {
  if (x.t === 'eq') return `${pr(x.lhs)}=${pr(x.rhs)}`;
  return pr(x);
}
