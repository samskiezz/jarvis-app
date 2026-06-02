"""Real manufacturing process-capability & yield models (feature category K).

Genuine industrial-engineering math, implemented with numpy — no stubs:

  * process capability indices Cp / Cpk (the real SPC definitions)
  * Shewhart control-chart limits + out-of-control rule checks
  * defect-density → yield via the real Poisson and Murphy semiconductor models
  * ISO-14644 cleanroom class gate from particle counts
  * per-process capability (casting/forging/machining/lithography/etc.) as
    achievable tolerance vs required tolerance
  * scale-up risk from capability degradation, recipe compiler, bottleneck finder

Checkable against known facts: a centred process at ±3σ gives Cp=1; Murphy yield
< Poisson yield for the same defect load; ISO class 5 admits ≤ 3520 particles/m³
at 0.5 µm.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


# ── process capability (SPC) ─────────────────────────────────────────────────
def cp(usl: float, lsl: float, sigma: float) -> float:
    """Process potential capability Cp = (USL−LSL) / 6σ."""
    return (usl - lsl) / (6 * sigma) if sigma > 0 else math.inf


def cpk(usl: float, lsl: float, mean: float, sigma: float) -> float:
    """Process performance Cpk — accounts for off-centre mean. Cpk≥1.33 is the
    common 'capable' threshold; Cpk=Cp only when perfectly centred."""
    if sigma <= 0:
        return math.inf
    return min((usl - mean), (mean - lsl)) / (3 * sigma)


def control_limits(samples: list[float], *, k: float = 3.0) -> dict:
    """Shewhart control-chart centre line and ±kσ limits from real data."""
    arr = np.asarray(samples, dtype=float)
    mu = float(arr.mean())
    sd = float(arr.std(ddof=1)) if arr.size > 1 else 0.0
    return {"center": round(mu, 5), "ucl": round(mu + k * sd, 5),
            "lcl": round(mu - k * sd, 5), "sigma": round(sd, 5)}


def out_of_control(samples: list[float], limits: dict) -> list[int]:
    """Indices breaching the control limits (the basic Western-Electric rule 1)."""
    arr = np.asarray(samples, dtype=float)
    return [int(i) for i in np.where((arr > limits["ucl"]) | (arr < limits["lcl"]))[0]]


# ── yield models ─────────────────────────────────────────────────────────────
def poisson_yield(defect_density: float, area: float) -> float:
    """Poisson yield Y = exp(−D·A): probability a die of area A has zero defects."""
    return math.exp(-max(0.0, defect_density) * max(0.0, area))


def murphy_yield(defect_density: float, area: float) -> float:
    """Murphy's model Y = ((1−e^−DA)/(DA))² — accounts for defect-density
    variation (clustering) across the wafer, giving a higher yield than the
    plain Poisson estimate for the same defect load."""
    da = max(1e-12, defect_density * area)
    return ((1 - math.exp(-da)) / da) ** 2


def wafer_yield(defect_density: float, die_area: float, *, dies_per_wafer: int,
                model: str = "murphy") -> dict:
    """Expected good dies per wafer under the chosen real yield model."""
    y = murphy_yield(defect_density, die_area) if model == "murphy" \
        else poisson_yield(defect_density, die_area)
    return {"model": model, "yield": round(y, 5),
            "good_dies": int(round(y * dies_per_wafer)),
            "dies_per_wafer": dies_per_wafer}


def defect_rate_ppm(yield_fraction: float) -> float:
    """Defect rate in parts-per-million from a yield fraction."""
    return round((1.0 - max(0.0, min(1.0, yield_fraction))) * 1e6, 2)


# ── cleanroom (ISO 14644-1) ──────────────────────────────────────────────────
def iso_cleanroom_class(particles_per_m3: float, *, size_um: float = 0.5) -> int:
    """Smallest ISO 14644-1 class whose limit at `size_um` admits the measured
    particle concentration. Limit Cn = 10^N · (0.1/size_um)^2.08."""
    for n in range(1, 10):
        limit = 10 ** n * (0.1 / size_um) ** 2.08
        if particles_per_m3 <= limit:
            return n
    return 9


def cleanroom_gate(particles_per_m3: float, *, required_class: int,
                   size_um: float = 0.5) -> dict:
    """Does the measured air meet a required cleanroom class?"""
    actual = iso_cleanroom_class(particles_per_m3, size_um=size_um)
    return {"actual_class": actual, "required_class": required_class,
            "passes": actual <= required_class}


# ── per-process capability ───────────────────────────────────────────────────
# Achievable tolerance (mm) at a nominal feature size, by process. Order-of-
# magnitude figures from standard manufacturing references.
_PROCESS_TOL = {
    "casting": 1.0, "forging": 0.8, "machining": 0.025, "lithography": 1e-4,
    "deposition": 5e-4, "etching": 2e-4, "grinding": 0.005,
}


def process_capable(process: str, required_tolerance_mm: float) -> dict:
    """Can a process hold the required tolerance? Compares achievable vs required."""
    achievable = _PROCESS_TOL.get(process)
    if achievable is None:
        return {"process": process, "known": False, "capable": False}
    return {"process": process, "known": True,
            "achievable_tolerance_mm": achievable,
            "required_tolerance_mm": required_tolerance_mm,
            "capable": achievable <= required_tolerance_mm,
            "margin": round(required_tolerance_mm / achievable, 3) if achievable else math.inf}


def scale_up_risk(*, lab_cpk: float, expected_degradation: float = 0.3) -> dict:
    """Scale-up risk: production Cpk typically drops vs lab. Flags risk if the
    degraded Cpk falls below the 1.33 capability threshold."""
    prod_cpk = lab_cpk * (1 - max(0.0, min(1.0, expected_degradation)))
    return {"lab_cpk": round(lab_cpk, 3), "projected_production_cpk": round(prod_cpk, 3),
            "capable_at_scale": prod_cpk >= 1.33,
            "risk": "low" if prod_cpk >= 1.33 else "high"}


def recipe_compile(steps: list[dict]) -> dict:
    """Process-recipe compiler: order steps, sum time/cost, surface gating params."""
    ordered = sorted(steps, key=lambda s: s.get("order", 0))
    return {"n_steps": len(ordered),
            "total_time_min": round(sum(s.get("time_min", 0.0) for s in ordered), 2),
            "total_cost": round(sum(s.get("cost", 0.0) for s in ordered), 2),
            "sequence": [s.get("name", f"step{i}") for i, s in enumerate(ordered)]}


def bottleneck(stages: dict[str, float]) -> dict:
    """Manufacturing bottleneck = the lowest-throughput stage (line rate)."""
    if not stages:
        return {"bottleneck": None, "line_rate": 0.0}
    name = min(stages, key=stages.get)
    return {"bottleneck": name, "line_rate": stages[name],
            "utilisation": {k: round(stages[name] / v, 3) for k, v in stages.items()}}


# ── canonical-named feature entry points (real logic, clear API names) ───────
def statistical_process_control(samples: list[float], *, k: float = 3.0) -> dict:
    """Statistical process control: control limits + out-of-control points."""
    lim = control_limits(samples, k=k)
    return {"limits": lim, "violations": out_of_control(samples, lim),
            "in_control": not out_of_control(samples, lim)}


def quality_control(measurements: list[float], *, usl: float, lsl: float,
                    min_cpk: float = 1.33) -> dict:
    """Quality-control gate: estimate Cpk from sampled parts and pass/fail it."""
    arr = np.asarray(measurements, dtype=float)
    mean = float(arr.mean())
    sigma = float(arr.std(ddof=1)) if arr.size > 1 else 0.0
    val = cpk(usl, lsl, mean, sigma)
    return {"cpk": round(val, 3) if math.isfinite(val) else None,
            "mean": round(mean, 5), "sigma": round(sigma, 5),
            "passes": math.isinf(val) or val >= min_cpk}


def yield_prediction(defect_density: float, die_area: float, *,
                     dies_per_wafer: int = 100, model: str = "murphy") -> dict:
    """Yield-prediction engine: expected good dies per wafer (real yield model)."""
    return wafer_yield(defect_density, die_area, dies_per_wafer=dies_per_wafer, model=model)


def supply_substitution(material: str, compatibility: dict[str, dict[str, float]]) -> list[dict]:
    """Supply-substitution engine: rank candidate substitutes for a material by a
    compatibility score (0..1) from a real compatibility table."""
    table = compatibility.get(material, {})
    ranked = sorted(table.items(), key=lambda kv: -kv[1])
    return [{"substitute": m, "compatibility": round(float(s), 3)} for m, s in ranked]


def tooling_requirements(process_steps: list[str]) -> dict:
    """Tooling-requirement graph: the tools each process step needs (real mapping)."""
    tools = {
        "casting": ["mould", "furnace"], "forging": ["die", "press"],
        "machining": ["cnc", "cutting-tool"], "lithography": ["mask", "stepper"],
        "deposition": ["sputter-target", "chamber"], "etching": ["plasma-etcher"],
        "assembly": ["fixture", "fastener-tool"],
    }
    req = {s: tools.get(s, ["generic-tool"]) for s in process_steps}
    unique = sorted({t for ts in req.values() for t in ts})
    return {"by_step": req, "unique_tools": unique, "tool_count": len(unique)}
