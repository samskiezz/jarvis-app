# Deployment Factory

This directory is the declarative deployment factory for the platform. It is owned
by the **control plane** (Apollo model) and is the source of truth for *what* should
run *where*, *how* it rolls out, *how* it rolls back, and *how* a node boots.

The Layer A reference implementation lives in
[`server/services/jarvis_apollo.py`](../server/services/jarvis_apollo.py); the Layer B
production target is the JVM `control-plane-service (JVM) + Go agents`
(see [`control-plane/TARGET_RUNTIME.md`](../control-plane/TARGET_RUNTIME.md)). Every
artefact here is bound to the stable contracts in [`contracts/`](../contracts/) and the
authoritative schema in [`contracts/sql/0001_core_schema.sql`](../contracts/sql/0001_core_schema.sql)
and [`database/postgres/`](../database/postgres/). These YAML files are the *desired
state* materialised into `control.environment.desired_state` (jsonb) and the rollout
strategies referenced by `control.release.strategy`.

## Layout

| Path | What it declares | Backing artefact |
|------|------------------|------------------|
| `desired-state/*.desired-state.yaml` | `EnvironmentDesiredState` per environment | `control.environment` |
| `rollout-policies/*.yaml` | `RolloutPolicy` (waves, gates, pauses) | `control.release.strategy`, `control.release.stages` |
| `rollback-policies/*.yaml` | `RollbackPolicy` per blast-radius | `control.environment.last_good_version` |
| `boot-profiles/*.yaml` | `BootProfile` (phase order + check toggles) | bootloader plane |

## Environments

| Environment | Tier | Zone | Classification | Strategy |
|-------------|------|------|----------------|----------|
| `dev` | 0 | corp | UNCLASSIFIED | rolling |
| `staging` | 1 | dmz | OFFICIAL | canary |
| `production` | 2 | trusted | OFFICIAL | canary |
| `restricted` | 2 | classified | SECRET | blue-green |
| `edge` | 2 | disconnected | SECRET | offline-update |

The promotion ladder is `dev → staging → production` (the `promotion_gate`). `restricted`
and `edge` are sovereign branches promoted from `staging` artefacts after re-signing.

## Release gates (enforced by the control plane)

Every release passes, before its first wave:

1. **signature_gate** — artefact must be signed (`control.artefact.signed`).
2. **vulnerability_gate** — SBOM has no `CRITICAL` components.
3. **promotion_gate** — source tier must be the previous tier.
4. **approval_gate** — tier ≥ 2 requires human approval recorded as `control.release.approval_id`.

Each rollout wave then sits behind **health gates**; a failing health gate triggers the
matching rollback policy and reverts to `control.environment.last_good_version`. Every
gate decision, wave, and rollback is written to the hash-chained audit log via the
[audit envelope](../contracts/json-schema/audit-envelope.schema.json).

## Rollback blast radius

- `service-rollback` — redeploy last-good artefact.
- `database-rollback` — paired down-migrations; append-only tables (`audit.*`, `provenance.*`) are never reverted.
- `ontology-rollback` — restore prior type definitions; instances are quarantined, never deleted.
- `model-rollback` — pin previous model version that has a passing eval (see [`governance/compliance/ai-governance.md`](../governance/compliance/ai-governance.md)).

## Boot profiles

Boot profiles order the bootloader phases (`preflight → storage_init → policy_load →
artefact_verify → audit_init → service_register → … → ready`) and toggle which checks are
enforced. `airgapped` and `edge` tolerate a disconnected control plane and reconcile to
`control.release` on reconnect. See [`bootloader/TARGET_RUNTIME.md`](../bootloader/TARGET_RUNTIME.md).

## Validation

```bash
python3 -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('deployment/**/*.yaml',recursive=True)]; print('yaml ok', len(glob.glob('deployment/**/*.yaml',recursive=True)))"
```

CI runs the same parse as part of `make contracts-validate`. A broken YAML fails the build.
