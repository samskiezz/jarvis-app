"""JARVIS TAXONOMY — the world taxonomy loaded into the operational ontology.

Turns the 30 master world-topics × 10 universal niches (= 300 base ontology cells),
the 20 data-acquisition-point families, and the 12 Palantir-style object types into
REAL records inside the platform ontology (not a content list):

  topic -> niche -> cell  +  acquisition families  +  object types

``load()`` registers the 12 object types in the ontology kernel and seeds the
taxonomy tables; ``frontier()`` yields topics/cells to drive non-stop ingestion
(source -> pipeline -> object -> relationship -> model -> workflow -> action -> audit).

stdlib only, never raises.
"""

from __future__ import annotations

import sqlite3

try:
    from . import jarvis_ontology as ont
except Exception:  # noqa: BLE001
    ont = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore
try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "brain.db")

# 30 master world topics
TOPICS = [
    "Universe & cosmology", "Earth systems", "Geography & location", "Environment & ecology",
    "Climate & hazards", "Life & biology", "Human body & health", "People & demographics",
    "Society & culture", "Knowledge & education", "Science & research", "Technology & engineering",
    "Information & communication", "Economy & industry", "Products & commodities",
    "Finance & ownership", "Government & public administration", "Law & regulation",
    "Politics & governance", "Security & conflict", "Infrastructure & utilities",
    "Energy & resources", "Agriculture & food systems", "Urban & built environment",
    "Transport & mobility", "Business & organisations", "Work & labour",
    "Consumption & lifestyle", "Ethics & philosophy", "Classification & metadata",
]

# 10 universal niches under every topic
NICHES = [
    "Live status", "Historical archive", "Forecast/prediction", "Registry/catalogue",
    "Geospatial layer", "Entity relationships", "Event/incident feed", "Risk/compliance layer",
    "Operational workflow", "Audit/provenance",
]

# 20 data-acquisition-point families
ACQUISITION_FAMILIES = [
    "Official APIs", "Databases", "Files and documents", "Streaming telemetry", "Geospatial feeds",
    "Entity registries", "Event feeds", "Time-series measurements", "Imagery and video",
    "Communications metadata", "Cybersecurity logs", "Operational system logs", "Supply chain feeds",
    "Financial and market feeds", "Public web/open data", "Scientific and technical datasets",
    "Human-entered workflows", "Machine learning outputs", "Rules and policy sources",
    "Deployment/runtime state",
]

# 12 Palantir-style object types (name -> property schema)
OBJECT_TYPES = {
    "Person":       {"name": "str", "role": "str"},
    "Organisation": {"name": "str", "sector": "str"},
    "Asset":        {"name": "str", "kind": "str"},
    "Place":        {"name": "str", "lat": "float", "lon": "float"},
    "Event":        {"name": "str", "kind": "str", "ts": "str"},
    "Document":     {"title": "str", "kind": "str"},
    "Measurement":  {"name": "str", "value": "float", "unit": "str"},
    "Relationship": {"kind": "str"},
    "Workflow":     {"name": "str", "state": "str"},
    "ModelOutput":  {"kind": "str", "score": "float"},
    "Action":       {"name": "str", "risk": "str"},
    "AuditRecord":  {"actor": "str", "action": "str"},
}


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
                CREATE TABLE IF NOT EXISTS taxonomy_cell (
                    topic TEXT, niche TEXT, PRIMARY KEY (topic, niche)
                );
                CREATE TABLE IF NOT EXISTS taxonomy_family (name TEXT PRIMARY KEY);
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def load() -> dict:
    """Seed the 300 cells + 20 families and register the 12 object types in the
    ontology kernel. Idempotent. Returns the real counts."""
    init_db()
    cells = 0
    try:
        c = _conn()
        try:
            for t in TOPICS:
                for n in NICHES:
                    c.execute("INSERT OR IGNORE INTO taxonomy_cell (topic,niche) VALUES (?,?)", (t, n))
                    cells += c.total_changes  # not exact per-row; recomputed below
            for f in ACQUISITION_FAMILIES:
                c.execute("INSERT OR IGNORE INTO taxonomy_family (name) VALUES (?)", (f,))
            c.commit()
            cell_total = c.execute("SELECT COUNT(*) FROM taxonomy_cell").fetchone()[0]
            fam_total = c.execute("SELECT COUNT(*) FROM taxonomy_family").fetchone()[0]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        cell_total = fam_total = 0
    # register the 12 object types into the ontology kernel
    registered = 0
    if ont is not None:
        for name, props in OBJECT_TYPES.items():
            try:
                ont.define_object_type(name, props, states=["active", "archived"], initial="active")
                registered += 1
            except Exception:  # noqa: BLE001
                pass
    if jos is not None:
        jos.audit("taxonomy.load", target="world",
                  meta={"topics": len(TOPICS), "cells": cell_total, "families": fam_total,
                        "object_types": registered})
    return {"topics": len(TOPICS), "niches": len(NICHES), "cells": cell_total,
            "families": fam_total, "object_types": registered}


def frontier(limit: int = 30, *, with_niche: bool = False) -> list[str]:
    """Ingestion frontier from the taxonomy — topics (or topic+niche phrases)."""
    if with_niche:
        out = [f"{t} {n}" for t in TOPICS for n in NICHES]
        return out[: max(1, int(limit))]
    return TOPICS[: max(1, int(limit))]


def summary() -> dict:
    init_db()
    try:
        c = _conn()
        try:
            cells = c.execute("SELECT COUNT(*) FROM taxonomy_cell").fetchone()[0]
            fams = c.execute("SELECT COUNT(*) FROM taxonomy_family").fetchone()[0]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        cells = fams = 0
    return {"topics": len(TOPICS), "niches": len(NICHES), "cells": cells,
            "families": fams, "object_types": len(OBJECT_TYPES)}


def cells(topic: str | None = None, limit: int = 500) -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            if topic:
                rows = c.execute("SELECT topic,niche FROM taxonomy_cell WHERE topic=? LIMIT ?",
                                 (topic, limit)).fetchall()
            else:
                rows = c.execute("SELECT topic,niche FROM taxonomy_cell LIMIT ?", (limit,)).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []
