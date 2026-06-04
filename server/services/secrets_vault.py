"""SECRETS VAULT — a connector-secrets store with obfuscated-at-rest values and
name-reference injection into connector configs (Palantir pillar P1 #11).

This is the credential plane that sits ALONGSIDE the connector registry
(``server/services/connectors.py``): a connector's config can carry a *reference*
to a secret (``"$secret:my_key"``) instead of the raw value, and
:func:`resolve_for_connector` swaps those references for the real values at
run-time, server-side only.

  ⚠️  HONESTY NOTE — OBFUSCATION, NOT ENCRYPTION.
  Values are stored *obfuscated* with base64 (``base64.b64encode``). Base64 is an
  ENCODING, not encryption — anyone with read access to the DB file can trivially
  decode it. This module deliberately does NOT claim to encrypt. It exists so the
  values are not stored as bare plaintext and so the API surface never returns
  them. **For production, replace the obfuscation layer with a real KMS / envelope
  encryption keyed by a managed ``SECRET_KEY`` (e.g. AWS KMS, GCP KMS, Vault,
  ``cryptography.fernet`` with a key from a secrets manager).** The
  put/get/resolve API is intentionally shaped so that swap-in is a one-function
  change (:func:`_obfuscate` / :func:`_deobfuscate`).

Doctrine (matching the rest of the backend): **stdlib only** (``sqlite3`` +
``base64``), **idempotent** DDL/writes, **never raise** — every public function
degrades to a safe value on error. The API NEVER returns secret values:
:func:`list_secrets` and the routes expose names + metadata only; values are
available server-side via :func:`get_secret` / :func:`resolve_for_connector`.

DB path comes from env ``VAULT_DB`` (default ``server/data/vault.db``).
"""

from __future__ import annotations

import base64
import os
import sqlite3
import time
from typing import Any, Optional

from . import audit
from . import connectors as cx

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "vault.db"
)

# A config value of exactly this prefix + a secret name is a reference to resolve.
SECRET_REF_PREFIX = "$secret:"

