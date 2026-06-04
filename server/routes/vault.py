"""SECRETS VAULT routes — connector-secrets store (Palantir pillar P1 #11).

The HTTP surface over ``server/services/secrets_vault.py``, mounted under
``/v1/vault``.

  ⚠️  The API NEVER returns secret VALUES. ``list`` and any per-name lookup expose
  names + metadata ONLY. The clear value is server-side only (used by
  :func:`secrets_vault.resolve_for_connector` to inject into connector requests),
  so there is intentionally NO ``GET /v1/vault/{name}`` that returns a value.

  ⚠️  Values are obfuscated at rest with base64 — an ENCODING, not encryption.
  Production should use a real KMS (see the service module docstring).

Reads (list) use ``optional_bearer``; writes (put, delete) use ``require_bearer``.

Endpoints (relative to ``/v1/vault``):
  * ``GET    /``                       — list secret names + metadata (NO values).
  * ``POST   /``                       — store/update a secret (bearer).
  * ``DELETE /{name}``                 — delete a secret (bearer).
  * ``POST   /resolve/{connector_id}`` — resolve $secret refs into a connector
                                         config (bearer). NOTE: this returns the
                                         injected values for server-side callers;
                                         it requires a bearer and is the only
                                         value-bearing surface, used to drive a
                                         connector run.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import secrets_vault as vault

router = APIRouter(prefix="/v1/vault", tags=["vault"])


class SecretBody(BaseModel):
    name: str = Field(..., description="Unique secret name (registry key).")
    value: str = Field(..., description="The secret value (stored obfuscated; never echoed).")
    owner: str = Field(default="", description="Owner / responsible party.")


@router.get("")
@router.get("/")
async def get_secrets(_token: str | None = Depends(optional_bearer)):
    """List secret NAMES + METADATA only — NEVER the values."""
    items = vault.list_secrets()
    return {"items": items, "count": len(items),
            "note": "values are never returned over the API; "
                    "stored obfuscated (base64), not encrypted"}


@router.post("")
@router.post("/")
async def post_secret(body: SecretBody, _token: str = Depends(require_bearer)):
    """Store (or update) a secret. The response is metadata only — never the value."""
    res = vault.put_secret(body.name, body.value, body.owner)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "put failed"))
    return res


@router.delete("/{name}")
async def delete_one(name: str, _token: str = Depends(require_bearer)):
    """Delete a secret by name."""
    res = vault.delete_secret(name)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "delete failed"))
    return res


@router.post("/resolve/{connector_id}")
async def post_resolve(connector_id: str, _token: str = Depends(require_bearer)):
    """Resolve ``$secret:<name>`` references in a connector's config into real
    values for SERVER-SIDE use (driving a connector run). Bearer-gated."""
    res = vault.resolve_for_connector(connector_id)
    if not res.get("ok"):
        raise HTTPException(status_code=404, detail=res.get("error", "unknown connector"))
    return res
