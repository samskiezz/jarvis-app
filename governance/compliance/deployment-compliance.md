# Deployment Compliance

Every change reaching a regulated environment is governed by the deployment factory
in [`deployment/`](../../deployment/) and proven by evidence. This document maps the
deployment controls to compliance obligations.

## Controls enforced at deploy time

The control plane (`jarvis_apollo`, target `control-plane-service (JVM)`) enforces,
before any wave:

| Gate | Obligation it satisfies | Evidence |
|------|-------------------------|----------|
| `signature_gate` | Only authentic artefacts run | `control.artefact.signed` |
| `vulnerability_gate` | No known-critical components | SBOM scan result |
| `promotion_gate` | Change followed dev→staging→prod | `control.release` lineage |
| `approval_gate` | Human accountability (tier ≥ 2) | `control.release.approval_id` |
| Health gates | Change verified before full traffic | `control.release.gates` |

The required gates, approvers, and quorum per environment are declared in each
`EnvironmentDesiredState` (`approval_requirements`) — e.g. production requires a
2-person quorum (`release-manager` + `security-officer`), `restricted` requires 3.

## Change control

- **Separation of duties** — the author of a change cannot be its sole approver;
  approval quorum is enforced by the control plane, not by process trust.
- **Traceability** — every release records its artefact, version, environment,
  strategy, gates, and approval in `control.release`.
- **No silent prod change** — tier-2 environments require recorded approval; an
  unapproved rollout cannot pass `approval_gate`.

## Emergency changes

Emergency patches use
[`emergency-patch.yaml`](../../deployment/rollout-policies/emergency-patch.yaml).
They may waive `vulnerability_gate` / `promotion_gate` **only** via a two-person,
time-boxed break-glass grant (see [break-glass policy](../security/break-glass-policy.md));
`signature_gate` and the audit chain are never waived. A 72h follow-up change review
is a post-condition.

## Rollback and continuity

Each environment binds rollback policies sized to blast radius
(`service` / `database` / `ontology` / `model`). A failing health gate triggers
automatic rollback to `control.environment.last_good_version`. Append-only
`audit.*` / `provenance.*` are never reverted.

## Air-gapped and sovereign deployment

Offline updates require signed delta bundles with content-hash verification and
two-person import (`offline-update.yaml`). Sovereign `restricted` deployments add
classification-leak and egress checks (`blue-green.yaml`, `restricted` boot
profile). Offline release decisions reconcile to `control.release` on reconnect.

## Continuous evidence

All of the above emit `deployment.*` audit events through the
[audit envelope](../../contracts/json-schema/audit-envelope.schema.json). Deployment
compliance is therefore a query over the audit log, aligned with the
[evidence model](evidence-model.md).
