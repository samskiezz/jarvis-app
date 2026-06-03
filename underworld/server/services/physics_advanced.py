"""Physics tier-up to the real methods the big quantum/astro groups use:

  * VQE — a Variational Quantum Eigensolver: build a qubit Hamiltonian, prepare
    a parameterised ansatz state, and classically optimise <psi|H|psi> down to
    the ground-state energy. The flagship NISQ algorithm (Google/IBM). We verify
    it reaches the EXACT diagonalisation (FCI) energy.
  * Symplectic N-body — leapfrog (kick-drift-kick) Newtonian gravity, the
    structure-preserving integrator real astrophysics codes (REBOUND) use;
    verified to conserve total energy + angular momentum over many orbits.
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize

I2 = np.eye(2, dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
Z = np.array([[1, 0], [0, -1]], dtype=complex)
_P = {"I": I2, "X": X, "Y": Y, "Z": Z}


def _kron(ops: str) -> np.ndarray:
    m = _P[ops[0]]
    for c in ops[1:]:
        m = np.kron(m, _P[c])
    return m


# H2/STO-3G qubit Hamiltonian (2-qubit parity mapping, R≈0.74 Å) — standard coeffs.
H2_HAMILTONIAN: dict[str, float] = {
    "II": -1.0523732, "IZ": 0.3979374, "ZI": -0.3979374,
    "ZZ": -0.0112801, "XX": 0.1809312,
}


def build_hamiltonian(terms: dict[str, float]) -> np.ndarray:
    """Sum Pauli-string terms into a dense Hermitian matrix."""
    n = len(next(iter(terms)))
    H = np.zeros((2 ** n, 2 ** n), dtype=complex)
    for pauli, coeff in terms.items():
        H += coeff * _kron(pauli)
    return H


def exact_ground_energy(terms: dict[str, float] = H2_HAMILTONIAN) -> float:
    """Exact lowest eigenvalue (full diagonalisation = FCI for this Hamiltonian)."""
    return float(np.linalg.eigvalsh(build_hamiltonian(terms))[0])


def _ansatz_state(theta: np.ndarray) -> np.ndarray:
    """A real 2-qubit hardware-efficient ansatz: start |01>, RY(θ0)⊗RY(θ1), then
    an entangling CNOT — enough to reach the H2 ground state."""
    def ry(t):
        return np.array([[np.cos(t / 2), -np.sin(t / 2)], [np.sin(t / 2), np.cos(t / 2)]], complex)
    psi = np.zeros(4, complex); psi[1] = 1.0          # |01>
    U = np.kron(ry(theta[0]), ry(theta[1]))
    cnot = np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]], complex)
    return cnot @ U @ psi


def vqe(terms: dict[str, float] = H2_HAMILTONIAN, *, seed: int = 0) -> dict:
    """Run VQE: minimise the energy expectation over the ansatz parameters."""
    H = build_hamiltonian(terms)
    rng = np.random.default_rng(seed)

    def energy(theta):
        psi = _ansatz_state(theta)
        return float(np.real(psi.conj() @ H @ psi))

    best = min((minimize(energy, rng.uniform(0, 2 * np.pi, 2), method="COBYLA",
                         options={"maxiter": 500}) for _ in range(6)),
               key=lambda r: r.fun)
    exact = exact_ground_energy(terms)
    return {
        "vqe_energy": round(float(best.fun), 6),
        "exact_energy": round(exact, 6),
        "error": round(abs(best.fun - exact), 6),
        "converged_to_ground_state": abs(best.fun - exact) < 1e-3,
        "optimal_params": [round(float(t), 4) for t in best.x],
    }


# ── Symplectic N-body gravity (leapfrog / kick-drift-kick) ────────────────────
def _accel(pos: np.ndarray, mass: np.ndarray, g: float, soft: float) -> np.ndarray:
    n = len(pos)
    acc = np.zeros_like(pos)
    for i in range(n):
        d = pos - pos[i]
        r2 = np.sum(d * d, axis=1) + soft * soft
        r2[i] = np.inf
        inv = (r2 ** -1.5)[:, None]
        acc[i] = g * np.sum(mass[:, None] * d * inv, axis=0)
    return acc


def _energy(pos, vel, mass, g, soft):
    ke = 0.5 * np.sum(mass * np.sum(vel * vel, axis=1))
    pe = 0.0
    n = len(pos)
    for i in range(n):
        for j in range(i + 1, n):
            r = np.sqrt(np.sum((pos[i] - pos[j]) ** 2) + soft * soft)
            pe -= g * mass[i] * mass[j] / r
    return ke + pe


def nbody(pos, vel, mass, *, g: float = 1.0, dt: float = 0.001, steps: int = 5000,
          soft: float = 0.01) -> dict:
    """Integrate an N-body gravitational system with leapfrog. Returns energy +
    angular-momentum conservation (the proof a symplectic integrator is correct)."""
    pos = np.asarray(pos, float); vel = np.asarray(vel, float); mass = np.asarray(mass, float)
    e0 = _energy(pos, vel, mass, g, soft)
    L0 = np.sum(mass[:, None] * np.cross(pos, vel), axis=0)
    acc = _accel(pos, mass, g, soft)
    for _ in range(steps):
        vel += 0.5 * dt * acc                          # kick
        pos += dt * vel                                # drift
        acc = _accel(pos, mass, g, soft)
        vel += 0.5 * dt * acc                          # kick
    e1 = _energy(pos, vel, mass, g, soft)
    L1 = np.sum(mass[:, None] * np.cross(pos, vel), axis=0)
    return {
        "bodies": len(mass), "steps": steps,
        "energy_drift_frac": round(float(abs(e1 - e0) / (abs(e0) + 1e-12)), 6),
        "ang_momentum_drift": round(float(np.linalg.norm(L1 - L0)), 8),
        "conserves_energy": abs(e1 - e0) / (abs(e0) + 1e-12) < 0.01,
    }
