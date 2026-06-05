-- Flyway migration. Plane: event-plane. Owner language: Go. Emits: platform.events.event.v1

CREATE SCHEMA IF NOT EXISTS platform_events;

-- Canonical event envelope mirror (Kafka owns the stream; this is the queryable index).
CREATE TABLE IF NOT EXISTS platform_events.event (
    seq bigserial PRIMARY KEY, event_id text UNIQUE NOT NULL, event_type text NOT NULL,
    event_version text NOT NULL DEFAULT '1.0.0', occurred_at timestamptz NOT NULL DEFAULT now(),
    producer text NOT NULL, tenant_id text, environment_id text,
    object_id text, correlation_id text, causation_id text,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', audit_required boolean NOT NULL DEFAULT true,
    payload jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_type ON platform_events.event(event_type, seq);
CREATE INDEX IF NOT EXISTS idx_events_correlation ON platform_events.event(correlation_id);

-- Schema registry for event contracts (type -> versioned JSON schema).
CREATE TABLE IF NOT EXISTS platform_events.schema_registry (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    event_type text NOT NULL, event_version text NOT NULL DEFAULT '1.0.0',
    json_schema jsonb NOT NULL DEFAULT '{}', kafka_topic text NOT NULL,
    compatibility text NOT NULL DEFAULT 'BACKWARD',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text,
    UNIQUE (tenant_id, event_type, event_version)
);
