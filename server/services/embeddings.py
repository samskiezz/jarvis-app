"""EMBEDDINGS — a real, dependency-free embedding + vector index (P4 #34 / P9).

A hashing TF-IDF vectorizer (numpy + stdlib only — no sentence-transformers,
torch, or network) that turns text into a fixed-dimension L2-normalized vector,
plus a SQLite-backed vector store with cosine top-k search.

Why hashing TF-IDF:
  * deterministic and offline — the same text always maps to the same vector.
  * no vocabulary to persist — features are 1- and 2-grams hashed into a fixed
    ``DIM`` (default 4096) bucket space (the "hashing trick"), with a per-token
    IDF-style sublinear weighting baked in via log-tf and sign hashing to reduce
    collision bias.

Design rules (mirrors ``history_lake.py`` / ``ontology_store.py``):
  * stdlib ``sqlite3`` + numpy only — no new dependency.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``) and idempotent writes
    (``INSERT ... ON CONFLICT ... DO UPDATE``) so re-indexing never duplicates.
  * never raise on normal use — every public function degrades gracefully and
    returns an empty/sensible value on error.

DB path comes from the env var ``VECTOR_DB`` (default ``server/data/vectors.db``).

Public surface:
  * ``embed(text) -> np.ndarray``                      — L2-normalized vector.
  * ``cosine(a, b) -> float``                          — cosine similarity.
  * ``index_doc(id, kind, text, meta=None) -> bool``   — upsert one document.
  * ``index_object(obj) -> bool``                      — index an ontology object.
  * ``reindex_ontology() -> int``                      — (re)index all objects.
  * ``search(query, k=10, kind=None) -> list[dict]``   — cosine top-k.
  * ``count(kind=None) -> int``                        — number of indexed docs.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
import time
from typing import Any, Optional

import numpy as np

# ── configuration ────────────────────────────────────────────────────────────────
DIM = 4096  # fixed embedding dimensionality (hashed feature space)

_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "vectors.db"
)


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``VECTOR_DB`` before the
    first connection."""
    return os.environ.get("VECTOR_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── tokenization + hashing ────────────────────────────────────────────────────────
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> list[str]:
    """Lowercase, split on non-alphanumerics. Deterministic, no stemming."""
    if not text:
        return []
    return _TOKEN_RE.findall(str(text).lower())


def _ngrams(tokens: list[str]) -> list[str]:
    """1-grams and 2-grams (joined by a space) over a token list."""
    grams: list[str] = list(tokens)
    for i in range(len(tokens) - 1):
        grams.append(tokens[i] + " " + tokens[i + 1])
    return grams


def _hash(feature: str) -> tuple[int, float]:
    """Deterministic (bucket, sign) for a feature via md5. The sign hash reduces
    the systematic bias introduced by hash collisions (signed hashing trick)."""
    h = hashlib.md5(feature.encode("utf-8")).digest()
    bucket = int.from_bytes(h[:8], "big") % DIM
    sign = 1.0 if (h[8] & 1) else -1.0
    return bucket, sign


def embed(text: str) -> np.ndarray:
    """Embed ``text`` into a fixed-``DIM`` L2-normalized numpy float32 vector.

    Uses hashed 1+2-grams with sublinear (log) term-frequency weighting. Pure,
    deterministic, offline. Empty/blank text → a zero vector."""
    vec = np.zeros(DIM, dtype=np.float32)
    try:
        grams = _ngrams(_tokenize(text))
        if not grams:
            return vec
        counts: dict[str, int] = {}
        for g in grams:
            counts[g] = counts.get(g, 0) + 1
        for g, c in counts.items():
            bucket, sign = _hash(g)
            # sublinear tf: 1 + log(count)
            vec[bucket] += sign * (1.0 + math.log(c))
        nrm = float(np.linalg.norm(vec))
        if nrm > 0:
            vec /= nrm
    except Exception:  # noqa: BLE001 - never raise
        return np.zeros(DIM, dtype=np.float32)
    return vec


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two vectors. Returns 0.0 on any error / zero
    vector. For L2-normalized inputs this is just the dot product."""
    try:
        a = np.asarray(a, dtype=np.float32).ravel()
        b = np.asarray(b, dtype=np.float32).ravel()
        if a.shape != b.shape or a.size == 0:
            return 0.0
        na = float(np.linalg.norm(a))
        nb = float(np.linalg.norm(b))
        if na == 0.0 or nb == 0.0:
            return 0.0
        return float(np.dot(a, b) / (na * nb))
    except Exception:  # noqa: BLE001
        return 0.0


# ── schema (idempotent) ───────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS doc (
    id        TEXT PRIMARY KEY,
    kind      TEXT NOT NULL DEFAULT 'object',
    text      TEXT NOT NULL DEFAULT '',
    vec       BLOB,
    meta_json TEXT NOT NULL DEFAULT '{}',
    ts        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_doc_kind ON doc (kind);
"""


# ── connection management (mirrors history_lake / ontology_store) ──────────────────
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
    """Create the ``doc`` table/index if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── (de)serialization of vectors ───────────────────────────────────────────────────
def _vec_to_blob(vec: np.ndarray) -> bytes:
    try:
        return np.asarray(vec, dtype=np.float32).tobytes()
    except Exception:  # noqa: BLE001
        return b""


def _blob_to_vec(blob: Optional[bytes]) -> np.ndarray:
    if not blob:
        return np.zeros(DIM, dtype=np.float32)
    try:
        v = np.frombuffer(blob, dtype=np.float32)
        if v.size != DIM:
            return np.zeros(DIM, dtype=np.float32)
        return v
    except Exception:  # noqa: BLE001
        return np.zeros(DIM, dtype=np.float32)


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


# ── indexing ───────────────────────────────────────────────────────────────────────
def index_doc(
    id: str,  # noqa: A002 - matches the public/storage column name
    kind: str,
    text: str,
    meta: Optional[dict] = None,
    *,
    db_path: Optional[str] = None,
) -> bool:
    """Embed ``text`` and upsert a document row (idempotent on ``id``). Returns
    True on success, False on bad input / error."""
    if not id:
        return False
    init_db(db_path)
    try:
        vec = embed(text or "")
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO doc (id, kind, text, vec, meta_json, ts)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    kind=excluded.kind, text=excluded.text, vec=excluded.vec,
                    meta_json=excluded.meta_json, ts=excluded.ts
                """,
                (
                    str(id),
                    str(kind or "object"),
                    str(text or ""),
                    _vec_to_blob(vec),
                    _dumps(meta or {}),
                    _now_ms(),
                ),
            )
            conn.commit()
            return True
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return False


