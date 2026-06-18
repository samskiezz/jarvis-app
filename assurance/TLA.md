# TLA+ Spec

`assurance/tla/AppWorkflow.tla` models the Claude-run workflow:

States: `pending` → `running` → `done | failed` → `archived`.

Safety invariants:
- `SAFETY_CommandAlwaysAudited` (formal #2)
- `SAFETY_NoSkipArchive` (archive only from done/failed)
- `SAFETY_TerminalIsArchived` (only `archived` is terminal)

## Running TLC

```bash
java -cp tla2tools.jar tlc2.TLC AppWorkflow.tla -config AppWorkflow.cfg
```

CI does NOT require TLC. The Python invariant runner enforces the same
properties on live data.

## Reference

https://github.com/tlaplus/tlaplus
