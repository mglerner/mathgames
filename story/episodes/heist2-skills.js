// Generated problems for episode 2, four skills:
//   dist        distribute a negative:            7 - 2(x - 3) = __x + __
//   solve       solve a linear equation:          5 - 3x = 2x + 20
//   simplify    simplify a square root:           sqrt(72) = __ sqrt(__)
//   rationalize clear a root from the bottom:     12 / sqrt(3) = __ sqrt(__)
// Each skill has a few "forms" (shapes of problem), each with a fixed, shuffled
// list of number sets, so the n-th problem of a form is always the same and the
// tests can check every one. A problem carries:
//   - multiple-choice options whose wrong answers come from named slips, each
//     with the working the student probably wrote (`guess`, slip marked red),
//   - the working done correctly (`worked`, key step marked green),
//   - a typed-answer template and a `grade` function for the floor locks.
// story/test/heist2.test.js verifies every problem against independent math.
import { F, R, M } from './pilot.js';

const B = (x) => `<mark class="bad">${x}</mark>`;
const G = (x) => `<mark class="good">${x}</mark>`;
const A = (x) => ` <span class="ann">${x}</span>`;
const T = '&times;';
/** The instruction, on its own line above the math, so "Expand 3 - 2(...)" cannot be read as "Expand 3". */
const DO = (x) => `<span class="do">${x}</span>`;
/** Plain-text math to display math: proper minus signs. */
const h = (s) => String(s).replace(/-/g, M);
const sx = (c) => (c === 1 ? 'x' : c === -1 ? '-x' : `${c}x`);
const pl = (n) => (n < 0 ? `- ${-n}` : `+ ${n}`);
const plx = (c) => (c < 0 ? `- ${c === -1 ? '' : -c}x` : `+ ${c === 1 ? '' : c}x`);
const lin = (a, b) => (b === 0 ? sx(a) : `${sx(a)} ${pl(b)}`);
const signed = (n) => (n < 0 ? `${n}` : `+${n}`);
const par = (n) => (n < 0 ? `(${n})` : `${n}`);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
/** Reduced fraction as [n, d] with d > 0. */
const red = (n, d) => { const g = gcd(n, d) || 1; const s = d < 0 ? -1 : 1; return [(s * n) / g, (s * d) / g]; };
const frT = (n, d) => { const [a, b] = red(n, d); return b === 1 ? `${a}` : `${a}/${b}`; };
const frH = (n, d) => { const [a, b] = red(n, d); return b === 1 ? h(a) : `${a < 0 ? M : ''}${F(Math.abs(a), b)}`; };
const BAL = (rows) => `<span class="bal">${rows.map(([l, r, op]) =>
  `<span class="l${op ? ' op' : ''}">${h(l)}</span><span class="m${op ? ' op' : ''}">${op ? '&nbsp;' : '='}</span><span class="r${op ? ' op' : ''}">${op ? h(r) : r}</span>`).join('')}</span>`;
const both = (s) => [s, s, true];
const near = (a, b) => Math.abs(a - b) < 1e-9;

/** Repeatable shuffle, so problem n is the same on every device and in the tests. */
function shuffle(xs, seed) {
  const a = xs.slice();
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 48271) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Keep the right answer, drop wrong options that repeat an earlier one or equal the right one. */
function finish(opts, keyOf) {
  const seen = new Set();
  const out = [];
  for (const o of opts) {
    const k = keyOf(o);
    if (seen.has(k) || seen.has(o.txt)) continue;
    seen.add(k); seen.add(o.txt);
    out.push({ id: `o${out.length}`, ...o });
  }
  return out;
}

