"""Real exotic-quantum / condensed-matter models (feature category Q).

Builds on quantum_sim. Genuine (minimal) physics:
  * Floquet drive (subharmonic response = time-crystal signature)
  * 1-D spin-chain (transverse-field Ising) energy, many-body localisation proxy
  * symmetry / symmetry-breaking order parameter, topological winding number
  * superfluid fraction, BEC condensate fraction, quantum-metrology Heisenberg gain
"""
from __future__ import annotations

import math

import numpy as np


def floquet_subharmonic(*, drive_period: int, steps: int, imperfection: float = 0.05) -> dict:
    """Drive a spin and look for a period-2T (subharmonic) response — the
    defining signature of a discrete time crystal. Returns the dominant response
    period; ~2× the drive period means time-crystalline order."""
    # ideal pi-pulse flips each period; imperfection adds noise
    signal = []
    s = 1.0
    rng = np.random.default_rng(0)
    for t in range(steps):
        if t % drive_period == 0:
            s = -s * (1 - imperfection) + rng.normal(0, imperfection)
        signal.append(s)
    # FFT to find dominant period
    sig = np.array(signal) - np.mean(signal)
    freqs = np.fft.rfftfreq(len(sig))
    power = np.abs(np.fft.rfft(sig))
    peak = freqs[np.argmax(power[1:]) + 1]
    period = 1 / peak if peak > 0 else math.inf
    return {"response_period": round(period, 3), "drive_period": drive_period,
            "time_crystal": abs(period - 2 * drive_period) < drive_period * 0.5}


def ising_chain_energy(spins: list[int], *, j: float = 1.0, h: float = 0.5) -> dict:
    """1-D transverse-field Ising energy E = −J Σ s_i s_{i+1} − h Σ s_i."""
    s = np.array(spins)
    coupling = -j * np.sum(s[:-1] * s[1:])
    field = -h * np.sum(s)
    return {"energy": float(coupling + field), "magnetisation": float(np.mean(s))}


def many_body_localisation(*, disorder: float, interaction: float) -> dict:
    """MBL proxy: strong disorder relative to interaction localises the system
    (no thermalisation). Returns the regime."""
    ratio = disorder / interaction if interaction > 0 else math.inf
    return {"disorder_interaction_ratio": round(ratio, 3),
            "localised": ratio > 3.0, "thermal": ratio < 1.0}


def symmetry_breaking(order_parameter: float, *, threshold: float = 0.1) -> dict:
    """Symmetry-breaking tracker: a non-zero order parameter signals a broken
    symmetry / ordered phase."""
    return {"order_parameter": round(abs(order_parameter), 4),
            "symmetry_broken": abs(order_parameter) > threshold}


def topological_invariant(phases: list[float]) -> dict:
    """Winding number of a phase loop = topological invariant. A non-zero integer
    winding marks a topologically non-trivial (e.g. anyonic) phase."""
    unwrapped = np.unwrap(phases)
    winding = (unwrapped[-1] - unwrapped[0]) / (2 * math.pi)
    return {"winding_number": round(float(winding), 3),
            "topological": abs(round(winding)) >= 1}


def superfluid_fraction(*, temperature: float, t_critical: float) -> dict:
    """Two-fluid model superfluid fraction ρs/ρ = 1 − (T/Tc)⁴ below Tc."""
    if temperature >= t_critical:
        return {"superfluid_fraction": 0.0, "superfluid": False}
    frac = 1 - (temperature / t_critical) ** 4
    return {"superfluid_fraction": round(frac, 4), "superfluid": True}


def bec_condensate_fraction(*, temperature: float, t_critical: float) -> dict:
    """Bose–Einstein condensate fraction N0/N = 1 − (T/Tc)³ below Tc."""
    if temperature >= t_critical:
        return {"condensate_fraction": 0.0, "condensed": False}
    frac = 1 - (temperature / t_critical) ** 3
    return {"condensate_fraction": round(frac, 4), "condensed": True}


def quantum_metrology(*, n_probes: int, entangled: bool) -> dict:
    """Quantum-metrology precision gain: entangled probes reach the Heisenberg
    limit 1/N vs the standard quantum limit 1/√N."""
    sql = 1 / math.sqrt(n_probes)
    precision = 1 / n_probes if entangled else sql
    return {"precision": precision, "heisenberg_limited": entangled,
            "gain_over_sql": round(sql / precision, 3)}


# ── canonical-named feature entry points (real logic) ────────────────────────
def subharmonic_response_detector(*, drive_period: int, steps: int = 256,
                                  imperfection: float = 0.02) -> dict:
    """Subharmonic-response detector (time-crystal signature via Floquet drive)."""
    return floquet_subharmonic(drive_period=drive_period, steps=steps, imperfection=imperfection)


def artifact_rejection(signal: list[float], *, z: float = 4.0) -> dict:
    """Artifact-rejection system: drop spurious spikes (robust-z over the MAD)
    so a subharmonic isn't faked by an instrument glitch."""
    arr = np.array(signal, float)
    med = np.median(arr)
    mad = np.median(np.abs(arr - med)) or 1e-9
    rz = 0.6745 * (arr - med) / mad
    kept = arr[np.abs(rz) <= z]
    return {"rejected": int((np.abs(rz) > z).sum()), "clean_signal": kept.tolist()}


def topological_matter(phases: list[float]) -> dict:
    """Topological-matter node (winding-number invariant)."""
    return topological_invariant(phases)


def bose_einstein_condensate(*, temperature: float, t_critical: float) -> dict:
    """Bose-Einstein condensate path (condensate fraction)."""
    return bec_condensate_fraction(temperature=temperature, t_critical=t_critical)
