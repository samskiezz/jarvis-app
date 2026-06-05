CREATE TABLE IF NOT EXISTS gotham_case (
  case_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  priority TEXT,
  linked_objects JSONB,
  evidence JSONB,
  audit_ids JSONB
);
