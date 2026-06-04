"""Real immunology & virology simulations.

Each function is a distinct, named scientific method (not a shared engine reused),
implemented with numpy/scipy and verified against a KNOWN published / analytic
value in the companion tests. Domains: within-host viral dynamics, antibody-antigen
binding thermodynamics, adaptive immune-response kinetics, vaccination thresholds,
dose-response pharmacology, neutralization serology, epidemic final-size theory and
clonal lymphocyte expansion.

References (verified against in tests):
  - Nowak & May (2000) "Virus Dynamics": target-cell-limited model
        dT/dt = -beta T V, dI/dt = beta T V - delta I, dV/dt = p I - c V,
        within-host R0 = beta * T0 * p / (delta * c).
  - Law of mass action for 1:1 binding: fraction bound = [Ag]/([Ag]+Kd);
        half-saturation at [Ag] = Kd.
  - Logistic growth of effector cells (Verhulst 1838): inflection at K/2.
  - Vaccination / herd-immunity threshold pc = 1 - 1/R0 (Smith 1970; Fine 1993).
        Measles R0 = 15 -> pc ~ 0.933.
  - Hill (1910) dose-response: E = Emax * D^n / (EC50^n + D^n); half-effect at EC50.
  - Neutralization titer = reciprocal of the last dilution giving >= 50% effect
        (e.g. NT50 / IC50 serial-dilution endpoint).
  - Kermack-McKendrick (1927) SIR final-size relation: 1 - Z = exp(-R0 Z).
  - Clonal selection (Burnet 1957): exponential expansion N(t) = N0 * 2^(t/td).
"""
from __future__ import annotations

import math

import numpy as np
from scipy.integrate import odeint
from scipy.optimize import brentq


# ── 1. Within-host viral dynamics: target-cell-limited ODE model ──────────────
def within_host_viral_dynamics(
    beta: float,
    delta: float,
    p: float,
    c: float,
    T0: float = 4e8,
    I0: float = 0.0,
    V0: float = 1e-3,
    t_end: float = 20.0,
    n_steps: int = 2001,
) -> dict:
    """Integrate the classic target-cell-limited within-host model (Nowak & May):

        dT/dt = -beta * T * V
        dI/dt =  beta * T * V - delta * I
        dV/dt =  p * I        - c * V

    With T0 target cells, the within-host basic reproductive number is

        R0 = beta * T0 * p / (delta * c).

    When R0 > 1 the viral load V(t) rises to a single peak then declines as
    target cells are depleted (acute-infection profile).

    KNOWN: R0 = beta*T0*p/(delta*c); for R0 > 1 the trajectory has exactly one
    interior peak (viral load rises then falls). Returns peak value/time and R0.

    Ref: Nowak & May (2000), Virus Dynamics.
    """
    t = np.linspace(0.0, t_end, n_steps)

    def deriv(y, _t):
        T, I, V = y
        return [
            -beta * T * V,
            beta * T * V - delta * I,
            p * I - c * V,
        ]

    sol = odeint(deriv, [T0, I0, V0], t, rtol=1e-9, atol=1e-9, mxstep=10000)
    T, I, V = sol[:, 0], sol[:, 1], sol[:, 2]
    R0 = beta * T0 * p / (delta * c)
    peak_idx = int(np.argmax(V))
    peak_V = float(V[peak_idx])
    peak_t = float(t[peak_idx])
    # a true interior peak rises then declines
    declines_after_peak = bool(V[-1] < peak_V) and 0 < peak_idx < n_steps - 1
    return {
        "t": t,
        "T": T,
        "I": I,
        "V": V,
        "R0": float(R0),
        "peak_viral_load": peak_V,
        "peak_time": peak_t,
        "has_interior_peak": declines_after_peak,
    }


# ── 2. Antibody-antigen binding affinity (Kd, fraction bound) ─────────────────
def antibody_binding_fraction(antigen_conc, Kd: float) -> dict:
    """Equilibrium 1:1 binding by the law of mass action. For antigen (ligand)
    concentration [Ag] and dissociation constant Kd,

        fraction_bound theta = [Ag] / ([Ag] + Kd).

    KNOWN: theta = 0.5 exactly when [Ag] = Kd (half-maximal binding at the Kd).
    Higher affinity = smaller Kd. Accepts a scalar or an array of concentrations.

    Ref: law of mass action (Clark 1926; standard receptor-occupancy theory).
    """
    if Kd <= 0:
        raise ValueError("Kd must be positive")
    ag = np.asarray(antigen_conc, dtype=float)
    theta = ag / (ag + Kd)
    return {
        "Kd": float(Kd),
        "antigen_conc": ag,
        "fraction_bound": theta if theta.ndim else float(theta),
        "fraction_bound_at_Kd": float(Kd / (Kd + Kd)),  # = 0.5 by construction
    }


