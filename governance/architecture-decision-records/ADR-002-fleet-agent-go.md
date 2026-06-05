# ADR-002: Fleet agents in Go

**Status:** Accepted

## Context

Static binaries, low memory, high concurrency and reliable operation over poor/edge networks make Go the right choice for node agents.

## Decision

Fleet agents in Go.

## Consequences

The Layer A Python reference implementation in `server/services/jarvis_*.py` is bound to the contracts in `contracts/` and `database/`, so production re-implementation in the target language is a port behind a stable contract, not a redesign.
