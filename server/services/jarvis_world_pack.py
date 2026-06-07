"""JARVIS WORLD PACK — loads the Stage-7 world ontology pack into the platform.

The uploaded `ontology/world_pack/` is the canonical acquisition+ontology spec:
30 master topics, 10 universal niches, 300 base ontology cells, 20 acquisition
families, 12 neuron types, 5,000 ISO-expanded domain subjects, 50,000 endpoint
candidates, 55,000 typed flow edges, plus governance docs/schemas.

This loader streams those catalogues into queryable SQLite tables and exposes
real research/ingestion targets — so ingestion pulls from REAL endpoints and
subjects (NASA, Wikidata SPARQL, Earthdata, ...) instead of synthetic phrases.

stdlib only, never raises. Idempotent (INSERT OR REPLACE).
"""

from __future__ import annotations

import csv
import os
import sqlite3
import sys

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        return os.environ.get("BRAIN_DB", "brain.db")

_PACK = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                     "ontology", "world_pack")


def pack_dir() -> str:
    return os.environ.get("WORLD_PACK_DIR", _PACK)


def available() -> bool:
    return os.path.isfile(os.path.join(pack_dir(), "catalogues", "master_topics_30.csv"))


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    try:
        c = _conn()
        try:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS world_topic (topic_id TEXT PRIMARY KEY, master_topic TEXT, purpose TEXT);
                CREATE TABLE IF NOT EXISTS world_niche (niche_id TEXT PRIMARY KEY, universal_niche TEXT, meaning TEXT);
                CREATE TABLE IF NOT EXISTS world_cell (cell_id TEXT PRIMARY KEY, master_topic TEXT, universal_niche TEXT,
                    topic_specific_niche TEXT, primary_acquisition_families TEXT, ontology_object_targets TEXT, priority TEXT);
                CREATE TABLE IF NOT EXISTS world_family (family_id TEXT PRIMARY KEY, family TEXT, captures TEXT);
                CREATE TABLE IF NOT EXISTS world_subject (subject_id TEXT PRIMARY KEY, master_topic TEXT, domain_subject TEXT,
                    neuron_type TEXT, primary_source_families TEXT, source_urls TEXT, acquisition_method TEXT,
                    refresh_cadence TEXT, ontology_targets TEXT, lawful_boundary TEXT);
                CREATE TABLE IF NOT EXISTS world_endpoint (endpoint_candidate_id TEXT PRIMARY KEY, subject_id TEXT,
                    master_topic TEXT, source_name TEXT, official_url TEXT, access_method TEXT, auth_requirement TEXT,
                    recommended_ingestion_connector TEXT, licence_review_required TEXT, robots_or_terms_review_required TEXT);
                CREATE TABLE IF NOT EXISTS world_correlation (edge_id TEXT PRIMARY KEY, source_node TEXT,
                    target_node TEXT, edge_type TEXT, description TEXT, weight TEXT, evidence_type TEXT, flow_layer TEXT);
                CREATE INDEX IF NOT EXISTS idx_we_subject ON world_endpoint(subject_id);
                CREATE INDEX IF NOT EXISTS idx_ws_topic ON world_subject(master_topic);
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def _load_csv(c, fname, table, cols, batch=2000, limit=None):
    path = os.path.join(pack_dir(), "catalogues", fname)
    if not os.path.isfile(path):
        path = os.path.join(pack_dir(), "benchmarks", fname)
    if not os.path.isfile(path):
        return 0
    placeholders = ",".join("?" * len(cols))
    sql = f"INSERT OR REPLACE INTO {table} ({','.join(cols)}) VALUES ({placeholders})"
    n, rows = 0, []
    try:
        with open(path, newline="", encoding="utf-8", errors="ignore") as f:
            for r in csv.DictReader(f):
                rows.append(tuple((r.get(col) or "")[:4000] for col in cols))
                n += 1
                if len(rows) >= batch:
                    c.executemany(sql, rows); rows = []
                if limit and n >= limit:
                    break
        if rows:
            c.executemany(sql, rows)
        c.commit()
    except Exception:  # noqa: BLE001
        pass
    return n


