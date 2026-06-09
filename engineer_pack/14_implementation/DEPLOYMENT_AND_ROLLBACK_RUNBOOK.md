# Deployment and Rollback Runbook

## Deploy

1. Back up DB and current app.
2. Deploy backend services behind feature flags.
3. Enable read-only dashboard state first.
4. Enable pipeline controls for one non-critical worker.
5. Enable Asset Forge in draft mode only.
6. Enable Three.js cinematic mode for admin only.
7. Enable LLM router telemetry read-only.
8. Gradually enable controls and automations.

## Rollback

1. Disable feature flags.
2. Stop new jobs.
3. Drain queues.
4. Revert frontend bundle.
5. Revert backend service image.
6. Restore DB snapshot only if schema/data migration caused damage.
7. Preserve audit logs.
