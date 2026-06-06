
from __future__ import annotations
import datetime, hashlib, json
from typing import Any, Dict

HIGH_RISK = {"deploy_connector", "disable_source", "quarantine_data", "export_evidence", "apollo_rollback"}

def execute_action(action_type: str, target_id: str = "", actor: str = "", purpose: str = "", approval_id: str | None = None, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    if not actor or not purpose:
        return {"ok": False, "blocked": True, "reason": "actor and purpose required", "action_type": action_type}
    if action_type in HIGH_RISK and not approval_id:
        return {"ok": False, "blocked": True, "reason": "approval required for high-risk action", "action_type": action_type, "target_id": target_id}
    raw = {"action_type": action_type, "target_id": target_id, "actor": actor, "purpose": purpose, "payload": payload, "time": datetime.datetime.now(datetime.UTC).isoformat()}
    return {"ok": True, "blocked": False, "action_id": "ACT-" + hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest()[:16], **raw}
