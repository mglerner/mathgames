#!/usr/bin/env python3
"""Independent oracle for the M0.5 proto (adversarial review).

Exact arithmetic is from-scratch Python (fractions.Fraction plus a tiny Q(sqrt n) layer), with
its own parser for the printed keypad strings. Nothing here imports or mirrors the JS math.

For N seeds per generator per interaction it checks, via driver.mjs:
  - the answer key is right (recomputed from the item's parameters);
  - every distractor is wrong, distinct, and equals its tagged mal-rule's output (recomputed
    from DESIGN.md section 5 definitions, not from malrules.js);
  - quadratic items really have the stated integer roots; Strike accepts both orientations and
    nonzero rational multiples, rejects copied coefficients, and never marks an unfinished
    same-solution form as a miss;
  - the judge accepts the typed variants of a right answer a kid can produce on the keypad;
  - the Lantern / Scale numbers in feedback are exactly right;
  - nothing crashes.

Usage: python3 -I oracle.py [N]   (default 2000). Exit status 1 on any failure.
"""
import itertools
import json
import os
import random
import subprocess
import sys
from collections import Counter, defaultdict
from fractions import Fraction as F

HERE = os.path.dirname(os.path.abspath(__file__))
DRIVER = os.path.join(HERE, 'driver.mjs')


# ---------------------------------------------------------------- exact Q(sqrt) arithmetic
def sqfree(m):
    """m >= 1 -> (out, inn) with m = out^2 * inn, inn squarefree."""
    out, inn, p = 1, 1, 2
    while p * p <= m:
        while m % (p * p) == 0:
            m //= p * p
            out *= p
        if m % p == 0:
            m //= p
            inn *= p
        p += 1
    return out, inn * m


def S(c=0, rad=1):
    """surd: dict rad -> Fraction"""
    c = F(c)
    return {} if c == 0 else {rad: c}


def sadd(a, b):
    r = dict(a)
    for k, v in b.items():
        r[k] = r.get(k, 0) + v
        if r[k] == 0:
            del r[k]
    return r


def sneg(a):
    return {k: -v for k, v in a.items()}


def smul(a, b):
    r = {}
    for k1, v1 in a.items():
        for k2, v2 in b.items():
            o, i = sqfree(k1 * k2)
            r = sadd(r, {i: v1 * v2 * o})
    return r


def sinv(a):
    if len(a) != 1:
        raise ValueError('multi-term divisor')
    (k, v), = a.items()
    return {k: 1 / (v * k)}  # 1/(v sqrt k) = sqrt k / (v k)


def ssqrt(a):
    if not a:
        return {}
    if len(a) != 1 or 1 not in a or a[1] < 0:
        raise ValueError('bad radicand')
    q = a[1]
    o1, i1 = sqfree(q.numerator * q.denominator)
    return {i1: F(o1, q.denominator)}


def sfloat(a):
    return sum(float(v) * (k ** 0.5) for k, v in a.items())


# polys: dict deg -> surd
def P(c=0):
    s = c if isinstance(c, dict) else S(c)
    return {0: s} if s else {}


def padd(a, b):
    r = dict(a)
    for k, v in b.items():
        r[k] = sadd(r.get(k, {}), v)
        if not r[k]:
            del r[k]
    return r


def pneg(a):
    return {k: sneg(v) for k, v in a.items()}


def pmul(a, b):
    r = {}
    for k1, v1 in a.items():
        for k2, v2 in b.items():
            r = padd(r, {k1 + k2: smul(v1, v2)})
    return r


def pconst(a):
    if any(k != 0 for k in a):
        raise ValueError('not constant')
    return a.get(0, {})


def peval(a, x):
    tot = {}
    for k, v in a.items():
        tot = sadd(tot, smul(v, S(F(x) ** k)))
    return tot


