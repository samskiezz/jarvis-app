-- Flyway migration. Plane: aip-plane. Owner language: Java/JVM. Emits: platform.ai.registry.tool.v1

CREATE SCHEMA IF NOT EXISTS platform_ai;

-- Tool registry (specialization of platform_ai.registry where kind = 'tool').
CREATE TABLE IF NOT EXISTS platform_ai.tool_registry (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    kind text NOT NULL DEFAULT 'tool',
    name text NOT NULL, display_name text,
    spec jsonb NOT NULL DEFAULT '{}',
    input_schema jsonb NOT NULL DEFAULT '{}', output_schema jsonb NOT NULL DEFAULT '{}',
    bound_action_type text,                    -- maps to platform_ontology.action_type
    side_effecting boolean NOT NULL DEFAULT false,
    required_permission text,
    risk text NOT NULL DEFAULT 'medium',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text,
    UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_tool_registry_action ON platform_ai.tool_registry(tenant_id, bound_action_type);
