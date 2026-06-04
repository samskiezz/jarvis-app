"""SAVE / SHARE / ANNOTATE GRAPH INVESTIGATIONS routes (P5 #43).

A ready-to-mount ``APIRouter`` (prefix ``/v1/investigations``) exposing the saved
investigations store (:mod:`server.services.investigations`):

  * ``GET    /v1/investigations``                 — list saved cases (public).
  * ``POST   /v1/investigations``                 — create a case (bearer).
  * ``GET    /v1/investigations/{id}``            — case + seeds + annotations +
                                                    shares + resolved subgraph.
  * ``POST   /v1/investigations/{id}/annotations`` — annotate node/edge/case (bearer).
  * ``POST   /v1/investigations/{id}/share``      — share with a principal (bearer).
  * ``GET    /v1/investigations/{id}/shares``     — list shares (public).
  * ``DELETE /v1/investigations/{id}``            — delete a case (bearer).

Reads are public via ``optional_bearer``; writes require a valid bearer via
``require_bearer`` (matching the rest of the backend). Handlers never raise — the
service degrades gracefully — but return 404 for unknown ids.

Wire it in ``server/main.py`` with::

    from .routes import investigations as investigations_routes
    app.include_router(investigations_routes.router)
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import investigations as inv_svc

try:  # role resolution is best-effort
    from ..services import security as _security  # type: ignore
except Exception:  # noqa: BLE001
    _security = None

router = APIRouter(prefix="/v1/investigations")


def _role(authorization: Optional[str]) -> Optional[str]:
    if _security is None:
        return None
    try:
        if not authorization or not authorization.lower().startswith("bearer "):
            token = None
        else:
            token = authorization.split(" ", 1)[1].strip() or None
        return _security.role_for_token(token)
    except Exception:  # noqa: BLE001
        return None


# ── request models ───────────────────────────────────────────────────────────────
class InvestigationIn(BaseModel):
    name: str = Field(..., description="Case name.")
    owner: Optional[str] = Field(default=None, description="Owning principal.")
    seeds: Any = Field(default=None, description="Seed object ids (list or csv string).")
    notes: str = Field(default="", description="Free-text case notes.")


class AnnotationIn(BaseModel):
    target: str = Field(default="case", description="Pointer: case | node:<id> | edge:<a|b|rel>.")
    text: str = Field(..., description="Annotation text.")
    actor: Optional[str] = Field(default=None, description="Author label.")


class ShareIn(BaseModel):
    principal: str = Field(..., description="Principal to share with.")
    role: str = Field(default="viewer", description="Granted role (viewer|editor|owner|...).")


# ── endpoints ─────────────────────────────────────────────────────────────────────
@router.get("")
async def list_investigations(_token: Optional[str] = Depends(optional_bearer)):
    """List saved investigations, newest-first."""
    items = inv_svc.list_investigations()
    return {"items": items, "count": len(items)}


@router.post("")
async def create_investigation(body: InvestigationIn, _token: str = Depends(require_bearer)):
    """Create a saved investigation pinning the given seeds."""
    inv = inv_svc.create_investigation(
        body.name, owner=body.owner, seeds=body.seeds, notes=body.notes
    )
    if inv is None:
        raise HTTPException(status_code=400, detail="could not create investigation")
    return inv


@router.get("/{investigation_id}")
async def get_investigation(
    investigation_id: str,
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Return a case with seeds, annotations, shares, and the resolved subgraph."""
    inv = inv_svc.get_investigation(investigation_id, role=_role(authorization))
    if inv is None:
        raise HTTPException(status_code=404, detail="unknown investigation id")
    return inv


@router.post("/{investigation_id}/annotations")
async def add_annotation(
    investigation_id: str, body: AnnotationIn, _token: str = Depends(require_bearer)
):
    """Annotate a node / edge / the whole case."""
    ann = inv_svc.add_annotation(
        investigation_id, body.target, body.text, actor=body.actor or "operator"
    )
    if ann is None:
        raise HTTPException(status_code=404, detail="unknown investigation id")
    return ann


@router.post("/{investigation_id}/share")
async def share_investigation(
    investigation_id: str, body: ShareIn, _token: str = Depends(require_bearer)
):
    """Share an investigation with a principal at a role (idempotent)."""
    sh = inv_svc.share(investigation_id, body.principal, body.role)
    if sh is None:
        raise HTTPException(status_code=404, detail="unknown investigation id")
    return sh


@router.get("/{investigation_id}/shares")
async def list_shares(
    investigation_id: str, _token: Optional[str] = Depends(optional_bearer)
):
    """List the shares for an investigation."""
    items = inv_svc.shares(investigation_id)
    return {"investigation_id": investigation_id, "items": items, "count": len(items)}


@router.delete("/{investigation_id}")
async def delete_investigation(investigation_id: str, _token: str = Depends(require_bearer)):
    """Delete an investigation plus its annotations and shares."""
    ok = inv_svc.delete_investigation(investigation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="unknown investigation id")
    return {"id": investigation_id, "deleted": True}
