-- =============================================================================
-- SOVEREIGN PLATFORM — Authoritative State Schemas (PostgreSQL)
-- =============================================================================
-- Production state model. Owns authoritative metadata; Kafka owns events,
-- Iceberg owns history/time-travel. Every table carries the platform standard
-- columns; bitemporal + provenance columns are added where required.
--
-- Standard columns (every table):
--   id, tenant_id, environment_id, classification, status, version,
--   created_at, updated_at, created_by, updated_by, audit_id
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS platform_control;
CREATE SCHEMA IF NOT EXISTS platform_identity;
CREATE SCHEMA IF NOT EXISTS platform_policy;
CREATE SCHEMA IF NOT EXISTS platform_ontology;
CREATE SCHEMA IF NOT EXISTS platform_objects;
CREATE SCHEMA IF NOT EXISTS platform_links;
CREATE SCHEMA IF NOT EXISTS platform_actions;
CREATE SCHEMA IF NOT EXISTS platform_audit;
CREATE SCHEMA IF NOT EXISTS platform_events;
CREATE SCHEMA IF NOT EXISTS platform_ai;
CREATE SCHEMA IF NOT EXISTS platform_deployment;
CREATE SCHEMA IF NOT EXISTS platform_lineage;

-- Reusable enum-likes (kept as text + CHECK for portability to distributed SQL)
-- classification ∈ UNCLASSIFIED|OFFICIAL|SECRET|TOPSECRET

-- ----------------------------------------------------------------------------
-- platform_identity
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_identity.subject (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    environment_id  text,
    clearance       text NOT NULL DEFAULT 'UNCLASSIFIED',
    compartments    jsonb NOT NULL DEFAULT '[]',
    purposes        jsonb NOT NULL DEFAULT '[]',
    roles           jsonb NOT NULL DEFAULT '[]',
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED',
    status          text NOT NULL DEFAULT 'active',
    version         int  NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text, updated_by text, audit_id text
);

-- ----------------------------------------------------------------------------
-- platform_control  (Apollo desired/current state)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_control.environment (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    environment_id  text,
    region          text,
    network_zone    text,
    tier            int  NOT NULL DEFAULT 0,
    desired_state   jsonb NOT NULL DEFAULT '{}',
    current_version text,
    last_good_version text,
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED',
    status          text NOT NULL DEFAULT 'active',
    version         int  NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);

