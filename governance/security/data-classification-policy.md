# Data Classification Policy

All data on the platform carries a **classification label**. Classification is a
first-class column on stateful tables (e.g. `ontology.object.classification`,
default `UNCLASSIFIED` per
[`contracts/sql/0001_core_schema.sql`](../../contracts/sql/0001_core_schema.sql))
and is enforced by the PDP, not by convention.

## Levels

| Level | Rank | Definition | Default handling |
|-------|------|-----------|------------------|
| `UNCLASSIFIED` | 0 | No expected harm on disclosure | Standard controls |
| `OFFICIAL` | 1 | Routine business; limited harm | Need-to-know, audited |
| `SECRET` | 2 | Serious harm on disclosure | Compartmented, encrypted, no general egress |
| `TOPSECRET` | 3 | Exceptionally grave harm | Strict compartments + caveats, sovereign enclave only |

Ranks are total-ordered; the PDP rule is
`subject.clearance_rank >= resource.classification_rank`
(see [`contracts/policy/action-execution.policy.json`](../../contracts/policy/action-execution.policy.json)).

## Compartments and caveats

Beyond the level, resources may carry **compartments** (e.g. project codewords).
Access requires the resource's compartments to be a subset of the subject's:
`resource.compartments subset_of subject.compartments`. Caveats (handling
restrictions such as NOFORN) are carried as obligations on a permit decision.

## Labeling rules

- New data is labelled with the environment's `DEFAULT_CLASSIFICATION`
  (see `.env.example`) and may be raised, never silently lowered.
- Derived data inherits the **highest** classification of its inputs
  (high-water mark), recorded in `provenance.fact` / `provenance.lineage`.
- Aggregation that raises sensitivity must be re-labelled by a classification
  authority.

## Enforcement points

- **Object read** — denied if clearance is insufficient
  (`object-read.policy.json`).
- **Property read** — individual properties redacted per
  `property-read.policy.json`; redaction, never silent pass-through.
- **Link traversal** — `link-traversal.policy.json` prevents inferring a
  higher-classified neighbour through links.
- **Export** — `export.policy.json` enforces destination clearance and caveats.
- **Environment floor** — each `EnvironmentDesiredState.classification_level`
  sets a floor; `restricted` = `SECRET`, sovereign enclaves handle `TOPSECRET`.

## Declassification and downgrade

Downgrade is a privileged, audited action requiring a classification authority and
a recorded justification. It emits a high-severity audit event. Automated systems
(rollback, replication, model inference) MUST NOT downgrade; boot profiles assert
`no_classification_downgrade_detected`.

## Retention and disposal

Classified data follows the [audit retention policy](audit-retention-policy.md).
Disposal of `SECRET`/`TOPSECRET` media follows sovereign destruction standards;
append-only `audit.*` and `provenance.*` rows are never destroyed within retention.
