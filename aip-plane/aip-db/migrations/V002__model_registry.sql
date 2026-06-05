-- Flyway migration. Plane: aip-plane. Owner language: Java/JVM. Emits: platform.ai.registry.model.v1

CREATE SCHEMA IF NOT EXISTS platform_ai;

-- Model registry (specialization of platform_ai.registry where kind = 'model').
CREATE TABLE IF NOT EXISTS platform_ai.model_registry (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    kind text NOT NULL DEFAULT 'model',
    name text NOT NULL, provider text, model_family text, model_version text,
    spec jsonb NOT NULL DEFAULT '{}', capabilities jsonb NOT NULL DEFAULT '[]',
    context_window int, cost_per_1k_input real, cost_per_1k_output real,
    risk text NOT NULL DEFAULT 'medium',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text,
    UNIQUE (tenant_id, name, model_version)
);
CREATE INDEX IF NOT EXISTS idx_model_registry_provider ON platform_ai.model_registry(tenant_id, provider);
