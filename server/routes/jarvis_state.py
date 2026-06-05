"""JARVIS STATE routes — event backbone + sandbox universes.

Mounted under ``/v1/jarvis``:

  events  : POST /events/emit, POST /events/poll, GET /events/replay/{stream},
            GET /events/project/{stream}, GET /events/stats
  sandbox : POST /sandbox/branches, GET /sandbox/branches,
            GET  /sandbox/{branch}/object/{id}, POST /sandbox/{branch}/set-prop,
            POST /sandbox/{branch}/apply, GET /sandbox/{branch}/diff,
            POST /sandbox/{branch}/promote, POST /sandbox/{branch}/discard

Mutating endpoints require a bearer token; reads use optional bearer. Never raise.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import jarvis_events as events
from ..services import jarvis_sandbox as sandbox

router = APIRouter(prefix="/v1/jarvis", tags=["jarvis-state"])


# ── events ──────────────────────────────────────────────────────────────────
class EmitBody(BaseModel):
    stream: str
    type: str
    payload: dict = Field(default_factory=dict)
    actor: str = "api"


class PollBody(BaseModel):
    consumer: str
    types: list[str] | None = None
    limit: int = 100
    commit: bool = True


@router.post("/events/emit")
async def events_emit(body: EmitBody, _t: str = Depends(require_bearer)):
    return events.emit(body.stream, body.type, body.payload, actor=body.actor)


@router.post("/events/poll")
async def events_poll(body: PollBody, _t: str = Depends(require_bearer)):
    return events.poll(body.consumer, types=body.types, limit=body.limit, commit=body.commit)


@router.get("/events/replay/{stream}")
async def events_replay(stream: str, limit: int = 1000, _t: str | None = Depends(optional_bearer)):
    return {"stream": stream, "events": events.replay(stream, limit)}


@router.get("/events/project/{stream}")
async def events_project(stream: str, _t: str | None = Depends(optional_bearer)):
    return events.project(stream)


@router.get("/events/stats")
async def events_stats(_t: str | None = Depends(optional_bearer)):
    return events.stats()


# ── sandbox ─────────────────────────────────────────────────────────────────
class BranchBody(BaseModel):
    name: str
    base: str = "main"
    actor: str = "api"


class SetPropBody(BaseModel):
    object_id: str
    prop: str
    value: str
    actor: str = "api"


class ApplyBody(BaseModel):
    action: str
    object_id: str
    role: str = "operator"
    actor: str = "api"


class GovBody(BaseModel):
    role: str = "operator"
    actor: str = "api"


@router.post("/sandbox/branches")
async def sandbox_create(body: BranchBody, _t: str = Depends(require_bearer)):
    return sandbox.create_branch(body.name, base=body.base, actor=body.actor)


@router.get("/sandbox/branches")
async def sandbox_list(_t: str | None = Depends(optional_bearer)):
    return {"branches": sandbox.list_branches()}


@router.get("/sandbox/{branch}/object/{object_id}")
async def sandbox_get(branch: str, object_id: str, _t: str | None = Depends(optional_bearer)):
    o = sandbox.branch_get(branch, object_id)
    return o or {"status": "not_found", "id": object_id}


@router.post("/sandbox/{branch}/set-prop")
async def sandbox_set(branch: str, body: SetPropBody, _t: str = Depends(require_bearer)):
    return sandbox.branch_set_prop(branch, body.object_id, body.prop, body.value, actor=body.actor)


@router.post("/sandbox/{branch}/apply")
async def sandbox_apply(branch: str, body: ApplyBody, _t: str = Depends(require_bearer)):
    return sandbox.branch_apply_action(branch, body.action, body.object_id, role=body.role, actor=body.actor)


@router.get("/sandbox/{branch}/diff")
async def sandbox_diff(branch: str, _t: str | None = Depends(optional_bearer)):
    return sandbox.diff(branch)


@router.post("/sandbox/{branch}/promote")
async def sandbox_promote(branch: str, body: GovBody, _t: str = Depends(require_bearer)):
    return sandbox.promote(branch, role=body.role, actor=body.actor)


@router.post("/sandbox/{branch}/discard")
async def sandbox_discard(branch: str, body: GovBody, _t: str = Depends(require_bearer)):
    return sandbox.discard(branch, actor=body.actor)
