
from __future__ import annotations
from typing import Dict, Any
import json, os, datetime, hashlib

ACTION_STORE = os.environ.get("WORLD_OS_ACTION_STORE", "runtime_core/action_engine/action_executions.jsonl")

RISKY_ACTIONS = {"deploy_connector", "disable_source", "quarantine_data", "apollo_rollback", "export_evidence"}

def policy_check(action_type: str, actor: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if action_type in RISKY_ACTIONS and not payload.get("approval_id"):
        return {"allow": False, "reason": "approval required"}
    if payload.get("policy_blocked"):
        return {"allow": False, "reason": "payload policy blocked"}
    return {"allow": True, "reason": "allowed"}

def execute_action(action_type: str, actor: str, purpose: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    decision = policy_check(action_type, actor, payload)
    now = datetime.datetime.now(datetime.UTC).isoformat()
    execution = {
        "action_execution_id": "ACT-" + hashlib.sha256(f"{action_type}{actor}{now}".encode()).hexdigest()[:14],
        "action_type": action_type,
        "actor": actor,
        "purpose": purpose,
        "payload": payload,
        "policy_decision": decision,
        "status": "executed" if decision["allow"] else "blocked",
        "timestamp": now,
        "compensating_action": "manual_review" if not decision["allow"] else payload.get("compensating_action", "none")
    }
    os.makedirs(os.path.dirname(ACTION_STORE), exist_ok=True)
    with open(ACTION_STORE, "a", encoding="utf-8") as f:
        f.write(json.dumps(execution, sort_keys=True) + "\n")
    return execution
