"""Repo-wide high-assurance mission-control layer.

Provides:
- typed command bus  (assurance.commands)
- typed event bus    (assurance.events)
- audit log + redact (assurance.audit)
- telemetry          (assurance.telemetry)
- state-machine workflows (assurance.workflows)
- invariant runner   (assurance.invariants)
- safety gates       (assurance.gates)
- formal spec stubs  (assurance.tla, assurance.formal)
- fuzz harness       (assurance.fuzz)

All wrapping of existing code is additive — original call signatures preserved.
Open-source patterns referenced: seL4, NASA fprime/cFS/openmct, AFL++, Z3, TLA+.
"""
from . import audit, commands, events, gates, invariants, telemetry, workflows  # noqa: F401

__version__ = "0.1.0"
__all__ = ["audit", "commands", "events", "gates", "invariants", "telemetry", "workflows"]
