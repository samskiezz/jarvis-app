-- Flyway migration. Plane: aip-plane. Owner language: Java/JVM. Emits: platform.ai.registry.agent.v1

CREATE SCHEMA IF NOT EXISTS platform_ai;

-- Agent registry (specialization of platform_ai.registry where kind = 'agent').
CREATE TABLE IF NOT EXISTS platform_ai.agent_registry (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    kind text NOT NULL DEFAULT 'agent',
    name text NOT NULL, display_name text,
    spec jsonb NOT NULL DEFAULT '{}',
    model_ref text, system_prompt_ref text,
    allowed_tools jsonb NOT NULL DEFAULT '[]', allowed_purposes jsonb NOT NULL DEFAULT '[]',
    autonomy_level text NOT NULL DEFAULT 'supervised',   -- supervised|semi|autonomous
    risk text NOT NULL DEFAULT 'medium',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text,
    UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_agent_registry_model ON platform_ai.agent_registry(tenant_id, model_ref);
