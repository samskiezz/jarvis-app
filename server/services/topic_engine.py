"""Topic Engine — maps the 7000-row scraper master sheet to app pages and serves lookups.

Reads docs/scraper_master_sheet.csv once at import, builds indexes for fast
page→topic and topic→page queries. Also handles bulk ingestion of
ENTITY_TAG_ONLY topics into brain.db as ontology objects.
"""
from __future__ import annotations

import csv
import json
import os
import sqlite3
import time
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any

CSV_PATH = Path(__file__).resolve().parents[2] / "docs" / "scraper_master_sheet.csv"
DB_PATH = Path(__file__).resolve().parents[2] / "server" / "data" / "brain.db"


# ── Page mapping rules (source class + keywords → page names) ─────────────────
def _map_pages(row: dict) -> list[str]:
    source = row.get("Source Class", "")
    topic = row.get("Topic Name", "")
    action = row.get("Scraper Action", "")
    pages: set[str] = set()

    if "Weather" in source or "Atmosphere" in source:
        pages.update(["SensorGrid", "JarvisTerminal", "GlobalIntel", "GeoMap"])
    if "Ocean" in source or "Marine" in source:
        pages.update(["SensorGrid", "SkyOrbital", "GeoMap"])
    if "Seismic" in source or "Geology" in source:
        pages.update(["GeoMap", "SensorGrid", "GlobalIntel", "War", "ScienceConsole"])
    if "Aviation" in source:
        pages.update(["SkyOrbital", "SensorGrid"])
    if "Space" in source or "Astronomy" in source:
        pages.update(["SkyOrbital", "ScienceConsole", "ScienceConsoles"])
    if "Economy" in source or "Demographics" in source:
        pages.update(["Dashboard", "InvestmentTracker", "GlobalIntel", "Quiver"])
    if "Energy" in source or "Grid" in source:
        pages.update(["SensorGrid", "InvestmentTracker", "GlobalIntel"])
    if "Security" in source or "Conflict" in source:
        pages.update(["War", "GlobalIntel", "AlertsNotificationCenter"])
    if "City" in source or "Infrastructure" in source:
        pages.update(["GeoMap", "SensorGrid", "GlobalIntel", "GeoWorkspace"])
    if "Water" in source or "Hydrology" in source:
        pages.update(["SensorGrid", "GeoMap", "GlobalIntel"])
    if "Air Quality" in source or "Emissions" in source:
        pages.update(["SensorGrid", "ScienceConsole", "GlobalIntel"])
    if "Agriculture" in source or "Food" in source:
        pages.update(["SensorGrid", "GlobalIntel"])
    if "Environment" in source or "Ecosystem" in source:
        pages.update(["SensorGrid", "ScienceConsole", "GlobalIntel"])
    if "Geospatial" in source or "Reference" in source:
        pages.update(["GeoMap", "GeoWorkspace", "SensorGrid"])
    if "App" in source or "Internal" in source:
        pages.update(["SystemAdmin", "JarvisCore", "CommandOverview"])

    # Keyword overrides
    tlower = topic.lower()
    if any(k in tlower for k in ("weather", "temperature", "humidity", "pressure", "wind", "rain", "snow", "storm", "cloud", "fog")):
        pages.update(["SensorGrid", "JarvisTerminal", "GlobalIntel"])
    if any(k in tlower for k in ("earthquake", "seismic", "tsunami", "volcano", "magma", "fault", "tectonic")):
        pages.update(["GeoMap", "SensorGrid", "GlobalIntel", "War"])
    if any(k in tlower for k in ("flight", "aircraft", "airport", "runway", "aviation", "notam", "metar", "sigmet")):
        pages.update(["SkyOrbital", "SensorGrid"])
    if any(k in tlower for k in ("satellite", "orbit", "iss", "space", "solar", "aurora", "asteroid", "meteor")):
        pages.update(["SkyOrbital", "ScienceConsole"])
    if any(k in tlower for k in ("ocean", "wave", "tide", "marine", "ship", "buoy", "current", "salinity")):
        pages.update(["SensorGrid", "SkyOrbital", "GeoMap"])
    if any(k in tlower for k in ("crypto", "bitcoin", "stock", "price", "market", "trading", "fx", "gdp", "inflation", "unemployment")):
        pages.update(["Dashboard", "InvestmentTracker", "GlobalIntel", "Quiver"])
    if any(k in tlower for k in ("radiation", "nuclear", "reactor", "isotope", "gamma", "neutron")):
        pages.update(["SensorGrid", "ScienceConsole", "GlobalIntel", "RFSpectrum"])
    if any(k in tlower for k in ("disease", "outbreak", "health", "hospital", "mortality", "vaccine", "epidemic")):
        pages.update(["SensorGrid", "GlobalIntel", "ScienceConsole"])
    if any(k in tlower for k in ("fire", "wildfire", "bushfire", "burn")):
        pages.update(["SensorGrid", "GlobalIntel", "GeoMap", "War"])
    if any(k in tlower for k in ("protest", "strike", "conflict", "war", "military", "defence", "attack", "casualty")):
        pages.update(["War", "GlobalIntel", "AlertsNotificationCenter"])
    if any(k in tlower for k in ("power", "electricity", "grid", "solar", "battery", "renewable", "outage")):
        pages.update(["SensorGrid", "InvestmentTracker", "GlobalIntel"])
    if any(k in tlower for k in ("water", "flood", "river", "reservoir", "dam", "groundwater", "drought")):
        pages.update(["SensorGrid", "GeoMap", "GlobalIntel"])
    if any(k in tlower for k in ("road", "traffic", "bridge", "tunnel", "transport", "train", "bus")):
        pages.update(["GeoMap", "GeoWorkspace", "SensorGrid"])
    if any(k in tlower for k in ("building", "construction", "compliance", "fire safety", "hazard")):
        pages.update(["GeoMap", "SensorGrid", "GeoWorkspace"])

    if not pages:
        pages.add("GlobalIntel")

    return sorted(pages)


