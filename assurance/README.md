# Repo-Wide High-Assurance Mission-Control Layer

NASA-grade observability + safety layer that wraps every state-changing path
through a typed command bus, typed event bus, audit log + redaction,
telemetry, state-machine workflows, invariant runner, TLA+ spec, fuzz
harness, Z3 examples, read-only Mission Control mini-app, and CI gate.

All wrapping is **additive** — no existing call signatures change.

## Quickstart

```bash
bash assurance/ci/assurance-check.sh
.venv/bin/python -m pytest tests/test_assurance/ -q
.venv/bin/python -m assurance.invariants.runner --once
.venv/bin/python -m assurance.fuzz.api_fuzzer --seed 42 --iter 200
.venv/bin/python -m assurance.fuzz.invariant_fuzz --walks 500
```

## Layout

| Path | What |
|---|---|
| `assurance/commands/` | CommandBus (dispatch, dry-run, idempotency, approval, audit hook) |
| `assurance/events/` | EventBus (append-only, JSONL sink, subscribe, replay) |
| `assurance/audit/` | Audit log + secret redaction |
| `assurance/telemetry/` | Counter / Gauge / Histogram + snapshot + Prom export |
| `assurance/workflows/` | StateMachine engine + 3 concrete workflows |
| `assurance/invariants/` | 10 rules + registry + runner with JSON report |
| `assurance/gates/` | Dangerous-command list, approval, dry-run helpers |
| `assurance/tla/` | TLA+ spec for the Claude-run workflow |
| `assurance/fuzz/` | api_fuzzer + invariant_fuzz + corpus + crashes/ |
| `assurance/formal/` | Z3 examples + KLEE/angr/Dafny notes |
| `assurance/ci/` | shell-level CI gate |
| `server/routes/assurance.py` | `/assurance/*` HTTP endpoints |
| `tests/test_assurance/` | 52 tests, all green |

## Endpoints

`/assurance/{health,commands,events,telemetry,metrics,invariants,workflows,audit,report}` (GET, optional bearer)
`/assurance/{run_invariants,dispatch}` (POST, bearer required)

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [SECURITY_INVARIANTS.md](SECURITY_INVARIANTS.md)
- [FUZZING.md](FUZZING.md)
- [TLA.md](TLA.md)
- [MISSION_CONTROL.md](MISSION_CONTROL.md)
- [IMPLEMENTED.md](IMPLEMENTED.md)

## References lifted from

seL4, NASA fprime / cFS / openmct, TLA+, AFL++, Z3, onefuzz.
