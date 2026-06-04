"""SEARCH-PLUS routes — saved searches, faceted filters & search-in-graph
(Palantir pillar P4 #33/#35/#37).

A NEW router composing :mod:`server.services.search_plus` (which itself reuses
the existing search / ontology_store / graph services).

Read endpoints use ``optional_bearer``; mutating endpoints (save / delete)
require a bearer token.

Mount in ``main.py`` with::

    from .routes import search_plus as search_plus_routes
    app.include_router(search_plus_routes.router)
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services import search_plus as sp

router = APIRouter(prefix="/v1/search-plus", tags=["search-plus"])


# ── faceted filters (#33) ───────────────────────────────────────────────────
@router.get("/facets")
async def facets_endpoint(
    type: Optional[str] = Query(None, description="scope facets to an object type"),  # noqa: A002
    _token: str | None = Depends(optional_bearer),
):
    return sp.facets(type=type)


class FacetedBody(BaseModel):
    type: Optional[str] = None
    mark: Optional[str] = None
    props: Optional[dict[str, Any]] = None
    q: Optional[str] = None
    limit: Optional[int] = None


@router.post("/faceted")
async def faceted_endpoint(
    body: FacetedBody,
    _token: str | None = Depends(optional_bearer),
):
    filters: dict[str, Any] = {}
    if body.type is not None:
        filters["type"] = body.type
    if body.mark is not None:
        filters["mark"] = body.mark
    if body.props is not None:
        filters["props"] = body.props
    if body.q is not None:
        filters["q"] = body.q
    if body.limit is not None:
        filters["limit"] = body.limit
    return sp.faceted_search(filters)


# ── saved searches + alerting (#35) ──────────────────────────────────────────
@router.get("/saved")
async def list_saved_endpoint(_token: str | None = Depends(optional_bearer)):
    items = sp.list_searches()
    return {"count": len(items), "searches": items}


class SaveBody(BaseModel):
    name: str
    spec: dict[str, Any] = {}


@router.post("/saved")
async def save_endpoint(
    body: SaveBody,
    _token: str = Depends(require_bearer),
):
    saved = sp.save_search(body.name, body.spec)
    return {"ok": saved is not None, "saved": saved}


@router.get("/saved/{search_id}/run")
async def run_saved_endpoint(
    search_id: str,
    _token: str | None = Depends(optional_bearer),
):
    return sp.run_saved(search_id)


@router.get("/saved/{search_id}/new")
async def new_matches_endpoint(
    search_id: str,
    _token: str | None = Depends(optional_bearer),
):
    return sp.check_new_matches(search_id)


@router.delete("/saved/{search_id}")
async def delete_saved_endpoint(
    search_id: str,
    _token: str = Depends(require_bearer),
):
    return {"ok": sp.delete_search(search_id)}


# ── search-in-graph (#37) ─────────────────────────────────────────────────────
@router.get("/paths")
async def paths_endpoint(
    a: str = Query(..., description="source object id"),
    b: str = Query(..., description="target object id"),
    max_depth: int = Query(4, ge=1, le=8),
    _token: str | None = Depends(optional_bearer),
):
    return sp.find_paths(a, b, max_depth=max_depth)


class PatternBody(BaseModel):
    seed: Any
    relation: Optional[str] = None
    depth: int = 2


@router.post("/pattern")
async def pattern_endpoint(
    body: PatternBody,
    _token: str | None = Depends(optional_bearer),
):
    return sp.pattern_search(body.seed, relation=body.relation, depth=body.depth)
