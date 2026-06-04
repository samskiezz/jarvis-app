"""Each REAL numerical method must reproduce its KNOWN reference value.

References (KNOWN values):
  e  = 2.718281828459045   (Euler's number)
  √2 = 1.4142135623730951
  ∫₀^π sin x dx = 2         (exact)
  π  = 3.141592653589793
  RSA canonical example n=3233, d=2753, m=65 -> c=2790 -> 65
"""
import math

from underworld.server.services.methods_math import (
    rk4_integrate,
    newton_raphson_root,
    simpson_integrate,
    svd_reconstruct,
    rsa_roundtrip,
    monte_carlo_pi,
    fft_frequencies,
    gradient_descent,
)


def test_rk4_recovers_e():
    r = rk4_integrate(y0=1.0, t0=0.0, t1=1.0, steps=200)
    # y'=y, y(0)=1 -> y(1)=e  (KNOWN: 2.718281828459045)
    assert math.isclose(r["y_final"], math.e, rel_tol=1e-8)
    assert r["abs_error"] < 1e-8


def test_newton_raphson_sqrt2():
    r = newton_raphson_root(target=2.0, x0=1.0)
    # KNOWN: √2 = 1.4142135623730951
    assert math.isclose(r["root"], math.sqrt(2.0), rel_tol=1e-12)
    assert r["abs_error"] < 1e-10


def test_simpson_integral_of_sin_is_two():
    r = simpson_integrate(a=0.0, b=math.pi, n=1000)
    # KNOWN exact: ∫₀^π sin x dx = 2
    assert math.isclose(r["integral"], 2.0, abs_tol=1e-9)
    assert r["abs_error"] < 1e-9


def test_svd_reconstructs_matrix():
    r = svd_reconstruct([[3.0, 1.0, 1.0], [-1.0, 3.0, 1.0]])
    # KNOWN property: U Σ Vᵀ == A exactly, and σ² == eig(AᵀA)
    assert r["reconstruction_error"] < 1e-10
    assert r["singular_vs_eigen_error"] < 1e-9
    assert r["rank"] == 2


def test_rsa_roundtrip_canonical_example():
    r = rsa_roundtrip(p=61, q=53, message=65, e=17)
    # KNOWN canonical RSA: n=3233, d=2753, cipher=2790, decrypt -> 65
    assert r["n"] == 3233
    assert r["d"] == 2753
    assert r["cipher"] == 2790
    assert r["decrypted"] == 65
    assert r["roundtrip_ok"]


def test_monte_carlo_pi_approx():
    r = monte_carlo_pi(samples=2_000_000, seed=0)
    # KNOWN: π = 3.14159...; MC converges ~1/√N
    assert math.isclose(r["pi_estimate"], math.pi, abs_tol=5e-3)


def test_fft_recovers_input_frequencies():
    r = fft_frequencies(freqs=(5.0, 12.0), fs=256.0, duration=1.0)
    # KNOWN: spectral peaks land on the synthesised tone frequencies
    assert r["detected_freqs"] == [5.0, 12.0]
    assert r["max_freq_error"] < 1.0


def test_gradient_descent_reaches_known_optimum():
    r = gradient_descent(lr=0.1, steps=500, start=(5.0, -3.0))
    # KNOWN optimum of (x-3)²+(y+1)² is (3,-1), f=0
    assert r["abs_error"] < 1e-6
    assert r["f_value"] < 1e-9
    assert r["scipy_error"] < 1e-5
