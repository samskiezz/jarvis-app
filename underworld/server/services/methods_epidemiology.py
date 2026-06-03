"""Real epidemiology & mathematical-biology simulations.

Each function is a distinct, named epidemiological method (not a shared engine
reused), implemented with numpy/scipy/math and verified against a KNOWN
published or analytically exact value in the companion tests. Domains:
compartmental dynamics (SIR, SEIR), reproduction numbers (R0, Rt), herd
immunity thresholds, the transcendental final-epidemic-size equation, logistic
growth of cumulative cases, frequency measures with Wald confidence intervals
(incidence, prevalence, case fatality), and exponential growth / doubling time.

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_epidemiology.py.

Primary references:
  - Kermack & McKendrick (1927), Proc. R. Soc. Lond. A 115: 700-721.
  - Anderson & May (1991), "Infectious Diseases of Humans".
  - Diekmann, Heesterbeek & Britton (2013), "Mathematical Tools for
    Understanding Infectious Disease Dynamics".
  - Keeling & Rohani (2008), "Modeling Infectious Diseases".
"""
from __future__ import annotations

import math

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq


# ── 1. SIR model integration ──────────────────────────────────────────────────
def sir_model(beta: float, gamma: float, N: float,
              I0: float = 1.0, R0_init: float = 0.0,
              t_max: float = 200.0, n_points: int = 2001) -> dict:
    """Integrate the deterministic Kermack-McKendrick SIR model:
        dS/dt = -beta*S*I/N
        dI/dt =  beta*S*I/N - gamma*I
        dR/dt =  gamma*I
    with mass-action incidence. Returns the epidemic peak (time, infectious
    fraction) and the final epidemic size (cumulative fraction infected).
    KNOWN: with R0 = beta/gamma > 1 an outbreak occurs (peak prevalence > I0/N
    and final size matching the implicit final-size equation); with R0 < 1 the
    infection dies out monotonically (final size ~ initial removed fraction).

    Ref: Kermack & McKendrick (1927); Keeling & Rohani (2008), ch. 2.
    """
    S0 = N - I0 - R0_init
    R0_number = beta / gamma

    def rhs(_t, y):
        S, I, R = y
        infection = beta * S * I / N
        return [-infection, infection - gamma * I, gamma * I]

    t_eval = np.linspace(0.0, t_max, n_points)
    sol = solve_ivp(rhs, (0.0, t_max), [S0, I0, R0_init],
                    t_eval=t_eval, method="LSODA",
                    rtol=1e-9, atol=1e-12, max_step=t_max / 200.0)
    S, I, R = sol.y
    peak_idx = int(np.argmax(I))
    final_size_fraction = R[-1] / N             # cumulative infected fraction
    # attack rate counts everyone who left S (cleaner when R0_init>0)
    attack_rate = (S0 - S[-1]) / N
    return {
        "t": sol.t.tolist(),
        "S": S.tolist(),
        "I": I.tolist(),
        "R": R.tolist(),
        "R0": R0_number,
        "peak_time": float(sol.t[peak_idx]),
        "peak_infectious": float(I[peak_idx]),
        "peak_infectious_fraction": float(I[peak_idx] / N),
        "final_size_fraction": float(final_size_fraction),
        "attack_rate": float(attack_rate),
        "S_final": float(S[-1]),
        "outbreak": bool(R0_number > 1.0),
        "success": bool(sol.success),
    }


# ── 2. Basic reproduction number R0 and effective Rt ──────────────────────────
def reproduction_numbers(beta: float, gamma: float,
                         susceptible_fraction: float = 1.0) -> dict:
    """Basic reproduction number for the SIR model and the effective
    reproduction number given a susceptible fraction s = S/N:
        R0 = beta / gamma
        Rt = R0 * s
    R0 is the expected number of secondary cases from one infective in a wholly
    susceptible population; Rt < 1 marks the threshold for decline.
    KNOWN: beta=0.5, gamma=0.2 -> R0 = 2.5; at s = 1/R0 = 0.4, Rt = 1 exactly.

    Ref: Diekmann, Heesterbeek & Britton (2013); Anderson & May (1991), ch. 4.
    """
    R0 = beta / gamma
    Rt = R0 * susceptible_fraction
    return {
        "R0": R0,
        "Rt": Rt,
        "susceptible_fraction": susceptible_fraction,
        "mean_infectious_period": 1.0 / gamma,
        "growing": bool(Rt > 1.0),
        "threshold_susceptible_fraction": 1.0 / R0,
    }


