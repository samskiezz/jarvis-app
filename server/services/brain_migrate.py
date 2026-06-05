"""SQLite -> PostgreSQL migrator for the SECOND BRAIN store.

Bulk-copies the ``note`` and ``note_link`` tables out of the SQLite brain
(``server/data/brain.db`` by default, see ``second_brain.py``) into a Postgres
schema (default ``brain_pg``), using ``INSERT ... ON CONFLICT DO NOTHING`` so the
migration is fully idempotent: running it twice migrates the same rows but the
second run inserts nothing.

Design rules:
  * stdlib + ``psycopg2`` only.
  * Robust column mapping: the SQLite source is read by column *name*, and any
    column that is missing is filled with a sensible default, so a slightly
    different SQLite schema still migrates.
  * The target schema is injectable so tests run against a throwaway schema and
    never touch the real ``brain_pg``.

Postgres target schema (created IF NOT EXISTS):

    CREATE SCHEMA IF NOT EXISTS <schema>;
    CREATE TABLE IF NOT EXISTS <schema>.note (
        id text PRIMARY KEY, kind text, title text, body_md text,
        frontmatter jsonb DEFAULT '{}', confidence real DEFAULT 0.5,
        created_ts bigint, updated_ts bigint);
    CREATE TABLE IF NOT EXISTS <schema>.note_link (
        src text, dst text, kind text DEFAULT 'wikilink',
        PRIMARY KEY (src, dst, kind));

Column mapping SQLite -> Postgres:
  note:      id->id, kind->kind, title->title, body_md->body_md,
             frontmatter_json(text json)->frontmatter(jsonb),
             confidence->confidence, created_ts->created_ts, updated_ts->updated_ts
  note_link: src_id->src, dst_title->dst, relation->kind
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
from typing import Any, Optional

try:  # psycopg2 is the only third-party dep
    import psycopg2
    from psycopg2.extras import execute_values
    _HAVE_PG = True
except Exception:  # noqa: BLE001
    psycopg2 = None  # type: ignore
    execute_values = None  # type: ignore
    _HAVE_PG = False

# ── config ──────────────────────────────────────────────────────────────────────
_DEFAULT_SQLITE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "brain.db"
)

# Postgres DSN: env override, else the live platform DB.
_DEFAULT_DSN = os.environ.get(
    "BRAIN_PG_DSN",
    "host=127.0.0.1 user=platform password=platform dbname=platform",
)

# Only allow a sane schema name (we interpolate it into DDL).
_SCHEMA_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def available() -> bool:
    """True if psycopg2 is importable AND the target Postgres is reachable."""
    if not _HAVE_PG:
        return False
    try:
        conn = psycopg2.connect(_DEFAULT_DSN)
        conn.close()
        return True
    except Exception:  # noqa: BLE001
        return False


def _connect_pg(dsn: Optional[str] = None):
    if not _HAVE_PG:
        raise RuntimeError("psycopg2 is not available")
    return psycopg2.connect(dsn or _DEFAULT_DSN)


def _safe_schema(schema: str) -> str:
    schema = str(schema or "brain_pg").strip()
    if not _SCHEMA_RE.match(schema):
        raise ValueError(f"invalid target schema name: {schema!r}")
    return schema


def _ddl(schema: str) -> str:
    return f"""
