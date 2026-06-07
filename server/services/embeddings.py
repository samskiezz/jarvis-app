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
import urllib.request
from typing import Any, Optional

import numpy as np

# ── configuration ────────────────────────────────────────────────────────────────
DIM = 4096  # default hashing dimensionality (CPU fallback feature space)
_HASH_DIM = DIM  # alias: the dimension the offline hashing embedder uses

# ── optional GPU embedding backend (Ollama) ───────────────────────────────────────
# When ``OLLAMA_EMBED_MODEL`` is set (e.g. ``nomic-embed-text``) we embed on the GPU
# box via Ollama's ``/api/embed`` — every index/search call then exercises the GPU.
# It is graceful by contract: any failure falls back to the offline hashing embedder
# AT THE SAME DIMENSION, so the vector store never ends up with mixed-width rows in a
# steady state. ``reindex_vectors()`` re-embeds the whole corpus to migrate dimensions
# when the backend is switched on. With the env unset, behaviour is unchanged (CPU).
#
# Process-cached resolution: once a GPU embedding succeeds we learn the model's native
# dimension and remember it (reset on module reload, so tests stay deterministic).
_resolved: dict = {"backend": None, "dim": None}


def _embed_model() -> str:
    return os.environ.get("OLLAMA_EMBED_MODEL", "").strip()


def _embed_host() -> str:
    return os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").strip()


def _gpu_enabled() -> bool:
    """True iff the operator opted into GPU embeddings via ``OLLAMA_EMBED_MODEL``."""
    return bool(_embed_model())


def _current_dim() -> int:
    """The active embedding width: the learned GPU dim once known, else hashing dim.
    Cheap (no network) — callers that need the GPU dim resolved should embed() first."""
    return int(_resolved["dim"] or _HASH_DIM)


def embedding_backend() -> str:
    """Reportable backend name: 'gpu:<model>' once a GPU embed has succeeded, else
    'hash' (the offline fallback). Used by autobuild/health for visibility."""
    if _resolved["backend"] == "gpu":
        return f"gpu:{_embed_model()}"
    return "hash"


