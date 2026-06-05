# TARGET_RUNTIME — Entity Resolution

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `entity-resolution-service (JVM) + Spark` |
| **Production language** | Java + Scala Spark |
| **Database / storage owned** | PostgreSQL + Iceberg + graph store |
| **Event topic(s) owned** | `entity` |
| **API contract** | `contracts/openapi/entity-resolution-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/jarvis_er.py` |

## State this plane owns
canonical IDs, crosswalks, candidate clusters, match scores, golden records, merge/split history, adjudication

## The eight questions
- **What state does it own?** canonical IDs, crosswalks, candidate clusters, match scores, golden records, merge/split history, adjudication
- **What database stores it?** PostgreSQL + Iceberg + graph store
- **What API exposes it?** `entity-resolution-api.yaml`
- **What events does it emit?** topic `entity` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java + Scala Spark
- **What future service does it split into?** `entity-resolution-service (JVM) + Spark`

## Migration path (Layer A → Layer B)
Re-implement `server/services/jarvis_er.py` behind the **same** API + event + table contracts:
1. Port domain logic to Java + Scala Spark.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
