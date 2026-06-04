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
