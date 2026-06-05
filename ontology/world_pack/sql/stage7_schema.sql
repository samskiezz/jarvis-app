
CREATE SCHEMA IF NOT EXISTS world_ontology_stage7;

CREATE TABLE IF NOT EXISTS world_ontology_stage7.source_family (
  source_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL,
  access_method TEXT,
  auth TEXT,
  domain_use TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_ontology_stage7.domain_subject (
  subject_id TEXT PRIMARY KEY,
  master_topic TEXT NOT NULL,
  domain_subject TEXT NOT NULL,
  subniches_15 TEXT NOT NULL,
  primary_source_ids TEXT NOT NULL,
  secondary_source_ids TEXT,
  source_count INTEGER NOT NULL,
  source_coverage_status TEXT NOT NULL,
  neuron_id TEXT NOT NULL,
  neuron_type TEXT NOT NULL,
  vector_namespace TEXT NOT NULL,
  ontology_targets TEXT NOT NULL,
  policy_controls TEXT NOT NULL,
  audit_records TEXT NOT NULL,
  production_acceptance_gate TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_ontology_stage7.endpoint_candidate (
  endpoint_candidate_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES world_ontology_stage7.domain_subject(subject_id),
  source_id TEXT NOT NULL REFERENCES world_ontology_stage7.source_family(source_id),
  rank INTEGER NOT NULL,
  official_url TEXT NOT NULL,
  access_method TEXT,
  recommended_ingestion_connector TEXT NOT NULL,
  parser_strategy TEXT NOT NULL,
  refresh_cadence TEXT NOT NULL,
  licence_review_required BOOLEAN NOT NULL DEFAULT true,
  robots_or_terms_review_required BOOLEAN NOT NULL DEFAULT true,
  production_status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_ontology_stage7.ocr_document_candidate (
  ocr_candidate_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES world_ontology_stage7.domain_subject(subject_id),
  source_id TEXT NOT NULL REFERENCES world_ontology_stage7.source_family(source_id),
  rank INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  document_types TEXT NOT NULL,
  ocr_policy TEXT NOT NULL,
  ocr_pipeline TEXT NOT NULL,
  quality_metrics TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_ontology_stage7.benchmark_candidate (
  benchmark_candidate_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES world_ontology_stage7.domain_subject(subject_id),
  source_id TEXT NOT NULL REFERENCES world_ontology_stage7.source_family(source_id),
  rank INTEGER NOT NULL,
  benchmark_url TEXT NOT NULL,
  benchmark_purpose TEXT NOT NULL,
  metrics TEXT NOT NULL,
  acceptance_gate TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stage7_domain_topic ON world_ontology_stage7.domain_subject(master_topic);
CREATE INDEX IF NOT EXISTS idx_stage7_domain_neuron ON world_ontology_stage7.domain_subject(neuron_type);
CREATE INDEX IF NOT EXISTS idx_stage7_endpoint_subject ON world_ontology_stage7.endpoint_candidate(subject_id);
CREATE INDEX IF NOT EXISTS idx_stage7_endpoint_source ON world_ontology_stage7.endpoint_candidate(source_id);
CREATE INDEX IF NOT EXISTS idx_stage7_benchmark_subject ON world_ontology_stage7.benchmark_candidate(subject_id);
