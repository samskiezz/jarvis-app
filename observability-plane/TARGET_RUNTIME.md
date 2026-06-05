# TARGET_RUNTIME — Observability / Audit

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `audit-service (JVM) + OTel` |
| **Production language** | Java + Go |
| **Database / storage owned** | Kafka + Prometheus + WORM object storage + OpenSearch |
| **Event topic(s) owned** | `audit` |
| **API contract** | `contracts/openapi/audit-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/jarvis_os.py (audit/metrics/traces)` |

## State this plane owns
metrics, logs, traces, tamper-evident audit, compliance evidence, decision/operational replay

## The eight questions
- **What state does it own?** metrics, logs, traces, tamper-evident audit, compliance evidence, decision/operational replay
- **What database stores it?** Kafka + Prometheus + WORM object storage + OpenSearch
- **What API exposes it?** `audit-api.yaml`
- **What events does it emit?** topic `audit` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java + Go
- **What future service does it split into?** `audit-service (JVM) + OTel`

## Migration path (Layer A → Layer B)
Re-implement `server/services/jarvis_os.py (audit/metrics/traces)` behind the **same** API + event + table contracts:
1. Port domain logic to Java + Go.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
