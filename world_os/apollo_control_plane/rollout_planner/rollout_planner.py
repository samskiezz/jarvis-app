
from __future__ import annotations
from typing import List, Dict, Any

def create_rollout_plan(service: str, target_version: str, nodes: List[str], wave_size: int = 1) -> Dict[str, Any]:
    waves = []
    for i in range(0, len(nodes), wave_size):
        waves.append({"wave": len(waves)+1, "nodes": nodes[i:i+wave_size], "health_gate_required": True})
    return {
        "service": service,
        "target_version": target_version,
        "strategy": "canary_then_progressive",
        "waves": waves,
        "rollback_on_failed_gate": True
    }
