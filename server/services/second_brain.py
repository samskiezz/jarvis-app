"""SECOND BRAIN — a living, AI-first knowledge vault (the real-store answer to
markdown-only "obsidian-second-brain" repos).

Where the markdown vaults give you wikilinked ``.md`` files + frontmatter + daily
notes + a hand-maintained ``index.md`` catalog and ``log.md`` timeline, this is
the SAME mental model backed by a *real* store:

  * ``note``       — every page (entity/concept/project/daily/log/synthesis/
                     decision/task) with frontmatter JSON, markdown body, a
                     confidence, and **bi-temporal** timestamps:
                       - ``created_ts``  — when the note was first made.
                       - ``learned_ts``  — when this fact became known (the
                         "when-learned" of bi-temporal facts; defaults to
                         created_ts but can be set independently).
                       - ``updated_ts``  — last write.
  * ``note_link``  — the resolved ``[[wikilinks]]`` parsed out of each body, with
                     the destination title and (once it exists) the destination id.

Every upserted note is ALSO mirrored into the ontology graph
(``ontology_store.upsert_object`` + ``upsert_link`` per wikilink) and indexed for
semantic search (``embeddings.index_doc``), so the vault feeds the existing graph
and vector search for free. Audit writes are recorded via ``audit.record``.

Design rules (mirrors ``history_lake.py`` / ``ontology_store.py``):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL + idempotent writes.
  * never raise on normal use — every public function degrades gracefully and
    returns a sensible empty/None value on error.
  * reuse ontology_store / embeddings / audit, degrading gracefully if any import
    fails.

DB path comes from the env var ``BRAIN_DB`` (default ``server/data/brain.db``).
Tests pass an explicit temp path via the env var.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import time
import uuid
from typing import Any, Optional

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "brain.db"
)

# Valid note kinds (kept liberal — anything else degrades to 'concept').
KINDS = ("entity", "concept", "project", "daily", "log", "synthesis", "decision", "task")

_WIKILINK_RE = re.compile(r"\[\[([^\[\]|]+?)(?:\|[^\[\]]*)?\]\]")


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``BRAIN_DB`` (or pass
    ``db_path=`` explicitly) before the first connection."""
    return os.environ.get("BRAIN_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, default=str)
    except (TypeError, ValueError):
        return "{}"


def _loads(text: Optional[str]) -> Any:
    if not text:
        return {}
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return {}


def _norm_kind(kind: Optional[str]) -> str:
    k = str(kind or "concept").strip().lower()
    return k if k in KINDS else "concept"


def _note_id(kind: str, title: str) -> str:
    """Deterministic id from (kind, title) so re-upserting the same titled note
    resolves to the same row without a lookup race."""
    return uuid.uuid5(uuid.NAMESPACE_URL, f"brain|{kind}|{title.strip().lower()}").hex


def parse_wikilinks(body: str) -> list[str]:
    """Extract ``[[Target]]`` / ``[[Target|alias]]`` destination titles from a
    markdown body, de-duplicated preserving order. Never raises."""
    out: list[str] = []
    seen: set[str] = set()
    try:
        for m in _WIKILINK_RE.finditer(str(body or "")):
            title = m.group(1).strip()
            key = title.lower()
            if title and key not in seen:
                seen.add(key)
                out.append(title)
    except Exception:  # noqa: BLE001 - never raise
        return out
    return out


# ── Schema (idempotent) ──────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS note (
    id              TEXT PRIMARY KEY,
    kind            TEXT NOT NULL DEFAULT 'concept',
    title           TEXT NOT NULL,
    frontmatter_json TEXT NOT NULL DEFAULT '{}',
    body_md         TEXT NOT NULL DEFAULT '',
    confidence      REAL NOT NULL DEFAULT 1.0,
    created_ts      INTEGER NOT NULL,
    learned_ts      INTEGER NOT NULL,
    updated_ts      INTEGER NOT NULL,
    UNIQUE (kind, title)
);
CREATE INDEX IF NOT EXISTS ix_note_kind ON note (kind);
CREATE INDEX IF NOT EXISTS ix_note_title ON note (title);
CREATE INDEX IF NOT EXISTS ix_note_updated ON note (updated_ts);

