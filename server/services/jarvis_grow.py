"""JARVIS GROW — make scraping grow all three planes (Foundry / Gotham / Apollo).

A fetched document used to land as an isolated Gotham node. This wires each
acquisition into the whole platform:

  * GOTHAM  — ensure the 31 master Topic nodes exist, and link every fetched
              document to the Topics its content actually mentions (MENTIONS edges),
              so the graph grows with real semantic relationships, not orphans.
  * APOLLO  — record each acquisition sweep as a real delivery (artifact + release),
              so Apollo's release history grows as data is acquired.
  * FOUNDRY — expose the growing count of fetched/ingested content for status.

stdlib only; reuses jarvis_apollo; idempotent; never raises.
"""

from __future__ import annotations

import os
import re
import sqlite3
import time
from typing import Optional

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        return os.environ.get("BRAIN_DB", "server/data/brain.db")

try:
    from . import jarvis_apollo as apollo
except Exception:  # noqa: BLE001
    apollo = None  # type: ignore

# The 31 master topics -> the significant keywords that signal them in text.
_TOPIC_KEYWORDS = {
    "Agriculture & food systems": ["agriculture", "farming", "crop", "food", "livestock"],
    "Business & organisations": ["business", "company", "organisation", "corporate", "enterprise"],
    "Classification & metadata itself": ["metadata", "taxonomy", "classification", "schema", "ontology"],
    "Climate & hazards": ["climate", "hazard", "disaster", "wildfire", "drought", "flood"],
    "Consumption & lifestyle": ["consumption", "lifestyle", "consumer", "retail"],
    "Earth systems": ["earth", "ocean", "atmosphere", "weather", "seismic", "geology", "buoy", "tide"],
    "Economy & industry": ["economy", "economic", "industry", "gdp", "trade", "manufacturing"],
    "Energy & resources": ["energy", "electricity", "oil", "gas", "renewable", "power grid", "fuel"],
    "Environment & ecology": ["environment", "ecology", "biodiversity", "species", "pollution", "emissions"],
    "Ethics & philosophy": ["ethics", "philosophy", "moral"],
    "Extended Intelligence & Operations": ["intelligence", "operations", "surveillance", "reconnaissance"],
    "Finance & ownership": ["finance", "financial", "ownership", "shareholder", "securities", "sec", "edgar"],
    "Geography & location": ["geography", "location", "geospatial", "coordinates", "boundary"],
    "Government & public administration": ["government", "public administration", "agency", "federal", "ministry"],
    "Human body & health": ["health", "disease", "clinical", "medical", "patient", "epidemiology"],
    "Information & communication": ["communication", "telecom", "network", "internet", "broadcast"],
    "Infrastructure & utilities": ["infrastructure", "utility", "water supply", "sanitation", "pipeline"],
    "Knowledge & education": ["education", "research", "academic", "university", "scholarly", "publication"],
    "Law & regulation": ["law", "legal", "regulation", "statute", "legislation", "compliance"],
    "Life & biology": ["biology", "genome", "organism", "ecosystem", "molecular"],
    "People & demographics": ["demographic", "population", "census", "migration"],
    "Politics & governance": ["politics", "governance", "election", "policy", "parliament"],
    "Products & commodities": ["commodity", "product", "goods", "manufacturing"],
    "Science & research": ["science", "scientific", "research", "experiment", "dataset"],
    "Security & conflict": ["security", "conflict", "defence", "military", "threat", "vulnerability", "sanctions"],
    "Society & culture": ["society", "culture", "heritage", "social"],
    "Technology & engineering": ["technology", "engineering", "software", "hardware", "api", "system"],
    "Transport & mobility": ["transport", "mobility", "aviation", "rail", "maritime", "shipping", "flight", "vessel"],
    "Universe & cosmology": ["universe", "cosmology", "astronomy", "solar", "orbital", "satellite", "space weather"],
    "Urban & built environment": ["urban", "city", "building", "construction", "infrastructure"],
    "Work & labour": ["labour", "labor", "employment", "workforce", "jobs"],
}


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:48]


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def ensure_topics() -> int:
    """Create the 31 master Topic nodes in Gotham. Idempotent. Returns total."""
    now = int(time.time() * 1000)
    try:
        c = _conn()
        try:
            # On a fresh DB the ont_* tables may not exist yet (e.g. called before the
            # corpus projection); create them so this never silently returns 0.
            c.executescript(
                "CREATE TABLE IF NOT EXISTS ont_object_type ("
                "  name TEXT PRIMARY KEY, schema TEXT, states TEXT, initial TEXT, ts INTEGER);"
                "CREATE TABLE IF NOT EXISTS ont_object ("
                "  id TEXT PRIMARY KEY, type TEXT, props TEXT, state TEXT,"
                "  created_ts INTEGER, updated_ts INTEGER);"
                "CREATE TABLE IF NOT EXISTS ont_link ("
                "  id TEXT PRIMARY KEY, type TEXT, from_id TEXT, to_id TEXT, ts INTEGER);")
            c.execute("INSERT OR IGNORE INTO ont_object_type (name, schema, states, initial, ts) "
                      "VALUES ('Topic','{}','[\"active\"]','active',?)", (now,))
            import json
            rows = [(f"topic:{_slug(t)}", "Topic",
                     json.dumps({"label": t, "keywords": kw}), "active", now, now)
                    for t, kw in _TOPIC_KEYWORDS.items()]
            c.executemany("INSERT OR IGNORE INTO ont_object (id,type,props,state,created_ts,updated_ts) "
                          "VALUES (?,?,?,?,?,?)", rows)
            c.commit()
            return c.execute("SELECT COUNT(*) FROM ont_object WHERE type='Topic'").fetchone()[0]
        finally:
            c.close()
    except sqlite3.Error:
        return 0


