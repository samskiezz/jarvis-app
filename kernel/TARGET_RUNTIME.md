# TARGET_RUNTIME — Kernel

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `kernel-core (JVM library)` |
| **Production language** | Java/JVM |
| **Database / storage owned** | none (types only) |
| **Event topic(s) owned** | `(all)` |
| **API contract** | `contracts/openapi/kernel-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `contracts/protobuf/kernel.proto` |

## State this plane owns
identity, classification, event/audit envelopes, bitemporal + provenance primitives, error model

## The eight questions
- **What state does it own?** identity, classification, event/audit envelopes, bitemporal + provenance primitives, error model
- **What database stores it?** none (types only)
- **What API exposes it?** `kernel-api.yaml`
- **What events does it emit?** topic `(all)` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java/JVM
- **What future service does it split into?** `kernel-core (JVM library)`

## Migration path (Layer A → Layer B)
Re-implement `contracts/protobuf/kernel.proto` behind the **same** API + event + table contracts:
1. Port domain logic to Java/JVM.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
