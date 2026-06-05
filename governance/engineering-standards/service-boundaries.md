# Service Boundaries

Each plane is a bounded context with a single owner, the state it owns, and a
stable contract. Boundaries are defined by the `*/TARGET_RUNTIME.md` "eight
questions" and are stable across the Layer A → Layer B migration.

## The eight questions (every plane answers)

1. What state does it own?
2. What database stores it?
3. What API exposes it?
4. What events does it emit?
5. What policy controls it?
6. What audit record does it leave?
7. What production language owns it?
8. What future service does it split into?

A plane that cannot answer all eight is not a service boundary.

## Ownership rules

- **One writer per table.** A plane owns its tables in
  [`contracts/sql/0001_core_schema.sql`](../../contracts/sql/0001_core_schema.sql)
  and is the only writer. The control plane owns `control.*`, ontology owns
  `ontology.*`, security owns `security.*`, provenance owns `provenance.*`,
  action/workflow owns `kinetic.*`, audit owns `audit.*`.
- **No cross-plane DB reads.** Planes integrate via API + events, never by reaching
  into another plane's tables.
- **Reference ↔ target parity.** Each plane has a Layer A reference in
  `server/services/jarvis_*.py` and a Layer B target named in its TARGET_RUNTIME.
  Examples: control → `jarvis_apollo.py`, ontology → `jarvis_ontology.py`,
  policy → `jarvis_policy.py`, events → `jarvis_events.py`.

## Integration

- **Synchronous:** OpenAPI contracts under
  [`contracts/openapi/`](../../contracts/openapi/) (e.g. `control-plane-api.yaml`,
  `ontology-api.yaml`, `policy-api.yaml`).
- **Asynchronous:** Kafka topics declared in each TARGET_RUNTIME, envelope
  [`event-envelope.schema.json`](../../contracts/events/event-envelope.schema.json),
  catalog `contracts/asyncapi/platform-events.yaml`.
- **Policy:** all cross-boundary access flows through the PDP; no plane trusts
  another plane's caller blindly.

## Coupling rules

- Depend on a peer's **contract**, never its implementation.
- A breaking contract change is an **ADR-worthy event** (see
  [`governance/architecture-decision-records/`](../architecture-decision-records/)),
  not a routine PR.
- Shared types live in contracts; copy-paste of another plane's internal models is
  prohibited.

## Layer honesty

Every component is labelled REF / PARTIAL / INFRA. Anything needing real
distributed infrastructure is marked `# Layer B: requires real infra` and is never
faked in the sandbox.
