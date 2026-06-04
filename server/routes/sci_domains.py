"""Science Domains routes — curated capability consoles (P14 #91-104).

Surfaces ~14 named consoles (sonar, meteor, ocean_buoys, air_quality, aerospace,
rf_spectrum, neuro, seismic, satellites, clusters, epidemic, quantum, materials,
trajectory) built over the underworld science registry. Public reads
(optional_bearer); every handler delegates to the always-graceful
``sci_domains`` service so a missing science engine never breaks the route.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import sci_domains

router = APIRouter(prefix="/v1/sci")


class RunRequest(BaseModel):
    field: str
    value: dict | None = None


@router.get("/domains")
async def list_domains(_token: str | None = Depends(optional_bearer)):
    """Console catalog with a live method count per console."""
    return sci_domains.domains()


@router.get("/domains/{domain_id}/methods")
async def domain_methods(domain_id: str, _token: str | None = Depends(optional_bearer)):
    """The live registry methods matching one console."""
    return sci_domains.domain_methods(domain_id)


@router.get("/domains/{domain_id}/examples")
async def domain_examples(domain_id: str, _token: str | None = Depends(optional_bearer)):
    """Curated, runnable {field, value} examples for one console."""
    return {"id": domain_id, "examples": sci_domains.suggested_inputs(domain_id)}


@router.post("/domains/{domain_id}/run")
async def run_domain_method(
    domain_id: str,
    req: RunRequest,
    _token: str | None = Depends(optional_bearer),
):
    """Run a science method through a console (pass-through to the bridge)."""
    return sci_domains.run(domain_id, req.field, req.value)