def load(*, endpoint_limit: int | None = None) -> dict:
    """Stream the pack catalogues into the platform DB. Returns real loaded counts."""
    if not available():
        return {"available": False, "reason": f"pack not found at {pack_dir()}"}
    init_db()
    c = _conn()
    out = {}
    try:
        out["topics"] = _load_csv(c, "master_topics_30.csv", "world_topic",
                                  ["topic_id", "master_topic", "purpose"])
        out["niches"] = _load_csv(c, "universal_niches_10.csv", "world_niche",
                                  ["niche_id", "universal_niche", "meaning"])
        out["cells"] = _load_csv(c, "base_ontology_cells_300.csv", "world_cell",
                                 ["cell_id", "master_topic", "universal_niche", "topic_specific_niche",
                                  "primary_acquisition_families", "ontology_object_targets", "priority"])
        out["families"] = _load_csv(c, "acquisition_families_20.csv", "world_family",
                                    ["family_id", "family", "captures"])
        out["subjects"] = _load_csv(c, "domain_subjects_5000_iso_expanded.csv", "world_subject",
                                    ["subject_id", "master_topic", "domain_subject", "neuron_type",
                                     "primary_source_families", "source_urls", "acquisition_method",
                                     "refresh_cadence", "ontology_targets", "lawful_boundary"])
        out["endpoints"] = _load_csv(c, "endpoint_candidates_50000.csv", "world_endpoint",
                                     ["endpoint_candidate_id", "subject_id", "master_topic", "source_name",
                                      "official_url", "access_method", "auth_requirement",
                                      "recommended_ingestion_connector", "licence_review_required",
                                      "robots_or_terms_review_required"], limit=endpoint_limit)
        # Cross-domain correlation edges (Universe→Information, Earth→Climate, …): the
        # layer that ties all 30 domains together so data cross-correlates across the
        # whole platform instead of sitting in disconnected silos.
        out["correlations"] = _load_csv(c, "cross_correlation_edges.csv", "world_correlation",
                                        ["edge_id", "source_node", "target_node", "edge_type",
                                         "description", "weight", "evidence_type", "flow_layer"])
    finally:
        c.close()
    out["available"] = True
    return out


def summary() -> dict:
    init_db()
    c = _conn()
    try:
        def cnt(t):
            try:
                return c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            except Exception:  # noqa: BLE001
                return 0
        return {"available": available(), "pack_dir": pack_dir(),
                "topics": cnt("world_topic"), "niches": cnt("world_niche"), "cells": cnt("world_cell"),
                "families": cnt("world_family"), "subjects": cnt("world_subject"),
                "endpoints": cnt("world_endpoint")}
    finally:
        c.close()


def subjects(master_topic: str | None = None, limit: int = 100) -> list[dict]:
    init_db()
    c = _conn()
    try:
        if master_topic:
            rows = c.execute("SELECT subject_id,master_topic,domain_subject,neuron_type,refresh_cadence "
                             "FROM world_subject WHERE master_topic=? LIMIT ?", (master_topic, limit)).fetchall()
        else:
            rows = c.execute("SELECT subject_id,master_topic,domain_subject,neuron_type,refresh_cadence "
                             "FROM world_subject LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        c.close()


def endpoints(subject_id: str | None = None, limit: int = 100) -> list[dict]:
    init_db()
    c = _conn()
    try:
        if subject_id:
            rows = c.execute("SELECT source_name,official_url,access_method,recommended_ingestion_connector "
                             "FROM world_endpoint WHERE subject_id=? LIMIT ?", (subject_id, limit)).fetchall()
        else:
            rows = c.execute("SELECT source_name,official_url,access_method,recommended_ingestion_connector "
                             "FROM world_endpoint LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        c.close()


def research_targets(limit: int = 50) -> list[str]:
    """Real research targets for the LLM researcher — domain subjects, cleaned to
    their concept tail (e.g. 'Space objects' from 'Universe... / Space objects / Live status')."""
    out, seen = [], set()
    for s in subjects(limit=limit * 4):
        parts = [p.strip() for p in s["domain_subject"].split("/")]
        concept = parts[1] if len(parts) >= 2 else s["domain_subject"]
        if concept and concept.lower() not in seen:
            seen.add(concept.lower())
            out.append(concept)
        if len(out) >= limit:
            break
    return out
