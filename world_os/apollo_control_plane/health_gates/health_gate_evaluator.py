
from __future__ import annotations
from typing import Dict, Any

DEFAULT_THRESHOLDS = {
    "error_rate": 0.01,
    "p95_latency_ms": 1000,
    "audit_completeness": 1.0,
    "quality_gate_pass_rate": 0.99
}

def evaluate_health(metrics: Dict[str, float], thresholds: Dict[str, float] | None = None) -> Dict[str, Any]:
    thresholds = thresholds or DEFAULT_THRESHOLDS
    results = {}
    for key, threshold in thresholds.items():
        value = metrics.get(key)
        if value is None:
            results[key] = {"passed": False, "reason": "metric missing"}
        elif key in ("error_rate", "p95_latency_ms"):
            results[key] = {"passed": value <= threshold, "value": value, "threshold": threshold}
        else:
            results[key] = {"passed": value >= threshold, "value": value, "threshold": threshold}
    return {"passed": all(r["passed"] for r in results.values()), "results": results}
