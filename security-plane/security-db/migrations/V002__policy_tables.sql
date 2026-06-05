-- Flyway migration. Plane: security-plane. Owner language: Java/JVM. Emits: platform.policy.rule.v1

CREATE SCHEMA IF NOT EXISTS platform_policy;

-- Policy rules evaluated at decision points (object_read|action_execution|...).
CREATE TABLE IF NOT EXISTS platform_policy.rule (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    environment_id  text,
    name            text NOT NULL,
    decision_point  text NOT NULL,
    expression      jsonb NOT NULL DEFAULT '{}',
    classification  text NOT NULL DEFAULT 'UNCLASSIFIED',
    status          text NOT NULL DEFAULT 'active',
    version         int  NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text,
    updated_by      text,
    audit_id        text
);
CREATE INDEX IF NOT EXISTS idx_policy_rule_dp ON platform_policy.rule(decision_point, status);
