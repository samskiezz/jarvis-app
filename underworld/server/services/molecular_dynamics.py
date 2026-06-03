"""Real molecular dynamics — velocity-Verlet integration of a Lennard-Jones
fluid. This is the genuine MD method (the same algorithm GROMACS/LAMMPS use, at
small N): atoms feel real pairwise forces, momenta update by Newton's laws, and
total energy is conserved in the NVE ensemble (the honest correctness check).

Plus a Gillespie stochastic-simulation-algorithm (SSA) for exact stochastic
chemical/gene-regulatory kinetics — the tier-up from deterministic rate ODEs.
"""
from __future__ import annotations

import numpy as np


# ── Lennard-Jones molecular dynamics (velocity-Verlet, NVE) ───────────────────
def _lj_forces(pos: np.ndarray, box: float, rcut: float = 2.5):
    """Lennard-Jones forces + potential energy (reduced units, eps=sigma=1)."""
    n = len(pos)
    forces = np.zeros_like(pos)
    pe = 0.0
    rc2 = rcut * rcut
    for i in range(n - 1):
        d = pos[i + 1:] - pos[i]
        d -= box * np.round(d / box)                 # minimum-image (periodic box)
        r2 = np.sum(d * d, axis=1)
        mask = (r2 < rc2) & (r2 > 1e-12)
        inv2 = np.where(mask, 1.0 / np.where(r2 > 0, r2, 1.0), 0.0)
        inv6 = inv2 ** 3
        # f = 24 eps (2/r^13 - 1/r^7) along r̂  ->  (48 inv6^2 - 24 inv6) * inv2
        fmag = (48.0 * inv6 * inv6 - 24.0 * inv6) * inv2
        fmag = np.where(mask, fmag, 0.0)
        fij = d * fmag[:, None]
        forces[i] -= np.sum(fij, axis=0)
        forces[i + 1:] += fij
        pe += np.sum(np.where(mask, 4.0 * (inv6 * inv6 - inv6), 0.0))
    return forces, float(pe)


def run_md(n: int = 64, *, steps: int = 400, dt: float = 0.001, box: float | None = None,
           temp: float = 0.8, density: float = 0.45, seed: int = 0) -> dict:
    """Simulate `n` LJ atoms for `steps` velocity-Verlet steps. Returns the
    energy trace + fluctuation (NVE total energy should be ~conserved → proof the
    integrator is real). Box is sized to the requested reduced density."""
    rng = np.random.default_rng(seed)
    if box is None:
        box = (n / density) ** (1.0 / 3.0)
    side = int(np.ceil(n ** (1 / 3)))
    grid = (np.arange(side) + 0.5) * (box / side)
    pts = np.array(np.meshgrid(grid, grid, grid)).reshape(3, -1).T[:n]
    pos = pts + rng.normal(0, 0.005, pts.shape)       # tiny jitter, no overlaps
    vel = rng.normal(0, np.sqrt(temp), (n, 3))
    vel -= vel.mean(0)                                # zero net momentum

    forces, pe = _lj_forces(pos, box)
    energies = []
    for _ in range(steps):
        vel += 0.5 * dt * forces                      # velocity Verlet
        pos = (pos + dt * vel) % box
        forces, pe = _lj_forces(pos, box)
        vel += 0.5 * dt * forces
        ke = 0.5 * np.sum(vel * vel)
        energies.append(pe + ke)
    energies = np.array(energies)
    ke_final = 0.5 * np.sum(vel * vel)
    # standard MD energy-conservation metric: std/|mean| after a short transient
    tail = energies[len(energies) // 10:] if len(energies) > 10 else energies
    drift = float(np.std(tail) / (abs(np.mean(tail)) + 1e-9)) if len(tail) else 0.0
    return {
        "atoms": n, "steps": steps, "box": round(float(box), 3),
        "temperature": round(float(2 * ke_final / (3 * n)), 4),   # equipartition
        "kinetic_energy": round(float(ke_final), 4),
        "potential_energy": round(float(pe), 4),
        "total_energy": round(float(energies[-1]) if len(energies) else 0.0, 4),
        "energy_fluctuation_frac": round(drift, 5),   # ~small => integrator correct
        "conserves_energy": drift < 0.05,
    }


# ── Gillespie SSA — exact stochastic kinetics ─────────────────────────────────
def gillespie(species: dict[str, int], reactions: list[dict], *,
              t_max: float = 10.0, seed: int = 0, max_steps: int = 100000) -> dict:
    """Exact stochastic simulation (Gillespie direct method). Each reaction =
    {"reactants": {sp: n}, "products": {sp: n}, "rate": k}. Propensities drive
    the next-reaction time + choice — the real algorithm for low-copy kinetics
    where deterministic ODEs break down (e.g. single-cell gene expression)."""
    rng = np.random.default_rng(seed)
    state = dict(species)
    t = 0.0
    traj = [(0.0, dict(state))]
    steps = 0
    while t < t_max and steps < max_steps:
        props = []
        for rx in reactions:
            a = rx["rate"]
            for sp, c in rx["reactants"].items():
                n = state.get(sp, 0)
                for j in range(c):                    # combinatorial propensity
                    a *= max(0, n - j)
            props.append(a)
        a0 = sum(props)
        if a0 <= 0:
            break
        tau = rng.exponential(1.0 / a0)               # time to next reaction
        t += tau
        r = rng.random() * a0
        idx, acc = 0, 0.0
        for i, a in enumerate(props):
            acc += a
            if r <= acc:
                idx = i
                break
        rx = reactions[idx]
        for sp, c in rx["reactants"].items():
            state[sp] = state.get(sp, 0) - c
        for sp, c in rx["products"].items():
            state[sp] = state.get(sp, 0) + c
        traj.append((round(t, 5), dict(state)))
        steps += 1
    return {"final_time": round(t, 4), "steps": steps, "final_state": state,
            "trajectory_len": len(traj)}
