"""SECURITY — enforced ACL / data classification (Gotham governance).

The ontology marks objects with a ``mark`` (PUBLIC/INTERNAL/FINANCIAL/PII/
RESTRICTED). Until now those marks were cosmetic. This module turns them into an
enforced clearance model:

  * a ``role`` maps to the set of classifications it may *see* (``CLEARANCE``).
  * ``can_view(mark, role)`` — boolean access decision for a single mark.
  * ``redact(obj, role)`` — return a copy of an ontology object with props above
    the role's clearance dropped, and PII props masked for low roles.
  * ``filter_objects(objects, role)`` — visible + redacted list for a role.
  * ``role_for_token(token)`` — resolve a bearer token to a role via the env var
    ``JARVIS_ROLES`` (``token:role,token:role``); the dev API key defaults to
    ``admin`` and an absent/unknown token defaults to ``public``.

Doctrine (matching the rest of the backend): stdlib only, never raise — every
function degrades to the *least-privileged* safe answer on bad input.
"""

from __future__ import annotations

import os
from typing import Any, Iterable, Optional

# ── classification lattice ───────────────────────────────────────────────────────
# Ordered low → high. A role's clearance is an explicit allow-list of marks.
PUBLIC = "PUBLIC"
INTERNAL = "INTERNAL"
FINANCIAL = "FINANCIAL"
PII = "PII"
RESTRICTED = "RESTRICTED"

ALL_MARKS = [PUBLIC, INTERNAL, FINANCIAL, PII, RESTRICTED]

# Roles → the set of classifications they may see.
CLEARANCE: dict[str, list[str]] = {
    "public": [PUBLIC],
    "analyst": [PUBLIC, INTERNAL, FINANCIAL],
    "admin": list(ALL_MARKS),  # everything incl. PII + RESTRICTED
}

DEFAULT_ROLE = "public"

# Marks that are *sensitive personal data*: even when a role is cleared to see
# the object at all, low (non-admin) roles get these props masked rather than
# dropped, so the shape of the record stays visible but the value does not leak.
_PII_MARK = PII

# Per-mark whether a role that CAN view the object should still have its PII
# props masked. Only ``admin`` sees raw PII property values.
_PII_CLEAR_ROLES = frozenset({"admin"})

# Property-name heuristics that count as personally-identifying within an object,
# masked for non-PII-cleared roles regardless of the object's mark.
_PII_PROP_KEYS = frozenset(
    {"email", "phone", "dob", "address", "home", "mobile", "ssn", "tfn", "passport"}
)

_MASK = "[REDACTED]"


def _norm_mark(mark: Any) -> str:
    """Normalise a mark to a known classification; unknown/empty → RESTRICTED
    (fail-closed: an unclassified object is treated as the most sensitive)."""
    if not isinstance(mark, str):
        return RESTRICTED
    m = mark.strip().upper()
    return m if m in ALL_MARKS else RESTRICTED


def _norm_role(role: Any) -> str:
    """Normalise a role; unknown/empty → the least-privileged DEFAULT_ROLE."""
    if not isinstance(role, str):
        return DEFAULT_ROLE
    r = role.strip().lower()
    return r if r in CLEARANCE else DEFAULT_ROLE


def can_view(mark: Any, role: Any) -> bool:
    """True iff ``role``'s clearance includes the object's classification ``mark``.

    Fail-closed: an unknown mark resolves to RESTRICTED and an unknown role to
    ``public``, so the only way to see sensitive data is to be explicitly cleared.
    """
    m = _norm_mark(mark)
    r = _norm_role(role)
    return m in CLEARANCE.get(r, [])


def _is_pii_prop(key: Any) -> bool:
    return isinstance(key, str) and key.strip().lower() in _PII_PROP_KEYS


def redact(obj: Any, role: Any) -> dict:
    """Return a redacted copy of an ontology object for ``role``.

    Rules:
      * If the role cannot view the object's mark at all, return a minimal stub
        (id/label/type kept, mark replaced with ``CLASSIFIED``, props dropped)
        so the object's *existence* can be acknowledged without leaking content.
        (Use :func:`filter_objects` if you want such objects hidden entirely.)
      * If the role can view the object, copy it but:
          - mask PII props (by key heuristic) for non-PII-cleared roles;
          - if the whole object is marked PII and the role is not PII-cleared,
            mask every prop value.
    Never mutates the input; never raises.
    """
    r = _norm_role(role)
    if not isinstance(obj, dict):
        return {}
    mark = _norm_mark(obj.get("mark"))

    if not can_view(mark, r):
        return {
            "id": obj.get("id"),
            "label": obj.get("label"),
            "type": obj.get("type"),
            "mark": "CLASSIFIED",
            "redacted": True,
        }

    out: dict[str, Any] = {k: v for k, v in obj.items() if k != "props"}
    props = obj.get("props")
    pii_cleared = r in _PII_CLEAR_ROLES
    if isinstance(props, dict):
        mask_all = (mark == _PII_MARK) and not pii_cleared
        new_props: dict[str, Any] = {}
        for k, v in props.items():
            if mask_all or (not pii_cleared and _is_pii_prop(k)):
                new_props[k] = _MASK
            else:
                new_props[k] = v
        out["props"] = new_props
    elif props is not None:
        out["props"] = props
    return out


def filter_objects(objects: Any, role: Any) -> list[dict]:
    """Return the visible + redacted objects for ``role``.

    Objects whose mark is above the role's clearance are *hidden* (dropped),
    not stubbed. Objects the role can see are returned redacted (PII masking
    applied per :func:`redact`). Never raises; bad input → ``[]``.
    """
    r = _norm_role(role)
    result: list[dict] = []
    if not isinstance(objects, Iterable):
        return result
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        if can_view(obj.get("mark"), r):
            result.append(redact(obj, r))
    return result


# ── token → role resolution ──────────────────────────────────────────────────────
def _roles_map() -> dict[str, str]:
    """Parse ``JARVIS_ROLES`` (``token:role,token:role``) into a dict.

    Malformed entries are skipped. Returns an empty dict if the var is unset.
    """
    raw = os.environ.get("JARVIS_ROLES", "")
    mapping: dict[str, str] = {}
    for part in raw.split(","):
        part = part.strip()
        if not part or ":" not in part:
            continue
        token, role = part.split(":", 1)
        token = token.strip()
        role = role.strip().lower()
        if token and role in CLEARANCE:
            mapping[token] = role
    return mapping


def role_for_token(token: Optional[str]) -> str:
    """Resolve a bearer token to a role.

    Resolution order:
      1. explicit mapping in ``JARVIS_ROLES`` (token → role);
      2. the dev/configured API key (``JARVIS_API_KEY``, default ``dev-key``)
         → ``admin``;
      3. anything else (incl. ``None``/empty/unknown) → ``public``.
    Never raises.
    """
    if not token or not isinstance(token, str):
        return DEFAULT_ROLE
    token = token.strip()
    mapping = _roles_map()
    if token in mapping:
        return mapping[token]
    # The configured API key is the dev super-user.
    api_key = os.environ.get("JARVIS_API_KEY", "dev-key")
    if token == api_key:
        return "admin"
    return DEFAULT_ROLE
