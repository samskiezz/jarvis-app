"""Real, named chemistry simulation methods for the Underworld backend.

Every function here implements a genuine, textbook chemistry method and returns
a dict of real computed values. Each is verified in the test-suite against a
KNOWN published value (see test_methods_chemistry.py for citations).

Methods
-------
1. reaction_kinetics_first_order  - integrate dA/dt = -k[A]; verify t_half = ln2/k
2. chemical_equilibrium           - solve A <-> B for Keq; Le Chatelier direction
3. nernst_cell_potential          - Nernst equation cell EMF (Daniell cell)
4. weak_acid_ph                   - pH of a weak monoprotic acid (acetic acid)
5. arrhenius_rate_ratio           - Arrhenius temperature dependence k(T2)/k(T1)
6. beer_lambert_absorbance        - Beer-Lambert A = eps * l * c
7. van_der_waals_pressure         - real-gas (vdW) vs ideal-gas pressure
8. gibbs_free_energy              - dG = dH - T*dS and spontaneity
"""
from __future__ import annotations

import math

import numpy as np
from scipy.integrate import solve_ivp

# ---------------------------------------------------------------------------
# Physical constants (CODATA / standard)
# ---------------------------------------------------------------------------
R_GAS = 8.314462618          # J / (mol K)  -- universal gas constant
F_FARADAY = 96485.33212      # C / mol      -- Faraday constant
R_L_ATM = 0.082057366        # L atm / (mol K) -- gas constant in L*atm units


# ---------------------------------------------------------------------------
# 1. Reaction kinetics: first-order A -> B
# ---------------------------------------------------------------------------
def reaction_kinetics_first_order(k: float, a0: float = 1.0, t_end: float | None = None,
                                  n_points: int = 200) -> dict:
    """Integrate the first-order rate ODE  d[A]/dt = -k[A]  for A -> B.

    Numerically integrates the ODE with scipy and compares against the analytic
    solution [A](t) = [A]0 * exp(-k t). The half-life of a first-order reaction
    is t_1/2 = ln(2)/k, independent of initial concentration.

    Returns the numerically-integrated half-life and the analytic one.
    """
    if k <= 0:
        raise ValueError("rate constant k must be positive")
    half_life_analytic = math.log(2.0) / k
    if t_end is None:
        t_end = 8.0 * half_life_analytic  # integrate well past several half-lives

    def rhs(t, y):
        return [-k * y[0]]

    t_eval = np.linspace(0.0, t_end, n_points)
    sol = solve_ivp(rhs, (0.0, t_end), [a0], t_eval=t_eval,
                    rtol=1e-10, atol=1e-12, dense_output=True)

    a_numeric = sol.y[0]
    a_analytic = a0 * np.exp(-k * t_eval)
    max_abs_err = float(np.max(np.abs(a_numeric - a_analytic)))

    # Numerically locate half-life: time where [A] = a0/2 (dense interpolation).
    target = a0 / 2.0
    t_fine = np.linspace(0.0, t_end, 200000)
    a_fine = sol.sol(t_fine)[0]
    idx = int(np.argmin(np.abs(a_fine - target)))
    half_life_numeric = float(t_fine[idx])

    return {
        "method": "first_order_kinetics_ode",
        "k": k,
        "a0": a0,
        "half_life_analytic": half_life_analytic,   # ln2/k
        "half_life_numeric": half_life_numeric,
        "rate_constant_units": "1/time",
        "concentration_at_t_end": float(a_numeric[-1]),
        "max_abs_error_vs_analytic": max_abs_err,
    }


# ---------------------------------------------------------------------------
# 2. Chemical equilibrium: A <-> B
# ---------------------------------------------------------------------------
def chemical_equilibrium(keq: float, a_initial: float = 1.0, b_initial: float = 0.0) -> dict:
    """Solve for equilibrium concentrations of the reaction  A <-> B  with
    equilibrium constant Keq = [B]_eq / [A]_eq.

    Mass balance: [A] + [B] = a_initial + b_initial = total. Let x be the extent
    of reaction (A consumed). At equilibrium:
        Keq = (b_initial + x) / (a_initial - x)
    => x = (Keq * a_initial - b_initial) / (1 + Keq)

    Le Chatelier: increasing Keq shifts equilibrium toward products (more B).
    """
    if keq <= 0:
        raise ValueError("Keq must be positive")
    total = a_initial + b_initial
    x = (keq * a_initial - b_initial) / (1.0 + keq)
    a_eq = a_initial - x
    b_eq = b_initial + x
    q = b_eq / a_eq if a_eq != 0 else float("inf")
    return {
        "method": "equilibrium_A_to_B",
        "keq": keq,
        "a_eq": a_eq,
        "b_eq": b_eq,
        "total_conserved": a_eq + b_eq,         # == total (mass balance)
        "reaction_quotient_at_eq": q,           # should equal keq
        "fraction_products": b_eq / total,
        "le_chatelier": "higher Keq -> more product B",
    }


