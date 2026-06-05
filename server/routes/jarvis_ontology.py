"""JARVIS ONTOLOGY routes — operational ontology + Action Layer HTTP surface.

Mounted under ``/v1/jarvis/ontology``:

  * GET  /schema                 — object/link/action types + instance counts.
  * POST /object-types           — define a typed object (schema + lifecycle).
  * POST /link-types             — define a governed relationship type.
  * POST /action-types           — define a governed lifecycle transition.
  * POST /objects                — create a typed object (policy-checked).
  * GET  /objects                — list objects (optionally by type).
  * GET  /objects/{id}           — read an object.
  * GET  /objects/{id}/neighbors — graph traversal.
  * GET  /objects/{id}/history   — object event history.
  * POST /links                  — link two objects.
  * POST /actions/apply          — apply a governed action (the Action Layer).

Mutating endpoints require a bearer token; reads use optional bearer. Never raise.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import jarvis_ontology as ont

router = APIRouter(prefix="/v1/jarvis/ontology", tags=["jarvis-ontology"])


class ObjectTypeBody(BaseModel):
    name: str
    properties: dict = Field(default_factory=dict, description="field -> type (str/int/float/bool/list/dict)")
    states: list[str] | None = None
    initial: str = "active"


class LinkTypeBody(BaseModel):
    name: str
    from_type: str
    to_type: str
    cardinality: str = "many"


class ActionTypeBody(BaseModel):
    name: str
    object_type: str
    permission: str
    from_state: str
    to_state: str
    risk: str = "medium"
    description: str = ""


class CreateObjectBody(BaseModel):
    type: str
    props: dict = Field(default_factory=dict)
    role: str = "analyst"
    actor: str = "api"


class LinkBody(BaseModel):
    link_type: str
    from_id: str
    to_id: str
    role: str = "analyst"
    actor: str = "api"


class ApplyActionBody(BaseModel):
    action: str
    object_id: str
    role: str = "operator"
    actor: str = "api"
    approval_id: str | None = None


@router.get("/schema")
async def get_schema(_t: str | None = Depends(optional_bearer)):
    return ont.schema()


@router.post("/object-types")
async def post_object_type(body: ObjectTypeBody, _t: str = Depends(require_bearer)):
    return ont.define_object_type(body.name, body.properties, states=body.states, initial=body.initial)


@router.post("/link-types")
async def post_link_type(body: LinkTypeBody, _t: str = Depends(require_bearer)):
    return ont.define_link_type(body.name, body.from_type, body.to_type, cardinality=body.cardinality)


@router.post("/action-types")
async def post_action_type(body: ActionTypeBody, _t: str = Depends(require_bearer)):
    return ont.define_action_type(body.name, body.object_type, permission=body.permission,
                                  from_state=body.from_state, to_state=body.to_state,
                                  risk=body.risk, description=body.description)


@router.post("/objects")
async def post_object(body: CreateObjectBody, _t: str = Depends(require_bearer)):
    return ont.create_object(body.type, body.props, role=body.role, actor=body.actor)


@router.get("/objects")
async def get_objects(type: str | None = None, limit: int = 100, _t: str | None = Depends(optional_bearer)):
    return {"objects": ont.list_objects(type, limit)}


@router.get("/objects/{object_id}")
async def get_object(object_id: str, _t: str | None = Depends(optional_bearer)):
    o = ont.get_object(object_id)
    return o or {"status": "not_found", "id": object_id}


@router.get("/objects/{object_id}/neighbors")
async def get_neighbors(object_id: str, _t: str | None = Depends(optional_bearer)):
    return ont.neighbors(object_id)


@router.get("/objects/{object_id}/history")
async def get_history(object_id: str, limit: int = 100, _t: str | None = Depends(optional_bearer)):
    return {"history": ont.object_history(object_id, limit)}


@router.post("/links")
async def post_link(body: LinkBody, _t: str = Depends(require_bearer)):
    return ont.link_objects(body.link_type, body.from_id, body.to_id, role=body.role, actor=body.actor)


@router.post("/actions/apply")
async def post_apply(body: ApplyActionBody, _t: str = Depends(require_bearer)):
    return ont.apply_action(body.action, body.object_id, role=body.role,
                            actor=body.actor, approval_id=body.approval_id)
