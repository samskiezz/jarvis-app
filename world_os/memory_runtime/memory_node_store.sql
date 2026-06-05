CREATE TABLE IF NOT EXISTS memory_node (
  memory_node_id TEXT PRIMARY KEY,
  neuron_type TEXT,
  domain_subject_id TEXT,
  vector_id TEXT,
  graph_node_id TEXT,
  confidence NUMERIC,
  freshness NUMERIC,
  authority_score NUMERIC,
  usage_count INTEGER,
  last_used_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  audit_ids JSONB
);