# ---------------------------------------------------------------------------
# 3. Electrochemistry: Nernst equation
# ---------------------------------------------------------------------------
def nernst_cell_potential(e_standard: float, n: int, q: float, T: float = 298.15) -> dict:
    """Nernst equation for cell potential:
        E = E0 - (R T / n F) * ln(Q)

    For the Daniell cell  Zn(s) + Cu2+ -> Zn2+ + Cu(s),  E0 = +1.10 V, n = 2,
    Q = [Zn2+]/[Cu2+]. At standard conditions (Q = 1) E = E0 = 1.10 V.
    """
    if n <= 0:
        raise ValueError("n (electrons transferred) must be positive")
    if q <= 0:
        raise ValueError("reaction quotient Q must be positive")
    e_cell = e_standard - (R_GAS * T / (n * F_FARADAY)) * math.log(q)
    # 2.303RT/F factor (the familiar 0.0592 V at 298.15 K)
    nernst_slope = 2.302585093 * R_GAS * T / F_FARADAY
    return {
        "method": "nernst_equation",
        "e_standard_V": e_standard,
        "n_electrons": n,
        "reaction_quotient": q,
        "temperature_K": T,
        "e_cell_V": e_cell,
        "nernst_slope_V": nernst_slope,        # ~0.05916 V at 298.15 K
        "spontaneous": e_cell > 0,             # E>0 <=> dG<0
    }


# ---------------------------------------------------------------------------
# 4. Acid-base: pH of a weak monoprotic acid
# ---------------------------------------------------------------------------
def weak_acid_ph(concentration: float, pka: float) -> dict:
    """pH of a weak monoprotic acid HA <-> H+ + A- by solving the exact
    quadratic equilibrium (no small-x approximation):
        Ka = x^2 / (C - x),  where x = [H+]
    => x^2 + Ka x - Ka C = 0.

    The classic approximation pH ~= 1/2 (pKa - log10 C) is also returned.
    For 0.1 M acetic acid (pKa 4.76): pH ~= 2.87.
    """
    if concentration <= 0:
        raise ValueError("concentration must be positive")
    ka = 10.0 ** (-pka)
    # Solve x^2 + Ka x - Ka*C = 0 for positive root (= [H+]).
    a, b, c = 1.0, ka, -ka * concentration
    disc = b * b - 4 * a * c
    h_plus = (-b + math.sqrt(disc)) / (2 * a)
    ph_exact = -math.log10(h_plus)
    ph_approx = 0.5 * (pka - math.log10(concentration))
    return {
        "method": "weak_acid_ph_quadratic",
        "concentration_M": concentration,
        "pka": pka,
        "ka": ka,
        "h_plus_M": h_plus,
        "ph_exact": ph_exact,
        "ph_approx_half_pka_minus_logC": ph_approx,
        "percent_dissociation": 100.0 * h_plus / concentration,
    }


# ---------------------------------------------------------------------------
# 5. Arrhenius temperature dependence
# ---------------------------------------------------------------------------
def arrhenius_rate_ratio(ea: float, T1: float, T2: float, A: float | None = None) -> dict:
    """Arrhenius equation  k = A * exp(-Ea / (R T)).

    Returns the rate-constant ratio k(T2)/k(T1) = exp(-Ea/R (1/T2 - 1/T1)).
    For Ea ~= 52.9 kJ/mol going 298.15 K -> 308.15 K the ratio is ~2.0 (the
    'rate doubles per 10 degrees C' rule of thumb).

    If a pre-exponential factor A is supplied, also returns absolute k values.
    """
    if T1 <= 0 or T2 <= 0:
        raise ValueError("temperatures must be positive (Kelvin)")
    ratio = math.exp(-ea / R_GAS * (1.0 / T2 - 1.0 / T1))
    out = {
        "method": "arrhenius",
        "ea_J_per_mol": ea,
        "T1_K": T1,
        "T2_K": T2,
        "rate_ratio_k2_over_k1": ratio,
    }
    if A is not None:
        k1 = A * math.exp(-ea / (R_GAS * T1))
        k2 = A * math.exp(-ea / (R_GAS * T2))
        out.update({"k1": k1, "k2": k2, "pre_exponential_A": A})
    return out


