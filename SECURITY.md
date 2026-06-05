# Security — Zero-Trust Model

This platform is **deny-by-default, zero-trust**: no implicit trust is granted by
network location, and every access to an object, property, link, action, tool, or
model is mediated by a policy decision point (PDP) and recorded in a tamper-evident
audit log.

The system-of-record for security semantics is the
[security-plane TARGET_RUNTIME](security-plane/TARGET_RUNTIME.md). The governance
record (decisions, standards) lives in [GOVERNANCE.md](GOVERNANCE.md) and
[`governance/`](governance/). Threat/legal context is in
[`docs/PATTERN_ORACLE/12_SECURITY_GOVERNANCE_LEGAL.md`](docs/PATTERN_ORACLE/12_SECURITY_GOVERNANCE_LEGAL.md).

## Identity (workload + human)

- **Human identity** via OIDC issuer (`OIDC_ISSUER`); sessions carry subject,
  roles, clearances, and active purpose.
- **Workload identity** via SPIFFE/SPIRE in the target runtime — each service gets
  a short-lived SVID; service-to-service calls are mTLS-authenticated.
  *(Layer B: requires real infra — SPIFFE/SPIRE/mTLS need real clusters.)*
- Secrets and signing keys are brokered by Vault (`VAULT_ADDR`); nothing is
  long-lived or embedded.

## Classification

- Every object/property carries a **classification** label (e.g.
  `UNCLASSIFIED` → `TOP_SECRET`, plus compartments/caveats).
- A request is evaluated against the subject's clearance; insufficient clearance
  results in **redaction** (property-level) or denial (object-level), never silent
  pass-through.
- Default classification for new data is configured via the
  `DEFAULT_CLASSIFICATION` env var (see `.env.example`).

## ABAC / PBAC

- **ABAC** — Attribute-Based Access Control: decisions are a function of subject
  attributes (roles, clearance, org), resource attributes (classification, owner,
  type), and environment (time, network, risk).
- **PBAC** — Purpose-Based Access Control: the subject must declare a **purpose**
  for access; the PDP checks the purpose is permitted for the resource and binds
  the purpose into the audit record. Reference logic: `jarvis_policy`
  (`server/services/jarvis_policy.py`).
- Policies are declarative; see [`contracts/policy/`](contracts/policy/)
  (`object-read`, `property-read`, `link-traversal`, `action-execution`,
  `tool-execution`, `model-access`, `export`). Decision/request shapes are
  `contracts/json-schema/policy-decision.schema.json` and `policy-request.schema.json`.
- Target PDP: `policy-gateway (Java + OPA/Cedar)` with Envoy filters.

## Break-glass

- Emergency elevated access is supported as an explicit, **time-boxed,
  fully-audited** break-glass grant.
- Break-glass requires justification, raises a high-severity audit + alert event,
  and is automatically revoked at expiry. It never bypasses the audit chain.

## Audit

- All decisions and state changes emit a **hash-chained, tamper-evident** audit
  record (`platform_audit.record`) using the audit envelope
  [`contracts/json-schema/audit-envelope.schema.json`](contracts/json-schema/audit-envelope.schema.json).
- Reference implementation: `jarvis_os` audit chain. Production target is a WORM
  store + SIEM export. *(Layer B: requires real infra — WORM/SIEM/OpenSearch
  clusters.)*
- Denials emit `policy.access.denied`; the audit log is replay-verifiable so the
  chain can be independently validated.

## Reporting

Report suspected vulnerabilities to the platform security owner. Do not file
sensitive findings in public issue trackers.
