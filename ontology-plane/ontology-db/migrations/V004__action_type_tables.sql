-- Flyway migration. Plane: ontology-plane. Owner language: Java/JVM. Emits: platform.ontology.action_type.v1

CREATE SCHEMA IF NOT EXISTS platform_ontology;

-- Action type registry: permissioned state transitions on object types.
CREATE TABLE IF NOT EXISTS platform_ontology.action_type (
    id                 text PRIMARY KEY,
    tenant_id          text NOT NULL,
    environment_id     text,
    api_name           text NOT NULL,
    object_type        text NOT NULL,
    permission         text NOT NULL,
    risk               text NOT NULL DEFAULT 'medium',
    from_state         text NOT NULL,
    to_state           text NOT NULL,
    input_schema       jsonb NOT NULL DEFAULT '{}',
    approval_required  boolean NOT NULL DEFAULT true,
    description        text,
    classification     text NOT NULL DEFAULT 'UNCLASSIFIED',
    status             text NOT NULL DEFAULT 'active',
    version            int  NOT NULL DEFAULT 1,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         text,
    updated_by         text,
    audit_id           text
);
CREATE INDEX IF NOT EXISTS idx_ontology_actiontype_obj ON platform_ontology.action_type(object_type, status);
