
from __future__ import annotations
from typing import Dict, Any, List
from datetime import datetime, timezone, timedelta

def gate_schema_valid(envelope: Dict[str, Any]) -> tuple[bool, str]:
    required = ["source_id","record_id","record_type","observed_at","valid_time","provenance","raw_hash"]
    missing = [r for r in required if not envelope.get(r)]
    return (not missing, f"missing={missing}")

def gate_provenance_complete(envelope: Dict[str, Any]) -> tuple[bool, str]:
    prov = envelope.get("provenance") or {}
    ok = bool(prov.get("source_id") or envelope.get("source_id"))
    return ok, "provenance source present" if ok else "provenance source missing"

def gate_terms_approved(source_context: Dict[str, Any]) -> tuple[bool, str]:
    status = source_context.get("terms_status", "pending")
    ok = status in ("approved","public_approved","owned")
    return ok, f"terms_status={status}"

def gate_freshness(envelope: Dict[str, Any], max_age_hours: int = 24) -> tuple[bool, str]:
    ts = envelope.get("observed_at")
    try:
        dt = datetime.fromisoformat(ts.replace("Z","+00:00"))
        age = datetime.now(timezone.utc) - dt
        ok = age <= timedelta(hours=max_age_hours)
        return ok, f"age_hours={age.total_seconds()/3600:.2f}"
    except Exception as e:
        return False, f"invalid timestamp: {e}"

def run_quality_gates(envelope: Dict[str, Any], source_context: Dict[str, Any]) -> Dict[str, Any]:
    checks = {
        "schema_valid": gate_schema_valid(envelope),
        "provenance_complete": gate_provenance_complete(envelope),
        "terms_approved": gate_terms_approved(source_context),
        "freshness": gate_freshness(envelope, int(source_context.get("max_age_hours", 24))),
    }
    results = {name: {"passed": ok, "detail": detail} for name, (ok, detail) in checks.items()}
    passed = all(x["passed"] for x in results.values())
    return {"passed": passed, "results": results}
