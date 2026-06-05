-- Flyway migration. Plane: control-plane. Owner language: Go. Emits: platform.deployment.release.v1

CREATE SCHEMA IF NOT EXISTS platform_deployment;

-- Signed deployable artefacts (name@version) with SBOM + provenance.
CREATE TABLE IF NOT EXISTS platform_deployment.artefact (
    id               text PRIMARY KEY,                 -- name@version
    tenant_id        text NOT NULL,
    environment_id   text,
    name             text NOT NULL,
    artefact_version text NOT NULL,
    content_hash     text NOT NULL,
    signed           boolean NOT NULL DEFAULT false,
    sbom             jsonb NOT NULL DEFAULT '[]',
    provenance       jsonb NOT NULL DEFAULT '{}',
    classification   text NOT NULL DEFAULT 'UNCLASSIFIED',
    status           text NOT NULL DEFAULT 'registered',
    version          int  NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text,
    updated_by       text,
    audit_id         text
);

-- Releases bind an artefact to an environment via a rollout strategy + gates.
CREATE TABLE IF NOT EXISTS platform_deployment.release (
    id               text PRIMARY KEY,
    tenant_id        text NOT NULL,
    environment_id   text NOT NULL,
    artefact         text NOT NULL,
    artefact_version text NOT NULL,
    strategy         text NOT NULL,
    gates            jsonb NOT NULL DEFAULT '[]',
    stages           jsonb NOT NULL DEFAULT '[]',
    approval_id      text,
    classification   text NOT NULL DEFAULT 'UNCLASSIFIED',
    status           text NOT NULL DEFAULT 'pending',
    version          int  NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text,
    updated_by       text,
    audit_id         text
);
CREATE INDEX IF NOT EXISTS idx_deployment_release_env ON platform_deployment.release(environment_id, status);
