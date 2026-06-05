# Production Operations Runbook

## Daily operations
- Check source freshness failures.
- Check parser error queue.
- Check benchmark regression failures.
- Check ontology mapping changes.
- Check graph edge load failures.
- Check vector ingestion latency.
- Check policy deny anomalies.
- Check audit chain completeness.

## Incident classes
- Source unavailable
- Parser regression
- Schema drift
- Licence/terms issue
- Data quality degradation
- Policy bypass attempt
- AI hallucination/citation failure
- Vector retrieval leakage
- Graph edge explosion
- Audit write failure

## Response
1. Stop affected connector if needed.
2. Preserve raw records.
3. Open incident workflow.
4. Notify owner.
5. Run rollback or quarantine.
6. Document root cause.
7. Add regression test.