// ---------------------------------------------------------------- dist
// c + m(px + q) with m negative; the answer is (mp)x + (c + mq).
function dist([c, m, p, q]) {
  const am = -m;
  const expr = `${c ? `${c} - ` : '-'}${am === 1 ? '' : am}(${lin(p, q)})`;
  const a = m * p, b = c + m * q;
  const head = (k) => (c ? `${c} ${plx(k)}` : sx(k));
  const opt = (va, vb, extra) => ({ html: h(lin(va, vb)), txt: lin(va, vb), vals: [va, vb], ...extra });
  const collect = (va, vb) => (c ? [`= ${h(lin(va, vb))}`] : []);
  const signSlip = opt(a, c - m * q, {
      slip: q < 0
        ? `The second product is ${h(m)} ${T} ${h(par(q))}. A negative times a negative is positive, so it is ${h(signed(m * q))}.`
        : `The second product is ${h(m)} ${T} ${q}. A negative times a positive is negative, so it is ${h(signed(m * q))}.`,
      guess: [h(expr), `= ${h(head(a))} ${B(h(pl(-m * q)))}`, ...collect(a, c - m * q)],
    });
  const reachSlip = opt(a, c + q, {
      slip: am === 1
        ? `The minus sign outside the brackets applies to every term inside, not just the first one.`
        : `The ${h(m)} multiplies every term inside the brackets, not just the first one.`,
      guess: [h(expr), `= ${h(head(a))} ${B(h(pl(q)))}`, ...collect(a, c + q)],
    });
  const opts = [
    opt(a, b, { right: true }),
    ...((am === 1) ? [reachSlip, signSlip] : [signSlip, reachSlip]),
    opt(-a, c - m * q, {
      slip: c
        ? `The minus sign in front of the ${am === 1 ? 'brackets' : am} belongs to it. You are multiplying the brackets by ${h(m)}, not by ${am}.`
        : `The minus sign out front got dropped. You are multiplying by ${h(m)}, not by ${am}.`,
      guess: [h(expr), `= ${B(h(c ? `${c} ${plx(-a)} ${pl(-m * q)}` : lin(-a, -m * q)))}`, ...collect(-a, c - m * q)],
    }),
  ];
  opts.push(opt(-a, b, {
    slip: `The first product lost its sign: ${h(m)} ${T} ${h(sx(p))} is ${h(sx(a))}, not ${h(sx(-a))}.`,
    guess: [h(expr), `= ${B(h(c ? `${c} ${plx(-a)}` : sx(-a)))} ${h(pl(m * q))}`, ...collect(-a, b)],
  }));
  if (c && c + m !== 0) {
    opts.push(opt((c + m) * p, (c + m) * q, {
      slip: `${c} ${h(pl(m))} was done first. Multiplying comes before adding and subtracting: the ${h(m)} has to multiply the brackets before the ${c} gets involved.`,
      guess: [h(expr), `= ${B(h(c + m))}(${h(lin(p, q))})`, `= ${h(lin((c + m) * p, (c + m) * q))}`],
    }));
  }
  const worked = [
    `${h(m)} ${T} ${h(sx(p))} = ${h(sx(a))}${am === 1 ? A('a minus sign alone means &minus;1 times') : ''}`,
    `${h(m)} ${T} ${h(par(q))} = ${G(h(signed(m * q)))}${q < 0 ? A('negative &times; negative = positive') : A('negative &times; positive = negative')}`,
    `${h(expr)} = ${h(head(a))} ${G(h(pl(m * q)))}`,
    ...(c ? [`= ${h(lin(a, b))}${A(`${c} and ${h(signed(m * q))} combine`)}`] : []),
  ];
  const options = finish(opts, (o) => o.vals.join(','));
  return {
    askTxt: expr, ansTxt: lin(a, b),
    ask: `${DO('Expand')}<span class="nw">${h(expr)}</span>`, show: `<span class="nw">${h(expr)}</span>`,
    typed: `<span class="nw">${h(expr)}</span> <span class="nw">= {0}<span class="xvar">x</span>{s1}{1}</span>`,
    typedHint: 'Type the number in front of x. Then choose + or &minus; for the second term (tap the &plusmn;, or use the +/&minus; key) and type the plain number.',
    boxes: 2, signed: [1], neg: true, answer: [a, b], options, worked,
    grade: (v) => {
      if (v[0] === a && v[1] === b) return { ok: true };
      const hit = options.find((o) => !o.right && o.vals[0] === v[0] && o.vals[1] === v[1]);
      return { ok: false, id: hit ? hit.id : undefined, slip: hit ? hit.slip : (v[0] === a ? `The x part is right. Check the plain number: every product, with its sign.` : `Check the sign of each product, one at a time.`) };
    },
    gotTxt: (v) => lin(v[0], v[1]), gotHtml: (v) => h(lin(v[0], v[1])),
  };
}

