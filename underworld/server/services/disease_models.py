"""Real disease / epidemiology & cure-discovery models (feature category T).

Genuine epidemiology + pharmacology (numpy), checkable against theory:
  * SIR/SEIR dynamics, R0, herd-immunity threshold, epidemic peak
  * pathogen mutation/resistance, dose-response (Hill/EC50), drug perturbation
  * gene knockout/knockdown/overexpression effects, therapy candidate scoring
"""
from __future__ import annotations

import math

import numpy as np


def r0(*, beta: float, gamma: float) -> float:
    """Basic reproduction number R0 = β/γ."""
    return beta / gamma if gamma > 0 else math.inf


def herd_immunity_threshold(r0_value: float) -> float:
    """Fraction that must be immune to stop spread: 1 − 1/R0."""
    return round(1 - 1 / r0_value, 6) if r0_value > 1 else 0.0


def sir_simulate(*, s0: float, i0: float, beta: float, gamma: float,
                 steps: int = 160, dt: float = 1.0) -> dict:
    """Euler-integrate the SIR ODEs; report the epidemic peak and final size."""
    s, i, r = s0, i0, 0.0
    n = s0 + i0
    peak_i, peak_t = i0, 0
    for t in range(steps):
        ds = -beta * s * i / n
        di = beta * s * i / n - gamma * i
        dr = gamma * i
        s += ds * dt; i += di * dt; r += dr * dt
        s, i, r = max(0.0, s), max(0.0, i), max(0.0, r)
        if i > peak_i:
            peak_i, peak_t = i, t
    return {"peak_infected": round(peak_i, 4), "peak_time": peak_t,
            "final_recovered": round(r, 4), "epidemic": r0(beta=beta, gamma=gamma) > 1}


def seir_step(state: dict, *, beta: float, sigma: float, gamma: float, dt: float = 1.0) -> dict:
    """One SEIR step (adds an exposed/latent compartment)."""
    s, e, i, r = state["S"], state["E"], state["I"], state["R"]
    n = s + e + i + r
    ds = -beta * s * i / n
    de = beta * s * i / n - sigma * e
    di = sigma * e - gamma * i
    dr = gamma * i
    return {"S": max(0.0, s + ds * dt), "E": max(0.0, e + de * dt),
            "I": max(0.0, i + di * dt), "R": max(0.0, r + dr * dt)}


def pathogen_resistance(*, generations: int, mutation_rate: float,
                        drug_pressure: float, pop: float = 1e9) -> dict:
    """Emergence of drug resistance: expected resistant fraction after selection
    under drug pressure (real mutation-selection model)."""
    resistant = 1 - (1 - mutation_rate) ** generations
    resistant = min(1.0, resistant * (1 + drug_pressure))
    return {"resistant_fraction": round(resistant, 8),
            "resistant_count": round(resistant * pop, 1),
            "treatment_failure_risk": resistant > 1e-3}


def dose_response(*, dose: float, ec50: float, hill: float = 1.0) -> float:
    """Hill dose–response: effect = dose^h / (EC50^h + dose^h)."""
    d = dose ** hill
    return round(d / (ec50 ** hill + d), 6) if (ec50 ** hill + d) > 0 else 0.0


def therapeutic_index(*, ld50: float, ed50: float) -> dict:
    """Therapeutic index TI = LD50/ED50 (drug safety margin)."""
    ti = ld50 / ed50 if ed50 > 0 else math.inf
    return {"therapeutic_index": round(ti, 3), "safe_margin": ti > 10}


def drug_perturbation(baseline: dict[str, float], targets: dict[str, float]) -> dict:
    """Perturb a pathway's node activities by a drug's target effects; report the
    largest downstream shift."""
    perturbed = {k: round(v * targets.get(k, 1.0), 6) for k, v in baseline.items()}
    shifts = {k: round(perturbed[k] - baseline[k], 6) for k in baseline}
    biggest = min(shifts, key=shifts.get) if shifts else None
    return {"perturbed": perturbed, "shifts": shifts, "largest_effect": biggest}


