-- Flyway migration. Plane: ontology-plane. Owner language: Java/JVM. Emits: platform.ontology.source_mapping.v1

CREATE SCHEMA IF NOT EXISTS platform_ontology;

-- Source-to-ontology property mappings with transform definitions.
CREATE TABLE IF NOT EXISTS platform_ontology.source_mapping (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    environment_id  text,
    object_type     text NOT NULL,
    property_name   text NOT NULL,
    source_system   text NOT NULL,
    source_field    text NOT NULL,
    transform       jsonb NOT NULL DEFAULT '{}',
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED',
    status          text NOT NULL DEFAULT 'active',
    version         int  NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text,
    updated_by      text,
    audit_id        text
);
CREATE INDEX IF NOT EXISTS idx_ontology_srcmap_obj ON platform_ontology.source_mapping(object_type, source_system);
