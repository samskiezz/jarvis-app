"""SOURCE CONNECTOR FRAMEWORK routes — typed connector registry, sample-preview,
run, backfill/replay, and run-history (Palantir Foundry P1 #1/#9/#10/#12/#14).

The HTTP surface over ``server/services/connectors.py``. A NEW, self-contained
plane mounted under ``/v1/connectors`` that sits ALONGSIDE the existing
``pipelines`` / ``datasets`` integration routes (this does not touch them).

Reads use ``optional_bearer`` (public unless JARVIS_REQUIRE_AUTH=true), matching
the history/predict/datasets read endpoints; the mutating register / delete /
run / backfill endpoints use ``require_bearer``. Preview is a read (it lands
nothing), so it uses ``optional_bearer``.

Endpoints (relative to the ``/v1/connectors`` prefix):
  * ``GET    /``                 — list registered connectors.
  * ``POST   /``                 — register (or update) a connector (bearer).
  * ``POST   /preview``          — sample WITHOUT landing {kind, config}.
  * ``GET    /{id}``             — fetch one connector.
  * ``DELETE /{id}``             — delete a connector (bearer).
  * ``POST   /{id}/run``         — run + optionally land into a dataset (bearer).
  * ``POST   /{id}/backfill``    — replay a historical window (bearer).
  * ``GET    /{id}/runs``        — run-history audit for a connector.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import connectors as cx

# Mounted at /v1/sources to avoid shadowing the legacy pipelines `/v1/connectors`
# endpoint (which lists available connector *kinds*). This router manages
# registered source *instances* (register/preview/run/backfill/runs).
router = APIRouter(prefix="/v1/sources", tags=["connectors"])


# ── request models ───────────────────────────────────────────────────────────────
class ConnectorRegister(BaseModel):
    name: str = Field(..., description="Unique connector name (registry key).")
    kind: str = Field(..., description="Connector kind: rest_json|csv_url|rss|inline.")
    config: dict[str, Any] = Field(default_factory=dict,
                                   description="Kind-specific config (url/path/rows/...).")


class PreviewBody(BaseModel):
    kind: str = Field(..., description="Connector kind: rest_json|csv_url|rss|inline.")
    config: dict[str, Any] = Field(default_factory=dict,
                                   description="Kind-specific config to sample.")
    n: int = Field(default=5, ge=0, le=1000, description="Rows to preview.")


class RunBody(BaseModel):
    dataset_name: Optional[str] = Field(default=None,
                                        description="If given, land rows into this dataset.")


class BackfillBody(BaseModel):
    since: Optional[Any] = Field(default=None, description="Window start bound.")
    until: Optional[Any] = Field(default=None, description="Window end bound.")
    dataset_name: Optional[str] = Field(default=None,
                                        description="If given, land replayed rows here.")


# ── reads ─────────────────────────────────────────────────────────────────────────
@router.get("")
@router.get("/")
async def get_connectors(_token: str | None = Depends(optional_bearer)):
    """List registered connectors."""
    items = cx.list_connectors()
    return {"items": items, "count": len(items), "kinds": list(cx.KINDS)}


@router.post("/preview")
async def post_preview(body: PreviewBody, _token: str | None = Depends(optional_bearer)):
    """Sample-preview the first N normalized rows WITHOUT landing (P1 #12).

    Network-guarded: offline → ``{rows: [], note: "source unreachable"}``."""
    return cx.preview({"kind": body.kind, "config": body.config}, n=body.n)


@router.get("/{connector_id}")
async def get_one(connector_id: str, _token: str | None = Depends(optional_bearer)):
    """Fetch one connector by id (or name)."""
    found = cx.get_connector(connector_id)
    if found is None:
        raise HTTPException(status_code=404, detail="unknown connector")
    return found


@router.get("/{connector_id}/runs")
async def get_runs(connector_id: str, limit: int = 50,
                   _token: str | None = Depends(optional_bearer)):
    """Run-history audit for a connector (most recent first)."""
    found = cx.get_connector(connector_id)
    if found is None:
        raise HTTPException(status_code=404, detail="unknown connector")
    runs = cx.list_runs(found["id"], limit=limit)
    return {"connector_id": found["id"], "runs": runs, "count": len(runs)}


# ── writes ──────────────────────────────────────────────────────────────────────
@router.post("")
@router.post("/")
async def post_connector(body: ConnectorRegister, _token: str = Depends(require_bearer)):
    """Register (or update) a connector."""
    res = cx.register_connector(body.name, body.kind, body.config)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "register failed"))
    return res


@router.delete("/{connector_id}")
async def delete_one(connector_id: str, _token: str = Depends(require_bearer)):
    """Delete a connector (and its run history)."""
    res = cx.delete_connector(connector_id)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "delete failed"))
    return res


@router.post("/{connector_id}/run")
async def post_run(connector_id: str, body: RunBody | None = None,
                   _token: str = Depends(require_bearer)):
    """Run a connector: fetch rows, optionally land into a dataset, audit the run."""
    dataset_name = body.dataset_name if body else None
    res = cx.run_connector(connector_id, dataset_name=dataset_name)
    if not res.get("ok"):
        raise HTTPException(status_code=404, detail=res.get("error", "run failed"))
    return res


@router.post("/{connector_id}/backfill")
async def post_backfill(connector_id: str, body: BackfillBody | None = None,
                        _token: str = Depends(require_bearer)):
    """Replay a connector for a historical window (P1 #10).

    Honest: a connector with no ``window_param`` returns
    ``{ok: False, note: "connector has no time window"}``."""
    b = body or BackfillBody()
    res = cx.backfill(connector_id, since=b.since, until=b.until,
                      dataset_name=b.dataset_name)
    if res.get("error") == "unknown connector":
        raise HTTPException(status_code=404, detail="unknown connector")
    return res
