# Fuzzing

## Harnesses

- `assurance/fuzz/api_fuzzer.py` — random `Command` payloads against the
  CommandBus. Payload shapes: small / deep / wide / unicode / binary_text /
  secret_like / empty. Random name/actor/dry_run/approved/idempotency_key.
- `assurance/fuzz/invariant_fuzz.py` — random walks of the state machines.

## CI smoke

```bash
.venv/bin/python -m assurance.fuzz.api_fuzzer --seed 42 --iter 200
.venv/bin/python -m assurance.fuzz.invariant_fuzz --walks 500
```

Exit 0 on success; exit 2 on any crash, secret leak in JSONL, or invariant
violation.

## Corpus

`assurance/fuzz/corpus/seed_*.json` — deterministic seeds, replayed with
`--corpus`. Add seeds for known-bad-inputs.

## Crashes

`assurance/fuzz/crashes/` — gitignored. Any crash writes a JSON file there.

## References

AFL++, onefuzz (corpus reuse), syzkaller (out of scope).
