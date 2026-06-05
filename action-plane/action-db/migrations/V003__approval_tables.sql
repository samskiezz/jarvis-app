-- Flyway migration. Plane: action-plane. Owner language: Java/JVM. Emits: platform.actions.approval.v1

CREATE SCHEMA IF NOT EXISTS platform_actions;

-- Human-in-the-loop approvals for risk-gated actions.
CREATE TABLE IF NOT EXISTS platform_actions.approval (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    action text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', risk text NOT NULL,
    decided_by text, reason text, decided_at timestamptz,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'pending',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_action_approval_status ON platform_actions.approval(tenant_id, status, risk);
