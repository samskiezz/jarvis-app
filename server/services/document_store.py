"""DOCUMENT STORE — durable, full-text-searchable storage for everything scraped.

The scraper used to keep only a 600-char excerpt in the graph node; the actual
downloaded content was discarded. This persists the FULL extracted text of every
fetched document, makes it searchable (SQLite FTS5), retrievable by id, and
exportable as a single gzipped snapshot so it survives an ephemeral container
(commit the snapshot; restore it on boot).

  * store(...)        — upsert a document's full text + provenance
  * get(doc_id)       — the full stored content
  * search(query, k)  — FTS5 full-text search with snippets
  * stats()           — counts / size
  * snapshot()/restore() — gzip the whole store to/from disk for persistence

Dedicated DB at env DOCUMENTS_DB (default server/data/documents.db) so it never
contends with brain.db. stdlib sqlite3 only; never raises.
"""

from __future__ import annotations

import gzip
import os
import shutil
import sqlite3
import time
from typing import Optional

_DEFAULT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "data", "documents.db")


def _db_path() -> str:
    return os.environ.get("DOCUMENTS_DB", _DEFAULT)


def _snapshot_path() -> str:
    return _db_path() + ".gz"


_SCHEMA = """
CREATE TABLE IF NOT EXISTS document (
    id TEXT PRIMARY KEY, url TEXT, source_name TEXT, host TEXT,
    http_status INTEGER, title TEXT, subject_id TEXT, fetched_at INTEGER,
    raw_bytes INTEGER, chars INTEGER, content_sha256 TEXT, full_text TEXT
);
CREATE INDEX IF NOT EXISTS ix_document_host ON document(host);
CREATE INDEX IF NOT EXISTS ix_document_subject ON document(subject_id);
CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
    title, full_text, content='document', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS document_ai AFTER INSERT ON document BEGIN
    INSERT INTO document_fts(rowid, title, full_text) VALUES (new.rowid, new.title, new.full_text);
END;
CREATE TRIGGER IF NOT EXISTS document_ad AFTER DELETE ON document BEGIN
    INSERT INTO document_fts(document_fts, rowid, title, full_text) VALUES('delete', old.rowid, old.title, old.full_text);
END;
CREATE TRIGGER IF NOT EXISTS document_au AFTER UPDATE ON document BEGIN
    INSERT INTO document_fts(document_fts, rowid, title, full_text) VALUES('delete', old.rowid, old.title, old.full_text);
    INSERT INTO document_fts(rowid, title, full_text) VALUES (new.rowid, new.title, new.full_text);
END;
"""


def _conn() -> sqlite3.Connection:
    path = _db_path()
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        try:
            os.makedirs(parent, exist_ok=True)
        except OSError:
            pass
    c = sqlite3.connect(path, check_same_thread=False)
    c.row_factory = sqlite3.Row
    try:
        c.execute("PRAGMA journal_mode=WAL")
    except sqlite3.Error:
        pass
    return c


def init_db() -> None:
    try:
        c = _conn()
        try:
            c.executescript(_SCHEMA)
            c.commit()
        finally:
            c.close()
    except sqlite3.Error:
        pass


def store(doc_id: str, *, url: str, full_text: str, title: str = "",
          source_name: str = "", host: str = "", http_status=None,
          subject_id: str = "", raw_bytes: int = 0, content_sha256: str = "") -> bool:
    """Persist a document's FULL text + provenance. Idempotent (REPLACE). Never raises."""
    if not doc_id:
        return False
    init_db()
    try:
        c = _conn()
        try:
            c.execute("DELETE FROM document WHERE id=?", (doc_id,))  # keep FTS in sync
            c.execute(
                "INSERT INTO document (id,url,source_name,host,http_status,title,subject_id,"
                "fetched_at,raw_bytes,chars,content_sha256,full_text) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (doc_id, url, source_name, host, http_status, title, subject_id,
                 int(time.time() * 1000), int(raw_bytes or 0), len(full_text or ""),
                 content_sha256, full_text or ""),
            )
            c.commit()
            return True
        finally:
            c.close()
    except sqlite3.Error:
        return False


