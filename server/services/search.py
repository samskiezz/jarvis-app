"""SEARCH — pure-python full-text search over the ontology objects.

An in-memory inverted index with TF-IDF ranking (numpy for the maths) over each
object's ``label`` + flattened ``props`` text, plus a fuzzy fallback so typos
still match and a prefix ``suggest`` for typeahead.

Design rules (mirrors the rest of the backend):
  * numpy / stdlib only — no heavyweight NLP dependency.
  * never raise on normal use — every public function degrades gracefully and
    returns an empty/sensible value on bad input.
  * the index is rebuildable (``reindex``) and loads from ``ontology_store`` if
    that module is importable, else falls back to the static ``OBJECTS``.

Public surface:
  * ``search(query, *, type=None, mark=None, limit=20) -> list[dict]``
  * ``suggest(prefix, *, limit=10) -> list[str]``
  * ``reindex(objects=None) -> int``
  * ``get_index() -> SearchIndex`` (the process-wide singleton)
"""

from __future__ import annotations

import math
import re
import threading
from typing import Any, Iterable, Optional

import numpy as np

# ── tokenisation ────────────────────────────────────────────────────────────────
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> list[str]:
    """Lowercase, split on non-alphanumerics. Deterministic, no stemming."""
    if not text:
        return []
    return _TOKEN_RE.findall(text.lower())


def _flatten_props(props: Any) -> str:
    """Flatten a props dict (or any value) into a single searchable text blob."""
    if props is None:
        return ""
    if isinstance(props, dict):
        parts: list[str] = []
        for k, v in props.items():
            parts.append(str(k))
            parts.append(_flatten_props(v))
        return " ".join(parts)
    if isinstance(props, (list, tuple)):
        return " ".join(_flatten_props(v) for v in props)
    return str(props)


def _object_text(obj: dict) -> str:
    """The full searchable text for an object: label (weighted) + type + props."""
    label = str(obj.get("label", ""))
    # Repeat the label so label hits outrank deep-prop hits in the TF-IDF space.
    return " ".join(
        [label, label, str(obj.get("type", "")), _flatten_props(obj.get("props"))]
    )


