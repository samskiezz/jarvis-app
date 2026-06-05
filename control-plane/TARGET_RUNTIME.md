# TARGET_RUNTIME — Control Plane (Apollo)

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `control-plane-service (JVM) + Go agents` |
| **Production language** | Java/Spring Boot |
| **Database / storage owned** | PostgreSQL (platform_control, platform_deployment) |
| **Event topic(s) owned** | `control, deployment` |
| **API contract** | `contracts/openapi/control-plane-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/jarvis_apollo.py` |

## State this plane owns
environment desired/current state, deployment plans, rollout waves, rollback, fleet state, drift

## The eight questions
- **What state does it own?** environment desired/current state, deployment plans, rollout waves, rollback, fleet state, drift
- **What database stores it?** PostgreSQL (platform_control, platform_deployment)
- **What API exposes it?** `control-plane-api.yaml`
- **What events does it emit?** topic `control, deployment` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java/Spring Boot
- **What future service does it split into?** `control-plane-service (JVM) + Go agents`

## Migration path (Layer A → Layer B)
Re-implement `server/services/jarvis_apollo.py` behind the **same** API + event + table contracts:
1. Port domain logic to Java/Spring Boot.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
