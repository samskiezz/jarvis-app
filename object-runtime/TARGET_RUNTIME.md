# TARGET_RUNTIME — Object Runtime

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `object-service (JVM)` |
| **Production language** | Java/JVM |
| **Database / storage owned** | PostgreSQL (platform_objects, platform_links) + Kafka + Iceberg + OpenSearch |
| **Event topic(s) owned** | `objects` |
| **API contract** | `contracts/openapi/object-runtime-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/jarvis_ontology.py (object store)` |

## State this plane owns
object instances, link instances, current state, timelines, subscriptions, available actions

## The eight questions
- **What state does it own?** object instances, link instances, current state, timelines, subscriptions, available actions
- **What database stores it?** PostgreSQL (platform_objects, platform_links) + Kafka + Iceberg + OpenSearch
- **What API exposes it?** `object-runtime-api.yaml`
- **What events does it emit?** topic `objects` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java/JVM
- **What future service does it split into?** `object-service (JVM)`

## Migration path (Layer A → Layer B)
Re-implement `server/services/jarvis_ontology.py (object store)` behind the **same** API + event + table contracts:
1. Port domain logic to Java/JVM.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
