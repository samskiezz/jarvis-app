-- =============================================================================
-- Performance + lookup indexes (idempotent)
-- =============================================================================
-- objects
CREATE INDEX IF NOT EXISTS idx_obj_tenant_type   ON platform_objects.object(tenant_id, object_type);
CREATE INDEX IF NOT EXISTS idx_obj_state         ON platform_objects.object(object_type, state);
CREATE INDEX IF NOT EXISTS idx_obj_canonical     ON platform_objects.object(canonical_id);
CREATE INDEX IF NOT EXISTS idx_obj_props_gin     ON platform_objects.object USING gin (props);
CREATE INDEX IF NOT EXISTS idx_obj_bitemporal    ON platform_objects.object(transaction_time_start, transaction_time_end);

-- links (graph traversal both directions)
CREATE INDEX IF NOT EXISTS idx_link_from_type    ON platform_links.link(from_id, link_type);
CREATE INDEX IF NOT EXISTS idx_link_to_type      ON platform_links.link(to_id, link_type);

-- provenance / bitemporal point-in-time reconstruction
CREATE INDEX IF NOT EXISTS idx_prov_lookup       ON platform_lineage.provenance_fact(object_id, property_name, valid_time_start, transaction_time_start);

-- actions + approvals
CREATE INDEX IF NOT EXISTS idx_action_status     ON platform_actions.execution(status, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_status   ON platform_actions.approval(status, created_at);

-- audit + events (tamper chain walk + topic scan)
CREATE INDEX IF NOT EXISTS idx_audit_corr        ON platform_audit.record(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_object      ON platform_audit.record(object_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_corr       ON platform_events.event(correlation_id);

-- ai traces
CREATE INDEX IF NOT EXISTS idx_ai_trace_subject  ON platform_ai.trace(subject_id, created_at);

-- ontology lookups
CREATE INDEX IF NOT EXISTS idx_actiontype_objtype ON platform_ontology.action_type(object_type);
CREATE INDEX IF NOT EXISTS idx_linktype_src       ON platform_ontology.link_type(source_object_type, target_object_type);
