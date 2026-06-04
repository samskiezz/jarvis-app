"""APEX↔underworld platform bridge routes.

Exposes the *whole* underworld platform (knowledge graph + analytics, world-model
counterfactual, real Bayesian optimizer, temporal knowledge graph) to the APEX
UI as public reads (``optional_bearer``). Every endpoint delegates to
:mod:`server.services.underworld_bridge`, whose wrappers never raise — so these
routes always return a JSON body even when the underworld platform is not
importable in this process.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import underworld_bridge

router = APIRouter(prefix="/v1/bridge", tags=["bridge"])


class GraphRequest(BaseModel):
    objects: list[dict] | None = None
    links: list[dict] | None = None


class CounterfactualRequest(BaseModel):
    baseline: dict | None = None
    intervention: dict | None = None
    label: str = "intervention"


class OptimizeRequest(BaseModel):
    objective_name: str = "branin"
    bounds: list | None = None
    n_iter: int = 25
    seed: int = 0


class TemporalRequest(BaseModel):
    # Mode A: temporal slice — supply `nodes` + `tick`.
    nodes: list[dict] | None = None
    tick: int = 0
    # Mode B: causal chain — supply `edges` + `start`.
    edges: list[dict] | None = None
    start: str | None = None


@router.get("/status")
async def bridge_status(_token: str | None = Depends(optional_bearer)):
    """Is the underworld platform reachable in this process, and what's wired."""
    return underworld_bridge.world_summary()


@router.post("/graph")
async def bridge_graph(req: GraphRequest, _token: str | None = Depends(optional_bearer)):
    """Graph analytics (pagerank, prerequisites, novelty, shortest path) on a graph."""
    return underworld_bridge.graph_analytics(req.objects, req.links)


@router.post("/counterfactual")
async def bridge_counterfactual(
    req: CounterfactualRequest, _token: str | None = Depends(optional_bearer)
):
    """World-model counterfactual: fork a baseline by an intervention, report divergence."""
    return underworld_bridge.counterfactual(req.baseline, req.intervention, req.label)


@router.post("/optimize")
async def bridge_optimize(req: OptimizeRequest, _token: str | None = Depends(optional_bearer)):
    """Real Bayesian optimization over a named benchmark objective (Branin/Hartmann)."""
    return underworld_bridge.optimize(
        req.objective_name, req.bounds, req.n_iter, seed=req.seed
    )


@router.post("/temporal")
async def bridge_temporal(req: TemporalRequest, _token: str | None = Depends(optional_bearer)):
    """Temporal knowledge graph: a time-slice query (`nodes`+`tick`) or a causal
    chain walk (`edges`+`start`). Supply whichever pair fits the question."""
    if req.edges is not None or req.start is not None:
        return underworld_bridge.causal_chain(req.edges, req.start or "")
    return underworld_bridge.temporal_query(req.nodes, req.tick)
