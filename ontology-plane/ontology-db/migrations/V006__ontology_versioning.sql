-- Flyway migration. Plane: ontology-plane. Owner language: Java/JVM. Emits: platform.ontology.version.v1

CREATE SCHEMA IF NOT EXISTS platform_ontology;

-- Ontology version registry: snapshots of the type system for promotion/rollback.
CREATE TABLE IF NOT EXISTS platform_ontology.ontology_version (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    environment_id  text,
    ontology_name   text NOT NULL,
    semver          text NOT NULL,
    parent_version  text,
    object_types    jsonb NOT NULL DEFAULT '[]',
    link_types      jsonb NOT NULL DEFAULT '[]',
    action_types    jsonb NOT NULL DEFAULT '[]',
    changelog       jsonb NOT NULL DEFAULT '{}',
    published_at    timestamptz,
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED',
    status          text NOT NULL DEFAULT 'draft',
    version         int  NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text,
    UNIQUE (tenant_id, ontology_name, semver)
);

-- Per-type migration steps applied between ontology versions.
CREATE TABLE IF NOT EXISTS platform_ontology.ontology_migration (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    environment_id  text,
    from_version    text NOT NULL,
    to_version      text NOT NULL,
    type_api_name   text NOT NULL,
    change_kind     text NOT NULL,        -- add_property|drop_property|rename|widen|narrow
    migration_spec  jsonb NOT NULL DEFAULT '{}',
    reversible      boolean NOT NULL DEFAULT true,
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED',
    status          text NOT NULL DEFAULT 'pending',
    version         int  NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_ontology_version_name ON platform_ontology.ontology_version(tenant_id, ontology_name);
CREATE INDEX IF NOT EXISTS idx_ontology_migration_range ON platform_ontology.ontology_migration(tenant_id, from_version, to_version);
