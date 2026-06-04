"""Tier-up sciences: real symbolic math (SymPy) + real quantum chemistry (PySCF),
checked against exact / textbook values."""
from underworld.server.services import math_advanced as M
from underworld.server.services import quantum_chemistry as Q


# ── SymPy: exact symbolic mathematics ─────────────────────────────────────────
def test_solve_quadratic_exact():
    r = M.solve_equation("x**2 - 2", "x")
    assert set(r["solutions"]) == {"sqrt(2)", "-sqrt(2)"}


def test_integrate_and_differentiate_inverse():
    assert M.integrate("sin(x)", "x")["result"] == "-cos(x)"
    assert M.differentiate("x**3", "x")["result"] == "3*x**2"


def test_definite_integral_numeric():
    r = M.integrate("x**2", "x", lower=0, upper=3)     # = 9
    assert abs(r["numeric"] - 9.0) < 1e-9


def test_prove_pythagorean_identity():
    assert M.prove_identity("sin(x)**2 + cos(x)**2", "1")["proven_equal"]


def test_solve_ode():
    r = M.solve_ode("Derivative(y(x), x) - y(x)", "y", "x")   # y' = y -> C*e^x
    assert "exp(x)" in r["solution"]


def test_number_theory():
    nt = M.number_theory(360)
    assert nt["factorization"] == {"2": 3, "3": 2, "5": 1}    # 360 = 2^3·3^2·5
    assert not nt["is_prime"]
    assert M.number_theory(17)["is_prime"]


def test_matrix_eigenvalues_exact():
    m = M.matrix_analysis([[2, 0], [0, 3]])
    assert m["determinant"] == "6" and set(m["eigenvalues"]) == {"2", "3"}


# ── PySCF: real ab-initio quantum chemistry ───────────────────────────────────
def test_h2_hartree_fock_matches_textbook():
    r = Q.molecule_energy("H 0 0 0; H 0 0 0.74", basis="sto-3g", method="hf")
    assert r["converged"]
    assert abs(r["total_energy_hartree"] - (-1.1168)) < 0.005   # known H2/STO-3G value
    assert r["homo_lumo_gap_ev"] is not None


def test_water_energy_negative_and_converged():
    r = Q.molecule_energy("O 0 0 0; H 0 0 0.96; H 0.93 0 -0.24", basis="sto-3g")
    assert r["converged"] and r["total_energy_hartree"] < -70   # water ~ -74.96 Ha


def test_h2_bond_scan_finds_equilibrium_near_0p7():
    r = Q.bond_scan("H", "H", start=0.5, stop=1.2, steps=8)
    assert 0.65 < r["equilibrium_bond_length_angstrom"] < 0.80   # ~0.74 Å