# ---------------------------------------------------------------- parser (own implementation)
def tokenize(s):
    toks, i = [], 0
    while i < len(s):
        c = s[i]
        if c == ' ':
            i += 1
        elif c.isdigit():
            j = i
            while j < len(s) and s[j].isdigit():
                j += 1
            toks.append(('n', int(s[i:j])))
            i = j
        elif s.startswith('sqrt', i):
            toks.append(('sqrt', None))
            i += 4
        elif c in '+-*/^()=x':
            toks.append((c, None))
            i += 1
        else:
            raise ValueError('char ' + c)
    return toks


def parse_poly(s):
    """printed string -> poly (expression) or (polyL, polyR) (equation)."""
    toks = tokenize(s)
    pos = [0]

    def peek():
        return toks[pos[0]][0] if pos[0] < len(toks) else None

    def take():
        pos[0] += 1
        return toks[pos[0] - 1]

    def atom():
        k = peek()
        if k == 'n':
            return P(take()[1])
        if k == 'x':
            take()
            return {1: S(1)}
        if k == '(':
            take()
            e = expr()
            assert take()[0] == ')'
            return e
        if k == 'sqrt':
            take()
            return P(ssqrt(pconst(atom())))
        raise ValueError('atom')

    def expon():
        if peek() == '-':
            take()
            return pneg(powr())
        return powr()

    def ipow(b, e):
        e = pconst(e)
        assert set(e.keys()) <= {1} and e.get(1, F(0)).denominator == 1
        n = int(e.get(1, 0))
        r = P(1)
        for _ in range(abs(n)):
            r = pmul(r, b)
        if n < 0:
            r = P(sinv(pconst(r)))
        return r

    def powr():
        a = atom()
        if peek() == '^':
            take()
            return ipow(a, expon())
        return a

    def quot():
        a = powr()
        while peek() == '/':
            take()
            b = powr()
            a = pmul(a, P(sinv(pconst(b))))
        return a

    def prod():
        a = quot()
        while True:
            if peek() == '*':
                take()
                a = pmul(a, quot())
            elif peek() in ('n', 'x', 'sqrt', '('):
                a = pmul(a, quot())
            else:
                return a

    def term():
        if peek() == '-':
            take()
            return pneg(term())
        return prod()

    def expr():
        a = term()
        while peek() in ('+', '-'):
            op = take()[0]
            b = term()
            a = padd(a, b if op == '+' else pneg(b))
        return a

    lhs = expr()
    if peek() == '=':
        take()
        rhs = expr()
        assert pos[0] == len(toks)
        return (lhs, rhs)
    assert pos[0] == len(toks)
    return lhs


def val(s):
    return pconst(parse_poly(s))


def eqpoly(s):
    l, r = parse_poly(s)
    return padd(l, pneg(r))


def qcoefs(p):
    """rational coefficient list for a poly with rational coefficients."""
    out = {}
    for k, v in p.items():
        assert set(v.keys()) <= {1}
        out[k] = v.get(1, F(0))
    return out


def is_multiple(p, p0):
    """p = k p0 for a nonzero rational k?"""
    a, b = qcoefs(p), qcoefs(p0)
    if set(a) != set(b) or not b:
        return None
    ks = {a[d] / b[d] for d in b}
    return ks.pop() if len(ks) == 1 else None


def roots_of(p):
    """rational roots set + degree, for small integer-coefficient polys (brute force)."""
    c = qcoefs(p)
    return {r for r in range(-60, 61) if sum(v * r ** k for k, v in c.items()) == 0}


# ---------------------------------------------------------------- printing helpers
def frac_str(q):
    q = F(q)
    return str(q.numerator) if q.denominator == 1 else f'{q.numerator}/{q.denominator}'


def poly_str(c, var='x', spaced=False):
    """c: dict deg -> Fraction, descending powers."""
    parts = []
    for k in sorted(c, reverse=True):
        v = c[k]
        if v == 0:
            continue
        a = abs(v)
        xs = '' if k == 0 else (var if k == 1 else f'{var}^{k}')
        if k == 0:
            body = frac_str(a)
        elif a == 1:
            body = xs
        else:
            body = frac_str(a) + xs if a.denominator == 1 else f'{frac_str(a)}{xs}'
        sign = '-' if v < 0 else '+'
        parts.append((sign, body))
    s = ''
    for i, (sg, b) in enumerate(parts):
        if i == 0:
            s += ('-' if sg == '-' else '') + b
        else:
            s += (f' {sg} ' if spaced else sg) + b
    return s or '0'


