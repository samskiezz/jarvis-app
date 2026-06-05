-- =============================================================================
-- Row-Level Security — tenant isolation + classification ceiling
-- =============================================================================
-- Real PostgreSQL RLS. Every authoritative table is isolated by tenant and
-- capped by the caller's clearance. The app sets per-request GUCs:
--   SET app.tenant_id = '<tenant>'; SET app.clearance = 'SECRET';
-- The JVM services set these from the SecurityContext on each transaction.
-- =============================================================================

-- clearance rank helper (immutable)
CREATE OR REPLACE FUNCTION platform_policy.clearance_rank(level text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE upper(level)
    WHEN 'UNCLASSIFIED' THEN 0 WHEN 'OFFICIAL' THEN 1
    WHEN 'SECRET' THEN 2 WHEN 'TOPSECRET' THEN 3 ELSE 0 END;
$$;

-- objects
ALTER TABLE platform_objects.object ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_object_tenant ON platform_objects.object;
CREATE POLICY rls_object_tenant ON platform_objects.object
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND platform_policy.clearance_rank(classification)
        <= platform_policy.clearance_rank(current_setting('app.clearance', true))
  );

-- links
ALTER TABLE platform_links.link ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_link_tenant ON platform_links.link;
CREATE POLICY rls_link_tenant ON platform_links.link
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND platform_policy.clearance_rank(classification)
        <= platform_policy.clearance_rank(current_setting('app.clearance', true))
  );

-- action executions
ALTER TABLE platform_actions.execution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_action_tenant ON platform_actions.execution;
CREATE POLICY rls_action_tenant ON platform_actions.execution
  USING (tenant_id = current_setting('app.tenant_id', true));

-- provenance facts (read-capped by classification)
ALTER TABLE platform_lineage.provenance_fact ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_prov_tenant ON platform_lineage.provenance_fact;
CREATE POLICY rls_prov_tenant ON platform_lineage.provenance_fact
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND platform_policy.clearance_rank(classification)
        <= platform_policy.clearance_rank(current_setting('app.clearance', true))
  );

-- NB: BYPASSRLS is granted only to the migration/superuser role, never to the
-- application role. Break-glass uses a dedicated audited role + GUC override.
