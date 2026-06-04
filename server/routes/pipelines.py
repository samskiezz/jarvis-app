"""DATA-INTEGRATION routes — connectors / datasets / pipelines / lineage.

Foundry-style integration plane over the History Lake (see
``server/services/pipelines.py``). Reads use ``optional_bearer`` (public unless
JARVIS_REQUIRE_AUTH=true), matching the history/predict read endpoints; the
mutating run/transform endpoints use ``require_bearer``.

Endpoints:
  * ``GET  /v1/connectors``                  — available source connectors + schema.
  * ``GET  /v1/datasets``                    — dataset catalog.
  * ``POST /v1/datasets``                    — register a dataset (bearer).
  * ``GET  /v1/datasets/{name}/health``      — counts / freshness / null-rate.
  * ``GET  /v1/datasets/{name}/lineage``     — provenance graph.
  * ``POST /v1/pipelines/run``    {connector, params}  — ingest (bearer).
  * ``POST /v1/pipelines/transform`` {dataset, op}      — derived series (bearer).
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import pipelines as pl

router = APIRouter()


class DatasetRegister(BaseModel):
    name: str = Field(..., description="Friendly dataset name (catalog key).")
    source: str = Field(..., description="Originating connector/source.")
    schema_: dict[str, Any] = Field(default_factory=dict, alias="schema",
                                    description="Descriptive schema dict.")
    owner: Optional[str] = Field(default=None, description="Owner label.")
    series_id: Optional[str] = Field(default=None,
                                     description="Bind to an existing History Lake series.")

    model_config = {"populate_by_name": True}


class RunRequest(BaseModel):
    connector: str = Field(..., description="Connector name (see GET /v1/connectors).")
    params: dict[str, Any] = Field(default_factory=dict, description="Connector params.")


class TransformRequest(BaseModel):
    dataset: str = Field(..., description="Source dataset name.")
    op: dict[str, Any] = Field(..., description='Declarative op, e.g. {"op":"rolling_mean","window":7}.')
    owner: Optional[str] = Field(default=None, description="Owner for the derived dataset.")


@router.get("/v1/connectors")
async def get_connectors(_token: str | None = Depends(optional_bearer)):
    """List available source connectors with their params schema, plus the
    declarative transforms supported by /v1/pipelines/transform."""
    return {"connectors": pl.connectors(), "transforms": pl.TRANSFORMS}


@router.get("/v1/datasets")
async def get_datasets(_token: str | None = Depends(optional_bearer)):
    """List the dataset catalog."""
    items = pl.list_datasets()
    return {"items": items, "count": len(items)}


@router.post("/v1/datasets")
async def post_dataset(
    body: DatasetRegister, _token: str = Depends(require_bearer)
):
    """Register (or update) a dataset in the catalog."""
    res = pl.register_dataset(
        body.name, source=body.source, schema=body.schema_,
        owner=body.owner, series_id=body.series_id,
    )
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "register failed"))
    return res


@router.get("/v1/datasets/{name}/health")
async def get_dataset_health(name: str, _token: str | None = Depends(optional_bearer)):
    """Row count, last_ts, freshness, and null-rate from the bound series."""
    health = pl.dataset_health(name)
    if not health.get("found"):
        raise HTTPException(status_code=404, detail="unknown dataset")
    return health


@router.get("/v1/datasets/{name}/lineage")
async def get_dataset_lineage(name: str, _token: str | None = Depends(optional_bearer)):
    """Provenance graph (nodes + edges) for a dataset."""
    return pl.lineage(name)


@router.post("/v1/pipelines/run")
async def post_run(body: RunRequest, _token: str = Depends(require_bearer)):
    """Run a connector: ingest into the History Lake, recording a pipeline_run.
    Offline-tolerant — a network failure returns status='error'/'partial'."""
    return pl.run_connector(body.connector, body.params)


@router.post("/v1/pipelines/transform")
async def post_transform(body: TransformRequest, _token: str = Depends(require_bearer)):
    """Apply a declarative transform, producing a derived series + lineage edge."""
    res = pl.transform(body.dataset, body.op, owner=body.owner)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "transform failed"))
    return res
