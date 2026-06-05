# ISO-Style Operations Manual

## Operating principles
1. Every source has an owner, licence decision, parser, schema, data-quality gate, ontology target and audit trail.
2. Every subject maps to an ontology object, vector namespace, graph projection, event topic and policy boundary.
3. Every workflow is evidence-backed, policy-checked and audit-recorded.
4. Every model output is traceable to source facts, prompts, tool calls, retrieval context and evaluation scores.
5. No connector enters production without acceptance evidence.

## Source onboarding procedure
1. Register source family.
2. Capture official URL, terms, access method, authentication and rate limits.
3. Define parser strategy.
4. Define raw and curated storage targets.
5. Define data quality tests.
6. Define ontology mapping.
7. Define graph/vector projection.
8. Define policy controls.
9. Define audit events.
10. Run benchmark and acceptance tests.
11. Promote through Apollo deployment workflow.

## Document/OCR procedure
1. Confirm document is public, licensed or enterprise-owned.
2. Download original to immutable object storage.
3. Hash and virus scan the file.
4. Extract native text if available.
5. OCR only when allowed and required.
6. Run layout parser and citation-anchor extraction.
7. Chunk text with stable IDs.
8. Embed into vector namespace.
9. Create Document, Evidence, Fact and Provenance objects.
10. Write audit trail.

## Production promotion gate
A source is production ready only if:
- Terms reviewed.
- Parser tested.
- Schema validated.
- Freshness SLA defined.
- Quality checks pass.
- Ontology mapping approved.
- Policy controls enforced.
- Audit and lineage emitted.
- Benchmark baseline recorded.
