"""JARVIS PLATFORM routes — temporal, AI gateway, simulation and Apollo.

Mounted under ``/v1/jarvis``:

  temporal  : POST /temporal/record, GET /temporal/as-of/{id}, GET /temporal/history/{id},
              POST /temporal/snapshot/{id}
  ai        : GET  /ai/models, POST /ai/route, POST /ai/retrieve, POST /ai/ask
  sim       : POST /sim/whatif, POST /sim/risk, POST /sim/montecarlo, GET /sim/recommend/{id}
  apollo    : POST /apollo/artifacts, POST /apollo/environments, POST /apollo/release,
              POST /apollo/rollback, GET /apollo/fleet, GET /apollo/releases

Mutating endpoints require a bearer token; reads use optional bearer. Never raise.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import jarvis_ai as ai
from ..services import jarvis_apollo as apollo
from ..services import jarvis_sim as sim
from ..services import jarvis_temporal as temporal

router = APIRouter(prefix="/v1/jarvis", tags=["jarvis-platform"])


# ── temporal ──────────────────────────────────────────────────────────────────
class RecordBody(BaseModel):
    object_id: str
    prop: str
    value: str
    valid_from: int | None = None
    actor: str = "api"
    source: str = ""


@router.post("/temporal/record")
async def temporal_record(body: RecordBody, _t: str = Depends(require_bearer)):
    return temporal.record(body.object_id, body.prop, body.value,
                           valid_from=body.valid_from, actor=body.actor, source=body.source)


@router.get("/temporal/as-of/{object_id}")
async def temporal_as_of(object_id: str, valid_time: int | None = None, tx_time: int | None = None,
                         _t: str | None = Depends(optional_bearer)):
    return temporal.as_of(object_id, valid_time=valid_time, tx_time=tx_time)


@router.get("/temporal/history/{object_id}")
async def temporal_history(object_id: str, prop: str | None = None, limit: int = 200,
                           _t: str | None = Depends(optional_bearer)):
    return {"history": temporal.history(object_id, prop, limit)}


@router.post("/temporal/snapshot/{object_id}")
async def temporal_snapshot(object_id: str, _t: str = Depends(require_bearer)):
    return temporal.snapshot_object(object_id)


# ── ai gateway ────────────────────────────────────────────────────────────────
class RouteBody(BaseModel):
    task: str = "reason"
    need: list[str] | None = None
    max_risk: str = "high"
    max_cost: float = 1.0


class RetrieveBody(BaseModel):
    subject_id: str
    query: str
    purpose: str = ""
    k: int = 5
    object_type: str | None = None


class AskBody(BaseModel):
    subject_id: str
    query: str
    purpose: str = ""
    need: list[str] | None = None
    max_risk: str = "high"


@router.get("/ai/models")
async def ai_models(_t: str | None = Depends(optional_bearer)):
    return {"models": ai.gateway()}


@router.post("/ai/route")
async def ai_route(body: RouteBody, _t: str = Depends(require_bearer)):
    return ai.route(body.task, need=body.need, max_risk=body.max_risk, max_cost=body.max_cost)


@router.post("/ai/retrieve")
async def ai_retrieve(body: RetrieveBody, _t: str = Depends(require_bearer)):
    return ai.retrieve(body.subject_id, body.query, purpose=body.purpose, k=body.k,
                       object_type=body.object_type)


@router.post("/ai/ask")
async def ai_ask(body: AskBody, _t: str = Depends(require_bearer)):
    return ai.ask(body.subject_id, body.query, purpose=body.purpose, need=body.need, max_risk=body.max_risk)


# ── simulation ────────────────────────────────────────────────────────────────
class WhatIfBody(BaseModel):
    object_id: str
    action: str


class RiskBody(BaseModel):
    seed_id: str
    decay: float = 0.5
    max_depth: int = 3


class MonteCarloBody(BaseModel):
    p_success: float
    trials: int = 1000
    seed: int | None = None


@router.post("/sim/whatif")
async def sim_whatif(body: WhatIfBody, _t: str = Depends(require_bearer)):
    return sim.whatif(body.object_id, body.action)


@router.post("/sim/risk")
async def sim_risk(body: RiskBody, _t: str = Depends(require_bearer)):
    return sim.propagate_risk(body.seed_id, decay=body.decay, max_depth=body.max_depth)


@router.post("/sim/montecarlo")
async def sim_mc(body: MonteCarloBody, _t: str = Depends(require_bearer)):
    return sim.monte_carlo(body.p_success, trials=body.trials, seed=body.seed)


@router.get("/sim/recommend/{object_id}")
async def sim_recommend(object_id: str, _t: str | None = Depends(optional_bearer)):
    return sim.recommend(object_id)


# ── apollo ────────────────────────────────────────────────────────────────────
class ArtifactBody(BaseModel):
    name: str
    version: str
    sbom: list[dict] = Field(default_factory=list)
    signed: bool = True
    provenance: dict = Field(default_factory=dict)


class EnvBody(BaseModel):
    name: str
    tier: str = "dev"


class ReleaseBody(BaseModel):
    name: str
    version: str
    env: str
    strategy: str = "canary"
    role: str = "operator"
    actor: str = "api"
    approval_id: str | None = None
    health: str = "healthy"


class RollbackBody(BaseModel):
    env: str
    role: str = "operator"
    actor: str = "api"


@router.post("/apollo/artifacts")
async def apollo_artifact(body: ArtifactBody, _t: str = Depends(require_bearer)):
    return apollo.register_artifact(body.name, body.version, sbom=body.sbom,
                                    signed=body.signed, provenance=body.provenance)


@router.post("/apollo/environments")
async def apollo_env(body: EnvBody, _t: str = Depends(require_bearer)):
    return apollo.define_environment(body.name, tier=body.tier)


@router.post("/apollo/release")
async def apollo_release(body: ReleaseBody, _t: str = Depends(require_bearer)):
    return apollo.release(body.name, body.version, body.env, strategy=body.strategy,
                          role=body.role, actor=body.actor, approval_id=body.approval_id,
                          health=body.health)


@router.post("/apollo/rollback")
async def apollo_rollback(body: RollbackBody, _t: str = Depends(require_bearer)):
    return apollo.rollback(body.env, role=body.role, actor=body.actor)


@router.get("/apollo/fleet")
async def apollo_fleet(_t: str | None = Depends(optional_bearer)):
    return apollo.fleet()


@router.get("/apollo/releases")
async def apollo_releases(limit: int = 50, _t: str | None = Depends(optional_bearer)):
    return {"releases": apollo.releases(limit)}
