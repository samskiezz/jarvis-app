# TLA+ — App Workflow Spec

This directory contains a TLA+ model of the Claude-run workflow used inside the
app.

## What's modelled

States: `pending` → `running` → `done | failed` → `archived`.

Three safety invariants:
- `SAFETY_CommandAlwaysAudited` — every archived run has a matching audit entry.
- `SAFETY_NoSkipArchive` — archive only after `done` or `failed`.
- `SAFETY_TerminalIsArchived` — only `archived` is terminal.

## Running TLC

```bash
# Install TLA+ Toolbox / TLC: https://lamport.azurewebsites.net/tla/tla.html
# Or via pip:
pip install --user py-tla-plus      # community wrapper (optional)

# Standalone TLC (requires Java 11+):
java -cp tla2tools.jar tlc2.TLC AppWorkflow.tla -config AppWorkflow.cfg
```

CI does NOT require TLC — the spec sits in repo as a formal-doc artifact that
TLA+ specialists can replay. The Python invariant runner enforces the same
properties on live data.

## Reference

Patterns adapted from https://github.com/tlaplus/tlaplus (Examples/).
