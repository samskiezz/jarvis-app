"""Real lab-information software (feature category G, software side).

The software half of a self-driving lab — LIMS, assay/reagent registries,
protocol compilation, scheduling, error detection. These are genuinely
implementable in code.

NOTE: the *physical* robotic actuation modules (pipetting/heating/cooling/
imaging/synthesis/sequencing/cleaning) are deliberately NOT implemented here —
they require real hardware and are kept as honest gaps rather than faked.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class LIMS:
    """Laboratory Information Management System: track samples + their state."""
    samples: dict[str, dict] = field(default_factory=dict)

    def register(self, sample_id: str, meta: dict) -> None:
        self.samples[sample_id] = {**meta, "state": "registered", "custody": []}

    def transition(self, sample_id: str, state: str, operator: str) -> bool:
        if sample_id not in self.samples:
            return False
        self.samples[sample_id]["state"] = state
        self.samples[sample_id]["custody"].append((operator, state))
        return True

    def status(self, sample_id: str) -> dict | None:
        return self.samples.get(sample_id)


def assay_registry(assays: list[dict]) -> dict:
    """Assay registry: index assays by id with their target + method."""
    by_id = {a["id"]: a for a in assays}
    return {"count": len(by_id), "ids": sorted(by_id),
            "targets": sorted({a.get("target", "?") for a in assays})}


def reagent_inventory(reagents: list[dict]) -> dict:
    """Reagent-inventory engine: total stock + reagents below reorder level."""
    low = [r["name"] for r in reagents if r.get("qty", 0) < r.get("reorder", 0)]
    return {"items": len(reagents), "low_stock": low,
            "total_qty": sum(r.get("qty", 0) for r in reagents)}


def robotic_protocol_compiler(steps: list[dict]) -> dict:
    """Robotic-protocol compiler: turn a high-level protocol into an ordered list
    of machine commands (software compilation — does NOT actuate hardware)."""
    ordered = sorted(steps, key=lambda s: s.get("order", 0))
    commands = [{"op": s["op"], "params": s.get("params", {})} for s in ordered]
    duration = sum(s.get("duration_s", 0) for s in ordered)
    return {"commands": commands, "n_commands": len(commands),
            "est_duration_s": duration}


def lab_task_scheduler(tasks: list[dict]) -> dict:
    """Lab task scheduler: order tasks by priority then deadline (real list
    scheduling) and compute the makespan."""
    ordered = sorted(tasks, key=lambda t: (-t.get("priority", 0), t.get("deadline", 1e9)))
    t = 0
    schedule = []
    for task in ordered:
        schedule.append({"id": task["id"], "start": t})
        t += task.get("duration", 1)
    return {"schedule": schedule, "makespan": t}


def robotic_error_detection(readings: list[float], *, expected: float, tol: float) -> dict:
    """Robotic-error detection: flag execution steps whose sensor reading
    deviates beyond tolerance (software monitoring of any actuator)."""
    errors = [i for i, r in enumerate(readings) if abs(r - expected) > tol]
    return {"error_steps": errors, "ok": not errors}
