"""COMMON OPERATING PICTURE (COP) routes — single-screen data fusion API.

Fuses map entities + graph nodes + timeline events + metric cards into one
snapshot, with layer controls, cross-pane selection, and incremental sync.

  * ``GET  /v1/cop/snapshot``           — fused snapshot.
  * ``GET  /v1/cop/layers``             — active layers + visibility.
  * ``POST /v1/cop/layers/toggle``      — toggle layer visibility.
  * ``GET  /v1/cop/selection``          — current selection.
  * ``POST /v1/cop/selection``          — set selection (triggers cross-highlight).
  * ``GET  /v1/cop/sync``               — incremental sync token.

All reads are public via ``optional_bearer``; writes (toggle / selection)
accept a bearer when present but do not require it unless
JARVIS_REQUIRE_AUTH=true (the optional_bearer contract). Data is honest:
only what exists in the underlying stores is returned.

Wire it in ``main.py`` with::

    from .routes import cop as cop_routes
    app.include_router(cop_routes.router)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ..auth import optional_bearer
from ..services import cop_fusion as fusion

router = APIRouter(prefix="/v1/cop", tags=["cop"])


# ── request models ─────────────────────────────────────────────────────────────
class SnapshotFilters(BaseModel):
    bbox: Optional[list[float]] = Field(default=None, description="Optional [min_lat, min_lon, max_lat, max_lon]")
    series_ids: Optional[list[str]] = Field(default=None, description="Temporal series to include")
    layer_ids: Optional[list[str]] = Field(default=None, description="Layer whitelist")


class ToggleBody(BaseModel):
    layer_id: str = Field(..., description="Layer to toggle")


class SelectionBody(BaseModel):
    object_id: Optional[str] = Field(default=None, description="Selected object id")
    id: Optional[str] = Field(default=None, description="Alias for object_id")
    type: Optional[str] = Field(default=None, description="Object type hint")
    source_pane: Optional[str] = Field(default=None, description="Pane that originated the selection")


# ── helpers ────────────────────────────────────────────────────────────────────
def _session_id(authorization: Optional[str]) -> str:
    """Derive a lightweight session key from the bearer so authenticated users
d don't share layer/selection state with anonymous traffic."""
    if not authorization:
        return "anon"
    # Use the first 16 chars of the raw header as a stable, opaque key.
    return authorization[:16]


# ── endpoints ──────────────────────────────────────────────────────────────────
@router.get("/snapshot")
async def cop_snapshot(
    session_id: Optional[str] = Query(default=None, description="COP session id (optional)"),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Fused snapshot: geo + graph + temporal + metrics."""
    sid = session_id or _session_id(str(_token) if _token else None)
    return await fusion.fuse_snapshot(session_id=sid)


@router.post("/snapshot")
async def cop_snapshot_post(
    body: SnapshotFilters,
    session_id: Optional[str] = Query(default=None, description="COP session id (optional)"),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Fused snapshot with optional filters."""
    sid = session_id or _session_id(str(_token) if _token else None)
    filters = body.model_dump(exclude_none=True)
    return await fusion.fuse_snapshot(filters, session_id=sid)


@router.get("/layers")
async def cop_layers(
    session_id: Optional[str] = Query(default=None, description="COP session id (optional)"),
    _token: Optional[str] = Depends(optional_bearer),
):
    """List all active layers with visibility state."""
    sid = session_id or _session_id(str(_token) if _token else None)
    layers = fusion.list_layers(sid)
    return {"session_id": sid, "count": len(layers), "layers": layers}


@router.post("/layers/toggle")
async def cop_toggle_layer(
    body: ToggleBody,
    session_id: Optional[str] = Query(default=None, description="COP session id (optional)"),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Toggle layer visibility."""
    sid = session_id or _session_id(str(_token) if _token else None)
    result = fusion.toggle_layer(sid, body.layer_id)
    return {"session_id": sid, **result}


@router.get("/selection")
async def cop_get_selection(
    session_id: Optional[str] = Query(default=None, description="COP session id (optional)"),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Get currently selected object(s) with cross-pane context."""
    sid = session_id or _session_id(str(_token) if _token else None)
    return fusion.get_selection(sid)


@router.post("/selection")
async def cop_set_selection(
    body: SelectionBody,
    session_id: Optional[str] = Query(default=None, description="COP session id (optional)"),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Set selected object; triggers cross-pane highlight."""
    sid = session_id or _session_id(str(_token) if _token else None)
    obj_id = body.object_id or body.id
    selection = {"object_id": obj_id, "type": body.type, "source_pane": body.source_pane}
    fusion.set_selection(sid, selection)
    highlight = await fusion.cross_highlight(selection)
    return {
        "session_id": sid,
        "selection": selection,
        "highlight": highlight,
    }


@router.get("/sync")
async def cop_sync(
    since_token: str = Query(..., description="Last sync token"),
    session_id: Optional[str] = Query(default=None, description="COP session id (optional)"),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Returns sync token for incremental updates (polling)."""
    sid = session_id or _session_id(str(_token) if _token else None)
    result = await fusion.incremental_sync(since_token)
    result["session_id"] = sid
    return result
