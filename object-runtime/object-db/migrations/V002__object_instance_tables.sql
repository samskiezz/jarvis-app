-- Flyway migration. Plane: object-runtime. Owner language: Java/JVM. Emits: platform.objects.object.v1

CREATE SCHEMA IF NOT EXISTS platform_objects;

-- Live operational object instances. Bitemporal + entity-resolution columns.
CREATE TABLE IF NOT EXISTS platform_objects.object (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    object_type text NOT NULL, props jsonb NOT NULL DEFAULT '{}', state text NOT NULL,
    canonical_id text,                       -- entity-resolution golden pointer
    confidence_score real,
    source_system text, source_record_id text,
    valid_time_start timestamptz, valid_time_end timestamptz,
    transaction_time_start timestamptz NOT NULL DEFAULT now(), transaction_time_end timestamptz,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
