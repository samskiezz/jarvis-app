
CREATE SCHEMA IF NOT EXISTS world_ontology_stage7;

CREATE TABLE IF NOT EXISTS world_ontology_stage7.source_family (
  source_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  access_method TEXT,
  auth TEXT,
  domain_use TEXT,
  terms_review_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_ontology_stage7.domain_subject (
  subject_id TEXT PRIMARY KEY,
  master_topic TEXT NOT NULL,
  domain_subject TEXT NOT NULL,
  priority INTEGER NOT NULL,
  neuron_id TEXT NOT NULL,
  neuron_type TEXT NOT NULL,
  vector_namespace TEXT NOT NULL,
  subniches_15 TEXT NOT NULL,
  primary_source_ids TEXT NOT NULL,
  secondary_source_ids TEXT,
  source_count INTEGER,
  source_coverage_status TEXT,
  iso_evidence_required TEXT,
  production_acceptance_gate TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_ontology_stage7.endpoint_candidate (
  endpoint_candidate_id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES world_ontology_stage7.domain_subject(subject_id),
  source_id TEXT,
  source_name TEXT,
  official_url TEXT,
  access_method TEXT,
  auth_requirement TEXT,
  recommended_ingestion_connector TEXT,
  parser_strategy TEXT,
  refresh_cadence TEXT,
  licence_review_required BOOLEAN DEFAULT true,
  robots_or_terms_review_required BOOLEAN DEFAULT true,
  production_status TEXT DEFAULT 'candidate_not_yet_implemented'
);

CREATE TABLE IF NOT EXISTS world_ontology_stage7.ocr_document_candidate (
  ocr_candidate_id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES world_ontology_stage7.domain_subject(subject_id),
  source_id TEXT,
  source_name TEXT,
  source_url TEXT,
  document_types TEXT,
  ocr_policy TEXT,
  ocr_pipeline TEXT,
  quality_metrics TEXT,
  storage TEXT,
  ontology_targets TEXT
);

CREATE TABLE IF NOT EXISTS world_ontology_stage7.benchmark_candidate (
  benchmark_candidate_id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES world_ontology_stage7.domain_subject(subject_id),
  source_id TEXT,
  benchmark_name TEXT,
  benchmark_url TEXT,
  benchmark_purpose TEXT,
  metrics TEXT,
  acceptance_gate TEXT,
  applies_to TEXT
);

CREATE INDEX IF NOT EXISTS idx_stage7_subject_topic ON world_ontology_stage7.domain_subject(master_topic);
CREATE INDEX IF NOT EXISTS idx_stage7_subject_neuron ON world_ontology_stage7.domain_subject(neuron_type);
CREATE INDEX IF NOT EXISTS idx_stage7_endpoint_subject ON world_ontology_stage7.endpoint_candidate(subject_id);
CREATE INDEX IF NOT EXISTS idx_stage7_ocr_subject ON world_ontology_stage7.ocr_document_candidate(subject_id);
CREATE INDEX IF NOT EXISTS idx_stage7_benchmark_subject ON world_ontology_stage7.benchmark_candidate(subject_id);
