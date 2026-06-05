"""PG_EMBEDDINGS — a real PostgreSQL-backed embedding store + cosine search.

Stores embedding vectors (produced by ``embeddings.embed``) as float32 ``bytea``
in ``brain_pg.embedding`` on a live PostgreSQL. Search loads every vector and
ranks by cosine similarity (fine for thousands of rows).

Design rules (mirrors ``pg_store.py`` / ``embeddings.py``):
  * psycopg2 + numpy + stdlib only — no new dependency.
  * idempotent DDL (``CREATE ... IF NOT EXISTS``) and idempotent writes
    (``INSERT ... ON CONFLICT ... DO UPDATE``) so re-indexing never duplicates.
  * never raise when there is no reachable Postgres — ``available()`` is False
    and every public call degrades to a sensible empty/no-op value.

DSN comes from env ``PLATFORM_PG_DSN`` (default localhost / platform), matching
``pg_store.py`` so both share the same live server.

Public surface:
  * ``available() -> bool``                          — Postgres reachable?
  * ``init_db() -> None``                            — create schema/table.
  * ``index_text(note_id, text) -> bool``            — embed + upsert one note.
  * ``search(query, k=5) -> list[{note_id, score}]`` — cosine top-k.
"""

from __future__ import annotations

import os
from typing import Optional

import numpy as np

from . import embeddings

try:
    import psycopg2
except Exception:  # noqa: BLE001
    psycopg2 = None  # type: ignore

_DSN = os.environ.get(
    "PLATFORM_PG_DSN",
    "host=127.0.0.1 user=platform password=platform dbname=platform",
)

SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS brain_pg;
CREATE TABLE IF NOT EXISTS brain_pg.embedding (
    note_id text PRIMARY KEY,
    dim     int,
    vec     bytea
);
"""


def available() -> bool:
    """True iff psycopg2 is importable and a Postgres is reachable. Never raises."""
    if psycopg2 is None:
        return False
    try:
        cn = psycopg2.connect(_DSN, connect_timeout=2)
        cn.close()
        return True
    except Exception:  # noqa: BLE001
        return False


def _connect():
    return psycopg2.connect(_DSN, connect_timeout=3)


def init_db() -> None:
    """Create the ``brain_pg.embedding`` schema/table if absent. Idempotent.
    Never raises."""
    if psycopg2 is None:
        return
    try:
        cn = _connect()
        try:
            with cn, cn.cursor() as cur:
                cur.execute(SCHEMA_SQL)
        finally:
            cn.close()
    except Exception:  # noqa: BLE001
        pass


# ── (de)serialization of vectors (float32) ─────────────────────────────────────────
def _vec_to_bytes(vec: np.ndarray) -> bytes:
    return np.asarray(vec, dtype=np.float32).tobytes()


def _bytes_to_vec(blob: Optional[bytes]) -> np.ndarray:
    if not blob:
        return np.zeros(0, dtype=np.float32)
    return np.frombuffer(bytes(blob), dtype=np.float32)


# ── indexing ───────────────────────────────────────────────────────────────────────
def index_text(note_id: str, text: str) -> bool:
    """Embed ``text`` via ``embeddings.embed`` and upsert it as float32 bytes
    keyed on ``note_id`` (idempotent). Returns True on success, False on bad
    input / no-PG / error."""
    if not note_id or psycopg2 is None:
        return False
    try:
        vec = embeddings.embed(text or "")
        vec = np.asarray(vec, dtype=np.float32).ravel()
        blob = _vec_to_bytes(vec)
        cn = _connect()
        try:
            with cn, cn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO brain_pg.embedding (note_id, dim, vec)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (note_id) DO UPDATE SET
                        dim = EXCLUDED.dim, vec = EXCLUDED.vec
                    """,
                    (str(note_id), int(vec.size), psycopg2.Binary(blob)),
                )
            return True
        finally:
            cn.close()
    except Exception:  # noqa: BLE001
        return False


# ── search ─────────────────────────────────────────────────────────────────────────
def search(query: str, k: int = 5) -> list[dict]:
    """Cosine top-k search over all indexed notes.

    Embeds ``query``, loads every stored vector, ranks by cosine similarity, and
    returns ``[{note_id, score}, ...]`` sorted descending. Never raises; empty
    store / blank query / no-PG → []."""
    try:
        k = int(k)
    except (TypeError, ValueError):
        k = 5
    if k <= 0:
        k = 5
    if not query or not str(query).strip() or psycopg2 is None:
        return []
    try:
        qvec = embeddings.embed(query)
        qvec = np.asarray(qvec, dtype=np.float32).ravel()
        if float(np.linalg.norm(qvec)) == 0.0:
            return []
        cn = _connect()
        try:
            with cn.cursor() as cur:
                cur.execute("SELECT note_id, vec FROM brain_pg.embedding")
                rows = cur.fetchall()
        finally:
            cn.close()
        scored: list[dict] = []
        for note_id, blob in rows:
            vec = _bytes_to_vec(blob)
            sc = embeddings.cosine(qvec, vec)
            scored.append({"note_id": note_id, "score": round(float(sc), 6)})
        scored.sort(key=lambda r: r["score"], reverse=True)
        return scored[:k]
    except Exception:  # noqa: BLE001
        return []
