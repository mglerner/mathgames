#!/usr/bin/env python3
"""Independent ground truth for src/math (M1a), written as JSON fixtures.

Oracle: Python's fractions.Fraction (exact) for rationals, polynomials and
surds, and decimal.Decimal at 80 digits for numeric cross-checks of
expression pairs. sympy is not installed on this machine, so quadratic roots
are computed by an exact independent path (Fraction discriminant + trial-division
square part), not by sympy.

Run:  python3 test/adversarial/math-oracle/gen_fixtures.py
Writes *.json next to this file. Deterministic (fixed seeds).
"""
import json
import os
import random
from decimal import Decimal, getcontext
from fractions import Fraction as F

getcontext().prec = 120
HERE = os.path.dirname(os.path.abspath(__file__))


def qj(fr):
    fr = F(fr)
    return [str(fr.numerator), str(fr.denominator)]


# ------------------------------------------------------------------ squarefree

def square_part(m):
    """m > 0 -> (out, inn) with m = out^2 inn, inn squarefree."""
    out, inn, p = 1, 1, 2
    while p * p <= m:
        while m % (p * p) == 0:
            out *= p
            m //= p * p
        if m % p == 0:
            inn *= p
            m //= p
        p += 1
    return out, inn * m


# ------------------------------------------------------------------ rationals

def rand_int(rng):
    r = rng.random()
    if r < 0.1:
        return 0
    if r < 0.5:
        return rng.randint(-20, 20)
    if r < 0.8:
        return rng.randint(-10**12, 10**12)
    return rng.randint(-2**300, 2**300)


def gen_rational(rng, n=12000):
    cases = []
    for _ in range(n):
        an, ad, bn, bd = rand_int(rng), rand_int(rng), rand_int(rng), rand_int(rng)
        if ad == 0:
            ad = rng.choice([1, -1, 7, -2**70])
        if bd == 0:
            bd = rng.choice([1, -1, 3, -2**90])
        a, b = F(an, ad), F(bn, bd)
        cases.append({
            'a_raw': [str(an), str(ad)], 'b_raw': [str(bn), str(bd)],
            'a': qj(a), 'b': qj(b),
            'add': qj(a + b), 'sub': qj(a - b), 'mul': qj(a * b),
            'div': qj(a / b) if b != 0 else None,
            'cmp': (a > b) - (a < b), 'neg': qj(-a),
        })
    return cases


# ------------------------------------------------------------------ surds
RADS = [1, 2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 21, 30, 35, 105, 210]


def surd_canon(d):
    return sorted([(r, c) for r, c in d.items() if c != 0])


def surd_j(d):
    return [[qj(c)[0], qj(c)[1], str(r)] for r, c in surd_canon(d)]


def surd_add(a, b):
    out = dict(a)
    for r, c in b.items():
        out[r] = out.get(r, F(0)) + c
    return {r: c for r, c in out.items() if c != 0}


def surd_mul(a, b):
    out = {}
    for r1, c1 in a.items():
        for r2, c2 in b.items():
            o, i = square_part(r1 * r2)
            out[i] = out.get(i, F(0)) + c1 * c2 * o
    return {r: c for r, c in out.items() if c != 0}


def surd_dec(a):
    return sum((Decimal(c.numerator) / Decimal(c.denominator)) * Decimal(r).sqrt() for r, c in a.items()) if a else Decimal(0)


def rand_q(rng, big=False):
    if big and rng.random() < 0.3:
        n = rng.randint(-10**30, 10**30)
        d = rng.randint(1, 10**20)
    else:
        n = rng.randint(-30, 30)
        d = rng.randint(1, 12)
    return F(n, d)


def rand_surd(rng, big=False):
    k = rng.randint(0, 4)
    d = {}
    for _ in range(k):
        r = rng.choice(RADS)
        d[r] = d.get(r, F(0)) + rand_q(rng, big)
    return {r: c for r, c in d.items() if c != 0}


def gen_surd(rng, n=10000):
    cases = []
    for i in range(n):
        big = i % 3 == 0
        a, b = rand_surd(rng, big), rand_surd(rng, big)
        if i % 10 == 0:
            b = surd_add(a, {})  # equal copy
        if i % 17 == 0:
            # near-cancelling: a - b small but nonzero, e.g. p/q close to sqrt(n)
            r = rng.choice([2, 3, 5, 7, 11, 13])
            s = Decimal(r).sqrt()
            den = rng.randint(10**5, 10**9)
            num = int((s * den).to_integral_value())
            a = {r: F(1)}
            b = {1: F(num, den)}
        diff = surd_add(a, {r: -c for r, c in b.items()})
        dv = surd_dec(diff)
        sign = 0 if not diff else (1 if dv > 0 else -1)
        assert diff == {} or abs(dv) > Decimal(10) ** -60, 'oracle precision too low'
        cases.append({'a': surd_j(a), 'b': surd_j(b), 'add': surd_j(surd_add(a, b)),
                      'mul': surd_j(surd_mul(a, b)), 'eq': diff == {}, 'cmp': sign,
                      'signA': 0 if not a else (1 if surd_dec(a) > 0 else -1)})
    sq = []
    for i in range(3000):
        if i % 5 == 0:
            n = rng.randint(0, 10**6) ** 2 * rng.choice([1, 2, 3, 12, 50, 98])
            d = rng.randint(1, 1000) ** 2
        else:
            n = rng.randint(-50, 10**6)
            d = rng.randint(1, 10**5)
        fr = F(n, d)
        if fr < 0:
            sq.append({'x': qj(fr), 'sqrt': None})
            continue
        if fr == 0:
            sq.append({'x': qj(fr), 'sqrt': []})
            continue
        o, inn = square_part(fr.numerator * fr.denominator)
        sq.append({'x': qj(fr), 'sqrt': surd_j({inn: F(o, fr.denominator)})})
    return {'pairs': cases, 'sqrtQ': sq}


