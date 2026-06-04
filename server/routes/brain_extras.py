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
from ..services import brain_health as bh
from ..services import brain_think as bt

router = APIRouter(prefix="/v1/brain", tags=["brain-extras"])


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
