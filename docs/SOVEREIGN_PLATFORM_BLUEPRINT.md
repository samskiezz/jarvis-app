# Sovereign-Grade Palantir-Class Platform — Engineering Blueprint & Honest Status

> **Status of this document:** system-of-record for the target architecture and an
> *honest* map of what exists in this repository today versus what requires real,
> polyglot, distributed infrastructure that cannot run inside a single Python/FastAPI
> service. Read §0 before anything else.

## 0. The no-self-deception rule

A true Palantir-class system (AIP + Foundry + Apollo, Ontology, Rubix-style hardened
compute mesh) is **not** a Python platform. Its production core is:

- **Java/JVM** — control plane, ontology kernel, action engine, workflow engine
- **Go** — fleet agents, edge daemons
- **Scala/Java on Spark/Flink** — heavy + streaming data processing
- **Kafka** — event backbone · **Iceberg/S3** — time-travel lakehouse
- **PostgreSQL / distributed SQL** — authoritative metadata
- **OpenSearch + graph store + vector index** — retrieval substrates
- **TypeScript/React** — mission applications
- **Hardened Kubernetes + SPIFFE/SPIRE + Vault + Sigstore** — zero-trust runtime

**Python is correct only for** research notebooks, offline modelling, prototyping, and
non-authoritative analytics. **Python is not** the control plane, ontology kernel,
action engine, policy authority, audit authority, or fleet agent.

### What this repository therefore is

This repo is a **Python reference implementation / executable control-model** of the
proprietary "middle" (ontology, security, action, provenance, ER, simulation, AIP
governance, Apollo control logic). It is faithful to the *semantics and control flow*
of the target, runs and is tested on a single node, and is suitable as a **spec and
prototype** — it is **not** the sovereign production substrate. Treat every `jarvis_*`
module as the JVM service's behavioural specification, not its deployment.

---

## 1. Layer-by-layer target stack + honest status

Legend for **Status**:
- **REF** — Python reference model exists in this repo (behaviour implemented + tested, single-node, SQLite-backed).
- **PARTIAL** — some behaviour modelled; significant pieces absent.
- **INFRA** — requires real distributed infrastructure / a non-Python runtime; cannot exist as in-app Python. Not faked here.

