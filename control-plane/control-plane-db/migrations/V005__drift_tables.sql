-- Flyway migration. Plane: control-plane. Owner language: Go. Emits: platform.control.drift_detected.v1

CREATE SCHEMA IF NOT EXISTS platform_control;

-- Detected drift between desired and observed state per environment/node.
CREATE TABLE IF NOT EXISTS platform_control.drift (
    id               text PRIMARY KEY,
    tenant_id        text NOT NULL,
    environment_id   text,
    environment_ref  text NOT NULL,
    node_ref         text,
    drift_kind       text NOT NULL DEFAULT 'config',
    expected         jsonb NOT NULL DEFAULT '{}',
    actual           jsonb NOT NULL DEFAULT '{}',
    diff             jsonb NOT NULL DEFAULT '{}',
    severity         text NOT NULL DEFAULT 'medium',
    detected_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at      timestamptz,
    classification   text NOT NULL DEFAULT 'UNCLASSIFIED',
    status           text NOT NULL DEFAULT 'open',
    version          int  NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text,
    updated_by       text,
    audit_id         text
);
CREATE INDEX IF NOT EXISTS idx_control_drift_env ON platform_control.drift(environment_ref, status);
