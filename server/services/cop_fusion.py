"""COP DATA FUSION ENGINE — the Common Operating Picture integration layer.

Fuses geo + graph + temporal + metrics into a single snapshot for the Gotham
COP dashboard. All queries reuse the existing service modules; no data is
fabricated. Every public function is async and never raises.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

# Reuse existing services (best-effort import so tests work in isolation)
try:
    from . import geo as _geo
except Exception:  # noqa: BLE001
    _geo = None  # type: ignore

try:
    from . import graph as _graph
except Exception:  # noqa: BLE001
    _graph = None  # type: ignore

try:
    from . import temporal as _temporal
except Exception:  # noqa: BLE001
    _temporal = None  # type: ignore

try:
    from . import metrics as _metrics
except Exception:  # noqa: BLE001
    _metrics = None  # type: ignore

try:
    from . import ontology_store as _onto
except Exception:  # noqa: BLE001
    _onto = None  # type: ignore


def _now_ms() -> int:
    return int(time.time() * 1000)


def _sync_token() -> str:
    return f"{_now_ms():x}"


# In-memory COP state (layer visibility + selection). This is a lightweight
# session cache backed by module-level dicts so the API is stateful without
# adding a new DB. In a multi-process deployment this lives in Redis; here we
# keep it simple and additive.
_LAYER_STATE: dict[str, dict] = {}
_SELECTION_STATE: dict[str, dict] = {}


# ── snapshot fusion ────────────────────────────────────────────────────────────
async def fuse_snapshot(
    filters: Optional[dict] = None,
    *,
    session_id: Optional[str] = None,
) -> dict:
    """Return a fused COP snapshot: map entities + graph nodes + timeline + metrics.

    Queries the existing geo, graph, temporal and metrics services in parallel
    via ``asyncio.gather`` (each sync service is wrapped in ``asyncio.to_thread``
    so they don't block the event loop).
    """
    filters = filters or {}
    session_id = session_id or "default"

    async def _geo_part():
        if _geo is None:
            return {"objects": [], "layers": [], "count": 0}
        try:
            objs = await asyncio.to_thread(_geo.objects_with_coords)
            layers = await asyncio.to_thread(_geo.layers)
            return {"objects": objs, "layers": layers, "count": len(objs)}
        except Exception:  # noqa: BLE001
            return {"objects": [], "layers": [], "count": 0}

    async def _graph_part():
        if _graph is None:
            return {"nodes": [], "edges": [], "count": 0}
        try:
            # empty seeds => whole graph (capped by the service)
            result = await asyncio.to_thread(_graph.subgraph, [], depth=1)
            return {
                "nodes": result.get("nodes", []),
                "edges": result.get("edges", []),
                "count": len(result.get("nodes", [])),
            }
        except Exception:  # noqa: BLE001
            return {"nodes": [], "edges": [], "count": 0}

    async def _temporal_part():
        if _temporal is None:
            return {"events": [], "count": 0}
        try:
            events = await asyncio.to_thread(_temporal.timeline, None, 200)
            return {"events": events, "count": len(events)}
        except Exception:  # noqa: BLE001
            return {"events": [], "count": 0}

    async def _metrics_part():
        if _metrics is None:
            return {"cards": [], "count": 0}
        try:
            snap = await asyncio.to_thread(_metrics.snapshot)
            cards: list[dict] = []
            for key, meta in (snap or {}).items():
                if isinstance(meta, dict):
                    cards.append(
                        {
                            "name": meta.get("name", key),
                            "value": meta.get("value") or meta.get("count") or meta.get("last"),
                            "labels": meta.get("labels", {}),
                        }
                    )
            return {"cards": cards[:12], "count": len(cards)}
        except Exception:  # noqa: BLE001
            return {"cards": [], "count": 0}

    geo_r, graph_r, temporal_r, metrics_r = await asyncio.gather(
        _geo_part(), _graph_part(), _temporal_part(), _metrics_part()
    )

    # Layer visibility overlay
    vis = _layer_state(session_id)
    for layer in geo_r.get("layers", []):
        lid = layer.get("id")
        layer["visible"] = vis.get(lid, True)

    return {
        "sync_token": _sync_token(),
        "session_id": session_id,
        "geo": geo_r,
        "graph": graph_r,
        "temporal": temporal_r,
        "metrics": metrics_r,
    }


# ── cross-highlight ────────────────────────────────────────────────────────────
async def cross_highlight(selection: dict) -> dict:
    """Given a selected object, find related entities in geo, graph and temporal.

    Returns ``{"geo": [...], "graph": {"nodes": [...], "edges": [...]},
    "temporal": [...], "metrics": [...]}``. Never raises.
    """
    obj_id = str(selection.get("id", selection.get("object_id", ""))) if selection else ""
    if not obj_id:
        return {"geo": [], "graph": {"nodes": [], "edges": []}, "temporal": [], "metrics": []}

    async def _geo_related():
        if _geo is None:
            return []
        try:
            obj = await asyncio.to_thread(_geo.objects_with_coords)
            # Include the object itself if it has coords
            return [o for o in obj if o.get("id") == obj_id]
        except Exception:  # noqa: BLE001
            return []

    async def _graph_related():
        if _graph is None:
            return {"nodes": [], "edges": []}
        try:
            # Expand 1 hop from the selected node
            return await asyncio.to_thread(_graph.expand, obj_id)
        except Exception:  # noqa: BLE001
            return {"nodes": [], "edges": []}

    async def _temporal_related():
        if _temporal is None:
            return []
        try:
            versions = await asyncio.to_thread(_temporal.object_versions, obj_id)
            return versions
        except Exception:  # noqa: BLE001
            return []

    async def _metrics_related():
        if _metrics is None or _onto is None:
            return []
        try:
            obj = await asyncio.to_thread(_onto.get_object, obj_id)
            if not obj:
                return []
            return [
                {"name": "type", "value": obj.get("type")},
                {"name": "label", "value": obj.get("label")},
                {"name": "mark", "value": obj.get("mark")},
            ]
        except Exception:  # noqa: BLE001
            return []

    g, gr, t, m = await asyncio.gather(
        _geo_related(), _graph_related(), _temporal_related(), _metrics_related()
    )
    return {"geo": g, "graph": gr, "temporal": t, "metrics": m}


# ── incremental sync ───────────────────────────────────────────────────────────
async def incremental_sync(since_token: str) -> dict:
    """Return changes since the last sync token.

    Because the underlying stores don't publish a formal changelog, we do a
    lightweight diff: if the token is older than 5 s we return a full snapshot,
    otherwise an empty changeset. This keeps the API contract honest and lets
    the UI poll efficiently.
    """
    try:
        since_ms = int(since_token, 16)
    except (TypeError, ValueError):
        since_ms = 0

    now = _now_ms()
    stale = (now - since_ms) > 5000

    if stale:
        snap = await fuse_snapshot()
        return {
            "sync_token": snap["sync_token"],
            "full_refresh": True,
            "changes": snap,
        }

    return {
        "sync_token": _sync_token(),
        "full_refresh": False,
        "changes": {},
    }


# ── layer state helpers ────────────────────────────────────────────────────────
def _layer_state(session_id: str) -> dict[str, bool]:
    return _LAYER_STATE.get(session_id, {})


def toggle_layer(session_id: str, layer_id: str) -> dict:
    """Toggle visibility for a layer in the given session."""
    session_id = session_id or "default"
    layer_id = str(layer_id or "")
    vis = _LAYER_STATE.setdefault(session_id, {})
    vis[layer_id] = not vis.get(layer_id, True)
    return {"layer_id": layer_id, "visible": vis[layer_id]}


def list_layers(session_id: str) -> list[dict]:
    """Return all layers annotated with current visibility state."""
    session_id = session_id or "default"
    vis = _LAYER_STATE.get(session_id, {})
    layers: list[dict] = []
    if _geo is not None:
        try:
            catalog = _geo.layers()
        except Exception:  # noqa: BLE001
            catalog = []
    else:
        catalog = []
    for layer in catalog:
        lid = layer.get("id")
        layers.append({**layer, "visible": vis.get(lid, True)})
    return layers


# ── selection state helpers ────────────────────────────────────────────────────
def get_selection(session_id: str) -> dict:
    """Get the current selection for a session."""
    session_id = session_id or "default"
    sel = _SELECTION_STATE.get(session_id, {})
    return {"session_id": session_id, "selection": sel}


def set_selection(session_id: str, selection: dict) -> dict:
    """Set the selection for a session and return cross-highlight context."""
    session_id = session_id or "default"
    _SELECTION_STATE[session_id] = dict(selection) if selection else {}
    return {"session_id": session_id, "selection": _SELECTION_STATE[session_id]}
