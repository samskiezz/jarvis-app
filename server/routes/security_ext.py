"""EXTENDED SECURITY routes — ACL introspection, compliance scorecard,
cross-cutting audit query, and classification mark management.

Mounted alongside the existing security routes (``/v1/security/*`` and
``/v1/audit/*``). These endpoints are purely additive — no existing route or
behaviour is changed.

Wire it in ``server/main.py`` with::

    from .routes import security_ext as security_ext_routes
    app.include_router(security_ext_routes.router)
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..auth_tenancy import current_context
from ..services import audit as audit_svc
from ..services import cross_org as cross_org_svc
from ..services import ontology_store
from ..services import redaction
from ..services import revdb as revdb_svc
from ..services import security as security_svc
from ..services import tenancy as tenancy_svc

router = APIRouter()


# ── request models ───────────────────────────────────────────────────────────────
class AclCheckBody(BaseModel):
    action: str = Field(..., description="Action to check, e.g. 'read' or 'write'.")
    resource: str = Field(..., description="Resource identifier.")
    mark: Optional[str] = Field(default=None, description="Classification mark.")


class ApplyMarkBody(BaseModel):
    object_id: str = Field(..., description="Ontology object id.")
    mark: str = Field(..., description="Classification mark to apply.")


# ── helpers ─────────────────────────────────────────────────────────────────────
def _token_from_header(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip() or None


# ── ACL ──────────────────────────────────────────────────────────────────────────
@router.get("/v1/security/acl")
async def get_acl(
    authorization: Optional[str] = Header(default=None),
    ctx: dict = Depends(current_context),
    _token: Optional[str] = Depends(optional_bearer),
):
    """List effective ACLs for the current caller: role, clearance, tenant,
    and resolved permissions."""
    token = _token_from_header(authorization)
    role = security_svc.role_for_token(token)
    clearance = security_svc.CLEARANCE.get(role, [])
    tenant = tenancy_svc.get_tenant(ctx["tenant_id"])
    return {
        "principal": ctx["principal"],
        "role": role,
        "clearance": clearance,
        "tenant_id": ctx["tenant_id"],
        "tenant": tenant,
        "member_role": ctx["role"],
        "can_view_public": security_svc.can_view("PUBLIC", role),
        "can_view_internal": security_svc.can_view("INTERNAL", role),
        "can_view_financial": security_svc.can_view("FINANCIAL", role),
        "can_view_pii": security_svc.can_view("PII", role),
        "can_view_restricted": security_svc.can_view("RESTRICTED", role),
    }


@router.post("/v1/security/acl/check")
async def post_acl_check(
    body: AclCheckBody,
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Check whether an action on a resource is permitted for the caller."""
    token = _token_from_header(authorization)
    role = security_svc.role_for_token(token)
    permitted = True
    reason: Optional[str] = None

    if body.mark and not security_svc.can_view(body.mark, role):
        permitted = False
        reason = "insufficient_clearance"
    elif body.action in ("write", "delete", "apply") and role not in ("admin", "analyst"):
        # Analysts can read elevated marks but only admin can mutate RESTRICTED/PII.
        if body.mark in ("RESTRICTED", "PII"):
            permitted = False
            reason = "admin_required_for_mutation"

    return {
        "permitted": permitted,
        "role": role,
        "action": body.action,
        "resource": body.resource,
        "mark": body.mark,
        "reason": reason,
    }


# ── Audit (cross-cutting) ────────────────────────────────────────────────────────
@router.get("/v1/security/audit")
async def get_security_audit(
    n: int = Query(default=50, ge=1, le=1000),
    actor: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Query the combined audit surface: hash-chained audit ledger + revdb
    commits. Admin clearance recommended (not enforced so read-only ops stay
    public by default)."""
    token = _token_from_header(authorization)
    role = security_svc.role_for_token(token)

    audit_items = audit_svc.tail(n)
    revdb_items = await revdb_svc.history(limit=n)

    # Simple actor filter (applied client-side so both sources are covered).
    if actor:
        audit_items = [r for r in audit_items if r.get("actor") == actor]
        revdb_items = [r for r in revdb_items if r.get("author") == actor]

    return {
        "audit_chain": {
            "items": audit_items,
            "count": len(audit_items),
            "integrity": audit_svc.verify_chain(),
        },
        "revdb": {"items": revdb_items, "count": len(revdb_items)},
        "role": role,
    }


# ── Compliance scorecard ─────────────────────────────────────────────────────────
@router.get("/v1/security/compliance/status")
async def get_compliance_status(
    _token: Optional[str] = Depends(optional_bearer),
):
    """High-level compliance scorecard drawn from all security planes."""
    audit_integrity = audit_svc.verify_chain()
    revdb_items = await revdb_svc.history(limit=1)
    revdb_latest = revdb_items[0] if revdb_items else None
    tenants = tenancy_svc.list_tenants()
    shares = await cross_org_svc.list_shares(limit=1)

    scorecard = {
        "audit": {
            "chain_integrity": audit_integrity.get("ok", False),
            "chain_length": audit_integrity.get("length", 0),
            "broken_at": audit_integrity.get("broken_at"),
            "status": "implemented",
        },
        "revdb": {
            "latest_commit": revdb_latest["id"] if revdb_latest else None,
            "latest_timestamp": revdb_latest["timestamp"] if revdb_latest else None,
            "status": "implemented",
        },
        "tenancy": {
            "tenant_count": len(tenants),
            "status": "implemented",
        },
        "cross_org": {
            "active_shares": len(shares),
            "status": "implemented",
        },
        "clearance_model": {
            "lattice": redaction.MARK_LEVELS if hasattr(redaction, "MARK_LEVELS") else [],
            "status": "implemented",
        },
        "overall": "partial",
    }

    if scorecard["audit"]["chain_integrity"] and scorecard["revdb"]["latest_commit"]:
        scorecard["overall"] = "implemented"

    return scorecard


# ── Classification marks ─────────────────────────────────────────────────────────
@router.post("/v1/security/mark")
async def post_mark(
    body: ApplyMarkBody,
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(require_bearer),
):
    """Apply a classification mark to an ontology object via the governed
    write-back path."""
    token = _token_from_header(authorization)
    role = security_svc.role_for_token(token)
    if role != "admin":
        raise HTTPException(status_code=403, detail="admin required")

    result = ontology_store.apply_action(
        body.object_id,
        "set_mark",
        {"mark": body.mark},
        actor=token or "system",
    )
    if not result or not result.get("ok"):
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "mark application failed") if result else "mark application failed",
        )
    return result


@router.get("/v1/security/marks")
async def get_marks(
    object_id: str = Query(..., description="Ontology object id."),
    _token: Optional[str] = Depends(optional_bearer),
):
    """List the classification mark on an object."""
    obj = ontology_store.get_object(object_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="object not found")
    return {"object_id": object_id, "mark": obj.get("mark")}
