"""REVDB routes — Git-like version-controlled knowledge API.

Mounted under ``/v1/revdb``. Provides manual commit, history query, diff,
revert, and branch management over the revision database.

Wire it in ``server/main.py`` with::

    from .routes import revdb as revdb_routes
    app.include_router(revdb_routes.router)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import revdb as revdb_svc

router = APIRouter(prefix="/v1/revdb", tags=["revdb"])


# ── request models ───────────────────────────────────────────────────────────────
class CommitBody(BaseModel):
    message: str = Field(..., description="Commit message.")
    changes: list[dict] = Field(default_factory=list, description="List of change dicts.")
    actor: Optional[str] = Field(default=None, description="Override actor.")


class RevertBody(BaseModel):
    commit_id: str = Field(..., description="Commit to revert to.")
    actor: Optional[str] = Field(default=None, description="Override actor.")


class BranchBody(BaseModel):
    name: str = Field(..., description="Branch name.")
    from_commit: str = Field(..., description="Commit id the branch points to.")


# ── routes ──────────────────────────────────────────────────────────────────────
@router.post("/commit")
async def post_commit(
    body: CommitBody,
    _token: Optional[str] = Depends(require_bearer),
):
    """Manually create a revdb commit."""
    actor = body.actor or (_token or "system")
    result = await revdb_svc.commit(actor=actor, message=body.message, changes=body.changes)
    if result is None:
        raise HTTPException(status_code=500, detail="commit failed")
    return result


@router.get("/history")
async def get_history(
    object_type: Optional[str] = Query(default=None),
    object_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=1000),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Query commit history with optional filters."""
    items = await revdb_svc.history(
        object_type=object_type, object_id=object_id, limit=limit
    )
    return {"items": items, "count": len(items)}


@router.get("/diff")
async def get_diff(
    commit_a: str = Query(..., description="First commit id."),
    commit_b: str = Query(..., description="Second commit id."),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Compare two commits."""
    return await revdb_svc.diff(commit_a, commit_b)


@router.post("/revert")
async def post_revert(
    body: RevertBody,
    _token: Optional[str] = Depends(require_bearer),
):
    """Revert ontology to a past commit."""
    actor = body.actor or (_token or "system")
    result = await revdb_svc.revert_to(body.commit_id, actor=actor)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "revert failed"))
    return result


@router.get("/branches")
async def get_branches(
    _token: Optional[str] = Depends(optional_bearer),
):
    """List all branches."""
    items = await revdb_svc.list_branches()
    return {"items": items, "count": len(items)}


@router.post("/branch")
async def post_branch(
    body: BranchBody,
    _token: Optional[str] = Depends(require_bearer),
):
    """Create or update a branch."""
    result = await revdb_svc.branch(body.name, body.from_commit)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "branch failed"))
    return result
