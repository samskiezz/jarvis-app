# TARGET_RUNTIME — Event Plane

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `event-gateway (JVM) + Kafka` |
| **Production language** | Java (gateway), Kafka (broker) |
| **Database / storage owned** | PostgreSQL (registry) + Iceberg (archive) |
| **Event topic(s) owned** | `(all topics)` |
| **API contract** | `contracts/openapi/(asyncapi) platform-events.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/jarvis_events.py` |

## State this plane owns
Kafka topics, event schemas, validation, publishing, replay, dead-letter, correlation/causation

## The eight questions
- **What state does it own?** Kafka topics, event schemas, validation, publishing, replay, dead-letter, correlation/causation
- **What database stores it?** PostgreSQL (registry) + Iceberg (archive)
- **What API exposes it?** `(asyncapi) platform-events.yaml`
- **What events does it emit?** topic `(all topics)` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java (gateway), Kafka (broker)
- **What future service does it split into?** `event-gateway (JVM) + Kafka`

## Migration path (Layer A → Layer B)
Re-implement `server/services/jarvis_events.py` behind the **same** API + event + table contracts:
1. Port domain logic to Java (gateway), Kafka (broker).
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
