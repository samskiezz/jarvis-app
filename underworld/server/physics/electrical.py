"""Circuit + power-system helpers (expansion #41-50).

Circuit-level abstractions Minions use before full Maxwell fields: Ohm/Kirchhoff,
Joule heating with a fire threshold, power factor, and the link budget. The
single-output laws (Joule, Nernst, Faraday, transformer, Lorentz, three-phase,
skin depth, Friis, Shannon) live in the physics engine so Minions can *discover*
and `calculate` them; these helpers cover the relational/safety checks.
"""

from __future__ import annotations

import math


def ohm_solve(*, V: float | None = None, I: float | None = None, R: float | None = None) -> dict:
    """Solve V = IR for whichever quantity is missing."""
    known = sum(x is not None for x in (V, I, R))
    if known < 2:
        raise ValueError("provide at least two of V, I, R")
    if V is None:
        V = I * R
    elif I is None:
        I = V / R
    elif R is None:
        R = V / I
    return {"V": V, "I": I, "R": R, "power_W": V * I}


def kirchhoff_voltage_ok(loop_voltages: list[float], *, tol: float = 1e-6) -> bool:
    """KVL — voltages around a closed loop sum to zero."""
    return abs(sum(loop_voltages)) <= tol


def kirchhoff_current_ok(into_node: list[float], out_of_node: list[float], *, tol: float = 1e-6) -> bool:
    """KCL — current in equals current out at a node."""
    return abs(sum(into_node) - sum(out_of_node)) <= tol


def joule_heat(I: float, R: float) -> float:
    return I * I * R


def wire_overheats(I: float, R_per_m: float, length_m: float, *, dissipation_w: float) -> bool:
    """An undersized wire overheats when I²R exceeds what it can shed (fire risk)."""
    return joule_heat(I, R_per_m * length_m) > dissipation_w


def power_factor(real_w: float, apparent_va: float) -> float:
    if apparent_va <= 0:
        return 0.0
    return max(0.0, min(1.0, real_w / apparent_va))


def reactive_power(v_rms: float, i_rms: float, phi_rad: float) -> float:
    return v_rms * i_rms * math.sin(phi_rad)


def shannon_capacity(bandwidth_hz: float, snr: float) -> float:
    return bandwidth_hz * math.log2(1 + snr)
