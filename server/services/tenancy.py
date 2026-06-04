"""MULTI-TENANCY — tenant registry, memberships, and active-tenant resolution.

Palantir platform pillar P16 (#116). A SQLite-backed (stdlib ``sqlite3``, no
ORM) store that records *which tenants exist*, *who belongs to which tenant*,
and *how to derive the active tenant for an inbound request*. It layers on top
of the existing bearer-token identity in ``server/auth.py`` — it does NOT change
or replace authentication; it adds the orthogonal "which org/workspace are we
operating in" axis.

Doctrine (matching the rest of the backend):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``) and idempotent writes
    (``INSERT ... ON CONFLICT ... DO UPDATE/NOTHING``) so re-running never
    duplicates rows.
  * never raise on normal use — every public function degrades gracefully and
    returns a safe empty/default value on error.

DB path comes from the env var ``TENANCY_DB`` (default
``server/data/tenancy.db``). Tests pass an explicit temp path / ``:memory:``.

────────────────────────────────────────────────────────────────────────────
PLUG-IN SEAM (real IdP / JWT)
────────────────────────────────────────────────────────────────────────────
:func:`resolve_tenant` derives the active tenant from request context using a
three-step precedence:

  1. an explicit ``X-Tenant-Id`` header (must name a known tenant), else
  2. a tenant *claim* mapped from the bearer **principal**'s memberships
     (single membership → that tenant), else
  3. the auto-created ``default`` tenant.

Today the "principal" is just the bearer token string from ``auth.py`` (or
``anonymous`` when none / public reads). When a real IdP/OIDC provider is wired
in, the only change required is to populate ``principal`` (and optionally a
``tenant``/``org`` claim) from the verified JWT — e.g. set the principal to the
token ``sub`` and pass the JWT ``org_id`` claim as ``claim_tenant=``. The header
and default fallbacks stay as a developer/escape hatch. No call sites change.

────────────────────────────────────────────────────────────────────────────
STORE ADOPTION (row-level isolation)
────────────────────────────────────────────────────────────────────────────
This module provides the *seam* for tenant-scoped data, not a retrofit of every
existing store. Full row-level tenant isolation across the whole backend is an
explicit adoption step. Two adoption patterns are supported:

  * **tenant_id column** — add a ``tenant_id`` column to a table and stamp it on
    write / filter it on read using :func:`scope_filter` (returns the tenant_id
    to stamp/filter by). This keeps one DB file, many tenants.
  * **per-tenant DB path** — give each tenant its own sqlite file via
    :func:`tenant_db_path`, then pass that ``db_path=`` to the existing store
    functions (history_lake, audit, ontology, ... all already accept
    ``db_path=``). This needs *zero* changes to the stores themselves.

Neither is applied to the existing stores here — the helpers are provided so a
store CAN be made tenant-scoped incrementally.
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Mapping, Optional
import sqlite3

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "tenancy.db"
)

# The tenant every system always has; created on demand so resolve_tenant can
# never come up empty.
DEFAULT_TENANT_ID = "default"

# A conservative slug pattern for tenant ids embedded in filesystem paths, so
# tenant_db_path can never escape its base directory.
_SAFE_ID = re.compile(r"[^A-Za-z0-9_.-]")


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``TENANCY_DB`` (or pass
    ``db_path=`` explicitly) before the first connection."""
    return os.environ.get("TENANCY_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS tenant (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    plan          TEXT    NOT NULL DEFAULT 'free',
    created_ts    INTEGER NOT NULL,
    settings_json TEXT    NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS membership (
    tenant_id TEXT    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    principal TEXT    NOT NULL,
    role      TEXT    NOT NULL DEFAULT 'member',
    ts        INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, principal)
);
CREATE INDEX IF NOT EXISTS ix_membership_principal ON membership (principal);
"""


# ── Connection management ────────────────────────────────────────────────────────
def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open a connection with WAL + foreign keys. ``check_same_thread=False`` so
    the FastAPI threadpool / asyncio loop can share it; writes are short and
    serialized by SQLite's single-writer lock. Mirrors history_lake/audit."""
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
        conn.execute("PRAGMA foreign_keys=ON")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create the tenant/membership tables + indexes if absent. Idempotent —
    safe to call on every import / app start. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def _slug(name: str) -> str:
    """Deterministic, filesystem/URL-safe tenant id derived from a name."""
    s = _SAFE_ID.sub("-", (name or "").strip().lower()).strip("-")
    s = re.sub(r"-+", "-", s)
    return s or "tenant"


