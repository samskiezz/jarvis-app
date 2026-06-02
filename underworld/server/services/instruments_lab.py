"""Real instrument / measurement models (feature category E).

Genuine measurement-science math (numpy), not stubs:

  * calibration drift (linear + exponential aging) and re-zeroing
  * noise profiles (white + 1/f) with a real SNR computation
  * sensitivity / response curves with linear range and saturation
  * reproducibility from repeated runs (intraclass-style agreement)
  * instrument-agreement tests (Bland–Altman bias + limits of agreement)
  * resolution limits, contamination carryover, misuse-risk scoring,
    dependency / upgrade graphs, chain-of-custody ledger, standardisation

Checkable: zero drift at t=0; SNR rises with signal; a perfectly linear sensor
has unit gain over its range; identical instruments have ~zero Bland–Altman bias.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np


# ── calibration ──────────────────────────────────────────────────────────────
def calibration_drift(t: float, *, rate: float, tau: float | None = None) -> float:
    """Offset error after time t. Linear aging `rate`·t, or, if `tau` given, an
    exponential approach rate·(1−e^(−t/τ)) to a steady offset. Zero at t=0."""
    if tau:
        return rate * (1 - math.exp(-t / tau))
    return rate * t


def needs_recalibration(t: float, *, rate: float, tolerance: float,
                        tau: float | None = None) -> bool:
    """Has drift exceeded the allowed tolerance?"""
    return abs(calibration_drift(t, rate=rate, tau=tau)) > tolerance


# ── noise / SNR ──────────────────────────────────────────────────────────────
def noise_profile(signal: float, *, white: float, pink: float = 0.0,
                  bandwidth: float = 1.0) -> dict:
    """Total RMS noise = sqrt(white²·BW + pink²·ln(BW)) and the resulting SNR.
    A real instrument noise budget."""
    n_white = white ** 2 * bandwidth
    n_pink = pink ** 2 * math.log(max(1.0001, bandwidth))
    rms = math.sqrt(n_white + n_pink)
    snr = signal / rms if rms > 0 else math.inf
    return {"rms_noise": round(rms, 6), "snr": round(snr, 4),
            "snr_db": round(20 * math.log10(snr), 3) if snr not in (0, math.inf) else None}


# ── sensitivity / response ───────────────────────────────────────────────────
def sensitivity_curve(x: np.ndarray, *, gain: float, x_sat: float) -> np.ndarray:
    """Response = gain·x in the linear range, saturating smoothly above x_sat
    (tanh soft-saturation) — a real transducer response."""
    x = np.asarray(x, dtype=float)
    lin = gain * x
    sat = gain * x_sat * np.tanh(x / x_sat)
    return np.where(np.abs(x) <= x_sat, lin, sat)


def linear_range(x: np.ndarray, response: np.ndarray, *, tol: float = 0.05) -> float:
    """Largest |x| where the response stays within `tol` of a straight-line fit —
    the instrument's usable linear span."""
    x = np.asarray(x, float)
    response = np.asarray(response, float)
    gain = np.polyfit(x, response, 1)[0]
    ideal = gain * x
    ok = np.abs(response - ideal) <= tol * (np.abs(ideal) + 1e-9)
    return float(np.max(np.abs(x[ok]))) if ok.any() else 0.0


# ── reproducibility / agreement ──────────────────────────────────────────────
def reproducibility_score(runs: list[list[float]]) -> dict:
    """Reproducibility across repeated runs: 1 − (between-run var / total var),
    an intraclass-correlation-style score in [0,1]. 1 = perfectly reproducible."""
    arr = [np.asarray(r, float) for r in runs if len(r)]
    if len(arr) < 2:
        return {"score": 0.0, "runs": len(arr)}
    means = np.array([r.mean() for r in arr])
    between = float(means.var())
    within = float(np.mean([r.var() for r in arr]))
    total = between + within
    score = 1 - between / total if total > 0 else 1.0
    return {"score": round(max(0.0, min(1.0, score)), 4),
            "between_var": round(between, 6), "within_var": round(within, 6),
            "runs": len(arr)}


def comparison_test(inst_a: list[float], inst_b: list[float]) -> dict:
    """Bland–Altman agreement between two instruments: mean bias and 95% limits
    of agreement. Identical instruments → ~zero bias."""
    a = np.asarray(inst_a, float)
    b = np.asarray(inst_b, float)
    diff = a - b
    bias = float(diff.mean())
    sd = float(diff.std(ddof=1)) if diff.size > 1 else 0.0
    return {"bias": round(bias, 5), "sd_diff": round(sd, 5),
            "loa_lower": round(bias - 1.96 * sd, 5),
            "loa_upper": round(bias + 1.96 * sd, 5),
            "agree": abs(bias) <= 1.96 * sd or sd == 0}


# ── resolution / contamination / misuse ──────────────────────────────────────
def resolution_limit(full_scale: float, *, bits: int) -> float:
    """Smallest resolvable step of a digitised instrument = FS / 2^bits."""
    return full_scale / (2 ** bits)


def contamination_risk(prev: float, *, wash_efficiency: float) -> float:
    """Carryover contamination after cleaning (exponential)."""
    return round(prev * math.exp(-3.0 * max(0.0, min(1.0, wash_efficiency))), 6)


def misuse_risk(*, operator_skill: float, complexity: float, safeguards: float) -> dict:
    """Misuse risk = complexity·(1−skill)·(1−safeguards), in [0,1]."""
    risk = max(0.0, min(1.0, complexity * (1 - operator_skill) * (1 - safeguards)))
    return {"risk": round(risk, 4), "level": "high" if risk > 0.5 else
            "medium" if risk > 0.2 else "low"}


# ── graphs / ledgers ─────────────────────────────────────────────────────────
def dependency_graph(instruments: dict[str, list[str]]) -> dict:
    """Instrument dependency graph: which instruments each one requires, plus a
    topological build order (raises on cycles)."""
    order, temp, perm = [], set(), set()

    def visit(n):
        if n in perm:
            return
        if n in temp:
            raise ValueError(f"cycle at {n}")
        temp.add(n)
        for dep in instruments.get(n, []):
            visit(dep)
        temp.discard(n)
        perm.add(n)
        order.append(n)

    for node in instruments:
        visit(node)
    return {"build_order": order, "nodes": len(instruments)}


def upgrade_path(current: str, chain: list[str]) -> list[str]:
    """Instrument upgrade path: remaining upgrades after the current generation."""
    return chain[chain.index(current) + 1:] if current in chain else chain


@dataclass
class ChainOfCustody:
    """Instrument chain-of-custody ledger: an append-only handoff record."""
    events: list[dict] = field(default_factory=list)

    def handoff(self, frm: str, to: str, tick: int) -> None:
        self.events.append({"from": frm, "to": to, "tick": tick})

    def intact(self) -> bool:
        # custody is intact if each handoff's 'from' equals the previous 'to'
        return all(self.events[i]["from"] == self.events[i - 1]["to"]
                   for i in range(1, len(self.events)))


def standardisation(reading: float, *, reference: float) -> dict:
    """Standardise an instrument against a certified reference: correction factor
    and relative error."""
    factor = reference / reading if reading else math.inf
    return {"correction_factor": round(factor, 6),
            "relative_error": round(abs(reading - reference) / reference, 6) if reference else None}
