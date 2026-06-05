# ADR-006: No Python in the control plane

**Status:** Accepted

## Context

Python is permitted only for research/notebooks/offline ML. Control plane, ontology kernel, action engine, policy, audit and fleet agents are JVM/Go. The Python jarvis_* modules are reference implementations, not the production core.

## Decision

No Python in the control plane.

## Consequences

The Layer A Python reference implementation in `server/services/jarvis_*.py` is bound to the contracts in `contracts/` and `database/`, so production re-implementation in the target language is a port behind a stable contract, not a redesign.