def _propagate(expression: dict[str, float], source: str, new_value: float,
               network: dict[str, dict[str, float]] | None, *, hops: int = 3,
               decay: float = 0.6) -> tuple[dict[str, float], dict[str, float]]:
    """Apply a perturbation to `source` and ripple it through a gene-regulatory
    network: each downstream gene shifts by (weight × upstream Δ), decaying per
    hop, for `hops` levels. weight ∈ [-1,1] (+ activator, − repressor). Returns
    the new expression dict and the per-gene downstream shifts."""
    out = dict(expression)
    delta0 = new_value - float(out.get(source, 0.0))
    out[source] = round(new_value, 6)
    shifts: dict[str, float] = {}
    if not network:
        return out, shifts
    # breadth-first ripple with decay, accumulating effects, guarding cycles
    frontier = [(source, delta0)]
    for _ in range(hops):
        nxt: list[tuple[str, float]] = []
        for node, d in frontier:
            for downstream, w in (network.get(node) or {}).items():
                eff = w * d * decay
                if abs(eff) < 1e-4:
                    continue
                cur = float(out.get(downstream, 0.0))
                new = max(0.0, cur + eff)         # expression can't go negative
                out[downstream] = round(new, 6)
                shifts[downstream] = round(shifts.get(downstream, 0.0) + (new - cur), 6)
                nxt.append((downstream, new - cur))
        if not nxt:
            break
        frontier = nxt
    return out, shifts


def gene_knockout(expression: dict[str, float], gene: str, *,
                  network: dict[str, dict[str, float]] | None = None) -> dict:
    """Knockout: set a gene's expression to zero. If a regulatory `network` is
    given, the perturbation propagates to downstream genes scaled by their
    dependence (multi-hop, decaying); otherwise only the target gene changes."""
    out, shifts = _propagate(expression, gene, 0.0, network)
    return {"expression": out, "knocked_out": gene, "downstream_shifts": shifts,
            "downstream_affected": len(shifts)}


def gene_knockdown(expression: dict[str, float], gene: str, *, fraction: float = 0.5,
                   network: dict[str, dict[str, float]] | None = None) -> dict:
    """Knockdown: partially reduce a gene's expression; with a regulatory
    `network`, the reduction propagates to downstream genes by their dependence."""
    new_val = float(expression.get(gene, 0.0)) * (1 - fraction)
    out, shifts = _propagate(expression, gene, new_val, network)
    return {"expression": out, "knockdown_gene": gene, "fraction": fraction,
            "downstream_shifts": shifts, "downstream_affected": len(shifts)}


def overexpression(expression: dict[str, float], gene: str, *, fold: float = 5.0,
                   network: dict[str, dict[str, float]] | None = None) -> dict:
    """Overexpression: amplify a gene's expression; with a regulatory `network`,
    the increase propagates to downstream genes scaled by their dependence."""
    new_val = float(expression.get(gene, 1.0)) * fold
    out, shifts = _propagate(expression, gene, new_val, network)
    return {"expression": out, "overexpressed_gene": gene, "fold": fold,
            "downstream_shifts": shifts, "downstream_affected": len(shifts)}


def therapy_candidate_score(*, efficacy: float, safety: float, deliverability: float) -> dict:
    """Score a therapy candidate (geometric mean of efficacy/safety/delivery)."""
    score = (max(0, efficacy) * max(0, safety) * max(0, deliverability)) ** (1 / 3)
    return {"score": round(score, 4), "promising": score > 0.6,
            "disclaimer": "In-silico score; requires wet-lab + clinical validation."}