def _object_text(obj: dict) -> str:
    """Build a single searchable text field from an ontology object's
    label + type + flattened props."""
    label = str(obj.get("label", ""))
    otype = str(obj.get("type", ""))
    props = obj.get("props")
    parts: list[str] = [label, otype]
    if isinstance(props, dict):
        for k, v in props.items():
            parts.append(str(k))
            parts.append(_flatten(v))
    elif props is not None:
        parts.append(_flatten(props))
    return " ".join(p for p in parts if p)


def _flatten(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return " ".join(f"{k} {_flatten(v)}" for k, v in value.items())
    if isinstance(value, (list, tuple)):
        return " ".join(_flatten(v) for v in value)
    return str(value)


def index_object(obj: dict, *, db_path: Optional[str] = None) -> bool:
    """Index a single ontology object. Returns True on success."""
    if not isinstance(obj, dict) or not obj.get("id"):
        return False
    meta = {
        "label": obj.get("label"),
        "type": obj.get("type"),
        "mark": obj.get("mark"),
    }
    return index_doc(
        str(obj["id"]),
        str(obj.get("type") or "object"),
        _object_text(obj),
        meta,
        db_path=db_path,
    )


def reindex_ontology(*, db_path: Optional[str] = None) -> int:
    """Pull every ontology object and (re)embed + upsert it. Returns the number
    of objects indexed. Never raises; missing store → 0."""
    init_db(db_path)
    try:
        from . import ontology_store
    except Exception:  # noqa: BLE001
        return 0
    try:
        objects = ontology_store.query_objects()
    except Exception:  # noqa: BLE001
        return 0
    n = 0
    for obj in objects or []:
        if index_object(obj, db_path=db_path):
            n += 1
    return n


# ── search ─────────────────────────────────────────────────────────────────────────
def _load_matrix(
    kind: Optional[str], db_path: Optional[str]
) -> tuple[list[dict], np.ndarray]:
    """Load all (optionally kind-filtered) rows once, returning the row metadata
    list and a stacked (n, DIM) matrix of their vectors."""
    conn = _connect(db_path)
    try:
        if kind is not None:
            rows = conn.execute(
                "SELECT id, kind, text, vec, meta_json FROM doc WHERE kind=?",
                (str(kind),),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, kind, text, vec, meta_json FROM doc"
            ).fetchall()
    finally:
        conn.close()
    if not rows:
        return [], np.zeros((0, DIM), dtype=np.float32)
    meta_rows: list[dict] = []
    vectors: list[np.ndarray] = []
    for r in rows:
        meta_rows.append(
            {
                "id": r["id"],
                "kind": r["kind"],
                "text": r["text"],
                "meta": _loads(r["meta_json"]),
            }
        )
        vectors.append(_blob_to_vec(r["vec"]))
    return meta_rows, np.vstack(vectors)


def search(
    query: str,
    k: int = 10,
    kind: Optional[str] = None,
    *,
    db_path: Optional[str] = None,
) -> list[dict]:
    """Cosine top-k search over indexed documents.

    Vectorizes ``query``, loads all (kind-filtered) doc vectors once, ranks by
    cosine similarity, returns ``[{id, kind, score, text, meta}, ...]`` sorted
    descending. Never raises; empty store / blank query → []."""
    try:
        k = int(k)
    except (TypeError, ValueError):
        k = 10
    if k <= 0:
        k = 10
    if not query or not str(query).strip():
        return []
    init_db(db_path)
    try:
        qvec = embed(query)
        if float(np.linalg.norm(qvec)) == 0.0:
            return []
        meta_rows, matrix = _load_matrix(kind, db_path)
        if not meta_rows:
            return []
        # rows are L2-normalized at index time; query too → dot == cosine.
        scores = matrix @ qvec
        order = np.argsort(-scores)
        out: list[dict] = []
        for idx in order:
            sc = float(scores[int(idx)])
            if sc <= 0.0:
                continue
            row = meta_rows[int(idx)]
            out.append(
                {
                    "id": row["id"],
                    "kind": row["kind"],
                    "score": round(sc, 6),
                    "text": row["text"],
                    "meta": row["meta"],
                }
            )
            if len(out) >= k:
                break
        return out
    except Exception:  # noqa: BLE001 - never raise
        return []


def count(kind: Optional[str] = None, *, db_path: Optional[str] = None) -> int:
    """Number of indexed docs (optionally per kind). 0 on error/empty."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            if kind is not None:
                row = conn.execute(
                    "SELECT COUNT(*) AS n FROM doc WHERE kind=?", (str(kind),)
                ).fetchone()
            else:
                row = conn.execute("SELECT COUNT(*) AS n FROM doc").fetchone()
            return int(row["n"]) if row else 0
        finally:
            conn.close()
    except sqlite3.Error:
        return 0


# Bootstrap the default DB on import so the first request finds the table.
init_db()
