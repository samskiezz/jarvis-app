"""LINK-ANALYSIS graph routes — the interactive Gotham graph API.

A ready-to-mount ``APIRouter`` exposing read-only graph exploration over the
ontology object/link model (see :mod:`server.services.graph`):

  * ``GET /v1/graph/subgraph?seeds=a,b&depth=1``  — BFS expand from seed ids.
  * ``GET /v1/graph/expand/{node_id}``            — immediate neighbors (click-expand).
  * ``GET /v1/graph/path?a=&b=``                  — strength-weighted shortest path.
  * ``GET /v1/graph/paths?a=&b=&max_len=4``       — all simple paths up to max_len.
  * ``GET /v1/graph/centrality``                  — degree / PageRank score per node.
  * ``GET /v1/graph/communities``                 — community partition per node.

All endpoints are public reads via ``optional_bearer`` (a token is validated when
supplied; absence is allowed unless JARVIS_REQUIRE_AUTH=true). When the bearer is
present its role is resolved (via the security module, if importable) so node
props are redacted to the caller's clearance. Handlers never raise — the service
already degrades gracefully.

Wire it in ``server/main.py`` with::

    from .routes import graph as graph_routes
    app.include_router(graph_routes.router)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, Query

from ..auth import optional_bearer
from ..services import graph as graph_svc

try:  # role resolution is best-effort
    from ..services import security as _security  # type: ignore
except Exception:  # noqa: BLE001
    _security = None

router = APIRouter()


def _role(authorization: Optional[str]) -> Optional[str]:
    """Resolve the caller's clearance role from the bearer header. Never raises."""
    if _security is None:
        return None
    try:
        if not authorization or not authorization.lower().startswith("bearer "):
            token = None
        else:
            token = authorization.split(" ", 1)[1].strip() or None
        return _security.role_for_token(token)
    except Exception:  # noqa: BLE001
        return None


def _parse_seeds(seeds: str) -> list[str]:
    if not seeds:
        return []
    # accept comma- or space-separated ids
    raw = seeds.replace(" ", ",")
    return [s.strip() for s in raw.split(",") if s.strip()]


@router.get("/v1/graph/subgraph")
async def get_subgraph(
    seeds: str = Query(default="", description="comma-separated seed object ids"),
    depth: int = Query(default=1, ge=0, le=5),
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(optional_bearer),
):
    """BFS-expand a neighborhood from the seed ids out to ``depth`` hops."""
    result = graph_svc.subgraph(_parse_seeds(seeds), depth=depth, role=_role(authorization))
    return {
        "seeds": _parse_seeds(seeds),
        "depth": depth,
        "nodes": result.get("nodes", []),
        "edges": result.get("edges", []),
        "n_nodes": len(result.get("nodes", [])),
        "n_edges": len(result.get("edges", [])),
    }


@router.get("/v1/graph/expand/{node_id}")
async def get_expand(
    node_id: str,
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Return the immediate (1-hop) neighborhood of ``node_id`` for click-expand."""
    result = graph_svc.expand(node_id, role=_role(authorization))
    return {
        "center": node_id,
        "nodes": result.get("nodes", []),
        "edges": result.get("edges", []),
        "n_nodes": len(result.get("nodes", [])),
        "n_edges": len(result.get("edges", [])),
    }


@router.get("/v1/graph/path")
async def get_path(
    a: str = Query(..., description="source node id"),
    b: str = Query(..., description="target node id"),
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Lowest-cost (strength-weighted) path between ``a`` and ``b``."""
    result = graph_svc.shortest_path(a, b, role=_role(authorization))
    path = result.get("path", [])
    return {
        "a": a,
        "b": b,
        "path": path,
        "edges": result.get("edges", []),
        "length": max(0, len(path) - 1),
        "found": len(path) > 0,
    }


@router.get("/v1/graph/paths")
async def get_paths(
    a: str = Query(..., description="source node id"),
    b: str = Query(..., description="target node id"),
    max_len: int = Query(default=4, ge=1, le=8),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Every simple path between ``a`` and ``b`` with at most ``max_len`` edges."""
    paths = graph_svc.all_paths(a, b, max_len=max_len)
    return {"a": a, "b": b, "max_len": max_len, "paths": paths, "count": len(paths)}


@router.get("/v1/graph/centrality")
async def get_centrality(
    _token: Optional[str] = Depends(optional_bearer),
):
    """Per-node centrality score (degree, upgraded to PageRank when available)."""
    scores = graph_svc.centrality()
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    return {
        "scores": scores,
        "ranking": [{"id": k, "score": v} for k, v in ranked],
        "count": len(scores),
    }


@router.get("/v1/graph/communities")
async def get_communities(
    _token: Optional[str] = Depends(optional_bearer),
):
    """Partition the graph into communities; returns a cluster id per node."""
    clusters = graph_svc.communities()
    n_clusters = len(set(clusters.values())) if clusters else 0
    return {"communities": clusters, "n_clusters": n_clusters, "count": len(clusters)}
