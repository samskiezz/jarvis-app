# TARGET_RUNTIME — AIP / AI Mesh

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `aip-gateway (JVM) + vLLM/Triton/KServe` |
| **Production language** | Java gateway + native model serving |
| **Database / storage owned** | PostgreSQL (platform_ai) + vector DB + object storage |
| **Event topic(s) owned** | `aip` |
| **API contract** | `contracts/openapi/aip-gateway-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/jarvis_ai.py` |

## State this plane owns
model gateway/router, agent/tool/prompt registries, permission-aware retrieval, traces, evals, redaction

## The eight questions
- **What state does it own?** model gateway/router, agent/tool/prompt registries, permission-aware retrieval, traces, evals, redaction
- **What database stores it?** PostgreSQL (platform_ai) + vector DB + object storage
- **What API exposes it?** `aip-gateway-api.yaml`
- **What events does it emit?** topic `aip` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java gateway + native model serving
- **What future service does it split into?** `aip-gateway (JVM) + vLLM/Triton/KServe`

## Migration path (Layer A → Layer B)
Re-implement `server/services/jarvis_ai.py` behind the **same** API + event + table contracts:
1. Port domain logic to Java gateway + native model serving.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
