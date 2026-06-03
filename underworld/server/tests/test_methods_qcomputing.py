"""Verification tests for real quantum-computing simulation methods.

Each test asserts a numpy state-vector simulation against a KNOWN analytic
value, with an inline citation of the source of that known value.
"""
import numpy as np

from underworld.server.services.methods_qcomputing import (
    single_qubit_gates,
    bell_state,
    grover_search,
    quantum_fourier_transform,
    deutsch_jozsa,
    entanglement_entropy,
    chsh_inequality,
    phase_estimation,
)


# 1. Single-qubit gates ------------------------------------------------------
def test_hadamard_on_zero_is_equal_superposition():
    # KNOWN: H|0> = (|0>+|1>)/sqrt(2); both amplitudes = 1/sqrt(2), probs = 0.5.
    r = single_qubit_gates(gate="H")
    assert abs(r["prob_0"] - 0.5) < 1e-12
    assert abs(r["prob_1"] - 0.5) < 1e-12
    assert abs(r["amplitudes"][0].real - 1 / np.sqrt(2)) < 1e-12
    assert abs(r["amplitudes"][1].real - 1 / np.sqrt(2)) < 1e-12
    assert r["is_uniform_superposition"] is True


def test_pauli_x_flips_zero_to_one():
    # KNOWN: X|0> = |1>  ->  prob_1 = 1.
    r = single_qubit_gates(gate="X")
    assert abs(r["prob_1"] - 1.0) < 1e-12
    assert abs(r["prob_0"] - 0.0) < 1e-12


def test_pauli_z_leaves_zero_unchanged():
    # KNOWN: Z|0> = |0>  ->  prob_0 = 1.
    r = single_qubit_gates(gate="Z")
    assert abs(r["prob_0"] - 1.0) < 1e-12


# 2. Bell state --------------------------------------------------------------
def test_bell_state_amplitudes_and_correlation():
    # KNOWN: (|00>+|11>)/sqrt2 -> P(00)=P(11)=0.5, P(01)=P(10)=0,
    #        Z-basis correlation = +1, and the state is entangled.
    r = bell_state()
    assert abs(r["probs"]["00"] - 0.5) < 1e-12
    assert abs(r["probs"]["11"] - 0.5) < 1e-12
    assert abs(r["probs"]["01"] - 0.0) < 1e-12
    assert abs(r["probs"]["10"] - 0.0) < 1e-12
    assert abs(r["zz_correlation"] - 1.0) < 1e-12
    assert r["is_entangled"] is True


# 3. Grover search -----------------------------------------------------------
def test_grover_amplifies_marked_state():
    # KNOWN: ~floor(pi/4 * sqrt(N)) iterations amplify the marked item to
    #        near-unity probability. N=8 -> optimal = round(pi/4*sqrt8) = 2.
    r = grover_search(n_qubits=3, marked=5)
    assert r["optimal_iterations"] == 2          # round(pi/4 * sqrt(8)) = 2
    assert r["most_likely_state"] == 5
    assert r["prob_marked"] > 0.9                 # strongly amplified


def test_grover_iteration_count_scales_as_sqrt_n():
    # KNOWN: optimal iters ~ pi/4 * sqrt(N). N=16 -> round(pi/4*4) = 3.
    r = grover_search(n_qubits=4, marked=10)
    assert r["optimal_iterations"] == 3
    assert r["most_likely_state"] == 10
    assert r["prob_marked"] > 0.9


# 4. Quantum Fourier transform ----------------------------------------------
def test_qft_is_unitary():
    # KNOWN: the QFT is unitary, F^dagger F = I.
    r = quantum_fourier_transform(n_qubits=3)
    assert r["is_unitary"] is True
    assert r["unitary_error"] < 1e-10


def test_qft_maps_zero_to_uniform():
    # KNOWN: QFT|0> = uniform superposition with amplitude 1/sqrt(N).
    r = quantum_fourier_transform(n_qubits=3)
    assert r["zero_maps_to_uniform"] is True
    assert abs(r["uniform_amplitude"] - 1 / np.sqrt(8)) < 1e-12


# 5. Deutsch-Jozsa -----------------------------------------------------------
def test_deutsch_jozsa_detects_constant():
    # KNOWN: constant f -> measure |0...0> with probability 1.
    r = deutsch_jozsa(n_qubits=3, oracle="constant")
    assert abs(r["prob_all_zero"] - 1.0) < 1e-12
    assert r["verdict"] == "constant"


def test_deutsch_jozsa_detects_constant_one():
    r = deutsch_jozsa(n_qubits=3, oracle="constant1")
    assert abs(r["prob_all_zero"] - 1.0) < 1e-12
    assert r["verdict"] == "constant"


def test_deutsch_jozsa_detects_balanced():
    # KNOWN: balanced f -> probability of |0...0| is exactly 0.
    r = deutsch_jozsa(n_qubits=3, oracle="balanced")
    assert abs(r["prob_all_zero"] - 0.0) < 1e-12
    assert r["verdict"] == "balanced"


# 6. Entanglement entropy ----------------------------------------------------
def test_bell_pair_entropy_is_ln2_one_bit():
    # KNOWN: reduced state of a Bell pair is maximally mixed -> S = ln2 nats = 1 bit.
    r = entanglement_entropy(state="bell")
    assert abs(r["entropy_nats"] - np.log(2)) < 1e-12
    assert abs(r["entropy_bits"] - 1.0) < 1e-12


def test_product_state_has_zero_entropy():
    # KNOWN: separable |00> has zero entanglement entropy.
    r = entanglement_entropy(state="product")
    assert abs(r["entropy_bits"] - 0.0) < 1e-12


# 7. CHSH inequality ---------------------------------------------------------
def test_chsh_reaches_tsirelson_bound():
    # KNOWN: classical bound 2; quantum (Tsirelson) bound 2*sqrt(2) ~= 2.828427.
    r = chsh_inequality()
    assert abs(r["abs_S"] - 2 * np.sqrt(2)) < 1e-12
    assert r["abs_S"] > 2.0                       # violates classical bound
    assert r["violates_classical"] is True


# 8. Phase estimation --------------------------------------------------------
def test_phase_estimation_recovers_known_phase():
    # KNOWN: phi=0.25 is exactly 2/8, so 3 counting qubits recover it with prob 1.
    r = phase_estimation(phase=0.25, n_counting=3)
    assert r["measured_integer"] == 2
    assert abs(r["estimated_phase"] - 0.25) < 1e-12
    assert abs(r["prob_measured"] - 1.0) < 1e-12
    assert r["exact"] is True


def test_phase_estimation_recovers_another_phase():
    # KNOWN: phi=0.625 = 5/8 -> measured integer 5 with prob 1 on 3 qubits.
    r = phase_estimation(phase=0.625, n_counting=3)
    assert r["measured_integer"] == 5
    assert abs(r["estimated_phase"] - 0.625) < 1e-12
    assert r["exact"] is True