// ---------------------------------------------------------------- solve
function solveOpts(x, wrongs) {
  const o = (n, d, extra) => ({ html: `x = ${frH(n, d)}`, txt: `x = ${frT(n, d)}`, num: n / d, ...extra });
  return finish([o(x, 1, { right: true }), ...wrongs.filter((w) => w.d !== 0 && Number.isFinite(w.n / w.d)).map((w) => o(w.n, w.d, { slip: w.slip, guess: w.guess(frH(w.n, w.d)) }))],
    (q) => q.num.toFixed(6));
}
function solveProblem(eq, x, options, worked, quick) {
  return {
    askTxt: eq, ansTxt: `x = ${x}`,
    ask: `<span class="nw">${h(eq)}</span>`, show: `<span class="nw">${h(eq)}</span>`,
    typed: `<span class="nw">${h(eq)}</span><br><span class="nw">x = {0}</span>`,
    typedHint: 'Solve on paper, then type x. Plug it back into the equation before you press Enter.',
    boxes: 1, neg: true, answer: [x], options, worked, quick,
    grade: (v) => {
      if (v[0] === x) return { ok: true };
      const hit = options.find((o) => !o.right && near(o.num, v[0]));
      return { ok: false, id: hit ? hit.id : undefined, slip: hit ? hit.slip : `Put your answer back into the original equation: the two sides do not match.` };
    },
    gotTxt: (v) => `x = ${v[0]}`, gotHtml: (v) => `x = ${h(v[0])}`,
  };
}