# ── 3. Adaptive immune response: logistic effector-cell expansion ─────────────
def immune_response_logistic(
    r: float,
    K: float,
    N0: float,
    t_end: float = 20.0,
    n_steps: int = 2001,
) -> dict:
    """Logistic (Verhulst) growth of an activated effector-cell population:

        dN/dt = r * N * (1 - N/K),
        analytic solution N(t) = K / (1 + ((K - N0)/N0) * exp(-r t)).

    KNOWN: the growth-rate inflection occurs at N = K/2, at time
        t* = (1/r) * ln((K - N0)/N0); N(t) -> K as t -> infinity.

    Ref: Verhulst (1838); standard model of clonal effector expansion to a
    carrying-capacity-limited steady state.
    """
    if r <= 0 or K <= 0 or N0 <= 0:
        raise ValueError("r, K, N0 must be positive")
    t = np.linspace(0.0, t_end, n_steps)
    A = (K - N0) / N0
    N = K / (1.0 + A * np.exp(-r * t))
    t_inflect = math.log(A) / r if A > 0 else 0.0
    N_at_inflect = K / (1.0 + A * math.exp(-r * t_inflect))
    return {
        "t": t,
        "N": N,
        "carrying_capacity_K": float(K),
        "inflection_time": float(t_inflect),
        "N_at_inflection": float(N_at_inflect),  # = K/2
        "asymptote": float(N[-1]),
    }


# ── 4. Vaccine / herd-immunity threshold pc = 1 - 1/R0 ────────────────────────
def herd_immunity_threshold(R0: float) -> dict:
    """Critical vaccination / herd-immunity coverage to halt sustained
    transmission in a well-mixed population:

        pc = 1 - 1/R0   (requires R0 > 1).

    KNOWN: measles R0 = 15 -> pc = 1 - 1/15 = 0.9333... (~93%); R0 = 2 -> 0.5.

    Ref: Smith (1970); Fine (1993); Anderson & May (1991).
    """
    if R0 <= 1:
        raise ValueError("herd immunity threshold defined only for R0 > 1")
    pc = 1.0 - 1.0 / R0
    return {
        "R0": float(R0),
        "herd_immunity_threshold": float(pc),
        "herd_immunity_percent": float(pc * 100.0),
    }


# ── 5. Dose-response: Hill / LD50 / EC50 ──────────────────────────────────────
def dose_response_hill(
    dose, EC50: float, hill_n: float = 1.0, Emax: float = 1.0
) -> dict:
    """Hill sigmoidal dose-response curve:

        E(D) = Emax * D^n / (EC50^n + D^n).

    KNOWN: E = Emax/2 exactly at D = EC50 (the half-maximal effective dose),
    independent of the Hill coefficient n. For lethality this EC50 is the LD50.

    Ref: A. V. Hill (1910); standard pharmacological dose-response theory.
    """
    if EC50 <= 0 or Emax <= 0 or hill_n <= 0:
        raise ValueError("EC50, Emax, hill_n must be positive")
    d = np.asarray(dose, dtype=float)
    dn = np.power(d, hill_n)
    E = Emax * dn / (EC50 ** hill_n + dn)
    e_at_ec50 = Emax * (EC50 ** hill_n) / (EC50 ** hill_n + EC50 ** hill_n)
    return {
        "EC50": float(EC50),
        "hill_n": float(hill_n),
        "Emax": float(Emax),
        "dose": d,
        "effect": E if d.ndim else float(E),
        "effect_at_EC50": float(e_at_ec50),  # = Emax/2
    }


