"""SECOND BRAIN routes — the HTTP surface over ``server/services/second_brain.py``.

A living, AI-first knowledge vault: wikilinked notes + frontmatter, zero-friction
capture, daily notes, a session log/timeline, and an ``index.md``-style catalog,
all backed by a real SQLite store (plus ontology + embeddings mirroring).

Mounted under ``/v1/brain``. This router deliberately uses only the note/vault
path shapes below so it does NOT collide with sibling routers that also mount on
``/v1/brain`` and own ``/research``, ``/ingest``, ``/reconcile``, ``/synthesize``,
``/people``, ``/mention``, ``/health``, ``/heal-orphans``, and ``/think/*``:

  * ``GET    /notes``                    — list/search notes (q?, kind?, limit?).
  * ``POST   /notes``                    — upsert a note (bearer).
  * ``GET    /notes/{id_or_title}``      — fetch one note by id or title.
  * ``DELETE /notes/{id_or_title}``      — delete a note (bearer).
  * ``GET    /notes/{title}/backlinks``  — notes linking TO ``title``.
  * ``POST   /capture``                  — zero-friction capture (bearer).
  * ``GET    /daily``                    — get/create the daily note (date?).
  * ``POST   /daily``                    — append to the daily note (bearer).
  * ``POST   /log``                      — append a session log note (bearer).
  * ``GET    /catalog``                  — counts / recent / orphans.
  * ``GET    /timeline``                 — recent log + daily notes (limit?).

Reads use ``optional_bearer``; writes use ``require_bearer``. Routes never raise
out — the service degrades gracefully and we surface 404 only on a clean miss.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import second_brain as sb

router = APIRouter(prefix="/v1/brain", tags=["second-brain"])


# ── request bodies ─────────────────────────────────────────────────────────────────
class NoteBody(BaseModel):
    kind: str = Field(default="concept", description="entity|concept|project|daily|log|synthesis|decision|task")
    title: str = Field(..., description="Note title (unique within a kind).")
    body_md: str = Field(default="", description="Markdown body; [[wikilinks]] are parsed.")
    frontmatter: Optional[dict] = Field(default=None, description="Arbitrary JSON frontmatter.")
    confidence: Optional[float] = Field(default=None, description="0..1 confidence.")


class CaptureBody(BaseModel):
    text: str = Field(..., description="Free text to capture as a concept note.")


class DailyAppendBody(BaseModel):
    text: str = Field(..., description="Entry to append to the daily note.")
    date: Optional[str] = Field(default=None, description="YYYY-MM-DD (default today, UTC).")


class LogBody(BaseModel):
    summary: str = Field(..., description="Session summary (the log body).")
    links: Optional[list[str]] = Field(default=None, description="Titles to wikilink from the log.")


# ── notes ──────────────────────────────────────────────────────────────────────────
@router.get("/notes")
async def list_notes(
    q: Optional[str] = Query(default=None, description="Free-text match on title+body."),
    kind: Optional[str] = Query(default=None, description="Filter by note kind."),
    limit: Optional[int] = Query(default=None, ge=1, description="Cap the result count."),
    _token: str | None = Depends(optional_bearer),
):
    """List/search notes, newest-updated first."""
    items = sb.list_notes(kind=kind, q=q, limit=limit)
    return {"items": items, "count": len(items)}


@router.post("/notes")
async def upsert_note(body: NoteBody, _token: str = Depends(require_bearer)):
    """Create or update a note (idempotent on ``(kind, title)``). Parses wikilinks."""
    note = sb.upsert_note(
        body.kind,
        body.title,
        body.body_md,
        frontmatter=body.frontmatter,
        confidence=body.confidence,
    )
    if note is None:
        raise HTTPException(status_code=400, detail="upsert failed (empty title?)")
    return note


@router.get("/notes/{id_or_title}/backlinks")
async def note_backlinks(id_or_title: str, _token: str | None = Depends(optional_bearer)):
    """Notes that link TO ``id_or_title`` (inbound wikilinks). Resolves by title."""
    title = id_or_title
    note = sb.get_note(id_or_title)
    if note is not None:
        title = note["title"]
    items = sb.backlinks(title)
    return {"title": title, "items": items, "count": len(items)}


@router.get("/notes/{id_or_title}")
async def get_note(id_or_title: str, _token: str | None = Depends(optional_bearer)):
    """Fetch one note by id, or by title (case-insensitive)."""
    note = sb.get_note(id_or_title)
    if note is None:
        raise HTTPException(status_code=404, detail="note not found")
    return note


@router.delete("/notes/{id_or_title}")
async def delete_note(id_or_title: str, _token: str = Depends(require_bearer)):
    """Delete a note (by id or title) and its outgoing links."""
    ok = sb.delete_note(id_or_title)
    if not ok:
        raise HTTPException(status_code=404, detail="note not found")
    return {"ok": True, "deleted": id_or_title}


# ── capture / daily / log ────────────────────────────────────────────────────────────
@router.post("/capture")
async def capture(body: CaptureBody, _token: str = Depends(require_bearer)):
    """Zero-friction capture: store free text as a concept note with an auto title."""
    note = sb.capture(body.text)
    if note is None:
        raise HTTPException(status_code=400, detail="capture failed (empty text?)")
    return note


@router.get("/daily")
async def get_daily(
    date: Optional[str] = Query(default=None, description="YYYY-MM-DD (default today, UTC)."),
    _token: str | None = Depends(optional_bearer),
):
    """Get (or create) the daily note for ``date`` (default today, UTC)."""
    note = sb.daily(date)
    if note is None:
        raise HTTPException(status_code=400, detail="daily note unavailable")
    return note


@router.post("/daily")
async def append_daily(body: DailyAppendBody, _token: str = Depends(require_bearer)):
    """Append a timestamped entry to a daily note (creating it if needed)."""
    note = sb.daily_append(body.text, body.date)
    if note is None:
        raise HTTPException(status_code=400, detail="daily append failed")
    return note


@router.post("/log")
async def post_log(body: LogBody, _token: str = Depends(require_bearer)):
    """Append a session ``log`` note to the timeline, optionally wikilinking titles."""
    note = sb.log_session(body.summary, links=body.links)
    if note is None:
        raise HTTPException(status_code=400, detail="log failed (empty summary?)")
    return note


# ── catalog / timeline ─────────────────────────────────────────────────────────────────
@router.get("/catalog")
async def catalog(_token: str | None = Depends(optional_bearer)):
    """The ``index.md`` catalog: counts per kind, recent notes, and orphans."""
    return sb.index_catalog()


@router.get("/timeline")
async def get_timeline(
    limit: int = Query(default=50, ge=1, description="Max number of timeline notes."),
    _token: str | None = Depends(optional_bearer),
):
    """Recent log + daily notes (the ``log.md`` equivalent), newest first."""
    items = sb.timeline(limit=limit)
    return {"items": items, "count": len(items)}