CREATE SCHEMA IF NOT EXISTS {schema};
CREATE TABLE IF NOT EXISTS {schema}.note (
    id text PRIMARY KEY,
    kind text,
    title text,
    body_md text,
    frontmatter jsonb DEFAULT '{{}}',
    confidence real DEFAULT 0.5,
    created_ts bigint,
    updated_ts bigint
);
CREATE TABLE IF NOT EXISTS {schema}.note_link (
    src text,
    dst text,
    kind text DEFAULT 'wikilink',
    PRIMARY KEY (src, dst, kind)
);
"""


# ── SQLite reading helpers ──────────────────────────────────────────────────────
def _sqlite_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    try:
        return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
    except sqlite3.Error:
        return set()


def _norm_frontmatter(raw: Any) -> str:
    """Normalize a SQLite frontmatter value into a JSON text suitable for jsonb."""
    if raw is None or raw == "":
        return "{}"
    if isinstance(raw, (dict, list)):
        try:
            return json.dumps(raw, default=str)
        except (TypeError, ValueError):
            return "{}"
    text = str(raw)
    try:
        json.loads(text)  # validate
        return text
    except (TypeError, ValueError):
        return "{}"


def _num(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _int(value: Any, default: Optional[int] = None) -> Optional[int]:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _read_notes(conn: sqlite3.Connection) -> list[tuple]:
    """Read notes mapped to PG column order:
    (id, kind, title, body_md, frontmatter, confidence, created_ts, updated_ts)."""
    cols = _sqlite_columns(conn, "note")
    if not cols or "id" not in cols:
        return []
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM note").fetchall()
    out: list[tuple] = []
    for r in rows:
        d = dict(r)
        nid = d.get("id")
        if nid is None:
            continue
        out.append(
            (
                str(nid),
                d.get("kind") if "kind" in cols else None,
                d.get("title") if "title" in cols else None,
                d.get("body_md") if "body_md" in cols else None,
                _norm_frontmatter(d.get("frontmatter_json") if "frontmatter_json" in cols else None),
                _num(d.get("confidence"), 0.5) if "confidence" in cols else 0.5,
                _int(d.get("created_ts")) if "created_ts" in cols else None,
                _int(d.get("updated_ts")) if "updated_ts" in cols else None,
            )
        )
    return out


def _read_links(conn: sqlite3.Connection) -> list[tuple]:
    """Read links mapped to PG column order (src, dst, kind).

    SQLite ``note_link`` is (src_id, dst_title, dst_id, relation). We map
    src=src_id, dst=dst_title (falling back to dst_id), kind=relation.
    De-duplicate on the PG primary key (src, dst, kind) so the batched
    ON CONFLICT does not collide within a single VALUES list.
    """
    cols = _sqlite_columns(conn, "note_link")
    if not cols:
        return []
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM note_link").fetchall()
    seen: set[tuple] = set()
    out: list[tuple] = []
    for r in rows:
        d = dict(r)
        src = d.get("src_id") if "src_id" in cols else d.get("src")
        dst = None
        if "dst_title" in cols and d.get("dst_title"):
            dst = d.get("dst_title")
        elif "dst_id" in cols and d.get("dst_id"):
            dst = d.get("dst_id")
        elif "dst" in cols:
            dst = d.get("dst")
        kind = d.get("relation") if "relation" in cols else d.get("kind")
        if src is None or dst is None:
            continue
        kind = str(kind) if kind not in (None, "") else "wikilink"
        key = (str(src), str(dst), kind)
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


# ── public API ──────────────────────────────────────────────────────────────────
def migrate(
    sqlite_path: Optional[str] = None,
    target_schema: str = "brain_pg",
    batch: int = 500,
    *,
    dsn: Optional[str] = None,
) -> dict:
    """Bulk-copy notes + links from the SQLite brain into Postgres.

    Idempotent (``INSERT ... ON CONFLICT DO NOTHING``). Returns::

        {notes_migrated, links_migrated, notes_total, links_total}

    where ``*_migrated`` is the number of rows actually inserted this run (0 on a
    repeat run) and ``*_total`` is the number of source rows read from SQLite.
    """
    sqlite_path = sqlite_path or _DEFAULT_SQLITE
    schema = _safe_schema(target_schema)
    try:
        batch = max(1, int(batch))
    except (TypeError, ValueError):
        batch = 500

    sconn = sqlite3.connect(sqlite_path)
    try:
        notes = _read_notes(sconn)
        links = _read_links(sconn)
    finally:
        sconn.close()

    notes_migrated = 0
    links_migrated = 0

    pg = _connect_pg(dsn)
    try:
        with pg:
            with pg.cursor() as cur:
                cur.execute(_ddl(schema))

                note_sql = (
                    f"INSERT INTO {schema}.note "
                    f"(id, kind, title, body_md, frontmatter, confidence, created_ts, updated_ts) "
                    f"VALUES %s ON CONFLICT (id) DO NOTHING"
                )
                for i in range(0, len(notes), batch):
                    chunk = notes[i : i + batch]
                    execute_values(cur, note_sql, chunk, page_size=batch)
                    notes_migrated += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0

                link_sql = (
                    f"INSERT INTO {schema}.note_link (src, dst, kind) "
                    f"VALUES %s ON CONFLICT (src, dst, kind) DO NOTHING"
                )
                for i in range(0, len(links), batch):
                    chunk = links[i : i + batch]
                    execute_values(cur, link_sql, chunk, page_size=batch)
                    links_migrated += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
    finally:
        pg.close()

    return {
        "notes_migrated": int(notes_migrated),
        "links_migrated": int(links_migrated),
        "notes_total": len(notes),
        "links_total": len(links),
    }
