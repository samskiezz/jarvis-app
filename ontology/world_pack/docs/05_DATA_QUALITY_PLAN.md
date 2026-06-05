# Data Quality Plan

## Data quality dimensions
- Authority
- Accuracy
- Completeness
- Consistency
- Freshness
- Validity
- Uniqueness
- Timeliness
- Traceability
- Licence conformance
- Ontology mapping completeness
- Policy enforceability

## Required gates
Each production source must pass:
- schema_valid
- freshness_valid
- source_url_reachable
- duplicate_check
- time_range_valid
- geospatial_valid_if_applicable
- licence_checked
- provenance_complete
- parser_regression_passed
- benchmark_result_recorded

## Score model
DataQualityScore =
  authority_weight +
  freshness_score +
  completeness_score +
  schema_score +
  provenance_score +
  parser_confidence +
  benchmark_score -
  incident_penalty
