
from __future__ import annotations
import csv, json, datetime, re
from typing import Any, Dict
from .envelope import build_envelope, validate_envelope

def _as_payload(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {"text": raw}
    return {"value": raw}

def parse_weather(raw: Any, source_id: str = "weather") -> Dict[str, Any]:
    payload = _as_payload(raw)
    props = payload.get("properties", payload)
    measurements = []
    for key in ["temperature", "dewpoint", "windSpeed", "barometricPressure", "relativeHumidity", "heatIndex", "windChill"]:
        if key in props:
            measurements.append({"name": key, "value": props[key]})
    return build_envelope(source_id=source_id, record_type="weather_observation", payload=payload, measurements=measurements)

def parse_geo_event(raw: Any, source_id: str = "geo") -> Dict[str, Any]:
    payload = _as_payload(raw)
    features = payload.get("features", [])
    entities = []
    measurements = []
    for f in features[:100]:
        props = f.get("properties", {})
        geom = f.get("geometry", {})
        entities.append({"type": "event", "id": props.get("id") or props.get("code") or props.get("time"), "properties": props, "geometry": geom})
        if "mag" in props:
            measurements.append({"name": "magnitude", "value": props.get("mag")})
    return build_envelope(source_id=source_id, record_type="geospatial_event_feed", payload=payload, entities=entities, measurements=measurements)

def parse_table(raw: Any, source_id: str = "table") -> Dict[str, Any]:
    payload = _as_payload(raw)
    if "text" in payload:
        rows = list(csv.DictReader(payload["text"].splitlines()))
    elif isinstance(payload.get("content"), list):
        rows = payload["content"]
    else:
        rows = payload.get("rows", [])
    return build_envelope(source_id=source_id, record_type="tabular_record_batch", payload={"row_count": len(rows), "rows": rows[:100]}, entities=[{"type": "row", "properties": r} for r in rows[:100]])

def parse_generic(raw: Any, source_id: str = "generic", record_type: str = "generic_record") -> Dict[str, Any]:
    payload = _as_payload(raw)
    return build_envelope(source_id=source_id, record_type=record_type, payload=payload)

def parse_by_name(parser_name: str, raw: Any = None, source_id: str = "unknown") -> Dict[str, Any]:
    name = (parser_name or "").lower()
    if "weather" in name or "air_quality" in name or "radiation" in name:
        return parse_weather(raw or {}, source_id)
    if any(token in name for token in ["earthquake", "tsunami", "wildfire", "hurricane", "cyclone", "stac"]):
        return parse_geo_event(raw or {}, source_id)
    if any(token in name for token in ["csv", "gtfs", "filing", "sanctions", "procurement", "patent", "clinical", "publication", "cve"]):
        return parse_table(raw or {}, source_id)
    return parse_generic(raw or {}, source_id, record_type=name.replace("_parser", "") or "generic_record")
