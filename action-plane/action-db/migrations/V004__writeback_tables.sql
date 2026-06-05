-- Flyway migration. Plane: action-plane. Owner language: Java/JVM. Emits: platform.actions.writeback.v1

CREATE SCHEMA IF NOT EXISTS platform_actions;

-- Writeback records: outbound mutations pushed to source systems of record.
CREATE TABLE IF NOT EXISTS platform_actions.writeback (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    execution_id   text NOT NULL,
    target_system  text NOT NULL,
    target_record  text,
    operation      text NOT NULL DEFAULT 'upsert',   -- upsert|update|delete
    request_payload jsonb NOT NULL DEFAULT '{}',
    response_payload jsonb NOT NULL DEFAULT '{}',
    idempotency_key text,
    attempts       int NOT NULL DEFAULT 0,
    committed_at   timestamptz,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'pending',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_action_writeback_exec ON platform_actions.writeback(tenant_id, execution_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_action_writeback_idem ON platform_actions.writeback(target_system, idempotency_key) WHERE idempotency_key IS NOT NULL;
