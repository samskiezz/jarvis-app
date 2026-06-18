# Security Invariants

The 10 rules enforced by `assurance.invariants.runner.run_all`:

| # | Rule | Failure shape |
|---|---|---|
| 1 | `dangerous_requires_approval` | Dangerous command dispatched without approval AND without dry-run. |
| 2 | `command_creates_audit` | Bus history command_id missing from the audit log. |
| 3 | `event_has_correlation` | Assurance-source event emitted with no correlation_id. |
| 4 | `privileged_action_audited` | Dangerous or admin-named command has no audit row. |
| 5 | `idempotency_no_double` | Two successful dispatches share an idempotency_key. |
| 6 | `failed_sync_not_silent` | Failed sync command has no matching `sync.failed` event. |
| 7 | `no_secret_in_audit` | Audit entry matches a secret pattern. |
| 8 | `no_secret_in_events` | Event entry matches a secret pattern. |
| 9 | `actor_present` | Dispatched command has empty `actor`. |
| 10 | `workflow_no_skip` | Workflow instance reached terminal state with zero events. |

## Adding a rule

```python
from assurance.invariants.registry import register
def my_rule(snap): return True, "evidence"
register("my_rule", my_rule)
```

## Snapshot shape

`{ commands: [...], events: [...], audit: [...], workflow_instances: [...] }`

## TLA+ correspondence

`SAFETY_CommandAlwaysAudited` in `tla/AppWorkflow.tla` is the formal version
of rules #2 and #4.
