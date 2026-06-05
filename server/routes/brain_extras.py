"""BRAIN EXTRAS routes — vault-health + transparent thinking-tools HTTP surface
over ``server/services/brain_health.py`` and ``brain_think.py``.

Mounted under ``/v1/brain`` (shared prefix), on DISTINCT subpaths:

  * ``GET  /health``           — vault hygiene scan (orphans/stale/gaps/...).
  * ``POST /heal-orphans``     — SUGGEST links for orphans (bearer; no writes).
  * ``POST /think/challenge``  — red-team an idea with cited counter-evidence.
  * ``POST /think/panel``      — N perspective stubs from relevant notes.
  * ``POST /think/connect``    — bridge two concepts via graph / embeddings.
  * ``POST /think/emerge``     — emergent (un-named) themes over recent notes.

Reads use ``optional_bearer``; the only mutating-by-intent endpoint
(``heal-orphans``, which still only SUGGESTS) uses ``require_bearer``. The
thinking tools are open reads (they only assemble existing evidence). Services
never raise.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import brain_autopilot as ap
from ..services import brain_enrich as be
from ..services import brain_health as bh
from ..services import brain_think as bt

router = APIRouter(prefix="/v1/brain", tags=["brain-extras"])


class AutopilotBody(BaseModel):
    max_passes: int = Field(default=5, ge=1, le=20, description="Max self-improvement passes.")


class EnrichBody(BaseModel):
    terms: list[str] | None = Field(default=None, description="Explicit concepts to fetch; default = real vault gaps.")
    limit: int = Field(default=20, ge=1, le=200, description="Max gaps to enrich this run.")
    only: list[str] | None = Field(default=None, description="Restrict to these connector names; default = all.")


# ── request bodies ───────────────────────────────────────────────────────────────────
class IdeaBody(BaseModel):
    idea: str = Field(..., description="The idea/claim to red-team.")


class DecisionBody(BaseModel):
    decision: str = Field(..., description="The decision to convene a panel on.")
    n: int = Field(default=4, ge=1, description="Number of perspectives.")


class ConnectBody(BaseModel):
    a: str = Field(..., description="First concept / note title.")
    b: str = Field(..., description="Second concept / note title.")


class EmergeBody(BaseModel):
    days: int = Field(default=30, ge=1, description="Recency window in days.")


# ── vault health ─────────────────────────────────────────────────────────────────────
@router.get("/health")
async def get_health(_token: str | None = Depends(optional_bearer)):
    """Vault-health scan: orphans, stale, gaps, low-confidence, contradictions, score."""
    return bh.health()


@router.post("/heal-orphans")
async def post_heal_orphans(_token: str = Depends(require_bearer)):
    """Suggest likely links for orphan notes via semantic search. Suggestions
    ONLY — nothing is written to the vault."""
    return bh.heal_orphans()


# ── autopilot: the self-improving loop that auto-fills knowledge gaps ──────────────────
@router.get("/autopilot/scan")
async def get_autopilot_scan(_token: str | None = Depends(optional_bearer)):
    """Report current knowledge gaps (gaps/orphans/themes) without writing."""
    return ap.scan()


@router.post("/autopilot/run")
async def post_autopilot_run(body: AutopilotBody | None = None, _token: str = Depends(require_bearer)):
    """Run improvement passes until the brain stops improving. ACTUALLY writes:
    resolves dangling references, links orphans, promotes emergent themes."""
    mp = body.max_passes if body else 5
    return ap.run(max_passes=mp)


@router.get("/autopilot/network")
async def get_autopilot_network(_token: str | None = Depends(optional_bearer)):
    """Whether external knowledge acquisition has egress right now."""
    return {"online": be.network_ok()}


@router.get("/sources")
async def get_sources(_token: str | None = Depends(optional_bearer)):
    """The registered open-data connectors powering enrichment (governance view)."""
    cat = be.sources_catalog()
    return {"count": len(cat), "sources": cat}


@router.get("/sources/probe")
async def get_sources_probe(_token: str | None = Depends(optional_bearer)):
    """Live reachability of each connector from this environment."""
    res = be.sources_probe()
    return {"online": sum(1 for v in res.values() if v), "total": len(res), "sources": res}


@router.post("/autopilot/enrich")
async def post_autopilot_enrich(body: EnrichBody | None = None, _token: str = Depends(require_bearer)):
    """Scrape real external knowledge for the vault's gaps and write grounded,
    source-cited notes. Fills holes from outside the vault, with provenance."""
    terms = body.terms if body else None
    limit = body.limit if body else 20
    only = body.only if body else None
    return be.enrich(terms, limit=limit, only=only)


# ── thinking tools ────────────────────────────────────────────────────────────────────
@router.post("/think/challenge")
async def post_challenge(body: IdeaBody, _token: str | None = Depends(optional_bearer)):
    """Red-team an idea: cited counter-evidence assembled from the vault."""
    return bt.challenge(body.idea)


@router.post("/think/panel")
async def post_panel(body: DecisionBody, _token: str | None = Depends(optional_bearer)):
    """Perspective stubs (real relevant notes) to weigh a decision against."""
    return bt.panel(body.decision, n=body.n)


@router.post("/think/connect")
async def post_connect(body: ConnectBody, _token: str | None = Depends(optional_bearer)):
    """Bridge two concepts via shared graph neighbours / nearest concepts."""
    return bt.connect(body.a, body.b)


@router.post("/think/emerge")
async def post_emerge(body: EmergeBody, _token: str | None = Depends(optional_bearer)):
    """Emergent, un-named themes over recent note bodies."""
    return bt.emerge(days=body.days)
