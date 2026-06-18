# Implemented vs. the user's 15-item brief

| # | Brief item | Where |
|---|---|---|
| 1 | Inspect the repo | done in this sweep |
| 2 | Command bus | [commands/](commands/) |
| 3 | Event bus | [events/](events/) |
| 4 | Audit + redaction | [audit/](audit/) |
| 5 | Telemetry | [telemetry/](telemetry/) |
| 6 | State-machine workflows | [workflows/](workflows/) |
| 7 | Invariant layer | [invariants/](invariants/) |
| 8 | TLA+ spec | [tla/AppWorkflow.tla](tla/AppWorkflow.tla) |
| 9 | Fuzz harness | [fuzz/](fuzz/) |
| 10 | Symbolic/formal | [formal/](formal/) |
| 11 | Mission Control | [/server/routes/assurance.py](/server/routes/assurance.py) + Mission Control mini-app in [/server/jarvis_live.html](/server/jarvis_live.html) |
| 12 | Safety gates | [gates/](gates/) |
| 13 | CI gate | [/.github/workflows/assurance.yml](/.github/workflows/assurance.yml) + [ci/assurance-check.sh](ci/assurance-check.sh) |
| 14 | Documentation | this directory |
| 15 | Final verification | 52 / 52 tests pass; 10 / 10 invariants pass; fuzz smoke passes; UI theme lock passes |

## Wrapped existing code (additive, no signature changes)

- `scripts/claude_whip.py:archive_run` — emits `claude.run.archived`.
- `server/services/gpu_instances.py:safe_dispose` / `launch_disposable` —
  emit `gpu.dispose.*` / `gpu.launch_disposable`.

## Out of scope (documented, not done)

- KLEE / angr / Dafny / Verus ports (notes only).
- Replacement of existing JSONL sinks. Assurance is an additive NEW sink.
- Any auth model change.
- `JARVIS_AUTOMATION_ALLOW_CLAUDE` widening.
- Force-push, `rm -rf`, destructive ops.
