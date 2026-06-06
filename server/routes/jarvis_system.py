"""JARVIS SYSTEM routes — platform startup + status + gated dispatch."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from ..auth import optional_bearer, require_bearer
from ..services import jarvis_system as sysmod
from ..services import jarvis_synapse as synmod
from ..services import world_dispatch as wd

router = APIRouter(prefix="/v1/jarvis/system", tags=["jarvis-system"])

@router.get("/status")
async def status(_t: str | None = Depends(optional_bearer)):
    return sysmod.status()

@router.get("/capacity")
async def capacity(neurons_per_cluster: int = 10, _t: str | None = Depends(optional_bearer)):
    """Combinatorial synaptic-capacity expansion of the live ontology graph."""
    return synmod.capacity(neurons_per_cluster=neurons_per_cluster)

@router.get("/expansion")
async def expansion(branching: int = 10, _t: str | None = Depends(optional_bearer)):
    """Full hierarchical expansion: neurons -> clusters -> super/hyper-clusters,
    with every node/synapse/cluster tallied across all layers."""
    return synmod.full_expansion(branching=branching)

@router.post("/startup")
async def startup(_t: str = Depends(require_bearer)):
    return sysmod.startup()

@router.get("/gate")
async def gate(_t: str | None = Depends(optional_bearer)):
    return wd.gate_report()

@router.post("/dispatch")
async def dispatch(per_source_limit: int = 20, _t: str = Depends(require_bearer)):
    return wd.dispatch(per_source_limit=per_source_limit)
