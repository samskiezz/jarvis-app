"""SCENARIO / MODELING routes — the "what-if / model-ops" pillar.

Endpoints (mounted under ``/v1/scenario``):
  * ``POST /v1/scenario/run``      (bearer) body ``{name, params}`` — run a
        what-if and persist it. Honest ``engine`` (counterfactual|local-shock).
  * ``GET  /v1/scenario/list?limit=`` — recent scenario runs.
  * ``GET  /v1/scenario/{id}``     — one persisted run (404 if absent).
  * ``GET  /v1/scenario/models``   — the model registry + optional drift block.
  * ``POST /v1/scenario/optimize`` (bearer) body ``{objective?, bounds, n_iter?}``
        — maximise an objective over bounds. Honest ``engine``.

Mount in ``main.py`` with::

    from .routes import scenario as scenario_routes
    app.include_router(scenario_routes.router)
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services import scenario as scenario_svc

router = APIRouter(prefix="/v1/scenario", tags=["scenario"])


class RunBody(BaseModel):
    name: str = "scenario"
    params: dict[str, Any] = {}


@router.post("/run")
async def run_endpoint(
    body: RunBody,
    _token: str = Depends(require_bearer),
):
    return scenario_svc.run_scenario(body.name, body.params)


@router.get("/list")
async def list_endpoint(
    limit: int = Query(50, ge=1, le=1000),
    _token: str | None = Depends(optional_bearer),
):
    runs = scenario_svc.list_scenarios(limit=limit)
    return {"count": len(runs), "runs": runs}


@router.get("/models")
async def models_endpoint(
    _token: str | None = Depends(optional_bearer),
):
    return scenario_svc.model_registry()


class OptimizeBody(BaseModel):
    objective: Optional[str] = None
    bounds: Any = None
    n_iter: int = 20


@router.post("/optimize")
async def optimize_endpoint(
    body: OptimizeBody,
    _token: str = Depends(require_bearer),
):
    return scenario_svc.optimize(
        objective=body.objective, bounds=body.bounds, n_iter=body.n_iter
    )


# NOTE: keep the path-parameter route LAST so it does not shadow the static
# ``/list``, ``/models`` paths above.
@router.get("/{scenario_id}")
async def get_endpoint(
    scenario_id: str,
    _token: str | None = Depends(optional_bearer),
):
    run = scenario_svc.get_scenario(scenario_id)
    if run is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    return run
