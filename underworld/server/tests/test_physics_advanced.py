"""VQE must reach the exact ground state; symplectic N-body must conserve E + L."""
import numpy as np
from underworld.server.services import physics_advanced as P


def test_vqe_reaches_exact_h2_ground_state():
    r = P.vqe(seed=1)
    assert r["converged_to_ground_state"], f"VQE {r['vqe_energy']} vs exact {r['exact_energy']}"
    assert r["error"] < 1e-3


def test_exact_ground_energy_is_lowest_eigenvalue():
    H = P.build_hamiltonian(P.H2_HAMILTONIAN)
    assert abs(P.exact_ground_energy() - float(np.linalg.eigvalsh(H)[0])) < 1e-9


def test_two_body_orbit_conserves_energy_and_momentum():
    # a light body orbiting a heavy one — bound circular-ish orbit
    pos = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]]
    vel = [[0.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
    mass = [1.0, 1e-3]
    r = P.nbody(pos, vel, mass, g=1.0, dt=0.001, steps=4000)
    assert r["conserves_energy"], f"energy drift {r['energy_drift_frac']}"
    assert r["ang_momentum_drift"] < 1e-3
