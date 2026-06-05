# Event Contract Standards

Events are first-class contracts. Kafka is the event backbone
(ADR-003). Every event conforms to a single envelope and a versioned payload, and
every topic has exactly one owning plane.

## The envelope

All events use
[`contracts/events/event-envelope.schema.json`](../../contracts/events/event-envelope.schema.json).
The envelope carries identity, timestamp, source plane, classification, and a
correlation/causation id; the domain payload is nested and versioned. The catalog
of events is
[`contracts/events/event-catalog.json`](../../contracts/events/event-catalog.json),
and the broker-level description is
[`contracts/asyncapi/platform-events.yaml`](../../contracts/asyncapi/platform-events.yaml).

## Topic ownership

- One **owning plane** per topic, named in that plane's `TARGET_RUNTIME.md`.
  Examples: `control`, `deployment` (control plane); ontology and security own
  their own topics.
- Only the owner **produces** to its topic; any plane may consume.
- Reference producer logic lives in `server/services/jarvis_events.py`; the Layer B
  backbone is Kafka (`# requires real infra`).

## Naming

- Topics are lowercase domains (`control`, `deployment`, `ontology`, `security`).
- Event types are dotted: `<domain>.<aggregate>.<event>` —
  e.g. `deployment.canary.advanced`, `policy.access.denied`,
  `control.boot.ready`.

## Versioning and compatibility

- Payloads carry a `schema_version`. Changes MUST be **backward compatible**:
  add optional fields, never repurpose or remove a field in place.
- A breaking event change requires a **new event type** (or version suffix) and
  parallel-run, plus an ADR.
- Consumers MUST ignore unknown fields (tolerant reader).

## Delivery semantics

- **At-least-once** delivery; consumers are **idempotent** keyed on the envelope
  event id.
- Ordering is guaranteed only within a partition; partition by aggregate id when
  order matters.
- Events are facts about the past (past tense) — never commands disguised as
  events.

## Classification and audit

- Events carry the classification of their payload; consumers must honour it and
  the PDP governs cross-boundary consumption.
- Audit-relevant events are also recorded via the
  [audit envelope](../../contracts/json-schema/audit-envelope.schema.json); the two
  envelopes are distinct and both required where applicable.

## Validation

Every event schema is parseable and validated in CI (`make contracts-validate`); a
broken event contract fails the build.
