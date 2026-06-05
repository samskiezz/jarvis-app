# TARGET_RUNTIME — Kinetic Action Engine

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `action-engine (JVM)` |
| **Production language** | Java/JVM + Temporal |
| **Database / storage owned** | PostgreSQL (platform_actions) + Kafka |
| **Event topic(s) owned** | `actions` |
| **API contract** | `contracts/openapi/action-engine-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/jarvis_aip.py + jarvis_ontology.apply_action` |

## State this plane owns
action definitions, requests, preconditions, policy eval, approvals, execution, writeback, compensation

## The eight questions
- **What state does it own?** action definitions, requests, preconditions, policy eval, approvals, execution, writeback, compensation
- **What database stores it?** PostgreSQL (platform_actions) + Kafka
- **What API exposes it?** `action-engine-api.yaml`
- **What events does it emit?** topic `actions` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java/JVM + Temporal
- **What future service does it split into?** `action-engine (JVM)`

## Migration path (Layer A → Layer B)
Re-implement `server/services/jarvis_aip.py + jarvis_ontology.apply_action` behind the **same** API + event + table contracts:
1. Port domain logic to Java/JVM + Temporal.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
