-- Flyway migration. Plane: security-plane. Owner language: Java/JVM. Emits: platform.policy.break_glass.v1

CREATE SCHEMA IF NOT EXISTS platform_policy;

-- Emergency break-glass grants: time-bound, fully audited privilege escalations.
CREATE TABLE IF NOT EXISTS platform_policy.break_glass (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    environment_id  text,
    subject_id      text NOT NULL,
    resource_id     text,
    justification   text NOT NULL,
    granted_scope   jsonb NOT NULL DEFAULT '{}',
    approver_id     text,
    activated_at    timestamptz,
    expires_at      timestamptz,
    revoked_at      timestamptz,
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED',
    status          text NOT NULL DEFAULT 'requested',
    version         int  NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text,
    updated_by      text,
    audit_id        text
);
CREATE INDEX IF NOT EXISTS idx_policy_breakglass_subject ON platform_policy.break_glass(subject_id, status);
