-- Flyway migration. Plane: event-plane. Owner language: Go. Emits: platform.events.replay.v1

CREATE SCHEMA IF NOT EXISTS platform_events;

-- Replay jobs: bounded re-emission of historical events for projection rebuilds.
CREATE TABLE IF NOT EXISTS platform_events.replay_job (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    event_type     text,
    source_topic   text NOT NULL,
    target_topic   text,
    from_seq       bigint,
    to_seq         bigint,
    from_time      timestamptz,
    to_time        timestamptz,
    cursor_seq     bigint NOT NULL DEFAULT 0,
    events_replayed bigint NOT NULL DEFAULT 0,
    requested_by   text,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'pending',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_replay_job_status ON platform_events.replay_job(tenant_id, status);
