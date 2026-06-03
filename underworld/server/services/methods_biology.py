"""Real, named biology simulation methods (feature category: biology).

Each function implements a genuine, textbook biology model and returns a dict.
All are checkable against KNOWN analytic / textbook values:

  1. wright_fisher_drift     — neutral fixation probability == initial freq p0
  2. lotka_volterra          — predator-prey ODE: coexistence equilibrium + cycles
  3. michaelis_menten        — enzyme kinetics: v == Vmax/2 at [S] == Km
  4. logistic_growth         — population N(t) -> carrying capacity K
  5. seir_epidemic           — SEIR ODE: R0 == beta/gamma, threshold at R0 == 1
  6. one_compartment_pk      — drug elimination: t_half == ln(2)/k
  7. hardy_weinberg          — genotype freqs: p^2 + 2pq + q^2 == 1
  8. jukes_cantor_distance   — phylogenetics: d == -3/4 ln(1 - 4/3 p)

Uses numpy/scipy. No external state.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.integrate import odeint


def wright_fisher_drift(
    *, p0: float, pop_size: int, n_replicates: int = 2000,
    max_generations: int = 5000, seed: int = 0,
) -> dict:
    """Wright-Fisher neutral genetic drift (haploid, 2N gene copies).

    Each generation draws the next allele count via Binomial(2N, p). Under
    neutrality, the probability that allele A reaches fixation equals its
    initial frequency p0 (Kimura). We estimate it by Monte Carlo and also
    return the per-locus heterozygosity decay rate 1/(2N).
    """
    rng = np.random.default_rng(seed)
    genes = 2 * pop_size
    fixed = 0
    lost = 0
    counted = 0
    for _ in range(n_replicates):
        count = int(round(p0 * genes))
        for _g in range(max_generations):
            count = int(rng.binomial(genes, count / genes))
            if count == 0:
                lost += 1
                counted += 1
                break
            if count == genes:
                fixed += 1
                counted += 1
                break
    fix_prob = fixed / counted if counted else float("nan")
    return {
        "p0": p0,
        "pop_size": pop_size,
        "genes": genes,
        "n_replicates": n_replicates,
        "fixation_probability": round(fix_prob, 4),
        "expected_fixation_probability": round(p0, 6),
        "loss_probability": round(lost / counted, 4) if counted else float("nan"),
        "heterozygosity_decay_per_gen": round(1.0 / genes, 6),
        "all_resolved": counted == n_replicates,
    }


def lotka_volterra(
    *, alpha: float, beta: float, delta: float, gamma: float,
    prey0: float, pred0: float, t_max: float = 200.0, n_points: int = 4000,
) -> dict:
    """Lotka-Volterra predator-prey ODE.

        dx/dt = alpha*x - beta*x*y      (prey)
        dy/dt = delta*x*y - gamma*y     (predator)

    Nontrivial coexistence equilibrium: x* = gamma/delta, y* = alpha/beta.
    Solutions are closed orbits; the conserved quantity
        V = delta*x - gamma*ln(x) + beta*y - alpha*ln(y)
    is invariant along trajectories.
    """
    def deriv(state, _t):
        x, y = state
        return [alpha * x - beta * x * y, delta * x * y - gamma * y]

    t = np.linspace(0, t_max, n_points)
    sol = odeint(deriv, [prey0, pred0], t)
    prey = sol[:, 0]
    pred = sol[:, 1]

    x_eq = gamma / delta
    y_eq = alpha / beta

    def conserved(x, y):
        return delta * x - gamma * np.log(x) + beta * y - alpha * np.log(y)

    V = conserved(prey, pred)
    V0 = conserved(prey0, pred0)
    # detect oscillation: prey returns near its start after some excursion
    excursion = float(prey.max() - prey.min())
    return {
        "prey_equilibrium": round(x_eq, 6),
        "pred_equilibrium": round(y_eq, 6),
        "conserved_initial": round(float(V0), 6),
        "conserved_drift": round(float(np.max(np.abs(V - V0))), 6),
        "prey_min": round(float(prey.min()), 6),
        "prey_max": round(float(prey.max()), 6),
        "pred_min": round(float(pred.min()), 6),
        "pred_max": round(float(pred.max()), 6),
        "oscillates": bool(excursion > 1e-3),
        "coexists": bool(prey.min() > 0 and pred.min() > 0),
    }


def michaelis_menten(*, vmax: float, km: float, substrate) -> dict:
    """Michaelis-Menten enzyme kinetics: v = Vmax*[S] / (Km + [S]).

    KNOWN: at [S] == Km the reaction rate is exactly half of Vmax.
    """
    S = np.asarray(substrate, dtype=float)
    v = vmax * S / (km + S)
    v_at_km = vmax * km / (km + km)
    return {
        "vmax": vmax,
        "km": km,
        "substrate": S.tolist(),
        "velocity": [round(float(x), 8) for x in np.atleast_1d(v)],
        "v_at_km": round(float(v_at_km), 8),
        "half_vmax": round(vmax / 2.0, 8),
        "v_at_km_equals_half_vmax": bool(abs(v_at_km - vmax / 2.0) < 1e-9),
    }


def logistic_growth(
    *, r: float, K: float, N0: float, t_max: float = 100.0, n_points: int = 2000,
) -> dict:
    """Logistic population growth: dN/dt = r*N*(1 - N/K).

    Analytic solution N(t) = K / (1 + ((K-N0)/N0) e^{-rt}).
    KNOWN: as t -> infinity, N -> K (carrying capacity), provided N0 > 0.
    """
    t = np.linspace(0, t_max, n_points)
    A = (K - N0) / N0
    N = K / (1.0 + A * np.exp(-r * t))
    return {
        "r": r,
        "carrying_capacity": K,
        "N0": N0,
        "N_final": round(float(N[-1]), 6),
        "approaches_K": bool(abs(N[-1] - K) < 1e-3 * K),
        "inflection_N": round(K / 2.0, 6),
        "monotonic": bool(np.all(np.diff(N) >= -1e-12) if N0 < K else True),
    }


def seir_epidemic(
    *, beta: float, sigma: float, gamma: float,
    S0: float = 0.999, E0: float = 0.0, I0: float = 0.001, R0_pop: float = 0.0,
    t_max: float = 200.0, n_points: int = 4000,
) -> dict:
    """SEIR epidemic ODE (frequency form, S+E+I+R = 1).

        dS/dt = -beta*S*I
        dE/dt =  beta*S*I - sigma*E
        dI/dt =  sigma*E   - gamma*I
        dR/dt =  gamma*I

    KNOWN: basic reproduction number R0 = beta/gamma. The infection grows
    (epidemic) only when R0 > 1; if R0 < 1 the infected fraction decays.
    """
    def deriv(state, _t):
        S, E, I, R = state
        return [
            -beta * S * I,
            beta * S * I - sigma * E,
            sigma * E - gamma * I,
            gamma * I,
        ]

    t = np.linspace(0, t_max, n_points)
    sol = odeint(deriv, [S0, E0, I0, R0_pop], t)
    S, E, I, R = sol.T
    R0 = beta / gamma
    peak_I = float(I.max())
    grew = bool(peak_I > I0 * 1.0001)
    return {
        "R0": round(R0, 6),
        "above_threshold": bool(R0 > 1.0),
        "peak_infected": round(peak_I, 6),
        "final_susceptible": round(float(S[-1]), 6),
        "final_recovered": round(float(R[-1]), 6),
        "epidemic_occurs": grew,
        "threshold_consistent": bool(grew == (R0 > 1.0)),
    }


def one_compartment_pk(
    *, dose: float, volume: float, k_elim: float,
    t_max: float = 48.0, n_points: int = 2000,
) -> dict:
    """One-compartment IV-bolus pharmacokinetics: C(t) = C0 * e^{-k*t}.

    C0 = dose/volume. First-order elimination rate constant k_elim.
    KNOWN: elimination half-life t_half = ln(2) / k_elim; concentration
    halves every t_half (e.g. C(t_half) == C0/2).
    """
    C0 = dose / volume
    t = np.linspace(0, t_max, n_points)
    C = C0 * np.exp(-k_elim * t)
    t_half = math.log(2.0) / k_elim
    c_at_half = C0 * math.exp(-k_elim * t_half)
    auc_inf = C0 / k_elim  # integral 0..inf of C dt
    clearance = k_elim * volume
    return {
        "C0": round(C0, 8),
        "k_elim": k_elim,
        "half_life": round(t_half, 8),
        "C_at_half_life": round(c_at_half, 8),
        "half_life_halves_conc": bool(abs(c_at_half - C0 / 2.0) < 1e-9),
        "AUC_inf": round(auc_inf, 8),
        "clearance": round(clearance, 8),
        "C_final": round(float(C[-1]), 10),
    }


def hardy_weinberg(*, p: float) -> dict:
    """Hardy-Weinberg equilibrium for a biallelic locus.

    q = 1 - p; genotype frequencies AA = p^2, Aa = 2pq, aa = q^2.
    KNOWN: p^2 + 2pq + q^2 == (p + q)^2 == 1.
    """
    q = 1.0 - p
    f_AA = p * p
    f_Aa = 2.0 * p * q
    f_aa = q * q
    total = f_AA + f_Aa + f_aa
    return {
        "p": p,
        "q": round(q, 8),
        "AA": round(f_AA, 8),
        "Aa": round(f_Aa, 8),
        "aa": round(f_aa, 8),
        "total": round(total, 10),
        "sums_to_one": bool(abs(total - 1.0) < 1e-12),
    }


def jukes_cantor_distance(*, p_diff: float = None, seq1: str = None, seq2: str = None) -> dict:
    """Jukes-Cantor (1969) phylogenetic distance correction.

    d = -3/4 * ln(1 - 4/3 * p), where p is the proportion of differing
    (mismatched) sites between two aligned DNA sequences.
    KNOWN: d >= p (correction inflates the raw p-distance for multiple hits),
    and d -> infinity as p -> 3/4 (saturation).
    """
    if p_diff is None:
        if seq1 is None or seq2 is None or len(seq1) != len(seq2) or not seq1:
            raise ValueError("provide p_diff, or two aligned non-empty sequences")
        mismatches = sum(1 for a, b in zip(seq1, seq2) if a != b)
        p_diff = mismatches / len(seq1)
    if not (0.0 <= p_diff < 0.75):
        raise ValueError("p_diff must be in [0, 0.75) for a finite JC distance")
    d = -0.75 * math.log(1.0 - (4.0 / 3.0) * p_diff)
    return {
        "p_diff": round(p_diff, 8),
        "jc_distance": round(d, 8),
        "correction_exceeds_pdistance": bool(d >= p_diff - 1e-12),
    }
