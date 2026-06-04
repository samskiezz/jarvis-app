"""TENANCY routes — multi-tenant registry + active-tenant introspection.

A ready-to-mount ``APIRouter`` (NOT mounted by default — wire it in
``server/main.py``) exposing the tenant registry and the resolved-tenant
``whoami`` for the caller:

  * ``GET  /v1/tenants``               — list all tenants.
  * ``POST /v1/tenants``               — create a tenant (bearer required).
  * ``GET  /v1/tenants/whoami``        — the active tenant + principal + role
                                          resolved for the caller.
  * ``GET  /v1/tenants/{id}``          — fetch one tenant.
  * ``POST /v1/tenants/{id}/members``  — add/update a member (bearer required).
  * ``GET  /v1/tenants/{id}/members``  — list a tenant's members.

Reuses ``server/auth.py``'s ``require_bearer`` for writes and the
``current_tenant`` / ``tenant_context`` dependencies from
``server/auth_tenancy.py`` for resolution. Best-effort audit entries are
recorded via the existing audit ledger.

Wire it in ``server/main.py`` with::

    from .routes import tenancy as tenancy_routes
    app.include_router(tenancy_routes.router)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_bearer
from ..auth_tenancy import current_context
from ..services import audit as audit_svc
from ..services import tenancy as tenancy_svc

router = APIRouter(prefix="/v1/tenants", tags=["tenancy"])


class CreateTenantBody(BaseModel):
    name: str
    plan: Optional[str] = None
    settings: Optional[dict] = None


class AddMemberBody(BaseModel):
    principal: str
    role: Optional[str] = None


def _audit(action: str, actor: Optional[str], resource: str, detail: dict) -> None:
    try:
        audit_svc.record(actor=actor or "anonymous", action=action, resource=resource, detail=detail)
    except Exception:  # noqa: BLE001 — auditing is best-effort
        pass


@router.get("")
async def list_tenants():
    """List all tenants."""
    items = tenancy_svc.list_tenants()
    return {"items": items, "count": len(items)}


@router.post("")
async def create_tenant(body: CreateTenantBody, token: str = Depends(require_bearer)):
    """Create a tenant (bearer required). The creator is added as ``owner``.
    Idempotent on the derived id."""
    t = tenancy_svc.create_tenant(body.name, body.plan, settings=body.settings)
    if not t:
        raise HTTPException(status_code=500, detail="could not create tenant")
    # The creating principal (the bearer token) becomes the owner.
    tenancy_svc.add_member(t["id"], token, "owner")
    _audit("tenancy.create", token, t["id"], {"name": body.name, "plan": t.get("plan")})
    return t


@router.get("/whoami")
async def whoami(ctx: dict = Depends(current_context)):
    """Return the active tenant resolved for the caller, plus the principal and
    their role in that tenant. ``X-Tenant-Id`` header / membership / default
    resolution is applied (see tenancy.resolve_tenant)."""
    tenant = tenancy_svc.get_tenant(ctx["tenant_id"])
    principal = ctx["principal"]
    return {
        "tenant_id": ctx["tenant_id"],
        "tenant": tenant,
        "principal": principal,
        "role": ctx["role"],
        "authenticated": principal is not None and principal != "anonymous",
    }


@router.get("/{tenant_id}")
async def get_tenant(tenant_id: str):
    """Fetch one tenant by id."""
    t = tenancy_svc.get_tenant(tenant_id)
    if not t:
        raise HTTPException(status_code=404, detail="tenant not found")
    return t


@router.post("/{tenant_id}/members")
async def add_member(tenant_id: str, body: AddMemberBody, token: str = Depends(require_bearer)):
    """Add (or update the role of) a member in a tenant (bearer required)."""
    m = tenancy_svc.add_member(tenant_id, body.principal, body.role or "member")
    if not m:
        raise HTTPException(status_code=404, detail="tenant not found or invalid principal")
    _audit("tenancy.add_member", token, tenant_id, {"principal": body.principal, "role": m.get("role")})
    return m


@router.get("/{tenant_id}/members")
async def list_members(tenant_id: str):
    """List the members of a tenant."""
    if not tenancy_svc.get_tenant(tenant_id):
        raise HTTPException(status_code=404, detail="tenant not found")
    items = tenancy_svc.members(tenant_id)
    return {"items": items, "count": len(items)}
