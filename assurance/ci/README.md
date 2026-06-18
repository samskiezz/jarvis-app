# Assurance CI

Run the full gate locally:

```bash
bash assurance/ci/assurance-check.sh
```

GitHub-side runs via `.github/workflows/assurance.yml` (push + PR).

## What's checked

1. pytest — `tests/test_assurance/` (52 tests).
2. Invariant runner — all 10 invariants must pass.
3. API fuzz — 200 iterations against the CommandBus with no crash + no secret
   leak + invariants still pass at the end.
4. Workflow fuzz — 500 random walks per workflow.
5. UI theme lock — `scripts/check_ui_theme_lock.py`.
6. `server.main` import — the FastAPI app boots.
