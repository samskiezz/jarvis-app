-- Flyway migration. Plane: control-plane. Owner language: Go. Emits: platform.control.environment_state.v1

CREATE SCHEMA IF NOT EXISTS platform_control;

-- Reconciliation snapshots of desired vs observed environment state.
CREATE TABLE IF NOT EXISTS platform_control.environment_state (
    id                text PRIMARY KEY,
    tenant_id         text NOT NULL,
    environment_id    text,
    environment_ref   text NOT NULL,
    observed_state    jsonb NOT NULL DEFAULT '{}',
    desired_state     jsonb NOT NULL DEFAULT '{}',
    reconcile_phase   text NOT NULL DEFAULT 'pending',
    reconciled_at     timestamptz,
    classification    text NOT NULL DEFAULT 'UNCLASSIFIED',
    status            text NOT NULL DEFAULT 'active',
    version           int  NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        text,
    updated_by        text,
    audit_id          text
);
CREATE INDEX IF NOT EXISTS idx_control_envstate_ref ON platform_control.environment_state(environment_ref);
