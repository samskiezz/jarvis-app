"""WORLD RUNTIME — species occurrence pipeline (one REAL vertical slice, end-to-end).

Mirrors the earthquake slice: connector -> parser (standard envelope) -> quality
gate -> ontology object + audit + lineage, against a fully-open, no-auth public
source (GBIF occurrence search API). GBIF data is openly licensed and key-free, so
this is legally clear to actually run.

stdlib only. Live fetch is guarded; parser/gate/writer are pure + testable offline.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.request

try:
    from . import jarvis_ontology as ont
except Exception:  # noqa: BLE001
    ont = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore
try:
    from . import jarvis_aip as aip
except Exception:  # noqa: BLE001
    aip = None  # type: ignore

GBIF_FEED = "https://api.gbif.org/v1/occurrence/search?limit=50"
SOURCE_ID = "gbif.occurrence"


# ── connector ────────────────────────────────────────────────────────────────
def fetch(url: str = GBIF_FEED, *, timeout: float = 10.0) -> dict | None:
    """Connector: pull the raw JSON. None on failure (never raises)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "APEX-WorldRuntime/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if r.status != 200:
                return None
            return json.loads(r.read().decode("utf-8", errors="ignore"))
    except Exception:  # noqa: BLE001
        return None


# ── parser: GBIF occurrence -> standard envelope ─────────────────────────────
def parse_record(rec: dict) -> dict:
    rec = rec or {}
    lat = rec.get("decimalLatitude")
    lon = rec.get("decimalLongitude")
    raw_hash = hashlib.sha256(json.dumps(rec, sort_keys=True, default=str).encode()).hexdigest()
    event_date = rec.get("eventDate")
    return {
        "source_id": SOURCE_ID,
        "record_id": str(rec.get("key", "")),
        "record_type": "SpeciesOccurrence",
        "observed_at": event_date,
        "valid_time": event_date,
        "location": {"lat": lat, "lon": lon},
        "entities": [],
        "measurements": [],
        "relationships": [],
        "documents": (
            [{"url": f"https://www.gbif.org/occurrence/{rec.get('key')}"}]
            if rec.get("key") is not None else []
        ),
        "quality": {},
        "provenance": {"source": SOURCE_ID, "feed": GBIF_FEED,
                       "basis_of_record": rec.get("basisOfRecord"),
                       "fetched_ts": int(time.time() * 1000)},
        "raw_hash": raw_hash,
        "_name": rec.get("scientificName"),
        "_country": rec.get("country"),
        "_kingdom": rec.get("kingdom"),
    }


# ── quality gate ─────────────────────────────────────────────────────────────
def quality_gate(env: dict) -> dict:
    """Return {pass, checks}. Rejects malformed / out-of-range / unnamed records."""
    checks = {}
    checks["has_record_id"] = bool(env.get("record_id"))
    loc = env.get("location", {})
    lat, lon = loc.get("lat"), loc.get("lon")
    checks["valid_coords"] = (isinstance(lat, (int, float)) and isinstance(lon, (int, float))
                              and -90 <= lat <= 90 and -180 <= lon <= 180)
    name = env.get("_name")
    checks["has_scientific_name"] = isinstance(name, str) and bool(name.strip())
    return {"pass": all(checks.values()), "checks": checks}


# ── writer: envelope -> ontology object + audit ──────────────────────────────
def _ensure_type() -> None:
    if ont is None:
        return
    try:
        ont.define_object_type("SpeciesOccurrence",
                               {"scientific_name": "str", "kingdom": "str", "country": "str",
                                "lat": "float", "lon": "float", "record_id": "str"},
                               states=["observed", "reviewed"], initial="observed")
    except Exception:  # noqa: BLE001
        pass


def run_pipeline(*, limit: int = 50, live: bool = True, raw: dict | None = None) -> dict:
    """Full slice: fetch -> parse -> gate -> write ontology object -> audit.
    ``raw`` lets tests inject fixed JSON (no network)."""
    data = raw if raw is not None else (fetch() if live else None)
    if not data or not isinstance(data.get("results"), list):
        return {"status": "no_data", "ingested": 0, "rejected": 0}
    _ensure_type()
    ingested, rejected, samples = 0, 0, []
    for rec in data["results"][: max(1, int(limit))]:
        env = parse_record(rec)
        gate = quality_gate(env)
        if not gate["pass"]:
            rejected += 1
            continue
        if ont is not None:
            try:
                obj = ont.create_object("SpeciesOccurrence", {
                    "scientific_name": env["_name"] or "",
                    "kingdom": env["_kingdom"] or "",
                    "country": env["_country"] or "",
                    "lat": env["location"]["lat"], "lon": env["location"]["lon"],
                    "record_id": env["record_id"],
                }, role="analyst", actor="world-runtime")
                if obj.get("status") == "created":
                    ingested += 1
                    if aip is not None:
                        aip.record_lineage("world.ingest.species", obj["id"],
                                           actor="world-runtime", derived_from=[env["record_id"]],
                                           meta={"source": SOURCE_ID, "raw_hash": env["raw_hash"]})
                    if len(samples) < 5:
                        samples.append({"scientific_name": env["_name"],
                                        "country": env["_country"], "id": obj["id"]})
            except Exception:  # noqa: BLE001
                rejected += 1
    if jos is not None:
        jos.audit("world.pipeline.species", actor="world-runtime", target=SOURCE_ID,
                  meta={"ingested": ingested, "rejected": rejected})
    return {"status": "ok", "source": SOURCE_ID, "ingested": ingested,
            "rejected": rejected, "samples": samples}
