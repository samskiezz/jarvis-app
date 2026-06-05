# Data-Specific Rendering Rules

## Source Catalogue
Data files:
- `catalogues/source_families_350_expanded.csv`
- `advanced_sources/source_families_total_v4.csv`
- `catalogues/endpoint_candidates_actual_92000.csv`

Rendering:
- source families render as compact rows with source_id, source_name, URL, access method, auth and domain_use.
- endpoint candidates render as server-paginated rows; no full 92,000-row client load.
- every source row exposes: Trace Source, Review Terms, Open Endpoint Candidates, Show Graph.

## Ontology Explorer
Data files:
- `catalogues/domain_subjects_10000_iso_expanded.csv`
- `catalogues/priority_acquisition_points_1000.csv`
- `advanced_acquisition_points/v4_next_level_acquisition_points_5000.csv`

Rendering:
- subject rows render as object cards grouped by master_topic, neuron_type and ontology_targets.
- priority acquisition points render cause/effect side-by-side: cause_input -> effect_output.
- V4 acquisition points render by domain_cluster and technology_layer.

## Vector Memory
Data files:
- `vectors/v6_vector_namespace_registry.csv`
- `vectors/v6_vector_database_schema.json`

Rendering:
- each namespace shows source file, row count, primary key, embedding text fields and graph link.
- retrieval test button runs namespace-specific query and displays evidence IDs and audit IDs.
- no retrieved chunk can appear unless policy filters pass.

## Evidence/OCR Viewer
Data file:
- `catalogues/ocr_document_candidates_30000.csv`

Rendering:
- OCR candidates show source_url, document_types, OCR policy, quality metrics and ontology targets.
- low OCR confidence triggers manual review workflow.
- document chunks must show citation anchor and original file hash.

## Benchmark Console
Data file:
- `benchmarks/benchmark_candidates_30000.csv`

Rendering:
- benchmarks render grouped by applies_to and metric.
- failed benchmark opens release gate block and remediation workflow.

## Apollo Runtime
Data files:
- `apollo_runtime/desired_state/*.yaml`
- `apollo_runtime/health_gates/*.yaml`
- `advanced_sources/source_families_total_v4.csv`

Rendering:
- connector/parser/model/policy states render as desired vs current state.
- rollouts show wave, health gate, drift and rollback ref.
