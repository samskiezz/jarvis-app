"""WORLD RUNTIME — earthquake pipeline (one REAL vertical slice, end-to-end).

Demonstrates what "fully real" means for a single domain: a working connector ->
parser (standard envelope) -> quality gate -> ontology object -> audit, against a
fully-open, no-auth, public-domain source (USGS earthquake GeoJSON). This is the
unit that the Stage-7 pack's specs describe; multiply by N domains + real infra.

USGS feeds are U.S. Government public-domain, no API key, terms permit reuse — so
this is legally clear to actually run (unlike the 50k endpoint *candidates* that
still need per-source licence review).

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

USGS_FEED = ("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/"
             "significant_week.geojson")
SOURCE_ID = "usgs.earthquake"


# ── connector ────────────────────────────────────────────────────────────────
def fetch(url: str = USGS_FEED, *, timeout: float = 10.0) -> dict | None:
    """Connector: pull the raw GeoJSON. None on failure (never raises)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "APEX-WorldRuntime/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if r.status != 200:
                return None
            return json.loads(r.read().decode("utf-8", errors="ignore"))
    except Exception:  # noqa: BLE001
        return None


# ── parser: USGS feature -> standard envelope ────────────────────────────────
def parse_feature(feat: dict) -> dict:
    props = feat.get("properties", {}) or {}
    geom = feat.get("geometry", {}) or {}
    coords = geom.get("coordinates", [None, None, None]) or [None, None, None]
    lon, lat, depth = (coords + [None, None, None])[:3]
    raw_hash = hashlib.sha256(json.dumps(feat, sort_keys=True, default=str).encode()).hexdigest()
    t_ms = props.get("time")
    return {
        "source_id": SOURCE_ID,
        "record_id": feat.get("id", ""),
        "record_type": "EarthquakeEvent",
        "observed_at": t_ms,
        "valid_time": t_ms,
        "location": {"lat": lat, "lon": lon, "depth_km": depth},
        "entities": [],
        "measurements": [
            {"name": "magnitude", "value": props.get("mag"), "unit": props.get("magType") or "M"},
            {"name": "depth", "value": depth, "unit": "km"},
        ],
        "relationships": [],
        "documents": [{"url": props.get("url")}] if props.get("url") else [],
        "quality": {},
        "provenance": {"source": SOURCE_ID, "feed": USGS_FEED, "fetched_ts": int(time.time() * 1000)},
        "raw_hash": raw_hash,
        "_place": props.get("place", ""),
        "_mag": props.get("mag"),
    }


# ── quality gate ─────────────────────────────────────────────────────────────
def quality_gate(env: dict, *, max_age_days: int = 60) -> dict:
    """Return {pass, checks}. Rejects malformed / stale / out-of-range records."""
    checks = {}
    checks["has_record_id"] = bool(env.get("record_id"))
    loc = env.get("location", {})
    lat, lon = loc.get("lat"), loc.get("lon")
    checks["valid_coords"] = (isinstance(lat, (int, float)) and isinstance(lon, (int, float))
                              and -90 <= lat <= 90 and -180 <= lon <= 180)
    checks["has_magnitude"] = isinstance(env.get("_mag"), (int, float))
    t = env.get("valid_time")
    checks["fresh"] = bool(t) and (time.time() * 1000 - t) <= max_age_days * 86400_000
    return {"pass": all(checks.values()), "checks": checks}


# ── writer: envelope -> ontology object + audit ──────────────────────────────
def _ensure_type() -> None:
    if ont is None:
        return
    try:
        ont.define_object_type("EarthquakeEvent",
                               {"place": "str", "magnitude": "float", "lat": "float",
                                "lon": "float", "depth_km": "float", "url": "str", "record_id": "str"},
                               states=["observed", "reviewed"], initial="observed")
    except Exception:  # noqa: BLE001
        pass


def run_pipeline(*, limit: int = 50, live: bool = True, raw: dict | None = None) -> dict:
    """Full slice: fetch -> parse -> gate -> write ontology object -> audit.
    ``raw`` lets tests inject a fixed GeoJSON (no network)."""
    data = raw if raw is not None else (fetch() if live else None)
    if not data or not isinstance(data.get("features"), list):
        return {"status": "no_data", "ingested": 0, "rejected": 0}
    _ensure_type()
    ingested, rejected, samples = 0, 0, []
    for feat in data["features"][: max(1, int(limit))]:
        env = parse_feature(feat)
        gate = quality_gate(env)
        if not gate["pass"]:
            rejected += 1
            continue
        if ont is not None:
            try:
                obj = ont.create_object("EarthquakeEvent", {
                    "place": env["_place"], "magnitude": env["_mag"],
                    "lat": env["location"]["lat"], "lon": env["location"]["lon"],
                    "depth_km": env["location"]["depth_km"],
                    "url": (env["documents"][0]["url"] if env["documents"] else ""),
                    "record_id": env["record_id"],
                }, role="analyst", actor="world-runtime")
                if obj.get("status") == "created":
                    ingested += 1
                    if aip is not None:
                        aip.record_lineage("world.ingest.earthquake", obj["id"],
                                           actor="world-runtime", derived_from=[env["record_id"]],
                                           meta={"source": SOURCE_ID, "raw_hash": env["raw_hash"]})
                    if len(samples) < 5:
                        samples.append({"place": env["_place"], "mag": env["_mag"], "id": obj["id"]})
            except Exception:  # noqa: BLE001
                rejected += 1
    if jos is not None:
        jos.audit("world.pipeline.earthquake", actor="world-runtime", target=SOURCE_ID,
                  meta={"ingested": ingested, "rejected": rejected})
    return {"status": "ok", "source": SOURCE_ID, "ingested": ingested,
            "rejected": rejected, "samples": samples}
