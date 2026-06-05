"""PG_STORE — the real PostgreSQL-backed object store (production path).

This is the actual wiring the `database/postgres` schema + `contracts` promised:
a working object store over live PostgreSQL with row-level security enforced by the
engine (tenant isolation + classification ceiling via session GUCs).

Honesty: the default live brain is still SQLite (`second_brain`). This is the
PRODUCTION store — used when a Postgres is available (env `PLATFORM_PG_DSN`, default
localhost). It is not a stub: every call executes real SQL. Writes use the owner
role; reads use the unprivileged `app` role so RLS applies.

Requires psycopg2 (installed in environments that run Postgres). Degrades cleanly:
``available()`` is False when there is no reachable server/driver, so callers fall
back to SQLite instead of crashing.
"""

from __future__ import annotations

import os

try:
    import psycopg2
    import psycopg2.extras
except Exception:  # noqa: BLE001
    psycopg2 = None  # type: ignore

_OWNER_DSN = os.environ.get("PLATFORM_PG_DSN",
                            "host=127.0.0.1 user=platform password=platform dbname=platform")
_APP_DSN = os.environ.get("PLATFORM_PG_APP_DSN",
                          "host=127.0.0.1 user=app password=app dbname=platform")


def available() -> bool:
    if psycopg2 is None:
        return False
    try:
        cn = psycopg2.connect(_OWNER_DSN, connect_timeout=2)
        cn.close()
        return True
    except Exception:  # noqa: BLE001
        return False


def _owner():
    cn = psycopg2.connect(_OWNER_DSN, connect_timeout=3)
    cn.autocommit = True
    return cn


def _app():
    cn = psycopg2.connect(_APP_DSN, connect_timeout=3)
    cn.autocommit = True
    return cn


def ensure_app_role() -> None:
    """Create the unprivileged RLS-bound 'app' role + grants (idempotent)."""
    cn = _owner(); cur = cn.cursor()
    cur.execute("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app') "
                "THEN CREATE ROLE app LOGIN PASSWORD 'app'; END IF; END $$;")
    cur.execute("GRANT USAGE ON SCHEMA platform_objects, platform_policy TO app;")
    cur.execute("GRANT SELECT, INSERT ON platform_objects.object TO app;")
    cur.execute("GRANT EXECUTE ON FUNCTION platform_policy.clearance_rank(text) TO app;")
    cn.close()


def put_object(object_id: str, tenant_id: str, object_type: str, props: dict,
               *, state: str = "active", classification: str = "UNCLASSIFIED",
               created_by: str = "pg_store") -> str:
    """Insert/replace an object (owner role)."""
    import json
    cn = _owner(); cur = cn.cursor()
    cur.execute(
        "INSERT INTO platform_objects.object (id,tenant_id,object_type,props,state,classification,created_by) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO UPDATE SET props=EXCLUDED.props, "
        "state=EXCLUDED.state, classification=EXCLUDED.classification, updated_at=now()",
        (object_id, tenant_id, object_type, json.dumps(props), state, classification, created_by))
    cn.close()
    return object_id


def query_objects(tenant_id: str, clearance: str, *, object_type: str | None = None) -> list[dict]:
    """RLS-enforced read as the unprivileged 'app' role: only rows the (tenant,
    clearance) is allowed to see are returned — the database enforces it, not us."""
    cn = _app(); cur = cn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SET app.tenant_id = %s; SET app.clearance = %s;", (tenant_id, clearance))
    if object_type:
        cur.execute("SELECT id,object_type,state,classification FROM platform_objects.object "
                    "WHERE object_type=%s ORDER BY id", (object_type,))
    else:
        cur.execute("SELECT id,object_type,state,classification FROM platform_objects.object ORDER BY id")
    rows = [dict(r) for r in cur.fetchall()]
    cn.close()
    return rows


def health() -> dict:
    if not available():
        return {"available": False, "engine": "postgresql", "note": "no reachable server/driver"}
    cn = _owner(); cur = cn.cursor()
    cur.execute("SELECT count(*) FROM information_schema.schemata WHERE schema_name LIKE 'platform_%';")
    schemas = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema LIKE 'platform_%';")
    tables = cur.fetchone()[0]
    cur.execute("SELECT version();")
    ver = cur.fetchone()[0].split(",")[0]
    cn.close()
    return {"available": True, "engine": ver, "platform_schemas": schemas, "tables": tables}
