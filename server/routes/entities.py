"""Generic in-memory entity CRUD.

The frontend's kimiClient.entities.<Name>.list/get/create/update/remove maps to:
  POST   /entities/{name}            -> list (with optional filter payload)
  GET    /entities/{name}/{id}
  PUT    /entities/{name}            -> create
  PATCH  /entities/{name}/{id}       -> update
  DELETE /entities/{name}/{id}

Storage is a per-name dict. This is enough for the current frontend (which only
reads a handful of entities); persistent storage swaps in cleanly later.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel

from ..auth import require_bearer
from ..data.ontology import OBJECTS, RISK_SIGNALS

router = APIRouter()

_store: dict[str, dict[str, dict[str, Any]]] = {
    "IntelProfile": {o["id"]: dict(o) for o in OBJECTS},
    "RiskSignal": {r["id"]: dict(r) for r in RISK_SIGNALS},
}


def _bucket(name: str) -> dict[str, dict[str, Any]]:
    return _store.setdefault(name, {})


class ListFilter(BaseModel):
    where: dict[str, Any] | None = None
    limit: int | None = None


@router.post("/entities/{name}")
async def list_entities(
    name: str,
    body: ListFilter | None = None,
    _token: str = Depends(require_bearer),
):
    items = list(_bucket(name).values())
    if body and body.where:
        items = [
            it
            for it in items
            if all(it.get(k) == v for k, v in body.where.items())
        ]
    if body and body.limit:
        items = items[: body.limit]
    return {"items": items, "count": len(items)}


@router.get("/entities/{name}/{item_id}")
async def get_entity(
    name: str,
    item_id: str = Path(...),
    _token: str = Depends(require_bearer),
):
    item = _bucket(name).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="not found")
    return item


@router.put("/entities/{name}")
async def create_entity(
    name: str,
    body: dict[str, Any],
    _token: str = Depends(require_bearer),
):
    item_id = str(body.get("id") or uuid.uuid4())
    body["id"] = item_id
    _bucket(name)[item_id] = body
    return body


@router.patch("/entities/{name}/{item_id}")
async def update_entity(
    name: str,
    item_id: str,
    body: dict[str, Any],
    _token: str = Depends(require_bearer),
):
    bucket = _bucket(name)
    if item_id not in bucket:
        raise HTTPException(status_code=404, detail="not found")
    bucket[item_id].update(body)
    return bucket[item_id]


@router.delete("/entities/{name}/{item_id}", status_code=204)
async def delete_entity(
    name: str,
    item_id: str,
    _token: str = Depends(require_bearer),
):
    bucket = _bucket(name)
    bucket.pop(item_id, None)
    return None