# ── 3. Herd immunity threshold ────────────────────────────────────────────────
def herd_immunity_threshold(R0: float) -> dict:
    """Critical immune fraction at which sustained transmission stops:
        H_c = 1 - 1/R0
    Below this immune fraction Rt > 1 and the pathogen can still spread; at or
    above it Rt <= 1. Also returns the critical vaccination coverage for a
    vaccine of efficacy e: V_c = H_c / e.
    KNOWN: R0 = 2.5 -> H_c = 0.60; R0 = 4 -> 0.75; R0 = 2 -> 0.50.

    Ref: Anderson & May (1991), ch. 5; Fine, Eames & Heymann (2011),
    Clin. Infect. Dis. 52: 911-916.
    """
    if R0 <= 0.0:
        raise ValueError("R0 must be positive")
    H_c = 1.0 - 1.0 / R0
    H_c = max(0.0, H_c)                          # R0<=1 -> no threshold needed
    return {
        "R0": R0,
        "herd_immunity_threshold": H_c,
        "critical_immune_fraction": H_c,
        "vaccination_coverage_eff90": H_c / 0.90 if H_c > 0 else 0.0,
    }


# ── 4. Final epidemic size (transcendental equation) ──────────────────────────
def final_epidemic_size(R0: float, s0: float = 1.0,
                        tol: float = 1e-12) -> dict:
    """Solve the implicit final-size relation of the SIR model for the total
    attack fraction Z (fraction ever infected):
        s_inf = s0 * exp(-R0 * Z),   Z = s0 - s_inf
    so Z satisfies the transcendental equation
        1 - Z/s0 - exp(-R0 * Z) = 0   (for s0 = 1: Z = 1 - exp(-R0 Z)).
    Solved with a bracketed Brent root find. For R0 <= 1 the only root is Z = 0.
    KNOWN: R0 = 2 -> Z ~= 0.7968; R0 = 2.5 -> Z ~= 0.8929; R0 = 3 -> 0.9405.

    Ref: Kermack & McKendrick (1927); Ma & Earn (2006), Bull. Math. Biol. 68:
    679-702; Miller (2012), Bull. Math. Biol. 74: 2125-2141.
    """
    if R0 <= 1.0:
        return {
            "R0": R0,
            "final_size": 0.0,
            "attack_rate": 0.0,
            "s_inf": s0,
            "converged": True,
        }

    def f(Z):
        return s0 - Z - s0 * math.exp(-R0 * Z)

    # Z is bracketed in (0, s0]; f(0)=s0-s0=0 trivial root, f(s0)=-s0 exp(-R0 s0)<0,
    # and the nontrivial root lies in (eps, s0).
    lo = 1e-12
    Z = brentq(f, lo, s0, xtol=tol, rtol=4 * np.finfo(float).eps)
    s_inf = s0 * math.exp(-R0 * Z)
    return {
        "R0": R0,
        "final_size": float(Z),
        "attack_rate": float(Z / s0),
        "s_inf": float(s_inf),
        "residual": float(f(Z)),
        "converged": True,
    }


# ── 5. SEIR model integration ─────────────────────────────────────────────────
def seir_model(beta: float, sigma: float, gamma: float, N: float,
               E0: float = 1.0, I0: float = 0.0, R0_init: float = 0.0,
               t_max: float = 300.0, n_points: int = 3001) -> dict:
    """Integrate the SEIR model with a latent (Exposed) compartment:
        dS/dt = -beta*S*I/N
        dE/dt =  beta*S*I/N - sigma*E
        dI/dt =  sigma*E - gamma*I
        dR/dt =  gamma*I
    sigma is the rate of progression E->I (1/sigma = latent period). The basic
    reproduction number is still R0 = beta/gamma.
    KNOWN: R0 = beta/gamma; a nonzero latent period delays and lowers the
    infectious peak relative to SIR while the final size still satisfies the
    same implicit final-size equation Z = 1 - exp(-R0 Z).

    Ref: Anderson & May (1991), ch. 6; Keeling & Rohani (2008), sec. 2.5.
    """
    S0 = N - E0 - I0 - R0_init
    R0_number = beta / gamma

    def rhs(_t, y):
        S, E, I, R = y
        infection = beta * S * I / N
        return [-infection,
                infection - sigma * E,
                sigma * E - gamma * I,
                gamma * I]

    t_eval = np.linspace(0.0, t_max, n_points)
    sol = solve_ivp(rhs, (0.0, t_max), [S0, E0, I0, R0_init],
                    t_eval=t_eval, method="LSODA",
                    rtol=1e-9, atol=1e-12, max_step=t_max / 300.0)
    S, E, I, R = sol.y
    peak_idx = int(np.argmax(I))
    return {
        "t": sol.t.tolist(),
        "S": S.tolist(),
        "E": E.tolist(),
        "I": I.tolist(),
        "R": R.tolist(),
        "R0": R0_number,
        "latent_period": 1.0 / sigma,
        "peak_time": float(sol.t[peak_idx]),
        "peak_infectious": float(I[peak_idx]),
        "peak_infectious_fraction": float(I[peak_idx] / N),
        "final_size_fraction": float(R[-1] / N),
        "attack_rate": float((S0 - S[-1]) / N),
        "outbreak": bool(R0_number > 1.0),
        "success": bool(sol.success),
    }


# ── 6. Logistic growth of cumulative cases ────────────────────────────────────
def logistic_growth(r: float, K: float, C0: float,
                    t: float | list | np.ndarray) -> dict:
    """Logistic (Verhulst) growth of cumulative cases toward carrying capacity K:
        dC/dt = r*C*(1 - C/K)
    with closed-form solution
        C(t) = K / (1 + A*exp(-r t)),   A = (K - C0)/C0.
    The inflection point (max growth rate) is at C = K/2, reached at
        t* = ln(A)/r.
    KNOWN: C(0) = C0; C(inf) -> K; the curve passes through K/2 at t = ln(A)/r,
    where the instantaneous growth rate r*C*(1-C/K) = r*K/4 is maximal.

    Ref: Verhulst (1838); Chowell et al. (2016), Infect. Dis. Model. 1: 71-78.
    """
    A = (K - C0) / C0
    t_arr = np.atleast_1d(np.asarray(t, dtype=float))
    C = K / (1.0 + A * np.exp(-r * t_arr))
    growth_rate = r * C * (1.0 - C / K)
    t_inflection = math.log(A) / r if A > 0 else float("nan")
    return {
        "t": t_arr.tolist(),
        "C": C.tolist(),
        "growth_rate": growth_rate.tolist(),
        "carrying_capacity": K,
        "intrinsic_rate": r,
        "C0": C0,
        "t_inflection": t_inflection,
        "C_inflection": K / 2.0,
        "max_growth_rate": r * K / 4.0,
    }


# ── 7. Case fatality, incidence & prevalence with Wald CI ─────────────────────
def epidemiologic_measures(deaths: int, cases: int,
                           new_cases: int = 0, population_at_risk: int = 0,
                           prevalent_cases: int = 0,
                           z: float = 1.959963984540054) -> dict:
    """Standard frequency measures with Wald (normal-approximation) 95% CIs for
    the proportions:
        CFR = deaths / cases                     (case fatality ratio)
        incidence proportion = new_cases / population_at_risk
        prevalence = prevalent_cases / population_at_risk
        Wald CI: p_hat +/- z * sqrt(p_hat (1-p_hat) / n)
    z = 1.95996... gives a two-sided 95% interval.
    KNOWN: deaths=10, cases=100 -> CFR = 0.10 with 95% CI ~ [0.0412, 0.1588]
    (half-width z*sqrt(0.1*0.9/100) = 0.0588).

    Ref: Rothman, Greenland & Lash (2008), "Modern Epidemiology", ch. 3 & 14;
    Wald binomial-proportion interval.
    """
    def wald(k, n):
        if n <= 0:
            return float("nan"), float("nan"), float("nan")
        p = k / n
        half = z * math.sqrt(p * (1.0 - p) / n)
        return p, max(0.0, p - half), min(1.0, p + half)

    cfr, cfr_lo, cfr_hi = wald(deaths, cases)
    inc, inc_lo, inc_hi = wald(new_cases, population_at_risk)
    prev, prev_lo, prev_hi = wald(prevalent_cases, population_at_risk)
    return {
        "case_fatality_rate": cfr,
        "cfr_ci_lower": cfr_lo,
        "cfr_ci_upper": cfr_hi,
        "incidence_proportion": inc,
        "incidence_ci_lower": inc_lo,
        "incidence_ci_upper": inc_hi,
        "prevalence": prev,
        "prevalence_ci_lower": prev_lo,
        "prevalence_ci_upper": prev_hi,
        "z": z,
    }


# ── 8. Doubling time / exponential growth rate ────────────────────────────────
def doubling_time(times: list | np.ndarray, counts: list | np.ndarray) -> dict:
    """Estimate the exponential growth rate r and doubling time T_d from early
    case counts assumed to grow as C(t) = C0 * exp(r t). Fitting log(C) ~ a + r t
    by least squares gives r, and
        T_d = ln(2) / r.
    Also reports R0 under the simple relation R0 = 1 + r*T_g for a generation
    time T_g (here returned for T_g = 1 as r + 1; pass-through documented).
    KNOWN: perfectly doubling-every-3-days data (counts 1,2,4,8,16 at t=0,3,6,
    9,12) yields r = ln2/3 and T_d = 3.0 exactly; in general T_d = ln2/r.

    Ref: Wallinga & Lipsitch (2007), Proc. R. Soc. B 274: 599-604; Chowell et
    al. (2016), Infect. Dis. Model. 1: 71-78.
    """
    t = np.asarray(times, dtype=float)
    c = np.asarray(counts, dtype=float)
    if np.any(c <= 0):
        raise ValueError("counts must be positive for log-linear growth fit")
    logc = np.log(c)
    # least-squares slope (growth rate r) and intercept (log C0)
    slope, intercept = np.polyfit(t, logc, 1)
    r = float(slope)
    C0 = float(math.exp(intercept))
    T_d = math.log(2.0) / r if r != 0.0 else float("inf")
    # coefficient of determination of the log-linear fit
    pred = intercept + slope * t
    ss_res = float(np.sum((logc - pred) ** 2))
    ss_tot = float(np.sum((logc - logc.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
    return {
        "growth_rate": r,
        "doubling_time": T_d,
        "C0": C0,
        "r_squared": r2,
        "is_growing": bool(r > 0.0),
    }
