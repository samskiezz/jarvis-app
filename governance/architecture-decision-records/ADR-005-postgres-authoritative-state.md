# ADR-005: PostgreSQL for authoritative metadata

**Status:** Accepted

## Context

ACID, RLS, jsonb and mature operational tooling make Postgres the authoritative state store; history goes to Iceberg, events to Kafka.

## Decision

PostgreSQL for authoritative metadata.

## Consequences

The Layer A Python reference implementation in `server/services/jarvis_*.py` is bound to the contracts in `contracts/` and `database/`, so production re-implementation in the target language is a port behind a stable contract, not a redesign.
