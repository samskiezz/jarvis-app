-- =============================================================================
-- Sovereign Platform — Authoritative State Schema (PostgreSQL / distributed SQL)
-- =============================================================================
-- This is the PRODUCTION authoritative metadata model (Layer B). The Layer A
-- reference kernel uses the same logical tables in SQLite (see server/services/
-- jarvis_*.py). This DDL is the contract: the JVM services materialise exactly
-- these tables, with Kafka for events and Iceberg for history/time-travel.
--
-- Conventions:
--   * ids are text/uuid; *_ts are timestamptz; payloads are jsonb (versioned).
--   * append-only tables never UPDATE/DELETE (audit, events, provenance, temporal).
--   * every mutating table has a classification + provenance pathway.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS control;     -- Apollo desired/current state
CREATE SCHEMA IF NOT EXISTS ontology;    -- object/link/action/function types + instances
CREATE SCHEMA IF NOT EXISTS security;    -- subjects, classification labels, policy
CREATE SCHEMA IF NOT EXISTS provenance;  -- bitemporal facts + lineage
CREATE SCHEMA IF NOT EXISTS kinetic;     -- actions, approvals, workflows
CREATE SCHEMA IF NOT EXISTS audit;       -- tamper-evident audit + events

-- ----------------------------------------------------------------------------
-- control: Apollo delivery fabric (Layer 1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.environment (
    environment_id      text PRIMARY KEY,
    tenant_id           text,
    region              text,
    network_zone        text,
    classification_level text NOT NULL DEFAULT 'UNCLASSIFIED',
    tier                int  NOT NULL DEFAULT 0,           -- dev=0 staging=1 prod=2
    current_version     text,
    last_good_version   text,
    desired_state       jsonb NOT NULL DEFAULT '{}',       -- EnvironmentDesiredState
    created_ts          timestamptz NOT NULL DEFAULT now(),
    updated_ts          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.artefact (
    artefact_id   text PRIMARY KEY,                        -- name@version
    name          text NOT NULL,
    version       text NOT NULL,
    content_hash  text NOT NULL,
    signed        boolean NOT NULL DEFAULT false,
    sbom          jsonb NOT NULL DEFAULT '[]',
    provenance    jsonb NOT NULL DEFAULT '{}',
    created_ts    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.release (
    release_id    text PRIMARY KEY,
    artefact      text NOT NULL,
    version       text NOT NULL,
    environment_id text NOT NULL REFERENCES control.environment(environment_id),
    strategy      text NOT NULL,                           -- canary|rolling|bluegreen
    status        text NOT NULL,                           -- gate_failed|deployed|rolled_back|pending_approval
    gates         jsonb NOT NULL DEFAULT '[]',
    stages        jsonb NOT NULL DEFAULT '[]',
    approval_id   text,
    created_ts    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- ontology: kernel (Layer 6) + object runtime (Layer 7)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ontology.object_type (
    api_name     text PRIMARY KEY,
    display_name text,
    schema       jsonb NOT NULL DEFAULT '{}',              -- property -> type
    states       jsonb NOT NULL DEFAULT '[]',
    initial_state text NOT NULL,
    rules        jsonb NOT NULL DEFAULT '{}',              -- security/quality/validation/writeback rules
    created_ts   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ontology.link_type (
    api_name        text PRIMARY KEY,
    source_object_type text NOT NULL,
    target_object_type text NOT NULL,
    cardinality     text NOT NULL DEFAULT 'many',
    directionality  text NOT NULL DEFAULT 'directed',
    rules           jsonb NOT NULL DEFAULT '{}',
    created_ts      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ontology.action_type (
    api_name      text PRIMARY KEY,
    object_type   text NOT NULL REFERENCES ontology.object_type(api_name),
    permission    text NOT NULL,
    risk          text NOT NULL DEFAULT 'medium',
    from_state    text NOT NULL,
    to_state      text NOT NULL,
    input_schema  jsonb NOT NULL DEFAULT '{}',
    approval_required boolean NOT NULL DEFAULT true,
    description   text,
    created_ts    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ontology.object (
    object_id    text PRIMARY KEY,
    object_type  text NOT NULL REFERENCES ontology.object_type(api_name),
    props        jsonb NOT NULL DEFAULT '{}',
    state        text NOT NULL,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED',
    valid_time   timestamptz,
    created_ts   timestamptz NOT NULL DEFAULT now(),
    updated_ts   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_object_type ON ontology.object(object_type);

CREATE TABLE IF NOT EXISTS ontology.link (
    link_id    text PRIMARY KEY,
    link_type  text NOT NULL REFERENCES ontology.link_type(api_name),
    from_id    text NOT NULL,
    to_id      text NOT NULL,
    confidence real,
    valid_from timestamptz,
    valid_to   timestamptz,
    created_ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_link_from ON ontology.link(from_id);
CREATE INDEX IF NOT EXISTS idx_link_to   ON ontology.link(to_id);

-- ----------------------------------------------------------------------------
-- security: subjects + classification labels (Layer 2)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security.subject (
    subject_id   text PRIMARY KEY,
    clearance    text NOT NULL DEFAULT 'UNCLASSIFIED',
    compartments jsonb NOT NULL DEFAULT '[]',
    purposes     jsonb NOT NULL DEFAULT '[]',
    updated_ts   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security.label (
    resource_id text NOT NULL,
    prop        text NOT NULL DEFAULT '',          -- '' = whole object
    level       text NOT NULL DEFAULT 'OFFICIAL',
    compartment text NOT NULL DEFAULT '',
    purpose     text NOT NULL DEFAULT '',
    PRIMARY KEY (resource_id, prop)
);

-- ----------------------------------------------------------------------------
-- provenance: bitemporal facts + entity resolution (Layers 5, 8)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provenance.temporal_fact (   -- append-only, bitemporal
    fact_id    bigserial PRIMARY KEY,
    object_id  text NOT NULL,
    prop       text NOT NULL,
    value      text,
    valid_from timestamptz NOT NULL,
    tx_time    timestamptz NOT NULL DEFAULT now(),
    actor      text,
    source     text,
    confidence real,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED'
);
CREATE INDEX IF NOT EXISTS idx_tf ON provenance.temporal_fact(object_id, prop, valid_from, tx_time);

CREATE TABLE IF NOT EXISTS provenance.er_merge (        -- reversible identity crosswalk
    canonical_id text NOT NULL,
    merged_id    text NOT NULL,
    actor        text,
    confidence   real,
    merged_ts    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (canonical_id, merged_id)
);

-- ----------------------------------------------------------------------------
-- kinetic: action executions + approvals + workflows (Layers 10, 11)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kinetic.action_execution (
    execution_id   text PRIMARY KEY,
    action_type    text NOT NULL,
    target_object_id text NOT NULL,
    initiating_identity text NOT NULL,
    initiating_agent text,
    declared_purpose text,
    input_payload  jsonb NOT NULL DEFAULT '{}',
    policy_decision jsonb,
    approval_id    text,
    status         text NOT NULL,
    side_effects   jsonb NOT NULL DEFAULT '[]',
    rollback_reference text,
    audit_id       text,
    created_ts     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kinetic.approval (
    approval_id text PRIMARY KEY,
    action      text NOT NULL,
    payload     jsonb NOT NULL DEFAULT '{}',
    risk        text NOT NULL,
    status      text NOT NULL,                      -- pending|approved|denied
    decided_by  text,
    reason      text,
    created_ts  timestamptz NOT NULL DEFAULT now(),
    decided_ts  timestamptz
);

-- ----------------------------------------------------------------------------
-- audit: tamper-evident chain + event log (Layers 5/15)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit.record (              -- hash-chained, append-only
    id        bigserial PRIMARY KEY,
    ts        timestamptz NOT NULL DEFAULT now(),
    actor     text,
    action    text NOT NULL,
    target    text,
    meta      jsonb NOT NULL DEFAULT '{}',
    prev_hash text NOT NULL,
    hash      text NOT NULL
);

CREATE TABLE IF NOT EXISTS audit.event (               -- envelope mirror; Kafka is transport
    seq        bigserial PRIMARY KEY,
    event_id   text UNIQUE NOT NULL,
    event_type text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    produced_by text NOT NULL,
    tenant_id  text,
    environment_id text,
    object_id  text,
    correlation_id text,
    causation_id text,
    payload_schema_version text NOT NULL DEFAULT '1.0.0',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED',
    payload    jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_event_type ON audit.event(event_type, seq);
