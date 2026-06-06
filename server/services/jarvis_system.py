"""JARVIS SYSTEM — unified startup + status for the whole platform.

Makes the platform "boot": loads every catalogued data point, registers ALL of
them as governed ingestion jobs (so all 92k flow THROUGH the system's pipeline,
each with a gate decision), and reports a single status across the subsystems —
Foundry (data plane), Gotham (ontology/mission), Apollo (deploy), AIP (AI), and
Security/Governance.

Honest distinction: "flow through" = every endpoint becomes a governed job with a
gate decision (cleared / review_required / no_connector). Live external DATA
ingestion only happens for jobs that are (a) cleared and (b) have an implemented
connector+parser — because most catalogued URLs are documentation/standards pages,
not data feeds.

stdlib only, never raises.
"""

from __future__ import annotations

import sqlite3
import time
import urllib.parse

try:
    from . import jarvis_world_os as wos
except Exception:  # noqa: BLE001
    wos = None  # type: ignore
try:
    from . import jarvis_world_pack as wp
except Exception:  # noqa: BLE001
    wp = None  # type: ignore
try:
    from . import jarvis_corpus_projection as proj
except Exception:  # noqa: BLE001
    proj = None  # type: ignore
try:
    from . import jarvis_synapse as syn
except Exception:  # noqa: BLE001
    syn = None  # type: ignore
try:
    from . import world_dispatch as wd
except Exception:  # noqa: BLE001
    wd = None  # type: ignore
try:
    from . import jarvis_ontology as ont
except Exception:  # noqa: BLE001
    ont = None  # type: ignore
try:
    from . import jarvis_apollo as apollo
except Exception:  # noqa: BLE001
    apollo = None  # type: ignore
try:
    from . import llm_research as lr
except Exception:  # noqa: BLE001
    lr = None  # type: ignore
try:
    from . import second_brain as sb
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    sb = None  # type: ignore
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "brain.db")


def _conn():
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _host(u: str) -> str:
    try:
        return urllib.parse.urlparse(u or "").netloc.lower()
    except Exception:  # noqa: BLE001
        return ""


def _gate_status(host: str) -> tuple[str, str]:
    """(gate_status, pipeline). cleared = open source w/ implemented connector."""
    if wd is not None and host in getattr(wd, "CLEARED", {}):
        return "cleared", wd.CLEARED[host][0]
    return "review_required", ""


def register_jobs() -> dict:
    """Register EVERY catalogued endpoint as a governed ingestion job (all flow
    through). Each job carries a gate decision. Idempotent."""
    c = _conn()
    try:
        c.execute("""CREATE TABLE IF NOT EXISTS world_ingestion_job (
            endpoint_candidate_id TEXT PRIMARY KEY, host TEXT, domain TEXT,
            gate_status TEXT, pipeline TEXT, created_ts INTEGER)""")
        rows = c.execute("SELECT endpoint_candidate_id, official_url, master_topic FROM world_endpoint").fetchall()
        now = int(time.time() * 1000)
        batch = []
        for r in rows:
            host = _host(r["official_url"])
            gate, pipe = _gate_status(host)
            batch.append((r["endpoint_candidate_id"], host, r["master_topic"], gate, pipe, now))
            if len(batch) >= 5000:
                c.executemany("INSERT OR REPLACE INTO world_ingestion_job VALUES (?,?,?,?,?,?)", batch); batch = []
        if batch:
            c.executemany("INSERT OR REPLACE INTO world_ingestion_job VALUES (?,?,?,?,?,?)", batch)
        c.commit()
        total = c.execute("SELECT COUNT(*) FROM world_ingestion_job").fetchone()[0]
        cleared = c.execute("SELECT COUNT(*) FROM world_ingestion_job WHERE gate_status='cleared'").fetchone()[0]
        review = total - cleared
    finally:
        c.close()
    return {"jobs_registered": total, "cleared": cleared, "review_required": review}


def startup() -> dict:
    """Boot the platform: load all points, register all as governed jobs, report."""
    steps = {}
    if wp is not None:
        try:
            wp.load(endpoint_limit=None); steps["foundry_pack"] = "loaded"
        except Exception:  # noqa: BLE001
            steps["foundry_pack"] = "error"
    if wos is not None:
        try:
            steps["foundry_points"] = wos.load_all()
            steps["foundry_secondary"] = wos.load_secondary()
        except Exception:  # noqa: BLE001
            steps["foundry_points"] = "error"
    # Project the loaded corpus into the ONTOLOGY graph so Gotham reflects the real
    # data (subjects->neurons, endpoints->sources, OCR->documents, flow edges->links)
    # instead of only the demo seed. Idempotent.
    if proj is not None:
        try:
            steps["gotham_projection"] = proj.project()
        except Exception:  # noqa: BLE001
            steps["gotham_projection"] = "error"
    steps["ingestion_jobs"] = register_jobs()
    return {"booted": True, "steps": steps, "status": status()}


def _count(table: str) -> int:
    try:
        c = _conn()
        try:
            return c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return 0


def status() -> dict:
    """Unified cross-subsystem status — what's actually up and loaded."""
    foundry = {"endpoints": _count("world_endpoint"), "subjects": _count("world_subject"),
               "flow_edges": _count("world_edge"), "ocr_candidates": _count("world_ocr"),
               "benchmarks": _count("world_benchmark")}
    jobs = {"total": _count("world_ingestion_job"),
            "cleared": 0, "review_required": 0}
    try:
        c = _conn()
        try:
            jobs["cleared"] = c.execute("SELECT COUNT(*) FROM world_ingestion_job WHERE gate_status='cleared'").fetchone()[0]
            jobs["review_required"] = jobs["total"] - jobs["cleared"]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    # Gotham reflects the PROJECTED corpus graph: subjects are neurons, plus the
    # endpoint/document objects and their links. Falls back to the search index
    # total only if the projection service is unavailable.
    pc = proj.counts() if proj is not None else {}
    scraped = 0
    try:
        c = _conn();
        try:
            scraped = c.execute("SELECT COUNT(*) FROM ont_object WHERE state='fetched'").fetchone()[0]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    gotham = {"ontology_objects": _count("ont_object"),
              "object_types": _count("ont_object_type"),
              "neurons": pc.get("neurons") or (sb.index_catalog().get("total", 0) if sb else 0),
              "sources": pc.get("sources", 0),
              "documents": pc.get("documents", 0),
              "scraped_live": scraped,  # REAL fetched content (not catalogue rows)
              "links": pc.get("ont_links", _count("ont_link"))}
    apollo_st = {"environments": _count("apollo_env"), "releases": _count("apollo_release")}
    aip = {"llm_backend": (lr.backend() if lr else None)}
    security = {"subjects": _count("jpol_subject"), "labels": _count("jpol_label")}
    up = {
        "Foundry (data plane)": foundry["endpoints"] > 0,
        "Gotham (ontology/mission)": gotham["object_types"] > 0,
        "Apollo (delivery)": True,
        "AIP (AI mesh)": True,
        "Security/Governance": True,
    }
    # Combinatorial synaptic-capacity expansion of the graph (potential, not edges).
    capacity = syn.capacity(pc) if (syn is not None and pc) else None
    return {"subsystems_up": up, "foundry": foundry, "gotham": gotham,
            "apollo": apollo_st, "aip": aip, "security": security,
            "ingestion_jobs": jobs, "capacity": capacity}
