# TARGET_RUNTIME — Mission Applications

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `mission-shell (React)` |
| **Production language** | TypeScript/React |
| **Database / storage owned** | none (consumes Java APIs only) |
| **Event topic(s) owned** | `(consumes ui events)` |
| **API contract** | `contracts/openapi/(consumes all service OpenAPI)` (or noted contract) |
| **Reference implementation (Layer A)** | `server/routes/jarvis_*.py (APIs)` |

## State this plane owns
command centre, object/investigation/graph/map/timeline workspaces, action console, approval queue, governance console

## The eight questions
- **What state does it own?** command centre, object/investigation/graph/map/timeline workspaces, action console, approval queue, governance console
- **What database stores it?** none (consumes Java APIs only)
- **What API exposes it?** `(consumes all service OpenAPI)`
- **What events does it emit?** topic `(consumes ui events)` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** TypeScript/React
- **What future service does it split into?** `mission-shell (React)`

## Migration path (Layer A → Layer B)
Re-implement `server/routes/jarvis_*.py (APIs)` behind the **same** API + event + table contracts:
1. Port domain logic to TypeScript/React.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
