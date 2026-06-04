"""Gateway routes — the single HTTP front door from APEX to the underworld backend.

Mounted at ``/v1/underworld``. The APEX frontend reaches underworld capability
that only lives over HTTP (the simulation/worlds API, the physics solver, the
science + knowledge endpoints) through this one base URL, complementing the
in-process science registry bridge at ``/functions/science/*``.

All endpoints are public reads (``optional_bearer``: a token is validated when
supplied but absence is allowed unless ``JARVIS_REQUIRE_AUTH=true``). The service
layer is network-guarded and never raises, so these routes return JSON — never a
500 — even when the underworld server is offline (you get the honest 502 shape).

NOTE: this is an HTTP reverse-proxy. Full API-gateway features (rate limiting,
request re-authentication, per-route authz) are a later step (pillar P16).
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Request

from ..auth import optional_bearer
from ..services import gateway

router = APIRouter(prefix="/v1/underworld", tags=["gateway"])


@router.get("/health")
async def underworld_health(_token: str | None = Depends(optional_bearer)):
    """Reachability + latency probe for the underworld backend (never 500s)."""
    return gateway.underworld_health()


@router.get("/catalog")
async def underworld_catalog(_token: str | None = Depends(optional_bearer)):
    """Discoverable map of the underworld HTTP endpoints this gateway exposes."""
    return {
        "configured": gateway.underworld_configured(),
        "base_url": gateway.underworld_url(),
        "endpoints": gateway.catalog(),
    }


@router.get("/proxy/{path:path}")
async def proxy_get(
    path: str,
    request: Request,
    _token: str | None = Depends(optional_bearer),
):
    """Proxy a GET to the underworld backend, forwarding query params."""
    params = dict(request.query_params)
    return gateway.proxy("GET", path, params=params or None)


@router.post("/proxy/{path:path}")
async def proxy_post(
    path: str,
    request: Request,
    body: Optional[dict[str, Any]] = Body(default=None),
    _token: str | None = Depends(optional_bearer),
):
    """Proxy a POST to the underworld backend, forwarding query params + JSON body."""
    params = dict(request.query_params)
    return gateway.proxy("POST", path, params=params or None, json_body=body)