# ── In-memory indexes (built once) ────────────────────────────────────────────
_rows: list[dict] = []
_by_page: dict[str, list[dict]] = defaultdict(list)
_by_id: dict[str, dict] = {}
_by_action: dict[str, list[dict]] = defaultdict(list)
_by_source: dict[str, list[dict]] = defaultdict(list)
_initialized = False


def _init() -> None:
    global _initialized
    if _initialized:
        return
    if not CSV_PATH.exists():
        return
    with CSV_PATH.open("r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            _rows.append(row)
            _by_id[row["ID"]] = row
            _by_action[row["Scraper Action"]].append(row)
            _by_source[row["Source Class"]].append(row)
            for page in _map_pages(row):
                _by_page[page].append(row)
    _initialized = True


def all_rows() -> list[dict]:
    _init()
    return _rows


def topics_for_page(page_name: str) -> list[dict]:
    _init()
    return _by_page.get(page_name, [])


def topic_by_id(tid: str) -> dict | None:
    _init()
    return _by_id.get(tid)


def topics_by_action(action: str) -> list[dict]:
    _init()
    return _by_action.get(action, [])


def topics_by_source(source: str) -> list[dict]:
    _init()
    return _by_source.get(source, [])


def page_summary() -> dict[str, dict]:
    _init()
    out: dict[str, dict] = {}
    for page, rows in _by_page.items():
        p1 = sum(1 for r in rows if r.get("Priority") == "1")
        p2 = sum(1 for r in rows if r.get("Priority") == "2")
        p3 = sum(1 for r in rows if r.get("Priority") == "3")
        p4 = sum(1 for r in rows if r.get("Priority") == "4")
        out[page] = {
            "total": len(rows),
            "priority_1": p1,
            "priority_2": p2,
            "priority_3": p3,
            "priority_4": p4,
            "fetch_live": sum(1 for r in rows if r["Scraper Action"] == "FETCH_LIVE_API"),
            "entity_tag": sum(1 for r in rows if r["Scraper Action"] == "ENTITY_TAG_ONLY"),
            "computed": sum(1 for r in rows if r["Scraper Action"] == "CALCULATE_DERIVED"),
            "event": sum(1 for r in rows if r["Scraper Action"] == "SEARCH_EVENT_FEED"),
            "aggregated": sum(1 for r in rows if r["Scraper Action"] == "AGGREGATE_MULTI_SOURCE"),
            "reference": sum(1 for r in rows if r["Scraper Action"] == "LOOKUP_REFERENCE_DOC"),
            "geospatial": sum(1 for r in rows if r["Scraper Action"] == "FETCH_GEOSPATIAL_LAYER"),
            "app_feature": sum(1 for r in rows if r["Scraper Action"] == "APP_INTERNAL_FEATURE"),
        }
    return out


# ── Ingest ENTITY_TAG_ONLY topics into brain.db ───────────────────────────────
def _db() -> sqlite3.Connection:
    return sqlite3.connect(str(DB_PATH), check_same_thread=False)


def _ensure_topic_type() -> None:
    conn = _db()
    conn.execute(
        """INSERT OR IGNORE INTO ont_object_type (name, schema, states, initial, ts)
           VALUES (?, ?, ?, ?, ?)""",
        ("Topic", json.dumps({"topic_name": "str", "source_class": "str",
                               "scraper_action": "str", "priority": "str",
                               "geo_scope": "str", "unit_hint": "str"}),
         json.dumps(["tagged", "ingested", "live"]), "tagged", int(time.time()))
    )
    conn.commit()
    conn.close()


def ingest_entity_tags(batch_size: int = 500) -> dict:
    """Bulk-ingest all ENTITY_TAG_ONLY rows as ont_object Topics."""
    _init()
    _ensure_topic_type()
    conn = _db()
    cursor = conn.cursor()

    # Check existing
    cursor.execute("SELECT COUNT(*) FROM ont_object WHERE type = 'Topic'")
    existing = cursor.fetchone()[0]

    rows = topics_by_action("ENTITY_TAG_ONLY")
    inserted = 0
    skipped = 0
    now = int(time.time())

    for row in rows:
        tid = f"topic_{row['ID']}"
        cursor.execute("SELECT 1 FROM ont_object WHERE id = ?", (tid,))
        if cursor.fetchone():
            skipped += 1
            continue

        props = {
            "topic_name": row["Topic Name"],
            "source_class": row["Source Class"],
            "scraper_action": row["Scraper Action"],
            "priority": row.get("Priority", ""),
            "geo_scope": row.get("Geo Scope", ""),
            "unit_hint": row.get("Unit Hint", ""),
            "query_template": row.get("Query / API Search Template", ""),
            "refresh_cadence": row.get("Refresh Cadence", ""),
            "pages": _map_pages(row),
        }
        cursor.execute(
            """INSERT INTO ont_object (id, type, props, state, created_ts, updated_ts)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (tid, "Topic", json.dumps(props, default=str), "tagged", now, now)
        )
        inserted += 1
        if inserted % batch_size == 0:
            conn.commit()

    conn.commit()
    conn.close()
    return {
        "status": "ok",
        "existing": existing,
        "inserted": inserted,
        "skipped": skipped,
        "total_topics": len(rows),
    }


def ingest_all_actions(batch_size: int = 500) -> dict:
    """Ingest ALL 7000 topics as ontology objects, not just ENTITY_TAG_ONLY."""
    _init()
    _ensure_topic_type()
    conn = _db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM ont_object WHERE type = 'Topic'")
    existing = cursor.fetchone()[0]

    inserted = 0
    skipped = 0
    now = int(time.time())

    for row in _rows:
        tid = f"topic_{row['ID']}"
        cursor.execute("SELECT 1 FROM ont_object WHERE id = ?", (tid,))
        if cursor.fetchone():
            skipped += 1
            continue

        props = {
            "topic_name": row["Topic Name"],
            "source_class": row["Source Class"],
            "scraper_action": row["Scraper Action"],
            "source_method": row.get("Source Method", ""),
            "priority": row.get("Priority", ""),
            "geo_scope": row.get("Geo Scope", ""),
            "unit_hint": row.get("Unit Hint", ""),
            "query_template": row.get("Query / API Search Template", ""),
            "refresh_cadence": row.get("Refresh Cadence", ""),
            "needs_api": row.get("Needs API", ""),
            "needs_search": row.get("Needs Search", ""),
            "is_computed": row.get("Is Computed", ""),
            "pages": _map_pages(row),
        }
        cursor.execute(
            """INSERT INTO ont_object (id, type, props, state, created_ts, updated_ts)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (tid, "Topic", json.dumps(props, default=str), "tagged", now, now)
        )
        inserted += 1
        if inserted % batch_size == 0:
            conn.commit()

    conn.commit()
    conn.close()
    return {
        "status": "ok",
        "existing": existing,
        "inserted": inserted,
        "skipped": skipped,
        "total_topics": len(_rows),
    }


# ── Link topics to pages ──────────────────────────────────────────────────────
def link_topics_to_pages() -> dict:
    _init()
    conn = _db()
    cursor = conn.cursor()

    # Ensure link type (ont_link_type has: name, from_type, to_type, cardinality, ts)
    now = int(time.time())
    cursor.execute(
        """INSERT OR IGNORE INTO ont_link_type (name, from_type, to_type, cardinality, ts)
           VALUES (?, ?, ?, ?, ?)""",
        ("powers", "Topic", "AppPage", "many", now)
    )

    linked = 0
    skipped = 0
    now = int(time.time())

    for row in _rows:
        tid = f"topic_{row['ID']}"
        pages = _map_pages(row)
        for page in pages:
            page_oid = f"page_{page}"
            # Ensure page object exists
            cursor.execute("SELECT 1 FROM ont_object WHERE id = ?", (page_oid,))
            if not cursor.fetchone():
                cursor.execute(
                    """INSERT INTO ont_object (id, type, props, state, created_ts, updated_ts)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (page_oid, "AppPage",
                     json.dumps({"name": page, "label": page, "route": f"/apex/{page}"}),
                     "active", now, now)
                )

            lid = f"link_{tid}_{page}"
            cursor.execute("SELECT 1 FROM ont_link WHERE id = ?", (lid,))
            if cursor.fetchone():
                skipped += 1
                continue
            cursor.execute(
                """INSERT INTO ont_link (id, type, from_id, to_id, ts)
                   VALUES (?, ?, ?, ?, ?)""",
                (lid, "powers", tid, page_oid, now)
            )
            linked += 1

    conn.commit()
    conn.close()
    return {"status": "ok", "linked": linked, "skipped": skipped}