# ---------------------------------------------------------------- bridge
def items(gen, inter, n):
    out = subprocess.run(['node', DRIVER, 'items', gen, inter, str(n)], capture_output=True, text=True, check=True)
    return [json.loads(l) for l in out.stdout.splitlines()]


def judge_all(reqs):
    data = ''.join(json.dumps(r) + '\n' for r in reqs)
    out = subprocess.run(['node', DRIVER, 'judge'], input=data, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr[-2000:])
    res = [json.loads(l) for l in out.stdout.splitlines()]
    assert len(res) == len(reqs), (len(res), len(reqs))
    return res


FAIL = defaultdict(list)


def fail(cat, msg):
    if len(FAIL[cat]) < 8:
        FAIL[cat].append(msg)
    else:
        FAIL[cat].append(None)


# ---------------------------------------------------------------- lantern / scale check
def check_lantern(fb, knot, yours, ctx):
    ins = fb.get('instrument')
    if not ins or ins['kind'] != 'lantern':
        fail('lantern-missing', ctx)
        return
    rows = ins['rows']
    want = [knot] + ([yours] if yours is not None else [])
    if len(rows) != len(want):
        fail('lantern-rows', f'{ctx}: {len(rows)} rows, want {len(want)}')
        return
    for row, w in zip(rows, want):
        try:
            ex = val(row['exact'])
        except Exception as e:
            fail('lantern-unparsable', f'{ctx}: {row} {e}')
            continue
        if ex != w:
            fail('lantern-exact', f'{ctx}: row {row["label"]} shows {row["exact"]}, truth {w}')
        x = sfloat(w)
        if abs(float(row['approx']) - x) > 0.005 + 1e-9:
            fail('lantern-approx', f'{ctx}: row {row["label"]} about {row["approx"]}, truth {x:.6f}')
    if ins['same'] != (yours is not None and yours == knot):
        fail('lantern-same', f'{ctx}: same={ins["same"]}')


def check_scale(fb, L0, R0, roots, mine, ctx):
    ins = fb.get('instrument')
    if not ins or ins['kind'] != 'scale':
        fail('scale-missing', ctx)
        return
    x = int(ins['x'])
    if x not in roots:
        fail('scale-x-not-root', f'{ctx}: x={x}, roots {roots}')
    rows = ins['rows']
    want = [('Knot', L0, R0)] + ([('Yours', mine[0], mine[1])] if mine else [])
    if len(rows) != len(want):
        fail('scale-rows', f'{ctx}: {rows}')
        return
    for row, (lab, Lp, Rp) in zip(rows, want):
        lv, rv = peval(Lp, x), peval(Rp, x)
        if F(row['L']) != lv.get(1, 0) or F(row['R']) != rv.get(1, 0):
            fail('scale-numbers', f'{ctx}: {row["label"]} at x={x} shows {row["L"]} vs {row["R"]}, truth {lv} vs {rv}')
        if row['balanced'] != (lv == rv):
            fail('scale-balanced', f'{ctx}: {row}')
    if mine:
        holds = [peval(mine[0], r) == peval(mine[1], r) for r in roots]
        if not all(holds):
            # the Scale is meant to show a solution where the student's line fails
            lv, rv = peval(mine[0], x), peval(mine[1], x)
            if lv == rv:
                fail('scale-hides-failure', f"{ctx}: the student's line fails at some root but the Scale shows x={x} balanced")


# ---------------------------------------------------------------- per-generator oracles
def oracle_ftw(it):
    d = {k: int(v) for k, v in it['data'].items()}
    n, a, b = d['n'], d['a'], d['b']
    ans = F(n * a, b)
    if val(it['prompt']) != S(F(n) * F(a, b)):
        fail('ftw-prompt', it['seed'])
    if it['answer'] is not None and (val(it['answer']) != S(ans) or it['answer'] != frac_str(ans)):
        fail('ftw-key', f'{it["seed"]}: {it["answer"]} vs {ans}')
    mal = {'scalar-times-both-parts': F(n * a, n * b), 'scalar-into-denominator': F(a, n * b)}
    return ans, mal


