-- Flyway migration. Plane: object-runtime. Owner language: Java/JVM. Emits: platform.links.link.v1

CREATE SCHEMA IF NOT EXISTS platform_links;

-- Live operational link instances. Bitemporal.
CREATE TABLE IF NOT EXISTS platform_links.link (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    link_type text NOT NULL, from_id text NOT NULL, to_id text NOT NULL,
    confidence_score real, relationship_state text NOT NULL DEFAULT 'asserted',
    valid_time_start timestamptz, valid_time_end timestamptz,
    transaction_time_start timestamptz NOT NULL DEFAULT now(), transaction_time_end timestamptz,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
