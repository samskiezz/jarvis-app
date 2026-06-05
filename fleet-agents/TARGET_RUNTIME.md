# TARGET_RUNTIME — Fleet Agents

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `go-agent (Go)` |
| **Production language** | Go |
| **Database / storage owned** | SQLite/BadgerDB/RocksDB (local) |
| **Event topic(s) owned** | `fleet` |
| **API contract** | `contracts/openapi/(grpc) fleet-agent.proto` (or noted contract) |
| **Reference implementation (Layer A)** | `(control logic in jarvis_apollo.py)` |

## State this plane owns
node identity, heartbeat, desired-state polling, local reconciliation, health probes, offline buffering, signature verification

## The eight questions
- **What state does it own?** node identity, heartbeat, desired-state polling, local reconciliation, health probes, offline buffering, signature verification
- **What database stores it?** SQLite/BadgerDB/RocksDB (local)
- **What API exposes it?** `(grpc) fleet-agent.proto`
- **What events does it emit?** topic `fleet` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Go
- **What future service does it split into?** `go-agent (Go)`

## Migration path (Layer A → Layer B)
Re-implement `(control logic in jarvis_apollo.py)` behind the **same** API + event + table contracts:
1. Port domain logic to Go.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
