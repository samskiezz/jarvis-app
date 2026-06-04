"""TEMPORAL GRAPH PLAYBACK routes (P5 #41).

A ready-to-mount ``APIRouter`` (prefix ``/v1/graph-time``) exposing the time-aware
graph views in :mod:`server.services.graph_time`:

  * ``GET  /v1/graph-time/at?ts=``        — the subgraph as it existed at ``ts``.
  * ``POST /v1/graph-time/playback``      — N evenly-spaced snapshots across a
                                            window so a UI scrubber can animate
                                            the graph growing over time.

Reads are public via ``optional_bearer`` (a token is validated when supplied;
absence is allowed unless JARVIS_REQUIRE_AUTH=true), matching the rest of the
read API. When a bearer is present its role is resolved (best-effort) so node
props are redacted to the caller's clearance. Handlers never raise — the service
already degrades gracefully.

Wire it in ``server/main.py`` with::

    from .routes import graph_time as graph_time_routes
    app.include_router(graph_time_routes.router)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field

from ..auth import optional_bearer
from ..services import graph_time as gt_svc

try:  # role resolution is best-effort
    from ..services import security as _security  # type: ignore
except Exception:  # noqa: BLE001
    _security = None

router = APIRouter(prefix="/v1/graph-time")


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


class PlaybackIn(BaseModel):
    frames: int = Field(default=24, ge=1, le=240, description="Number of snapshots.")
    t0: Optional[int] = Field(default=None, description="Window start (epoch-ms).")
    t1: Optional[int] = Field(default=None, description="Window end (epoch-ms).")


@router.get("/at")
async def get_graph_at(
    ts: Optional[int] = Query(default=None, description="Instant (epoch-ms); now if omitted."),
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(optional_bearer),
):
    """The subgraph as it existed at time ``ts`` (objects + links present by then)."""
    return gt_svc.graph_at(ts, role=_role(authorization))


@router.post("/playback")
async def post_playback(
    body: PlaybackIn,
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(optional_bearer),
):
    """N evenly-spaced graph snapshots across ``[t0, t1]`` for a UI scrubber."""
    return gt_svc.playback(
        frames=body.frames, t0=body.t0, t1=body.t1, role=_role(authorization)
    )
