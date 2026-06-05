-- Flyway migration. Plane: control-plane. Owner language: Go. Emits: platform.control.fleet_state.v1

CREATE SCHEMA IF NOT EXISTS platform_control;

-- Per-node fleet membership and observed runtime state.
CREATE TABLE IF NOT EXISTS platform_control.fleet_node (
    id               text PRIMARY KEY,
    tenant_id        text NOT NULL,
    environment_id   text,
    node_name        text NOT NULL,
    region           text,
    network_zone     text,
    running_version  text,
    heartbeat_at     timestamptz,
    capabilities     jsonb NOT NULL DEFAULT '[]',
    observed_state   jsonb NOT NULL DEFAULT '{}',
    classification   text NOT NULL DEFAULT 'UNCLASSIFIED',
    status           text NOT NULL DEFAULT 'active',
    version          int  NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text,
    updated_by       text,
    audit_id         text
);
CREATE INDEX IF NOT EXISTS idx_control_fleet_env ON platform_control.fleet_node(environment_id, status);