// form 0:  b - ax = c
function solve0([a, b, x]) {
  const c = b - a * x;
  const eq = `${b} - ${a}x = ${c}`;
  const options = solveOpts(x, [
    {
      n: -x, d: 1,
      slip: `The x term is ${h(`-${a}x`)}, not ${a}x: the minus sign in front belongs to it. So the last step is dividing by ${h(-a)}.`,
      guess: (v) => [h(eq), `${B(`${a}x`)} = ${h(c - b)}`, `x = ${B(v)}`],
    },
    {
      n: -(c + b), d: a,
      slip: `To clear the ${b} you subtract ${b} from both sides. It got added on the right instead.`,
      guess: (v) => [h(eq), `${h(`-${a}x`)} = ${h(c)} ${B(`+ ${b}`)}`, `x = ${B(v)}`],
    },
    {
      n: c - b, d: 1,
      slip: `${h(c - b)} is what ${h(`-${a}x`)} equals. One more step: divide both sides by ${h(-a)}.`,
      guess: (v) => [h(eq), `${h(`-${a}x`)} = ${h(c - b)}`, `x = ${B(v)}`],
    },
  ]);
  const worked = [BAL([
    [`${b} - ${a}x`, `${h(c)}`],
    both(`- ${b}`),
    [`${G(h(`-${a}x`))}`, `${h(c - b)}`],
    both(`/ (${-a})`.replace('/', '&divide;')),
    [`x`, `${G(h(x))}`],
  ])];
  const quick = `<p>Once the long way is solid: say "minus ${b} on both sides, then divide by ${h(-a)}" in your head, and write only what is left.</p>
    <div class="work"><div>${h(`-${a}x`)} = ${h(c - b)}</div><div>x = ${h(x)}</div></div>`;
  return solveProblem(eq, x, options, worked, quick);
}
// form 1:  m(x + q) = r, m negative
function solve1([m, q, x]) {
  const r = m * (x + q);
  const eq = `${m}(${lin(1, q)}) = ${r}`;
  const options = solveOpts(x, [
    {
      n: x + 2 * q, d: 1,
      slip: `The second product is ${h(m)} ${T} ${h(par(q))} = ${h(signed(m * q))}. Its sign came out wrong when you distributed.`,
      guess: (v) => [`${h(sx(m))} ${B(h(pl(-m * q)))} = ${h(r)}`, `${h(sx(m))} = ${B(h(r + m * q))}`, `x = ${B(v)}`],
    },
    {
      n: r - q, d: m,
      slip: `The ${h(m)} multiplies both terms in the brackets, not just the x.`,
      guess: (v) => [`${h(sx(m))} ${B(h(pl(q)))} = ${h(r)}`, `${h(sx(m))} = ${B(h(r - q))}`, `x = ${B(v)}`],
    },
    {
      n: -x, d: 1,
      slip: `Everything was right until the last line. Dividing by ${h(m)}, a negative, flips the sign.`,
      guess: (v) => [`${h(lin(m, m * q))} = ${h(r)}`, `${h(sx(m))} = ${h(r - m * q)}`, `x = ${B(v)}`],
    },
    {
      n: -x - 2 * q, d: 1,
      slip: `Dividing both sides by ${h(m)} first is fine, but ${h(r)} &divide; ${h(par(m))} is ${h(r / m)}, not ${h(-r / m)}.`,
      guess: (v) => [`${h(lin(1, q))} = ${B(h(-r / m))}`, `x = ${B(v)}`],
    },
  ]);
  const worked = [BAL([
    [`${m}(${lin(1, q)})`, `${h(r)}`],
    [`${sx(m)} ${G(h(pl(m * q)))}`, `${h(r)}`],
    both(pl(-m * q)),
    [`${sx(m)}`, `${h(r - m * q)}`],
    both(`&divide; (${m})`),
    [`x`, `${G(h(x))}`],
  ])];
  const quick = `<p>Once the long way is solid, the same moves fit in three short lines, with the "both sides" steps done in your head:</p>
    <div class="work"><div>${h(lin(m, m * q))} = ${h(r)}</div><div>${h(sx(m))} = ${h(r - m * q)}</div><div>x = ${h(x)}</div></div>`;
  return solveProblem(eq, x, options, worked, quick);
}
// form 2:  b - |a|x = cx + d, a negative and c positive
function solve2([a, b, c, x]) {
  const d = (a - c) * x + b;
  const eq = `${b} ${plx(a)} = ${lin(c, d)}`;
  const options = solveOpts(x, [
    {
      n: d - b, d: a + c,
      slip: `To move ${c}x off the right side you subtract ${c}x from both sides. That makes ${h(`${a}x - ${c}x = ${a - c}x`)} on the left, not ${h(sx(a + c))}.`,
      guess: (v) => [h(eq), `${b} ${B(h(plx(a + c)))} = ${h(d)}`, `x = ${B(v)}`],
    },
    {
      n: d + b, d: a - c,
      slip: `To clear the ${b} you subtract ${b} from both sides. It got added on the right instead.`,
      guess: (v) => [h(eq), `${h(sx(a - c))} = ${h(d)} ${B(`+ ${b}`)}`, `x = ${B(v)}`],
    },
    {
      n: -x, d: 1,
      slip: `Everything was right until the last line. Dividing by ${h(a - c)}, a negative, flips the sign.`,
      guess: (v) => [h(eq), `${h(sx(a - c))} = ${h(d - b)}`, `x = ${B(v)}`],
    },
  ]);
  const worked = [BAL([
    [`${b} ${plx(a)}`, `${h(lin(c, d))}`],
    both(`- ${c}x`),
    [`${b} ${G(h(plx(a - c)))}`, `${h(d)}`],
    both(`- ${b}`),
    [`${sx(a - c)}`, `${h(d - b)}`],
    both(`&divide; (${a - c})`),
    [`x`, `${G(h(x))}`],
  ])];
  const quick = `<p>Once the long way is solid: anything that leaves one side turns up on the other with its sign flipped, <i>because</i> you subtracted it from both.</p>
    <div class="work"><div>${h(sx(a - c))} = ${h(d - b)}</div><div>x = ${h(x)}</div></div>`;
  return solveProblem(eq, x, options, worked, quick);
}

