# Observability Standards

The observability plane gives every plane a uniform way to expose health, metrics,
traces, and logs so that deployment health gates and operators can reason about the
system. Observability signals are classification-aware and never a side channel for
sensitive data.

## The three signals

- **Metrics** — numeric time series (RED: rate, errors, duration; plus
  domain metrics like `policy_deny_ratio_delta`, `kafka_consumer_lag_max`).
- **Traces** — distributed traces correlated by the request correlation id that
  also flows into events and audit.
- **Logs** — structured `snake_case` JSON; never plaintext secrets or data above
  the reader's clearance.

## Health endpoints

- Every service exposes `/healthz` (liveness) and a readiness signal.
- These back the deployment **health gates** (`liveness`, `error_rate`,
  `latency_p99`) in [`deployment/rollout-policies/`](../../deployment/rollout-policies/)
  and the boot `service_register` phase
  ([`deployment/boot-profiles/`](../../deployment/boot-profiles/)).

## Golden signals used as gates

| Signal | Metric | Used by |
|--------|--------|---------|
| Errors | `http_5xx_ratio` | canary / rolling pause conditions |
| Latency | `request_latency_p99_ms` | production canary gate |
| Policy | `policy_deny_ratio_delta` | `pdp_deny_anomaly` gate |
| Backbone | `kafka_consumer_lag_max` | production `event_lag` gate |
| Integrity | `audit_hash_chain_verifies` | boot + deploy invariant gate |

A breached gate pauses or aborts a rollout and can trigger rollback — observability
is therefore load-bearing, not decorative.

## Correlation

- One correlation id per request, propagated across API → events → audit. The same
  id appears in traces, the [event envelope](../../contracts/events/event-envelope.schema.json),
  and the [audit envelope](../../contracts/json-schema/audit-envelope.schema.json),
  so an investigation joins all three.

## Classification and privacy

- Telemetry is treated as data: it carries no payload above `OFFICIAL` unless the
  sink is cleared, and high cardinality identifiers are hashed.
- In `restricted`/`airgapped` profiles, telemetry stays inside the enclave; nothing
  egresses (`enforce_egress_block`). Edge nodes buffer and reconcile.

## SLOs and alerting

- Each plane declares SLOs for its golden signals; alerts fire on SLO burn, not on
  raw thresholds, to reduce noise.
- Alerting integrates with break-glass and incident flows; a SEV1 alert can gate an
  [emergency patch](../../deployment/rollout-policies/emergency-patch.yaml).

## Layer honesty

Production tracing/metrics backends (e.g. OpenSearch/Prometheus/OTel collectors)
are Layer B (`# requires real infra`); the Layer A reference emits the same
structured signals locally.
