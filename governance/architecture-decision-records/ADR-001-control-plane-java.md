# ADR-001: Control plane in Java/JVM

**Status:** Accepted

## Context

Long-running state reconciliation, transactional consistency, strong typing and enterprise security favour the JVM over Python for the control plane.

## Decision

Control plane in Java/JVM.

## Consequences

The Layer A Python reference implementation in `server/services/jarvis_*.py` is bound to the contracts in `contracts/` and `database/`, so production re-implementation in the target language is a port behind a stable contract, not a redesign.
