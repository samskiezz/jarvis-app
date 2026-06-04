"""A library of distinct, REAL named numerical / mathematical methods — each one
a textbook algorithm (not a shared engine), and each verified in the tests against
a KNOWN closed-form or reference value. Built on sympy / scipy / numpy.

Methods:
  1. rk4_integrate        Runge-Kutta 4 ODE integrator   (y'=y -> e)
  2. newton_raphson_root  Newton-Raphson root finding    (sqrt(2))
  3. simpson_integrate    Simpson's composite rule        (∫sin 0..π = 2)
  4. svd_reconstruct      Singular Value Decomposition    (A = U Σ Vᵀ)
  5. rsa_roundtrip        RSA modular exponentiation      (m^e^d ≡ m mod n)
  6. monte_carlo_pi       Monte Carlo π estimation        (≈ 3.14159)
  7. fft_frequencies      FFT spectral analysis           (recovers tone freqs)
  8. gradient_descent     Gradient descent optimisation   (min of convex bowl)
"""
from __future__ import annotations

import math

import numpy as np
from scipy import linalg as sla
from scipy import optimize as sopt
import sympy as sp


# ── 1. Runge-Kutta 4 ODE integrator ──────────────────────────────────────────
def rk4_integrate(f=None, *, y0: float = 1.0, t0: float = 0.0,
                  t1: float = 1.0, steps: int = 100) -> dict:
    """Classical 4th-order Runge-Kutta for y' = f(t, y). Default f(t,y)=y has the
    analytic solution y(t)=y0·e^t, so y(1)=e for y0=1 — a KNOWN value."""
    if f is None:
        f = lambda t, y: y
    h = (t1 - t0) / steps
    t, y = t0, y0
    for _ in range(steps):
        k1 = f(t, y)
        k2 = f(t + h / 2, y + h / 2 * k1)
        k3 = f(t + h / 2, y + h / 2 * k2)
        k4 = f(t + h, y + h * k3)
        y += h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        t += h
    analytic = y0 * math.exp(t1 - t0)
    return {"method": "Runge-Kutta 4", "y_final": float(y), "t_final": float(t),
            "analytic": float(analytic), "abs_error": abs(float(y) - analytic),
            "steps": steps}


# ── 2. Newton-Raphson root finding ───────────────────────────────────────────
def newton_raphson_root(*, target: float = 2.0, x0: float = 1.0,
                        tol: float = 1e-12, max_iter: int = 100) -> dict:
    """Newton-Raphson on f(x)=x²−target, i.e. computes √target. For target=2 the
    KNOWN root is √2 = 1.4142135623730951. Uses sympy for the exact derivative."""
    x = sp.symbols("x")
    f_expr = x**2 - target
    fp_expr = sp.diff(f_expr, x)
    f = sp.lambdify(x, f_expr, "math")
    fp = sp.lambdify(x, fp_expr, "math")
    xn = float(x0)
    iters = 0
    for iters in range(1, max_iter + 1):
        step = f(xn) / fp(xn)
        xn -= step
        if abs(step) < tol:
            break
    known = math.sqrt(target)
    return {"method": "Newton-Raphson", "root": float(xn), "known": float(known),
            "abs_error": abs(float(xn) - known), "iterations": iters,
            "residual": abs(f(xn))}


# ── 3. Simpson's composite rule (numerical integration) ───────────────────────
def simpson_integrate(f=None, *, a: float = 0.0, b: float = math.pi,
                      n: int = 1000) -> dict:
    """Composite Simpson's rule (n even). Default ∫₀^π sin(x) dx has the KNOWN
    exact value 2. n is forced even as the rule requires."""
    if f is None:
        f = math.sin
    if n % 2:
        n += 1
    h = (b - a) / n
    xs = [a + i * h for i in range(n + 1)]
    fs = [f(xi) for xi in xs]
    s = fs[0] + fs[-1]
    s += 4 * sum(fs[i] for i in range(1, n, 2))
    s += 2 * sum(fs[i] for i in range(2, n, 2))
    integral = h / 3 * s
    # KNOWN exact value via sympy for the default integrand
    x = sp.symbols("x")
    exact = float(sp.integrate(sp.sin(x), (x, a, b))) if f is math.sin else None
    return {"method": "Simpson's rule", "integral": float(integral),
            "exact": exact, "abs_error": (abs(integral - exact) if exact is not None else None),
            "intervals": n}


