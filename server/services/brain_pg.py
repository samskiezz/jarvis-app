"""BRAIN_PG — a real PostgreSQL-backed data-access layer for the "second brain".

This is the production Postgres path for the second-brain note store: notes,
note-to-note links, and embeddings. Every call executes real SQL via psycopg2
against a live server (env ``PLATFORM_PG_DSN``, default localhost).

Honesty: the default live brain is still SQLite (``second_brain``). This DAO is
used when a Postgres is available. It degrades cleanly — it never raises on a
connection/driver failure; instead each call returns a falsy/empty value and
``available()`` reports False so callers can fall back to SQLite.

Schema (all created with IF NOT EXISTS so concurrent creation is safe)::

    CREATE SCHEMA IF NOT EXISTS brain_pg;
    brain_pg.note(id PK, kind, title, body_md, frontmatter jsonb,
                  confidence real, created_ts bigint, updated_ts bigint)
    brain_pg.note_link(src, dst, kind DEFAULT 'wikilink', PK(src,dst,kind))
    brain_pg.embedding(note_id PK, dim int, vec bytea)

Requires psycopg2 (installed wherever Postgres runs). stdlib + psycopg2 only.
"""

from __future__ import annotations

import json
import os
import time

try:
    import psycopg2
    import psycopg2.extras
except Exception:  # noqa: BLE001 - driver may be absent
    psycopg2 = None  # type: ignore


_DSN = os.environ.get(
    "PLATFORM_PG_DSN",
    "host=127.0.0.1 user=platform password=platform dbname=platform",
)


# --------------------------------------------------------------------------- #
# connection helpers
# --------------------------------------------------------------------------- #
def _connect():
    """Open an autocommit connection, or return None on any failure."""
    if psycopg2 is None:
        return None
    try:
        cn = psycopg2.connect(_DSN, connect_timeout=3)
        cn.autocommit = True
        return cn
    except Exception:  # noqa: BLE001
        return None


def available() -> bool:
    """True iff the psycopg2 driver is present and the server is reachable."""
    if psycopg2 is None:
        return False
    try:
        cn = psycopg2.connect(_DSN, connect_timeout=2)
        cn.close()
        return True
    except Exception:  # noqa: BLE001
        return False


_DDL = (
    "CREATE SCHEMA IF NOT EXISTS brain_pg;",
    "CREATE TABLE IF NOT EXISTS brain_pg.note ("
    "id text PRIMARY KEY, kind text, title text, body_md text, "
    "frontmatter jsonb DEFAULT '{}', confidence real DEFAULT 0.5, "
    "created_ts bigint, updated_ts bigint);",
    "CREATE TABLE IF NOT EXISTS brain_pg.note_link ("
    "src text, dst text, kind text DEFAULT 'wikilink', "
    "PRIMARY KEY (src,dst,kind));",
    "CREATE TABLE IF NOT EXISTS brain_pg.embedding ("
    "note_id text PRIMARY KEY, dim int, vec bytea);",
)


def init_db() -> bool:
    """Create the schema + tables (idempotent). False if Postgres unreachable."""
    cn = _connect()
    if cn is None:
        return False
    try:
        cur = cn.cursor()
        for stmt in _DDL:
            cur.execute(stmt)
        cn.close()
        return True
    except Exception:  # noqa: BLE001
        try:
            cn.close()
        except Exception:  # noqa: BLE001
            pass
        return False


# --------------------------------------------------------------------------- #
# notes
# --------------------------------------------------------------------------- #
def upsert_note(
    id: str,
    kind: str,
    title: str,
    body_md: str,
    frontmatter: dict | None = None,
    confidence: float = 0.5,
) -> str | None:
    """Insert or update a note. Returns the note id, or None on failure.

    ``created_ts`` is preserved across updates; ``updated_ts`` is always bumped.
    """
    cn = _connect()
    if cn is None:
        return None
    try:
        now = int(time.time())
        fm = json.dumps(frontmatter or {})
        cur = cn.cursor()
        cur.execute(
            "INSERT INTO brain_pg.note "
            "(id, kind, title, body_md, frontmatter, confidence, created_ts, updated_ts) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (id) DO UPDATE SET "
            "kind=EXCLUDED.kind, title=EXCLUDED.title, body_md=EXCLUDED.body_md, "
            "frontmatter=EXCLUDED.frontmatter, confidence=EXCLUDED.confidence, "
            "updated_ts=EXCLUDED.updated_ts",
            (id, kind, title, body_md, fm, confidence, now, now),
        )
        cn.close()
        return id
    except Exception:  # noqa: BLE001
        try:
            cn.close()
        except Exception:  # noqa: BLE001
            pass
        return None