_TOPIC_RX = {t: re.compile(r"\b(" + "|".join(re.escape(k) for k in kw) + r")\b", re.I)
             for t, kw in _TOPIC_KEYWORDS.items()}


def enrich_document(oid: str, title: str, text: str, *, max_topics: int = 4) -> int:
    """Link a fetched document to the Topics its content mentions (MENTIONS edges).
    Grows the Gotham graph with real semantic relationships. Never raises."""
    if not oid:
        return 0
    blob = f"{title} {text}".lower()
    if not blob.strip():
        return 0
    hits = []
    for t, rx in _TOPIC_RX.items():
        m = rx.findall(blob)
        if m:
            hits.append((t, len(m)))
    hits.sort(key=lambda x: -x[1])
    hits = hits[:max_topics]
    if not hits:
        return 0
    now = int(time.time() * 1000)
    n = 0
    try:
        c = _conn()
        try:
            for t, _w in hits:
                tid = f"topic:{_slug(t)}"
                c.execute("INSERT OR IGNORE INTO ont_link (id,type,from_id,to_id,ts) VALUES (?,?,?,?,?)",
                          (f"mentions:{oid}:{_slug(t)}", "MENTIONS", oid, tid, now))
                n += 1
            c.commit()
        finally:
            c.close()
    except sqlite3.Error:
        return 0
    return n


def record_acquisition_run(stats: dict) -> dict:
    """Record an acquisition sweep as an Apollo delivery (artifact + release), so the
    delivery plane grows as data is acquired. Never raises."""
    if apollo is None:
        return {"ok": False, "error": "apollo unavailable"}
    try:
        apollo.init_db()
        ver = time.strftime("%Y.%m.%d.%H%M%S")
        apollo.register_artifact("world-acquisition", ver,
                                 sbom=[{"component": "scraper", "fetched": stats.get("fetched", 0)}])
        apollo.define_environment("production", tier="prod")
        rel = apollo.release("world-acquisition", ver, "production", strategy="rolling")
        return {"ok": True, "version": ver, "release": rel.get("status") if isinstance(rel, dict) else rel}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def foundry_growth() -> dict:
    """Growing-data counts for Foundry status: fetched content + topic edges."""
    try:
        c = _conn()
        try:
            fetched = c.execute("SELECT COUNT(*) FROM ont_object WHERE state='fetched'").fetchone()[0]
            mentions = c.execute("SELECT COUNT(*) FROM ont_link WHERE type='MENTIONS'").fetchone()[0]
            topics = c.execute("SELECT COUNT(*) FROM ont_object WHERE type='Topic'").fetchone()[0]
            return {"documents_fetched": fetched, "topic_edges": mentions, "topics": topics}
        finally:
            c.close()
    except sqlite3.Error:
        return {}