# ------------------------------------------------------------------ expression trees

class E:
    """tree: section 11 Node JSON (q as [n, d] strings); js: float JS source; f: env -> Decimal|None."""

    def __init__(self, tree, js, f):
        self.tree, self.js, self.f = tree, js, f


def num(fr):
    fr = F(fr)
    v = Decimal(fr.numerator) / Decimal(fr.denominator)
    return E({'t': 'num', 'q': qj(fr)}, f'({fr.numerator}/{fr.denominator})', lambda env: v)


def var(name):
    return E({'t': 'var', 'name': name}, name, lambda env: env[name])


def _all(fs, env):
    out = []
    for f in fs:
        v = f(env)
        if v is None:
            return None
        out.append(v)
    return out


def add(*es):
    def f(env):
        v = _all([e.f for e in es], env)
        return None if v is None else sum(v, Decimal(0))
    return E({'t': 'add', 'args': [e.tree for e in es]}, '(' + '+'.join(e.js for e in es) + ')', f)


def neg(a):
    return E({'t': 'neg', 'arg': a.tree}, f'(-{a.js})', lambda env: None if a.f(env) is None else -a.f(env))


def sub(a, b):
    return add(a, neg(b))


def mul(*es):
    def f(env):
        v = _all([e.f for e in es], env)
        if v is None:
            return None
        r = Decimal(1)
        for x in v:
            r *= x
        return r
    return E({'t': 'mul', 'args': [e.tree for e in es]}, '(' + '*'.join(e.js for e in es) + ')', f)


def frac(a, b):
    def f(env):
        x, y = a.f(env), b.f(env)
        if x is None or y is None or y == 0:
            return None
        return x / y
    return E({'t': 'frac', 'num': a.tree, 'den': b.tree}, f'({a.js}/{b.js})', f)


def group(a):
    return E({'t': 'group', 'arg': a.tree}, a.js, a.f)


def dpow(b, e):
    """Decimal b^e for a Fraction e, or None where undefined over the reals (v1 policy)."""
    if e.denominator == 1:
        if b == 0 and e <= 0:
            return None
        return b ** int(e)
    if b < 0:
        return None
    if b == 0:
        return Decimal(0) if e > 0 else None
    return (b.ln() * Decimal(e.numerator) / Decimal(e.denominator)).exp()


def pw(a, e):
    e = F(e)
    et = num(e) if e >= 0 else neg(num(-e))
    return E({'t': 'pow', 'base': a.tree, 'exp': et.tree}, f'Math.pow({a.js},{e.numerator}/{e.denominator})',
             lambda env: None if a.f(env) is None else dpow(a.f(env), e))


def sqrt(a):
    def f(env):
        x = a.f(env)
        if x is None or x < 0:
            return None
        return x.sqrt()
    return E({'t': 'root', 'index': 2, 'radicand': a.tree}, f'Math.sqrt({a.js})', f)


# ------------------------------------------------------------------ exact multivariate polys (oracle)

def p_add(a, b):
    out = dict(a)
    for k, c in b.items():
        out[k] = out.get(k, F(0)) + c
    return {k: c for k, c in out.items() if c != 0}


def p_mul(a, b):
    out = {}
    for k1, c1 in a.items():
        for k2, c2 in b.items():
            m = dict(k1)
            for v, e in k2:
                m[v] = m.get(v, 0) + e
            k = tuple(sorted(m.items()))
            out[k] = out.get(k, F(0)) + c1 * c2
    return {k: c for k, c in out.items() if c != 0}


def p_pow(a, n):
    r = {(): F(1)}
    for _ in range(n):
        r = p_mul(r, a)
    return r


def p_key(k):
    return ','.join(f'{v}:{e}' for v, e in k)


def p_json(p):
    return {p_key(k): qj(c) for k, c in p.items()}


def p_expr(p):
    """Expanded expression for an oracle poly (as a tree)."""
    if not p:
        return num(0)
    terms = []
    for k, c in sorted(p.items()):
        fs = [num(c)] if c >= 0 else [neg(num(-c))]
        for v, e in k:
            fs.append(var(v) if e == 1 else pw(var(v), e))
        terms.append(fs[0] if len(fs) == 1 else mul(*fs))
    return terms[0] if len(terms) == 1 else add(*terms)


def rand_coef(rng, big=False):
    if big and rng.random() < 0.2:
        return F(rng.randint(-10**25, 10**25), rng.choice([1, 1, 3, 10**15 + 7]))
    c = F(rng.randint(-9, 9), rng.choice([1, 1, 1, 2, 3]))
    return c


