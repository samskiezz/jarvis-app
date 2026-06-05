-- Flyway migration. Plane: object-runtime. Owner language: Java/JVM. Emits: platform.lineage.provenance.v1

CREATE SCHEMA IF NOT EXISTS platform_lineage;

-- Append-only bitemporal provenance facts backing object property timelines.
CREATE TABLE IF NOT EXISTS platform_lineage.provenance_fact (
    id bigserial PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    object_id text NOT NULL, property_name text NOT NULL, value text,
    source_system text, source_dataset text, source_record_id text, source_field text,
    transform_id text, transform_version text, mapping_id text, mapping_version text,
    quality_score real, confidence_score real,
    valid_time_start timestamptz NOT NULL, valid_time_end timestamptz,
    transaction_time_start timestamptz NOT NULL DEFAULT now(), transaction_time_end timestamptz,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED',
    created_at timestamptz NOT NULL DEFAULT now(), created_by text, verified_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_prov ON platform_lineage.provenance_fact(object_id, property_name, valid_time_start, transaction_time_start);

-- Reversible entity-resolution crosswalk.
CREATE TABLE IF NOT EXISTS platform_lineage.er_merge (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    canonical_id text NOT NULL, merged_id text NOT NULL, confidence_score real,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'merged',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text,
    UNIQUE (canonical_id, merged_id)
);
