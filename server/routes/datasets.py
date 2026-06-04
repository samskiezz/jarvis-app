"""DATA-INTEGRATION DEPTH routes — dataset catalog, schema registry/versioning,
transforms, lineage/provenance graph, and data-health monitors (Foundry P1
#3/#4/#5/#7/#8).

This router is the HTTP surface over ``server/services/datasets.py``. It is a
NEW, self-contained plane mounted under ``/v1/datasets`` that sits ALONGSIDE the
existing ``pipelines`` integration routes (which also serve ``/v1/datasets`` at
the app root). To avoid path collisions it carries its own ``prefix`` so a host
app can mount either/both as desired (mount this one to expose the depth layer).

Reads use ``optional_bearer`` (public unless JARVIS_REQUIRE_AUTH=true), matching
the history/predict/pipelines read endpoints; the mutating register / version /
transform / seed endpoints use ``require_bearer``.

Endpoints (all relative to the ``/v1/datasets`` prefix):
  * ``GET  /``                  — dataset catalog.
  * ``GET  /lineage``           — the full provenance graph (nodes + edges).
  * ``POST /``                  — register a dataset (bearer).
  * ``POST /transform``         — record a transform + lineage edges (bearer).
  * ``POST /seed``              — seed the catalog from the History Lake (bearer).
  * ``GET  /{id}``              — one dataset (with its version history).
  * ``GET  /{id}/health``       — data-health checks for a dataset.
  * ``POST /{id}/version``      — append a new schema version (bearer).
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import datasets as ds

router = APIRouter(prefix="/v1/datasets", tags=["datasets"])


# ── request models ───────────────────────────────────────────────────────────────
class DatasetRegister(BaseModel):
    name: str = Field(..., description="Unique dataset name (catalog key).")
    owner: Optional[str] = Field(default=None, description="Owner label.")
    kind: str = Field(default="table", description="Dataset kind: table|series|derived|...")
    schema_: dict[str, Any] = Field(default_factory=dict, alias="schema",
                                    description="Descriptive JSON schema dict.")
    series_id: Optional[str] = Field(default=None,
                                     description="Bind to a History-Lake series for health.")

    model_config = {"populate_by_name": True}


class VersionBump(BaseModel):
    schema_: dict[str, Any] = Field(default_factory=dict, alias="schema",
                                    description="New schema for the appended version.")
    note: Optional[str] = Field(default=None, description="Version note / changelog.")

    model_config = {"populate_by_name": True}


class TransformRecord(BaseModel):
    name: str = Field(..., description="Transform name.")
    inputs: list[str] = Field(default_factory=list, description="Upstream dataset ids/names.")
    output_dataset: Optional[str] = Field(default=None, description="Output dataset id/name.")
    language: str = Field(default="sql", description="Transform language: sql|python|...")
    code: Optional[str] = Field(default=None, description="Transform source code.")


# ── reads ─────────────────────────────────────────────────────────────────────────
@router.get("")
@router.get("/")
async def get_datasets(_token: str | None = Depends(optional_bearer)):
    """List the dataset catalog."""
    items = ds.list_datasets()
    return {"items": items, "count": len(items)}


@router.get("/lineage")
async def get_lineage(_token: str | None = Depends(optional_bearer)):
    """Return the full provenance graph (nodes + edges)."""
    return ds.lineage_graph()


@router.get("/{dataset_id}")
async def get_one(dataset_id: str, _token: str | None = Depends(optional_bearer)):
    """Fetch one dataset (with its full schema version history)."""
    found = ds.get_dataset(dataset_id)
    if found is None:
        raise HTTPException(status_code=404, detail="unknown dataset")
    return found


@router.get("/{dataset_id}/health")
async def get_health(dataset_id: str, _token: str | None = Depends(optional_bearer)):
    """Compute data-health checks for a dataset (null-rate, row-count, staleness,
    drift when backed by a series; freshness/row_count otherwise)."""
    res = ds.health(dataset_id)
    if res.get("found") is False:
        raise HTTPException(status_code=404, detail="unknown dataset")
    return res


# ── writes ──────────────────────────────────────────────────────────────────────
@router.post("")
@router.post("/")
async def post_dataset(body: DatasetRegister, _token: str = Depends(require_bearer)):
    """Register (or update) a dataset in the catalog."""
    res = ds.register_dataset(
        body.name, owner=body.owner, kind=body.kind,
        schema=body.schema_, series_id=body.series_id,
    )
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "register failed"))
    return res


@router.post("/{dataset_id}/version")
async def post_version(dataset_id: str, body: VersionBump,
                       _token: str = Depends(require_bearer)):
    """Append a new schema version (schema registry / versioning)."""
    res = ds.bump_version(dataset_id, body.schema_, note=body.note)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "bump failed"))
    return res


@router.post("/transform")
async def post_transform(body: TransformRecord, _token: str = Depends(require_bearer)):
    """Record a transform (code-as-data) and its lineage edges."""
    res = ds.record_transform(
        body.name, body.inputs, body.output_dataset,
        language=body.language, code=body.code,
    )
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "transform failed"))
    return res


@router.post("/seed")
async def post_seed(_token: str = Depends(require_bearer)):
    """Seed the catalog from existing History-Lake series (idempotent)."""
    return ds.seed_from_history_lake()
