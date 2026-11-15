// Problems for episode 3: the four skills from episode 2, plus one new one.
//   frac   add or subtract fractions by multiplying by a well-chosen 1:   1/2 + 1/6 = __/__
// Same shape as heist2-skills.js (see the notes at the top of that file).
// story/test/siege3.test.js checks every fraction problem against independent arithmetic.
import { F, M } from './pilot.js';
import { problem as problem2, count as count2, SKILLS as SKILLS2, B, G, A, T, DO, red, shuffle, finish, near, range, cross, enough } from './heist2-skills.js';

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
/** A fraction as the student would write it (not reduced). */
const neg = (x) => (typeof x === 'number' && x < 0 ? `${M}${-x}` : x);
const fr = (n, d) => F(neg(n), neg(d));
/** A value in lowest terms, for an answer button. */
const low = (n, d) => { const [a, b] = red(n, d); return b === 1 ? `${a < 0 ? M : ''}${Math.abs(a)}` : `${a < 0 ? M : ''}${F(Math.abs(a), b)}`; };
const lowT = (n, d) => { const [a, b] = red(n, d); return b === 1 ? `${a}` : `${a}/${b}`; };
/** "= reduced" as an extra line of working, only when reducing changes something. */
const thenLow = (n, d, wrap = (x) => x) => (gcd(n, d) > 1 || d < 0 ? [`= ${wrap(low(n, d))}`] : []);

// a/b (+ or -) c/d.  form 0: d is a multiple of b, so only the first fraction needs a new name.
//                    form 1: b and d share no factor, so both do.
function frac([a, b, c, d, sg]) {
  const op = sg > 0 ? '+' : M;
  const opT = sg > 0 ? '+' : '-';
  const L = (b * d) / gcd(b, d); // the common bottom
  const kb = L / b, kd = L / d; // what each fraction is multiplied by, top and bottom
  const top = a * kb + sg * c * kd;
  const [N, D] = red(top, L);
  const expr = `${fr(a, b)} ${op} ${fr(c, d)}`;
  const exprT = `${a}/${b} ${opT} ${c}/${d}`;
  const one = (k) => F(k, k);
  const o = (n, dd, extra) => ({ html: low(n, dd), txt: lowT(n, dd), num: n / dd, ...extra });
  const both = kb > 1 && kd > 1;
  const opts = [
    o(N, D, { right: true }),
    {
      n: a + sg * c, d: b + sg * d,
      slip: `Tops and bottoms were ${sg > 0 ? 'added' : 'subtracted'} straight across. That only works for multiplying. To ${sg > 0 ? 'add' : 'subtract'}, the pieces have to be the same size first: both bottoms must be ${L}.`,
      guess: (n, dd) => [`${expr} = ${F(B(`${a} ${op} ${c}`), B(`${b} ${op} ${d}`))}`, `= ${B(fr(n, dd))}`, ...thenLow(n, dd, B)],
    },
    {
      n: a + sg * c, d: L,
      slip: `The bottom${both ? 's were' : ' was'} changed to ${L} but the top${both ? 's were' : ' was'} left alone, so the amount changed. Multiplying only the bottom is not multiplying by 1: ${fr(a, b)} ${T} ${one(kb)} = ${fr(a * kb, L)}.`,
      guess: (n, dd) => [`${expr} = ${fr(B(a), L)} ${op} ${fr(both ? B(c) : c, L)}`, `= ${B(fr(n, dd))}`, ...thenLow(n, dd, B)],
    },
    both ? {
      n: a * kb + sg * c, d: L,
      slip: `The first fraction was renamed correctly, but the second one's top was left alone. ${fr(c, d)} ${T} ${one(kd)} = ${fr(c * kd, L)}.`,
      guess: (n, dd) => [`${expr} = ${fr(a * kb, L)} ${op} ${fr(B(c), L)}`, `= ${B(fr(n, dd))}`, ...thenLow(n, dd, B)],
    } : {
      n: a * c, d: b * d,
      slip: `That is the rule for multiplying fractions (top times top, bottom times bottom). This is ${sg > 0 ? 'adding' : 'subtracting'}: the pieces have to be the same size first.`,
      guess: (n, dd) => [`${expr} = ${F(B(`${a} ${T} ${c}`), B(`${b} ${T} ${d}`))}`, `= ${B(fr(n, dd))}`, ...thenLow(n, dd, B)],
    },
    {
      n: a * kb + sg * c * kd, d: b + d,
      slip: `The tops were renamed correctly, but then the two bottoms were added. Once both fractions are in ${L}ths the bottom stays ${L}: you are counting ${L}ths, not changing their size.`,
      guess: (n, dd) => [`${expr} = ${fr(a * kb, L)} ${op} ${fr(c * kd, L)}`, `= ${F(top, B(`${b} + ${d}`))}`, `= ${B(fr(n, dd))}`, ...thenLow(n, dd, B)],
    },
  ].map((w) => (w.right ? w : o(w.n, w.d, { slip: w.slip, guess: w.guess(w.n, w.d) })));
  // A slip that lands on zero or a negative number is not a believable choice for a sum of positive pieces.
  const options = finish(opts.filter((w) => w.right || (Number.isFinite(w.num) && w.num > 0)), (q) => q.num.toFixed(6));
  const worked = [
    ...(kb > 1 ? [`${fr(a, b)} ${T} ${G(one(kb))} = ${fr(a * kb, L)}${A(`${one(kb)} is 1, so the value does not change`)}`] : []),
    ...(kd > 1 ? [`${fr(c, d)} ${T} ${G(one(kd))} = ${fr(c * kd, L)}${A(kb > 1 ? 'same trick' : `${one(kd)} is 1, so the value does not change`)}`] : []),
    `${fr(a * kb, L)} ${op} ${fr(c * kd, L)} = ${F(`${a * kb} ${op} ${c * kd}`, L)}${A(`same-size pieces: ${sg > 0 ? 'add' : 'subtract'} the tops, keep the bottom`)}`,
    `= ${gcd(top, L) > 1 ? fr(top, L) : G(fr(top, L))}`,
    ...thenLow(top, L, G),
  ];
  return {
    askTxt: exprT, ansTxt: `${N}/${D}`,
    ask: `${DO('Work out, in lowest terms')}<span class="nw">${expr}</span>`, show: `<span class="nw">${expr}</span>`,
    typed: `<span class="nw">${expr} = ${F('{0}', '{1}')}</span>`,
    typedHint: 'Top box, then bottom box. Give the answer in lowest terms.',
    boxes: 2, answer: [N, D], options, worked,
    grade: (v) => {
      if (v[0] === N && v[1] === D) return { ok: true };
      if (v[1] > 0 && v[0] * D === N * v[1]) {
        return { ok: false, near: true, slip: `Right value, but not in lowest terms: ${v[0]} and ${v[1]} are both divisible by ${gcd(v[0], v[1])}.` };
      }
      const hit = v[1] > 0 ? options.find((q) => !q.right && near(q.num, v[0] / v[1])) : null;
      return { ok: false, id: hit ? hit.id : undefined, slip: hit ? hit.slip : `Rename ${kb > 1 && kd > 1 ? 'both fractions' : `${a}/${b}`} so the bottoms are both ${L}, by multiplying top and bottom by the same number. Then ${sg > 0 ? 'add' : 'subtract'} the tops.` };
    },
    gotTxt: (v) => `${v[0]}/${v[1]}`, gotHtml: (v) => F(v[0], v[1]),
  };
}