-- ----------------------------------------------------------------------------
-- platform_deployment  (artefacts + releases)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_deployment.artefact (
    id              text PRIMARY KEY,                 -- name@version
    tenant_id       text NOT NULL, environment_id text,
    name            text NOT NULL, artefact_version text NOT NULL,
    content_hash    text NOT NULL, signed boolean NOT NULL DEFAULT false,
    sbom            jsonb NOT NULL DEFAULT '[]', provenance jsonb NOT NULL DEFAULT '{}',
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'registered',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE TABLE IF NOT EXISTS platform_deployment.release (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text NOT NULL,
    artefact text NOT NULL, artefact_version text NOT NULL, strategy text NOT NULL,
    gates jsonb NOT NULL DEFAULT '[]', stages jsonb NOT NULL DEFAULT '[]', approval_id text,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'pending',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);

-- ----------------------------------------------------------------------------
-- platform_policy
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_policy.label (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    resource_id text NOT NULL, prop text NOT NULL DEFAULT '',
    level text NOT NULL DEFAULT 'OFFICIAL', compartment text NOT NULL DEFAULT '',
    purpose text NOT NULL DEFAULT '',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text,
    UNIQUE (resource_id, prop)
);
CREATE TABLE IF NOT EXISTS platform_policy.rule (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    name text NOT NULL, decision_point text NOT NULL,   -- object_read|action_execution|...
    expression jsonb NOT NULL DEFAULT '{}',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);

-- ----------------------------------------------------------------------------
-- platform_ontology  (type registries)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_ontology.object_type (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    api_name text NOT NULL, display_name text, prop_schema jsonb NOT NULL DEFAULT '{}',
    states jsonb NOT NULL DEFAULT '[]', initial_state text NOT NULL, rules jsonb NOT NULL DEFAULT '{}',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text,
    UNIQUE (tenant_id, api_name)
);
CREATE TABLE IF NOT EXISTS platform_ontology.link_type (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    api_name text NOT NULL, source_object_type text NOT NULL, target_object_type text NOT NULL,
    cardinality text NOT NULL DEFAULT 'many', directionality text NOT NULL DEFAULT 'directed',
    rules jsonb NOT NULL DEFAULT '{}',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE TABLE IF NOT EXISTS platform_ontology.action_type (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    api_name text NOT NULL, object_type text NOT NULL, permission text NOT NULL,
    risk text NOT NULL DEFAULT 'medium', from_state text NOT NULL, to_state text NOT NULL,
    input_schema jsonb NOT NULL DEFAULT '{}', approval_required boolean NOT NULL DEFAULT true,
    description text,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE TABLE IF NOT EXISTS platform_ontology.source_mapping (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    object_type text NOT NULL, property_name text NOT NULL,
    source_system text NOT NULL, source_field text NOT NULL, transform jsonb NOT NULL DEFAULT '{}',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);

-- ----------------------------------------------------------------------------
-- platform_objects / platform_links  (live operational state, bitemporal)
-- ----------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_objects_type ON platform_objects.object(tenant_id, object_type);
CREATE INDEX IF NOT EXISTS idx_objects_canonical ON platform_objects.object(canonical_id);

CREATE TABLE IF NOT EXISTS platform_links.link (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    link_type text NOT NULL, from_id text NOT NULL, to_id text NOT NULL,
    confidence_score real, relationship_state text NOT NULL DEFAULT 'asserted',
    valid_time_start timestamptz, valid_time_end timestamptz,
    transaction_time_start timestamptz NOT NULL DEFAULT now(),
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_links_from ON platform_links.link(from_id);
CREATE INDEX IF NOT EXISTS idx_links_to   ON platform_links.link(to_id);

-- ----------------------------------------------------------------------------
-- platform_actions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_actions.execution (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    action_type text NOT NULL, target_object_id text NOT NULL,
    initiating_identity text NOT NULL, initiating_agent text, declared_purpose text,
    input_payload jsonb NOT NULL DEFAULT '{}', precondition_results jsonb NOT NULL DEFAULT '{}',
    policy_decision jsonb, approval_id text, approver_identity text,
    side_effects jsonb NOT NULL DEFAULT '[]', writeback_target text,
    rollback_reference text, compensation_reference text,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'requested',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE TABLE IF NOT EXISTS platform_actions.approval (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    action text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', risk text NOT NULL,
    decided_by text, reason text, decided_at timestamptz,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'pending',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);

-- ----------------------------------------------------------------------------
-- platform_lineage  (bitemporal facts + provenance + ER crosswalk)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_lineage.provenance_fact (   -- append-only
    id bigserial PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    object_id text NOT NULL, property_name text NOT NULL, value text,
    source_system text, source_dataset text, source_record_id text, source_field text,
    transform_id text, transform_version text, mapping_id text, mapping_version text,
    quality_score real, confidence_score real,
    valid_time_start timestamptz NOT NULL, valid_time_end timestamptz,
    transaction_time_start timestamptz NOT NULL DEFAULT now(),
    classification text NOT NULL DEFAULT 'UNCLASSIFIED',
    created_at timestamptz NOT NULL DEFAULT now(), created_by text, verified_by text, audit_id text
);
CREATE INDEX IF NOT EXISTS idx_prov ON platform_lineage.provenance_fact(object_id, property_name, valid_time_start, transaction_time_start);

CREATE TABLE IF NOT EXISTS platform_lineage.er_merge (          -- reversible identity crosswalk
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    canonical_id text NOT NULL, merged_id text NOT NULL, confidence_score real,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'merged',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text,
    UNIQUE (canonical_id, merged_id)
);

-- ----------------------------------------------------------------------------
-- platform_ai
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_ai.trace (
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    subject_id text NOT NULL, query text, model text, purpose text,
    context_object_ids jsonb NOT NULL DEFAULT '[]', citations jsonb NOT NULL DEFAULT '[]',
    redactions jsonb NOT NULL DEFAULT '[]', cost real, latency_ms int,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'completed',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);
CREATE TABLE IF NOT EXISTS platform_ai.registry (   -- model/prompt/agent/tool registry
    id text PRIMARY KEY, tenant_id text NOT NULL, environment_id text,
    kind text NOT NULL,            -- model|prompt|agent|tool
    name text NOT NULL, spec jsonb NOT NULL DEFAULT '{}', risk text NOT NULL DEFAULT 'medium',
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', status text NOT NULL DEFAULT 'active',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text, updated_by text, audit_id text
);

-- ----------------------------------------------------------------------------
-- platform_audit  (hash-chained) + platform_events (envelope mirror)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_audit.record (
    id bigserial PRIMARY KEY, audit_id text UNIQUE NOT NULL,
    tenant_id text, environment_id text,
    event_type text NOT NULL, actor_type text, actor_id text,
    object_id text, action_type text, policy_decision jsonb,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED',
    source_ip text, user_agent text, correlation_id text, causation_id text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    payload_hash text NOT NULL, previous_hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_events.event (
    seq bigserial PRIMARY KEY, event_id text UNIQUE NOT NULL, event_type text NOT NULL,
    event_version text NOT NULL DEFAULT '1.0.0', occurred_at timestamptz NOT NULL DEFAULT now(),
    producer text NOT NULL, tenant_id text, environment_id text,
    object_id text, correlation_id text, causation_id text,
    classification text NOT NULL DEFAULT 'UNCLASSIFIED', audit_required boolean NOT NULL DEFAULT true,
    payload jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_type ON platform_events.event(event_type, seq);
