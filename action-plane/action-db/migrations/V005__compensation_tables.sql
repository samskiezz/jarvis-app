-- Flyway migration. Plane: action-plane. Owner language: Java/JVM. Emits: platform.actions.compensation.v1

CREATE SCHEMA IF NOT EXISTS platform_actions;

-- Saga compensation log: reversal steps for failed/aborted action executions.
CREATE TABLE IF NOT EXISTS platform_actions.compensation (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    execution_id    text NOT NULL,
    saga_id         text,
    step_index      int NOT NULL DEFAULT 0,
    compensate_action text NOT NULL,
    compensate_payload jsonb NOT NULL DEFAULT '{}',
    reason          text,
    compensated_at  timestamptz,
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'pending',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_action_comp_exec ON platform_actions.compensation(tenant_id, execution_id);
CREATE INDEX IF NOT EXISTS idx_action_comp_saga ON platform_actions.compensation(saga_id, step_index);
