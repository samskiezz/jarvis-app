# UI to Backend Mapping

## Foundry toggle
Frontend sees:
- source catalogue
- pipeline health
- ontology object explorer
- graph/vector memory
- data quality and lineage

Backend uses:
- connectors
- parsers
- Iceberg raw/curated storage
- PostgreSQL object runtime
- graph DB
- vector DB
- audit/replay

## Gotham toggle
Frontend sees:
- common operating picture
- live alerts
- map/timeline
- entity investigation
- evidence chain
- workflow/action approval

Backend uses:
- ontology objects
- relationship graph
- event feeds
- case/workflow engine
- action engine
- policy and audit

## Apollo toggle
Frontend sees:
- desired state
- fleet health
- rollout status
- drift
- rollback
- connector/model/parser release gates

Backend uses:
- desired-state manifests
- fleet agents
- health gates
- deployment policies
- SBOM/CVE and audit evidence
