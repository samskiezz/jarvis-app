# Gap Assessment and Reassessment

## Corrected weaknesses from prior packs
- Replaced repeated topic variations with 5,000 domain subjects.
- Added 260 source families/entry points.
- Added 50,000 endpoint candidates.
- Added 15,000 OCR/document acquisition candidates.
- Added 15,000 benchmark candidates.
- Added production gates, source coverage status and ISO-style evidence requirements.
- Added SQL, graph, vector and operations artifacts.

## Current counts
```json
{
  "catalogues/source_families_260_expanded.csv": 260,
  "catalogues/domain_subjects_5000_iso_expanded.csv": 5000,
  "catalogues/endpoint_candidates_50000.csv": 50000,
  "catalogues/ocr_document_candidates_15000.csv": 15000,
  "benchmarks/benchmark_candidates_15000.csv": 15000,
  "catalogues/typed_flow_edges_55000.csv": 55000,
  "catalogues/subniche_gap_register.csv": 1
}
```

## Remaining work for true production
- Legal review of each source family and document source.
- Actual connector implementation.
- Live parser tests.
- Rate-limit and API-key management.
- Data retention and jurisdiction rules.
- Deployment into real Kafka/PostgreSQL/Iceberg/graph/vector infrastructure.
