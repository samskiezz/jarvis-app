# Testing Standards

Tests prove that behaviour matches the contracts. Because contracts are stable
across the Layer A → Layer B migration, the same contract tests apply to the Python
reference (`server/services/jarvis_*.py`) and the JVM production services.

## Test pyramid

| Layer | Scope | Must cover |
|-------|-------|-----------|
| Unit | Pure domain logic in a plane | Decision rules, state transitions |
| Contract | API / event / schema conformance | OpenAPI, AsyncAPI, JSON Schema, SQL DDL |
| Integration | Plane + its database/events | RLS, migrations, idempotency |
| End-to-end | Cross-plane flows | Deploy → gate → rollback, access → audit |

## Contract testing is mandatory

- Every contract under [`contracts/`](../../contracts/) MUST parse and validate;
  `make contracts-validate` runs in CI and **fails the build** on a broken contract.
- Deployment YAML under [`deployment/`](../../deployment/) is parse-validated the
  same way (see `deployment/README.md`).
- Consumer-driven contract tests guard event payloads: a producer change that would
  break a known consumer fails before merge.

## Security and policy tests

- The PDP is tested **deny-by-default**: a missing attribute denies, never permits.
- Each policy bundle (`contracts/policy/*.policy.json`) has positive and negative
  cases for clearance, tenant, compartment, purpose, and approval rules.
- Classification tests assert redaction (not silent pass-through) and that no flow
  downgrades classification.

## Deployment and rollback tests

- Each rollout policy is tested for wave ordering, health-gate pause, and
  abort-vs-pause behaviour.
- Each rollback policy is tested to restore `last_good_version` and to **never**
  revert append-only `audit.*` / `provenance.*`.
- Boot profiles are tested for phase ordering and safe-mode fallback.

## Audit tests

- The audit chain is tested as **replay-verifiable**; a tampered record is detected.
- Offline buffering is tested to flush a continuous chain on reconnect.

## Quality bars

- New plane logic ships with unit + contract tests; PRs without tests for new
  behaviour are not merged.
- Tests are deterministic and hermetic — no reliance on real external infra; Layer B
  infra paths are exercised with fakes labelled `# requires real infra`.
- CI treats style (`.editorconfig`) and contract violations as build failures.
