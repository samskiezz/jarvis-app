"""SECURITY routes — clearance introspection + the audit ledger (Gotham governance).

A ready-to-mount ``APIRouter`` exposing:

  * ``GET /v1/security/whoami``  — the role resolved for the caller's bearer.
  * ``GET /v1/audit``            — tail the hash-chained audit log (admin only).
  * ``GET /v1/audit/verify``     — verify the chain's tamper-evident integrity.

Plus :func:`audited`, a small helper other routes can call to append an audit
entry for the current actor (resolved from the bearer token).

Wire it in ``server/main.py`` with::

    from .routes import security as security_routes
    app.include_router(security_routes.router)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from ..auth import optional_bearer
from ..services import audit as audit_svc
from ..services import security as security_svc

router = APIRouter()


def _token_from_header(authorization: Optional[str]) -> Optional[str]:
    """Extract the bearer token (if any) from an Authorization header. Never raises."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip() or None


def audited(action: str):
    """Build a reusable helper that records an audit entry for the current actor.

    Usage in another route::

        log = audited("entities.read")
        ...
        log(resource="sam", detail={"role": role})

    Returns a callable ``log(resource="", detail=None, *, token=None)`` that
    resolves the actor's role from the bearer and appends a chained audit row.
    Never raises — auditing must never break the request it observes.
    """

    def _log(resource: str = "", detail: Optional[dict] = None, *, token: Optional[str] = None):
        try:
            role = security_svc.role_for_token(token)
            actor = token or "anonymous"
            return audit_svc.record(
                actor=f"{actor}:{role}",
                action=action,
                resource=resource,
                detail=detail or {},
            )
        except Exception:  # noqa: BLE001 — auditing is best-effort
            return None

    return _log


@router.get("/v1/security/whoami")
async def whoami(authorization: Optional[str] = Header(default=None)):
    """Resolve and return the role + clearance for the caller's bearer token."""
    token = _token_from_header(authorization)
    role = security_svc.role_for_token(token)
    clearance = security_svc.CLEARANCE.get(role, [])
    audited("security.whoami")(resource="self", detail={"role": role}, token=token)
    return {"role": role, "clearance": clearance, "authenticated": token is not None}


@router.get("/v1/audit")
async def get_audit(
    n: int = Query(default=50, ge=1, le=1000),
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Tail the audit log — admin clearance required."""
    token = _token_from_header(authorization)
    role = security_svc.role_for_token(token)
    if role != "admin":
        raise HTTPException(status_code=403, detail="admin clearance required")
    entries = audit_svc.tail(n)
    audited("audit.read")(resource="audit_log", detail={"n": n}, token=token)
    return {"items": entries, "count": len(entries)}


@router.get("/v1/audit/verify")
async def verify_audit(
    authorization: Optional[str] = Header(default=None),
    _token: Optional[str] = Depends(optional_bearer),
):
    """Verify the audit chain's integrity (tamper-evidence check)."""
    token = _token_from_header(authorization)
    result = audit_svc.verify_chain()
    return result
