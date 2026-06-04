"""GOVERNANCE routes — purpose-based access policies + retention / subject-rights
workflows (Palantir pillar P11 #77 + #78).

The HTTP surface over ``server/services/governance.py``, mounted under
``/v1/governance``. Composes the existing security/audit planes — it does not
duplicate them.

Reads (list purposes / requests, retention listing, the read-only subject
``access``/``export`` requests) use ``optional_bearer`` (public unless
JARVIS_REQUIRE_AUTH=true); all mutations (register purpose, set retention, log
use, erase requests + approval) use ``require_bearer``.

Endpoints (relative to ``/v1/governance``):
  * ``GET  /purposes``              — list purposes.
  * ``POST /purposes``              — register/update a purpose (bearer).
  * ``GET  /check``                 — check_access(purpose, mark) -> {allowed}.
  * ``POST /use``                   — log a data-use (bearer).
  * ``GET  /retention``             — list retention policies.
  * ``POST /retention``             — set a retention TTL (bearer).
  * ``GET  /due-for-deletion``      — objects past their retention TTL.
  * ``GET  /requests``              — list subject-rights requests.
  * ``POST /subject-request``       — create access/export/erase request (bearer).
  * ``POST /requests/{id}/erase``   — approve+execute a PENDING erase (bearer).
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import governance as gov

router = APIRouter(prefix="/v1/governance", tags=["governance"])


# ── request models ───────────────────────────────────────────────────────────────
class PurposeBody(BaseModel):
    name: str = Field(..., description="Unique purpose name (registry key).")
    description: str = Field(default="", description="Human description of the purpose.")
    allowed_marks: list[str] = Field(
        default_factory=list,
        description="Classification marks this purpose may touch "
                    "(PUBLIC/INTERNAL/FINANCIAL/PII/RESTRICTED).",
    )


class UseBody(BaseModel):
    purpose: str = Field(..., description="Declared purpose for this use.")
    object_id: str = Field(..., description="Ontology object the data belongs to.")
    actor: Optional[str] = Field(default=None, description="Who performed the use.")


class RetentionBody(BaseModel):
    type_id: str = Field(..., description="Ontology object type the policy applies to.")
    ttl_days: int = Field(..., ge=0, description="Retention TTL in days (0 = keep forever).")


class SubjectRequestBody(BaseModel):
    kind: str = Field(..., description="One of access|export|erase.")
    subject_id: str = Field(..., description="The data subject's object/identifier.")
    actor: Optional[str] = Field(default=None, description="Who raised the request.")


class EraseApproveBody(BaseModel):
    approver: str = Field(..., description="Accountable approver carrying out the erasure.")


# ── purposes (#77) ────────────────────────────────────────────────────────────────
@router.get("/purposes")
async def get_purposes(_token: str | None = Depends(optional_bearer)):
    """List all registered purposes."""
    items = gov.list_purposes()
    return {"items": items, "count": len(items)}


@router.post("/purposes")
async def post_purpose(body: PurposeBody, _token: str = Depends(require_bearer)):
    """Register (or update) a purpose and the marks it may touch."""
    res = gov.register_purpose(body.name, body.description, body.allowed_marks)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "register failed"))
    return res


@router.get("/check")
async def get_check(purpose: str, mark: str,
                    _token: str | None = Depends(optional_bearer)):
    """Decide whether ``purpose`` may touch ``mark`` (audited, fail-closed)."""
    allowed = gov.check_access(purpose, mark)
    return {"purpose": purpose, "mark": mark, "allowed": bool(allowed)}


@router.post("/use")
async def post_use(body: UseBody, _token: str = Depends(require_bearer)):
    """Record a data-use under a declared purpose (persisted + audited)."""
    uid = gov.log_use(body.purpose, body.object_id, body.actor)
    if uid is None:
        raise HTTPException(status_code=400, detail="log_use failed")
    return {"ok": True, "id": uid}


# ── retention / deletion (#78) ──────────────────────────────────────────────────────
@router.get("/retention")
async def get_retention(_token: str | None = Depends(optional_bearer)):
    """List retention policies (TTL days per object type)."""
    items = gov.list_retention()
    return {"items": items, "count": len(items)}


@router.post("/retention")
async def post_retention(body: RetentionBody, _token: str = Depends(require_bearer)):
    """Set the retention TTL (days) for an object type."""
    res = gov.set_retention(body.type_id, body.ttl_days)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "set failed"))
    return res


@router.get("/due-for-deletion")
async def get_due(now: Optional[int] = None,
                  _token: str | None = Depends(optional_bearer)):
    """Return ontology objects past their type's retention TTL."""
    items = gov.due_for_deletion(now=now)
    return {"items": items, "count": len(items)}


# ── subject-rights (#78) ──────────────────────────────────────────────────────────
@router.get("/requests")
async def get_requests(status: Optional[str] = None,
                       _token: str | None = Depends(optional_bearer)):
    """List subject-rights requests, optionally filtered by status."""
    items = gov.list_requests(status=status)
    return {"items": items, "count": len(items)}


@router.post("/subject-request")
async def post_subject_request(body: SubjectRequestBody,
                               _token: str = Depends(require_bearer)):
    """Create a subject-rights request. access/export resolve immediately;
    erase lands as PENDING (governed — approve via /requests/{id}/erase)."""
    res = gov.subject_request(body.kind, body.subject_id, actor=body.actor)
    if res.get("ok") is False:
        raise HTTPException(status_code=400, detail=res.get("error", "request failed"))
    return res


@router.post("/requests/{request_id}/erase")
async def post_execute_erase(request_id: str, body: EraseApproveBody,
                             _token: str = Depends(require_bearer)):
    """Approve + execute a PENDING erase request (governed deletion)."""
    res = gov.execute_erasure(request_id, body.approver)
    if not res.get("ok"):
        detail = res.get("error", "erasure failed")
        code = 404 if detail == "unknown request" else 400
        raise HTTPException(status_code=code, detail=detail)
    return res
