"""SECOND BRAIN — RESEARCH / INGEST / RECONCILE / SYNTHESIZE routes.

The HTTP surface over ``server/services/brain_research.py`` — the self-feeding,
self-rewriting layer that makes the vault beat markdown-only second-brain repos.

Mounted under ``/v1/brain``. The subpaths here are DISTINCT from the core vault
router (``/notes``, ``/capture``, ``/daily``, ``/log``, ``/catalog``,
``/timeline``) and any CRM/health router (``/people``, ``/mention``, ``/health``,
``/think``):

  * ``POST /v1/brain/research``    — key-less public-source research dossier.
  * ``POST /v1/brain/ingest``      (bearer) — ingest a URL/text: raw record + notes.
  * ``POST /v1/brain/reconcile``   (bearer) — diff + bi-temporal note rewrite.
  * ``POST /v1/brain/synthesize``  (bearer) — cross-note synthesis note.

``/research`` is an open read (``optional_bearer``) since it touches only public
APIs; the three write endpoints require a bearer. Routes never raise out — the
service degrades gracefully and always returns a well-formed payload.

Mount in ``main.py`` with::

    from .routes import brain_research as brain_research_routes
    app.include_router(brain_research_routes.router)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import brain_research as br

router = APIRouter(prefix="/v1/brain", tags=["second-brain"])


# ── request bodies ─────────────────────────────────────────────────────────────────
class ResearchBody(BaseModel):
    topic: str = Field(..., description="Topic to research across key-less public sources.")


class IngestBody(BaseModel):
    source: str = Field(..., description="A URL to fetch + strip, or inline text to ingest.")
    title: Optional[str] = Field(default=None, description="Optional note title (auto-derived if omitted).")


class ReconcileBody(BaseModel):
    title: str = Field(..., description="Title of the note to reconcile.")
    latest: Optional[str] = Field(
        default=None,
        description="Optional latest claim text; defaults to the newest matching raw record.",
    )


class SynthesizeBody(BaseModel):
    topic: str = Field(..., description="Topic to synthesize across existing notes.")
    min_notes: int = Field(default=2, ge=1, description="Minimum relevant notes required to synthesize.")


# ── endpoints ───────────────────────────────────────────────────────────────────────
@router.post("/research")
async def research_endpoint(body: ResearchBody, _token: str | None = Depends(optional_bearer)):
    """Aggregate a research dossier from key-less public sources (Wikipedia,
    HackerNews, arXiv, Crossref, DuckDuckGo). Offline → empty findings, never
    fabricated."""
    return br.research(body.topic)


@router.post("/ingest")
async def ingest_endpoint(body: IngestBody, _token: str = Depends(require_bearer)):
    """Ingest a URL or inline text: save an immutable raw record AND upsert/rewrite
    the relevant living note(s). Returns ``{created, updated, raw_id, ...}``."""
    return br.ingest(body.source, body.title)


@router.post("/reconcile")
async def reconcile_endpoint(body: ReconcileBody, _token: str = Depends(require_bearer)):
    """Diff a note's current claims vs the latest ingested info and write a
    transparent bi-temporal resolution. Returns ``{contradictions, resolution,
    updated}``."""
    return br.reconcile(body.title, body.latest)


@router.post("/synthesize")
async def synthesize_endpoint(body: SynthesizeBody, _token: str = Depends(require_bearer)):
    """Retrieve across notes, extract cross-note patterns, and upsert a
    ``kind=synthesis`` note citing the sources. Honest when there are too few
    notes."""
    return br.synthesize(body.topic, min_notes=body.min_notes)