CREATE TABLE IF NOT EXISTS note_link (
    src_id    TEXT NOT NULL,
    dst_title TEXT NOT NULL,
    dst_id    TEXT,
    relation  TEXT NOT NULL DEFAULT 'LINKS_TO',
    PRIMARY KEY (src_id, dst_title, relation)
);
CREATE INDEX IF NOT EXISTS ix_link_src ON note_link (src_id);
CREATE INDEX IF NOT EXISTS ix_link_dst_title ON note_link (dst_title);
CREATE INDEX IF NOT EXISTS ix_link_dst_id ON note_link (dst_id);
"""


# ── Connection management (mirrors the other stores) ───────────────────────────────
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
    """Create all tables/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── row mapping ────────────────────────────────────────────────────────────────────
def _row_to_note(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "kind": r["kind"],
        "title": r["title"],
        "frontmatter": _loads(r["frontmatter_json"]),
        "body_md": r["body_md"],
        "confidence": r["confidence"],
        "created_ts": r["created_ts"],
        "learned_ts": r["learned_ts"],
        "updated_ts": r["updated_ts"],
    }


# ── graceful reuse of sibling services ──────────────────────────────────────────────
def _mirror_to_ontology(note: dict, wikilinks: list[str], db_path: Optional[str]) -> None:
    """Mirror a note into the ontology graph: upsert the note as an object and a
    LINKS_TO link for each wikilink (creating a placeholder object for unresolved
    targets so the edge is real). Degrades silently if the import/store fails."""
    try:
        from . import ontology_store
    except Exception:  # noqa: BLE001
        return
    try:
        ontology_store.upsert_object(
            {
                "id": note["id"],
                "type": note["kind"],
                "label": note["title"],
                "props": {
                    "source": "second_brain",
                    "confidence": note.get("confidence"),
                    "learned_ts": note.get("learned_ts"),
                },
            }
        )
        for title in wikilinks:
            dst = get_note(title, db_path=db_path)
            dst_id = dst["id"] if dst else _note_id("concept", title)
            if dst is None:
                # placeholder so the edge points at a real object node
                ontology_store.upsert_object(
                    {"id": dst_id, "type": "concept", "label": title,
                     "props": {"source": "second_brain", "placeholder": True}}
                )
            ontology_store.upsert_link(note["id"], dst_id, "LINKS_TO")
    except Exception:  # noqa: BLE001 - mirroring must never break a write
        pass


def _index_note(note: dict) -> None:
    """Index a note's title + body for semantic search. Degrades silently."""
    try:
        from . import embeddings
    except Exception:  # noqa: BLE001
        return
    try:
        text = f"{note.get('title', '')}\n{note.get('body_md', '')}"
        embeddings.index_doc(
            note["id"],
            f"brain:{note.get('kind', 'concept')}",
            text,
            {"title": note.get("title"), "kind": note.get("kind")},
        )
    except Exception:  # noqa: BLE001
        pass


def _audit(action: str, note: dict, actor: Optional[str] = None) -> None:
    try:
        from . import audit
    except Exception:  # noqa: BLE001
        return
    try:
        audit.record(
            actor or "second_brain",
            action,
            f"note:{note.get('id')}",
            {"kind": note.get("kind"), "title": note.get("title")},
        )
    except Exception:  # noqa: BLE001
        pass


# ── link resolution ─────────────────────────────────────────────────────────────────
def _replace_links(conn: sqlite3.Connection, src_id: str, wikilinks: list[str]) -> None:
    """Rewrite the note_link rows for a source note from its current wikilinks,
    resolving dst_id when a note with that title already exists."""
    conn.execute("DELETE FROM note_link WHERE src_id=?", (src_id,))
    for title in wikilinks:
        row = conn.execute(
            "SELECT id FROM note WHERE title=? COLLATE NOCASE LIMIT 1", (title,)
        ).fetchone()
        dst_id = row["id"] if row else None
        conn.execute(
            """
            INSERT INTO note_link (src_id, dst_title, dst_id, relation)
            VALUES (?,?,?, 'LINKS_TO')
            ON CONFLICT(src_id, dst_title, relation) DO UPDATE SET dst_id=excluded.dst_id
            """,
            (src_id, title, dst_id),
        )


