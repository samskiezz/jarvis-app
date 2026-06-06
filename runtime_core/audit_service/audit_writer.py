
from __future__ import annotations
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import hashlib, json, os

AUDIT_FILE = os.environ.get("WORLD_OS_AUDIT_FILE", "runtime_core/audit_service/audit_events.jsonl")

def sha256_json(payload: Any) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()

def read_last_hash(path: str = AUDIT_FILE) -> str:
    if not os.path.exists(path):
        return "GENESIS"
    last = ""
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                last = line
    if not last:
        return "GENESIS"
    try:
        return json.loads(last).get("event_hash", "GENESIS")
    except Exception:
        return "GENESIS"

def write_audit_event(actor: str, purpose: str, action_type: str, payload: Dict[str, Any], policy_decision: str = "allow") -> Dict[str, Any]:
    previous_hash = read_last_hash()
    now = datetime.now(timezone.utc).isoformat()
    event = {
        "audit_id": f"AUD-{now}-{sha256_json(payload)[:12]}",
        "actor": actor,
        "actor_type": "service_or_user",
        "purpose": purpose,
        "action_type": action_type,
        "policy_decision": policy_decision,
        "input_hash": sha256_json(payload),
        "previous_hash": previous_hash,
        "timestamp": now,
        "payload": payload
    }
    event["event_hash"] = sha256_json({k:v for k,v in event.items() if k != "event_hash"})
    os.makedirs(os.path.dirname(AUDIT_FILE), exist_ok=True)
    with open(AUDIT_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, sort_keys=True) + "\n")
    return event
