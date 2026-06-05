# TARGET_RUNTIME — Workflow Plane

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `workflow-service + temporal-workers` |
| **Production language** | Java + Temporal/Camunda |
| **Database / storage owned** | Temporal persistence / PostgreSQL + Kafka |
| **Event topic(s) owned** | `workflow` |
| **API contract** | `contracts/openapi/workflow-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/brain_planner.py (partial)` |

## State this plane owns
workflow definitions/executions, human tasks, timers, escalations, retries, compensating actions

## The eight questions
- **What state does it own?** workflow definitions/executions, human tasks, timers, escalations, retries, compensating actions
- **What database stores it?** Temporal persistence / PostgreSQL + Kafka
- **What API exposes it?** `workflow-api.yaml`
- **What events does it emit?** topic `workflow` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java + Temporal/Camunda
- **What future service does it split into?** `workflow-service + temporal-workers`

## Migration path (Layer A → Layer B)
Re-implement `server/services/brain_planner.py (partial)` behind the **same** API + event + table contracts:
1. Port domain logic to Java + Temporal/Camunda.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
