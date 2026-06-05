CREATE TABLE IF NOT EXISTS ontology_object (
  object_id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,
  label TEXT,
  properties JSONB NOT NULL,
  valid_time_start TIMESTAMPTZ,
  valid_time_end TIMESTAMPTZ,
  transaction_time_start TIMESTAMPTZ DEFAULT now(),
  transaction_time_end TIMESTAMPTZ,
  provenance JSONB NOT NULL,
  policy JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS ontology_link (
  link_id TEXT PRIMARY KEY,
  source_object_id TEXT NOT NULL,
  target_object_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  confidence NUMERIC,
  provenance JSONB NOT NULL,
  policy JSONB NOT NULL
);
