-- Flyway migration. Plane: action-plane. Owner language: Java/JVM. Emits: platform.actions.execution.v1

CREATE SCHEMA IF NOT EXISTS platform_actions;

-- Action execution ledger: every invocation with policy decision + side-effect trail.
CREATE TABLE IF NOT EXISTS platform_actions.execution (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    action_type text NOT NULL, target_object_id text NOT NULL,
    initiating_identity text NOT NULL, initiating_agent text, declared_purpose text,
    input_payload jsonb NOT NULL DEFAULT '{}', precondition_results jsonb NOT NULL DEFAULT '{}',
    policy_decision jsonb, approval_id text, approver_identity text,
    side_effects jsonb NOT NULL DEFAULT '[]', writeback_target text,
    rollback_reference text, compensation_reference text,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'requested',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_action_exec_target ON platform_actions.execution(tenant_id, target_object_id);
CREATE INDEX IF NOT EXISTS idx_action_exec_type ON platform_actions.execution(tenant_id, action_type, status);
