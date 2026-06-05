-- Flyway migration. Plane: ontology-plane. Owner language: Java/JVM. Emits: platform.ontology.object_type.v1

CREATE SCHEMA IF NOT EXISTS platform_ontology;

-- Object type registry: property schema + lifecycle state machine.
CREATE TABLE IF NOT EXISTS platform_ontology.object_type (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    environment_id  text,
    api_name        text NOT NULL,
    display_name    text,
    prop_schema     jsonb NOT NULL DEFAULT '{}',
    states          jsonb NOT NULL DEFAULT '[]',
    initial_state   text NOT NULL,
    rules           jsonb NOT NULL DEFAULT '{}',
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED',
    status          text NOT NULL DEFAULT 'active',
    version         int  NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text,
    updated_by      text,
    audit_id        text,
    UNIQUE (tenant_id, api_name)
);