# ── 4. Singular Value Decomposition (linear algebra) ──────────────────────────
def svd_reconstruct(matrix=None) -> dict:
    """Singular Value Decomposition A = U Σ Vᵀ via scipy. KNOWN property: the
    product reconstructs A exactly, and singular values are the sqrt of the
    eigenvalues of AᵀA. Also returns an eigendecomposition cross-check."""
    if matrix is None:
        matrix = [[3.0, 1.0, 1.0], [-1.0, 3.0, 1.0]]
    A = np.array(matrix, dtype=float)
    U, s, Vt = sla.svd(A, full_matrices=False)
    recon = U @ np.diag(s) @ Vt
    recon_err = float(np.linalg.norm(recon - A))
    # Cross-check: singular values² == eigenvalues of AᵀA
    eigvals = np.linalg.eigvalsh(A.T @ A)
    eig_sorted = np.sqrt(np.sort(eigvals)[::-1][: len(s)])
    sv_match = float(np.linalg.norm(np.sort(s)[::-1] - eig_sorted))
    return {"method": "SVD", "singular_values": [float(v) for v in s],
            "reconstruction_error": recon_err, "rank": int(np.sum(s > 1e-12)),
            "singular_vs_eigen_error": sv_match}


# ── 5. RSA modular-exponentiation cryptography ────────────────────────────────
def rsa_roundtrip(*, p: int = 61, q: int = 53, message: int = 65,
                  e: int = 17) -> dict:
    """Textbook RSA. KNOWN correctness: (m^e)^d ≡ m (mod n) where n=pq and
    d ≡ e⁻¹ (mod φ(n)). Default (p=61,q=53) is the canonical RSA example with
    n=3233, φ=3120, d=2753; encrypting m=65 gives c=2790, decrypts back to 65."""
    n = p * q
    phi = (p - 1) * (q - 1)
    if math.gcd(e, phi) != 1:
        raise ValueError("e must be coprime with phi(n)")
    d = pow(e, -1, phi)  # modular inverse
    cipher = pow(message, e, n)
    decrypted = pow(cipher, d, n)
    return {"method": "RSA modexp", "n": n, "phi": phi, "e": e, "d": d,
            "message": message, "cipher": cipher, "decrypted": decrypted,
            "roundtrip_ok": decrypted == message}


# ── 6. Monte Carlo π estimation (probability) ─────────────────────────────────
def monte_carlo_pi(*, samples: int = 2_000_000, seed: int = 0) -> dict:
    """Monte Carlo estimate of π: fraction of uniform points in the unit square
    falling inside the quarter circle ≈ π/4. KNOWN value π = 3.14159265…"""
    rng = np.random.default_rng(seed)
    pts = rng.random((samples, 2))
    inside = int(np.sum(pts[:, 0] ** 2 + pts[:, 1] ** 2 <= 1.0))
    pi_est = 4.0 * inside / samples
    return {"method": "Monte Carlo", "pi_estimate": float(pi_est),
            "known": math.pi, "abs_error": abs(pi_est - math.pi),
            "samples": samples}


# ── 7. FFT spectral analysis (Fourier / analysis) ─────────────────────────────
def fft_frequencies(*, freqs=(5.0, 12.0), fs: float = 256.0,
                    duration: float = 1.0) -> dict:
    """Builds a signal of pure tones, then recovers their frequencies via numpy
    FFT. KNOWN: the dominant spectral peaks coincide with the input frequencies."""
    freqs = tuple(float(f) for f in freqs)
    n = int(fs * duration)
    t = np.arange(n) / fs
    signal = sum(np.sin(2 * np.pi * f * t) for f in freqs)
    spectrum = np.abs(np.fft.rfft(signal))
    bin_freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    # pick the strongest peaks (one per input tone)
    peak_idx = np.argsort(spectrum)[::-1][: len(freqs)]
    detected = sorted(float(round(bin_freqs[i])) for i in peak_idx)
    max_err = max(abs(d - k) for d, k in zip(detected, sorted(freqs)))
    return {"method": "FFT", "input_freqs": sorted(freqs),
            "detected_freqs": detected, "max_freq_error": float(max_err),
            "n_samples": n}


# ── 8. Gradient descent optimisation ──────────────────────────────────────────
def gradient_descent(*, lr: float = 0.1, steps: int = 500,
                     start=(5.0, -3.0)) -> dict:
    """Gradient descent on the convex bowl f(x,y)=(x−3)²+(y+1)². KNOWN optimum is
    (3,−1) with f=0. Cross-validated against scipy.optimize.minimize (BFGS)."""
    target = np.array([3.0, -1.0])
    p = np.array(start, dtype=float)
    for _ in range(steps):
        grad = 2.0 * (p - target)
        p = p - lr * grad
    gd_min = p
    # cross-check with scipy
    res = sopt.minimize(lambda v: (v[0] - 3) ** 2 + (v[1] + 1) ** 2,
                        np.array(start, dtype=float), method="BFGS")
    return {"method": "Gradient descent", "minimizer": [float(v) for v in gd_min],
            "known_optimum": [3.0, -1.0],
            "abs_error": float(np.linalg.norm(gd_min - target)),
            "f_value": float(np.sum((gd_min - target) ** 2)),
            "scipy_minimizer": [float(v) for v in res.x],
            "scipy_error": float(np.linalg.norm(res.x - target))}
