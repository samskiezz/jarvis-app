-- Flyway migration. Plane: security-plane. Owner language: Java/JVM. Emits: platform.policy.label.v1

CREATE SCHEMA IF NOT EXISTS platform_policy;

-- Classification labels bound to resources (level/compartment/purpose).
CREATE TABLE IF NOT EXISTS platform_policy.label (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    environment_id  text,
    resource_id     text NOT NULL,
    prop            text NOT NULL DEFAULT '',
    level           text NOT NULL DEFAULT 'OFFICIAL',
    compartment     text NOT NULL DEFAULT '',
    purpose         text NOT NULL DEFAULT '',
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED',
    status          text NOT NULL DEFAULT 'active',
    version         int  NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text,
    updated_by      text,
    audit_id        text,
    UNIQUE (resource_id, prop)
);
CREATE INDEX IF NOT EXISTS idx_policy_label_resource ON platform_policy.label(resource_id);
