"""Tests for the real quantum simulator — assert textbook quantum results."""
import math

import numpy as np

from underworld.server.services import quantum_sim as q


def test_hadamard_creates_superposition():
    st = q.run_circuit(1, [("H", 0)])
    p = q.probabilities(st)
    assert abs(p[0] - 0.5) < 1e-9 and abs(p[1] - 0.5) < 1e-9


def test_h_is_self_inverse():
    st = q.run_circuit(1, [("H", 0), ("H", 0)])
    assert abs(q.probabilities(st)[0] - 1.0) < 1e-9      # back to |0>


def test_x_gate_flips():
    st = q.run_circuit(1, [("X", 0)])
    assert abs(q.probabilities(st)[1] - 1.0) < 1e-9


def test_bell_state_is_correlated():
    st = q.bell_state()
    p = q.probabilities(st)
    # only |00> and |11> have weight, each 1/2
    assert abs(p[0] - 0.5) < 1e-9 and abs(p[3] - 0.5) < 1e-9
    assert abs(p[1]) < 1e-9 and abs(p[2]) < 1e-9


def test_bell_state_max_entangled():
    st = q.bell_state()
    assert abs(q.concurrence(st) - 1.0) < 1e-9           # maximally entangled
    assert q.is_entangled(st) is True
    # reduced state entropy = 1 bit
    rho = q.density_matrix(st)
    red = q.partial_trace_2q(rho, keep=0)
    assert abs(q.von_neumann_entropy(red) - 1.0) < 1e-9


def test_product_state_not_entangled():
    st = q.run_circuit(2, [("H", 0)])                    # |+>|0>, separable
    assert q.concurrence(st) < 1e-9
    assert q.is_entangled(st) is False


def test_chsh_violates_classical_bound():
    s = q.chsh_value()
    assert abs(s) > 2.0                                  # beats classical limit
    assert abs(abs(s) - 2 * math.sqrt(2)) < 1e-6         # reaches Tsirelson 2√2


def test_measurement_sampling_matches_probabilities():
    st = q.bell_state()
    counts = q.measure(st, shots=4000, seed=1)
    # only 00 and 11 should appear, roughly evenly
    assert set(counts) <= {"00", "11"}
    assert abs(counts.get("00", 0) - counts.get("11", 0)) < 600


def test_hamiltonian_evolution_is_unitary():
    st = q.QuantumState.zero(1)
    out = q.evolve(st, q.X, math.pi / 2)                 # X rotation
    assert abs(np.linalg.norm(out.vec) - 1.0) < 1e-9     # norm preserved


def test_amplitude_damping_relaxes_to_ground():
    # excited state |1> fully damped -> ground |0>
    rho = np.array([[0, 0], [0, 1]], dtype=complex)
    out = q.amplitude_damping(rho, gamma=1.0)
    assert abs(out[0, 0] - 1.0) < 1e-9                   # population moved to |0>


def test_phase_damping_kills_coherence_keeps_population():
    rho = 0.5 * np.array([[1, 1], [1, 1]], dtype=complex)  # |+><+|
    out = q.phase_damping(rho, lam=1.0)
    assert abs(out[0, 1]) < 1e-9                         # off-diagonal gone
    assert abs(out[0, 0] - 0.5) < 1e-9                   # population unchanged


def test_ghz_state_structure():
    st = q.ghz_state(3)
    p = q.probabilities(st)
    assert abs(p[0] - 0.5) < 1e-9 and abs(p[-1] - 0.5) < 1e-9   # |000> and |111>


def test_error_mitigation_zero_noise_extrapolation():
    # observable degrades linearly with noise scale; ZNE recovers the y-intercept
    zne = q.error_mitigation(noisy_values=[0.9, 0.8, 0.7], scale_factors=[1, 2, 3])
    assert abs(zne["zero_noise_estimate"] - 1.0) < 1e-6


def test_logical_qubit_error_suppressed_below_threshold():
    below = q.logical_qubit_error(0.01, distance=3)
    assert below["below_threshold"] is True
    assert below["logical_error"] < 0.01                # error suppressed
    assert q.logical_qubit_error(0.6)["below_threshold"] is False


def test_qubit_platform_model_fidelity():
    sc = q.qubit_platform("superconducting")
    assert sc["known"] is True
    assert 0 < sc["decoherence_limited_fidelity"] <= 1.0
    # trapped ions have far longer coherence -> higher decoherence-limited fidelity
    assert (q.qubit_platform("trapped_ion")["decoherence_limited_fidelity"]
            >= sc["decoherence_limited_fidelity"] - 1e-9)
    assert q.qubit_platform("unknown")["known"] is False