def _dump_settings(settings: Any) -> str:
    try:
        return json.dumps(settings if settings is not None else {}, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return "{}"


def _row_to_tenant(row: sqlite3.Row) -> dict:
    try:
        settings = json.loads(row["settings_json"] or "{}")
    except (TypeError, ValueError):
        settings = {}
    return {
        "id": row["id"],
        "name": row["name"],
        "plan": row["plan"],
        "created_ts": row["created_ts"],
        "settings": settings,
    }


# ── tenant CRUD ───────────────────────────────────────────────────────────────────
def create_tenant(
    name: str,
    plan: str = "free",
    *,
    tenant_id: Optional[str] = None,
    settings: Optional[dict] = None,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Create (or fetch, if it already exists) a tenant.

    The id is derived from ``name`` (slugified) unless ``tenant_id`` is given.
    Idempotent on id: a second call with the same id returns the existing tenant
    unchanged rather than duplicating. Returns the tenant dict or ``None`` on
    error. Never raises.
    """
    nm = (str(name).strip() if name is not None else "") or "tenant"
    tid = (str(tenant_id).strip() if tenant_id else _slug(nm))
    pl = (str(plan).strip() if plan else "free") or "free"
    settings_json = _dump_settings(settings)
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO tenant (id, name, plan, created_ts, settings_json)
                VALUES (?,?,?,?,?)
                ON CONFLICT(id) DO NOTHING
                """,
                (tid, nm, pl, _now_ms(), settings_json),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM tenant WHERE id=?", (tid,)).fetchone()
            return _row_to_tenant(row) if row else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def list_tenants(db_path: Optional[str] = None) -> list[dict]:
    """All tenants, oldest first. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM tenant ORDER BY created_ts ASC, id ASC"
            ).fetchall()
            return [_row_to_tenant(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_tenant(tenant_id: str, db_path: Optional[str] = None) -> Optional[dict]:
    """One tenant by id, or ``None`` if unknown / on error. Never raises."""
    if not tenant_id:
        return None
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute(
                "SELECT * FROM tenant WHERE id=?", (str(tenant_id),)
            ).fetchone()
            return _row_to_tenant(row) if row else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def ensure_default(db_path: Optional[str] = None) -> str:
    """Guarantee the system always has a tenant. Idempotent: creates the
    ``default`` tenant if missing, returns its id either way. Never raises."""
    create_tenant("Default", plan="free", tenant_id=DEFAULT_TENANT_ID, db_path=db_path)
    return DEFAULT_TENANT_ID


# ── membership ──────────────────────────────────────────────────────────────────
def add_member(
    tenant_id: str,
    principal: str,
    role: str = "member",
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Add (or update the role of) a principal in a tenant. Idempotent on
    (tenant_id, principal). Returns the membership dict, or ``None`` if the
    tenant does not exist / on error. Never raises."""
    if not tenant_id or not principal:
        return None
    role_s = (str(role).strip() if role else "member") or "member"
    ts = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            exists = conn.execute(
                "SELECT 1 FROM tenant WHERE id=?", (str(tenant_id),)
            ).fetchone()
            if not exists:
                return None
            conn.execute(
                """
                INSERT INTO membership (tenant_id, principal, role, ts)
                VALUES (?,?,?,?)
                ON CONFLICT(tenant_id, principal) DO UPDATE SET
                    role = excluded.role,
                    ts   = excluded.ts
                """,
                (str(tenant_id), str(principal), role_s, ts),
            )
            conn.commit()
            return {
                "tenant_id": str(tenant_id),
                "principal": str(principal),
                "role": role_s,
                "ts": ts,
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def members(tenant_id: str, db_path: Optional[str] = None) -> list[dict]:
    """All memberships for a tenant, oldest first. Never raises."""
    if not tenant_id:
        return []
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT tenant_id, principal, role, ts FROM membership "
                "WHERE tenant_id=? ORDER BY ts ASC, principal ASC",
                (str(tenant_id),),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def tenants_for(principal: str, db_path: Optional[str] = None) -> list[dict]:
    """Every tenant the ``principal`` belongs to, with that membership's role.
    Returns ``[{"tenant_id", "role", "ts"}, ...]`` oldest first. Never raises."""
    if not principal:
        return []
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT tenant_id, role, ts FROM membership "
                "WHERE principal=? ORDER BY ts ASC, tenant_id ASC",
                (str(principal),),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def member_role(
    tenant_id: str, principal: str, db_path: Optional[str] = None
) -> Optional[str]:
    """The role of ``principal`` in ``tenant_id``, or ``None`` if not a member."""
    if not tenant_id or not principal:
        return None
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute(
                "SELECT role FROM membership WHERE tenant_id=? AND principal=?",
                (str(tenant_id), str(principal)),
            ).fetchone()
            return row["role"] if row else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


# ── active-tenant resolution (the plug-in seam) ───────────────────────────────────
def _header_lookup(headers: Optional[Mapping[str, str]], key: str) -> Optional[str]:
    """Case-insensitive header lookup tolerant of plain dicts and Starlette's
    Headers (which are already case-insensitive)."""
    if not headers:
        return None
    # Starlette Headers / dict both support .get; try direct then case-folded.
    try:
        v = headers.get(key)  # type: ignore[attr-defined]
        if v:
            return str(v)
    except (AttributeError, TypeError):
        pass
    low = key.lower()
    try:
        for k, v in headers.items():  # type: ignore[union-attr]
            if str(k).lower() == low and v:
                return str(v)
    except (AttributeError, TypeError):
        return None
    return None


def resolve_tenant(
    headers: Optional[Mapping[str, str]] = None,
    *,
    principal: Optional[str] = None,
    claim_tenant: Optional[str] = None,
    db_path: Optional[str] = None,
) -> str:
    """Derive the active tenant id for a request. Never raises.

    Precedence (see module docstring for the IdP plug-in seam):

      1. ``X-Tenant-Id`` header naming a known tenant.
      2. ``claim_tenant`` (a tenant claim a real IdP would supply) naming a
         known tenant.
      3. the bearer **principal**'s memberships — if the principal belongs to
         exactly one tenant, that tenant; if to several, the oldest one.
      4. the auto-created ``default`` tenant.

    ``headers`` may be a Starlette ``Headers`` object or a plain dict. Today the
    ``principal`` is just the bearer token (or ``None``/``anonymous``); a real
    IdP would pass the verified ``sub`` here and optionally ``claim_tenant``.
    Steps that name an unknown tenant are skipped (never trusted blindly).
    """
    # 0. Always make sure a default exists so step 4 can never fail.
    ensure_default(db_path=db_path)

    # 1. Explicit header wins — but only if it names a real tenant.
    hdr = _header_lookup(headers, "X-Tenant-Id")
    if hdr and get_tenant(hdr.strip(), db_path=db_path):
        return hdr.strip()

    # 2. A tenant claim from the IdP (plug-in seam), if it names a real tenant.
    if claim_tenant and get_tenant(str(claim_tenant).strip(), db_path=db_path):
        return str(claim_tenant).strip()

    # 3. Map the principal to its membership(s).
    if principal:
        memberships = tenants_for(str(principal), db_path=db_path)
        if memberships:
            # Oldest membership is the deterministic "home" tenant.
            return memberships[0]["tenant_id"]

    # 4. Fall back to the always-present default tenant.
    return DEFAULT_TENANT_ID


# ── store-adoption helpers (seam, not a retrofit) ─────────────────────────────────
def scope_filter(tenant_id: str) -> str:
    """Return the tenant_id a store should *stamp on writes* and *filter on
    reads*.

    Usage pattern for a store adopting the **tenant_id column** approach::

        tid = tenancy.scope_filter(active_tenant)
        conn.execute("INSERT INTO thing (tenant_id, ...) VALUES (?, ...)", (tid, ...))
        conn.execute("SELECT ... FROM thing WHERE tenant_id=?", (tid,))

    It is intentionally a thin, explicit helper (just normalises/falls back to
    the default) rather than magic — adopting stores stay readable and the
    isolation boundary is grep-able. Never raises.
    """
    tid = (str(tenant_id).strip() if tenant_id else "") or DEFAULT_TENANT_ID
    return tid


def tenant_db_path(base_env: str, tenant_id: str, *, default: Optional[str] = None) -> str:
    """Namespace a sqlite path *per tenant* for the **per-tenant DB** approach.

    Given the base DB path (resolved from env var ``base_env``, e.g.
    ``HISTORY_LAKE_DB`` or ``ONTOLOGY_DB``, falling back to ``default``), return a
    path that lives under ``<dir>/<tenant>/<filename>`` — e.g.::

        tenant_db_path("ONTOLOGY_DB", "acme")  ->  server/data/acme/ontology.db

    A store is then made tenant-scoped with *no code change to the store* by
    passing this as its ``db_path=`` (history_lake, audit, ontology and friends
    all already accept ``db_path=``)::

        path = tenancy.tenant_db_path("HISTORY_LAKE_DB", active_tenant)
        history_lake.read_series(sid, db_path=path)

    ``:memory:`` and empty bases are returned unchanged (nothing to namespace).
    The tenant id is slugified so it is always a safe single path segment and
    cannot traverse out of its directory. Never raises.
    """
    base = os.environ.get(base_env, default or "")
    if not base or base == ":memory:":
        return base
    safe = _slug(tenant_id) if tenant_id else DEFAULT_TENANT_ID
    directory, filename = os.path.split(base)
    return os.path.join(directory, safe, filename)


# Bootstrap the default DB + default tenant on import so the first request finds
# the tables and a tenant. Guarded so a read-only / missing-dir environment
# never breaks import (mirrors history_lake / audit).
init_db()
try:
    ensure_default()
except Exception:  # noqa: BLE001 - import must never fail on an optional bootstrap
    pass