# ── canonical-named feature entry points (real dynamics) ─────────────────────
def symptom_clustering(patients: list[list[float]], *, k: int = 2) -> dict:
    """Symptom-clustering engine: k-means over patient symptom vectors (real
    unsupervised clustering)."""
    from sklearn.cluster import KMeans
    X = np.array(patients, float)
    if X.shape[0] < k:
        return {"clusters": [0] * X.shape[0], "k": k}
    km = KMeans(n_clusters=k, n_init=10, random_state=0).fit(X)
    return {"clusters": [int(c) for c in km.labels_], "k": k,
            "inertia": round(float(km.inertia_), 4)}


def pathway_disruption(baseline: dict[str, float], knockouts: list[str]) -> dict:
    """Pathway-disruption model: zero out knocked genes, report fraction of the
    pathway's total activity lost."""
    total = sum(baseline.values()) or 1.0
    lost = sum(baseline.get(g, 0.0) for g in knockouts)
    return {"fraction_disrupted": round(lost / total, 4), "knockouts": knockouts}


def immune_response(*, pathogen0: float, immune0: float, steps: int = 50,
                    growth: float = 0.4, kill: float = 0.01, recruit: float = 0.02,
                    decay: float = 0.05) -> dict:
    """Immune-response model: predator–prey (Lotka–Volterra) dynamics between
    pathogen and immune cells."""
    p, m = pathogen0, immune0
    peak = p
    for _ in range(steps):
        dp = growth * p - kill * p * m
        dm = recruit * p * m - decay * m
        p = max(0.0, p + dp); m = max(0.0, m + dm)
        peak = max(peak, p)
    return {"final_pathogen": round(p, 4), "final_immune": round(m, 4),
            "peak_pathogen": round(peak, 4), "cleared": p < 1.0}


def pathogen_evolution(*, generations: int, mutation_rate: float, selection: float = 1.0) -> dict:
    """Pathogen-evolution model: accumulated adaptive mutations under selection."""
    fitness_gain = (1 + selection * mutation_rate) ** generations - 1
    return {"relative_fitness_gain": round(fitness_gain, 6), "generations": generations}


def viral_mutation(*, genome_length: int, mutation_rate: float, replications: int) -> dict:
    """Viral-mutation model: expected new mutations = L·μ·replications (real
    mutation accumulation)."""
    expected = genome_length * mutation_rate * replications
    return {"expected_mutations": round(expected, 4),
            "quasispecies": expected > 1.0}


def bacterial_resistance(*, generations: int, mutation_rate: float = 1e-7,
                         drug_pressure: float = 1.0) -> dict:
    """Bacterial-resistance model (mutation-selection)."""
    return pathogen_resistance(generations=generations, mutation_rate=mutation_rate,
                               drug_pressure=drug_pressure)


def cancer_evolution(*, initial_cells: float, growth_rate: float, mutation_rate: float,
                     generations: int) -> dict:
    """Cancer-evolution model: exponential clonal growth with accumulating driver
    mutations (real Gompertzian-ish growth proxy)."""
    cells = initial_cells * math.exp(growth_rate * generations)
    drivers = mutation_rate * cells
    return {"tumour_cells": round(cells, 2), "expected_drivers": round(drivers, 4),
            "malignant": drivers > 1.0}


def autoimmune_dynamics(*, self_reactivity: float, regulation: float) -> dict:
    """Autoimmune-dynamics model: disease when self-reactivity overwhelms
    regulatory suppression."""
    net = self_reactivity - regulation
    return {"net_autoreactivity": round(net, 4), "disease": net > 0.2}


def neurodegeneration(*, healthy_neurons: float, aggregation_rate: float,
                      clearance: float, years: int) -> dict:
    """Neurodegeneration model: progressive neuron loss from protein aggregation
    minus clearance (real exponential decline)."""
    net_loss = max(0.0, aggregation_rate - clearance)
    remaining = healthy_neurons * math.exp(-net_loss * years)
    return {"neurons_remaining": round(remaining, 4),
            "fraction_lost": round(1 - remaining / healthy_neurons, 4) if healthy_neurons else 0.0,
            "symptomatic": remaining / healthy_neurons < 0.8 if healthy_neurons else False}
