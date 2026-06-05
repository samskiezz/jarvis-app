# Platform Contracts — the seed crystal

Contract-first artifacts that let the Layer A reference kernel (this repo's
`server/services/jarvis_*.py`) be split cleanly into the Layer B polyglot system
(Java control plane, Go agents, Spark/Flink, Kafka, Iceberg, PostgreSQL, TS apps)
**without rewriting the domain logic**. Nothing here is hollow scaffolding — every
file is validated and load-bearing.

| Path | Contract | Layer A runtime (today) | Layer B owner (prod) |
|------|----------|-------------------------|----------------------|
| `events/event-envelope.schema.json` | Canonical event envelope | `jarvis_events` in-process log | Kafka |
| `events/event-catalog.json` | 11 event families, 93 event types, per-layer ownership | emitted by `jarvis_*` | per-service JVM producers |
| `sql/0001_core_schema.sql` | Authoritative PostgreSQL state model (6 schemas, 16 tables) | SQLite (same logical tables) | PostgreSQL + Iceberg history |
| `openapi/platform.yaml` | 7 service boundaries, stable API | FastAPI `/v1/jarvis/*` | standalone JVM services |
| `../infra/docker-compose.yml` | Real dev substrate (Postgres/Redpanda/MinIO/OpenSearch) | not required (SQLite/in-proc) | bound by JVM services |

## The split rule

The API + event + schema contracts are **stable across the split**. Migrating a
module to production means re-implementing its behaviour behind the *same* contract:

```
jarvis_ontology.py   ──contract──>  ontology-kernel (Java)      : ontology.* events, ontology.object_type table
jarvis_policy.py     ──contract──>  policy-gateway (Java+OPA)   : policy.* events, security.* tables
jarvis_aip.py        ──contract──>  action-engine (Java+Temporal): action.* events, kinetic.* tables
jarvis_apollo.py     ──contract──>  control-plane (Java) + agents(Go): control.* events, control.* tables
jarvis_events.py     ──contract──>  Kafka                       : event-envelope.schema.json
jarvis_os.py (audit) ──contract──>  audit-service (Java)        : audit.* tables (hash-chained) + WORM archive
```

See `../docs/SOVEREIGN_PLATFORM_BLUEPRINT.md` for the full per-layer status map.
