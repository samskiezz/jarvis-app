"""ONTOLOGY EXT routes — computed functions, views, sets, bulk actions, import/export.

A NEW router composing :mod:`server.services.ontology_ext` (which itself composes
``ontology_store``). Reads are public via ``optional_bearer``; writes require
``require_bearer``. The service never raises, so handlers stay thin.

  * #19 functions  POST /v1/ontology-ext/functions          GET .../objects/{id}/computed
  * #20 views      GET/POST /v1/ontology-ext/views/{type_id}
  * #23 sets       GET/POST /v1/ontology-ext/sets           GET .../sets/{id}/resolve  DELETE .../sets/{id}
  * #24 bulk       POST /v1/ontology-ext/bulk-action
  * #26 io         GET /v1/ontology-ext/export              POST /v1/ontology-ext/import
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services import ontology_ext as ext

router = APIRouter(prefix="/v1/ontology-ext", tags=["ontology-ext"])

# ── V2 additive imports (never modify existing lines above) ──────────────────────
from fastapi import Query  # noqa: E402
from pydantic import BaseModel as _BaseModel  # noqa: E402  # re-export shim kept for future

from ..data.ontology_v2_models import (  # noqa: E402
    ActionApproveIn,
    ActionSubmitIn,
    ActionTypeDefinition,
    BulkActionIn as _BulkActionInV2,
    ObjectSetIn,
    SyncTriggerIn,
)
from ..services import actions_service as actions  # noqa: E402
from ..services import funnel as funnel_svc  # noqa: E402
from ..services import ontology_store as store  # noqa: E402


# ── Models ───────────────────────────────────────────────────────────────────────
class FunctionIn(BaseModel):
    type_id: str
    name: str
    expr: str


class ViewIn(BaseModel):
    summary: Optional[list[str]] = None
    detail: Optional[list[str]] = None
    related: Optional[list[str]] = None
    # accept arbitrary extra layout fields
    extra: Optional[dict[str, Any]] = None


class SetIn(BaseModel):
    name: str
    query: Optional[dict[str, Any]] = None


class BulkActionIn(BaseModel):
    set_id: Optional[str] = None
    query: Optional[dict[str, Any]] = None
    action: str
    payload: Optional[dict[str, Any]] = None


class ImportIn(BaseModel):
    types: Optional[list[dict[str, Any]]] = None
    objects: Optional[list[dict[str, Any]]] = None
    links: Optional[list[dict[str, Any]]] = None
    mode: str = "merge"


# ── #19 Computed functions ─────────────────────────────────────────────────────────
@router.post("/functions")
async def register_function(body: FunctionIn, _token: str = Depends(require_bearer)):
    res = ext.register_function(body.type_id, body.name, body.expr)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "could not register function"))
    return res


@router.get("/objects/{object_id}/computed")
async def get_computed(object_id: str, _token: str | None = Depends(optional_bearer)):
    return {"id": object_id, "computed": ext.compute(object_id)}


# ── #20 Object views ────────────────────────────────────────────────────────────────
@router.get("/views/{type_id}")
async def get_view(type_id: str, _token: str | None = Depends(optional_bearer)):
    return ext.get_view(type_id)


@router.post("/views/{type_id}")
async def set_view(type_id: str, body: ViewIn, _token: str = Depends(require_bearer)):
    view = body.model_dump(exclude_none=True)
    extra = view.pop("extra", None)
    if isinstance(extra, dict):
        view.update(extra)
    res = ext.set_view(type_id, view)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "could not store view"))
    return res


# ── #23 Object sets ──────────────────────────────────────────────────────────────────
@router.get("/sets")
async def get_sets(_token: str | None = Depends(optional_bearer)):
    items = ext.list_sets()
    return {"items": items, "count": len(items)}


@router.post("/sets")
async def post_set(body: SetIn, _token: str = Depends(require_bearer)):
    res = ext.create_set(body.name, body.query or {})
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "could not create set"))
    return res


@router.get("/sets/{set_id}/resolve")
async def resolve_set(set_id: str, _token: str | None = Depends(optional_bearer)):
    res = ext.resolve_set(set_id)
    if not res.get("ok"):
        raise HTTPException(status_code=404, detail=res.get("error", "set not found"))
    return res


@router.delete("/sets/{set_id}")
async def delete_set(set_id: str, _token: str = Depends(require_bearer)):
    ok = ext.delete_set(set_id)
    if not ok:
        raise HTTPException(status_code=404, detail="set not found")
    return {"ok": True, "id": set_id}


# ── #24 Bulk action ──────────────────────────────────────────────────────────────────
@router.post("/bulk-action")
async def post_bulk_action(body: BulkActionIn, token: str = Depends(require_bearer)):
    target: Any
    if body.set_id:
        target = body.set_id
    elif body.query is not None:
        target = body.query
    else:
        raise HTTPException(status_code=400, detail="set_id or query required")
    res = ext.bulk_action(
        target, body.action, body.payload or {}, actor=token[:12] if token else None
    )
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "bulk action failed"))
    return res


# ── #26 Import / export ───────────────────────────────────────────────────────────────
@router.get("/export")
async def get_export(_token: str | None = Depends(optional_bearer)):
    return ext.export_ontology()


@router.post("/import")
async def post_import(body: ImportIn, _token: str = Depends(require_bearer)):
    payload = {
        "types": body.types or [],
        "objects": body.objects or [],
        "links": body.links or [],
    }
    res = ext.import_ontology(payload, mode=body.mode or "merge")
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "import failed"))
    return res


# ═══════════════════════════════════════════════════════════════════════════════
#  Ontology V2 cluster — APPEND ONLY (new router mounted separately in main.py)
# ═══════════════════════════════════════════════════════════════════════════════
router_v2 = APIRouter(tags=["ontology-v2"])


# ── #V2 Action Types ─────────────────────────────────────────────────────────────
@router_v2.post("/v1/ontology/actions/types")
async def define_action_type(body: ActionTypeDefinition, _token: str = Depends(require_bearer)):
    definition = body.model_dump(exclude_none=True)
    res = await actions.define_action_type(definition)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "define failed"))
    return res


@router_v2.get("/v1/ontology/actions/types")
async def list_action_types(_token: str | None = Depends(optional_bearer)):
    items = await actions.list_action_types()
    return {"items": items, "count": len(items)}


# ── #V2 Action Execution ─────────────────────────────────────────────────────────
@router_v2.post("/v1/ontology/actions/submit")
async def submit_action(body: ActionSubmitIn, token: str = Depends(require_bearer)):
    actor = token[:32] if token else "anonymous"
    res = await actions.submit_action(body.action_type_id, body.params, actor)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "submit failed"))
    return res


@router_v2.post("/v1/ontology/actions/approve")
async def approve_action(body: ActionApproveIn, token: str = Depends(require_bearer)):
    actor = token[:32] if token else "anonymous"
    res = await actions.approve_action(body.execution_id, actor)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "approve failed"))
    return res


@router_v2.get("/v1/ontology/actions/executions")
async def list_executions(
    state: str | None = Query(default=None),
    action_type_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    _token: str | None = Depends(optional_bearer),
):
    items = await actions.list_executions(state=state, action_type_id=action_type_id, limit=limit)
    return {"items": items, "count": len(items)}


# ── #V2 Dataset ↔ Object Sync ────────────────────────────────────────────────────
@router_v2.post("/v1/ontology/sync")
async def trigger_sync(body: SyncTriggerIn, _token: str = Depends(require_bearer)):
    if body.direction == "dataset_to_objects":
        res = await funnel_svc.sync_dataset_to_objects(
            body.dataset_id, body.object_type, body.mapping, soft_delete=body.soft_delete
        )
    else:
        res = await funnel_svc.sync_objects_to_dataset(body.object_type, body.dataset_id)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "sync failed"))
    return res


@router_v2.get("/v1/ontology/sync/status")
async def sync_status(dataset_id: str, _token: str | None = Depends(optional_bearer)):
    return funnel_svc.get_sync_status(dataset_id)


# ── #V2 Object Sets (alias under /v1/ontology) ───────────────────────────────────
@router_v2.post("/v1/ontology/object-sets")
async def create_object_set(body: ObjectSetIn, _token: str = Depends(require_bearer)):
    res = ext.create_set(body.name, body.query or {})
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "could not create set"))
    return res


@router_v2.get("/v1/ontology/object-sets")
async def list_object_sets(_token: str | None = Depends(optional_bearer)):
    items = ext.list_sets()
    return {"items": items, "count": len(items)}


# ── #V2 Bulk Action (via actions service) ────────────────────────────────────────
@router_v2.post("/v1/ontology/bulk-action")
async def bulk_action_v2(body: _BulkActionInV2, token: str = Depends(require_bearer)):
    actor = token[:32] if token else "anonymous"
    target_objects: list[dict] = []
    if body.object_set_id:
        resolved = ext.resolve_set(body.object_set_id)
        if not resolved.get("ok"):
            raise HTTPException(status_code=404, detail=resolved.get("error", "set not found"))
        target_objects = resolved.get("items", [])
    else:
        ot = body.params.get("object_type")
        if ot:
            target_objects = store.query_objects(type=ot, limit=1000)

    if not target_objects:
        raise HTTPException(status_code=400, detail="no target objects found")

    executions: list[str] = []
    for obj in target_objects:
        p = dict(body.params)
        p.setdefault("target_id", obj.get("id"))
        res = await actions.submit_action(body.action_type_id, p, actor)
        if res.get("ok"):
            if body.auto_approve:
                await actions.approve_action(res["id"], actor)
                await actions.apply_action(res["id"])
            executions.append(res["id"])

    return {"ok": True, "submitted": len(executions), "execution_ids": executions}
