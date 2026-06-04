"""COLLABORATION routes — notes / comments / activity feed + pipeline SCHEDULES.

A ready-to-mount ``APIRouter`` exposing the collaboration layer
(``server/services/collab.py``) and the lightweight pipeline scheduler registry
(``server/services/scheduler_svc.py``). Reads use ``optional_bearer`` (public
unless JARVIS_REQUIRE_AUTH=true, matching the rest of the read API); writes
require a valid bearer via ``require_bearer``.

Wire it in ``server/main.py`` with::

    from .routes import collab as collab_routes
    app.include_router(collab_routes.router)

Endpoints:
  Notes / activity
    * ``GET    /v1/notes``        ?resource_type=&resource_id=  — thread (public).
    * ``POST   /v1/notes``        — add a note (bearer).
    * ``PATCH  /v1/notes/{id}``   — edit a note body (bearer).
    * ``DELETE /v1/notes/{id}``   — soft-delete a note (bearer).
    * ``GET    /v1/activity``     ?limit=  — unified activity feed (public).
  Scheduler
    * ``GET    /v1/schedules``            — list schedule defs (public).
    * ``POST   /v1/schedules``            — create/update a schedule (bearer).
    * ``POST   /v1/schedules/{id}/toggle`` — flip enabled (bearer).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import collab as collab_svc
from ..services import scheduler_svc

router = APIRouter()


# ── request models ───────────────────────────────────────────────────────────────
class NoteIn(BaseModel):
    resource_type: str = Field(..., description="Resource kind: object|case|graph|dataset|...")
    resource_id: str = Field(..., description="Resource id within that kind.")
    body: str = Field(..., description="Note/comment text (supports @mentions).")
    author: Optional[str] = Field(default=None, description="Author label.")


class NoteEdit(BaseModel):
    body: str = Field(..., description="New note body (re-parses @mentions).")


class ScheduleIn(BaseModel):
    job_name: str = Field(..., description="Unique schedule name (upsert key).")
    fn_key: str = Field(..., description="Registered job key (see GET /v1/schedules).")
    interval_s: int = Field(default=900, description="Run interval in seconds.")
    enabled: bool = Field(default=True, description="Whether the schedule is active.")


# ── notes ─────────────────────────────────────────────────────────────────────────
@router.get("/v1/notes")
async def get_notes(
    resource_type: str = Query(...),
    resource_id: str = Query(...),
    _token: str | None = Depends(optional_bearer),
):
    """List the note thread for a resource (oldest-first)."""
    items = collab_svc.list_notes(resource_type, resource_id)
    return {"items": items, "count": len(items)}


@router.post("/v1/notes")
async def post_note(body: NoteIn, _token: str = Depends(require_bearer)):
    """Add a note/comment to a resource. Parses @mentions from the body."""
    note = collab_svc.add_note(
        body.resource_type,
        body.resource_id,
        body.author or "operator",
        body.body,
    )
    if note is None:
        raise HTTPException(status_code=400, detail="could not add note")
    return note


@router.patch("/v1/notes/{note_id}")
async def patch_note(note_id: int, body: NoteEdit, _token: str = Depends(require_bearer)):
    """Edit a note's body (re-parsing @mentions)."""
    note = collab_svc.edit_note(note_id, body.body)
    if note is None:
        raise HTTPException(status_code=404, detail="unknown or deleted note id")
    return note


@router.delete("/v1/notes/{note_id}")
async def delete_note(note_id: int, _token: str = Depends(require_bearer)):
    """Soft-delete a note."""
    ok = collab_svc.delete_note(note_id)
    if not ok:
        raise HTTPException(status_code=404, detail="unknown or already-deleted note id")
    return {"id": note_id, "deleted": True}


@router.get("/v1/activity")
async def get_activity(
    limit: int = Query(default=50, ge=1, le=500),
    _token: str | None = Depends(optional_bearer),
):
    """Unified activity feed: notes + (best-effort) audit-log entries, newest-first."""
    items = collab_svc.activity(limit)
    return {"items": items, "count": len(items)}


# ── scheduler ─────────────────────────────────────────────────────────────────────
@router.get("/v1/schedules")
async def get_schedules(_token: str | None = Depends(optional_bearer)):
    """List schedule defs plus the registered job keys they may bind to."""
    items = scheduler_svc.list_schedules()
    return {
        "items": items,
        "count": len(items),
        "job_keys": scheduler_svc.job_keys(),
        "enabled": scheduler_svc.scheduler_enabled(),
    }


@router.post("/v1/schedules")
async def post_schedule(body: ScheduleIn, _token: str = Depends(require_bearer)):
    """Register (or update) a schedule def. Idempotent on job_name."""
    sched = scheduler_svc.schedule(
        body.job_name,
        body.fn_key,
        interval_s=body.interval_s,
        enabled=body.enabled,
    )
    if sched is None:
        raise HTTPException(status_code=400, detail="could not create schedule")
    return sched


@router.post("/v1/schedules/{schedule_id}/toggle")
async def post_toggle(schedule_id: int, _token: str = Depends(require_bearer)):
    """Flip a schedule's enabled flag."""
    sched = scheduler_svc.toggle(schedule_id)
    if sched is None:
        raise HTTPException(status_code=404, detail="unknown schedule id")
    return sched
