-- Flyway migration. Plane: ontology-plane. Owner language: Java/JVM. Emits: platform.ontology.link_type.v1

CREATE SCHEMA IF NOT EXISTS platform_ontology;

-- Link type registry: typed relationships between object types.
CREATE TABLE IF NOT EXISTS platform_ontology.link_type (
    id                  text PRIMARY KEY,
    tenant_id           text NOT NULL,
    environment_id      text,
    api_name            text NOT NULL,
    source_object_type  text NOT NULL,
    target_object_type  text NOT NULL,
    cardinality         text NOT NULL DEFAULT 'many',
    directionality      text NOT NULL DEFAULT 'directed',
    rules               jsonb NOT NULL DEFAULT '{}',
    classification      text NOT NULL DEFAULT 'UNCLASSIFIED',
    status              text NOT NULL DEFAULT 'active',
    version             int  NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    audit_id            text
);
CREATE INDEX IF NOT EXISTS idx_ontology_linktype_src ON platform_ontology.link_type(source_object_type, target_object_type);
