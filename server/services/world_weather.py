"""WORLD RUNTIME — US weather-alerts pipeline (one REAL vertical slice, end-to-end).

Same shape as ``world_earthquake``: a working connector -> parser (standard
envelope) -> quality gate -> ontology object -> audit, against a fully-open,
no-auth, public-domain source — the U.S. National Weather Service active-alerts
GeoJSON feed (``api.weather.gov``).

NWS data is U.S. Government public-domain, requires no API key (it does require a
User-Agent header), and its terms permit reuse — so this is legally clear to run.

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

FEED = "https://api.weather.gov/alerts/active?limit=50"
SOURCE_ID = "nws.alerts"
_UA = "APEX-WorldRuntime/1.0 (ops@apex.local)"


# ── connector ────────────────────────────────────────────────────────────────
def fetch(url: str = FEED, *, timeout: float = 10.0) -> dict | None:
    """Connector: pull the raw GeoJSON. None on failure (never raises).

    NWS requires a descriptive User-Agent; requests without one are refused.
    """
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": _UA, "Accept": "application/geo+json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if r.status != 200:
                return None
            return json.loads(r.read().decode("utf-8", errors="ignore"))
    except Exception:  # noqa: BLE001
        return None


# ── parser: NWS feature -> standard envelope ─────────────────────────────────
def _to_epoch_ms(iso: str | None):
    """Best-effort ISO-8601 -> epoch ms. Returns the raw ISO string on failure."""
    if not iso:
        return None
    try:
        import datetime as _dt
        s = iso.replace("Z", "+00:00")
        return int(_dt.datetime.fromisoformat(s).timestamp() * 1000)
    except Exception:  # noqa: BLE001
        return iso


def parse_feature(feat: dict) -> dict:
    props = feat.get("properties", {}) or {}
    raw_hash = hashlib.sha256(
        json.dumps(feat, sort_keys=True, default=str).encode()).hexdigest()
    effective = props.get("effective")
    expires = props.get("expires")
    observed = _to_epoch_ms(effective)
    event = props.get("event", "")
    severity = props.get("severity", "")
    headline = props.get("headline", "")
    area = props.get("areaDesc", "")
    url = props.get("@id") or feat.get("id", "")
    return {
        "source_id": SOURCE_ID,
        "record_id": feat.get("id", ""),
        "record_type": "WeatherAlert",
        "observed_at": observed,
        "valid_time": observed,
        "location": {"areaDesc": area},
        "entities": [],
        "measurements": [
            {"name": "severity", "value": severity, "unit": "level"},
            {"name": "certainty", "value": props.get("certainty"), "unit": "level"},
            {"name": "urgency", "value": props.get("urgency"), "unit": "level"},
        ],
        "relationships": [],
        "documents": [{"url": url}] if url else [],
        "quality": {},
        "provenance": {
            "source": SOURCE_ID,
            "feed": FEED,
            "sender": props.get("senderName"),
            "fetched_ts": int(time.time() * 1000),
        },
        "raw_hash": raw_hash,
        "_event": event,
        "_severity": severity,
        "_headline": headline,
        "_area": area,
        "_url": url,
        "_expires": expires,
    }


# ── quality gate ─────────────────────────────────────────────────────────────
def quality_gate(env: dict) -> dict:
    """Return {pass, checks}. Rejects malformed / eventless / expired records."""
    checks = {}
    checks["has_record_id"] = bool(env.get("record_id"))
    checks["has_event"] = bool(env.get("_event"))
    checks["has_severity"] = bool(env.get("_severity"))
    exp = _to_epoch_ms(env.get("_expires"))
    # fresh == not yet expired. If we couldn't parse an expiry, don't reject on it.
    checks["fresh"] = (not isinstance(exp, (int, float))) or (exp >= time.time() * 1000)
    return {"pass": all(checks.values()), "checks": checks}


# ── writer: envelope -> ontology object + audit ──────────────────────────────
def _ensure_type() -> None:
    if ont is None:
        return
    try:
        ont.define_object_type(
            "WeatherAlert",
            {"event": "str", "severity": "str", "area": "str",
             "headline": "str", "url": "str", "record_id": "str"},
            states=["observed", "reviewed"], initial="observed")
    except Exception:  # noqa: BLE001
        pass


def run_pipeline(*, limit: int = 50, live: bool = True, raw: dict | None = None) -> dict:
    """Full slice: fetch -> parse -> gate -> write ontology object -> audit.
    ``raw`` lets tests inject a fixed GeoJSON (no network)."""
    data = raw if raw is not None else (fetch() if live else None)
    if not data or not isinstance(data.get("features"), list):
        return {"status": "no_data", "source": SOURCE_ID, "ingested": 0,
                "rejected": 0, "samples": []}
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
                obj = ont.create_object("WeatherAlert", {
                    "event": env["_event"],
                    "severity": env["_severity"],
                    "area": env["_area"],
                    "headline": env["_headline"],
                    "url": env["_url"],
                    "record_id": env["record_id"],
                }, role="analyst", actor="world-runtime")
                if obj.get("status") == "created":
                    ingested += 1
                    if aip is not None:
                        aip.record_lineage(
                            "world.ingest.weather", obj["id"], actor="world-runtime",
                            derived_from=[env["record_id"]],
                            meta={"source": SOURCE_ID, "raw_hash": env["raw_hash"]})
                    if len(samples) < 5:
                        samples.append({"event": env["_event"],
                                        "severity": env["_severity"],
                                        "area": env["_area"], "id": obj["id"]})
                else:
                    rejected += 1
            except Exception:  # noqa: BLE001
                rejected += 1
    if jos is not None:
        jos.audit("world.pipeline.weather", actor="world-runtime", target=SOURCE_ID,
                  meta={"ingested": ingested, "rejected": rejected})
    return {"status": "ok", "source": SOURCE_ID, "ingested": ingested,
            "rejected": rejected, "samples": samples}
