
from __future__ import annotations
import datetime
from typing import Any, Dict

def run_quality_gate(gate_name: str, envelope: Dict[str, Any] | None = None, **kwargs) -> Dict[str, Any]:
    envelope = envelope or {}
    gate_name = gate_name or "generic_quality_gate"
    checks = {
        "has_source_id": bool(envelope.get("source_id")),
        "has_record_id": bool(envelope.get("record_id")),
        "has_provenance": bool(envelope.get("provenance")),
        "has_raw_hash": bool(envelope.get("raw_hash")),
    }
    if "geospatial" in gate_name or "coordinate" in gate_name:
        loc = envelope.get("location") or {}
        checks["location_is_dict"] = isinstance(loc, dict)
    if "freshness" in gate_name or "time" in gate_name:
        checks["has_valid_time"] = bool(envelope.get("valid_time"))
    if "licence" in gate_name or "source" in gate_name:
        checks["source_status_known"] = bool(kwargs.get("source_status") or envelope.get("provenance", {}).get("source_id"))
    passed = all(checks.values())
    return {
        "gate_name": gate_name,
        "passed": passed,
        "checks": checks,
        "severity": "block" if not passed else "pass",
        "checked_at": datetime.datetime.now(datetime.UTC).isoformat(),
    }
