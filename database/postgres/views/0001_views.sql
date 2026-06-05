-- =============================================================================
-- Read-model views (CQRS read side). Apps query views, never raw tables.
-- =============================================================================

-- Golden object: resolves the entity-resolution crosswalk to the canonical record.
CREATE OR REPLACE VIEW platform_objects.v_golden_object AS
SELECT o.*,
       COALESCE(m.canonical_id, o.id) AS resolved_canonical_id,
       (m.canonical_id IS NOT NULL)   AS is_merged
FROM platform_objects.object o
LEFT JOIN platform_lineage.er_merge m ON m.merged_id = o.id;

-- Object with its outbound + inbound link counts (investigation summary).
CREATE OR REPLACE VIEW platform_objects.v_object_degree AS
SELECT o.id, o.object_type, o.state, o.classification,
       (SELECT count(*) FROM platform_links.link l WHERE l.from_id = o.id) AS out_degree,
       (SELECT count(*) FROM platform_links.link l WHERE l.to_id   = o.id) AS in_degree
FROM platform_objects.object o;

-- Pending approvals queue (mission-app approval console).
CREATE OR REPLACE VIEW platform_actions.v_pending_approvals AS
SELECT id, tenant_id, action, risk, payload, created_at
FROM platform_actions.approval
WHERE status = 'pending'
ORDER BY created_at;

-- Fleet state summary (control-plane console).
CREATE OR REPLACE VIEW platform_control.v_fleet AS
SELECT id AS environment_id, tier, current_version, last_good_version, status, updated_at
FROM platform_control.environment
ORDER BY tier;

-- Audit chain head (latest hash for tamper-evident verification).
CREATE OR REPLACE VIEW platform_audit.v_chain_head AS
SELECT id, audit_id, event_type, occurred_at, hash
FROM platform_audit.record
ORDER BY id DESC
LIMIT 1;
