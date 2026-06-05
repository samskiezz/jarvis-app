# Database Standards

PostgreSQL is the authoritative metadata store (ADR-005). The authoritative model
is [`contracts/sql/0001_core_schema.sql`](../../contracts/sql/0001_core_schema.sql)
with operational artefacts under
[`database/postgres/`](../../database/postgres/) (`schemas`, `indexes`, `rls`,
`views`, `seed`). The Layer A reference uses the **same logical tables** in SQLite.

## Conventions (from the core schema)

- **Identifiers** are `text`/`uuid`; timestamps are `timestamptz` named `*_ts`.
- **Payloads** are `jsonb` and **versioned** (e.g. `control.environment.desired_state`).
- **Append-only tables never UPDATE/DELETE** — `audit.record`, `audit.event`,
  `provenance.fact`, `provenance.lineage`, and temporal facts are insert-only.
- **Every mutating table has a classification + provenance pathway** — e.g.
  `ontology.object.classification` defaults `UNCLASSIFIED`.

## Schema ownership

One writer per schema, matching the [service boundaries](service-boundaries.md):
`control` (Apollo), `ontology`, `security`, `provenance`, `kinetic`, `audit`. No
plane writes another plane's schema; integration is via API/events.

## Row-level security

RLS is **on** for tenant- and classification-scoped tables
(`database/postgres/rls/0001_row_level_security.sql`). RLS is defense-in-depth
*behind* the PDP: a permit still cannot return rows outside the subject's tenant or
above its clearance. Boot profiles assert `rls_enabled: true`.

## Migrations

- **Forward + paired down.** Every migration ships a reversible `down` script;
  irreversible changes escalate (see
  [`deployment/rollback-policies/database-rollback.yaml`](../../deployment/rollback-policies/database-rollback.yaml)).
- **Expand / contract.** Add columns/tables first (expand), backfill, switch
  readers, then remove (contract) in a later release — never a destructive change in
  the same step as the read switch.
- **Never drop append-only.** Down migrations may not touch `audit.*` /
  `provenance.*`.
- Migrations are numbered (`0001_*`) and applied in order; the boot `storage_init`
  phase asserts `migrations_applied` and `schema_matches_contract`.

## Indexes and views

- Indexes live in `database/postgres/indexes/`; add an index with the query it
  serves, do not speculatively index.
- Read models are expressed as views (`database/postgres/views/`) so consumers do
  not couple to raw table shapes.

## Contract stability

The DDL is the contract: JVM services materialise exactly these tables. A table
contract change is stable across Layer A → Layer B and is an ADR-worthy event.
