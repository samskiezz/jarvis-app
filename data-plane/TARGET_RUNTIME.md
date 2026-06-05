# TARGET_RUNTIME — Data Plane

> Marked interface contract (not theatre). This plane has a defined owner, schema,
> events, policy, audit pathway, production language and migration path. The Layer A
> reference implementation runs today in this repo; Layer B is the production target.

| Field | Value |
|-------|-------|
| **Future service name** | `ingestion-service + spark-jobs + flink-jobs` |
| **Production language** | Java + Scala/Java Spark + Flink |
| **Database / storage owned** | Iceberg over S3/MinIO + Kafka + PostgreSQL |
| **Event topic(s) owned** | `data-plane` |
| **API contract** | `contracts/openapi/data-plane-api.yaml` (or noted contract) |
| **Reference implementation (Layer A)** | `server/services/brain_sources.py (connectors, partial)` |

## State this plane owns
source/dataset registry, ingestion, CDC, batch+stream transforms, data quality, lineage, lakehouse zones

## The eight questions
- **What state does it own?** source/dataset registry, ingestion, CDC, batch+stream transforms, data quality, lineage, lakehouse zones
- **What database stores it?** Iceberg over S3/MinIO + Kafka + PostgreSQL
- **What API exposes it?** `data-plane-api.yaml`
- **What events does it emit?** topic `data-plane` (envelope: `contracts/events/event-envelope.schema.json`)
- **What policy controls it?** `security-plane/policy-gateway` PDP (deny-by-default)
- **What audit record does it leave?** hash-chained `platform_audit.record` via the audit envelope
- **What production language owns it?** Java + Scala/Java Spark + Flink
- **What future service does it split into?** `ingestion-service + spark-jobs + flink-jobs`

## Migration path (Layer A → Layer B)
Re-implement `server/services/brain_sources.py (connectors, partial)` behind the **same** API + event + table contracts:
1. Port domain logic to Java + Scala/Java Spark + Flink.
2. Move state from the SQLite reference tables to the `database/postgres` schemas.
3. Swap the in-process event log for Kafka (same envelope).
4. Enforce access via the policy-gateway PDP; emit audit via the audit envelope.
No redesign — the contracts are stable across the split.