// ---------------------------------------------------------------- simplify
// sqrt(s^2 m) = s sqrt(m), m square-free
function simplify([s, m]) {
  const N = s * s * m;
  const rt = (a, b) => (b === 1 ? `${a}` : a === 1 ? R(b) : `${a}${R(b)}`);
  const rtT = (a, b) => (b === 1 ? `${a}` : a === 1 ? `sqrt(${b})` : `${a} sqrt(${b})`);
  const o = (a, b, extra) => ({ html: rt(a, b), txt: rtT(a, b), num: a * Math.sqrt(b), ...extra });
  const split = `${R(N)} = ${R(`${s * s} ${T} ${m}`)}`;
  const opts = [
    o(s, m, { right: true }),
    o(s * s, m, {
      slip: `The ${s * s} has to go through the root to come out: ${R(s * s)} is ${s}, so ${s} is what appears outside.`,
      guess: [split, `= ${B(s * s)}${R(m)}`],
    }),
  ];
  // (Taking out a smaller square, e.g. 72 -> 3 sqrt(8), has the right value; `grade` handles it for typed answers.)
  if (![4, 8, 9, 10].includes(s) && s !== 6) {
    opts.push(o(m, s, {
      slip: `The wrong factor came out. ${s * s} is the perfect square, so its root, ${s}, is what leaves. The ${m} stays under the root.`,
      guess: [split, `= ${B(m)}${R(B(s))}`],
    }));
  }
  opts.push(o(s * m, 1, {
    slip: `The root sign fell off the ${m}. Only the perfect square comes out; the ${m} has to stay under the root.`,
    guess: [split, `= ${s} ${T} ${B(m)}`, `= ${B(s * m)}`],
  }));
  if (N % 2 === 0) {
    opts.push(o(N / 2, 1, {
      slip: `A square root is not half. It asks: what number times itself gives ${N}?`,
      guess: [`${R(N)} = ${N} ${B('&divide; 2')}`, `= ${B(N / 2)}`],
    }));
  }
  const options = finish(opts, (q) => q.num.toFixed(6));
  return {
    askTxt: `sqrt(${N})`, ansTxt: rtT(s, m),
    ask: `${DO('Simplify')}${R(N)}`, show: R(N),
    typed: `<span class="nw">${R(N)} = {0}${R('{1}')}</span>`,
    typedHint: 'First box: the number outside the root. Second box: what stays under it.',
    boxes: 2, answer: [s, m], options,
    worked: [
      `${R(N)} = ${R(`${G(s * s)} ${T} ${m}`)}${A(`${s * s} is the largest perfect square that divides ${N}`)}`,
      `= ${G(R(s * s))} ${T} ${R(m)}`,
      `= ${G(s)}${R(m)}`,
    ],
    grade: (v) => {
      if (v[0] === s && v[1] === m) return { ok: true };
      if (v[0] > 0 && v[1] > 0 && v[0] * v[0] * v[1] === N) {
        return { ok: false, near: true, slip: `Right value, but not finished: ${v[1]} still has a perfect-square factor. Look for the largest perfect square that divides ${N}, which is ${s * s}.` };
      }
      const hit = v[1] > 0 ? options.find((q) => !q.right && near(q.num, v[0] * Math.sqrt(v[1]))) : null;
      return { ok: false, id: hit ? hit.id : undefined, slip: hit ? hit.slip : `Square your answer to check it: (number outside)&sup2; times the number under the root should give back ${N}.` };
    },
    gotTxt: (v) => `${v[0]} sqrt(${v[1]})`, gotHtml: (v) => `${v[0]}${R(v[1])}`,
  };
}

