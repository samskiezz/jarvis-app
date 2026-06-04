"""REDACTION — enforced classification-mark redaction layer (Palantir pillar #74-76).

Turns the cosmetic ``mark`` on every ontology object into an *enforced* read-time
control: clearance-gated ACLs, redaction-by-clearance, and an audit trail of every
allowed / denied / redacted read.

This module is the rank-ordered companion to :mod:`server.services.security`.

  * ``security.py`` models access as a *role → allow-list of marks* lattice
    (public/analyst/admin). It is reused here for its mark constants, mark
    normalisation, PII property heuristics, the ``[REDACTED]`` token, and the
    bearer-token → role resolver (:func:`security.role_for_token`).
  * ``redaction.py`` adds the *linear clearance ranking* the spec asks for —
    a caller carries a single clearance *mark* and may read any object whose
    mark sits at or below their clearance in the ordering

        PUBLIC < INTERNAL < FINANCIAL < PII < RESTRICTED

    ``security.py`` does NOT define this ordering (its ``ALL_MARKS`` list is in
    the same order but is used as an allow-list, not a rank), so the ordering is
    defined here as ``MARK_LEVELS`` and noted as such.

Doctrine (matching the rest of the backend): **stdlib only, never raise** — every
function degrades to the *least-privileged* safe answer on bad input.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

from . import audit
from . import security

# ── classification ordering (rank lattice) ───────────────────────────────────────
# Ordered low → high. Defined HERE: security.py models marks as an allow-list, not
# a rank, so it has no comparable ordering to reuse. The mark *names* are reused
# from security.py to stay in lock-step with the rest of the backend.
MARK_LEVELS: list[str] = [
    security.PUBLIC,      # PUBLIC
    security.INTERNAL,    # INTERNAL
    security.FINANCIAL,   # FINANCIAL
    security.PII,         # PII
    security.RESTRICTED,  # RESTRICTED
]

# Default clearance for an unauthenticated / unknown caller: the lowest.
DEFAULT_CLEARANCE = security.PUBLIC

# The redaction sentinel — reuse security.py's so the UI sees one consistent token.
REDACTED = security._MASK  # "[REDACTED]"

# Roles (from security.py) → the clearance *mark level* they carry. A role's
# clearance rank is the highest mark its allow-list contains, so role-based and
# rank-based decisions never disagree.
_ROLE_TO_CLEARANCE: dict[str, str] = {
    "public": security.PUBLIC,
    "analyst": security.FINANCIAL,  # public+internal+financial → top is FINANCIAL
    "admin": security.RESTRICTED,   # everything
}

# Object-level marks that are not real classifications but appear in the seed
# (e.g. "RISK"). Unknown marks fail closed → RESTRICTED via security._norm_mark.


# ── ranking ──────────────────────────────────────────────────────────────────────
def mark_rank(mark: Any) -> int:
    """Rank of a *mark* in ``MARK_LEVELS`` (PUBLIC=0 … RESTRICTED=4).

    Unknown / empty marks fail closed to the highest rank (RESTRICTED) so an
    unclassified object is treated as the most sensitive. Never raises.
    """
    m = security._norm_mark(mark)  # unknown → RESTRICTED
    try:
        return MARK_LEVELS.index(m)
    except ValueError:
        return len(MARK_LEVELS) - 1


def clearance_rank(clearance: Any) -> int:
    """Rank of a caller's *clearance* in ``MARK_LEVELS``.

    A clearance is itself expressed as a mark level (PUBLIC … RESTRICTED). An
    unknown / empty clearance fails closed to the *lowest* rank (PUBLIC) so an
    unrecognised caller gets the least privilege. Never raises.
    """
    if not isinstance(clearance, str):
        return 0
    c = clearance.strip().upper()
    try:
        return MARK_LEVELS.index(c)
    except ValueError:
        return 0  # unknown clearance → least privilege (PUBLIC)


def can_read(clearance: Any, mark: Any) -> bool:
    """True iff ``clearance`` is high enough to read an object marked ``mark``.

    Decision: ``clearance_rank(clearance) >= mark_rank(mark)``. Fail-closed on
    both sides (unknown clearance → PUBLIC, unknown mark → RESTRICTED). Never raises.
    """
    return clearance_rank(clearance) >= mark_rank(mark)


# ── object redaction ─────────────────────────────────────────────────────────────
def _is_sensitive_prop(key: Any) -> bool:
    """A prop is sensitive (worth masking individually) if it matches security.py's
    PII key heuristics. Used when redacting an object the caller may still see."""
    return security._is_pii_prop(key)


def redact_object(obj: Any, clearance: Any) -> dict:
    """Return a redacted *copy* of an ontology object for ``clearance``.

    Behaviour (spec #74-76):
      * If ``can_read`` fails (the caller's clearance is below the object's mark):
        keep ``id / type / label / mark`` so the UI still shows the node *exists*,
        replace every prop value with ``"[REDACTED]"``, drop any nested ``links``,
        and set ``_redacted: true``.
      * If the caller is cleared for the object's mark: return it (a shallow copy)
        as-is, but still mask individual PII-keyed props (email/phone/ssn/…) unless
        the caller also clears the PII level — defence-in-depth so a FINANCIAL
        clearance can read a FINANCIAL object without leaking an embedded email.

    Never mutates the input; never raises; bad input → ``{}``.
    """
    if not isinstance(obj, dict):
        return {}

    mark = obj.get("mark")

    if not can_read(clearance, mark):
        # Stub: existence acknowledged, contents redacted.
        out: dict[str, Any] = {
            "id": obj.get("id"),
            "type": obj.get("type"),
            "label": obj.get("label"),
            "mark": obj.get("mark"),
            "_redacted": True,
        }
        props = obj.get("props")
        if isinstance(props, dict):
            out["props"] = {k: REDACTED for k in props}
        elif props is not None:
            out["props"] = {}
        return out

    # Cleared for the object as a whole — copy it through, masking embedded PII
    # props unless the caller also clears the PII rank.
    out = {k: v for k, v in obj.items() if k != "props"}
    out.setdefault("_redacted", False)
    pii_cleared = clearance_rank(clearance) >= mark_rank(security.PII)
    props = obj.get("props")
    if isinstance(props, dict):
        if pii_cleared:
            out["props"] = dict(props)
        else:
            new_props: dict[str, Any] = {}
            masked = False
            for k, v in props.items():
                if _is_sensitive_prop(k):
                    new_props[k] = REDACTED
                    masked = True
                else:
                    new_props[k] = v
            out["props"] = new_props
            if masked:
                out["_redacted"] = True
    elif props is not None:
        out["props"] = props
    return out


def redact_objects(objs: Any, clearance: Any) -> list[dict]:
    """Map :func:`redact_object` over an iterable of objects. Never raises;
    non-dict entries are skipped; bad input → ``[]``."""
    result: list[dict] = []
    if not isinstance(objs, Iterable) or isinstance(objs, (str, bytes, dict)):
        return result
    for obj in objs:
        if isinstance(obj, dict):
            result.append(redact_object(obj, clearance))
    return result


def filter_denied(objs: Any, clearance: Any, drop: bool = False) -> list[dict]:
    """Apply redaction to a list of objects.

    * ``drop=False`` (default): redact-in-place — every object is returned, with
      contents redacted where the caller lacks clearance (see :func:`redact_object`).
    * ``drop=True``: objects the caller cannot read at all are *removed* entirely
      rather than stubbed (e.g. hide RESTRICTED rows above the caller's clearance).
      Readable objects are still returned through :func:`redact_object`.

    Never raises; bad input → ``[]``.
    """
    result: list[dict] = []
    if not isinstance(objs, Iterable) or isinstance(objs, (str, bytes, dict)):
        return result
    for obj in objs:
        if not isinstance(obj, dict):
            continue
        if drop and not can_read(clearance, obj.get("mark")):
            continue
        result.append(redact_object(obj, clearance))
    return result


# ── audit ─────────────────────────────────────────────────────────────────────────
def audit_read(actor: Any, clearance: Any, object_id: Any, allowed: bool) -> None:
    """Append a best-effort audit row for a classification-gated read.

    Records ``ontology.read.allowed`` or ``ontology.read.denied`` against the
    object, with the caller's clearance in the detail. Fire-and-forget — any
    failure (incl. a missing audit DB) is swallowed; never raises.
    """
    try:
        action = "ontology.read.allowed" if allowed else "ontology.read.denied"
        clr = clearance if isinstance(clearance, str) else DEFAULT_CLEARANCE
        audit.record(
            actor if actor is not None else "anonymous",
            action,
            str(object_id) if object_id is not None else "",
            {"clearance": clr, "allowed": bool(allowed)},
        )
    except Exception:  # noqa: BLE001 - audit must never break a read
        pass


# ── caller-clearance derivation (helper for the routes) ───────────────────────────
def clearance_for(
    token: Optional[str],
    header_clearance: Optional[str] = None,
) -> str:
    """Resolve a caller's clearance *mark level* for a read.

    Resolution order (fail-closed):
      1. If a bearer ``token`` resolves to a known role via
         :func:`security.role_for_token`, use that role's clearance level. This is
         the preferred, token-derived source.
      2. Else if an ``X-Clearance`` header value is supplied and names a known mark
         level, honour it (dev/transitional convenience until tokens carry
         clearance natively).
      3. Else default to the lowest clearance, ``PUBLIC``.

    Never raises.
    """
    # 1. token-derived role → clearance (preferred when present).
    if token:
        role = security.role_for_token(token)
        if role and role != security.DEFAULT_ROLE:
            mapped = _ROLE_TO_CLEARANCE.get(role)
            if mapped:
                return mapped

    # 2. explicit X-Clearance header (dev/transitional).
    if isinstance(header_clearance, str):
        c = header_clearance.strip().upper()
        if c in MARK_LEVELS:
            return c

    # 3. default → least privilege.
    return DEFAULT_CLEARANCE
