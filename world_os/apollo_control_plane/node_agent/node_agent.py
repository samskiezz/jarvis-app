
"""
Reference Apollo-style node agent.
Observes local state, compares to desired state, emits reconciliation plan.
"""
from __future__ import annotations
from typing import Dict, Any, List
import os, json, datetime, hashlib

def observe_current_state() -> Dict[str, Any]:
    return {
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        "services": [],
        "health": {"node_ok": True},
        "drift": []
    }

def plan_reconciliation(desired: Dict[str, Any], current: Dict[str, Any]) -> Dict[str, Any]:
    desired_services = {s["name"]: s for s in desired.get("services", [])}
    current_services = {s.get("name"): s for s in current.get("services", [])}
    steps = []
    for name, svc in desired_services.items():
        cur = current_services.get(name)
        if not cur:
            steps.append({"op": "install_or_start", "service": name, "target_version": svc.get("version")})
        elif cur.get("version") != svc.get("version"):
            steps.append({"op": "upgrade", "service": name, "from": cur.get("version"), "to": svc.get("version")})
    return {
        "plan_id": "PLAN-" + hashlib.sha256(json.dumps(steps, sort_keys=True).encode()).hexdigest()[:12],
        "steps": steps,
        "safe_to_apply": True,
        "requires_approval": any(s["op"] == "upgrade" for s in steps)
    }

def run_agent(desired: Dict[str, Any]) -> Dict[str, Any]:
    current = observe_current_state()
    plan = plan_reconciliation(desired, current)
    return {"current": current, "plan": plan}
