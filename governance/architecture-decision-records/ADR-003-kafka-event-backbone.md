# ADR-003: Kafka as the event backbone

**Status:** Accepted

## Context

An immutable, replayable, partitioned log is the platform nervous system; the reference jarvis_events log uses the same envelope so the swap is transparent.

## Decision

Kafka as the event backbone.

## Consequences

The Layer A Python reference implementation in `server/services/jarvis_*.py` is bound to the contracts in `contracts/` and `database/`, so production re-implementation in the target language is a port behind a stable contract, not a redesign.