// ---------------------------------------------------------------- rationalize
// a / (b sqrt(m)) = q sqrt(m), where a = q b m.  b = 1 is the plain form.
function rationalize([q, b, m]) {
  const a = q * b * m;
  const bot = b === 1 ? R(m) : `${b}${R(m)}`;
  const botT = b === 1 ? `sqrt(${m})` : `(${b} sqrt(${m}))`;
  const one = F(R(m), R(m));
  const rt = (k, n) => (n === 1 ? `${k}` : k === 1 ? R(n) : `${k}${R(n)}`);
  const rtT = (k, n) => (n === 1 ? `${k}` : k === 1 ? `sqrt(${n})` : `${k} sqrt(${n})`);
  const o = (k, n, extra) => ({ html: rt(k, n), txt: rtT(k, n), num: k * Math.sqrt(n), ...extra });
  const opts = [
    o(q, m, { right: true }),
    o(a / b, m, {
      slip: `Only the top got multiplied by ${R(m)}, so the amount changed. Multiply by ${one}: that is 1, so the value stays the same, and the bottom becomes ${b === 1 ? m : `${b} ${T} ${m}`}.`,
      guess: [`${F(a, bot)} ${T} ${B(R(m))} = ${B(`${a / b}${R(m)}`)}`],
    }),
    o(q, 1, {
      slip: `The ${R(m)} on the bottom was treated as a plain ${m}. To turn it into ${m} you multiply by ${R(m)}, and then the top has to be multiplied by ${R(m)} too.`,
      guess: [`${F(a, bot)} = ${F(a, B(b === 1 ? m : `${b} ${T} ${m}`))}`, `= ${B(q)}`],
    }),
  ];
  if (q !== 1 && q !== 4 && q !== 9) {
    opts.push(o(1, q, {
      slip: `The ${a} was never under a root, so it cannot be pulled under one. Only ${R(m)} ${T} ${R(m)} turns into a plain number.`,
      guess: [`${F(a, bot)} = ${B(R(`${a} &divide; ${b * m}`))}`, `= ${B(R(q))}`],
    }));
  }
  if (q !== m && q !== 4 && q !== 9) {
    opts.push(o(m, q, {
      slip: `The two numbers swapped places. ${a} &divide; ${b * m} = ${q} is the plain number outside; ${m} is what stays under the root.`,
      guess: [`${F(a, bot)} ${T} ${one} = ${F(`${a}${R(m)}`, b * m)}`, `= ${B(m)}${R(B(q))}`],
    }));
  }
  const options = finish(opts, (k) => k.num.toFixed(6));
  return {
    askTxt: `${a}/${botT}`, ansTxt: rtT(q, m),
    ask: `${DO('Rewrite with no root on the bottom')}${F(a, bot)}`, show: F(a, bot),
    typed: `<span class="nw">${F(a, bot)} = {0}${R('{1}')}</span>`,
    typedHint: 'First box: the number outside the root. Second box: what is under it.',
    boxes: 2, answer: [q, m], options,
    worked: [
      `${F(a, bot)} ${T} ${G(one)} = ${F(`${a}${R(m)}`, G(b === 1 ? m : `${b} ${T} ${m}`))}${A(`${R(m)} ${T} ${R(m)} = ${m}`)}`,
      ...(b === 1 ? [] : [`= ${F(`${a}${R(m)}`, b * m)}`]),
      `= ${G(`${q}${R(m)}`)}${A(`${a} &divide; ${b * m} = ${q}`)}`,
    ],
    grade: (v) => {
      if (v[0] === q && v[1] === m) return { ok: true };
      if (v[0] > 0 && v[1] > 0 && v[0] * v[0] * v[1] === q * q * m) {
        return { ok: false, near: true, slip: `Right value, but not in simplest form. The answer should be a whole number times ${R(m)}, with nothing left under the root that has a perfect-square factor.` };
      }
      const hit = v[1] > 0 ? options.find((k) => !k.right && near(k.num, v[0] * Math.sqrt(v[1]))) : null;
      return { ok: false, id: hit ? hit.id : undefined, slip: hit ? hit.slip : `Multiply top and bottom by ${R(m)}. That is multiplying by 1, so the value cannot change, and the bottom becomes a plain number.` };
    },
    gotTxt: (v) => `${v[0]} sqrt(${v[1]})`, gotHtml: (v) => `${v[0]}${R(v[1])}`,
  };
}

