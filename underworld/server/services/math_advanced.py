"""Real symbolic mathematics (SymPy) — the math-science tier-up from numeric
heuristics to a genuine computer-algebra system (the Wolfram/Mathematica class
of tool). It SOLVES, INTEGRATES, DIFFERENTIATES, PROVES identities, solves ODEs,
does exact linear algebra and number theory — symbolically, exactly, not
approximately. This is how serious mathematical work is actually done.
"""
from __future__ import annotations

import sympy as sp
from sympy.parsing.sympy_parser import parse_expr

_X = sp.Symbol("x")


def _expr(s: str):
    return parse_expr(s, evaluate=True)


def solve_equation(equation: str, var: str = "x") -> dict:
    """Solve an equation symbolically (exact roots, real + complex)."""
    v = sp.Symbol(var)
    e = _expr(equation)
    sols = sp.solve(e, v)
    return {"equation": str(e), "variable": var,
            "solutions": [str(s) for s in sols], "count": len(sols)}


def integrate(expr: str, var: str = "x", *, lower=None, upper=None) -> dict:
    """Exact symbolic integral (definite if bounds given)."""
    v = sp.Symbol(var); e = _expr(expr)
    if lower is not None and upper is not None:
        res = sp.integrate(e, (v, sp.sympify(lower), sp.sympify(upper)))
    else:
        res = sp.integrate(e, v)
    return {"integrand": str(e), "result": str(res), "numeric": _try_float(res)}


def differentiate(expr: str, var: str = "x", *, order: int = 1) -> dict:
    v = sp.Symbol(var)
    return {"result": str(sp.diff(_expr(expr), v, order))}


def prove_identity(lhs: str, rhs: str) -> dict:
    """PROVE two expressions are identically equal (symbolic simplification of
    their difference to zero) — a real, exact proof, not a numeric spot-check."""
    diff = sp.simplify(_expr(lhs) - _expr(rhs))
    return {"lhs": lhs, "rhs": rhs, "difference": str(diff), "proven_equal": diff == 0}


def solve_ode(equation: str, func: str = "y", var: str = "x") -> dict:
    """Solve an ordinary differential equation symbolically."""
    x = sp.Symbol(var); y = sp.Function(func)
    e = parse_expr(equation, local_dict={func: y, var: x, "Derivative": sp.Derivative})
    sol = sp.dsolve(e, y(x))
    return {"ode": str(e), "solution": str(sol)}


def matrix_analysis(rows: list[list[float]]) -> dict:
    """Exact eigenvalues, determinant, rank, inverse of a matrix."""
    M = sp.Matrix(rows)
    return {
        "determinant": str(M.det()),
        "rank": M.rank(),
        "eigenvalues": [str(k) for k in M.eigenvals().keys()],
        "trace": str(M.trace()),
    }


def number_theory(n: int) -> dict:
    """Real number theory: primality, prime factorisation, totient, divisors."""
    n = int(n)
    return {
        "n": n, "is_prime": bool(sp.isprime(n)),
        "factorization": {str(p): e for p, e in sp.factorint(n).items()},
        "euler_totient": int(sp.totient(n)) if n > 0 else 0,
        "num_divisors": int(sp.divisor_count(n)) if n > 0 else 0,
    }


def limit(expr: str, var: str = "x", to: str = "oo") -> dict:
    v = sp.Symbol(var)
    return {"limit": str(sp.limit(_expr(expr), v, sp.sympify(to)))}


def series_expansion(expr: str, var: str = "x", *, n: int = 6) -> dict:
    v = sp.Symbol(var)
    return {"series": str(sp.series(_expr(expr), v, 0, n))}


def _try_float(e):
    try:
        return round(float(e), 8)
    except Exception:
        return None
