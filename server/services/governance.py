"""GOVERNANCE — purpose-based access policies + retention / subject-rights workflows.

This is the *data-governance depth* that sits ALONGSIDE the existing enforced
classification plane (``server/services/security.py`` + ``redaction.py``) and the
tamper-evident ledger (``server/services/audit.py``). It does NOT replace them —
it composes them:

  * **Purpose-based access (Palantir pillar #77).** Classification marks
    (PUBLIC/INTERNAL/FINANCIAL/PII/RESTRICTED, reused verbatim from
    :mod:`security`) answer *who* may see a mark. A *purpose* answers *why* the
    data is being used. A request "declares a purpose" (e.g. ``"fraud-review"``)
    and access to a marked object is permitted only when that purpose is
    registered as allowed for the mark. Every :func:`check_access` decision and
    every :func:`log_use` is written to the hash-chained :mod:`audit` ledger.

  * **Retention / deletion / subject-rights (Palantir pillar #78).** A retention
    policy sets a TTL (days) per ontology *object type*; :func:`due_for_deletion`
    reads the live :mod:`ontology_store` and returns objects whose
    ``created_ts`` is older than their type's TTL. Subject-rights requests
    (``access`` / ``export`` / ``erase``) are first-class, persisted, and — for
    ``erase`` — GOVERNED: a request is created ``PENDING`` and nothing is
    hard-deleted until :func:`execute_erasure` is called with an approver, which
    then delegates to ``ontology_store.delete_object`` and audits the deletion.

Doctrine (matching the rest of the backend): **stdlib only** (``sqlite3``),
**idempotent** DDL/writes, and **never raise** — every public function degrades
gracefully and returns a safe empty/zero/False value on error.

DB path comes from env ``GOVERNANCE_DB`` (default ``server/data/governance.db``).
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

from . import audit
from . import ontology_store
from . import security

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "governance.db"
)

# Subject-rights request kinds + statuses.
REQUEST_KINDS = ("access", "export", "erase")
STATUS_PENDING = "PENDING"
STATUS_DONE = "DONE"
STATUS_REJECTED = "REJECTED"

_DAY_MS = 86_400_000


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``GOVERNANCE_DB``."""
    return os.environ.get("GOVERNANCE_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else [], default=str)
    except (TypeError, ValueError):
        return "[]"


def _loads(text: Optional[str], fallback: Any) -> Any:
    try:
        return json.loads(text) if text else fallback
    except (TypeError, ValueError):
        return fallback


# ── Schema (idempotent) ──────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS purpose (
    name              TEXT PRIMARY KEY,
    description       TEXT NOT NULL DEFAULT '',
    allowed_marks_json TEXT NOT NULL DEFAULT '[]',
    created_ts        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purpose_use (
    id         TEXT PRIMARY KEY,
    purpose    TEXT NOT NULL,
    object_id  TEXT NOT NULL DEFAULT '',
    actor      TEXT NOT NULL DEFAULT 'anonymous',
    ts         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_use_purpose ON purpose_use (purpose, ts);

CREATE TABLE IF NOT EXISTS retention (
    type_id    TEXT PRIMARY KEY,
    ttl_days   INTEGER NOT NULL,
    updated_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subject_request (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    subject_id  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    result_json TEXT NOT NULL DEFAULT '{}',
    requested_ts INTEGER NOT NULL,
    resolved_ts INTEGER,
    approver    TEXT
);
CREATE INDEX IF NOT EXISTS ix_request_status ON subject_request (status, requested_ts);
"""


def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open a connection with WAL where possible (mirrors audit/ontology_store)."""
    path = db_path or _db_path()
    if path != ":memory:":
        parent = os.path.dirname(path)
        if parent and not os.path.isdir(parent):
            try:
                os.makedirs(parent, exist_ok=True)
            except OSError:
                pass
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        if path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create all tables/indexes if absent. Idempotent; never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def _audit(actor: Any, action: str, resource: Any, detail: Any) -> None:
    """Best-effort audit write — governance decisions must be evidenced but an
    audit failure must never break the decision. Never raises."""
    try:
        audit.record(
            actor=actor if actor is not None else "anonymous",
            action=action,
            resource=str(resource) if resource is not None else "",
            detail=detail or {},
        )
    except Exception:  # noqa: BLE001 — auditing is best-effort
        pass


# ── Purpose-based access (#77) ─────────────────────────────────────────────────────
def register_purpose(
    name: str,
    description: str = "",
    allowed_marks: Optional[list] = None,
    *,
    db_path: Optional[str] = None,
) -> dict:
    """Register (or update) a named purpose with the set of classification marks
    it is allowed to touch. Idempotent upsert on ``name``.

    ``allowed_marks`` is normalised through :func:`security._norm_mark` so only
    known marks (PUBLIC/INTERNAL/FINANCIAL/PII/RESTRICTED) are stored; unknown /
    empty entries fail closed to RESTRICTED (the most sensitive), matching the
    rest of the backend. Returns ``{ok, name, allowed_marks}`` or
    ``{ok: False, error}``. Never raises."""
    if not name or not isinstance(name, str):
        return {"ok": False, "error": "name required"}
    init_db(db_path)
    marks_in = allowed_marks if isinstance(allowed_marks, list) else []
    # Normalise + de-dup, preserving order.
    norm: list[str] = []
    for m in marks_in:
        nm = security._norm_mark(m)
        if nm not in norm:
            norm.append(nm)
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO purpose (name, description, allowed_marks_json, created_ts)
                VALUES (?,?,?,?)
                ON CONFLICT(name) DO UPDATE SET
                    description = excluded.description,
                    allowed_marks_json = excluded.allowed_marks_json
                """,
                (name, str(description or ""), _dumps(norm), now),
            )
            conn.commit()
        finally:
            conn.close()
        _audit("system", "governance.purpose.register", name,
               {"allowed_marks": norm})
        return {"ok": True, "name": name, "description": str(description or ""),
                "allowed_marks": norm}
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}


def list_purposes(db_path: Optional[str] = None) -> list[dict]:
    """List all registered purposes (most recent first). Never raises."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM purpose ORDER BY created_ts DESC, name ASC"
            ).fetchall()
            return [
                {
                    "name": r["name"],
                    "description": r["description"],
                    "allowed_marks": _loads(r["allowed_marks_json"], []),
                    "created_ts": r["created_ts"],
                }
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_purpose(name: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch one purpose by name (or None). Never raises."""
    if not name:
        return None
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute("SELECT * FROM purpose WHERE name=?", (name,)).fetchone()
            if not r:
                return None
            return {
                "name": r["name"],
                "description": r["description"],
                "allowed_marks": _loads(r["allowed_marks_json"], []),
                "created_ts": r["created_ts"],
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def check_access(
    purpose: str,
    mark: Any,
    *,
    actor: Optional[str] = None,
    object_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> bool:
    """Decide whether a declared ``purpose`` is permitted to touch a ``mark``.

    Fail-closed: an unregistered purpose, or a mark not in the purpose's
    allow-list, denies access. The incoming ``mark`` is normalised through
    :func:`security._norm_mark` (unknown → RESTRICTED) so an unclassified object
    is treated as the most sensitive. Every decision (allow or deny) is written
    to the audit ledger. Returns a plain ``bool``; never raises."""
    norm_mark = security._norm_mark(mark)
    allowed = False
    p = get_purpose(purpose, db_path=db_path) if isinstance(purpose, str) else None
    if p is not None:
        allowed = norm_mark in p.get("allowed_marks", [])
    _audit(
        actor or "anonymous",
        "governance.access.allowed" if allowed else "governance.access.denied",
        object_id or purpose,
        {"purpose": purpose, "mark": norm_mark, "allowed": allowed,
         "object_id": object_id},
    )
    return allowed


def log_use(
    purpose: str,
    object_id: Any,
    actor: Any = None,
    *,
    db_path: Optional[str] = None,
) -> Optional[str]:
    """Record that ``actor`` used ``object_id`` under a declared ``purpose``.

    Persists a row in ``purpose_use`` AND writes a ledger entry, so data-use is
    queryable locally and tamper-evident in the chain. Returns the use-id (or
    None on error). Never raises."""
    init_db(db_path)
    uid = uuid.uuid4().hex
    pname = str(purpose or "")
    oid = str(object_id) if object_id is not None else ""
    act = str(actor) if actor is not None else "anonymous"
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "INSERT INTO purpose_use (id, purpose, object_id, actor, ts) "
                "VALUES (?,?,?,?,?)",
                (uid, pname, oid, act, _now_ms()),
            )
            conn.commit()
        finally:
            conn.close()
        _audit(act, "governance.use", oid, {"purpose": pname})
        return uid
    except sqlite3.Error:
        return None


def list_uses(
    purpose: Optional[str] = None,
    limit: int = 100,
    *,
    db_path: Optional[str] = None,
) -> list[dict]:
    """List recorded data-uses (most recent first), optionally per purpose."""
    try:
        lim = max(1, int(limit))
    except (TypeError, ValueError):
        lim = 100
    try:
        conn = _connect(db_path)
        try:
            if purpose:
                rows = conn.execute(
                    "SELECT * FROM purpose_use WHERE purpose=? "
                    "ORDER BY ts DESC, id DESC LIMIT ?",
                    (purpose, lim),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM purpose_use ORDER BY ts DESC, id DESC LIMIT ?",
                    (lim,),
                ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── Retention (#78) ────────────────────────────────────────────────────────────────
def set_retention(
    type_id: str,
    ttl_days: Any,
    *,
    db_path: Optional[str] = None,
) -> dict:
    """Set the retention TTL (in days) for an ontology object *type*. Idempotent
    upsert on ``type_id``. ``ttl_days`` is coerced to a non-negative int; a
    non-positive / unparsable value means "no expiry" and is stored as 0.
    Returns ``{ok, type_id, ttl_days}``. Never raises."""
    if not type_id or not isinstance(type_id, str):
        return {"ok": False, "error": "type_id required"}
    try:
        ttl = max(0, int(ttl_days))
    except (TypeError, ValueError):
        ttl = 0
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO retention (type_id, ttl_days, updated_ts)
                VALUES (?,?,?)
                ON CONFLICT(type_id) DO UPDATE SET
                    ttl_days = excluded.ttl_days,
                    updated_ts = excluded.updated_ts
                """,
                (type_id, ttl, _now_ms()),
            )
            conn.commit()
        finally:
            conn.close()
        _audit("system", "governance.retention.set", type_id, {"ttl_days": ttl})
        return {"ok": True, "type_id": type_id, "ttl_days": ttl}
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}


def list_retention(db_path: Optional[str] = None) -> list[dict]:
    """List all retention policies (by type). Never raises."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM retention ORDER BY type_id"
            ).fetchall()
            return [
                {"type_id": r["type_id"], "ttl_days": r["ttl_days"],
                 "updated_ts": r["updated_ts"]}
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def due_for_deletion(
    now: Optional[int] = None,
    *,
    db_path: Optional[str] = None,
    ontology_db: Optional[str] = None,
) -> list[dict]:
    """Return ontology objects that are PAST their type's retention TTL.

    Computed from the LIVE ontology store: for each retention policy with a
    positive ``ttl_days``, every object of that type whose
    ``created_ts + ttl_days*86_400_000 < now`` is overdue. ``now`` is epoch-ms
    (defaults to the current time). A TTL of 0 means "keep forever" and is
    skipped. Returns a list of ``{id, type, label, mark, created_ts, ttl_days,
    age_days, expires_ts}`` sorted oldest-first. Never raises — bad input or a
    missing store yields ``[]``."""
    try:
        now_ms = int(now) if now is not None else _now_ms()
    except (TypeError, ValueError):
        now_ms = _now_ms()

    policies = list_retention(db_path=db_path)
    out: list[dict] = []
    for pol in policies:
        ttl = pol.get("ttl_days") or 0
        if ttl <= 0:
            continue
        ttl_ms = ttl * _DAY_MS
        try:
            objs = ontology_store.query_objects(type=pol["type_id"], db_path=ontology_db)
        except Exception:  # noqa: BLE001 — store must never break governance
            objs = []
        for o in objs:
            created = o.get("created_ts")
            if not isinstance(created, (int, float)):
                continue
            expires = int(created) + ttl_ms
            if expires < now_ms:
                out.append({
                    "id": o.get("id"),
                    "type": o.get("type"),
                    "label": o.get("label"),
                    "mark": o.get("mark"),
                    "created_ts": int(created),
                    "ttl_days": ttl,
                    "age_days": round((now_ms - int(created)) / _DAY_MS, 2),
                    "expires_ts": expires,
                })
    out.sort(key=lambda r: r.get("created_ts") or 0)
    return out


# ── Subject-rights (#78) ────────────────────────────────────────────────────────────
def _objects_referencing(subject_id: str, *, ontology_db: Optional[str] = None) -> list[dict]:
    """Gather every ontology object that *references* a subject. A subject is
    matched if it IS the object (by id) OR any of its property values mention the
    subject id (string match). Best-effort; never raises."""
    found: dict[str, dict] = {}
    sid = str(subject_id)
    try:
        direct = ontology_store.get_object(sid, db_path=ontology_db)
        if direct:
            found[direct["id"]] = direct
        all_objs = ontology_store.query_objects(db_path=ontology_db)
    except Exception:  # noqa: BLE001
        all_objs = []
    for o in all_objs:
        if not isinstance(o, dict):
            continue
        if o.get("id") == sid:
            found[o["id"]] = o
            continue
        props = o.get("props")
        if isinstance(props, dict):
            for v in props.values():
                if isinstance(v, str) and sid in v:
                    found[o["id"]] = o
                    break
                if v == sid:
                    found[o["id"]] = o
                    break
    return list(found.values())


def subject_request(
    kind: str,
    subject_id: str,
    *,
    actor: Optional[str] = None,
    db_path: Optional[str] = None,
    ontology_db: Optional[str] = None,
) -> dict:
    """Create a data-subject-rights request (#78).

    ``kind``:
      * ``access`` / ``export`` — gather every ontology object referencing the
        subject and store the result immediately (status ``DONE``). The objects
        are returned in ``result.objects``. ``export`` differs from ``access``
        only in intent (recorded in the kind); both are read-only.
      * ``erase`` — create a GOVERNED, ``PENDING`` erasure request. Nothing is
        deleted here: :func:`execute_erasure` must be called with an approver to
        actually remove the objects. The objects that WOULD be erased are
        recorded in ``result.objects`` for review.

    Returns the stored request dict (incl. ``id`` and ``status``) or
    ``{ok: False, error}``. Never raises."""
    k = str(kind or "").strip().lower()
    if k not in REQUEST_KINDS:
        return {"ok": False, "error": f"unknown kind '{kind}' (one of {list(REQUEST_KINDS)})"}
    if not subject_id or not isinstance(subject_id, str):
        return {"ok": False, "error": "subject_id required"}
    init_db(db_path)

    objs = _objects_referencing(subject_id, ontology_db=ontology_db)
    object_ids = [o.get("id") for o in objs]
    rid = uuid.uuid4().hex
    now = _now_ms()

    if k in ("access", "export"):
        status = STATUS_DONE
        resolved = now
        result = {"objects": objs, "object_ids": object_ids, "count": len(objs)}
    else:  # erase — PENDING, governed; nothing deleted yet.
        status = STATUS_PENDING
        resolved = None
        result = {"object_ids": object_ids, "count": len(object_ids),
                  "note": "PENDING approval — call execute_erasure to delete"}

    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO subject_request
                    (id, kind, subject_id, status, result_json, requested_ts, resolved_ts, approver)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (rid, k, subject_id, status, _request_result_dumps(result),
                 now, resolved, None),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}

    _audit(
        actor or "system",
        f"governance.subject.{k}",
        subject_id,
        {"request_id": rid, "status": status, "count": len(object_ids)},
    )
    return get_request(rid, db_path=db_path) or {
        "ok": False, "error": "request not stored"}


def _request_result_dumps(result: Any) -> str:
    try:
        return json.dumps(result if result is not None else {}, default=str)
    except (TypeError, ValueError):
        return "{}"


def get_request(request_id: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch one subject-rights request by id (or None). Never raises."""
    if not request_id:
        return None
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute(
                "SELECT * FROM subject_request WHERE id=?", (request_id,)
            ).fetchone()
            return _row_to_request(r) if r else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def _row_to_request(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "kind": r["kind"],
        "subject_id": r["subject_id"],
        "status": r["status"],
        "result": _loads(r["result_json"], {}),
        "requested_ts": r["requested_ts"],
        "resolved_ts": r["resolved_ts"],
        "approver": r["approver"],
    }


def list_requests(
    status: Optional[str] = None,
    *,
    db_path: Optional[str] = None,
) -> list[dict]:
    """List subject-rights requests (most recent first), optionally filtered by
    ``status`` (PENDING/DONE/REJECTED). Never raises."""
    try:
        conn = _connect(db_path)
        try:
            if status:
                rows = conn.execute(
                    "SELECT * FROM subject_request WHERE status=? "
                    "ORDER BY requested_ts DESC, id DESC",
                    (str(status).upper(),),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM subject_request "
                    "ORDER BY requested_ts DESC, id DESC"
                ).fetchall()
            return [_row_to_request(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def execute_erasure(
    request_id: str,
    approver: str,
    *,
    db_path: Optional[str] = None,
    ontology_db: Optional[str] = None,
) -> dict:
    """Approve + execute a PENDING erasure request — the GOVERNED deletion path.

    Looks up the request, verifies it is an ``erase`` request still ``PENDING``,
    then hard-deletes each referenced object via
    :func:`ontology_store.delete_object`, marks the request ``DONE`` with the
    approver + per-object deletion outcome, and audits the deletion. An approver
    name is REQUIRED — an erasure with no accountable approver is rejected.

    Returns ``{ok, request_id, deleted, status, ...}`` or ``{ok: False, error}``.
    Never raises (this is the only function that destroys data, so it is the most
    defensive)."""
    if not approver or not isinstance(approver, str):
        return {"ok": False, "error": "approver required"}
    req = get_request(request_id, db_path=db_path)
    if req is None:
        return {"ok": False, "error": "unknown request"}
    if req["kind"] != "erase":
        return {"ok": False, "error": "not an erase request"}
    if req["status"] != STATUS_PENDING:
        return {"ok": False, "error": f"request not pending (status={req['status']})"}

    object_ids = req.get("result", {}).get("object_ids", []) or []
    deleted: list[str] = []
    missing: list[str] = []
    for oid in object_ids:
        try:
            ok = ontology_store.delete_object(str(oid), db_path=ontology_db)
        except Exception:  # noqa: BLE001 — keep erasing the rest
            ok = False
        if ok:
            deleted.append(oid)
        else:
            missing.append(oid)

    now = _now_ms()
    result = {
        "object_ids": object_ids,
        "deleted": deleted,
        "not_deleted": missing,
        "count": len(deleted),
    }
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "UPDATE subject_request SET status=?, result_json=?, resolved_ts=?, approver=? "
                "WHERE id=?",
                (STATUS_DONE, _request_result_dumps(result), now, approver, request_id),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}

    _audit(
        approver,
        "governance.subject.erase.executed",
        req["subject_id"],
        {"request_id": request_id, "deleted": deleted, "count": len(deleted)},
    )
    return {"ok": True, "request_id": request_id, "status": STATUS_DONE,
            "deleted": deleted, "not_deleted": missing, "approver": approver}


# Bootstrap the default DB on import so the first request finds the tables.
init_db()
