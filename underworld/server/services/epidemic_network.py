"""Network epidemiology — a tier-up from the homogeneous SIR ODE to a STOCHASTIC
agent-based SIR on a Watts-Strogatz small-world contact network. This is how
real epidemiology models spread: heterogeneous contacts, discrete infections,
and run-to-run variance — not a smooth mean-field curve. Pure numpy.
"""
from __future__ import annotations

import numpy as np


def small_world(n: int, k: int, beta_rewire: float, rng: np.random.Generator) -> list[set]:
    """Watts-Strogatz small-world graph: a ring lattice (each node joined to k
    nearest neighbours) with edges rewired at probability beta_rewire — gives the
    short path lengths + high clustering of real social contact networks."""
    adj = [set() for _ in range(n)]
    half = max(1, k // 2)
    for i in range(n):
        for j in range(1, half + 1):
            a, b = i, (i + j) % n
            adj[a].add(b); adj[b].add(a)
    for i in range(n):                                  # rewire
        for j in range(1, half + 1):
            if rng.random() < beta_rewire:
                old = (i + j) % n
                new = int(rng.integers(0, n))
                if new != i and new not in adj[i]:
                    adj[i].discard(old); adj[old].discard(i)
                    adj[i].add(new); adj[new].add(i)
    return adj


def simulate(n: int = 500, *, k: int = 8, rewire: float = 0.1, beta: float = 0.06,
             gamma: float = 0.1, i0: int = 3, seed: int = 0, max_days: int = 365) -> dict:
    """Stochastic SIR on the contact network. Each day, every S–I contact infects
    with prob `beta`; each I recovers with prob `gamma`. Returns the epidemic
    curve + attack rate + observed peak (emergent, not assumed)."""
    rng = np.random.default_rng(seed)
    adj = small_world(n, k, rewire, rng)
    S, I, R = 0, 1, 2
    state = np.zeros(n, np.int8)
    state[rng.choice(n, size=min(i0, n), replace=False)] = I
    curve = []
    for _ in range(max_days):
        n_i = int(np.sum(state == I))
        curve.append({"S": int(np.sum(state == S)), "I": n_i, "R": int(np.sum(state == R))})
        if n_i == 0:
            break
        new_state = state.copy()
        infected = np.where(state == I)[0]
        for u in infected:
            for v in adj[u]:
                if state[v] == S and rng.random() < beta:
                    new_state[v] = I
            if rng.random() < gamma:
                new_state[u] = R
        state = new_state
    peak = max(curve, key=lambda c: c["I"])
    attack = int(np.sum(state == R)) / n
    mean_degree = float(np.mean([len(a) for a in adj]))
    return {
        "n": n, "days": len(curve), "mean_degree": round(mean_degree, 2),
        "r0_estimate": round(beta * mean_degree / gamma, 3),     # network R0 ~ β⟨k⟩/γ
        "peak_infected": peak["I"], "peak_day": curve.index(peak),
        "attack_rate": round(attack, 4),                          # fraction ever infected
        "burned_out": int(np.sum(state == I)) == 0,
        "curve": curve,
    }


def ensemble(runs: int = 20, **kw) -> dict:
    """Run the stochastic model many times — real epidemics have variance, so we
    report the distribution of attack rate / peak (mean-field ODE can't show this)."""
    seeds = kw.pop("seed", 0)
    attacks, peaks = [], []
    for s in range(runs):
        r = simulate(seed=seeds + s, **kw)
        attacks.append(r["attack_rate"]); peaks.append(r["peak_infected"])
    a = np.array(attacks); p = np.array(peaks)
    return {
        "runs": runs,
        "attack_rate_mean": round(float(a.mean()), 4),
        "attack_rate_std": round(float(a.std()), 4),
        "peak_infected_mean": round(float(p.mean()), 1),
        "fade_out_fraction": round(float(np.mean(a < 0.05)), 3),   # stochastic die-out
    }