# Honest, machine-readable marker of how values are protected at rest.
OBFUSCATION = "base64"  # NOT encryption — see module docstring.


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``VAULT_DB``."""
    return os.environ.get("VAULT_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Schema (idempotent) ──────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS secret (
    name        TEXT PRIMARY KEY,
    value_b64   TEXT NOT NULL,
    owner       TEXT NOT NULL DEFAULT '',
    obfuscation TEXT NOT NULL DEFAULT 'base64',
    created_ts  INTEGER NOT NULL,
    updated_ts  INTEGER NOT NULL
);
"""


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
    """Create the secret table if absent. Idempotent; never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── obfuscation (NOT encryption — see module docstring) ──────────────────────────
def _obfuscate(value: str) -> str:
    """Encode a secret value for at-rest storage. base64 ONLY — reversible, NOT
    encryption. The single swap point for a real KMS in production."""
    try:
        return base64.b64encode(value.encode("utf-8")).decode("ascii")
    except Exception:  # noqa: BLE001
        return ""


def _deobfuscate(value_b64: str) -> Optional[str]:
    """Reverse :func:`_obfuscate`. Returns None on bad input. Never raises."""
    try:
        return base64.b64decode(value_b64.encode("ascii")).decode("utf-8")
    except Exception:  # noqa: BLE001
        return None


def _audit(actor: Any, action: str, resource: Any, detail: Any = None) -> None:
    """Best-effort audit write — never raises, and NEVER records a secret value."""
    try:
        audit.record(
            actor=actor if actor is not None else "system",
            action=action,
            resource=str(resource) if resource is not None else "",
            detail=detail or {},
        )
    except Exception:  # noqa: BLE001
        pass


# ── put / get / list / delete ─────────────────────────────────────────────────────
def put_secret(name: Any, value: Any, owner: Any = "", *, db_path: Optional[str] = None) -> dict:
    """Store (or update) a secret value, OBFUSCATED at rest (base64, NOT
    encryption — see module docstring). Idempotent upsert on ``name``. Audited
    (the audit row records the name + owner, NEVER the value). Returns metadata
    only — ``{ok, name, owner, obfuscation}`` — and never echoes the value."""
    if not name or not isinstance(name, str) or not name.strip():
        return {"ok": False, "error": "name required"}
    nm = name.strip()
    if value is None:
        return {"ok": False, "error": "value required"}
    val = value if isinstance(value, str) else str(value)
    init_db(db_path)
    now = _now_ms()
    enc = _obfuscate(val)
    try:
        conn = _connect(db_path)
        try:
            existing = conn.execute(
                "SELECT created_ts FROM secret WHERE name=?", (nm,)
            ).fetchone()
            created = existing["created_ts"] if existing else now
            conn.execute(
                """
                INSERT INTO secret (name, value_b64, owner, obfuscation, created_ts, updated_ts)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(name) DO UPDATE SET
                    value_b64 = excluded.value_b64,
                    owner = excluded.owner,
                    obfuscation = excluded.obfuscation,
                    updated_ts = excluded.updated_ts
                """,
                (nm, enc, str(owner or ""), OBFUSCATION, created, now),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    _audit(owner or "system", "vault.secret.put", nm, {"owner": str(owner or "")})
    return {"ok": True, "name": nm, "owner": str(owner or ""), "obfuscation": OBFUSCATION}


def get_secret(name: Any, *, db_path: Optional[str] = None) -> Optional[str]:
    """Return the CLEAR secret value for SERVER-SIDE use (e.g. to inject into a
    connector request). This is the only function that returns a value and it must
    NEVER be wired to an API response. Returns None if absent / on error."""
    if not name or not isinstance(name, str):
        return None
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute(
                "SELECT value_b64 FROM secret WHERE name=?", (name.strip(),)
            ).fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return None
    if not r:
        return None
    return _deobfuscate(r["value_b64"])


def list_secrets(db_path: Optional[str] = None) -> list[dict]:
    """List secret NAMES + METADATA only — NEVER the values. Returns
    ``[{name, owner, obfuscation, created_ts, updated_ts}, ...]``. This is the
    only listing surface and it is intentionally value-free. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT name, owner, obfuscation, created_ts, updated_ts "
                "FROM secret ORDER BY name"
            ).fetchall()
            return [
                {
                    "name": r["name"],
                    "owner": r["owner"],
                    "obfuscation": r["obfuscation"],
                    "created_ts": r["created_ts"],
                    "updated_ts": r["updated_ts"],
                }
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def delete_secret(name: Any, *, db_path: Optional[str] = None) -> dict:
    """Delete a secret by name. Audited. Returns ``{ok, deleted}``. Never raises."""
    if not name or not isinstance(name, str):
        return {"ok": False, "error": "name required"}
    nm = name.strip()
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute("DELETE FROM secret WHERE name=?", (nm,))
            conn.commit()
            deleted = cur.rowcount
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    _audit("system", "vault.secret.delete", nm, {"deleted": int(deleted)})
    return {"ok": True, "deleted": int(deleted)}


# ── secret-reference resolution (#11) ───────────────────────────────────────────────
def _is_ref(value: Any) -> bool:
    return isinstance(value, str) and value.startswith(SECRET_REF_PREFIX)


def _ref_name(value: str) -> str:
    return value[len(SECRET_REF_PREFIX):].strip()


def resolve_config(config: Any, *, db_path: Optional[str] = None) -> dict:
    """Return a COPY of ``config`` with any ``"$secret:<name>"`` references (at the
    top level OR nested one level inside dict/list values) replaced by the resolved
    secret value. A reference whose secret is missing is left untouched (honest:
    we don't silently blank it). Never raises; bad input → ``{}``."""
    if not isinstance(config, dict):
        return {}
    cache: dict[str, Optional[str]] = {}

    def _resolve_one(v: Any) -> Any:
        if _is_ref(v):
            name = _ref_name(v)
            if name not in cache:
                cache[name] = get_secret(name, db_path=db_path)
            resolved = cache[name]
            return resolved if resolved is not None else v
        if isinstance(v, dict):
            return {k: _resolve_one(x) for k, x in v.items()}
        if isinstance(v, list):
            return [_resolve_one(x) for x in v]
        return v

    return {k: _resolve_one(v) for k, v in config.items()}


def resolve_for_connector(connector_id: Any, *, db_path: Optional[str] = None,
                          connectors_db: Optional[str] = None) -> dict:
    """Look up a registered connector and return its config with all
    ``"$secret:<name>"`` references resolved to real values (SERVER-SIDE only).

    Returns ``{ok, connector_id, kind, config}`` where ``config`` carries the
    injected secret values for use by the connector runner, or
    ``{ok: False, error}`` if the connector is unknown. Never raises. The
    resolved config is for server-side use and must not be returned over the API."""
    try:
        c = cx.get_connector(str(connector_id), db_path=connectors_db)
    except Exception:  # noqa: BLE001
        c = None
    if c is None:
        return {"ok": False, "error": "unknown connector"}
    resolved = resolve_config(c.get("config") or {}, db_path=db_path)
    return {"ok": True, "connector_id": c.get("id"), "name": c.get("name"),
            "kind": c.get("kind"), "config": resolved}


# Bootstrap the default DB on import so the first request finds the table.
init_db()
