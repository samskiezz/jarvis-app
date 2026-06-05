-- =============================================================================
-- Seed data — system tenant, environments, roles, classifications, base ontology
-- =============================================================================
INSERT INTO platform_identity.subject (id, tenant_id, clearance, roles, purposes, created_by)
VALUES
  ('system',   'system', 'TOPSECRET', '["admin"]',    '["operations"]', 'bootloader'),
  ('analyst1', 'system', 'OFFICIAL',  '["analyst"]',  '["investigation"]', 'bootloader'),
  ('officer1', 'system', 'SECRET',    '["operator"]', '["investigation"]', 'bootloader')
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform_control.environment (id, tenant_id, tier, status, created_by)
VALUES
  ('dev',     'system', 0, 'active', 'bootloader'),
  ('staging', 'system', 1, 'active', 'bootloader'),
  ('prod',    'system', 2, 'active', 'bootloader')
ON CONFLICT (id) DO NOTHING;

-- base mission ontology object types
INSERT INTO platform_ontology.object_type (id, tenant_id, api_name, prop_schema, states, initial_state, created_by)
VALUES
  ('ot_person','system','Person','{"name":"str","role":"str","email":"str"}','["active","flagged","cleared"]','active','bootloader'),
  ('ot_org','system','Organisation','{"name":"str","sector":"str","country":"str"}','["active","under_review","cleared"]','active','bootloader'),
  ('ot_asset','system','Asset','{"name":"str","kind":"str","value":"float"}','["active","frozen","released"]','active','bootloader')
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform_ontology.link_type (id, tenant_id, api_name, source_object_type, target_object_type, created_by)
VALUES
  ('lt_works_for','system','works_for','Person','Organisation','bootloader'),
  ('lt_owns','system','owns','Organisation','Asset','bootloader')
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform_ontology.action_type (id, tenant_id, api_name, object_type, permission, risk, from_state, to_state, description, created_by)
VALUES
  ('at_flag_risk','system','flag_risk','Person','workflow.run','high','active','flagged','Flag a person for risk review','bootloader'),
  ('at_freeze','system','freeze','Asset','workflow.run','high','active','frozen','Freeze an asset','bootloader')
ON CONFLICT (id) DO NOTHING;
