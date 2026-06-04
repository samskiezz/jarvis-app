"""SEARCH + ENTITY-RESOLUTION routes.

Public read endpoints (optional_bearer):
  * ``GET  /v1/search?q=&type=&mark=&limit=``  — ranked search over the ontology.
  * ``GET  /v1/search/suggest?q=&limit=``       — typeahead label suggestions.
  * ``POST /v1/resolve``  body ``{"record": {...}}`` — entity-resolution candidates.

Mount in ``main.py`` with::

    from .routes import search as search_routes
    app.include_router(search_routes.router)
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import optional_bearer
from ..data.ontology import OBJECTS
from ..services import entity_resolution as er
from ..services import search as search_svc

router = APIRouter()


@router.get("/v1/search")
async def search_endpoint(
    q: str = Query("", description="search query"),
    type: Optional[str] = Query(None, description="filter by object type"),  # noqa: A002
    mark: Optional[str] = Query(None, description="filter by classification mark"),
    limit: int = Query(20, ge=1, le=200),
    _token: str | None = Depends(optional_bearer),
):
    hits = search_svc.search(q, type=type, mark=mark, limit=limit)
    return {"query": q, "type": type, "mark": mark, "count": len(hits), "results": hits}


@router.get("/v1/search/suggest")
async def suggest_endpoint(
    q: str = Query("", description="prefix to complete"),
    limit: int = Query(10, ge=1, le=50),
    _token: str | None = Depends(optional_bearer),
):
    suggestions = search_svc.suggest(q, limit=limit)
    return {"query": q, "suggestions": suggestions}


class ResolveBody(BaseModel):
    record: dict[str, Any]
    limit: int | None = None
    threshold: float | None = None


@router.post("/v1/resolve")
async def resolve_endpoint(
    body: ResolveBody,
    _token: str | None = Depends(optional_bearer),
):
    objects = [dict(o) for o in OBJECTS]
    cands = er.candidates(
        body.record,
        objects,
        limit=body.limit or 10,
        threshold=body.threshold if body.threshold is not None else 0.0,
    )
    return {"count": len(cands), "candidates": cands}
