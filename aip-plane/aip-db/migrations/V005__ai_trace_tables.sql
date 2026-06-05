-- Flyway migration. Plane: aip-plane. Owner language: Java/JVM. Emits: platform.ai.trace.v1

CREATE SCHEMA IF NOT EXISTS platform_ai;

-- AI interaction traces: prompt/response provenance with citations + redactions.
CREATE TABLE IF NOT EXISTS platform_ai.trace (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    subject_id text NOT NULL, query text, model text, purpose text,
    context_object_ids jsonb NOT NULL DEFAULT '[]', citations jsonb NOT NULL DEFAULT '[]',
    redactions jsonb NOT NULL DEFAULT '[]', cost real, latency_ms int,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'completed',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_ai_trace_subject ON platform_ai.trace(tenant_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_ai_trace_model ON platform_ai.trace(tenant_id, model);
