-- Flyway migration. Plane: control-plane. Owner language: Go. Emits: platform.control.environment.v1

CREATE SCHEMA IF NOT EXISTS platform_control;
CREATE SCHEMA IF NOT EXISTS platform_deployment;

-- Authoritative control-plane environment registry (Apollo desired/current state).
CREATE TABLE IF NOT EXISTS platform_control.environment (
    id                text PRIMARY KEY,
    tenant_id         text NOT NULL,
    environment_id    text,
    region            text,
    network_zone      text,
    tier              int  NOT NULL DEFAULT 0,
    desired_state     jsonb NOT NULL DEFAULT '{}',
    current_version   text,
    last_good_version text,
    classification    text NOT NULL DEFAULT 'UNCLASSIFIED',
    status            text NOT NULL DEFAULT 'active',
    version           int  NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        text,
    updated_by        text,
    audit_id          text
);
CREATE INDEX IF NOT EXISTS idx_control_env_tenant ON platform_control.environment(tenant_id, environment_id);
