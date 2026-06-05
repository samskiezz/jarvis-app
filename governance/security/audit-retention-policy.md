# Audit Retention Policy

The audit log is the platform's tamper-evident system of record. It is
**append-only** and **hash-chained**: `audit.record` (and `audit.event`) are never
UPDATEd or DELETEd within their retention window, per the append-only convention in
[`contracts/sql/0001_core_schema.sql`](../../contracts/sql/0001_core_schema.sql).

## What is retained

Every record uses the
[audit envelope](../../contracts/json-schema/audit-envelope.schema.json) and includes:

- Subject (identity, roles, clearance), declared **purpose**, tenant.
- Resource and its classification.
- Decision point and outcome (`permit` / `deny` / `redact`).
- Obligations enforced, prior-record hash (chain link), timestamp.

Mandatory event classes: PDP decisions (`policy.*`), deployment gate/rollout/
rollback events (`deployment.*`), break-glass issuance/use/expiry, classification
changes, and authentication events.

## Retention periods

| Data class | Minimum retention | Store |
|------------|-------------------|-------|
| Security/PDP decisions | 7 years | WORM + SIEM |
| Deployment & control events | 3 years | WORM |
| Break-glass records | 7 years | WORM + SIEM (flagged) |
| Classification change events | Indefinite (life of program) | WORM |
| Provenance / lineage (`provenance.*`) | Life of the data it describes | PostgreSQL + Iceberg |

`SECRET`/`TOPSECRET`-related audit follows the longest applicable sovereign
requirement; when policies conflict, the **longest** retention wins.

## Integrity guarantees

- The hash chain makes any insertion, deletion, or reordering detectable: each
  record commits the hash of its predecessor.
- The chain is **replay-verifiable** — an independent verifier can recompute it end
  to end. Boot profiles assert `audit_hash_chain_verifies` before reaching `ready`.
- Production target is a WORM store + SIEM export. *(Layer B: requires real
  infra — WORM/SIEM/OpenSearch clusters; the Layer A `jarvis_os` audit chain is the
  reference.)*

## Offline and edge

Air-gapped / edge nodes buffer audit locally (`buffer_audit_offline: true`) and
flush the buffered, still-chained records to the central WORM store on reconnect.
The chain is continuous across the disconnection; gaps are detectable.

## Disposal

After the retention window, disposal is itself an audited, authorized event.
Records under legal hold or tied to live provenance are exempt until released.
Nothing is destroyed merely to reclaim space.
