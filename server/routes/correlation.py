"""JARVIS Nexus Phase 2 — cross-store correlation (/v1/correlate/*).

The seam that makes the siloed stores cross-correlatable. It reuses the existing
unified multi-store reader (`storage_router.retrieve` = vector + FTS + graph
fusion) and the ontology graph service, then PUBLISHES the correlation onto the
Nexus bus so any service can consume a cross-store answer without re-implementing
the join. Read-only over the source stores; defensive (never raises).
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from ..services import graph as _graph
from ..services import jarvis_events as _bus
from ..services import storage_router as _sr

router = APIRouter()


def _label(object_id: str) -> str:
    try:
        o = _graph._get_object(object_id)
        if o:
            return str(o.get("label") or o.get("title") or object_id)
    except Exception:  # noqa: BLE001
        pass
    return object_id


def _hit_count(hits) -> int:
    if isinstance(hits, dict):
        for k in ("hits", "results", "items"):
            v = hits.get(k)
            if isinstance(v, list):
                return len(v)
    return 0


@router.get("/v1/correlate/search")
async def correlate_search(q: str = Query(...), k: int = 10):
    """Free-text cross-store retrieval (vector + FTS + graph)."""
    try:
        res = _sr.retrieve(q, k=k, expand_graph=True)
    except Exception as e:  # noqa: BLE001
        res = {"error": str(e), "hits": []}
    try:
        _bus.emit("correlation", "search", {"q": q, "k": k, "n": _hit_count(res)}, actor="nexus-correlate")
    except Exception:  # noqa: BLE001
        pass
    return res


@router.get("/v1/correlate/{object_id}")
async def correlate_object(object_id: str, k: int = 10):
    """Cross-store correlation for one ontology object: graph neighbours fused
    with vector/FTS hits across every store, published onto the bus."""
    label = _label(object_id)

    try:
        graph = _graph.expand(object_id)
    except Exception:  # noqa: BLE001
        graph = {"nodes": [], "edges": []}

    try:
        cross = _sr.retrieve(label, k=k, expand_graph=True)
    except Exception as e:  # noqa: BLE001
        cross = {"error": str(e), "hits": []}

    out = {
        "object_id": object_id,
        "label": label,
        "graph": {
            "nodes": graph.get("nodes", []),
            "edges": graph.get("edges", []),
            "n_nodes": len(graph.get("nodes", [])),
            "n_edges": len(graph.get("edges", [])),
        },
        "cross_store": cross,
        "n_cross_store": _hit_count(cross),
    }

    try:
        _bus.emit("correlation", "result", {
            "object_id": object_id, "label": label,
            "n_neighbours": len(graph.get("nodes", [])),
            "n_cross_store": _hit_count(cross),
        }, actor="nexus-correlate")
    except Exception:  # noqa: BLE001
        pass

    return out
