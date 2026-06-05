CREATE TABLE IF NOT EXISTS audit_hash_chain (audit_id TEXT PRIMARY KEY, previous_hash TEXT, input_hash TEXT, output_hash TEXT, event JSONB, created_at TIMESTAMPTZ DEFAULT now());
