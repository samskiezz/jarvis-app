"""JARVIS Nexus — service registry router (/v1/registry/*).

Mounted on the :8001 FastAPI app (the one process every cluster reaches).
Every service announces itself here on boot + heartbeats on its loop tick, so
the whole system finally has one queryable roster instead of hand-maintained
allowlists. Part of Nexus Phase 1.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services import registry_store

router = APIRouter()


class Announce(BaseModel):
    id: str
    name: str = ""
    port: Optional[int] = None
    role: str = ""
    base_url: str = ""
    transport: str = "http"
    health_path: str = "/health"
    routes: list[str] = Field(default_factory=list)
    pid: Optional[int] = None
    status: str = "ok"
    meta: dict = Field(default_factory=dict)


class Heartbeat(BaseModel):
    id: str
    status: str = "ok"
    metrics: dict = Field(default_factory=dict)


@router.post("/v1/registry/announce")
async def announce(body: Announce):
    return registry_store.upsert(body.model_dump())


@router.post("/v1/registry/heartbeat")
async def heartbeat(body: Heartbeat):
    return registry_store.heartbeat(body.id, body.status, body.metrics)


@router.get("/v1/registry/services")
async def services():
    svcs = registry_store.list_services()
    return {
        "count": len(svcs),
        "alive": sum(1 for s in svcs if s.get("alive")),
        "services": svcs,
    }


@router.get("/v1/registry/resolve/{sid}")
async def resolve(sid: str):
    r = registry_store.resolve(sid)
    return r or {"error": "not found", "id": sid}