const proper = (b) => range(1, b - 1).filter((a) => gcd(a, b) === 1);
/** Every [a, b, c, d, sign] for these bottom pairs whose answer is positive and not a whole number. */
const fracSets = (pairs) => pairs.flatMap(([b, d]) => cross(proper(b), [b], proper(d), [d], [1, -1]))
  .filter(([a, b, c, d, sg]) => { const [n, dd] = red(a * d + sg * c * b, b * d); return n > 0 && dd > 1; });
const SETS = {
  frac: [
    shuffle(fracSets([[2, 4], [2, 6], [3, 6], [2, 8], [4, 8], [3, 9], [5, 10], [2, 10], [3, 12], [4, 12]]), 51),
    shuffle(fracSets([[2, 3], [2, 5], [3, 4], [3, 5], [4, 5], [2, 7], [3, 7]]), 52),
  ].map((set) => set.filter(enough(frac))),
};
const MAKERS = { frac: [frac, frac] };

export const SKILLS = { ...SKILLS2, frac: { name: 'Adding fractions with a well-chosen 1', forms: 2 } };
export const count = (skill, form) => (SETS[skill] ? SETS[skill][form].length : count2(skill, form));

/** The n-th problem of one form of a skill (wraps round, in either direction). */
export function problem(skill, form, n) {
  const c = count(skill, form);
  const k = ((n % c) + c) % c;
  if (!SETS[skill]) return { ...problem2(skill, form, k), n };
  const params = SETS[skill][form][k];
  const p = MAKERS[skill][form](params);
  const wrong = p.options.filter((o) => !o.right).slice(0, 4);
  return { skill, form, n, params, ...p, options: [p.options.find((o) => o.right), ...wrong] };
}
