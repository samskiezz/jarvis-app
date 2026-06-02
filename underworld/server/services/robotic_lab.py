"""In-world robotic-lab digital twins (features #131–137).

These are physics-based SIMULATIONS of robotic lab actuators — digital twins so
the simulated world's Minions can run wet-lab-style protocols and researchers can
study the workflows in-silico. They are explicitly NOT physical hardware: each
returns simulation=True, physical_hardware=False. Driving a real pipettor/oven/
sequencer needs real machines; these model the *process physics* honestly
(volume transfer + error, Newton cooling, reaction kinetics, read error) so the
behaviour is realistic without pretending to move atoms.
"""
from __future__ import annotations

import hashlib
import math

import numpy as np

SIM = {"simulation": True, "physical_hardware": False}


def _noise(seed_parts: tuple, spread: float) -> float:
    """Deterministic, reproducible pseudo-noise (auditable replay)."""
    h = hashlib.sha256("|".join(map(str, seed_parts)).encode()).hexdigest()
    return (int(h[:8], 16) / 0xFFFFFFFF * 2 - 1) * spread


def pipetting(*, target_volume_ul: float, precision_cv: float = 0.01,
              prev_volume_ul: float = 0.0, carryover: float = 0.001,
              run: int = 0) -> dict:
    """#131 Robotic pipetting digital twin: dispense `target_volume` with a
    realistic coefficient-of-variation error + carryover from the previous draw."""
    err = _noise(("pip", target_volume_ul, run), precision_cv * target_volume_ul)
    delivered = target_volume_ul + err + carryover * prev_volume_ul
    return {**SIM, "module": "pipetting", "target_ul": target_volume_ul,
            "delivered_ul": round(delivered, 5),
            "error_ul": round(delivered - target_volume_ul, 5),
            "within_spec": abs(delivered - target_volume_ul) <= 3 * precision_cv * target_volume_ul}


def thermal(*, t_start: float, t_target: float, ambient: float, k: float = 0.1,
            steps: int = 60, mode: str = "heat") -> dict:
    """#132/#133 Robotic heating/cooling digital twin: Newton's law of cooling/
    heating dT/dt = −k(T − T_set). Real first-order thermal dynamics."""
    t = t_start
    traj = []
    setpoint = t_target if mode == "heat" else min(t_target, ambient)
    for _ in range(steps):
        t += -k * (t - setpoint)
        traj.append(round(t, 3))
    return {**SIM, "module": mode, "final_temp": round(t, 3),
            "trajectory": traj, "reached_setpoint": abs(t - setpoint) < 0.5}


def imaging(*, true_intensity: float, exposure: float = 1.0, read_noise: float = 0.02,
            run: int = 0) -> dict:
    """#134 Robotic imaging digital twin: signal = intensity·exposure + shot +
    read noise (a real camera noise model)."""
    signal = true_intensity * exposure
    shot = math.sqrt(max(0.0, signal)) * _noise(("img", true_intensity, run), 1.0)
    read = _noise(("rd", true_intensity, run), read_noise)
    measured = signal + 0.1 * shot + read
    snr = signal / (read_noise + math.sqrt(max(1e-9, signal))) if signal > 0 else 0.0
    return {**SIM, "module": "imaging", "measured": round(measured, 5),
            "snr": round(snr, 3)}


def synthesis(*, reactant: float, rate_k: float, time: float, order: int = 1) -> dict:
    """#135 Robotic synthesis digital twin: integrate reaction kinetics to get
    product yield. First-order: [P] = [A]0(1 − e^(−kt))."""
    if order == 1:
        product = reactant * (1 - math.exp(-rate_k * time))
    else:  # second-order
        product = reactant * (rate_k * reactant * time) / (1 + rate_k * reactant * time)
    return {**SIM, "module": "synthesis", "product_yield": round(product, 5),
            "conversion": round(product / reactant, 4) if reactant else 0.0}


def sequencing(*, sequence: str, error_rate: float = 0.001, run: int = 0) -> dict:
    """#136 Robotic sequencing digital twin: simulate read errors at a realistic
    per-base error rate and report the Phred-scale quality."""
    bases = list(sequence.upper())
    errors = 0
    for i, b in enumerate(bases):
        if abs(_noise(("seq", b, i, run), 1.0)) < error_rate * 2:  # ~error_rate prob
            errors += 1
    measured_rate = errors / len(bases) if bases else 0.0
    phred = -10 * math.log10(error_rate) if error_rate > 0 else 60.0
    return {**SIM, "module": "sequencing", "read_length": len(bases),
            "simulated_errors": errors, "phred_quality": round(phred, 1),
            "error_rate": measured_rate}


def cleaning(*, contamination: float, wash_efficiency: float = 0.9, cycles: int = 1) -> dict:
    """#137 Robotic cleaning digital twin: residual contamination after N wash
    cycles (real exponential decontamination)."""
    residual = contamination * (1 - wash_efficiency) ** cycles
    return {**SIM, "module": "cleaning", "residual_contamination": round(residual, 8),
            "log_reduction": round(-math.log10(residual / contamination), 3)
            if contamination > 0 and residual > 0 else None,
            "clean": residual < 1e-3 * max(contamination, 1e-9)}


MODULES = {"pipetting": pipetting, "heating": thermal, "cooling": thermal,
           "imaging": imaging, "synthesis": synthesis, "sequencing": sequencing,
           "cleaning": cleaning}


def robotic_pipetting(**kw):
    """#131 canonical name."""
    return pipetting(**kw)


def robotic_heating(**kw):
    """#132 canonical name."""
    return thermal(mode="heat", **kw)


def robotic_cooling(**kw):
    """#133 canonical name."""
    return thermal(mode="cool", **kw)


def robotic_imaging(**kw):
    """#134 canonical name."""
    return imaging(**kw)


def robotic_synthesis(**kw):
    """#135 canonical name."""
    return synthesis(**kw)


def robotic_sequencing(**kw):
    """#136 canonical name."""
    return sequencing(**kw)


def robotic_cleaning(**kw):
    """#137 canonical name."""
    return cleaning(**kw)