def _resolve_dangling(conn: sqlite3.Connection, title: str, note_id: str) -> None:
    """When a note titled ``title`` is (re)created, back-fill dst_id on any
    existing link rows that were waiting for it."""
    conn.execute(
        "UPDATE note_link SET dst_id=? WHERE dst_id IS NULL AND dst_title=? COLLATE NOCASE",
        (note_id, title),
    )


# ── core upsert ──────────────────────────────────────────────────────────────────────
def upsert_note(
    kind: str,
    title: str,
    body_md: str = "",
    frontmatter: Optional[dict] = None,
    confidence: Optional[float] = None,
    *,
    learned_ts: Optional[int] = None,
    actor: Optional[str] = None,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Create or update a note (idempotent on ``(kind, title)``).

    Parses ``[[wikilinks]]`` from the body and (re)writes the ``note_link`` rows,
    auto-resolving ``dst_id`` when a note with that title exists; also back-fills
    any previously-dangling links that point at this note's title. Mirrors the
    note into the ontology graph and indexes it for semantic search. Returns the
    stored note dict or None on error.
    """
    title = str(title or "").strip()
    if not title:
        return None
    kind = _norm_kind(kind)
    nid = _note_id(kind, title)
    now = _now_ms()
    wikilinks = parse_wikilinks(body_md)
    try:
        conf = float(confidence) if confidence is not None else None
    except (TypeError, ValueError):
        conf = None
    try:
        conn = _connect(db_path)
        try:
            init_db(db_path)
            existing = conn.execute("SELECT * FROM note WHERE id=?", (nid,)).fetchone()
            if existing is None:
                created = now
                lts = int(learned_ts) if learned_ts is not None else now
                conn.execute(
                    """
                    INSERT INTO note (id, kind, title, frontmatter_json, body_md,
                                      confidence, created_ts, learned_ts, updated_ts)
                    VALUES (?,?,?,?,?,?,?,?,?)
                    """,
                    (nid, kind, title, _dumps(frontmatter or {}), str(body_md or ""),
                     conf if conf is not None else 1.0, created, lts, now),
                )
            else:
                cur = _row_to_note(existing)
                fm = dict(cur["frontmatter"])
                if isinstance(frontmatter, dict):
                    fm.update(frontmatter)
                lts = int(learned_ts) if learned_ts is not None else cur["learned_ts"]
                conn.execute(
                    """
                    UPDATE note SET kind=?, title=?, frontmatter_json=?, body_md=?,
                                    confidence=?, learned_ts=?, updated_ts=?
                    WHERE id=?
                    """,
                    (kind, title, _dumps(fm), str(body_md or ""),
                     conf if conf is not None else cur["confidence"], lts, now, nid),
                )
            _replace_links(conn, nid, wikilinks)
            _resolve_dangling(conn, title, nid)
            conn.commit()
            row = conn.execute("SELECT * FROM note WHERE id=?", (nid,)).fetchone()
            note = _row_to_note(row) if row else None
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None

    if note is not None:
        note["wikilinks"] = wikilinks
        _mirror_to_ontology(note, wikilinks, db_path)
        _index_note(note)
        _audit("upsert_note", note, actor)
    return note


# ── reads ──────────────────────────────────────────────────────────────────────────
def get_note(id_or_title: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch a note by id, or by title (case-insensitive) if no id matches."""
    if not id_or_title:
        return None
    key = str(id_or_title)
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute("SELECT * FROM note WHERE id=?", (key,)).fetchone()
            if r is None:
                r = conn.execute(
                    "SELECT * FROM note WHERE title=? COLLATE NOCASE ORDER BY updated_ts DESC LIMIT 1",
                    (key,),
                ).fetchone()
            return _row_to_note(r) if r else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def list_notes(
    kind: Optional[str] = None,
    q: Optional[str] = None,
    limit: Optional[int] = None,
    *,
    db_path: Optional[str] = None,
) -> list[dict]:
    """List notes, optionally filtered by ``kind`` and a free-text ``q`` (matched
    against title + body), newest-updated first. ``limit`` caps the result."""
    try:
        conn = _connect(db_path)
        try:
            sql = "SELECT * FROM note"
            clauses: list[str] = []
            args: list[Any] = []
            if kind:
                clauses.append("kind=?")
                args.append(_norm_kind(kind))
            if q:
                clauses.append("(title LIKE ? OR body_md LIKE ?)")
                like = f"%{q}%"
                args.extend([like, like])
            if clauses:
                sql += " WHERE " + " AND ".join(clauses)
            sql += " ORDER BY updated_ts DESC"
            if limit is not None:
                sql += " LIMIT ?"
                args.append(int(limit))
            rows = conn.execute(sql, args).fetchall()
            return [_row_to_note(r) for r in rows]
        finally:
            conn.close()
    except (sqlite3.Error, ValueError):
        return []


def delete_note(id_or_title: str, *, db_path: Optional[str] = None) -> bool:
    """Delete a note (by id or title) and its outgoing links; clears dst_id on any
    inbound links so they become dangling again. Returns True if a row was removed."""
    note = get_note(id_or_title, db_path=db_path)
    if note is None:
        return False
    nid = note["id"]
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute("DELETE FROM note WHERE id=?", (nid,))
            conn.execute("DELETE FROM note_link WHERE src_id=?", (nid,))
            conn.execute("UPDATE note_link SET dst_id=NULL WHERE dst_id=?", (nid,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except sqlite3.Error:
        return False


def backlinks(title: str, *, db_path: Optional[str] = None) -> list[dict]:
    """Notes that link TO ``title`` (the inbound wikilinks). Returns the source
    note dicts, newest-updated first."""
    if not title:
        return []
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                """
                SELECT n.* FROM note_link l
                JOIN note n ON n.id = l.src_id
                WHERE l.dst_title=? COLLATE NOCASE
                ORDER BY n.updated_ts DESC
                """,
                (str(title),),
            ).fetchall()
            return [_row_to_note(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def links_of(note_id: str, *, db_path: Optional[str] = None) -> list[dict]:
    """The outgoing links of a note: ``[{dst_title, dst_id, relation}, ...]``."""
    if not note_id:
        return []
    nid = note_id
    note = get_note(note_id, db_path=db_path)
    if note:
        nid = note["id"]
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT src_id, dst_title, dst_id, relation FROM note_link WHERE src_id=? ORDER BY dst_title",
                (nid,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── zero-friction capture ────────────────────────────────────────────────────────────
def _auto_title(text: str) -> str:
    """Derive a title from free text: the first non-empty line, trimmed to a
    sensible length, stripped of markdown heading markers."""
    for line in str(text or "").splitlines():
        line = line.strip().lstrip("#").strip()
        if line:
            words = line.split()
            title = " ".join(words[:12])
            return (title[:120]).rstrip()
    return "Untitled " + time.strftime("%Y-%m-%d %H:%M", time.gmtime())


def capture(text: str, *, actor: Optional[str] = None, db_path: Optional[str] = None) -> Optional[dict]:
    """Zero-friction capture: store ``text`` as a ``concept`` note with an
    auto-derived title (first line / nlp-lite). Returns the note."""
    text = str(text or "").strip()
    if not text:
        return None
    title = _auto_title(text)
    return upsert_note(
        "concept", title, text,
        frontmatter={"captured": True},
        confidence=0.7,
        actor=actor,
        db_path=db_path,
    )


# ── daily notes ────────────────────────────────────────────────────────────────────────
def _today() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def daily(date: Optional[str] = None, *, actor: Optional[str] = None, db_path: Optional[str] = None) -> Optional[dict]:
    """Create or get the daily note for ``date`` (default today, UTC), titled
    ``YYYY-MM-DD`` with kind=daily."""
    d = str(date).strip() if date else _today()
    existing = get_note(d, db_path=db_path)
    if existing is not None and existing["kind"] == "daily":
        return existing
    return upsert_note("daily", d, f"# {d}\n", frontmatter={"date": d}, actor=actor, db_path=db_path)


def daily_append(text: str, date: Optional[str] = None, *, actor: Optional[str] = None, db_path: Optional[str] = None) -> Optional[dict]:
    """Append a timestamped entry to a daily note (creating it if needed)."""
    note = daily(date, actor=actor, db_path=db_path)
    if note is None:
        return None
    stamp = time.strftime("%H:%M", time.gmtime())
    body = (note.get("body_md") or "") + f"\n- {stamp} {str(text or '').strip()}\n"
    return upsert_note(
        "daily", note["title"], body,
        frontmatter=note.get("frontmatter"),
        actor=actor, db_path=db_path,
    )


# ── timeline / log ───────────────────────────────────────────────────────────────────
def log_session(summary: str, links: Optional[list[str]] = None, *, actor: Optional[str] = None, db_path: Optional[str] = None) -> Optional[dict]:
    """Append a ``log`` note to the timeline. ``summary`` is the body; ``links`` is
    an optional list of titles to wikilink (appended as ``[[title]]`` references)."""
    summary = str(summary or "").strip()
    if not summary:
        return None
    stamp = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
    title = f"log {stamp} {uuid.uuid4().hex[:6]}"
    body = summary
    if links:
        refs = " ".join(f"[[{str(t).strip()}]]" for t in links if str(t).strip())
        if refs:
            body += "\n\n" + refs
    return upsert_note("log", title, body, frontmatter={"ts": stamp}, actor=actor, db_path=db_path)


def timeline(limit: int = 50, *, db_path: Optional[str] = None) -> list[dict]:
    """Recent log + daily notes (the ``log.md`` equivalent), newest first."""
    try:
        lim = max(1, int(limit))
    except (TypeError, ValueError):
        lim = 50
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM note WHERE kind IN ('log','daily') ORDER BY updated_ts DESC LIMIT ?",
                (lim,),
            ).fetchall()
            return [_row_to_note(r) for r in rows]
        finally:
            conn.close()
    except (sqlite3.Error, ValueError):
        return []


# ── catalog (the index.md equivalent) ─────────────────────────────────────────────────
def index_catalog(*, db_path: Optional[str] = None) -> dict:
    """The ``index.md`` catalog: counts per kind, recent notes, and orphans
    (notes with no links in OR out). Empty store → zeros / empty lists."""
    empty = {"total": 0, "counts": {}, "recent": [], "orphans": []}
    try:
        conn = _connect(db_path)
        try:
            counts: dict[str, int] = {}
            total = 0
            for r in conn.execute("SELECT kind, COUNT(*) AS n FROM note GROUP BY kind").fetchall():
                counts[r["kind"]] = int(r["n"])
                total += int(r["n"])

            recent = [
                _row_to_note(r)
                for r in conn.execute(
                    "SELECT * FROM note ORDER BY updated_ts DESC LIMIT 10"
                ).fetchall()
            ]

            # orphans: no outgoing link (src) and no incoming link (dst by title or id)
            orphans = [
                _row_to_note(r)
                for r in conn.execute(
                    """
                    SELECT n.* FROM note n
                    WHERE NOT EXISTS (SELECT 1 FROM note_link l WHERE l.src_id = n.id)
                      AND NOT EXISTS (
                          SELECT 1 FROM note_link l
                          WHERE l.dst_id = n.id
                             OR l.dst_title = n.title COLLATE NOCASE
                      )
                    ORDER BY n.updated_ts DESC
                    """
                ).fetchall()
            ]
            return {"total": total, "counts": counts, "recent": recent, "orphans": orphans}
        finally:
            conn.close()
    except sqlite3.Error:
        return empty


# Bootstrap the default DB on import so the first request finds the tables.
init_db()