def get(doc_id: str) -> Optional[dict]:
    """Full stored content + metadata for a document id. Never raises."""
    init_db()
    try:
        c = _conn()
        try:
            r = c.execute("SELECT * FROM document WHERE id=?", (doc_id,)).fetchone()
            return dict(r) if r else None
        finally:
            c.close()
    except sqlite3.Error:
        return None


def all_docs(limit: Optional[int] = None) -> list[dict]:
    """Return stored documents (id, url, title, full_text) for (re)indexing into the
    semantic vector store, newest first. ``limit`` caps the count. Never raises."""
    init_db()
    try:
        c = _conn()
        try:
            sql = "SELECT id, url, title, full_text FROM document ORDER BY fetched_at DESC"
            if limit:
                sql += f" LIMIT {int(limit)}"
            return [dict(r) for r in c.execute(sql).fetchall()]
        finally:
            c.close()
    except sqlite3.Error:
        return []


def search(query: str, k: int = 10) -> list[dict]:
    """FTS5 full-text search over the stored documents. Returns ranked hits with a
    highlighted snippet. Never raises."""
    q = (query or "").strip()
    if not q:
        return []
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute(
                "SELECT d.id, d.url, d.title, d.host, d.source_name, d.subject_id, "
                "snippet(document_fts, 1, '[', ']', ' … ', 16) AS snippet, "
                "bm25(document_fts) AS rank "
                "FROM document_fts JOIN document d ON d.rowid = document_fts.rowid "
                "WHERE document_fts MATCH ? ORDER BY rank LIMIT ?",
                (_fts_query(q), int(k)),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            c.close()
    except sqlite3.Error:
        return []


def _fts_query(q: str) -> str:
    # Make a safe OR query of the terms (avoids FTS5 syntax errors on punctuation).
    import re
    terms = [t for t in re.split(r"[^A-Za-z0-9]+", q) if len(t) >= 2][:12]
    return " OR ".join(terms) if terms else '""'


def stats() -> dict:
    init_db()
    try:
        c = _conn()
        try:
            n = c.execute("SELECT COUNT(*) FROM document").fetchone()[0]
            chars = c.execute("SELECT COALESCE(SUM(chars),0) FROM document").fetchone()[0]
            hosts = c.execute("SELECT COUNT(DISTINCT host) FROM document").fetchone()[0]
            return {"documents": n, "total_chars": chars, "distinct_hosts": hosts,
                    "db": _db_path(), "snapshot": _snapshot_path()}
        finally:
            c.close()
    except sqlite3.Error:
        return {"documents": 0}


# ── persistence: one gzipped snapshot survives an ephemeral container ─────────────
def snapshot() -> dict:
    """Gzip the whole store to documents.db.gz (commit this for durability)."""
    init_db()
    src = _db_path()
    try:
        c = _conn()
        try:
            c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        finally:
            c.close()
        with open(src, "rb") as f_in, gzip.open(_snapshot_path(), "wb", compresslevel=6) as f_out:
            shutil.copyfileobj(f_in, f_out)
        return {"ok": True, "snapshot": _snapshot_path(),
                "bytes": os.path.getsize(_snapshot_path())}
    except OSError as e:
        return {"ok": False, "error": str(e)}


def restore() -> dict:
    """Restore the store from documents.db.gz if the live DB is missing/empty."""
    snap = _snapshot_path()
    if not os.path.isfile(snap):
        return {"ok": False, "error": "no snapshot"}
    try:
        if os.path.isfile(_db_path()) and os.path.getsize(_db_path()) > 4096:
            return {"ok": True, "skipped": "live db present"}
        with gzip.open(snap, "rb") as f_in, open(_db_path(), "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        return {"ok": True, "restored_from": snap, "stats": stats()}
    except OSError as e:
        return {"ok": False, "error": str(e)}
