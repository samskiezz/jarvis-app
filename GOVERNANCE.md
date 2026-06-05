# Governance — Decisions & Engineering Standards

This document indexes the architectural decisions and engineering standards that
bind the platform. Decisions here are durable; changing one requires a new ADR
that supersedes the old.

## Architecture Decision Records (ADRs)

Located in [`governance/architecture-decision-records/`](governance/architecture-decision-records/):

- [ADR-001 — Control plane in Java](governance/architecture-decision-records/ADR-001-control-plane-java.md)
- [ADR-002 — Fleet agents in Go](governance/architecture-decision-records/ADR-002-fleet-agent-go.md)
- [ADR-003 — Kafka as the event backbone](governance/architecture-decision-records/ADR-003-kafka-event-backbone.md)
- [ADR-004 — Iceberg lakehouse for time-travel](governance/architecture-decision-records/ADR-004-iceberg-lakehouse.md)
- [ADR-005 — PostgreSQL as authoritative state](governance/architecture-decision-records/ADR-005-postgres-authoritative-state.md)
- [ADR-006 — No Python in the control plane](governance/architecture-decision-records/ADR-006-no-python-control-plane.md)

New ADRs follow the next number in sequence and reference any ADR they supersede.

## Engineering standards

These standards are enforced via the build and CI, not by convention alone.

### Contracts are the source of truth

- Every plane has a marked `*/TARGET_RUNTIME.md` and a contract under
  [`contracts/`](contracts/) (OpenAPI / AsyncAPI / JSON Schema / protobuf / policy / SQL).
- Contracts MUST be valid and parseable. `make contracts-validate` runs a Python
  validation of every contract JSON/YAML; CI fails on a broken contract.
- API/event/table contracts are **stable across the Layer A → Layer B migration**
  (Python reference → JVM production). A re-implementation must preserve them; a
  contract change is an ADR-worthy event.

### Layer honesty

- Every component is labelled **REF**, **PARTIAL**, or **INFRA** (see
  [ARCHITECTURE.md](ARCHITECTURE.md)). Anything that needs real distributed
  infrastructure is marked `# Layer B: requires real infra` and is never faked in
  a lightweight sandbox.

### Polyglot build conventions

- JVM planes build with Gradle (Kotlin DSL); see `settings.gradle.kts` /
  `build.gradle.kts`. Shared group/version and Java/Spring conventions are applied
  to all subprojects.
- Mission apps build with the pnpm workspace (`pnpm-workspace.yaml`).
- Go agents build with Go modules.
- All targets are orchestrated by the root `Makefile`.

### Security & audit

- Deny-by-default PDP, classification-aware redaction, purpose binding, break-glass,
  and hash-chained audit are mandatory for every plane. See [SECURITY.md](SECURITY.md).

### Code style

- Formatting and whitespace are governed by [`.editorconfig`](.editorconfig); CI
  treats style violations as build failures.

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — the 16-plane layer map.
- [SECURITY.md](SECURITY.md) — zero-trust model.
- [`docs/SOVEREIGN_PLATFORM_BLUEPRINT.md`](docs/SOVEREIGN_PLATFORM_BLUEPRINT.md) — full target stack and honest status.
