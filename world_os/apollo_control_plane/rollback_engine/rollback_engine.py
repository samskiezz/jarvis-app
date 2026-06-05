
from __future__ import annotations
from typing import Dict, Any

def build_rollback_plan(service: str, from_version: str, to_version: str, affected_nodes: list[str]) -> Dict[str, Any]:
    return {
        "service": service,
        "rollback_from": from_version,
        "rollback_to": to_version,
        "affected_nodes": affected_nodes,
        "steps": [
            {"op": "pause_rollout", "service": service},
            {"op": "drain_nodes", "nodes": affected_nodes},
            {"op": "deploy_version", "service": service, "version": to_version},
            {"op": "run_health_gates", "service": service},
            {"op": "write_audit", "service": service}
        ],
        "approval_required": True,
        "audit_required": True
    }