def _gpu_embed_raw(text: str, *, timeout: float = 15.0) -> Optional[np.ndarray]:
    """POST one text to Ollama ``/api/embed`` and return an L2-normalized float32
    vector, or ``None`` on ANY problem (model unset, network, bad payload). Never
    raises — the caller falls back to the hashing embedder."""
    model = _embed_model()
    if not model:
        return None
    try:
        body = json.dumps({"model": model, "input": text or " "}).encode()
        req = urllib.request.Request(
            _embed_host().rstrip("/") + "/api/embed",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            out = json.loads(r.read().decode("utf-8", errors="ignore"))
        embs = out.get("embeddings") or []
        if embs and isinstance(embs[0], list) and embs[0]:
            v = np.asarray(embs[0], dtype=np.float32).ravel()
            nrm = float(np.linalg.norm(v))
            if nrm > 0:
                v = v / nrm
            return v.astype(np.float32, copy=False)
    except Exception:  # noqa: BLE001 - graceful by contract
        return None
    return None

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




def _gpu_embed_batch(texts: list, *, timeout: float = 60.0) -> Optional[list]:
    """Embed a LIST of texts in ONE Ollama ``/api/embed`` call (the GPU processes the
    whole batch at once — vastly faster than serial round-trips). Returns a list of
    L2-normalized float32 vectors aligned to ``texts``, or ``None`` on any problem."""
    model = _embed_model()
    if not model or not texts:
        return None
    try:
        body = json.dumps({"model": model, "input": list(texts)}).encode()
        req = urllib.request.Request(
            _embed_host().rstrip("/") + "/api/embed",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            out = json.loads(r.read().decode("utf-8", errors="ignore"))
        embs = out.get("embeddings")
        if isinstance(embs, list) and len(embs) == len(texts):
            vecs: list = []
            for e in embs:
                v = np.asarray(e, dtype=np.float32).ravel()
                nrm = float(np.linalg.norm(v))
                vecs.append((v / nrm) if nrm > 0 else v)
            return vecs
    except Exception:  # noqa: BLE001 - graceful by contract
        return None
    return None


def embed_batch(texts: list, *, batch: int = 64) -> list:
    """Embed many texts, batching GPU calls (``batch`` per request) so the GPU is fed
    in bulk rather than one round-trip at a time. Falls back to the hashing embedder
    (at the active dim) for any sub-batch the GPU can't serve. Order preserved."""
    texts = [("" if t is None else str(t)) for t in (texts or [])]
    if not texts:
        return []
    if not _gpu_enabled():
        return [_hash_embed(t, _HASH_DIM) for t in texts]
    out: list = [None] * len(texts)
    for start in range(0, len(texts), max(1, int(batch))):
        sub = texts[start : start + max(1, int(batch))]
        vecs = _gpu_embed_batch(sub, timeout=min(180.0, 10.0 + 1.5 * len(sub)))
        if vecs is not None and len(vecs) == len(sub):
            if not _resolved["dim"] and vecs[0].size:
                _resolved["backend"], _resolved["dim"] = "gpu", int(vecs[0].size)
            for j, v in enumerate(vecs):
                out[start + j] = v
        else:
            dim = _resolved["dim"] or _HASH_DIM
            for j, t in enumerate(sub):
                out[start + j] = _hash_embed(t, int(dim))
    return out


def _hash_embed(text: str, dim: int) -> np.ndarray:
    """Offline hashing TF-IDF embedder into a ``dim``-wide L2-normalized float32
    vector. Pure, deterministic, no network. Empty/blank text → a zero vector."""
    vec = np.zeros(dim, dtype=np.float32)
    try:
        grams = _ngrams(_tokenize(text))
        if not grams:
            return vec
        counts: dict[str, int] = {}
        for g in grams:
            counts[g] = counts.get(g, 0) + 1
        for g, c in counts.items():
            h = hashlib.md5(g.encode("utf-8")).digest()
            bucket = int.from_bytes(h[:8], "big") % dim
            sign = 1.0 if (h[8] & 1) else -1.0
            # sublinear tf: 1 + log(count)
            vec[bucket] += sign * (1.0 + math.log(c))
        nrm = float(np.linalg.norm(vec))
        if nrm > 0:
            vec /= nrm
    except Exception:  # noqa: BLE001 - never raise
        return np.zeros(dim, dtype=np.float32)
    return vec


def embed(text: str) -> np.ndarray:
    """Embed ``text`` into an L2-normalized numpy float32 vector.

    Backend selection (graceful, env-gated):
      * GPU on   (``OLLAMA_EMBED_MODEL`` set): embed via Ollama ``/api/embed`` on the
        GPU box; on ANY failure fall back to the hashing embedder AT THE GPU DIM so
        the store stays single-width. The first successful GPU call learns + caches
        the model's native dimension.
      * GPU off  (default): the offline hashing embedder at ``DIM`` (unchanged).

    Deterministic + offline in the default (no-env) configuration."""
    if _gpu_enabled():
        if text and str(text).strip():
            v = _gpu_embed_raw(text)
            if v is not None and v.size > 0:
                if not _resolved["dim"]:
                    _resolved["backend"], _resolved["dim"] = "gpu", int(v.size)
                return v
        # blank text, or GPU unreachable → hashing fallback at the GPU width when
        # known (so dims match), else probe once to learn it, else the hashing dim.
        dim = _resolved["dim"]
        if not dim:
            probe = _gpu_embed_raw("dimension probe")
            if probe is not None and probe.size > 0:
                _resolved["backend"], _resolved["dim"] = "gpu", int(probe.size)
                dim = _resolved["dim"]
        return _hash_embed(text, int(dim or _HASH_DIM))
    return _hash_embed(text, _HASH_DIM)


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
    # A row whose stored width != the active width (e.g. a hashing-era 4096-d row
    # read while GPU embeddings are active at 768) is treated as a zero vector — it
    # scores 0 and is filtered out until ``reindex_vectors()`` re-embeds it.
    dim = _current_dim()
    if not blob:
        return np.zeros(dim, dtype=np.float32)
    try:
        v = np.frombuffer(blob, dtype=np.float32)
        if v.size != dim:
            return np.zeros(dim, dtype=np.float32)
        return v
    except Exception:  # noqa: BLE001
        return np.zeros(dim, dtype=np.float32)


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


def index_batch(items: list, *, db_path: Optional[str] = None) -> int:
    """Embed + upsert many docs in ONE batched GPU pass + ONE transaction.

    ``items`` is a list of ``(id, kind, text, meta)`` tuples. Returns the number of
    rows written. Idempotent per id. Never raises (skips bad rows)."""
    rows = [it for it in (items or []) if it and it[0]]
    if not rows:
        return 0
    init_db(db_path)
    vecs = embed_batch([str(it[2] or "") for it in rows])
    n = 0
    try:
        conn = _connect(db_path)
        try:
            for (rid, kind, text, meta), vec in zip(rows, vecs):
                try:
                    conn.execute(
                        """
                        INSERT INTO doc (id, kind, text, vec, meta_json, ts)
                        VALUES (?,?,?,?,?,?)
                        ON CONFLICT(id) DO UPDATE SET
                            kind=excluded.kind, text=excluded.text, vec=excluded.vec,
                            meta_json=excluded.meta_json, ts=excluded.ts
                        """,
                        (str(rid), str(kind or "object"), str(text or ""),
                         _vec_to_blob(vec), _dumps(meta or {}), _now_ms()),
                    )
                    n += 1
                except sqlite3.Error:
                    continue
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        return n
    return n


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


def _text_chunks(text: str, size: int, max_n: int) -> list[str]:
    """Split ``text`` into up to ``max_n`` windows of ~``size`` chars (cheap, on
    char boundaries — good enough for embedding granularity)."""
    text = (text or "").strip()
    if not text:
        return []
    out: list[str] = []
    for i in range(0, len(text), size):
        out.append(text[i : i + size])
        if len(out) >= max_n:
            break
    return out


def index_documents(
    docs: Any,
    *,
    chunk_chars: int = 1200,
    max_chunks: int = 6,
    db_path: Optional[str] = None,
) -> dict:
    """Embed the scraped document corpus into the semantic index, one chunk per row.

    Each document is split into a few char-windows; each chunk is embedded (on the GPU
    when enabled) and upserted as ``{doc_id}#{i}`` with kind ``document``. Idempotent
    on the chunk id, so re-runs refresh in place rather than duplicate. This is the
    bulk GPU workload that turns the 6 MB of scraped text into a searchable KB.

    Never raises. Returns ``{"documents", "chunks", "backend", "dim"}``."""
    n_docs = 0
    items: list = []
    for d in docs or []:
        try:
            did = str((d or {}).get("id") or "")
            if not did:
                continue
            title = str(d.get("title") or "")
            url = str(d.get("url") or "")
            chunks = _text_chunks(d.get("full_text") or d.get("text") or "", chunk_chars, max_chunks)
            if not chunks:
                continue
            for i, ch in enumerate(chunks):
                # prepend the title to the first chunk so titles are searchable too
                body = f"{title}\n{ch}" if (i == 0 and title) else ch
                items.append((f"{did}#{i}", "document", body,
                              {"doc_id": did, "url": url, "title": title, "chunk": i}))
            n_docs += 1
        except Exception:  # noqa: BLE001 - never let one bad doc stop the build
            continue
    # one batched GPU pass over ALL chunks (fed in bulk, not one round-trip each)
    n_chunks = index_batch(items, db_path=db_path)
    return {"documents": n_docs, "chunks": n_chunks,
            "backend": embedding_backend(), "dim": _current_dim()}


def reindex_vectors(*, db_path: Optional[str] = None) -> dict:
    """Re-embed EVERY stored doc row from its own ``text`` with the active backend.

    This is the corpus-wide pass that (a) moves the whole vector store onto the GPU
    embedder when it is enabled, and (b) migrates any legacy-width rows to the current
    dimension so search stays consistent. Driven each build by autobuild — it is the
    step that actually puts the scraped/injected knowledge base onto the GPU.

    Never raises. Returns ``{"count", "backend", "dim"}``."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute("SELECT id, text FROM doc").fetchall()
            n = 0
            for r in rows:
                vec = embed(r["text"] or "")
                conn.execute(
                    "UPDATE doc SET vec=?, ts=? WHERE id=?",
                    (_vec_to_blob(vec), _now_ms(), r["id"]),
                )
                n += 1
            conn.commit()
            return {"count": n, "backend": embedding_backend(), "dim": _current_dim()}
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"count": 0, "backend": embedding_backend(), "dim": _current_dim(),
                "error": str(exc)}


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
        return [], np.zeros((0, _current_dim()), dtype=np.float32)
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