// ---------------------------------------------------------------- number sets
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const cross = (...lists) => lists.reduce((acc, l) => acc.flatMap((t) => l.map((v) => [...t, v])), [[]]);
const enough = (make, min = 3) => (p) => make(p).options.filter((o) => !o.right).length >= min;

const SETS = {
  dist: [
    // -a(x - b): the negative-times-negative trap
    shuffle(cross([0], range(-6, -2), [1], range(-9, -2)), 11),
    // -(px + q): the lone minus sign
    shuffle(cross([0], [-1], range(2, 5), [-9, -7, -5, -4, -3, 3, 4, 6, 8]), 12),
    // c - a(px + q): something in front
    shuffle(cross(range(3, 9), range(-4, -2), [1, 2], [-5, -4, -3, -2, 2, 3]).filter(([c, m, , q]) => c + m * q !== 0 && c + m !== 0), 13),
  ],
  solve: [
    shuffle(cross(range(2, 6), range(1, 12), [-6, -5, -4, -3, -2, 2, 3, 4, 5]), 21),
    shuffle(cross(range(-6, -2), [-7, -6, -5, -4, -3, -2, 2, 3, 4, 5], [-5, -4, -3, -2, -1, 1, 2, 3, 4]).filter(([, q, x]) => x + q !== 0), 22),
    shuffle(cross(range(-5, -2), range(2, 15), range(2, 5), [-5, -4, -3, -2, 2, 3, 4]).filter(([a, b, c, x]) => (a - c) * x + b !== 0 && a + c !== 0), 23),
  ],
  simplify: [
    shuffle(cross([2, 3, 5], [2, 3, 5, 6, 7]).filter(([s, m]) => s * s * m !== 50), 31),
    shuffle(cross([4, 6, 10], [2, 3, 5]).filter(([s, m]) => s * s * m !== 500), 32),
  ],
  rationalize: [
    shuffle(cross(range(2, 7), [1], [2, 3, 5, 7]).filter(([q, , m]) => !(q === 3 && m === 2)), 41),
    shuffle(cross(range(2, 5), [2, 3], [2, 3, 5]), 42),
  ],
};
const MAKERS = { dist: [dist, dist, dist], solve: [solve0, solve1, solve2], simplify: [simplify, simplify], rationalize: [rationalize, rationalize] };
for (const k of Object.keys(SETS)) SETS[k] = SETS[k].map((set, f) => set.filter(enough(MAKERS[k][f])));

export const SKILLS = {
  dist: { name: 'Distributing a negative', forms: 3 },
  solve: { name: 'Solving with negatives', forms: 3 },
  simplify: { name: 'Simplifying square roots', forms: 2 },
  rationalize: { name: 'Clearing a root from the bottom', forms: 2 },
};
export const count = (skill, form) => SETS[skill][form].length;

/** The n-th problem of one form of a skill (wraps round if n runs past the end). */
export function problem(skill, form, n) {
  const set = SETS[skill][form];
  const params = set[n % set.length];
  const p = MAKERS[skill][form](params);
  // A door shows the right answer and at most four slips; `grade` still knows about the rest.
  const wrong = p.options.filter((o) => !o.right).slice(0, 4);
  return { skill, form, n, params, ...p, options: [p.options.find((o) => o.right), ...wrong] };
}

// Shared with later episodes' problem generators.
export { B, G, A, T, DO, h, red, shuffle, finish, near, range, cross, enough };
