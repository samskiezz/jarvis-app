"""MULTI-TENANCY auth dependency — resolve the active tenant for a request.

A FastAPI dependency layered on top of ``server/auth.py``: it REUSES the
existing bearer-token identity (it does not replace or weaken it) and adds the
orthogonal "which tenant are we operating in" axis on top, via
``server/services/tenancy.py``.

Wire it into any route with::

    from ..auth_tenancy import current_tenant

    @router.get("/whatever")
    async def handler(tenant_id: str = Depends(current_tenant)):
        ...

``current_tenant`` resolves the active tenant id (string) and never raises:
public reads (no bearer, when JARVIS_REQUIRE_AUTH is unset) still get a tenant —
the ``default`` one. When a real IdP/JWT is wired in, the *principal* and an
optional *tenant claim* are the only inputs that change; see
``tenancy.resolve_tenant``'s plug-in seam. Use ``current_principal`` /
``current_context`` when a route also needs the caller identity or role.
"""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, Request

from .auth import optional_bearer
from .services import tenancy


def current_principal(token: Optional[str] = Depends(optional_bearer)) -> str:
    """The caller's principal for tenancy purposes.

    Today this is just the validated bearer token (``auth.optional_bearer``
    enforces the key when present / when JARVIS_REQUIRE_AUTH is set), or
    ``"anonymous"`` for an unauthenticated public read. A real IdP would replace
    this with the verified JWT ``sub`` — the only seam that changes.
    """
    return token or "anonymous"


def current_tenant(
    request: Request,
    principal: str = Depends(current_principal),
    x_tenant_id: Optional[str] = Header(default=None),
) -> str:
    """Resolve and return the active tenant id for this request. Never raises.

    Precedence is delegated to :func:`tenancy.resolve_tenant`: ``X-Tenant-Id``
    header → IdP tenant claim → principal's membership → ``default``. The
    ``x_tenant_id`` param makes the header explicit in the OpenAPI schema;
    ``request.headers`` is passed through so resolution sees the raw header too.
    """
    return tenancy.resolve_tenant(request.headers, principal=principal)


def current_context(
    request: Request,
    principal: str = Depends(current_principal),
    x_tenant_id: Optional[str] = Header(default=None),
) -> dict:
    """Full resolved tenancy context for a request: ``{tenant_id, principal,
    role}``. ``role`` is the principal's role in the resolved tenant, or ``None``
    if they are not an explicit member (e.g. anonymous on the default tenant).
    Never raises."""
    tid = tenancy.resolve_tenant(request.headers, principal=principal)
    role = tenancy.member_role(tid, principal)
    return {"tenant_id": tid, "principal": principal, "role": role}