def get_note(id_or_title: str) -> dict | None:
    """Fetch a note by exact id, falling back to exact title. None if absent."""
    cn = _connect()
    if cn is None:
        return None
    try:
        cur = cn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, kind, title, body_md, frontmatter, confidence, "
            "created_ts, updated_ts FROM brain_pg.note WHERE id=%s",
            (id_or_title,),
        )
        row = cur.fetchone()
        if row is None:
            cur.execute(
                "SELECT id, kind, title, body_md, frontmatter, confidence, "
                "created_ts, updated_ts FROM brain_pg.note WHERE title=%s "
                "ORDER BY updated_ts DESC LIMIT 1",
                (id_or_title,),
            )
            row = cur.fetchone()
        cn.close()
        return dict(row) if row is not None else None
    except Exception:  # noqa: BLE001
        try:
            cn.close()
        except Exception:  # noqa: BLE001
            pass
        return None


def list_notes(kind: str | None = None, limit: int = 100) -> list[dict]:
    """List notes (optionally filtered by kind), newest first. [] on failure."""
    cn = _connect()
    if cn is None:
        return []
    try:
        cur = cn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if kind is not None:
            cur.execute(
                "SELECT id, kind, title, body_md, frontmatter, confidence, "
                "created_ts, updated_ts FROM brain_pg.note WHERE kind=%s "
                "ORDER BY updated_ts DESC LIMIT %s",
                (kind, limit),
            )
        else:
            cur.execute(
                "SELECT id, kind, title, body_md, frontmatter, confidence, "
                "created_ts, updated_ts FROM brain_pg.note "
                "ORDER BY updated_ts DESC LIMIT %s",
                (limit,),
            )
        rows = [dict(r) for r in cur.fetchall()]
        cn.close()
        return rows
    except Exception:  # noqa: BLE001
        try:
            cn.close()
        except Exception:  # noqa: BLE001
            pass
        return []


def count_notes() -> int:
    """Total number of notes. 0 on failure."""
    cn = _connect()
    if cn is None:
        return 0
    try:
        cur = cn.cursor()
        cur.execute("SELECT count(*) FROM brain_pg.note;")
        n = cur.fetchone()[0]
        cn.close()
        return int(n)
    except Exception:  # noqa: BLE001
        try:
            cn.close()
        except Exception:  # noqa: BLE001
            pass
        return 0


# --------------------------------------------------------------------------- #
# links
# --------------------------------------------------------------------------- #
def add_link(src: str, dst: str, kind: str = "wikilink") -> bool:
    """Add a directed note link (idempotent). False on failure."""
    cn = _connect()
    if cn is None:
        return False
    try:
        cur = cn.cursor()
        cur.execute(
            "INSERT INTO brain_pg.note_link (src, dst, kind) VALUES (%s,%s,%s) "
            "ON CONFLICT (src,dst,kind) DO NOTHING",
            (src, dst, kind),
        )
        cn.close()
        return True
    except Exception:  # noqa: BLE001
        try:
            cn.close()
        except Exception:  # noqa: BLE001
            pass
        return False


def count_links() -> int:
    """Total number of note links. 0 on failure."""
    cn = _connect()
    if cn is None:
        return 0
    try:
        cur = cn.cursor()
        cur.execute("SELECT count(*) FROM brain_pg.note_link;")
        n = cur.fetchone()[0]
        cn.close()
        return int(n)
    except Exception:  # noqa: BLE001
        try:
            cn.close()
        except Exception:  # noqa: BLE001
            pass
        return 0