# ── fuzzy distance ──────────────────────────────────────────────────────────────
def _levenshtein(a: str, b: str) -> int:
    """Classic iterative Levenshtein edit distance (stdlib, O(len(a)*len(b)))."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def _norm_similarity(a: str, b: str) -> float:
    """Normalised similarity in [0,1]: 1 - editdistance/maxlen."""
    if not a and not b:
        return 1.0
    m = max(len(a), len(b))
    if m == 0:
        return 1.0
    return 1.0 - (_levenshtein(a, b) / m)


def _best_fuzzy_token(token: str, vocab: Iterable[str]) -> tuple[Optional[str], float]:
    """Find the vocab token most similar to ``token``; return (token, sim)."""
    best: Optional[str] = None
    best_sim = 0.0
    for v in vocab:
        # cheap length pre-filter — skip wildly different lengths
        if abs(len(v) - len(token)) > max(2, len(token) // 2 + 1):
            continue
        sim = _norm_similarity(token, v)
        if sim > best_sim:
            best_sim, best = sim, v
    return best, best_sim


# ── snippet ─────────────────────────────────────────────────────────────────────
def _snippet(obj: dict, query_tokens: list[str], width: int = 120) -> str:
    """A short human-readable snippet: the label plus the first prop value whose
    text contains a query token (so the hit is visible)."""
    label = str(obj.get("label", ""))
    props = obj.get("props")
    qset = set(query_tokens)
    if isinstance(props, dict):
        for k, v in props.items():
            blob = f"{k}: {v}"
            if qset & set(_tokenize(blob)):
                s = f"{label} — {blob}"
                return s[:width]
    # fall back to label + a flattened prefix
    flat = _flatten_props(props)
    base = f"{label} — {flat}".strip(" —")
    return base[:width] if base else label


# ── the index ─────────────────────────────────────────────────────────────────
class SearchIndex:
    """An in-memory inverted index + TF-IDF document matrix over ontology objects."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.objects: list[dict] = []
        self.doc_tokens: list[list[str]] = []
        self.vocab: dict[str, int] = {}
        self.idf: np.ndarray = np.zeros(0, dtype=np.float64)
        # tf-idf matrix, L2-normalised rows: shape (n_docs, n_terms)
        self.matrix: np.ndarray = np.zeros((0, 0), dtype=np.float64)
        # inverted index: term -> set of doc indices
        self.postings: dict[str, set[int]] = {}

    # -- build --------------------------------------------------------------
    def build(self, objects: list[dict]) -> int:
        """(Re)build the whole index from ``objects``. Returns #docs indexed."""
        with self._lock:
            objs = [o for o in (objects or []) if isinstance(o, dict)]
            self.objects = objs
            self.doc_tokens = [_tokenize(_object_text(o)) for o in objs]

            vocab: dict[str, int] = {}
            postings: dict[str, set[int]] = {}
            for di, toks in enumerate(self.doc_tokens):
                for t in toks:
                    if t not in vocab:
                        vocab[t] = len(vocab)
                    postings.setdefault(t, set()).add(di)
            self.vocab = vocab
            self.postings = postings

            n_docs = len(objs)
            n_terms = len(vocab)
            if n_docs == 0 or n_terms == 0:
                self.idf = np.zeros(n_terms, dtype=np.float64)
                self.matrix = np.zeros((n_docs, n_terms), dtype=np.float64)
                return n_docs

            # document frequency
            df = np.zeros(n_terms, dtype=np.float64)
            for t, docs in postings.items():
                df[vocab[t]] = len(docs)
            # smoothed idf
            self.idf = np.log((1.0 + n_docs) / (1.0 + df)) + 1.0

            # term-frequency matrix
            tf = np.zeros((n_docs, n_terms), dtype=np.float64)
            for di, toks in enumerate(self.doc_tokens):
                for t in toks:
                    tf[di, vocab[t]] += 1.0
            # sublinear tf scaling
            tf = np.where(tf > 0, 1.0 + np.log(tf, where=tf > 0, out=np.zeros_like(tf)), 0.0)

            mat = tf * self.idf  # broadcast idf across rows
            # L2-normalise rows
            norms = np.linalg.norm(mat, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            self.matrix = mat / norms
            return n_docs

    # -- query vector -------------------------------------------------------
    def _query_vector(self, tokens: list[str]) -> np.ndarray:
        n_terms = len(self.vocab)
        vec = np.zeros(n_terms, dtype=np.float64)
        if n_terms == 0:
            return vec
        counts: dict[str, int] = {}
        for t in tokens:
            if t in self.vocab:
                counts[t] = counts.get(t, 0) + 1
        for t, c in counts.items():
            idx = self.vocab[t]
            vec[idx] = (1.0 + math.log(c)) * self.idf[idx]
        nrm = float(np.linalg.norm(vec))
        if nrm > 0:
            vec = vec / nrm
        return vec

    # -- search -------------------------------------------------------------
    def search(
        self,
        query: str,
        *,
        type: Optional[str] = None,  # noqa: A002 - mirrors the public API name
        mark: Optional[str] = None,
        limit: int = 20,
    ) -> list[dict]:
        with self._lock:
            try:
                limit = int(limit)
            except (TypeError, ValueError):
                limit = 20
            if limit <= 0:
                limit = 20

            raw_tokens = _tokenize(query or "")
            n_docs = len(self.objects)
            if n_docs == 0:
                return []

            # structured filter mask
            def _passes(o: dict) -> bool:
                if type is not None and str(o.get("type", "")).lower() != str(type).lower():
                    return False
                if mark is not None and str(o.get("mark", "")).lower() != str(mark).lower():
                    return False
                return True

            allowed = np.array([_passes(o) for o in self.objects], dtype=bool)

            # No query text → return filtered objects (zero score, deterministic order).
            if not raw_tokens:
                results = []
                for di in range(n_docs):
                    if not allowed[di]:
                        continue
                    o = self.objects[di]
                    results.append(self._result(di, 0.0, raw_tokens))
                return results[:limit]

            # Fuzzy-expand unknown tokens to their nearest in-vocab term.
            eff_tokens: list[str] = []
            fuzzy_used = False
            for t in raw_tokens:
                if t in self.vocab:
                    eff_tokens.append(t)
                else:
                    cand, sim = _best_fuzzy_token(t, self.vocab.keys())
                    if cand is not None and sim >= 0.6:
                        eff_tokens.append(cand)
                        fuzzy_used = True

            scores = np.zeros(n_docs, dtype=np.float64)
            if eff_tokens:
                qvec = self._query_vector(eff_tokens)
                scores = self.matrix @ qvec
                if fuzzy_used:
                    # discount fuzzy-only matches a touch so exact hits win.
                    scores = scores * 0.95

            # If TF-IDF found nothing (e.g. all tokens OOV), fall back to a pure
            # fuzzy label/text similarity so a bad typo still returns its target.
            if float(scores.max(initial=0.0)) <= 0.0:
                qjoined = " ".join(raw_tokens)
                for di, o in enumerate(self.objects):
                    if not allowed[di]:
                        continue
                    label = str(o.get("label", "")).lower()
                    sim = _norm_similarity(qjoined, label)
                    # also try best token-vs-token similarity against the doc
                    tok_best = 0.0
                    for qt in raw_tokens:
                        cand, s = _best_fuzzy_token(qt, set(self.doc_tokens[di]))
                        tok_best = max(tok_best, s)
                    scores[di] = max(sim, tok_best) * 0.5  # fuzzy scores capped < exact

            # apply filter mask
            scores = np.where(allowed, scores, 0.0)

            order = np.argsort(-scores)
            results: list[dict] = []
            for di in order:
                sc = float(scores[di])
                if sc <= 0.0:
                    continue
                results.append(self._result(int(di), sc, raw_tokens))
                if len(results) >= limit:
                    break
            return results

    def _result(self, di: int, score: float, query_tokens: list[str]) -> dict:
        o = self.objects[di]
        return {
            "id": o.get("id"),
            "label": o.get("label"),
            "type": o.get("type"),
            "mark": o.get("mark"),
            "score": round(float(score), 6),
            "snippet": _snippet(o, query_tokens),
        }

    # -- suggest ------------------------------------------------------------
    def suggest(self, prefix: str, *, limit: int = 10) -> list[str]:
        with self._lock:
            p = (prefix or "").strip().lower()
            try:
                limit = int(limit)
            except (TypeError, ValueError):
                limit = 10
            if limit <= 0:
                limit = 10
            if not p:
                return [str(o.get("label", "")) for o in self.objects][:limit]

            labels = [str(o.get("label", "")) for o in self.objects]
            scored: list[tuple[float, int, str]] = []
            for i, lab in enumerate(labels):
                ll = lab.lower()
                if ll.startswith(p):
                    scored.append((0.0, i, lab))  # whole-label prefix: best
                elif any(tok.startswith(p) for tok in _tokenize(lab)):
                    scored.append((1.0, i, lab))  # token prefix: next best
                else:
                    sim = _norm_similarity(p, ll)
                    if sim >= 0.6:
                        scored.append((2.0 - sim, i, lab))  # fuzzy: last
            scored.sort(key=lambda x: (x[0], x[1]))
            out: list[str] = []
            for _, _, lab in scored:
                if lab not in out:
                    out.append(lab)
                if len(out) >= limit:
                    break
            return out


# ── module-level singleton + loader ──────────────────────────────────────────────
_INDEX: Optional[SearchIndex] = None
_INDEX_LOCK = threading.RLock()


def _load_objects() -> list[dict]:
    """Load objects from ``ontology_store`` if importable, else static OBJECTS.

    Never raises — any import/attribute failure falls back to the static seed.
    """
    # 1. Try the live ontology_store (cap to 5k so the dense TF-IDF matrix stays
    #    memory-safe; topics are created first so they dominate the result).
    try:
        from . import ontology_store as _ostore
        objs = _ostore.query_objects(limit=5000)
        if objs:
            return [dict(o) for o in objs if isinstance(o, dict)]
    except Exception:  # noqa: BLE001
        pass
    # 2. Legacy fallback paths.
    for modpath in ("server.data.ontology_store", "..data.ontology_store"):
        try:
            if modpath.startswith(".."):
                from importlib import import_module
                mod = import_module("ontology_store", package="server.data")
            else:
                from importlib import import_module
                mod = import_module(modpath)
            getter = getattr(mod, "get_objects", None)
            if callable(getter):
                objs = getter()
                if objs:
                    return [dict(o) for o in objs if isinstance(o, dict)]
            objs = getattr(mod, "OBJECTS", None)
            if objs:
                return [dict(o) for o in objs if isinstance(o, dict)]
        except Exception:  # noqa: BLE001 - any failure → static fallback
            continue
    # Fallback: the static seed ontology.
    try:
        from ..data.ontology import OBJECTS
        return [dict(o) for o in OBJECTS]
    except Exception:  # noqa: BLE001
        return []


def get_index() -> SearchIndex:
    """Return the process-wide index, building it lazily on first use."""
    global _INDEX
    with _INDEX_LOCK:
        if _INDEX is None:
            _INDEX = SearchIndex()
            _INDEX.build(_load_objects())
        return _INDEX


def reindex(objects: Optional[list[dict]] = None) -> int:
    """Rebuild the singleton index. ``objects=None`` reloads from the store/seed.

    Returns the number of documents indexed. Never raises.
    """
    global _INDEX
    with _INDEX_LOCK:
        try:
            if _INDEX is None:
                _INDEX = SearchIndex()
            objs = objects if objects is not None else _load_objects()
            return _INDEX.build(objs)
        except Exception:  # noqa: BLE001 - never raise
            if _INDEX is None:
                _INDEX = SearchIndex()
            return len(_INDEX.objects)


# ── module-level convenience wrappers (the public API) ────────────────────────────
def search(
    query: str,
    *,
    type: Optional[str] = None,  # noqa: A002
    mark: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    """Ranked search over the indexed ontology objects. Never raises."""
    try:
        return get_index().search(query, type=type, mark=mark, limit=limit)
    except Exception:  # noqa: BLE001
        return []


def suggest(prefix: str, *, limit: int = 10) -> list[str]:
    """Prefix/typeahead suggestions over object labels. Never raises."""
    try:
        return get_index().suggest(prefix, limit=limit)
    except Exception:  # noqa: BLE001
        return []
