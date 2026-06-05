# Audit Model

The audit model defines *how* the platform records what happened so that the record
is complete, tamper-evident, and independently verifiable. It is the operational
companion to the [audit retention policy](../security/audit-retention-policy.md).

## Principles

1. **Audit-by-default.** Every PDP decision and every mutating action writes an
   audit record. There is no "unaudited path"; the deny-by-default PDP means even
   denials are recorded (`policy.access.denied`).
2. **One envelope.** All records use the
   [audit envelope](../../contracts/json-schema/audit-envelope.schema.json),
   regardless of which plane emits them.
3. **Hash-chained.** Each record commits the hash of its predecessor, so insertion,
   deletion, or reordering is detectable. Reference: `jarvis_os` audit chain;
   stored in append-only `audit.record`.
4. **Purpose-bound.** The declared PBAC purpose is carried into the record, tying
   every access to a justification.

## What gets audited

| Domain | Events | Plane |
|--------|--------|-------|
| Access | `policy.<point>.{permit,deny,redact}` | security-plane |
| Actions | action lifecycle, approvals | action-plane / `kinetic.*` |
| Deployment | `deployment.{canary,rolling,bluegreen,emergency,offline,rollback}.*` | control-plane |
| Boot | `control.boot.ready`, preflight failures | bootloader |
| Break-glass | issuance, use, expiry | security-plane |
| Models | inference, eval, version pin | aip-plane |

## Record lifecycle

```
emit -> envelope-validate -> chain-link (hash prev) -> append (audit.record)
     -> stream to event backbone (control/deployment topics)
     -> export to WORM + SIEM   # Layer B: requires real infra
```

A record that fails envelope validation is rejected at the source; an invalid
record never enters the chain.

## Verification

The chain is **replay-verifiable**: a verifier recomputes hashes from genesis and
confirms continuity. This verification is a boot health gate
(`audit_hash_chain_verifies`) and a deployment health gate
(`audit_chain_intact`); a broken chain **aborts** a rollout rather than pausing it.

## Offline continuity

Edge / air-gapped nodes keep a local, still-chained audit buffer
(`buffer_audit_offline`) and flush it on reconnect. The central chain incorporates
the buffered segment so the timeline is continuous and gaps are detectable.

## Separation of duties

Operators who can deploy cannot alter audit; the audit sink is append-only and the
WORM target is write-once. This separation is itself an audited control.
