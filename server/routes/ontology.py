"""ONTOLOGY routes — the LIVE Foundry-style object model API (P0).

Endpoints (reusing the existing auth deps in ``server/auth.py``):
  * ``GET  /v1/ontology/types``                      — type catalog (public read).
  * ``GET  /v1/ontology/objects``                    — query objects (filters, public read).
  * ``GET  /v1/ontology/objects/{id}``               — one object (public read).
  * ``GET  /v1/ontology/objects/{id}/neighbors``     — graph neighborhood (public read).
  * ``GET  /v1/ontology/objects/{id}/actions``       — write-back audit (public read).
  * ``POST /v1/ontology/objects``                    — upsert object (bearer).
  * ``POST /v1/ontology/links``                      — upsert link (bearer).
  * ``POST /v1/ontology/objects/{id}/actions``       — apply governed action (bearer).

Reads use ``optional_bearer`` (public unless JARVIS_REQUIRE_AUTH=true); writes use
``require_bearer``. The store never raises, so handlers stay thin.

BACKWARD-COMPAT: the object upsert also accepts the legacy entity shape
(``{id, label, type, mark, props}``) used by the existing frontend, so nothing
breaks if the frontend posts the old payload.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services import ontology_store as store
from ..services import redaction

router = APIRouter()


def _caller_clearance(token: str | None, x_clearance: str | None) -> str:
    """Derive the caller's classification clearance for a read.

    Prefers a bearer-token-derived clearance (via ``security.role_for_token``);
    falls back to the ``X-Clearance`` header; else defaults to PUBLIC (lowest).
    See ``services/redaction.clearance_for``."""
    return redaction.clearance_for(token, x_clearance)


# ── Models ───────────────────────────────────────────────────────────────────────
class ObjectIn(BaseModel):
    id: Optional[str] = None
    type: Optional[str] = None
    label: Optional[str] = None
    mark: Optional[str] = None
    props: Optional[dict[str, Any]] = None
    # legacy/back-compat alias: some callers send a flat dict; props absorbs the rest.


class LinkIn(BaseModel):
    a: str
    b: str
    relation: str = ""
    strength: float = 1.0
    props: Optional[dict[str, Any]] = None
    # legacy alias: the seed/frontend uses "label" for the relation.
    label: Optional[str] = None


class ActionIn(BaseModel):
    action: str
    payload: Optional[dict[str, Any]] = None


# ── Types ────────────────────────────────────────────────────────────────────────
@router.get("/v1/ontology/types")
async def get_types(_token: str | None = Depends(optional_bearer)):
    items = store.list_types()
    return {"items": items, "count": len(items)}


# ── Objects ──────────────────────────────────────────────────────────────────────
@router.get("/v1/ontology/objects")
async def get_objects(
    type: Optional[str] = Query(default=None, description="filter by object type"),
    limit: Optional[int] = Query(default=None, ge=1, le=10000),
    token: str | None = Depends(optional_bearer),
    x_clearance: str | None = Header(default=None, alias="X-Clearance"),
):
    items = store.query_objects(type=type, limit=limit)
    clearance = _caller_clearance(token, x_clearance)
    items = redaction.redact_objects(items, clearance)
    return {"items": items, "count": len(items)}


@router.get("/v1/ontology/objects/{object_id}")
async def get_one_object(
    object_id: str,
    token: str | None = Depends(optional_bearer),
    x_clearance: str | None = Header(default=None, alias="X-Clearance"),
):
    obj = store.get_object(object_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="object not found")
    clearance = _caller_clearance(token, x_clearance)
    allowed = redaction.can_read(clearance, obj.get("mark"))
    actor = (token[:12] if token else None) or "anonymous"
    redaction.audit_read(actor, clearance, object_id, allowed)
    obj["links"] = store.links_for(object_id)
    return redaction.redact_object(obj, clearance)


@router.post("/v1/ontology/objects")
async def post_object(
    body: ObjectIn,
    _token: str = Depends(require_bearer),
):
    payload = body.model_dump(exclude_none=True)
    obj = store.upsert_object(payload)
    if obj is None:
        raise HTTPException(status_code=400, detail="could not store object")
    return obj


@router.get("/v1/ontology/objects/{object_id}/neighbors")
async def get_neighbors(
    object_id: str,
    depth: int = Query(default=1, ge=0, le=5),
    token: str | None = Depends(optional_bearer),
    x_clearance: str | None = Header(default=None, alias="X-Clearance"),
):
    result = store.neighbors(object_id, depth=depth)
    clearance = _caller_clearance(token, x_clearance)
    if isinstance(result, dict):
        result["objects"] = redaction.redact_objects(result.get("objects", []), clearance)
    return result


@router.get("/v1/ontology/objects/{object_id}/actions")
async def get_actions(
    object_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    _token: str | None = Depends(optional_bearer),
):
    items = store.list_actions(object_id, limit=limit)
    return {"items": items, "count": len(items)}


@router.post("/v1/ontology/objects/{object_id}/actions")
async def post_action(
    object_id: str,
    body: ActionIn,
    token: str = Depends(require_bearer),
):
    result = store.apply_action(
        object_id,
        body.action,
        body.payload or {},
        actor=token[:12] if token else None,
    )
    if not result.get("ok"):
        # 404 for missing object, 400 for a rejected/invalid action.
        err = result.get("error", "action failed")
        code = 404 if err == "object not found" else 400
        raise HTTPException(status_code=code, detail=err)
    return result


# ── Links ────────────────────────────────────────────────────────────────────────
@router.post("/v1/ontology/links")
async def post_link(
    body: LinkIn,
    _token: str = Depends(require_bearer),
):
    relation = body.relation or body.label or ""
    link = store.upsert_link(
        body.a,
        body.b,
        relation,
        strength=body.strength,
        props=body.props or {},
    )
    if link is None:
        raise HTTPException(status_code=400, detail="could not store link")
    return link
