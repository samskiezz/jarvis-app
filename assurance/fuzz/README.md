# Assurance Fuzz Harness

Two scripts:

- `api_fuzzer.py` — random `Command` payloads against the CommandBus. Detects
  crashes, redaction failures, invariant violations.
- `invariant_fuzz.py` — random walks of the workflow state machines. Detects
  invalid transitions reaching terminal states.

## Quick start

```bash
.venv/bin/python -m assurance.fuzz.api_fuzzer --smoke
.venv/bin/python -m assurance.fuzz.invariant_fuzz --walks 500
```

## Modes

- `--smoke` — 200 iterations, hard fail on any crash, secret leak, or
  invariant violation. CI runs this.
- `--iter N` — extended runs.
- `--corpus` — replay deterministic seeds in `corpus/`.

## Outputs

- crashes  → `assurance/fuzz/crashes/crash-*.json` (gitignored)
- summary  → stdout JSON (CI checks exit code)

## References

Patterns lifted from AFL++ (mutation strategies) and onefuzz (corpus reuse).
