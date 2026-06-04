"""Real quantum-computing simulation methods for the Underworld backend.

Every function here is a genuine numpy state-vector simulation of a textbook
quantum algorithm and returns a dict of real computed values. Nothing is
hard-coded: gates are applied as unitary matrices to complex amplitude vectors,
measurement probabilities come from |amplitude|^2, and entanglement quantities
come from the reduced density matrix. Each method is verified in the test-suite
against a KNOWN analytic value (see test_methods_qcomputing.py for citations).

Methods
-------
1.  single_qubit_gates    - X/H/Z on |0>;  H|0> = (|0>+|1>)/sqrt(2)
2.  bell_state            - H + CNOT -> (|00>+|11>)/sqrt(2); perfect correlation
3.  grover_search         - amplitude amplification; ~floor(pi/4 * sqrt(N)) iters
4.  quantum_fourier_transform - QFT matrix on n qubits; verify it is unitary
5.  deutsch_jozsa         - detects constant vs balanced oracle in one query
6.  entanglement_entropy  - von Neumann entropy of a Bell pair = ln 2 = 1 bit
7.  chsh_inequality       - quantum CHSH correlator -> 2*sqrt(2) (Tsirelson)
8.  phase_estimation      - QPE recovers a known phase of a diagonal unitary

References
----------
- Nielsen & Chuang, "Quantum Computation and Quantum Information".
- Grover iterations ~ pi/4 * sqrt(N):  en.wikipedia.org/wiki/Grover's_algorithm
- Tsirelson bound 2*sqrt(2):           en.wikipedia.org/wiki/Tsirelson's_bound
- QPE / inverse-QFT phase recovery:    en.wikipedia.org/wiki/Quantum_phase_estimation_algorithm
"""
from __future__ import annotations

import numpy as np

