# Evidence Model

The platform produces **continuous compliance evidence** as a byproduct of normal
operation, not as a separate documentation exercise. Every control has a
machine-generated artefact that proves it operated.

## Evidence is contract-bound

Evidence derives from the same stable contracts that define the system:

- **Policy decisions** → [`policy-decision.schema.json`](../../contracts/json-schema/policy-decision.schema.json)
- **Audit records** → [`audit-envelope.schema.json`](../../contracts/json-schema/audit-envelope.schema.json)
- **Authoritative state** → [`contracts/sql/0001_core_schema.sql`](../../contracts/sql/0001_core_schema.sql)
- **Events** → [`event-envelope.schema.json`](../../contracts/events/event-envelope.schema.json)

Because the contracts are stable across the Layer A → Layer B migration, evidence
shape does not change when the JVM services replace `server/services/jarvis_*.py`.

## Evidence types

| Control objective | Evidence artefact | Source |
|-------------------|-------------------|--------|
| Access mediated by PDP | `policy.*` decision records | `jarvis_policy` |
| Tamper-evident logging | Hash-chained `audit.record` | `jarvis_os` audit chain |
| Signed supply chain | Artefact signature + SBOM + content hash | `control.artefact` |
| Gated deployment | `control.release.gates` / `.stages` | `jarvis_apollo` |
| Classification enforced | Redaction obligations on decisions | `property-read` policy |
| Data lineage | `provenance.fact` / `provenance.lineage` | provenance plane |
| Model governance | Model card + eval results | AIP plane |

## Evidence properties

- **Immutable** — evidence lives in append-only tables; integrity is the audit
  hash chain (see [audit retention policy](../security/audit-retention-policy.md)).
- **Attributable** — every record carries subject, purpose, tenant, classification.
- **Replayable** — the chain can be independently recomputed to prove no gaps.
- **Queryable** — auditors query by control, time window, tenant, or classification.

## Collection and packaging

Evidence is collected automatically and packaged into an **evidence bundle** per
control framework on demand. A bundle is itself signed and hashed so the package
delivered to an assessor is tamper-evident. Offline nodes contribute buffered,
chained evidence reconciled on reconnect.

## Mapping to frameworks

The evidence model is framework-agnostic; control objectives above map to common
frameworks (e.g. ISO 27001, SOC 2, NIST 800-53). Each framework control references
one or more evidence types rather than bespoke documentation, so an audit is a
**query**, not a fire drill.
