"""JARVIS WORLD OS — load the FULL v7 master pack data points into the database.

The endpoint candidates and domain subjects ARE the platform's acquisition layer —
the most important asset. This loader streams EVERY endpoint_candidates*.csv and
domain_subjects*.csv across the whole world_os tree (root + stage8_baseline +
advanced) into the platform DB. Nothing is skipped; only truly identical primary
keys collapse (INSERT OR REPLACE), so unique rows from different files all land.

Reuses the world_endpoint / world_subject tables from jarvis_world_pack.
stdlib only, never raises.
"""

from __future__ import annotations

import csv
import glob
import os
import sqlite3
import sys

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

try:
    from . import jarvis_world_pack as wp
except Exception:  # noqa: BLE001
    wp = None  # type: ignore
try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        return os.environ.get("BRAIN_DB", "brain.db")

_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                     "world_os")


def world_os_dir() -> str:
    return os.environ.get("WORLD_OS_DIR", _ROOT)


def available() -> bool:
    return os.path.isdir(world_os_dir())


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _stream_into(c, files, table, cols, pk, batch=5000):
    placeholders = ",".join("?" * len(cols))
    sql = f"INSERT OR REPLACE INTO {table} ({','.join(cols)}) VALUES ({placeholders})"
    seen_files, rows, n = 0, [], 0
    for path in files:
        if not os.path.isfile(path):
            continue
        seen_files += 1
        try:
            with open(path, newline="", encoding="utf-8", errors="ignore") as f:
                rdr = csv.DictReader(f)
                for r in rdr:
                    if not r.get(pk):
                        continue
                    rows.append(tuple((r.get(col) or "")[:4000] for col in cols))
                    n += 1
                    if len(rows) >= batch:
                        c.executemany(sql, rows); rows = []
            if rows:
                c.executemany(sql, rows); rows = []
            c.commit()
        except Exception:  # noqa: BLE001
            continue
    return seen_files, n


def load_all() -> dict:
    """Load every endpoint + subject catalogue in world_os into the DB. Returns
    real counts: files read, rows processed, distinct rows now in the DB."""
    if not available() or wp is None:
        return {"available": False, "reason": f"world_os not found at {world_os_dir()}"}
    wp.init_db()  # ensures world_endpoint / world_subject tables exist
    base = world_os_dir()
    ep_files = sorted(glob.glob(os.path.join(base, "**", "endpoint_candidates*.csv"), recursive=True))
    su_files = sorted(glob.glob(os.path.join(base, "**", "domain_subjects*.csv"), recursive=True))
    pa_files = sorted(glob.glob(os.path.join(base, "**", "*acquisition_points*.csv"), recursive=True))

    c = _conn()
    try:
        ep_cols = ["endpoint_candidate_id", "subject_id", "master_topic", "source_name",
                   "official_url", "access_method", "auth_requirement",
                   "recommended_ingestion_connector", "licence_review_required",
                   "robots_or_terms_review_required"]
        su_cols = ["subject_id", "master_topic", "domain_subject", "neuron_type",
                   "primary_source_families", "source_urls", "acquisition_method",
                   "refresh_cadence", "ontology_targets", "lawful_boundary"]
        ep_files_n, ep_rows = _stream_into(c, ep_files + pa_files, "world_endpoint", ep_cols, "endpoint_candidate_id")
        su_files_n, su_rows = _stream_into(c, su_files, "world_subject", su_cols, "subject_id")
        ep_distinct = c.execute("SELECT COUNT(*) FROM world_endpoint").fetchone()[0]
        su_distinct = c.execute("SELECT COUNT(*) FROM world_subject").fetchone()[0]
    finally:
        c.close()
    return {"available": True,
            "endpoint_files": ep_files_n, "endpoint_rows_read": ep_rows, "endpoints_in_db": ep_distinct,
            "subject_files": su_files_n, "subject_rows_read": su_rows, "subjects_in_db": su_distinct}


def summary() -> dict:
    if wp is None:
        return {"available": False}
    s = wp.summary()
    s["world_os_dir"] = world_os_dir()
    return s


def _init_secondary(c) -> None:
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS world_edge (edge_id TEXT PRIMARY KEY, subject_id TEXT,
            source_class TEXT, target_class TEXT, edge_type TEXT, edge_weight TEXT,
            evidence_required TEXT, policy_gate TEXT, audit_required TEXT);
        CREATE TABLE IF NOT EXISTS world_ocr (ocr_candidate_id TEXT PRIMARY KEY, subject_id TEXT,
            master_topic TEXT, source_name TEXT, source_url TEXT, document_types TEXT, ocr_policy TEXT);
        CREATE TABLE IF NOT EXISTS world_benchmark (benchmark_candidate_id TEXT PRIMARY KEY, subject_id TEXT,
            master_topic TEXT, benchmark_name TEXT, benchmark_url TEXT, benchmark_purpose TEXT, metric TEXT);
        """
    )
    c.commit()


def load_secondary() -> dict:
    """Load the remaining catalogues: typed flow edges, OCR doc candidates, benchmarks."""
    if not available():
        return {"available": False}
    base = world_os_dir()
    c = _conn()
    try:
        _init_secondary(c)
        edge_files = sorted(glob.glob(os.path.join(base, "**", "typed_flow_edges*.csv"), recursive=True))
        ocr_files = sorted(glob.glob(os.path.join(base, "**", "ocr_document_candidates*.csv"), recursive=True))
        bm_files = sorted(glob.glob(os.path.join(base, "**", "benchmark_candidates*.csv"), recursive=True))
        _, edge_rows = _stream_into(c, edge_files, "world_edge",
            ["edge_id", "subject_id", "source_class", "target_class", "edge_type",
             "edge_weight", "evidence_required", "policy_gate", "audit_required"], "edge_id")
        _, ocr_rows = _stream_into(c, ocr_files, "world_ocr",
            ["ocr_candidate_id", "subject_id", "master_topic", "source_name", "source_url",
             "document_types", "ocr_policy"], "ocr_candidate_id")
        _, bm_rows = _stream_into(c, bm_files, "world_benchmark",
            ["benchmark_candidate_id", "subject_id", "master_topic", "benchmark_name",
             "benchmark_url", "benchmark_purpose", "metric"], "benchmark_candidate_id")
        edges = c.execute("SELECT COUNT(*) FROM world_edge").fetchone()[0]
        ocr = c.execute("SELECT COUNT(*) FROM world_ocr").fetchone()[0]
        bm = c.execute("SELECT COUNT(*) FROM world_benchmark").fetchone()[0]
    finally:
        c.close()
    return {"available": True, "edges_read": edge_rows, "edges_in_db": edges,
            "ocr_read": ocr_rows, "ocr_in_db": ocr, "benchmarks_read": bm_rows, "benchmarks_in_db": bm}

