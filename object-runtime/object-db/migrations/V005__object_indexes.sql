-- Flyway migration. Plane: object-runtime. Owner language: Java/JVM. Emits: platform.objects.index.v1

CREATE SCHEMA IF NOT EXISTS platform_objects;
CREATE SCHEMA IF NOT EXISTS platform_links;

-- Object read-path indexes.
CREATE INDEX IF NOT EXISTS idx_objects_type ON platform_objects.object(tenant_id, object_type);
CREATE INDEX IF NOT EXISTS idx_objects_canonical ON platform_objects.object(canonical_id);
CREATE INDEX IF NOT EXISTS idx_objects_state ON platform_objects.object(tenant_id, object_type, state);
CREATE INDEX IF NOT EXISTS idx_objects_source ON platform_objects.object(source_system, source_record_id);
CREATE INDEX IF NOT EXISTS idx_objects_valid_time ON platform_objects.object(valid_time_start, valid_time_end);
CREATE INDEX IF NOT EXISTS idx_objects_txn_time ON platform_objects.object(transaction_time_start, transaction_time_end);
CREATE INDEX IF NOT EXISTS idx_objects_props_gin ON platform_objects.object USING gin (props);

-- Link traversal indexes.
CREATE INDEX IF NOT EXISTS idx_links_from ON platform_links.link(from_id);
CREATE INDEX IF NOT EXISTS idx_links_to   ON platform_links.link(to_id);
CREATE INDEX IF NOT EXISTS idx_links_type ON platform_links.link(tenant_id, link_type);
CREATE INDEX IF NOT EXISTS idx_links_valid_time ON platform_links.link(valid_time_start, valid_time_end);
