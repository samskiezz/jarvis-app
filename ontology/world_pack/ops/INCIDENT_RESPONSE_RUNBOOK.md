# Incident Response Runbook

## Severity
SEV1: audit failure, policy bypass, production AI leakage, source legal breach.
SEV2: stale critical source, parser corruption, graph load failure, vector leak risk.
SEV3: non-critical source outage, benchmark warning, delayed refresh.

## Required actions
- Freeze affected connector.
- Preserve evidence.
- Quarantine bad records.
- Notify owner.
- Run rollback or rebuild.
- Update root-cause log.
- Add regression test.
