
from __future__ import annotations
import datetime, hashlib, json
from typing import Any, Dict

REQUIRED_FIELDS = [
    "source_id", "record_id", "record_type", "observed_at", "valid_time",
    "location", "entities", "measurements", "relationships", "documents",
    "quality", "provenance", "raw_hash"
]

def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()

def build_envelope(
    source_id: str = "",
    record_type: str = "generic_record",
    payload: Dict[str, Any] | None = None,
    location: Dict[str, Any] | None = None,
    entities: list | None = None,
    measurements: list | None = None,
    relationships: list | None = None,
    documents: list | None = None,
    provenance: Dict[str, Any] | None = None,
    quality: Dict[str, Any] | None = None,
    valid_time: str | None = None,
) -> Dict[str, Any]:
    payload = payload or {}
    now = datetime.datetime.now(datetime.UTC).isoformat()
    raw_hash = stable_hash(payload)
    return {
        "source_id": source_id or payload.get("source_id", "unknown"),
        "record_id": payload.get("record_id") or f"{source_id or 'record'}:{raw_hash[:16]}",
        "record_type": record_type,
        "observed_at": payload.get("observed_at") or payload.get("fetched_at") or now,
        "valid_time": valid_time or payload.get("valid_time") or payload.get("observed_at") or now,
        "location": location or payload.get("location") or {},
        "entities": entities if entities is not None else payload.get("entities", []),
        "measurements": measurements if measurements is not None else payload.get("measurements", []),
        "relationships": relationships if relationships is not None else payload.get("relationships", []),
        "documents": documents if documents is not None else payload.get("documents", []),
        "quality": quality or {"valid": True, "parser": "world_os_runtime", "confidence": 0.7},
        "provenance": provenance or {"source_id": source_id or payload.get("source_id", "unknown")},
        "raw_hash": raw_hash,
    }

def validate_envelope(envelope: Dict[str, Any]) -> Dict[str, Any]:
    missing = [field for field in REQUIRED_FIELDS if field not in envelope]
    return {"valid": not missing, "missing": missing, "required": REQUIRED_FIELDS}
