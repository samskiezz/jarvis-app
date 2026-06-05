# TARGET_RUNTIME — Ontology Kernel

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `ontology-kernel (JVM)` |
| **Production language** | Java/JVM |
| **Database / storage owned** | PostgreSQL (platform_ontology) |
| **Event topic(s) owned** | `ontology` |
| **API contract** | `contracts/openapi/ontology-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/jarvis_ontology.py` |

## State this plane owns
object/property/link/action/function types, lifecycle, source mappings, ontology versioning, SDK generation

## The eight questions
- **What state does it own?** object/property/link/action/function types, lifecycle, source mappings, ontology versioning, SDK generation
- **What database stores it?** PostgreSQL (platform_ontology)
- **What API exposes it?** `ontology-api.yaml`
- **What events does it emit?** topic `ontology` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java/JVM
- **What future service does it split into?** `ontology-kernel (JVM)`

## Migration path (Layer A → Layer B)
Re-implement `server/services/jarvis_ontology.py` behind the **same** API + event + table contracts:
1. Port domain logic to Java/JVM.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