def rand_small_poly(rng, vs, big=False):
    """A random poly as (tree, oracle) with a few terms."""
    terms = []
    ora = {}
    for _ in range(rng.randint(1, 3)):
        c = rand_coef(rng, big)
        while c == 0:
            c = rand_coef(rng, big)
        mono = {}
        for _ in range(rng.randint(0, 2)):
            v = rng.choice(vs)
            mono[v] = mono.get(v, 0) + 1
        k = tuple(sorted(mono.items()))
        ora = p_add(ora, {k: c})
        fs = [num(c) if c >= 0 else group(neg(num(-c)))]
        for v, e in sorted(mono.items()):
            fs.append(var(v) if e == 1 else pw(var(v), e))
        terms.append(mul(*fs) if len(fs) > 1 else fs[0])
    return (terms[0] if len(terms) == 1 else group(add(*terms))), ora


def rand_poly_expr(rng, vs, depth=0, big=False):
    r = rng.random()
    if depth >= 2 or r < 0.3:
        return rand_small_poly(rng, vs, big)
    if r < 0.55:
        k = rng.randint(2, 3)
        parts = [rand_poly_expr(rng, vs, depth + 1, big) for _ in range(k)]
        o = {(): F(1)}
        for _, po in parts:
            o = p_mul(o, po)
        return mul(*[group(t) for t, _ in parts]), o
    if r < 0.75:
        k = rng.randint(2, 3)
        parts = [rand_poly_expr(rng, vs, depth + 1, big) for _ in range(k)]
        o = {}
        for _, po in parts:
            o = p_add(o, po)
        return group(add(*[t for t, _ in parts])), o
    if r < 0.85:
        t, o = rand_poly_expr(rng, vs, depth + 1, big)
        return group(neg(group(t))), {k: -c for k, c in o.items()}
    t, o = rand_poly_expr(rng, vs, depth + 1, big)
    n = rng.randint(2, 4)
    return pw(group(t), n), p_pow(o, n)


def gen_poly(rng, n=4000):
    out = []
    for i in range(n):
        vs = ['x'] if i % 4 == 0 else (['x', 'y'] if i % 4 == 1 else ['x', 'y', 'z'])
        t, o = rand_poly_expr(rng, vs, big=(i % 5 == 0))
        deg = max((sum(e for _, e in k) for k in o), default=-1)
        out.append({'tree': t.tree, 'poly': p_json(o), 'degree': deg})
    return out


# ------------------------------------------------------------------ equivalence pairs

def sample_env(rng, names, assume):
    env = {}
    for nm in names:
        rel = assume.get(nm)
        while True:
            v = Decimal(rng.randint(-4000, 4000)) / Decimal(rng.choice([7, 13, 101, 1000]))
            if rel == 'nonneg' and v < 0:
                v = -v
            if rel == 'pos' and v <= 0:
                continue
            if rel == 'nonzero' and v == 0:
                continue
            break
        env[nm] = v
    return env


def close(a, b):
    return abs(a - b) <= Decimal(10) ** -40 * (1 + abs(a) + abs(b))


def numeric_check(rng, a, b, names, assume, label):
    agree_pts, differ_pts = 0, 0
    for _ in range(40):
        env = sample_env(rng, names, assume)
        x, y = a.f(env), b.f(env)
        if x is None or y is None:
            continue
        if close(x, y):
            agree_pts += 1
        else:
            differ_pts += 1
    if label:
        return differ_pts == 0 and agree_pts >= 3
    return differ_pts >= 1


def as_list(assume):
    return [{'name': k, 'rel': v} for k, v in sorted(assume.items())]


def nz_rand(rng, lo=-9, hi=9):
    while True:
        k = rng.randint(lo, hi)
        if k:
            return k


def mono_term(rng, vs):
    """c * v (a random nonzero monomial-ish term), as (tree, oracle poly)."""
    c = F(nz_rand(rng), rng.choice([1, 1, 2]))
    v = rng.choice(vs)
    e = rng.choice([1, 1, 2])
    base = var(v) if e == 1 else pw(var(v), e)
    t = mul(num(c), base) if c > 0 else group(neg(mul(num(-c), base)))
    return t, {((v, e),): c}


