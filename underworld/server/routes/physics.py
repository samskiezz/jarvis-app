"""Physics engine routes — laws, constants, limits, and a live solver.

These back the Knowledge/physics panel: the frontend can list the computable
laws, read the world's hard limits, and POST real inputs to /physics/solve to
get a genuinely computed answer (same engine the minions learn on).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth import require_bearer
from ..physics import constants as physics_constants
from ..physics import engine as physics_engine

router = APIRouter(prefix="/physics", tags=["physics"])


class SolveRequest(BaseModel):
    law_id: str
    inputs: dict[str, float]


@router.get("/laws")
async def list_laws(
    discipline: str | None = Query(default=None),
    _token: str = Depends(require_bearer),
):
    laws = physics_engine.list_laws(discipline)
    return {"count": len(laws), "laws": [law.to_dict() for law in laws]}


@router.get("/constants")
async def constants(_token: str = Depends(require_bearer)):
    return {"constants": physics_constants.as_dicts()}


@router.get("/limits")
async def limits(_token: str = Depends(require_bearer)):
    return physics_engine.world_limits()


@router.get("/laws/{law_id}")
async def get_law(law_id: str, _token: str = Depends(require_bearer)):
    law = physics_engine.get_law(law_id)
    if law is None:
        raise HTTPException(status_code=404, detail=f"unknown law {law_id!r}")
    return law.to_dict()


@router.post("/solve")
async def solve(req: SolveRequest, _token: str = Depends(require_bearer)):
    try:
        return physics_engine.compute(req.law_id, req.inputs)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown law {req.law_id!r}")
    except (ValueError, ZeroDivisionError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/assess")
async def assess(payload: dict, _token: str = Depends(require_bearer)):
    """Assess free-text invention against physical limits (used by tooling)."""
    text = str(payload.get("text") or "")
    a = physics_engine.assess_invention(text)
    return {"feasibility": a.feasibility, "violates_limit": a.violates_limit, "notes": a.notes}


# ── Physics kernel (Unit Ledger / Conservation Auditor / Violation Alarm) ────

class FeasibilityRequest(BaseModel):
    claim: dict = {}
    materials_available: bool = True


@router.post("/kernel/feasibility")
async def kernel_feasibility(body: FeasibilityRequest, _token: str = Depends(require_bearer)):
    """Patent Feasibility Gate — physics + materials check on a structured claim."""
    from ..physics import violations
    return violations.feasibility_gate(body.claim, materials_available=body.materials_available)


class ConserveRequest(BaseModel):
    before: dict = {}
    after: dict = {}
    sources: dict = {}


@router.post("/kernel/conserve")
async def kernel_conserve(body: ConserveRequest, _token: str = Depends(require_bearer)):
    """Conservation Auditor — does mass/energy/momentum/charge balance?"""
    from ..physics import conservation
    res = conservation.audit(body.before, body.after, sources=body.sources)
    return {
        "conserved": conservation.all_conserved(res),
        "ledger": [
            {"quantity": r.quantity, "before": r.before, "after": r.after,
             "delta": r.delta, "conserved": r.conserved}
            for r in res
        ],
    }


@router.get("/kernel/units")
async def kernel_units(_token: str = Depends(require_bearer)):
    """The SI unit ledger — known dimensions and their base-unit signatures."""
    from ..physics.dimensions import BASE, UNITS
    return {
        "base": list(BASE),
        "units": {name: {"signature": str(dim), "exps": list(dim.exps)} for name, dim in UNITS.items()},
    }


class StabilityRequest(BaseModel):
    velocity: float
    dt: float
    dx: float


@router.post("/kernel/stability")
async def kernel_stability(body: StabilityRequest, _token: str = Depends(require_bearer)):
    """Solver Fidelity Ladder — Courant stability + largest stable timestep."""
    from ..physics import fidelity
    return {
        "courant": round(fidelity.courant_number(body.velocity, body.dt, body.dx), 4),
        "stable": fidelity.is_stable(body.velocity, body.dt, body.dx),
        "max_stable_dt": fidelity.max_stable_dt(body.velocity, body.dx),
    }


class EquationCheckRequest(BaseModel):
    # each term is a list of [unit_name, exponent] pairs multiplied together
    terms: list[list[list]] = []


@router.post("/kernel/check-equation")
async def kernel_check_equation(body: EquationCheckRequest, _token: str = Depends(require_bearer)):
    """Dimensional Debugger — verify every term of an equation shares dimensions."""
    from ..physics.dimensions import DIMENSIONLESS, DimensionError, unit

    resolved = []
    for term in body.terms:
        d = DIMENSIONLESS
        try:
            for pair in term:
                name, exp = pair[0], int(pair[1])
                d = d * (unit(name) ** exp)
        except (DimensionError, IndexError, ValueError) as e:
            raise HTTPException(status_code=400, detail=str(e))
        resolved.append(d)
    homogeneous = all(d == resolved[0] for d in resolved) if resolved else True
    return {
        "homogeneous": homogeneous,
        "term_signatures": [str(d) for d in resolved],
    }


class CircuitRequest(BaseModel):
    V: float | None = None
    I: float | None = None
    R: float | None = None


@router.post("/electrical/ohm")
async def electrical_ohm(body: CircuitRequest, _token: str = Depends(require_bearer)):
    """Ohm's-law solver (#41) — fills in the missing one of V, I, R + power."""
    from ..physics import electrical
    try:
        return electrical.ohm_solve(V=body.V, I=body.I, R=body.R)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
