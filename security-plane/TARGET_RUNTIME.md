# TARGET_RUNTIME — Security Plane

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `policy-gateway (Java+OPA/Cedar)` |
| **Production language** | Java/JVM + Go sidecars |
| **Database / storage owned** | PostgreSQL (platform_identity, platform_policy) |
| **Event topic(s) owned** | `policy` |
| **API contract** | `contracts/openapi/policy-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/jarvis_policy.py + jarvis_os.py` |

## State this plane owns
identity, classification, RBAC/ABAC/PBAC, object/property/link/action/tool/model permissions, redaction, break-glass

## The eight questions
- **What state does it own?** identity, classification, RBAC/ABAC/PBAC, object/property/link/action/tool/model permissions, redaction, break-glass
- **What database stores it?** PostgreSQL (platform_identity, platform_policy)
- **What API exposes it?** `policy-api.yaml`
- **What events does it emit?** topic `policy` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java/JVM + Go sidecars
- **What future service does it split into?** `policy-gateway (Java+OPA/Cedar)`

## Migration path (Layer A → Layer B)
Re-implement `server/services/jarvis_policy.py + jarvis_os.py` behind the **same** API + event + table contracts:
1. Port domain logic to Java/JVM + Go sidecars.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