def gen_true(rng):
    """Each yields (family, a, b, assume, needs_note)."""
    out = []
    vs_all = [['x'], ['x', 'y'], ['x', 'y', 'z']]

    def push(fam, a, b, assume=None, note=False):
        out.append((fam, a, b, assume or {}, note))

    for i in range(700):  # expand vs factored, multivariate
        vs = vs_all[i % 3]
        t, o = rand_poly_expr(rng, vs, big=(i % 7 == 0))
        push('poly-expand', t, p_expr(o))
    for i in range(250):  # perturb by a form of 0: P + (Q - Q) vs P, and Q - Q inside products
        vs = vs_all[i % 3]
        t, o = rand_poly_expr(rng, vs)
        u, _ = rand_small_poly(rng, vs)
        push('form-of-0', add(group(t), group(sub(group(u), group(u)))), p_expr(o))
    for i in range(250):  # form of 1 with a linear factor that has a real root: note required
        vs = vs_all[i % 3]
        t, o = rand_poly_expr(rng, vs)
        r = F(nz_rand(rng), rng.choice([1, 2]))
        lin = group(sub(var('x'), num(r)) if r > 0 else add(var('x'), num(-r)))
        push('form-of-1', mul(group(t), group(frac(lin, lin))), p_expr(o), note=True)
    for i in range(250):  # rational function: cancel a common factor (P Q)/(R Q) vs P/R
        vs = vs_all[i % 3]
        p, po = rand_small_poly(rng, vs)
        rr = F(nz_rand(rng))
        R = group(add(var('x'), num(rr)) if rr > 0 else sub(var('x'), num(-rr)))
        s = F(nz_rand(rng))
        while s == rr:
            s = F(nz_rand(rng))
        Q = group(add(var(vs[-1]), num(s)) if s > 0 else sub(var(vs[-1]), num(-s)))
        push('rat-cancel', frac(mul(group(p), Q), mul(R, Q)), frac(group(p), R), note=True)
    for i in range(150):  # x/x-style with declared nonzero monomial: no note
        c = nz_rand(rng)
        push('rat-mono-nonzero', frac(mul(num(abs(c)), var('x'), var('y')), var('x')), mul(num(abs(c)), var('y')),
             {'x': 'nonzero'}, note=False)
    for i in range(250):  # rationalised vs not (numeric)
        a = F(nz_rand(rng, 1, 20))
        n = rng.choice([2, 3, 5, 6, 7, 10, 11])
        bq = F(nz_rand(rng, 1, 9))
        if i % 2:
            push('rationalise-num', frac(num(a), sqrt(num(n))), frac(mul(num(a), sqrt(num(n))), num(n)))
        else:
            den = bq * bq - n
            if den == 0:
                continue
            push('rationalise-num', frac(num(a), group(add(num(bq), sqrt(num(n))))),
                 frac(mul(num(a), group(sub(num(bq), sqrt(num(n))))), num(den) if den > 0 else group(neg(num(-den)))))
    for i in range(250):  # rationalised with a variable: x/sqrt(n) vs x sqrt(n)/n ; (x)/(sqrt(x)) with x>0
        n = rng.choice([2, 3, 5, 6, 7])
        k = F(nz_rand(rng, 1, 9))
        if i % 2:
            push('rationalise-var', frac(mul(num(k), var('x')), sqrt(num(n))), frac(mul(num(k), var('x'), sqrt(num(n))), num(n)))
        else:
            push('rationalise-var', frac(mul(num(k), var('x')), sqrt(var('x'))), mul(num(k), sqrt(var('x'))), {'x': 'pos'})
    for i in range(300):  # simplified radicals vs not
        k = rng.randint(2, 12)
        m = rng.choice([2, 3, 5, 6, 7, 10, 11, 13])
        if i % 3 == 0:
            push('radical-simplify-num', sqrt(num(k * k * m)), mul(num(k), sqrt(num(m))))
        elif i % 3 == 1:
            push('radical-simplify-var', sqrt(mul(num(k * k * m), pw(var('x'), 2))), mul(num(k), var('x'), sqrt(num(m))), {'x': 'nonneg'})
        else:
            e = rng.choice([3, 5])
            push('radical-simplify-var', sqrt(mul(num(m), pw(var('x'), e))), mul(pw(var('x'), (e - 1) // 2), sqrt(mul(num(m), var('x')))), {'x': 'nonneg'})
    for i in range(200):  # product rule with declared nonneg vars
        push('product-rule', mul(sqrt(var('x')), sqrt(var('y'))), sqrt(mul(var('x'), var('y'))), {'x': 'nonneg', 'y': 'nonneg'})
        if i % 2:
            k = rng.randint(2, 9)
            push('product-rule', mul(sqrt(mul(num(k), var('x'))), sqrt(mul(num(k), var('x')))), mul(num(k), var('x')), {'x': 'nonneg'})
    for i in range(300):  # rational-power identities, nonneg
        p1, q1 = rng.randint(1, 5), rng.randint(1, 4)
        p2, q2 = rng.randint(1, 5), rng.randint(1, 4)
        a1, a2 = F(p1, q1), F(p2, q2)
        typ = i % 4
        if typ == 0:
            push('rat-power', mul(pw(var('x'), a1), pw(var('x'), a2)), pw(var('x'), a1 + a2), {'x': 'nonneg'})
        elif typ == 1:
            push('rat-power', pw(group(pw(var('x'), a1)), a2), pw(var('x'), a1 * a2), {'x': 'nonneg'})
        elif typ == 2:
            push('rat-power', pw(var('x'), F(1, 2)), sqrt(var('x')), {'x': 'nonneg'})
            push('rat-power', pw(var('x'), F(3, 2)), mul(var('x'), sqrt(var('x'))), {'x': 'nonneg'})
        else:
            push('rat-power', frac(pw(var('x'), a1), pw(var('x'), a2)), pw(var('x'), a1 - a2), {'x': 'pos'})
    for i in range(150):  # sqrt(x^2) = x with x >= 0 ; |..| domain
        push('sqrt-square-declared', sqrt(pw(var('x'), 2)), var('x'), {'x': 'nonneg'})
    return out


def gen_false(rng):
    out = []

    def push(fam, a, b, assume=None):
        out.append((fam, a, b, assume or {}, False))

    for i in range(300):  # freshman's dream (a+b)^n vs a^n + b^n
        n = rng.choice([2, 2, 3])
        k = F(nz_rand(rng))
        ta, _ = mono_term(rng, ['x', 'y'])
        kk = num(k) if k > 0 else group(neg(num(-k)))
        push('freshman', pw(group(add(ta, kk)), n), add(pw(group(ta), n), pw(kk, n)))
        if i % 2:
            push('freshman', pw(group(add(var('x'), var('y'))), n), add(pw(var('x'), n), pw(var('y'), n)))
    for i in range(300):  # sqrt of a sum
        a, b = rng.randint(1, 12), rng.randint(1, 12)
        if i % 3 == 0:
            push('sqrt-sum-num', sqrt(add(num(a * a), num(b * b))), add(num(a), num(b)))
        elif i % 3 == 1:
            push('sqrt-sum-var', sqrt(add(pw(var('x'), 2), num(b * b))), add(var('x'), num(b)), {'x': 'nonneg'})
        else:
            push('sqrt-sum-var', sqrt(add(var('x'), var('y'))), add(sqrt(var('x')), sqrt(var('y'))), {'x': 'nonneg', 'y': 'nonneg'})
    for i in range(300):  # cancel across a sum: (x + k)/x vs 1 + k ; (kx + m)/k vs x + m ; (x+a)/(x+b) vs a/b
        k = rng.randint(2, 9)
        m = rng.randint(1, 9)
        if i % 3 == 0:
            push('cancel-sum', frac(add(var('x'), num(k)), var('x')), num(1 + k))
        elif i % 3 == 1:
            push('cancel-sum', frac(add(mul(num(k), var('x')), num(m)), num(k)), add(var('x'), num(m)))
        else:
            a, b = rng.randint(2, 9), rng.randint(2, 9)
            if a == b:
                b += 1
            push('cancel-sum', frac(add(var('x'), num(a)), add(var('x'), num(b))), frac(num(a), num(b)))
    for i in range(300):  # partial distribution
        a = rng.randint(2, 9)
        b = rng.randint(1, 9)
        if i % 2:
            push('partial-dist', mul(num(a), group(add(var('x'), num(b)))), add(mul(num(a), var('x')), num(b)))
        else:
            push('partial-dist', mul(group(neg(num(a))), group(sub(var('x'), num(b)))), add(mul(group(neg(num(a))), var('x')), neg(num(b))))
    for i in range(300):  # sign errors
        a = rng.randint(1, 9)
        b = rng.randint(1, 9)
        if i % 3 == 0:
            push('sign', neg(group(sub(var('x'), num(a)))), sub(neg(var('x')), num(a)))
        elif i % 3 == 1:
            push('sign', sub(var('x'), group(add(var('y'), num(b)))), add(sub(var('x'), var('y')), num(b)))
        else:
            push('sign', pw(group(neg(var('x'))), 2), neg(pw(var('x'), 2)))
    for i in range(300):  # half-power-as-half
        k = rng.randint(2, 30)
        if i % 3 == 0:
            push('half-power', pw(num(k * k), F(1, 2)), num(F(k * k, 2)))
        elif i % 3 == 1:
            push('half-power', pw(var('x'), F(1, 2)), frac(var('x'), num(2)), {'x': 'nonneg'})
        else:
            push('half-power', mul(num(k), pw(var('x'), F(1, 2))), mul(num(F(k, 2)), var('x')), {'x': 'nonneg'})
    for i in range(200):  # sqrt(x^2) vs x undeclared (domain): must be false (witness -2)
        push('sqrt-square-undeclared', sqrt(pw(var('x'), 2)), var('x'))
    # adversarial: agree at every probe point, differ elsewhere
    probes = [F(2), F(3), F(-2), F(5), F(-1), F(4), F(-3), F(7), F(9), F(1, 2), F(-5), F(6), F(10), F(1, 3), F(-4), F(8), F(16), F(1, 4), F(0), F(1)]
    vanish = mul(*[group(sub(var('x'), num(p)) if p >= 0 else add(var('x'), num(-p))) for p in probes])
    for i in range(60):
        t, o = rand_small_poly(rng, ['x'])
        push('probe-agree-poly', add(group(t), vanish), group(t))
        push('probe-agree-sqrt', add(sqrt(add(pw(var('x'), 2), num(1))), vanish), sqrt(add(pw(var('x'), 2), num(1))))
        push('probe-agree-rad', add(sqrt(var('x')), vanish), sqrt(var('x')), {'x': 'nonneg'})
        push('probe-agree-rat', add(frac(num(1), add(var('x'), num(11))), vanish), frac(num(1), add(var('x'), num(11))))
    return out


def gen_equiv(rng):
    rows = []
    rejected = {'true': 0, 'false': 0}
    for label, gen in ((True, gen_true), (False, gen_false)):
        for fam, a, b, assume, note in gen(rng):
            names = sorted(set(collect_vars(a.tree)) | set(collect_vars(b.tree)))
            if not numeric_check(rng, a, b, names, assume, label):
                rejected['true' if label else 'false'] += 1
                continue
            rows.append({'family': fam, 'label': label, 'a': a.tree, 'b': b.tree, 'ajs': a.js, 'bjs': b.js,
                         'vars': names, 'as': as_list(assume), 'note': note})
    return rows, rejected


def collect_vars(t):
    if t['t'] == 'var':
        return [t['name']]
    out = []
    for k in ('args',):
        for c in t.get(k, []):
            out += collect_vars(c)
    for k in ('arg', 'num', 'den', 'base', 'exp', 'radicand'):
        if k in t:
            out += collect_vars(t[k])
    return out


# ------------------------------------------------------------------ solve

def surd_of_root(mid, s, rad):
    d = {}
    if mid:
        d[1] = mid
    if s:
        d[rad] = d.get(rad, F(0)) + s
    return {r: c for r, c in d.items() if c != 0}


def exact_roots(a, b, c):
    """Real roots of a x^2 + b x + c = 0 over Q coefficients, as surd dicts, ascending; or 'all'/'none'."""
    if a == 0:
        if b == 0:
            return 'all' if c == 0 else 'none'
        return [{1: -c / b} if c else {}]
    D = b * b - 4 * a * c
    if D < 0:
        return 'none'
    mid = -b / (2 * a)
    if D == 0:
        return [{1: mid} if mid else {}]
    if D.numerator * D.denominator > 10**16:
        return 'big'  # too large to factor here; the node test checks such roots by (2a r + b)^2 = D
    o, inn = square_part(D.numerator * D.denominator)
    s = F(o, D.denominator) / (2 * abs(a))  # sqrt(D)/(2|a|) as s * sqrt(inn)
    lo = surd_of_root(mid, -s, inn)
    hi = surd_of_root(mid, s, inn)
    return [lo, hi]


def coef_term(c, v=None, e=1):
    base = None if v is None else (var(v) if e == 1 else pw(var(v), e))
    if base is None:
        return num(c) if c >= 0 else group(neg(num(-c)))
    if c == 1:
        return base
    if c >= 0:
        return mul(num(c), base)
    return group(neg(mul(num(-c), base))) if c != -1 else group(neg(base))


def gen_solve(rng, n=6000):
    out = []
    for i in range(n):
        kind = i % 6
        if kind == 0:  # linear random
            a, b, c = F(0), rand_coef(rng, True), rand_coef(rng, True)
        elif kind == 1:  # quadratic with rational roots built backward
            r1, r2 = F(rng.randint(-20, 20), rng.randint(1, 6)), F(rng.randint(-20, 20), rng.randint(1, 6))
            k = F(nz_rand(rng), rng.randint(1, 4))
            a, b, c = k, -k * (r1 + r2), k * r1 * r2
        elif kind == 5:  # degenerate: zero leading or all-zero
            a, b, c = F(0), F(0), rng.choice([F(0), F(nz_rand(rng))])
        else:  # random quadratic, often irrational or complex
            a = F(nz_rand(rng), rng.randint(1, 5))
            b, c = rand_coef(rng, kind == 4), rand_coef(rng, kind == 4)
        # Spread the polynomial across both sides at random: lhs - rhs = a x^2 + b x + c
        parts = [(a, 2), (b, 1), (c, 0)]
        lhs, rhs = [], []
        for coef, e in parts:
            if rng.random() < 0.5:
                lhs.append(coef_term(coef, 'x' if e else None, e))
            else:
                rhs.append(coef_term(-coef, 'x' if e else None, e))
        if rng.random() < 0.3:  # a form of 0 on both sides
            t = coef_term(F(nz_rand(rng)), 'x', 1)
            lhs.append(t)
            rhs.append(t)
        L = num(0) if not lhs else (lhs[0] if len(lhs) == 1 else add(*lhs))
        R = num(0) if not rhs else (rhs[0] if len(rhs) == 1 else add(*rhs))
        roots = exact_roots(a, b, c)
        if roots == 'big':
            D = b * b - 4 * a * c
            sol = {'kind': 'big', 'D': qj(D)}
        else:
            sol = None
        sol = sol or {'kind': roots} if isinstance(roots, str) else {'kind': 'finite', 'roots': [surd_j(r) for r in roots]}
        out.append({'lhs': L.tree, 'rhs': R.tree, 'a': qj(a), 'b': qj(b), 'c': qj(c), 'sol': sol})
    return out


# ------------------------------------------------------------------ equations

def gen_equations(rng, n=1500):
    """sameSides / isMultiple / sameSolutions rows with oracle answers."""
    rows = []
    for i in range(n):
        r1 = F(rng.randint(-9, 9), rng.choice([1, 1, 2, 3]))
        r2 = F(rng.randint(-9, 9), rng.choice([1, 1, 2, 3]))
        k = F(nz_rand(rng), rng.choice([1, 2]))
        lin1 = group(sub(var('x'), num(r1)) if r1 >= 0 else add(var('x'), num(-r1)))
        lin2 = group(sub(var('x'), num(r2)) if r2 >= 0 else add(var('x'), num(-r2)))
        fx = mul(num(abs(k)), lin1, lin2) if k > 0 else group(neg(mul(num(-k), lin1, lin2)))
        po = p_mul({(): k}, p_mul({(('x', 1),): F(1), (): -r1}, {(('x', 1),): F(1), (): -r2}))
        m = rand_coef(rng)
        while m == 0:
            m = rand_coef(rng)
        cst = F(rng.randint(-9, 9))
        want = {'lhs': add(fx, coef_term(cst)).tree, 'rhs': coef_term(cst).tree}
        # sameSides cases
        exp_l = p_expr(p_add(po, {(): cst} if cst else {}))
        rows.append({'kind': 'sameSides', 'got': {'lhs': exp_l.tree, 'rhs': coef_term(cst).tree}, 'want': want, 'expect': True})
        rows.append({'kind': 'sameSides', 'got': {'lhs': coef_term(cst).tree, 'rhs': exp_l.tree}, 'want': want, 'expect': True})
        rows.append({'kind': 'sameSides', 'got': {'lhs': p_expr(po).tree, 'rhs': num(0).tree}, 'want': want,
                     'expect': cst == 0})
        rows.append({'kind': 'sameSides', 'got': {'lhs': mul(num(2), group(exp_l)).tree, 'rhs': mul(num(2), group(coef_term(cst))).tree},
                     'want': want, 'expect': False})
        # isMultiple: m (lhs - rhs) arranged differently
        mp = p_mul({(): m}, po)
        shift = F(rng.randint(-9, 9))
        rows.append({'kind': 'isMultiple', 'got': {'lhs': p_expr(p_add(mp, {(): shift} if shift else {})).tree, 'rhs': coef_term(shift).tree},
                     'orig': want, 'expect': True})
        rows.append({'kind': 'isMultiple', 'got': {'lhs': p_expr(p_add(mp, {(): F(1)})).tree, 'rhs': num(0).tree},
                     'orig': want, 'expect': False})
        rows.append({'kind': 'isMultiple', 'got': {'lhs': mul(var('x'), group(p_expr(po))).tree, 'rhs': num(0).tree},
                     'orig': want, 'expect': False})
        rows.append({'kind': 'isMultiple', 'got': {'lhs': num(0).tree, 'rhs': p_expr(mp).tree}, 'orig': want, 'expect': True})
        # sameSolutions: same root set, different equation; and a changed root
        rset = {r1, r2}
        other = F(rng.randint(-9, 9), rng.choice([1, 2, 3]))
        same_set = {r1, other} == rset or {r2, other} == rset
        lin3 = group(sub(var('x'), num(other)) if other >= 0 else add(var('x'), num(-other)))
        rows.append({'kind': 'sameSolutions', 'a': want, 'b': {'lhs': p_expr(p_mul({(): m}, po)).tree, 'rhs': num(0).tree},
                     'expect': True, 'rootsA': sorted(qj(r) for r in rset), 'rootsB': sorted(qj(r) for r in rset)})
        bset = {r1, other}
        rows.append({'kind': 'sameSolutions', 'a': want, 'b': {'lhs': mul(lin1, lin3).tree, 'rhs': num(0).tree},
                     'expect': bset == rset, 'rootsA': sorted(qj(r) for r in rset), 'rootsB': sorted(qj(r) for r in bset)})
        # squared both sides: x = r vs x^2 = r^2 (changes the set unless r = 0)
        rr = F(nz_rand(rng))
        rows.append({'kind': 'sameSolutions', 'a': {'lhs': var('x').tree, 'rhs': num(rr).tree if rr > 0 else group(neg(num(-rr))).tree},
                     'b': {'lhs': pw(var('x'), 2).tree, 'rhs': num(rr * rr).tree}, 'expect': False,
                     'rootsA': [qj(rr)], 'rootsB': sorted(qj(x) for x in {rr, -rr})})
    return rows


# ------------------------------------------------------------------ random-tree fuzz (numeric oracle labels)

def rand_tree(rng, depth, vs):
    r = rng.random()
    if depth <= 0 or r < 0.25:
        if rng.random() < 0.5:
            return var(rng.choice(vs))
        c = F(rng.randint(-6, 9), rng.choice([1, 1, 1, 2, 3]))
        return num(c) if c >= 0 else group(neg(num(-c)))
    op = rng.choice(['add', 'add', 'mul', 'mul', 'neg', 'frac', 'pow', 'pow', 'sqrt', 'sqrt'])
    sub_ = lambda: rand_tree(rng, depth - 1, vs)
    if op == 'add':
        return group(add(*[sub_() for _ in range(rng.randint(2, 3))]))
    if op == 'mul':
        return mul(*[group(sub_()) for _ in range(2)])
    if op == 'neg':
        return group(neg(group(sub_())))
    if op == 'frac':
        return group(frac(group(sub_()), group(sub_())))
    if op == 'pow':
        e = rng.choice([F(2), F(3), F(-1), F(0), F(1, 2), F(3, 2), F(1, 3), F(-1, 2), F(2, 3), F(1, 4)])
        return pw(group(sub_()), e)
    return sqrt(sub_())


def mutate(rng, t):
    """Structural mutation on the JSON tree: bump a constant, drop a neg, change an exponent."""
    import copy
    t = copy.deepcopy(t)
    nodes = []

    def walk(n, parent, key, idx):
        nodes.append((n, parent, key, idx))
        for k in ('arg', 'num', 'den', 'base', 'exp', 'radicand'):
            if k in n:
                walk(n[k], n, k, None)
        for i, c in enumerate(n.get('args', [])):
            walk(c, n, 'args', i)
    walk(t, None, None, None)
    rng.shuffle(nodes)
    for n, parent, key, idx in nodes:
        if n['t'] == 'num':
            fr = F(int(n['q'][0]), int(n['q'][1])) + rng.choice([1, -1, F(1, 2)])
            if fr < 0:
                fr = -fr
            n['q'] = qj(fr)
            return t
        if n['t'] == 'neg' and parent is not None:
            if idx is None:
                parent[key] = n['arg']
            else:
                parent[key][idx] = n['arg']
            return t
    return None


def tree_eval(t, env):
    """Decimal value of a JSON tree, None where undefined (v1 policy)."""
    k = t['t']
    if k == 'num':
        return Decimal(int(t['q'][0])) / Decimal(int(t['q'][1]))
    if k == 'var':
        return env[t['name']]
    if k in ('group',):
        return tree_eval(t['arg'], env)
    if k == 'neg':
        v = tree_eval(t['arg'], env)
        return None if v is None else -v
    if k in ('add', 'mul'):
        vals = [tree_eval(c, env) for c in t['args']]
        if any(v is None for v in vals):
            return None
        r = Decimal(0) if k == 'add' else Decimal(1)
        for v in vals:
            r = r + v if k == 'add' else r * v
        return r
    if k == 'frac':
        a, b = tree_eval(t['num'], env), tree_eval(t['den'], env)
        if a is None or b is None or b == 0:
            return None
        return a / b
    if k == 'pow':
        b = tree_eval(t['base'], env)
        e = tree_const(t['exp'])
        if b is None or e is None:
            return None
        if abs(b) > Decimal(10) ** 30 or abs(e) > 64:
            return None
        return dpow(b, e)
    if k == 'root':
        v = tree_eval(t['radicand'], env)
        if v is None or v < 0:
            return None
        return v.sqrt()
    raise ValueError(k)


def tree_const(t):
    k = t['t']
    if k == 'num':
        return F(int(t['q'][0]), int(t['q'][1]))
    if k == 'neg':
        v = tree_const(t['arg'])
        return None if v is None else -v
    if k == 'group':
        return tree_const(t['arg'])
    return None


def fuzz_label(rng, a, b, names, assume):
    agree, differ, pts = 0, 0, []
    for _ in range(60):
        env = sample_env(rng, names, assume)
        try:
            x, y = tree_eval(a, env), tree_eval(b, env)
        except Exception:
            continue
        if x is None or y is None:
            continue
        if close(x, y):
            agree += 1
        elif abs(x - y) > Decimal(10) ** -12 * (1 + abs(x) + abs(y)):
            differ += 1
    if differ:
        return False
    if agree >= 5:
        return True
    return None


def commute(rng, t):
    import copy
    t = copy.deepcopy(t)

    def walk(n):
        if n['t'] in ('add', 'mul'):
            rng.shuffle(n['args'])
        for k in ('arg', 'num', 'den', 'base', 'radicand'):
            if k in n:
                walk(n[k])
        for c in n.get('args', []):
            walk(c)
    walk(t)
    return t


def gen_fuzz(rng, n=20000):
    rows = []
    for i in range(n):
        vs = ['x'] if i % 2 else ['x', 'y']
        a = rand_tree(rng, rng.randint(2, 4), vs).tree
        typ = i % 3
        b = commute(rng, a) if typ == 0 else mutate(rng, a)
        if b is None:
            continue
        if typ == 2:
            b = commute(rng, b)
        assume = {}
        for v in vs:
            rel = rng.choice([None, None, 'nonneg', 'pos', 'nonzero'])
            if rel:
                assume[v] = rel
        names = sorted(set(collect_vars(a)) | set(collect_vars(b)))
        lab = fuzz_label(rng, a, b, names, assume)
        if lab is None:
            continue
        rows.append({'a': a, 'b': b, 'as': as_list(assume), 'label': lab})
    return rows


def main():
    rng = random.Random(20261112)
    files = {}
    files['rational.json'] = gen_rational(rng)
    files['surd.json'] = gen_surd(rng)
    files['poly.json'] = gen_poly(rng)
    eq, rejected = gen_equiv(rng)
    files['equiv.json'] = {'rows': eq, 'rejected_by_numeric_check': rejected}
    files['solve.json'] = gen_solve(rng)
    files['equations.json'] = gen_equations(rng, 400)
    files['fuzz.json'] = gen_fuzz(rng)
    for name, data in files.items():
        with open(os.path.join(HERE, name), 'w') as fh:
            json.dump(data, fh, separators=(',', ':'))
    t = sum(1 for r in eq if r['label'])
    print('equiv rows: true', t, 'false', len(eq) - t, 'rejected', rejected)


if __name__ == '__main__':
    main()
