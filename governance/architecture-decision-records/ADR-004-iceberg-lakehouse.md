# ADR-004: Apache Iceberg for time-travel storage

**Status:** Accepted

## Context

Snapshots, schema/partition evolution, branching and historical reads provide reproducible, branchable data the relational store cannot.

## Decision

Apache Iceberg for time-travel storage.

## Consequences

The Layer A Python reference implementation in `server/services/jarvis_*.py` is bound to the contracts in `contracts/` and `database/`, so production re-implementation in the target language is a port behind a stable contract, not a redesign.
