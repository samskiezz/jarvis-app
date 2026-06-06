"""WORLD SEARCH — grounded keyword retrieval over the REAL acquisition corpus.

The agent's old ``search`` tool only saw the small demo ontology. THIS is the
fundamentals: a ranked keyword search across the actual loaded corpus —
92k endpoint candidates, 10k domain subjects, 30k OCR document candidates, 30k
benchmarks — the data points that are the platform's whole reason to exist.

Pure stdlib sqlite3, LIKE-based term matching ranked by how many query terms hit
across the row's text columns. Never raises; returns a unified result shape so the
agent can cite real sources:  {id, label, type, snippet, source, kind}.
"""

from __future__ import annotations

import os
import re
import sqlite3
from typing import Optional

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        return os.environ.get("BRAIN_DB", "server/data/brain.db")

# Per-kind: (table, id_col, label_col, text_cols, snippet_cols, url_col)
_SOURCES = {
    "endpoint": ("world_endpoint", "endpoint_candidate_id", "source_name",
                 ["source_name", "master_topic", "official_url", "recommended_ingestion_connector"],
                 ["master_topic", "access_method"], "official_url"),
    "subject": ("world_subject", "subject_id", "domain_subject",
                ["domain_subject", "master_topic", "primary_source_families", "ontology_targets", "neuron_type"],
                ["primary_source_families", "acquisition_method"], "source_urls"),
    "ocr": ("world_ocr", "ocr_candidate_id", "source_name",
            ["source_name", "master_topic", "document_types", "source_url"],
            ["document_types", "ocr_policy"], "source_url"),
    "benchmark": ("world_benchmark", "benchmark_candidate_id", "benchmark_name",
                  ["benchmark_name", "master_topic", "benchmark_purpose", "metric"],
                  ["benchmark_purpose", "metric"], "benchmark_url"),
}


def _conn() -> Optional[sqlite3.Connection]:
    try:
        c = sqlite3.connect(_db_path(), check_same_thread=False)
        c.row_factory = sqlite3.Row
        return c
    except sqlite3.Error:
        return None


def _terms(query: str) -> list[str]:
    return [t for t in re.split(r"[^A-Za-z0-9]+", (query or "").lower()) if len(t) >= 2][:8]


def _search_kind(c: sqlite3.Connection, kind: str, terms: list[str], per_kind: int) -> list[dict]:
    table, id_col, label_col, text_cols, snip_cols, url_col = _SOURCES[kind]
    # OR across (term x column) for recall; score = number of matched terms.
    where, params = [], []
    for t in terms:
        ors = [f"{col} LIKE ?" for col in text_cols]
        where.append("(" + " OR ".join(ors) + ")")
        params += [f"%{t}%"] * len(text_cols)
    blob = " || ' ' || ".join(f"COALESCE({col},'')" for col in text_cols)
    score_sql = " + ".join([f"(CASE WHEN {blob} LIKE ? THEN 1 ELSE 0 END)" for _ in terms])
    score_params = [f"%{t}%" for t in terms]
    sql = (f"SELECT {id_col} AS id, {label_col} AS label, "
           f"{','.join(set(snip_cols + [url_col]))}, ({score_sql}) AS score "
           f"FROM {table} WHERE {' OR '.join(where)} "
           f"ORDER BY score DESC LIMIT ?")
    try:
        rows = c.execute(sql, score_params + params + [per_kind]).fetchall()
    except sqlite3.Error:
        return []
    out = []
    for r in rows:
        snip = " · ".join(str(r[col]) for col in snip_cols if r[col])
        out.append({
            "id": r["id"], "label": r["label"] or r["id"], "type": kind,
            "kind": kind, "snippet": snip[:220], "source": r[url_col] or "",
            "score": int(r["score"] or 0),
        })
    return out


def search(query: str, k: int = 8, kinds: Optional[list[str]] = None) -> list[dict]:
    """Ranked keyword search across the real corpus. Never raises."""
    terms = _terms(query)
    if not terms:
        return []
    kinds = [x for x in (kinds or list(_SOURCES)) if x in _SOURCES]
    c = _conn()
    if c is None:
        return []
    try:
        per_kind = max(2, k)
        merged: list[dict] = []
        for kind in kinds:
            merged += _search_kind(c, kind, terms, per_kind)
    finally:
        c.close()
    merged.sort(key=lambda r: -r["score"])
    return merged[:k]


def stats() -> dict:
    """Row counts of the searchable corpus (honest sizing for UI / status)."""
    c = _conn()
    if c is None:
        return {}
    out = {}
    try:
        for kind, spec in _SOURCES.items():
            try:
                out[kind] = c.execute(f"SELECT COUNT(*) FROM {spec[0]}").fetchone()[0]
            except sqlite3.Error:
                out[kind] = 0
    finally:
        c.close()
    return out