# ---------------------------------------------------------------------------
# 6. Spectroscopy: Beer-Lambert law
# ---------------------------------------------------------------------------
def beer_lambert_absorbance(epsilon: float, path_length: float, concentration: float) -> dict:
    """Beer-Lambert law:  A = epsilon * l * c  (and transmittance T = 10^-A).

    For NADH at 340 nm, epsilon = 6220 L/(mol cm); a 1.0e-4 M solution in a
    1 cm cuvette gives A = 0.622.
    """
    if epsilon < 0 or path_length < 0 or concentration < 0:
        raise ValueError("epsilon, path_length and concentration must be >= 0")
    absorbance = epsilon * path_length * concentration
    transmittance = 10.0 ** (-absorbance)
    return {
        "method": "beer_lambert",
        "epsilon_L_per_mol_cm": epsilon,
        "path_length_cm": path_length,
        "concentration_M": concentration,
        "absorbance": absorbance,
        "transmittance": transmittance,
        "percent_transmittance": 100.0 * transmittance,
    }


# ---------------------------------------------------------------------------
# 7. Real gas: van der Waals vs ideal gas
# ---------------------------------------------------------------------------
def van_der_waals_pressure(n: float, V: float, T: float, a: float, b: float) -> dict:
    """Compare ideal-gas and van der Waals pressures.

        Ideal:  P = n R T / V
        vdW:    P = n R T / (V - n b) - a (n/V)^2

    R is in L*atm/(mol K); a in L^2 atm / mol^2, b in L/mol, V in L => P in atm.
    For CO2 (a = 3.640, b = 0.04267) at 1 mol in 22.4 L at 273.15 K, the vdW
    attraction term lowers the pressure below the ideal 1.00 atm.
    """
    if V - n * b <= 0:
        raise ValueError("excluded volume exceeds container volume (V - n b <= 0)")
    p_ideal = n * R_L_ATM * T / V
    p_vdw = n * R_L_ATM * T / (V - n * b) - a * (n / V) ** 2
    return {
        "method": "van_der_waals",
        "n_mol": n,
        "volume_L": V,
        "temperature_K": T,
        "a_L2_atm_per_mol2": a,
        "b_L_per_mol": b,
        "pressure_ideal_atm": p_ideal,
        "pressure_vdw_atm": p_vdw,
        "vdw_correction_atm": p_vdw - p_ideal,   # negative when attraction dominates
        "attraction_dominates": p_vdw < p_ideal,
    }


# ---------------------------------------------------------------------------
# 8. Thermochemistry: Gibbs free energy & spontaneity
# ---------------------------------------------------------------------------
def gibbs_free_energy(delta_h: float, delta_s: float, T: float = 298.15) -> dict:
    """Gibbs free energy change:  dG = dH - T dS  and spontaneity (dG < 0).

    delta_h in J/mol, delta_s in J/(mol K), T in K -> dG in J/mol.
    For H2(g) + 1/2 O2(g) -> H2O(l):  dH = -285800 J/mol, dS = -163.2 J/(mol K)
    => dG ~= -237.1 kJ/mol (spontaneous).
    """
    delta_g = delta_h - T * delta_s
    return {
        "method": "gibbs_free_energy",
        "delta_h_J_per_mol": delta_h,
        "delta_s_J_per_mol_K": delta_s,
        "temperature_K": T,
        "delta_g_J_per_mol": delta_g,
        "delta_g_kJ_per_mol": delta_g / 1000.0,
        "spontaneous": delta_g < 0,
    }


# ---------------------------------------------------------------------------
# Route table: (field, keyword) -> function name
# ---------------------------------------------------------------------------
ROUTE_TABLE = {
    ("chemistry", "kinetic"): "reaction_kinetics_first_order",
    ("chemistry", "equilibr"): "chemical_equilibrium",
    ("chemistry", "electrochem"): "nernst_cell_potential",
    ("chemistry", "titrat"): "weak_acid_ph",
    ("chemistry", "arrheniu"): "arrhenius_rate_ratio",
    ("chemistry", "spectro"): "beer_lambert_absorbance",
    ("chemistry", "gas"): "van_der_waals_pressure",
    ("chemistry", "thermochem"): "gibbs_free_energy",
}