| # | Layer | Target language | Target storage | Target runtime | Status in this repo |
|---|-------|-----------------|----------------|----------------|---------------------|
| 0 | Hardened compute mesh | Go / Java | PostgreSQL, OCI registry | Hardened K8s + service mesh | **INFRA** — K8s/SPIFFE/Vault/mTLS need real clusters |
| 1 | Apollo delivery fabric | Java hub, Go agents | PostgreSQL, Kafka, object store | JVM + edge agents | **REF (control logic)** `jarvis_apollo` — gates, rollout, health, auto-rollback, fleet state. Executors + Go agents = INFRA |
| 2 | Identity / security / policy | Java, Go sidecars | PostgreSQL, Vault, WORM audit | Zero-trust mesh | **REF** `jarvis_policy` (ABAC/PBAC, classification, purpose, property redaction) + `jarvis_os` RBAC/audit. IdP/SPIFFE/Vault = INFRA |
| 3 | Multimodal data plane | Java/Scala | Iceberg, Kafka, PostgreSQL | Spark, Flink | **PARTIAL** `brain_sources`/connectors (enrichment-grade); Spark/Flink/CDC = INFRA |
| 4 | Lakehouse + time-travel | Java/Scala | Iceberg over S3/MinIO | Spark/Trino/Flink | **INFRA** — Iceberg/object-store branching needs real lakehouse (modelled at object level by `jarvis_sandbox`) |
| 5 | Entity resolution | Java/Scala Spark | PostgreSQL, Iceberg, graph | JVM + Spark | **REF** `jarvis_er` — blocking, similarity, golden records, reversible merge, adjudication. Spark-scale = INFRA |
| 6 | Ontology kernel | Java | PostgreSQL, Kafka, graph, search | JVM | **REF** `jarvis_ontology` — object/link/action/function types, lifecycle, dynamic security, events |
| 7 | Object runtime | Java | PostgreSQL, Kafka, Iceberg, OpenSearch | JVM APIs | **REF** `jarvis_ontology` object store + neighbors + history; OpenSearch/graph cluster = INFRA |
| 8 | Provenance / lineage / bitemporal | Java/Scala | PostgreSQL, Iceberg, WORM | JVM | **REF** `jarvis_temporal` (bitemporal) + `jarvis_aip` lineage + provenance in enrichment |
| 9 | Search / graph / vector retrieval | Java gateway | OpenSearch, graph DB, vector DB | Clusters | **PARTIAL** — in-app embeddings + ontology traversal; dedicated clusters = INFRA |
| 10 | Kinetic action engine | Java | PostgreSQL, Kafka, WORM | JVM | **REF** `jarvis_aip` + `jarvis_ontology.apply_action` — governed verbs, approvals, compensation-ready, audit |
| 11 | Workflow / rules / automation | Java / Temporal | Temporal/PostgreSQL, Kafka | Temporal/Camunda | **PARTIAL** `brain_planner` (GOAP); durable Temporal-grade workflow = INFRA |
| 12 | Simulation / sandbox universes | Java/Scala/native | PostgreSQL, Iceberg | JVM + Spark + solvers | **REF** `jarvis_sandbox` (branch/diff/promote/discard) + `jarvis_sim` (what-if, risk, monte-carlo) |
| 13 | AIP / AI mesh | Java gateway, native serving | PostgreSQL, vector, trace store | JVM + vLLM/Triton/KServe | **REF (governance)** `jarvis_ai` — model routing + permission-aware retrieval + governed context. GPU serving + eval/red-team harness = PARTIAL/INFRA |
| 14 | Mission applications | TypeScript/React | API-backed | Browser shell | **PARTIAL** — REST APIs exist (65 `/v1/jarvis` endpoints); operator cockpit UI not built |
| 15 | Observability / audit / compliance | Java, Go | Kafka, Prometheus, WORM, OpenSearch | OTel plane | **REF** `jarvis_os` (tamper-evident hash-chained audit, spans, metrics) + `jarvis_events` (CQRS backbone). Prometheus/OTel/SIEM = INFRA |

---

## 2. The event contract

Every layer emits events to the backbone. The reference backbone is `jarvis_events`
(append-only log, durable consumer offsets, replay, CQRS projections). In production
this is **Kafka**, with the same event names (`object.state_changed`, `action.completed`,
`deployment.rollback.triggered`, `policy.access.denied`, ...). The reference model
proves the *contract*; Kafka provides the *substrate*.

## 3. Migration path (reference Python → sovereign JVM)

The reference modules are written to be a 1:1 behavioural spec, so the production
build is a re-implementation, not a redesign:

1. Each `jarvis_*` service → a JVM bounded context with the same API + event contract.
2. SQLite tables → PostgreSQL (authoritative metadata) + Kafka (events) + Iceberg (history).
3. `jarvis_apollo` control logic → Java hub + Go fleet agents over gRPC; executors drive real K8s.
4. `jarvis_policy` PDP → OPA/Cedar + Envoy filters + SPIFFE workload identity.
5. `jarvis_ai` gateway → Java gateway in front of vLLM/Triton/KServe; eval/red-team harness added.
6. Mission apps → TypeScript/React over the generated ontology SDK.

## 4. What will not be faked here

K8s/SPIFFE/Vault clusters, Kafka/Spark/Flink/Iceberg deployments, Go fleet agents on
real nodes, GPU inference servers, and the forward-deployed engineering that maps a
customer's operational world. These are infrastructure and human capital, not in-app
Python, and this document marks them **INFRA** rather than pretending otherwise.
