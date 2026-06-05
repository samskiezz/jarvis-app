# world_os — integration status (honest)

Embedded from `world_os_final_master_pack_v7_runtime_security_apollo.zip`.

## What this is
The full Gotham/Foundry/Apollo/AIP **architecture as scaffold + specs + data catalogues**:
the 20-folder runtime layout (connectors, parsers, quality_gates, ontology_objects,
graph, vectors, memory_runtime, cause_effect_engine, foundry_pipelines,
gotham_mission_apps, apollo_runtime, aip, actions, audit_replay, security_runtime,
evals, test_harness, governance, source_legal_review).

## What it is NOT (read this)
It is **not a running system yet**. Measured on import:

| | count |
|---|---|
| Python files | 173 |
| **stubs that `raise NotImplementedError`** | **121** |
| files with any real logic | 52 |
| avg lines / .py | ~14 |
| YAML/JSON/CSV/MD specs | 183 / 77 / 60 / 39 |

The connectors (`fetch.py`) and parsers (`parse()`) are production *templates* that
raise `NotImplementedError`. Embedding them adds the architecture and the specs, but
**does not make the app function** — implementing the 121 stubs does.

## What IS real and used
- The **specs/registries** (YAML/JSON): connector configs, quality rules, ontology
  object schemas, relationship types, agent/tool registries, apollo desired-state,
  governance/ISO mappings — valid design artifacts the runtime can read.
- The **data catalogues** (92k–100k endpoint candidates, 10k subjects) — kept on disk,
  **gitignored** (the repo `.git` is already 6 GB; bulk data must not go into git).

## The reference for "implemented"
`server/services/world_earthquake.py` is one stub made real: connector → parser →
quality gate → ontology object → audit, against a legally-open source (USGS), with
4 passing tests and verified live ingestion. **Each of the 121 stubs becomes real the
same way.** That implementation work — plus per-source legal clearance and durable
infra — is the actual path to "real", not the scaffold.

## Bulk data handling
`world_os/.gitignore` excludes `*.csv`/`*.xlsx` and the duplicate `stage8_baseline`
catalogues. They live in the working container (ephemeral) — for permanence, move to
object storage and reference by URI.
