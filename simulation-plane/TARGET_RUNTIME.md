# TARGET_RUNTIME — Simulation / Sandbox

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `simulation-service (JVM)` |
| **Production language** | Java + Scala Spark + native solvers |
| **Database / storage owned** | PostgreSQL + Iceberg/Nessie branches |
| **Event topic(s) owned** | `sandbox` |
| **API contract** | `contracts/openapi/simulation-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/jarvis_sandbox.py + jarvis_sim.py` |

## State this plane owns
sandbox universes, object/data branching, what-if, optimisation, scenario compare/promote/discard

## The eight questions
- **What state does it own?** sandbox universes, object/data branching, what-if, optimisation, scenario compare/promote/discard
- **What database stores it?** PostgreSQL + Iceberg/Nessie branches
- **What API exposes it?** `simulation-api.yaml`
- **What events does it emit?** topic `sandbox` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java + Scala Spark + native solvers
- **What future service does it split into?** `simulation-service (JVM)`

## Migration path (Layer A → Layer B)
Re-implement `server/services/jarvis_sandbox.py + jarvis_sim.py` behind the **same** API + event + table contracts:
1. Port domain logic to Java + Scala Spark + native solvers.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
