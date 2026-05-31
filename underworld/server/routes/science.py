"""Science-tooling API (expansion #71-80)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_bearer
from ..services import science

router = APIRouter(prefix="/science", tags=["science"])


class BayesRequest(BaseModel):
    prior: float
    p_e_given_h: float
    p_e_given_not_h: float


@router.post("/bayes")
async def bayes(body: BayesRequest, _token: str = Depends(require_bearer)):
    """#71 — update a hypothesis's probability from new evidence."""
    return {"posterior": round(science.bayes_update(body.prior, body.p_e_given_h, body.p_e_given_not_h), 6)}


class MeasureRequest(BaseModel):
    readings: list[float]
    true_value: float | None = None


@router.post("/measurement")
async def measurement(body: MeasureRequest, _token: str = Depends(require_bearer)):
    """#72/#73 — measurement statistics, confidence interval, and calibration."""
    stats = science.measurement_stats(body.readings)
    ci = science.confidence_interval(stats["mean"], stats["std"], stats["n"])
    out = {**stats, "confidence_interval": list(ci)}
    if body.true_value is not None:
        out["calibration"] = science.calibrate(body.readings, body.true_value)
    return out


class FormulaRequest(BaseModel):
    equation: str
    units: dict[str, str]


@router.post("/parse-formula")
async def parse_formula(body: FormulaRequest, _token: str = Depends(require_bearer)):
    """#75 — parse + dimensionally validate an equation against the unit ledger."""
    try:
        return science.parse_equation(body.equation, body.units)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class PriorArtRequest(BaseModel):
    patents: list[dict]


@router.post("/prior-art")
async def prior_art(body: PriorArtRequest, _token: str = Depends(require_bearer)):
    """#77 — link patents by shared physics (laws/materials/functions)."""
    return {"edges": science.prior_art_graph(body.patents)}


class MasteryRequest(BaseModel):
    accuracy: float
    repeatability: float
    explanation: float


@router.post("/mastery")
async def mastery(body: MasteryRequest, _token: str = Depends(require_bearer)):
    """#78 — mastery score = accuracy × repeatability × explanation quality."""
    return {"mastery": science.mastery_by_demonstration(body.accuracy, body.repeatability, body.explanation)}


class BuildingCodeRequest(BaseModel):
    capacity: float
    demand: float
    required: float = 1.5


@router.post("/building-code")
async def building_code(body: BuildingCodeRequest, _token: str = Depends(require_bearer)):
    """#83 — structural safety factor + inspector verdict."""
    from ..services import engineering
    sf = engineering.safety_factor(body.capacity, body.demand)
    return {"safety_factor": round(sf, 4) if sf != float("inf") else None,
            "passes": engineering.building_code_ok(body.capacity, body.demand, required=body.required)}


class EthicsRequest(BaseModel):
    severity: float
    likelihood: float
    irreversibility: float
    misuse: float
    threshold: float = 0.3


@router.post("/ethics-gate")
async def ethics_gate(body: EthicsRequest, _token: str = Depends(require_bearer)):
    """#90 — ethical-technology review gate."""
    from ..services import engineering
    return engineering.ethical_review(body.severity, body.likelihood, body.irreversibility,
                                      body.misuse, threshold=body.threshold)


class AnomalyRequest(BaseModel):
    observed: float
    predicted: float
    uncertainty: float


@router.post("/anomaly")
async def anomaly(body: AnomalyRequest, _token: str = Depends(require_bearer)):
    """#100 — meta physics-law debugger: residual + discovery flag."""
    from ..services import engineering
    return engineering.anomaly(body.observed, body.predicted, body.uncertainty)