def oracle_rat(it):
    k, n = int(it['data']['k']), int(it['data']['n'])
    assert sqfree(n)[0] == 1
    ans = smul(S(k), sinv(S(1, n)))
    if val(it['prompt']) != ans:
        fail('rat-prompt', it['seed'])
    if it['answer'] and val(it['answer']) != ans:
        fail('rat-key', f'{it["seed"]}: {it["answer"]}')
    # mal-rule 4: numerator only (k sqrt n / sqrt n = k), denominator only (k / n)
    # mal-rule 18: k sqrt n / (n^2)
    mal = {'one-part-coin': [S(k), S(F(k, n))], 'root-square-overshoot': [S(F(k, n * n), n) if n > 1 else S(F(k, n * n))]}
    return k, n, ans, mal


def quad_terms(side):
    """split a printed side into (deg, coef) terms as written, signs where they sit."""
    p = parse_poly(side)
    return qcoefs(p)


# ---------------------------------------------------------------- main
def main():
    N = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    rng = random.Random(20261112)
    reqs, expect = [], []

    def ask(it, text, exp):
        reqs.append({'gen': it['gen'], 'seed': it['seed'], 'interaction': it['interaction'], 'text': text})
        expect.append((it, text, exp))

    counts = Counter()
    # ---------------- ftw
    for inter in ('forge', 'nextline', 'strike'):
        for it in items('ftw', inter, N):
            counts['ftw-' + inter] += 1
            ans, mal = oracle_ftw(it)
            n, a, b = (int(it['data'][k]) for k in 'nab')
            if inter == 'forge':
                vals = {}
                for c in it['choices']:
                    ov = val(c['text'])[1] if val(c['text']) else F(0)
                    res = ov * F(a, b)
                    if res == ans:
                        want = ('correct', None)
                    else:
                        tag = [m for m, v in mal.items() if v == res]
                        want = ('wrong', tag[0] if len(tag) == 1 else tuple(tag))
                    if (c['verdict'], c['malrule']) != want:
                        fail('ftw-forge-label', f'{it["seed"]}: {c} vs {want}')
                    vals.setdefault(ov, []).append(c['text'])
                    ask(it, c['id'], {'kind': 'choice', 'verdict': want[0], 'tag': want[1], 'knot': S(ans), 'yours': S(res)})
                if len(vals) != len(it['choices']) or len(it['choices']) < 3:
                    fail('ftw-forge-distinct', it['seed'])
            elif inter == 'nextline':
                seen = set()
                for c in it['choices']:
                    v = val(c['text'])[1]
                    if v == ans:
                        want = ('correct' if c['text'] == frac_str(ans) else 'form?', None)
                    else:
                        tag = [m for m, mv in mal.items() if mv == v]
                        want = ('wrong', tag[0] if len(tag) == 1 else tuple(tag))
                    if (c['verdict'], c['malrule']) != want:
                        fail('ftw-nextline-label', f'{it["seed"]}: {c} vs {want}')
                    if c['malrule'] == 'scalar-times-both-parts' and c['text'] != f'{n*a}/{n*b}':
                        fail('ftw-stacker-shape', f'{it["seed"]}: {c["text"]}')
                    if v in seen:
                        fail('ftw-nextline-distinct', it['seed'])
                    seen.add(v)
                    ask(it, c['id'], {'kind': 'choice', 'verdict': want[0], 'tag': want[1], 'knot': S(ans), 'yours': S(v)})
            else:
                p_, q_ = ans.numerator, ans.denominator
                good = [f'{p_}/{q_}', f' {p_} / {q_} ', f'({p_})/({q_})', f'({p_}/{q_})', f'{p_}/({q_})']
                for t in good:
                    ask(it, t, {'kind': 'typed', 'verdict': 'correct', 'knot': S(ans), 'yours': ans})
                ask(it, f'+{p_}/{q_}', {'kind': 'typed', 'verdict': 'correct', 'knot': S(ans), 'yours': ans, 'leadplus': True})
                kk = rng.randint(2, 5)
                for t in (f'{kk*p_}/{kk*q_}', f'{n}*{a}/{b}', f'{n}/1*{a}/{b}', f'{a}/{b}*{n}', f'{p_}/{q_}*1', f'{n*a}/{b}' if n * a != p_ else f'2*{p_}/(2*{q_})'):
                    ask(it, t, {'kind': 'typed', 'verdict': 'notmiss', 'knot': S(ans), 'yours': ans})
                for m, v in mal.items():
                    ask(it, f'{v.numerator}/{v.denominator}' if v.denominator > 1 else str(v.numerator),
                        {'kind': 'typed', 'verdict': 'wrong', 'tag': m, 'knot': S(ans), 'yours': v})
                    ask(it, f'{n*a if m=="scalar-times-both-parts" else a}/{n*b}',
                        {'kind': 'typed', 'verdict': 'wrong', 'tag': m, 'knot': S(ans), 'yours': v})
    # ---------------- sqrtsq
    for it in items('sqrtsq', 'strike', N):
        counts['sqrtsq-strike'] += 1
        n = int(it['data']['n'])
        if sqfree(n)[0] != 1:
            fail('sqrtsq-not-squarefree', it['seed'])
        if val(it['prompt']) != S(n) or val(it['answer']) != S(n):
            fail('sqrtsq-key', it['seed'])
        for t in (str(n), f'({n})', f' {n} '):
            ask(it, t, {'kind': 'typed', 'verdict': 'correct', 'knot': S(n), 'yours': F(n)})
        ask(it, f'+{n}', {'kind': 'typed', 'verdict': 'correct', 'knot': S(n), 'yours': F(n), 'leadplus': True})
        for t in (f'sqrt{n*n}', f'sqrt({n*n})', f'{2*n}/2', f'{n}/1', f'sqrt{n}sqrt{n}', f'sqrt{n}^2', f'sqrt({n}*{n})'):
            ask(it, t, {'kind': 'typed', 'verdict': 'notmiss', 'knot': S(n), 'yours': F(n)})
        ask(it, str(n * n), {'kind': 'typed', 'verdict': 'wrong', 'tag': 'root-square-overshoot', 'knot': S(n), 'yours': F(n * n)})
    # ---------------- rat
    for inter in ('forge', 'strike'):
        for it in items('rat', inter, N):
            counts['rat-' + inter] += 1
            k, n, ans, mal = oracle_rat(it)
            if inter == 'forge':
                seen = []
                for c in it['choices']:
                    coin = val(c['text'])
                    res = smul(val(it['prompt']), coin)
                    if coin != S(1):
                        tag = [m for m, vs in mal.items() if res in vs]
                        want = ('wrong', tag[0] if len(tag) == 1 else tuple(tag))
                    else:
                        # the coin's denominator must clear the root
                        den = c['text'].split('/', 1)[1]
                        cleared = set(smul(S(1, n), val(den)).keys()) <= {1}
                        want = ('correct' if cleared else 'legal-idle', None)
                    if (c['verdict'], c['malrule']) != want:
                        fail('rat-forge-label', f'{it["seed"]}: {c} vs {want}')
                    if c['text'] in seen:
                        fail('rat-forge-distinct', it['seed'])
                    seen.append(c['text'])
                    ask(it, c['id'], {'kind': 'choice', 'verdict': want[0], 'tag': want[1], 'knot': ans, 'yours': res})
                if sum(c['verdict'] == 'correct' for c in it['choices']) != 1:
                    fail('rat-forge-one-correct', it['seed'])
            else:
                c = F(k, n)
                p_, q_ = c.numerator, c.denominator
                r = f'sqrt{n}'
                good = []
                if q_ == 1:
                    if p_ == 1:
                        good += [r, f'sqrt({n})', f'({r})', f'1{r}']
                    else:
                        good += [f'{p_}{r}', f'{p_} {r}', f'{p_}sqrt({n})', f'{p_}*{r}', f'{r}*{p_}', f'{p_}({r})', f'({p_}){r}', f'{p_} sqrt({n})']
                else:
                    pre = '' if p_ == 1 else str(p_)
                    good += [f'{pre}{r}/{q_}', f'{p_}/{q_}{r}', f'({p_}/{q_}){r}', f'{pre}sqrt({n})/{q_}', f'({pre}{r})/{q_}',
                             f'{r}*{p_}/{q_}', f'{p_}/{q_} {r}', f'{p_}{r}/{q_}']
                for t in good:
                    ask(it, t, {'kind': 'typed', 'verdict': 'correct', 'knot': ans, 'yours': ans})
                ask(it, f'+{good[0]}', {'kind': 'typed', 'verdict': 'correct', 'knot': ans, 'yours': ans, 'leadplus': True})
                # same value, not finished
                unf = [f'{k}/{r}', f'{k}{r}/{n}', f'{k}/sqrt({n})', f'{k}*{r}/{n}']
                sqv = c * c * n  # (c sqrt n)^2
                if sqv.denominator == 1 and sqfree(int(sqv))[0] > 1:
                    unf += [f'sqrt{int(sqv)}', f'sqrt({int(sqv)})']
                if q_ > 1:
                    unf += [f'{2*p_}{r}/{2*q_}']
                else:
                    unf += [f'{2*p_}{r}/2', f'{p_}{r}/1']
                for t in unf:
                    if t in good:
                        continue
                    ask(it, t, {'kind': 'typed', 'verdict': 'notmiss', 'knot': ans, 'yours': ans})
                for m, vs in mal.items():
                    for v in vs:
                        ask(it, poly_str({0: v[1]}) if set(v) == {1} else (f'{frac_str(v[n].numerator)}{r}/{v[n].denominator}' if v[n].denominator > 1 else f'{v[n].numerator}{r}'),
                            {'kind': 'typed', 'verdict': 'wrong', 'tag': m, 'knot': ans, 'yours': v})
                ask(it, f'{k}{r}/{n*n}', {'kind': 'typed', 'verdict': 'wrong', 'tag': 'root-square-overshoot', 'knot': ans, 'yours': mal['root-square-overshoot'][0]})
    # ---------------- quad
    for inter in ('nextline', 'strike'):
        for it in items('quad', inter, N):
            counts['quad-' + inter] += 1
            L, R = it['data']['L'], it['data']['R']
            L0, R0 = parse_poly(L), parse_poly(R)
            P0 = padd(L0, pneg(R0))
            r1, r2 = (int(x) for x in it['data']['roots'])
            c0 = qcoefs(P0)
            if max(c0) != 2 or r1 == r2:
                fail('quad-not-quadratic', it['seed'])
            rts = roots_of(P0)
            if rts != {r1, r2}:
                fail('quad-roots', f'{it["seed"]}: {L}={R} roots {rts} stated {r1},{r2}')
            if {r1, r2} & {0, 1}:
                fail('quad-root-0-or-1', f'{it["seed"]}: {r1},{r2}')
            if val(it['prompt'].split('=')[0]) if False else False:
                pass
            if parse_poly(it['prompt']) != (L0, R0):
                fail('quad-prompt', it['seed'])
            if inter == 'nextline':
                Sx = parse_poly(it['move'])
                wantL, wantR = padd(L0, pneg(Sx)), padd(R0, pneg(Sx))
                if Sx not in (L0, R0):
                    fail('quad-move-not-a-side', it['seed'])
                other = R0 if Sx == L0 else L0
                lop = [(padd(L0, pneg(Sx)), R0), (L0, padd(R0, pneg(Sx)))]
                car = [(P({}), padd(other, Sx)) if Sx == L0 else (padd(other, Sx), P({}))]
                sets = []
                for c in it['choices']:
                    cl, cr = parse_poly(c['text'])
                    if (cl, cr) in ((wantL, wantR), (wantR, wantL)):
                        want = ('correct', None)
                    else:
                        tags = []
                        if any((cl, cr) in ((x, y), (y, x)) for x, y in lop):
                            tags.append('one-sided-operation')
                        if any((cl, cr) in ((x, y), (y, x)) for x, y in car):
                            tags.append('transpose-no-sign-change')
                        want = ('wrong', tags[0] if len(tags) == 1 else tuple(tags))
                    if (c['verdict'], c['malrule']) != want:
                        fail('quad-nextline-label', f'{it["seed"]}: {L}={R}, move {it["move"]}: {c} vs {want}')
                    cp = padd(cl, pneg(cr))
                    sets.append(cp)
                    ask(it, c['id'], {'kind': 'qchoice', 'verdict': want[0], 'tag': want[1], 'L0': L0, 'R0': R0, 'roots': [r1, r2], 'mine': (cl, cr)})
                for i, j in itertools.combinations(range(len(sets)), 2):
                    if is_multiple(sets[i], sets[j]) is not None:
                        fail('quad-nextline-equivalent-choices', f'{it["seed"]}: {it["choices"]}')
            else:
                c = qcoefs(P0)
                cfull = {d_: c.get(d_, F(0)) for d_ in (2, 1, 0)}
                ks = [F(1), F(-1), F(2), F(-3), F(1, 2), F(-1, 3), 1 / cfull[2], -1 / cfull[2]]
                for kq in ks:
                    cc = {d_: kq * v for d_, v in cfull.items()}
                    s_ = poly_str(cc)
                    for t in (f'{s_}=0', f'0={s_}', f'{poly_str(cc, spaced=True)} = 0'):
                        ask(it, t, {'kind': 'qtyped', 'verdict': 'correct', 'L0': L0, 'R0': R0, 'roots': [r1, r2], 'text': t})
                ask(it, f'+{poly_str(cfull)}=0', {'kind': 'qtyped', 'verdict': 'correct', 'L0': L0, 'R0': R0, 'roots': [r1, r2], 'leadplus': True})
                # same solutions, not finished (never a miss)
                asc = '+'.join(f'({frac_str(cfull[d_])})x^{d_}' for d_ in (0, 1, 2))
                for t in (f'{L}-({R})=0', f'{L}-({R})=0'.replace('--', '+'), f'{R}-({L})=0', f'{L}={R}', f'{R}={L}',
                          f'0={L}-({R})', f'{poly_str({0: cfull[0], 1: cfull[1]})}={poly_str({2: -cfull[2]})}', asc + '=0',
                          f'{cfull[2]}(x-({r1}))(x-({r2}))=0', f'(x-({r1}))(x-({r2}))=0'):
                    ask(it, t, {'kind': 'qtyped', 'verdict': 'notmiss', 'L0': L0, 'R0': R0, 'roots': [r1, r2], 'text': t})
                # copied coefficients: read off the page with signs as written, then every sign pattern
                lc, rc = qcoefs(L0), qcoefs(R0)
                sumc = {d_: lc.get(d_, F(0)) + rc.get(d_, F(0)) for d_ in (2, 1, 0)}
                for signs in itertools.product((1, -1), repeat=3):
                    cc = {d_: abs(sumc[d_]) * s for d_, s in zip((2, 1, 0), signs)}
                    cp = {d_: P(v)[0] for d_, v in cc.items() if v}
                    cp = {d_: S(v) for d_, v in cc.items() if v}
                    if is_multiple(cp, P0) is not None:
                        continue
                    t = f'{poly_str(cc)}=0'
                    exp = 'wrong' if roots_of(cp) != {r1, r2} else 'notmiss'
                    ask(it, t, {'kind': 'qtyped', 'verdict': exp, 'copy': signs == (1, 1, 1), 'L0': L0, 'R0': R0, 'roots': [r1, r2], 'text': t,
                                'mustTag': 'copy-coefficients'})
                # solved for one root only, or a different equation: wrong, and the Scale must show where it fails
                for t in (f'x={r1}', f'x={r2}', f'x^2={r1*r1}' if r1 != -r2 else f'x={r1+r2}'):
                    ask(it, t, {'kind': 'qtyped', 'verdict': 'wrong', 'L0': L0, 'R0': R0, 'roots': [r1, r2], 'text': t})
                # one side only
                for t in (f'{L}=0', f'0={R}'):
                    tp = eqpoly(t)
                    if is_multiple(tp, P0) is None:
                        ask(it, t, {'kind': 'qtyped', 'verdict': 'wrong', 'L0': L0, 'R0': R0, 'roots': [r1, r2], 'text': t, 'mustTag': 'one-sided-operation'})
    print('items:', dict(counts))
    print('judge requests:', len(reqs))
    res = judge_all(reqs)
    vc = Counter()
    for (it, text, exp), r in zip(expect, res):
        ctx = f'{it["gen"]}:{it["seed"]}:{it["interaction"]} {text!r}'
        if 'crash' in r:
            fail('CRASH', f'{ctx}: {r["crash"][:300]}')
            continue
        v = r['verdict']
        vc[(it['gen'], exp['verdict'], v)] += 1
        fb = r['fb']
        if v == 'form' and fb['miss']:
            fail('form-recorded-as-miss', ctx)
        if fb and fb['words'] > 15:
            fail('feedback-line-over-15-words', f'{ctx}: {fb["words"]} words: {fb["line"]}')
        ev = exp['verdict']
        if exp.get('leadplus'):
            if v != 'correct':
                fail('leading-plus-not-accepted', f'{ctx} -> {v}')
            continue
        if ev == 'correct' and v != 'correct':
            fail(f'{it["gen"]}-right-answer-not-accepted', f'{ctx} -> {v} ({r["why"]})')
        if ev == 'notmiss' and v not in ('form', 'correct'):
            fail(f'{it["gen"]}-unfinished-form-misjudged', f'{ctx} -> {v} {r["tags"]} ({r["why"]})')
        if ev == 'wrong' and v != 'wrong':
            fail(f'{it["gen"]}-wrong-answer-not-wrong', f'{ctx} -> {v} ({r["why"]})')
        if ev == 'wrong' and v == 'wrong':
            t = exp.get('tag') or exp.get('mustTag')
            if t and (t not in r['tags'] if isinstance(t, str) else sorted(t) != sorted(r['tags'])):
                fail('tag-missing', f'{ctx}: tags {r["tags"]}, want {t}')
            if exp['kind'] == 'choice' and isinstance(t, str) and r['tags'] != [t]:
                fail('choice-tag', f'{ctx}: {r["tags"]} want {t}')
        if exp['kind'] in ('choice',) and v != ev:
            fail('choice-verdict', f'{ctx}: {v} want {ev}')
        if exp['kind'] == 'qchoice' and v != ev:
            fail('qchoice-verdict', f'{ctx}: {v} want {ev}')
        # instruments
        if v in ('unparsed', 'unverifiable'):
            continue
        if exp['kind'] == 'choice':
            check_lantern(fb, exp['knot'], exp['yours'], ctx)
        elif exp['kind'] == 'typed':
            y = exp['yours']
            check_lantern(fb, exp['knot'], y if isinstance(y, dict) else S(y), ctx)
        elif exp['kind'] == 'qchoice':
            check_scale(fb, exp['L0'], exp['R0'], exp['roots'], exp['mine'], ctx)
        elif exp['kind'] == 'qtyped':
            check_scale(fb, exp['L0'], exp['R0'], exp['roots'], parse_poly(exp['text']), ctx)
    print('verdict table (gen, expected, got):')
    for k_, n_ in sorted(vc.items()):
        print('  ', k_, n_)
    bad = 0
    for cat, msgs in sorted(FAIL.items()):
        bad += 1
        print(f'FAIL {cat}: {len(msgs)} cases')
        for m in [m for m in msgs if m][:6]:
            print('    ', m)
    print('OK' if not bad else f'{bad} failing categories')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
