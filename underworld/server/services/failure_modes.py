"""Failure Modes + Safety-Engineering Layer.

The design's "big-missing" rule, stated bluntly: *every invention should fail.*
A simulation in which prototypes work first time and forever is a fantasy, not
an engine of civilisation. Real artifacts wear, fatigue, corrode, overheat, get
mis-assembled, run on counterfeit parts, and are operated by tired Minions. The
ones that don't kill anyone do so because somebody did the safety engineering.

This module is two pure, unit-testable cores (no DB, no LLM):

  FailureMode / FailureRisk   the vocabulary of how things break, scored.
  fmea                        a Failure Mode & Effects Analysis — read a
                              device's properties, emit ranked risks (highest
                              Risk Priority Number first). Real reliability work.
  mean_time_to_failure        aggregate MTTF from the combined hazard rate.
  SafetyCheck / safety_assessment
                              fire / pressure-vessel / electrical-isolation /
                              ventilation / guard checks → pass, violations,
                              and the controls the design must add.

Nothing here invents facts. It relates a device's physical properties to the
ways physics will eventually defeat it.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


# ── how things break ─────────────────────────────────────────────────────────
class FailureMode(str, Enum):
    """The catalogue of ways an artifact fails in service."""

    WEAR = "wear"
    FATIGUE = "fatigue"
    CORROSION = "corrosion"
    OVERHEATING = "overheating"
    CONTAMINATION = "contamination"
    MISASSEMBLY = "misassembly"
    POOR_MAINTENANCE = "poor_maintenance"
    OPERATOR_ERROR = "operator_error"
    COUNTERFEIT_PARTS = "counterfeit_parts"
    SUPPLY_SHORTAGE = "supply_shortage"
    DESIGN_DEFECT = "design_defect"


@dataclass(frozen=True)
class FailureRisk:
    """One row of an FMEA worksheet.

    probability   how likely the mode is to occur (0..1)
    severity      how bad the consequence is if it does (0..1)
    detectability how readily it is caught before harm (0..1; higher = easier)
    rpn           Risk Priority Number — the classic FMEA ranking score. Here
                  ``prob * severity * (1 - detectability) * 1000`` so that a
                  likely, severe, *undetectable* mode dominates the ranking.
    """

    mode: FailureMode
    probability: float
    severity: float
    detectability: float
    rpn: float


def _risk(
    mode: FailureMode,
    probability: float,
    severity: float,
    detectability: float,
) -> FailureRisk:
    """Build a FailureRisk with a computed RPN, clamping inputs to 0..1."""
    p = min(max(probability, 0.0), 1.0)
    s = min(max(severity, 0.0), 1.0)
    d = min(max(detectability, 0.0), 1.0)
    rpn = round(p * s * (1.0 - d) * 1000.0, 3)
    return FailureRisk(mode=mode, probability=p, severity=s, detectability=d, rpn=rpn)


# ── the analysis: device properties → ranked risks ───────────────────────────
def fmea(device: dict) -> list[FailureRisk]:
    """Failure Mode & Effects Analysis for a device.

    Reads the device's properties and emits a ranked list of FailureRisks,
    highest RPN first. Properties understood (all optional, with safe defaults):

        materials        : list[str]   — e.g. ["steel", "rubber"]
        operating_temp   : float       — degrees C in service
        complexity       : float 0..1  — part count / assembly intricacy
        maintenance_level: float 0..1  — 0 neglected, 1 meticulously serviced
        environment      : str         — "benign" | "humid" | "marine" |
                                         "corrosive" | "dusty" | ...

    Each mode's probability/severity/detectability is derived from those
    properties; modes that cannot apply are dropped. The ranking is the heart
    of reliability triage — fix the top of the list first.
    """
    materials = [m.lower() for m in device.get("materials", [])]
    temp = float(device.get("operating_temp", 20.0))
    complexity = min(max(float(device.get("complexity", 0.3)), 0.0), 1.0)
    maint = min(max(float(device.get("maintenance_level", 0.5)), 0.0), 1.0)
    environment = str(device.get("environment", "benign")).lower()

    neglect = 1.0 - maint
    wet = environment in ("humid", "marine", "corrosive", "wet")
    dirty = environment in ("dusty", "corrosive", "marine")
    corrodible = any(
        m in ("steel", "iron", "copper", "aluminum", "aluminium", "bronze")
        for m in materials
    )

    risks: list[FailureRisk] = []

    # Wear — moving, serviced parts; worsens with neglect and complexity.
    risks.append(_risk(
        FailureMode.WEAR,
        probability=0.25 + 0.4 * neglect + 0.2 * complexity,
        severity=0.4 + 0.2 * complexity,
        detectability=0.6 + 0.3 * maint,
    ))

    # Fatigue — cyclic stress; severe and hard to see early.
    risks.append(_risk(
        FailureMode.FATIGUE,
        probability=0.15 + 0.35 * complexity,
        severity=0.6 + 0.3 * complexity,
        detectability=0.25 + 0.2 * maint,
    ))

    # Corrosion — only when a corrodible material meets a wet/dirty environment.
    if corrodible and (wet or dirty):
        risks.append(_risk(
            FailureMode.CORROSION,
            probability=0.3 + 0.5 * (1.0 if wet else 0.4),
            severity=0.5,
            detectability=0.5 + 0.3 * maint,
        ))

    # Overheating — scales hard once operating temperature climbs.
    if temp > 60.0:
        heat = min((temp - 60.0) / 240.0, 1.0)
        risks.append(_risk(
            FailureMode.OVERHEATING,
            probability=0.2 + 0.7 * heat,
            severity=0.5 + 0.4 * heat,
            detectability=0.55,
        ))

    # Contamination — dusty/dirty environments foul mechanisms.
    if dirty:
        risks.append(_risk(
            FailureMode.CONTAMINATION,
            probability=0.3 + 0.4 * complexity,
            severity=0.35,
            detectability=0.55,
        ))

    # Misassembly — likelier as complexity rises; insidiously hard to detect.
    risks.append(_risk(
        FailureMode.MISASSEMBLY,
        probability=0.1 + 0.5 * complexity,
        severity=0.55,
        detectability=0.35,
    ))

    # Poor maintenance — directly proportional to neglect.
    if neglect > 0.0:
        risks.append(_risk(
            FailureMode.POOR_MAINTENANCE,
            probability=0.2 + 0.6 * neglect,
            severity=0.45,
            detectability=0.5 + 0.3 * maint,
        ))

    # Operator error — complex machines invite mistakes; severe, hard to catch.
    risks.append(_risk(
        FailureMode.OPERATOR_ERROR,
        probability=0.15 + 0.4 * complexity,
        severity=0.5,
        detectability=0.3,
    ))

    # Design defect — latent in complex designs, by definition hard to detect.
    risks.append(_risk(
        FailureMode.DESIGN_DEFECT,
        probability=0.1 + 0.3 * complexity,
        severity=0.6,
        detectability=0.2,
    ))

    risks.sort(key=lambda r: r.rpn, reverse=True)
    return risks


# ── aggregate reliability: mean time to failure ──────────────────────────────
def mean_time_to_failure(risks: list[FailureRisk], *, base_hours: float) -> float:
    """Aggregate MTTF (hours) from the combined hazard of all failure modes.

    Each mode contributes a hazard proportional to its probability-weighted
    severity-undetectability (its RPN). Hazards add (a series-reliability
    assumption — any mode can down the device), and MTTF is the reciprocal of
    the total hazard rate scaled by ``base_hours``::

        MTTF = base_hours / (1 + total_hazard)

    More and worse risks drive the denominator up, so MTTF falls monotonically
    as the risk profile worsens. A device with no listed risks lasts the full
    ``base_hours``.
    """
    total_hazard = sum(r.rpn for r in risks) / 1000.0
    return round(base_hours / (1.0 + total_hazard), 3)


# ── safety engineering: required-controls assessment ─────────────────────────
class SafetyCheck(str, Enum):
    """Engineering-safety domains a device is assessed against."""

    FIRE = "fire"
    PRESSURE_VESSEL = "pressure_vessel"
    ELECTRICAL_ISOLATION = "electrical_isolation"
    VENTILATION = "ventilation"
    GUARDS = "guards"


def safety_assessment(device: dict) -> dict:
    """Assess a device against the engineering-safety checks.

    Reads device properties and decides which hazards are present and whether
    each is controlled. Properties understood (all optional):

        operating_temp   : float    — fire hazard above flash threshold
        flammable        : bool      — flammable materials/fuel present
        pressure         : float kPa — pressure-vessel hazard
        voltage          : float V   — electrical hazard
        emits_fumes      : bool      — needs ventilation
        moving_parts     : bool      — needs guards
        controls         : list[str] — controls already designed in (names match
                                       the synthetic identifiers below)

    Returns::

        {"passed": bool,
         "violations": list[str],       # hazards present but uncontrolled
         "required_controls": list[str]}  # controls the design must add

    ``passed`` is True only when every present hazard has its control. The
    spec's high-pressure / high-voltage device therefore fails unless it carries
    a pressure-relief valve and electrical isolation.
    """
    temp = float(device.get("operating_temp", 20.0))
    flammable = bool(device.get("flammable", False))
    pressure = float(device.get("pressure", 0.0))
    voltage = float(device.get("voltage", 0.0))
    emits_fumes = bool(device.get("emits_fumes", False))
    moving_parts = bool(device.get("moving_parts", False))
    controls = {c.lower() for c in device.get("controls", [])}

    # Each hazard maps to (is-present, check, required-control identifier).
    hazards = [
        (flammable or temp > 200.0, SafetyCheck.FIRE, "fire_suppression"),
        (pressure > 150.0, SafetyCheck.PRESSURE_VESSEL, "pressure_relief_valve"),
        (voltage > 50.0, SafetyCheck.ELECTRICAL_ISOLATION, "electrical_isolation"),
        (emits_fumes, SafetyCheck.VENTILATION, "ventilation"),
        (moving_parts, SafetyCheck.GUARDS, "machine_guards"),
    ]

    violations: list[str] = []
    required_controls: list[str] = []
    for present, check, control in hazards:
        if not present:
            continue
        if control not in controls:
            violations.append(check.value)
            required_controls.append(control)

    return {
        "passed": len(violations) == 0,
        "violations": violations,
        "required_controls": required_controls,
    }
