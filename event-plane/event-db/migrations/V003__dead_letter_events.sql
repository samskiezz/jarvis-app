-- Flyway migration. Plane: event-plane. Owner language: Go. Emits: platform.events.dead_letter.v1

CREATE SCHEMA IF NOT EXISTS platform_events;

-- Dead-letter queue: events that failed processing after retry exhaustion.
CREATE TABLE IF NOT EXISTS platform_events.dead_letter (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    original_event_id text,
    event_type     text NOT NULL,
    source_topic   text NOT NULL,
    consumer_group text,
    partition      int,
    offset_value   bigint,
    failure_reason text,
    error_payload  jsonb NOT NULL DEFAULT '{}',
    original_payload jsonb NOT NULL DEFAULT '{}',
    retry_count    int NOT NULL DEFAULT 0,
    last_retry_at  timestamptz,
    redrive_at     timestamptz,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'dead',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_dlq_type ON platform_events.dead_letter(tenant_id, event_type, status);
CREATE INDEX IF NOT EXISTS idx_dlq_original ON platform_events.dead_letter(original_event_id);
