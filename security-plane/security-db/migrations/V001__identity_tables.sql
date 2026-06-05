-- Flyway migration. Plane: security-plane. Owner language: Java/JVM. Emits: platform.identity.subject.v1

CREATE SCHEMA IF NOT EXISTS platform_identity;

-- Authoritative subject (principal) registry with clearance + compartments.
CREATE TABLE IF NOT EXISTS platform_identity.subject (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    environment_id  text,
    clearance       text NOT NULL DEFAULT 'UNCLASSIFIED',
    compartments    jsonb NOT NULL DEFAULT '[]',
    purposes        jsonb NOT NULL DEFAULT '[]',
    roles           jsonb NOT NULL DEFAULT '[]',
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED',
    status          text NOT NULL DEFAULT 'active',
    version         int  NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text,
    updated_by      text,
    audit_id        text
);
CREATE INDEX IF NOT EXISTS idx_identity_subject_tenant ON platform_identity.subject(tenant_id, status);
