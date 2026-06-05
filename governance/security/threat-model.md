# Threat Model

This threat model covers the platform as a zero-trust, deny-by-default,
ABAC/PBAC system handling data classified `UNCLASSIFIED` / `OFFICIAL` /
`SECRET` / `TOPSECRET`. It complements [`SECURITY.md`](../../SECURITY.md) and
the [security-plane TARGET_RUNTIME](../../security-plane/TARGET_RUNTIME.md).

## Scope and assets

- **Authoritative state** — PostgreSQL per
  [`contracts/sql/0001_core_schema.sql`](../../contracts/sql/0001_core_schema.sql)
  (`security`, `ontology`, `provenance`, `kinetic`, `audit`, `control` schemas).
- **Classified objects/properties** — `ontology.object.classification`, redacted
  per the PDP (`server/services/jarvis_policy.py`).
- **Audit chain** — append-only `audit.record` (tamper-evident hash chain).
- **Deployment control** — `control.environment.desired_state`, signing keys.
- **Models** — AIP/ML model versions governed by `model-access.policy.json`.

## Trust boundaries

1. Untrusted client ↔ API gateway (OIDC human identity).
2. Service ↔ service (SPIFFE/SPIRE SVID, mTLS). *(Layer B: real infra.)*
3. Service ↔ PostgreSQL (row-level security per
   `database/postgres/rls/0001_row_level_security.sql`).
4. Plane ↔ Kafka event backbone (signed envelopes).
5. Connected estate ↔ air-gapped/edge nodes (signed offline bundles only).

## STRIDE summary

| Threat | Example | Primary mitigation |
|--------|---------|--------------------|
| **Spoofing** | Forged subject/clearance | OIDC + SPIFFE SVID; clearance asserted by IdP, never client |
| **Tampering** | Altering audit or artefacts | Hash-chained `audit.record`; signed artefacts + content hash |
| **Repudiation** | Denying an action | Purpose-bound, hash-chained audit per [audit envelope](../../contracts/json-schema/audit-envelope.schema.json) |
| **Information disclosure** | Reading above clearance | PDP deny/redact; classification floor per environment |
| **Denial of service** | Flooding the PDP | Rate limits, health gates, bulkheads per plane |
| **Elevation of privilege** | Bypassing approval | Deny-by-default PDP; break-glass is the only elevation path, time-boxed and audited |

## Key adversary scenarios

- **Insider exfiltration.** Mitigated by PBAC (purpose binding), export policy
  (`contracts/policy/export.policy.json`), property-level redaction, and egress
  blocking in `restricted`/`airgapped` boot profiles.
- **Classification downgrade.** The PDP forbids writing data below its source
  classification; `ontology-rollback` and boot `classification_guard` assert
  `no_classification_downgrade_detected`.
- **Supply-chain compromise.** `signature_gate` + `vulnerability_gate` + SBOM
  scanning in every rollout; air-gapped imports require two-person control.
- **Compromised model.** `model-access.policy.json` enforces clearance on model
  reads; `model-rollback` pins an evaluated-safe version on drift/safety failure.

## Residual risks accepted

- Layer A reference runs single-node with SQLite/in-process events; full
  SPIFFE/mTLS/WORM/SIEM guarantees are Layer B (`# requires real infra`).
- Offline nodes operate with bounded staleness (`max_staleness`); the window is a
  documented, accepted risk reconciled on reconnect.
