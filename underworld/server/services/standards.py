"""Standards & Units — the invisible scaffolding of industrial civilisation.

The design's "big-missing": without standards, industrial civilisation fails.
You cannot mass-produce a rifle, a steam engine, or a microchip if every shop
measures the "inch" differently and every bolt is hand-fitted to one hole. The
milestone that turns craft into industry is *interchangeable parts*: any part
from the batch fits any assembly, because every part lands inside a shared
tolerance band against a shared standard.

Pure core — no DB, no async, no LLM. Four ideas live here:

  unit_system_maturity()    how far the civ has come from "every village its own
                            cubit" toward a coherent, calibrated unit system.
  calibrate()               fit an offset+scale correction from readings vs a
                            known reference, and report the residual error.
  tolerance_class()         engineering tolerance check against tightening grades
                            (coarse → precision), the IT-grade idea.
  interchangeability()      does a *batch* of parts hold a shared tolerance —
                            the milestone that makes mass production possible.
"""
from __future__ import annotations

from dataclasses import dataclass


# ── snapshot helper (matches the civos house style) ──────────────────────────
def _get(snapshot: dict, *path, default=None):
    """Read snapshot[a][b]... tolerantly; a missing branch yields `default`."""
    cur = snapshot
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


# The progression of metrological standards, easiest → hardest to establish.
# Each is a flag the civ either has invented (truthy) or not, in snapshot
# under "standards". Later standards presuppose the discipline of earlier ones.
_STANDARD_FLAGS: tuple[str, ...] = (
    "units",                  # agreed base units at all
    "calibration",            # the practice of calibrating instruments
    "weights_and_measures",   # an enforced public reference (a standards body)
    "standard_temp_pressure", # agreed reference conditions for experiments
    "tolerances",             # engineering tolerance grades for manufacture
)


# Tolerance grades: the fractional band a dimension may deviate by, tightening
# from rough blacksmithing to precision machining (the IT-grade analogy).
_GRADE_BAND: dict[str, float] = {
    "coarse": 5.0e-2,
    "medium": 1.0e-2,
    "fine": 2.0e-3,
    "precision": 2.0e-4,
}

_DEFAULT_GRADE = "medium"


# Which standards bodies a civilisation needs once it reaches a tech level. Keyed
# by the minimum tech_level (0..1) at which the gap becomes a real liability.
_STANDARDS_BY_TECH: tuple[tuple[float, str], ...] = (
    (0.0, "units"),
    (0.2, "calibration"),
    (0.4, "weights_and_measures"),
    (0.6, "standard_temp_pressure"),
    (0.8, "tolerances"),
)


@dataclass(frozen=True)
class Calibration:
    """An offset+scale correction fit and the error left after applying it."""

    offset: float
    scale: float
    residual_error: float


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _band_for(grade: str) -> float:
    return _GRADE_BAND.get(grade, _GRADE_BAND[_DEFAULT_GRADE])


# ── how mature is the civ's measurement culture? ─────────────────────────────
def unit_system_maturity(snapshot: dict) -> float:
    """0..1 fraction of the standards progression the civ has established.

    Reads `snapshot["standards"]` for invented/calibration/weights-and-measures/
    standard-temp-pressure/tolerances flags. A civ with none of them is at 0
    (every village its own cubit); a civ with all of them is at 1 (ready to
    industrialise). Missing snapshot data reads as "not yet invented".
    """
    standards = _get(snapshot, "standards", default={}) or {}
    have = sum(1 for flag in _STANDARD_FLAGS if standards.get(flag))
    return round(have / len(_STANDARD_FLAGS), 3)


# ── calibrating an instrument against a known reference ──────────────────────
def calibrate(readings: list[float], reference: float) -> dict:
    """Fit a correction that maps `readings` of a known `reference` onto truth.

    Pure statistics, no fitting library. We assume the readings are repeated
    measurements of the single true value `reference`, so the systematic offset
    is `reference - mean(readings)` and the scale is `reference / mean(readings)`
    (1.0 when the mean is already right). The residual error is the RMS spread
    of the readings after removing their mean — the random part calibration
    cannot fix. Returns offset, scale, residual_error, and the corrected mean.
    """
    if not readings:
        return {"offset": 0.0, "scale": 1.0, "residual_error": 0.0,
                "corrected_mean": reference}
    n = len(readings)
    mean = sum(readings) / n
    offset = reference - mean
    scale = reference / mean if mean != 0.0 else 1.0
    variance = sum((r - mean) ** 2 for r in readings) / n
    residual = variance ** 0.5
    corrected_mean = mean + offset
    return {
        "offset": offset,
        "scale": scale,
        "residual_error": residual,
        "corrected_mean": corrected_mean,
    }


# ── a single part: does it meet a tolerance grade? ───────────────────────────
def tolerance_class(actual: float, nominal: float, *, grade: str = _DEFAULT_GRADE) -> dict:
    """Check a measured dimension against its nominal at a tolerance `grade`.

    The allowed deviation is `|nominal| * band(grade)`, where the band tightens
    coarse → medium → fine → precision. A part is within tolerance when its
    absolute deviation falls inside that band. Returns the verdict, the actual
    deviation, the allowed band, and the grade used.
    """
    band = _band_for(grade)
    allowed = abs(nominal) * band if nominal != 0.0 else band
    deviation = abs(actual - nominal)
    return {
        "within_tolerance": deviation <= allowed,
        "deviation": deviation,
        "allowed": allowed,
        "grade": grade if grade in _GRADE_BAND else _DEFAULT_GRADE,
    }


# ── a batch of parts: are they interchangeable? ──────────────────────────────
def interchangeability(parts: list[dict], *, grade: str = _DEFAULT_GRADE) -> dict:
    """Is a batch of parts interchangeable within a shared tolerance `grade`?

    The interchangeable-parts milestone: every part must fit any assembly, so
    every part's `dimension` must land inside the tolerance band around the
    *batch nominal* (the mean dimension). If the worst part strays outside the
    band, the batch is not interchangeable and we name the offenders by index.
    Returns interchangeable, max_deviation, the nominal used, and failures.
    """
    dims = [float(p.get("dimension", 0.0)) for p in parts]
    if not dims:
        return {"interchangeable": True, "max_deviation": 0.0,
                "nominal": 0.0, "failures": []}
    nominal = sum(dims) / len(dims)
    band = _band_for(grade)
    allowed = abs(nominal) * band if nominal != 0.0 else band
    failures: list[int] = []
    max_deviation = 0.0
    for idx, dim in enumerate(dims):
        deviation = abs(dim - nominal)
        max_deviation = max(max_deviation, deviation)
        if deviation > allowed:
            failures.append(idx)
    return {
        "interchangeable": len(failures) == 0,
        "max_deviation": max_deviation,
        "nominal": nominal,
        "failures": failures,
    }


# ── which standards is the civ still missing for its tech level? ─────────────
def standards_gaps(snapshot: dict) -> list[str]:
    """Standards the civ *should* have at its tech level but hasn't established.

    Reads `snapshot["tech_level"]` (0..1) and `snapshot["standards"]`. Any
    standard whose tech threshold has been reached but whose flag is unset is a
    gap — a liability that will eventually stall industrialisation. Sorted by
    the order standards naturally appear, for deterministic output.
    """
    tech_level = _clamp(float(_get(snapshot, "tech_level", default=0.0) or 0.0))
    standards = _get(snapshot, "standards", default={}) or {}
    gaps: list[str] = []
    for threshold, flag in _STANDARDS_BY_TECH:
        if tech_level >= threshold and not standards.get(flag):
            gaps.append(flag)
    return gaps
