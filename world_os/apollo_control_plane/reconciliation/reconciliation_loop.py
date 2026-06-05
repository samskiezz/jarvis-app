
from __future__ import annotations
from typing import Dict, Any
import time

def reconcile_once(desired: Dict[str, Any], observer, planner, applier=None) -> Dict[str, Any]:
    current = observer()
    plan = planner(desired, current)
    result = {"current": current, "plan": plan, "applied": False}
    if applier and plan.get("safe_to_apply") and not plan.get("requires_approval"):
        result["apply_result"] = applier(plan)
        result["applied"] = True
    return result

def reconcile_forever(desired: Dict[str, Any], observer, planner, applier=None, interval_seconds: int = 30):
    while True:
        yield reconcile_once(desired, observer, planner, applier)
        time.sleep(interval_seconds)