# ── 6. Neutralization titer (serial-dilution endpoint) ────────────────────────
def neutralization_titer(
    ic50: float, start_dilution: float = 1.0, fold: float = 2.0, n_dilutions: int = 12
) -> dict:
    """Compute the neutralizing endpoint titer from a serial-dilution series.

    A serum is serially diluted (start_dilution, *fold each step). The effective
    antibody "concentration" at dilution factor d is proportional to 1/d, and
    neutralization (>=50% effect) follows a 1:1 occupancy curve:

        neutralization(d) = (1/d) / (1/d + ic50)  >= 0.5  iff  1/d >= ic50.

    The titer (NT50) is the reciprocal of the greatest dilution still giving
    >= 50% neutralization.

    KNOWN: neutralization = 0.5 at the dilution where 1/d = ic50; the reported
    titer is the largest dilution factor d with 1/d >= ic50.

    Ref: standard plaque/microneutralization NT50 serology endpoint.
    """
    if ic50 <= 0 or start_dilution <= 0 or fold <= 1:
        raise ValueError("ic50>0, start_dilution>0, fold>1 required")
    dilutions = start_dilution * fold ** np.arange(n_dilutions, dtype=float)
    conc = 1.0 / dilutions
    neut = conc / (conc + ic50)
    protective = neut >= 0.5
    if protective.any():
        titer = float(dilutions[protective].max())
    else:
        titer = 0.0
    return {
        "ic50": float(ic50),
        "dilutions": dilutions,
        "neutralization": neut,
        "titer": titer,
        "half_neut_dilution": float(1.0 / ic50),  # 1/d = ic50 => neut = 0.5
    }


# ── 7. Epidemic final-size relation 1 - Z = exp(-R0 Z) ────────────────────────
def epidemic_final_size(R0: float) -> dict:
    """Solve the Kermack-McKendrick SIR final-size relation for the attack rate Z
    (fraction of the population eventually infected):

        1 - Z = exp(-R0 * Z),   unique Z in (0,1) when R0 > 1.

    KNOWN: R0 = 2 -> Z ~ 0.7968 (the implicit equation residual is ~0).

    Ref: Kermack & McKendrick (1927); Ma & Earn (2006).
    """
    if R0 <= 1:
        return {"R0": float(R0), "final_size": 0.0, "residual": 0.0}
    f = lambda Z: 1.0 - Z - math.exp(-R0 * Z)
    Z = brentq(f, 1e-12, 1.0 - 1e-12, xtol=1e-14)
    return {
        "R0": float(R0),
        "final_size": float(Z),
        "residual": float(1.0 - Z - math.exp(-R0 * Z)),
    }


# ── 8. Clonal selection: exponential T-/B-cell clonal expansion ───────────────
def clonal_expansion(
    N0: float, doubling_time: float, t_end: float, n_steps: int = 1001
) -> dict:
    """Exponential clonal expansion of an antigen-selected lymphocyte clone
    (clonal-selection theory). With doubling time td,

        N(t) = N0 * 2^(t / td),   equivalently N(t) = N0 * exp(r t), r = ln2/td.

    KNOWN: after exactly one doubling time the population doubles
        (N(td) = 2 N0); after k doubling times N = N0 * 2^k.

    Ref: Burnet (1957) clonal-selection theory.
    """
    if N0 <= 0 or doubling_time <= 0:
        raise ValueError("N0 and doubling_time must be positive")
    t = np.linspace(0.0, t_end, n_steps)
    r = math.log(2.0) / doubling_time
    N = N0 * np.exp(r * t)
    return {
        "t": t,
        "N": N,
        "growth_rate": float(r),
        "doubling_time": float(doubling_time),
        "N_final": float(N[-1]),
        "fold_expansion": float(N[-1] / N0),
    }


# ── Route table: keyword tuple -> function ────────────────────────────────────
ROUTE_TABLE = {
    ("viral_dynamic", "virolog", "within_host", "target_cell"): within_host_viral_dynamics,
    ("antibody", "binding", "affinity", "kd", "antigen"): antibody_binding_fraction,
    ("immune", "effector", "logistic", "immunolog"): immune_response_logistic,
    ("herd_immunity", "vaccine", "vaccination", "threshold"): herd_immunity_threshold,
    ("ld50", "ec50", "dose_response", "hill", "toxicol"): dose_response_hill,
    ("neutraliz", "titer", "serolog"): neutralization_titer,
    ("final_size", "epidemic", "attack_rate"): epidemic_final_size,
    ("tcell", "t_cell", "clonal", "clone", "expansion"): clonal_expansion,
}


def route(keyword: str):
    """Map a free-text keyword to the appropriate method. Matches if any tuple
    key contains the (lower-cased) keyword as a substring of one of its tokens
    or vice versa. Returns the function or None."""
    kw = keyword.lower().strip()
    for keys, fn in ROUTE_TABLE.items():
        for k in keys:
            if k in kw or kw in k:
                return fn
    return None
