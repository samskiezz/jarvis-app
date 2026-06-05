
from __future__ import annotations
from typing import Any, Dict
from datetime import datetime, timezone

REQUIRED_FIELDS = [
    "source_id","record_id","record_type","observed_at","valid_time","location","entities",
    "measurements","relationships","documents","quality","provenance","raw_hash"
]

def envelope_from_raw(raw_record: Dict[str, Any]) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "source_id": raw_record.get("source_id", ""),
        "record_id": raw_record.get("record_id", raw_record.get("raw_hash", "")),
        "record_type": raw_record.get("record_type", "generic_record"),
        "observed_at": raw_record.get("fetched_at", now),
        "valid_time": raw_record.get("valid_time", raw_record.get("fetched_at", now)),
        "location": raw_record.get("location", {}),
        "entities": raw_record.get("entities", []),
        "measurements": raw_record.get("measurements", []),
        "relationships": raw_record.get("relationships", []),
        "documents": raw_record.get("documents", []),
        "quality": raw_record.get("quality", {}),
        "provenance": raw_record.get("provenance", {"source_id": raw_record.get("source_id","")}),
        "raw_hash": raw_record.get("raw_hash", "")
    }

def validate_envelope(envelope: Dict[str, Any]) -> list[str]:
    errors = []
    for field in REQUIRED_FIELDS:
        if field not in envelope:
            errors.append(f"missing field: {field}")
    if not isinstance(envelope.get("entities", []), list):
        errors.append("entities must be list")
    if not isinstance(envelope.get("relationships", []), list):
        errors.append("relationships must be list")
    return errors
