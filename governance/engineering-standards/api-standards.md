# API Standards

Every synchronous boundary is described by an OpenAPI contract under
[`contracts/openapi/`](../../contracts/openapi/) (`platform.yaml`,
`control-plane-api.yaml`, `ontology-api.yaml`, `object-runtime-api.yaml`,
`policy-api.yaml`). The contract is the source of truth; the Layer A reference
(`server/services/jarvis_*.py`) and the Layer B JVM services both conform to it.

## Contract-first

- Design the OpenAPI contract before code. Handlers are validated against it; CI
  fails on drift (`make contracts-validate`).
- The contract is **stable across the Layer A → Layer B migration**. A breaking
  change is an ADR-worthy event, never a routine PR.

## Resource and verb conventions

- Resources are plural nouns (`/environments`, `/objects`, `/releases`).
- Standard verbs: `GET` (safe), `POST` (create/command), `PUT`/`PATCH` (update),
  `DELETE` (remove). Non-CRUD operations are sub-resources
  (`POST /releases/{id}:rollback`), not verbs in the path.
- Mutating endpoints are **idempotent** where possible via an idempotency key.

## Versioning

- Version in the path (`/v1`). Within a major version, only additive changes.
- Breaking changes ship a new major version and parallel-run; deprecation is
  announced with a sunset window.

## Errors

- Errors use a consistent problem shape (code, message, correlation id). Never leak
  stack traces, internal identifiers, or data above the caller's clearance.
- A denial returns the policy reason (from
  [`policy-decision.schema.json`](../../contracts/json-schema/policy-decision.schema.json)),
  not silent success or a misleading 404 that hides existence above clearance —
  except where existence itself is classified, in which case 404 is deliberate.

## Security

- Every endpoint authenticates (OIDC human / SPIFFE workload) and authorizes
  through the PDP — there is no unauthenticated mutating endpoint.
- Endpoints declare the **purpose** they require (PBAC); the gateway binds it into
  the audit record.
- Pagination is mandatory on collection endpoints; responses are bounded.

## Consistency and observability

- Field naming is `snake_case` to match the jsonb payloads and event envelopes.
- Timestamps are RFC 3339 UTC. Money/precision-sensitive numbers are strings.
- Every request carries a correlation id propagated to events and audit, satisfying
  the [observability standards](observability-standards.md).
