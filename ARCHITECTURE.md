# Architecture — Enterprise OS (Palantir-class Sovereign Platform)

This document is the **layer map** for the platform: the 16 planes, the target
language, storage, and runtime for each, and the honest status of what exists in
this repository today.

It is a summary. The systems-of-record are:

- [`docs/SOVEREIGN_PLATFORM_BLUEPRINT.md`](docs/SOVEREIGN_PLATFORM_BLUEPRINT.md) — full target stack + honest status.
- The per-plane `*/TARGET_RUNTIME.md` files (one per plane directory), each of
  which answers the eight questions (state, DB, API, events, policy, audit,
  production language, future service) and the Layer A → Layer B migration path.

## The no-self-deception rule

A true Palantir-class system (AIP + Foundry + Apollo, Ontology, hardened compute
mesh) is **not** a Python platform. Its production core is JVM (control plane,
ontology, action, workflow), Go (fleet/edge agents), Scala/Java on Spark/Flink
(heavy + streaming data), Kafka (events), Iceberg/S3 (time-travel lakehouse),
PostgreSQL (authoritative metadata), OpenSearch + graph + vector (retrieval), and
TypeScript/React (mission apps), all over hardened K8s + SPIFFE/SPIRE + Vault +
Sigstore.

This repo is the **Python reference implementation / executable control-model** of
the proprietary middle. It is faithful to the *semantics and control flow* of the
target and runs single-node — it is the behavioural spec, not the production
substrate.

### Layer legend

- **REF** — Python reference model exists (behaviour implemented + tested, single-node, SQLite-backed).
- **PARTIAL** — some behaviour modelled; significant pieces absent.
- **INFRA** — requires real distributed infrastructure / a non-Python runtime (**Layer B: requires real infra**).

## The 16-plane layer map

| # | Plane | Target language | Target storage | Target runtime | Status | TARGET_RUNTIME |
|---|-------|-----------------|----------------|----------------|--------|----------------|
| 0 | Hardened compute mesh | Go / Java | PostgreSQL, OCI registry | Hardened K8s + service mesh | **INFRA** | — (cross-cutting) |
| 1 | Apollo delivery fabric (control plane) | Java hub, Go agents | PostgreSQL, Kafka, object store | JVM + edge agents | **REF (control logic)** | [control-plane](control-plane/TARGET_RUNTIME.md) |
| 2 | Identity / security / policy | Java, Go sidecars | PostgreSQL, Vault, WORM audit | Zero-trust mesh | **REF** | [security-plane](security-plane/TARGET_RUNTIME.md) |
| 3 | Multimodal data plane | Java/Scala | Iceberg, Kafka, PostgreSQL | Spark, Flink | **PARTIAL** | [data-plane](data-plane/TARGET_RUNTIME.md) |
| 4 | Lakehouse + time-travel | Java/Scala | Iceberg over S3/MinIO | Spark/Trino/Flink | **INFRA** | [data-plane](data-plane/TARGET_RUNTIME.md) |
| 5 | Entity resolution | Java/Scala Spark | PostgreSQL, Iceberg, graph | JVM + Spark | **REF** | [entity-resolution-plane](entity-resolution-plane/TARGET_RUNTIME.md) |
| 6 | Ontology kernel | Java | PostgreSQL, Kafka, graph, search | JVM | **REF** | [ontology-plane](ontology-plane/TARGET_RUNTIME.md) |
| 7 | Object runtime | Java | PostgreSQL, Kafka, Iceberg, OpenSearch | JVM APIs | **REF** | [object-runtime](object-runtime/TARGET_RUNTIME.md) |
| 8 | Provenance / lineage / bitemporal | Java/Scala | PostgreSQL, Iceberg, WORM | JVM | **REF** | [object-runtime](object-runtime/TARGET_RUNTIME.md) |
| 9 | Search / graph / vector retrieval | Java gateway | OpenSearch, graph DB, vector DB | Clusters | **PARTIAL** | [observability-plane](observability-plane/TARGET_RUNTIME.md) |
| 10 | Kinetic action engine | Java | PostgreSQL, Kafka, WORM | JVM | **REF** | [action-plane](action-plane/TARGET_RUNTIME.md) |
| 11 | Workflow / rules / automation | Java / Temporal | Temporal/PostgreSQL, Kafka | Temporal/Camunda | **PARTIAL** | [workflow-plane](workflow-plane/TARGET_RUNTIME.md) |
| 12 | Simulation / sandbox universes | Java/Scala/native | PostgreSQL, Iceberg | JVM + Spark + solvers | **REF** | [simulation-plane](simulation-plane/TARGET_RUNTIME.md) |
| 13 | AIP / AI mesh | Java gateway, native serving | PostgreSQL, vector, trace store | JVM + vLLM/Triton/KServe | **REF (governance)** | [aip-plane](aip-plane/TARGET_RUNTIME.md) |
| 14 | Mission applications | TypeScript/React | API-backed | Browser shell | **PARTIAL** | [mission-apps](mission-apps/TARGET_RUNTIME.md) |
| 15 | Observability / audit / compliance | Java, Go | Kafka, Prometheus, WORM, OpenSearch | OTel plane | **REF** | [observability-plane](observability-plane/TARGET_RUNTIME.md) |

> Additional plane directories with marked runtimes: [kernel](kernel/TARGET_RUNTIME.md)
> (microkernel / bootstrap contract), [event-plane](event-plane/TARGET_RUNTIME.md)
> (Kafka-grade event backbone), [fleet-agents](fleet-agents/TARGET_RUNTIME.md)
> (Go edge daemons), and [bootloader](bootloader/TARGET_RUNTIME.md).

## Polyglot build map

| Build | Tooling | Planes |
|-------|---------|--------|
| JVM control plane | Gradle (Kotlin DSL) — `settings.gradle.kts`, `build.gradle.kts` | kernel, control-plane, ontology-plane, object-runtime, security-plane, action-plane, workflow-plane, aip-plane, event-plane |
| Go agents | Go modules | fleet-agents, edge daemons (Layer B) |
| TS mission apps | pnpm workspace — `pnpm-workspace.yaml`, `package.json` | mission-apps/** |
| Contracts | JSON Schema / OpenAPI / AsyncAPI / protobuf — `contracts/` | all (cross-cutting) |

## The event contract

Every plane emits to the backbone. The reference backbone (`jarvis_events`) is an
append-only log with durable offsets, replay, and CQRS projections; production is
**Kafka** with the same event names (`object.state_changed`, `action.completed`,
`deployment.rollback.triggered`, `policy.access.denied`, ...). The envelope is
`contracts/events/event-envelope.schema.json`.

## See also

- [SECURITY.md](SECURITY.md) — zero-trust model.
- [GOVERNANCE.md](GOVERNANCE.md) — ADRs and engineering standards.