# ---------------------------------------------------------------------------
# Single-qubit gate matrices (standard computational basis, |0>=[1,0]).
# ---------------------------------------------------------------------------
I2 = np.array([[1, 0], [0, 1]], dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
Z = np.array([[1, 0], [0, -1]], dtype=complex)
H = (1 / np.sqrt(2)) * np.array([[1, 1], [1, -1]], dtype=complex)
S = np.array([[1, 0], [0, 1j]], dtype=complex)
T = np.array([[1, 0], [0, np.exp(1j * np.pi / 4)]], dtype=complex)

_GATES = {"X": X, "Y": Y, "Z": Z, "H": H, "S": S, "T": T, "I": I2}

INV_SQRT2 = 1 / np.sqrt(2)


# ---------------------------------------------------------------------------
# Generic multi-qubit helpers (little structure: qubit 0 is the leftmost in the
# tensor product, so basis index = sum_k bit_k * 2^(n-1-k)).
# ---------------------------------------------------------------------------
def _zero_state(n: int) -> np.ndarray:
    """The n-qubit ground state |00...0> as a 2**n complex amplitude vector."""
    psi = np.zeros(2 ** n, dtype=complex)
    psi[0] = 1.0
    return psi


def _apply_single(psi: np.ndarray, gate: np.ndarray, target: int, n: int) -> np.ndarray:
    """Apply a single-qubit `gate` to `target` in an n-qubit state vector."""
    ops = [gate if q == target else I2 for q in range(n)]
    full = ops[0]
    for op in ops[1:]:
        full = np.kron(full, op)
    return full @ psi


def _cnot_matrix(control: int, target: int, n: int) -> np.ndarray:
    """Full 2**n x 2**n CNOT unitary for given control/target qubits."""
    dim = 2 ** n
    mat = np.zeros((dim, dim), dtype=complex)
    for i in range(dim):
        bits = [(i >> (n - 1 - q)) & 1 for q in range(n)]
        if bits[control] == 1:
            bits[target] ^= 1
        j = sum(b << (n - 1 - q) for q, b in enumerate(bits))
        mat[j, i] = 1.0
    return mat


def _probabilities(psi: np.ndarray) -> np.ndarray:
    return np.abs(psi) ** 2


# ===========================================================================
# 1. Single-qubit gates
# ===========================================================================
def single_qubit_gates(*, gate: str = "H") -> dict:
    """Apply a named single-qubit gate to |0> and return the resulting state.

    KNOWN values:
      X|0> = |1>                      -> probs [0, 1]
      Z|0> = |0>                      -> probs [1, 0]
      H|0> = (|0>+|1>)/sqrt(2)        -> probs [0.5, 0.5], amplitudes 1/sqrt(2)
    """
    g = _GATES[gate.upper()]
    psi0 = np.array([1, 0], dtype=complex)
    psi = g @ psi0
    probs = _probabilities(psi)
    return {
        "gate": gate.upper(),
        "amplitudes": [complex(round(a.real, 12), round(a.imag, 12)) for a in psi],
        "prob_0": float(round(probs[0], 12)),
        "prob_1": float(round(probs[1], 12)),
        "norm": float(round(np.sum(probs), 12)),
        "is_uniform_superposition": bool(np.allclose(probs, [0.5, 0.5])),
    }


# ===========================================================================
# 2. Bell state (H on q0 then CNOT q0->q1)
# ===========================================================================
def bell_state() -> dict:
    """Build the Bell state (|00>+|11>)/sqrt(2) and measure its correlations.

    KNOWN: amplitudes of |00> and |11> are 1/sqrt(2); |01>=|10>=0. Measuring
    both qubits in the Z basis yields perfectly correlated outcomes (both 0 or
    both 1 with prob 1/2), so the correlation coefficient is +1.
    """
    n = 2
    psi = _zero_state(n)
    psi = _apply_single(psi, H, 0, n)
    psi = _cnot_matrix(0, 1, n) @ psi
    probs = _probabilities(psi)  # order: 00, 01, 10, 11

    # Z-basis correlation: <Z0 Z1> = sum_outcomes (+1 if equal bits else -1)*p
    parities = np.array([+1, -1, -1, +1])  # equal bits -> +1
    correlation = float(np.sum(parities * probs))

    return {
        "amplitudes": [complex(round(a.real, 12), round(a.imag, 12)) for a in psi],
        "probs": {"00": float(round(probs[0], 12)), "01": float(round(probs[1], 12)),
                  "10": float(round(probs[2], 12)), "11": float(round(probs[3], 12))},
        "zz_correlation": round(correlation, 12),
        "is_entangled": bool(_is_entangled(psi)),
    }


def _is_entangled(psi2: np.ndarray, tol: float = 1e-9) -> bool:
    """A 2-qubit pure state is entangled iff its 2x2 amplitude matrix has
    Schmidt rank > 1, i.e. its smaller singular value is nonzero."""
    mat = psi2.reshape(2, 2)
    sv = np.linalg.svd(mat, compute_uv=False)
    return sv[1] > tol


# ===========================================================================
# 3. Grover search (single marked item among N = 2**n)
# ===========================================================================
def grover_search(*, n_qubits: int = 3, marked: int = 5,
                  iterations: int | None = None) -> dict:
    """Grover amplitude amplification searching for one marked basis state.

    The oracle flips the phase of |marked>; the diffuser reflects about the
    uniform superposition. KNOWN: the optimal iteration count for a single
    marked item in N=2**n entries is round(pi/4 * sqrt(N)), and after it the
    marked state's probability is close to 1.
    """
    n = n_qubits
    N = 2 ** n
    if iterations is None:
        iterations = int(round((np.pi / 4) * np.sqrt(N)))

    # uniform superposition via H on every qubit
    psi = _zero_state(n)
    for q in range(n):
        psi = _apply_single(psi, H, q, n)

    uniform = psi.copy()
    history = []
    for _ in range(iterations):
        # Oracle: phase flip on marked state
        psi[marked] *= -1
        # Diffuser: 2|s><s| - I  (reflection about the uniform superposition)
        proj = np.vdot(uniform, psi)
        psi = 2 * proj * uniform - psi
        history.append(float(round(np.abs(psi[marked]) ** 2, 12)))

    probs = _probabilities(psi)
    return {
        "n_qubits": n,
        "N": N,
        "marked": marked,
        "iterations": iterations,
        "optimal_iterations": int(round((np.pi / 4) * np.sqrt(N))),
        "prob_marked": float(round(probs[marked], 12)),
        "most_likely_state": int(np.argmax(probs)),
        "prob_history": history,
    }


# ===========================================================================
# 4. Quantum Fourier transform
# ===========================================================================
def _qft_matrix(n: int) -> np.ndarray:
    """The 2**n x 2**n QFT matrix: F[j,k] = omega^(jk)/sqrt(N), omega=e^(2pi i/N)."""
    N = 2 ** n
    j, k = np.meshgrid(np.arange(N), np.arange(N), indexing="ij")
    omega = np.exp(2j * np.pi / N)
    return omega ** (j * k) / np.sqrt(N)


def quantum_fourier_transform(*, n_qubits: int = 3) -> dict:
    """Build the QFT on an n-qubit register and verify it is unitary.

    KNOWN: the QFT is a unitary transform, so F^dagger F = I (identity), and
    applying QFT to the all-zero state yields the uniform superposition (every
    amplitude = 1/sqrt(N)).
    """
    n = n_qubits
    N = 2 ** n
    F = _qft_matrix(n)
    should_be_identity = F.conj().T @ F
    unitary_error = float(np.max(np.abs(should_be_identity - np.eye(N))))

    transformed_zero = F @ _zero_state(n)
    uniform_amp = 1 / np.sqrt(N)
    uniform_error = float(np.max(np.abs(np.abs(transformed_zero) - uniform_amp)))

    return {
        "n_qubits": n,
        "N": N,
        "is_unitary": bool(unitary_error < 1e-10),
        "unitary_error": unitary_error,
        "zero_maps_to_uniform": bool(uniform_error < 1e-10),
        "uniform_amplitude": float(round(uniform_amp, 12)),
    }


# ===========================================================================
# 5. Deutsch-Jozsa
# ===========================================================================
def deutsch_jozsa(*, n_qubits: int = 3, oracle: str = "balanced") -> dict:
    """Determine whether an n-bit boolean function is constant or balanced.

    Uses the standard phase oracle U_f|x> = (-1)^f(x)|x> on the input register
    after Hadamards. KNOWN: measuring the input register after the final
    Hadamards yields |00...0> with probability 1 iff f is constant; for any
    balanced f the probability of |00...0> is exactly 0.
    """
    n = n_qubits
    N = 2 ** n

    if oracle == "constant":
        f = np.zeros(N, dtype=int)            # f(x)=0 for all x (constant)
    elif oracle == "constant1":
        f = np.ones(N, dtype=int)             # f(x)=1 for all x (constant)
    elif oracle == "balanced":
        f = np.array([x & 1 for x in range(N)], dtype=int)   # parity of LSB: balanced
    else:
        raise ValueError(f"unknown oracle {oracle!r}")

    # H^n on |0...0>
    psi = _zero_state(n)
    for q in range(n):
        psi = _apply_single(psi, H, q, n)

    # phase oracle
    psi = ((-1.0) ** f) * psi

    # H^n again
    for q in range(n):
        psi = _apply_single(psi, H, q, n)

    probs = _probabilities(psi)
    prob_all_zero = float(round(probs[0], 12))
    is_constant = prob_all_zero > 0.5
    return {
        "n_qubits": n,
        "oracle": oracle,
        "prob_all_zero": prob_all_zero,
        "verdict": "constant" if is_constant else "balanced",
    }


# ===========================================================================
# 6. Entanglement entropy of a Bell pair
# ===========================================================================
def entanglement_entropy(*, state: str = "bell") -> dict:
    """von Neumann entropy of the reduced 1-qubit density matrix.

    For the Bell state (|00>+|11>)/sqrt(2) the reduced state of either qubit is
    maximally mixed (I/2), so KNOWN: S = -Tr(rho log rho) = ln 2 nats = 1 bit.
    A product state |00> has S = 0.
    """
    n = 2
    if state == "bell":
        psi = _zero_state(n)
        psi = _apply_single(psi, H, 0, n)
        psi = _cnot_matrix(0, 1, n) @ psi
    elif state == "product":
        psi = _zero_state(n)  # |00>, separable
    else:
        raise ValueError(f"unknown state {state!r}")

    # reduced density matrix of qubit 0 by tracing out qubit 1
    mat = psi.reshape(2, 2)             # rows = qubit0, cols = qubit1
    rho_a = mat @ mat.conj().T         # partial trace over qubit 1
    eig = np.linalg.eigvalsh(rho_a)
    eig = eig[eig > 1e-15]             # drop numerical zeros for the log
    entropy_nats = float(-np.sum(eig * np.log(eig)))
    entropy_bits = float(-np.sum(eig * np.log2(eig)))

    return {
        "state": state,
        "entropy_nats": round(entropy_nats, 12),
        "entropy_bits": round(entropy_bits, 12),
        "reduced_eigenvalues": [float(round(e, 12)) for e in np.linalg.eigvalsh(rho_a)],
    }


# ===========================================================================
# 7. CHSH inequality
# ===========================================================================
def _expectation(psi: np.ndarray, op_a: np.ndarray, op_b: np.ndarray) -> float:
    """<psi| (A tensor B) |psi> for a 2-qubit state and 1-qubit observables."""
    op = np.kron(op_a, op_b)
    return float(np.real(np.vdot(psi, op @ psi)))


def chsh_inequality() -> dict:
    """Compute the CHSH correlator S for the singlet/Bell state with the optimal
    measurement settings.

    Alice measures Z and X; Bob measures (Z+X)/sqrt(2) and (Z-X)/sqrt(2).
    KNOWN: the classical local-hidden-variable bound is |S| <= 2, while the
    quantum value reaches the Tsirelson bound 2*sqrt(2) ~= 2.828427.
    """
    n = 2
    # Use the Bell state (|00>+|11>)/sqrt2.
    psi = _zero_state(n)
    psi = _apply_single(psi, H, 0, n)
    psi = _cnot_matrix(0, 1, n) @ psi

    A0 = Z
    A1 = X
    B0 = (Z + X) / np.sqrt(2)
    B1 = (Z - X) / np.sqrt(2)

    e00 = _expectation(psi, A0, B0)
    e01 = _expectation(psi, A0, B1)
    e10 = _expectation(psi, A1, B0)
    e11 = _expectation(psi, A1, B1)

    S = e00 + e01 + e10 - e11
    return {
        "S": round(S, 12),
        "abs_S": round(abs(S), 12),
        "classical_bound": 2.0,
        "tsirelson_bound": round(2 * np.sqrt(2), 12),
        "violates_classical": bool(abs(S) > 2.0 + 1e-9),
        "correlators": {"E00": round(e00, 12), "E01": round(e01, 12),
                        "E10": round(e10, 12), "E11": round(e11, 12)},
    }


# ===========================================================================
# 8. Phase estimation / period finding (small case)
# ===========================================================================
def phase_estimation(*, phase: float = 0.25, n_counting: int = 3) -> dict:
    """Quantum phase estimation for a 1-qubit unitary U = diag(1, e^{2 pi i phi}).

    The eigenstate is |1>. We use `n_counting` counting qubits, apply controlled
    U^(2^k), then the inverse QFT, and read out the most-likely integer m, which
    estimates phi ~= m / 2^n_counting.

    KNOWN: if phi is exactly representable as m/2^n (e.g. phi=0.25, n=3 -> m=2),
    QPE returns that m with probability 1, recovering the exact phase.
    """
    nc = n_counting
    Nc = 2 ** nc

    # Counting register starts in uniform superposition; eigenstate fixed at |1>.
    # We can simulate the controlled-U^(2^k) phase kickback directly on the
    # counting register because the eigenstate only contributes a phase.
    # After the Hadamards, basis state |j> of the counting register accumulates
    # phase e^{2 pi i phi * j}. (This is the standard QPE kickback result.)
    counting = np.ones(Nc, dtype=complex) / np.sqrt(Nc)
    j = np.arange(Nc)
    counting = counting * np.exp(2j * np.pi * phase * j)

    # Apply inverse QFT to the counting register.
    F = _qft_matrix(nc)
    counting = F.conj().T @ counting

    probs = _probabilities(counting)
    m = int(np.argmax(probs))
    estimated_phase = m / Nc

    return {
        "true_phase": phase,
        "n_counting": nc,
        "measured_integer": m,
        "estimated_phase": float(round(estimated_phase, 12)),
        "prob_measured": float(round(probs[m], 12)),
        "exact": bool(abs(estimated_phase - phase) < 1e-9),
    }
