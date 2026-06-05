# Access Control Model (ABAC / PBAC)

Access is **deny-by-default**. Every access to an object, property, link, action,
tool, or model is mediated by the policy decision point (PDP). The reference
implementation is `jarvis_policy` (`server/services/jarvis_policy.py`); the
production target is `policy-gateway (Java + OPA/Cedar)` with Envoy filters.

## Decision model

A decision is a pure function of three attribute sets:

- **Subject** — roles, `clearance_rank`, `tenant`, `compartments`, active session.
- **Resource** — `classification_rank`, `tenant`, `compartments`, `purposes`, owner, type.
- **Environment / request** — declared `purpose`, time, network zone, risk, approval state.

The PDP returns a `PolicyDecision`
([`contracts/json-schema/policy-decision.schema.json`](../../contracts/json-schema/policy-decision.schema.json)):
`permit`, `reason`, `required_level`, `subject_clearance`, `obligations`, `audit_id`.
The request shape is `policy-request.schema.json`.

## ABAC rules (attribute-based)

Evaluated against `action-execution.policy.json` with `effect_default: deny`:

1. **clearance** — `subject.clearance_rank >= resource.classification_rank`
2. **tenant** — `subject.tenant == resource.tenant`
3. **compartment** — `resource.compartments subset_of subject.compartments`
4. **purpose** — `resource.purposes empty OR request.purpose in resource.purposes`
5. **approval** — `action.risk == low OR approval.granted`

All rules must pass; any failure denies.

## PBAC (purpose-based)

The subject MUST declare a **purpose** for access. The PDP checks the purpose is
permitted for the resource and **binds the purpose into the audit record**, so
every grant is justified and replayable. Purpose binding prevents legitimate
clearance from being reused for an illegitimate aim.

## Decision points (policy bundles)

| Bundle | Guards | File |
|--------|--------|------|
| object-read | reading an object | `contracts/policy/object-read.policy.json` |
| property-read | property-level redaction | `contracts/policy/property-read.policy.json` |
| link-traversal | graph traversal / inference | `contracts/policy/link-traversal.policy.json` |
| action-execution | mutating actions | `contracts/policy/action-execution.policy.json` |
| tool-execution | AIP tool calls | `contracts/policy/tool-execution.policy.json` |
| model-access | model inference | `contracts/policy/model-access.policy.json` |
| export | data leaving a boundary | `contracts/policy/export.policy.json` |

Bundle versions are pinned per environment in
`EnvironmentDesiredState.policy_bundle_versions`.

## Obligations

A permit may carry **obligations** (redact fields, watermark export, require MFA,
log to SIEM). Obligations are returned in the decision and MUST be enforced by the
calling plane before the resource is released.

## Enforcement and RLS

Defense-in-depth: even with a permit, PostgreSQL row-level security
(`database/postgres/rls/0001_row_level_security.sql`) scopes rows to the
subject's tenant and clearance, so a logic bug cannot leak cross-tenant data.

## Audit

Every decision emits `policy.<point>.{decision}`; denials emit
`policy.access.denied`. Records are hash-chained via the
[audit envelope](../../contracts/json-schema/audit-envelope.schema.json).
