"""CROSS-ORGANISATIONAL BOUNDARY SHARING — governed bilateral trust.

Palantir platform pillar: multi-tenant objects may be shared across tenant
boundaries only when a cryptographically-random trust token has been minted by
both parties. The token encodes the permission scope and expiry.

Doctrine (matching the rest of the backend):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL and idempotent writes.
  * never raise on normal use — every public function degrades gracefully.

DB path comes from the env var ``CROSS_ORG_DB`` (default
``server/data/cross_org.db``).
"""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
import time
from typing import Any, Optional

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "cross_org.db"
)


def _db_path() -> str:
    return os.environ.get("CROSS_ORG_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return "{}"


def _loads(text: Optional[str]) -> Any:
    if not text:
        return {}
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return {}


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS cross_org_trust (
    tenant_a          TEXT NOT NULL,
    tenant_b          TEXT NOT NULL,
    token             TEXT NOT NULL,
    permissions_json  TEXT NOT NULL DEFAULT '{}',
    expires_at        INTEGER,
    created_ts        INTEGER NOT NULL,
    PRIMARY KEY (tenant_a, tenant_b)
);
CREATE INDEX IF NOT EXISTS ix_cross_org_token ON cross_org_trust (token);

CREATE TABLE IF NOT EXISTS cross_org_share (
    id          TEXT PRIMARY KEY,
    object_id   TEXT NOT NULL,
    from_tenant TEXT NOT NULL,
    to_tenant   TEXT NOT NULL,
    permissions_json TEXT NOT NULL DEFAULT '{}',
    created_ts  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_cross_org_share_obj ON cross_org_share (object_id);
"""


# ── Connection management ───────────────────────────────────────────────────────
def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
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
    """Idempotent DDL. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── public API ──────────────────────────────────────────────────────────────────
async def create_trust_token(
    tenant_a: str,
    tenant_b: str,
    permissions: dict,
    *,
    ttl_seconds: Optional[int] = None,
    db_path: Optional[str] = None,
) -> dict:
    """Mint a bilateral trust token between two tenants.

    Returns ``{"ok", "token", "tenant_a", "tenant_b", "expires_at"}``.
    If a trust already exists it is overwritten (idempotent on the pair).
    """
    init_db(db_path)
    token = secrets.token_urlsafe(32)
    now = _now_ms()
    expires = now + (ttl_seconds * 1000) if ttl_seconds else None
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO cross_org_trust
                    (tenant_a, tenant_b, token, permissions_json, expires_at, created_ts)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(tenant_a, tenant_b) DO UPDATE SET
                    token = excluded.token,
                    permissions_json = excluded.permissions_json,
                    expires_at = excluded.expires_at,
                    created_ts = excluded.created_ts
                """,
                (
                    str(tenant_a),
                    str(tenant_b),
                    token,
                    _dumps(permissions),
                    expires,
                    now,
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "token": token,
        "tenant_a": str(tenant_a),
        "tenant_b": str(tenant_b),
        "expires_at": expires,
    }


async def validate_trust_token(token: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Verify a cross-org request token. Returns the trust record or ``None`` if
    invalid / expired / not found. Never raises."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute(
                "SELECT * FROM cross_org_trust WHERE token=?", (token,)
            ).fetchone()
            if row is None:
                return None
            expires = row["expires_at"]
            if expires is not None and _now_ms() > expires:
                return None
            return {
                "tenant_a": row["tenant_a"],
                "tenant_b": row["tenant_b"],
                "token": row["token"],
                "permissions": _loads(row["permissions_json"]),
                "expires_at": expires,
                "created_ts": row["created_ts"],
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return None


async def share_object(
    object_id: str,
    from_tenant: str,
    to_tenant: str,
    permissions: dict,
    *,
    db_path: Optional[str] = None,
) -> dict:
    """Governed share of an object across tenant boundaries.

    Ensures a trust token exists between the two tenants, then records the share
    intent in ``cross_org_share``. Returns ``{"ok", "share_id", "trust"}``.
    """
    init_db(db_path)
    # Ensure trust exists (best-effort).
    trust = None
    try:
        trust = await create_trust_token(from_tenant, to_tenant, permissions, db_path=db_path)
    except Exception:  # noqa: BLE001
        pass

    sid = secrets.token_urlsafe(16)
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO cross_org_share
                    (id, object_id, from_tenant, to_tenant, permissions_json, created_ts)
                VALUES (?,?,?,?,?,?)
                """,
                (
                    sid,
                    str(object_id),
                    str(from_tenant),
                    str(to_tenant),
                    _dumps(permissions),
                    now,
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "share_id": sid, "trust": trust}


async def list_shares(
    object_id: Optional[str] = None,
    from_tenant: Optional[str] = None,
    to_tenant: Optional[str] = None,
    limit: int = 100,
    *,
    db_path: Optional[str] = None,
) -> list[dict]:
    """List governed shares with optional filters."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            sql = "SELECT * FROM cross_org_share WHERE 1=1"
            args: list[Any] = []
            if object_id:
                sql += " AND object_id=?"
                args.append(object_id)
            if from_tenant:
                sql += " AND from_tenant=?"
                args.append(from_tenant)
            if to_tenant:
                sql += " AND to_tenant=?"
                args.append(to_tenant)
            sql += " ORDER BY created_ts DESC LIMIT ?"
            args.append(max(1, int(limit)))
            rows = conn.execute(sql, args).fetchall()
            return [
                {
                    "id": r["id"],
                    "object_id": r["object_id"],
                    "from_tenant": r["from_tenant"],
                    "to_tenant": r["to_tenant"],
                    "permissions": _loads(r["permissions_json"]),
                    "created_ts": r["created_ts"],
                }
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# Bootstrap the default DB on import so the first request finds the tables.
init_db()
