# Connector Contract

Every connector must implement:

1. `discover(config)` — discover source resources/endpoints.
2. `fetch(config, checkpoint)` — fetch one batch or stream window.
3. `validate(raw, context)` — validate source, schema, terms and freshness.
4. `parse(raw, context)` — emit StandardAcquisitionEnvelope.
5. `checkpoint(result)` — persist cursor/offset.
6. `audit(result)` — emit source_access + pipeline_run audit events.

Blocking gates:
- source terms approval
- authentication/rate-limit compliance
- schema validation
- provenance completeness
- data quality minimum
- audit write
