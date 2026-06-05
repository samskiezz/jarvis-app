# Master Index

This package is the Stage 7 ISO-level operational expansion of the world ontology acquisition system.

## Main outputs
- `catalogues/domain_subjects_5000_iso_expanded.csv` - every subject row expanded with subniches, source candidates, OCR candidates, benchmark counts and acceptance gates.
- `catalogues/endpoint_candidates_50000.csv` - 10 endpoint/source candidates per subject row.
- `catalogues/ocr_document_candidates_15000.csv` - 3 OCR/document-corpus candidates per subject row.
- `benchmarks/benchmark_candidates_15000.csv` - 3 benchmark/evaluation sources per subject row.
- `catalogues/source_families_260_expanded.csv` - official/public/licensed source family catalogue.
- `docs/*` - ISO-style operational documentation, SOPs, controls, acceptance criteria and governance docs.
- `sql/*` - database DDL and load plan.
- `graph/*` - graph ontology, Cypher loading and typed relationship design.
- `vectors/*` - vector memory/neuron design and payload schemas.
- `pipelines/*` - ingestion, OCR and data-quality pipeline specifications.
- `ops/*` - operations runbooks, incident handling, RACI and production acceptance.

## Boundary
Use official APIs, public datasets, licensed feeds, enterprise-owned data and permitted public documents. Do not scan exposed private cameras, intercept private communications, bypass authentication or scrape terms-prohibited professional/private profiles.
