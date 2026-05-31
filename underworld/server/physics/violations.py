"""Physics Violation Alarm + Patent Feasibility Gate (kernel #10/#74/#76).

Flags claims that break the laws the world already obeys: faster-than-light
signalling, perpetual motion / over-unity energy, engines beating the Carnot
limit, non-conserved charge or mass. Used both as a runtime alarm and as the gate
expired-patent scans must pass before they can be materialised.
"""

from __future__ import annotations

from .conservation import all_conserved, audit
from .dimensions import Dimension, is_homogeneous

C_LIGHT = 299_792_458.0          # m/s
_EPS = 1e-9


def speed_ok(v_m_s: float) -> bool:
    return v_m_s <= C_LIGHT + _EPS


def carnot_limit(t_cold_k: float, t_hot_k: float) -> float:
    if t_hot_k <= 0:
        return 0.0
    return max(0.0, 1.0 - t_cold_k / t_hot_k)


def efficiency_ok(eta: float, t_cold_k: float, t_hot_k: float) -> bool:
    return eta <= carnot_limit(t_cold_k, t_hot_k) + 1e-6


def energy_balance_ok(energy_in: float, energy_out: float) -> bool:
    return energy_out <= energy_in + 1e-6   # no over-unity


def detect_violations(claim: dict) -> list[str]:
    """Inspect a structured claim for impossibilities. Recognised keys:
    speed_m_s, efficiency + t_cold_k + t_hot_k, energy_in/energy_out,
    charge_before/charge_after, dims (list[Dimension] that must be homogeneous)."""
    out: list[str] = []
    if "speed_m_s" in claim and not speed_ok(float(claim["speed_m_s"])):
        out.append("Faster-than-light: signal/object exceeds c.")
    if {"efficiency", "t_cold_k", "t_hot_k"} <= claim.keys():
        if not efficiency_ok(float(claim["efficiency"]), float(claim["t_cold_k"]), float(claim["t_hot_k"])):
            out.append("Exceeds the Carnot efficiency limit (perpetual motion).")
    if {"energy_in", "energy_out"} <= claim.keys():
        if not energy_balance_ok(float(claim["energy_in"]), float(claim["energy_out"])):
            out.append("Over-unity: energy out exceeds energy in.")
    if {"charge_before", "charge_after"} <= claim.keys():
        res = audit({"charge": float(claim["charge_before"])}, {"charge": float(claim["charge_after"])})
        if not all_conserved([r for r in res if r.quantity == "charge"]):
            out.append("Charge not conserved.")
    dims = claim.get("dims")
    if dims and not is_homogeneous(*[d if isinstance(d, Dimension) else d for d in dims]):
        out.append("Dimensionally inconsistent equation.")
    return out


def feasibility_gate(claim: dict, *, materials_available: bool = True) -> dict:
    """Patent Feasibility Gate (#74): physics + material availability → verdict."""
    violations = detect_violations(claim)
    feasible = not violations and materials_available
    return {
        "feasible": feasible,
        "violations": violations,
        "materials_available": materials_available,
        "verdict": "APPROVED" if feasible else "REJECTED",
    }
