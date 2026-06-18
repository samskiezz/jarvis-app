# Architecture

```
              ┌────────────────────────────────────────────┐
              │           FastAPI (server.main)            │
              │   /assurance/* via server/routes/assurance │
              └──────────────────┬─────────────────────────┘
                                 │
       ┌────────────┬────────────┼────────────┬──────────────┐
       ▼            ▼            ▼            ▼              ▼
  CommandBus   EventBus    Telemetry    Workflows      Invariants
  commands/    events/     telemetry/   workflows/     invariants/
       │            │             │
       │            │             ▼
       │            └────► Audit log (redaction)
       │                   audit/
       │
       └────► Safety Gates ──► dangerous / approval / dry-run
              gates/

Persistence (server/data/assurance/):
  events.jsonl                       # every Event redacted + appended
  audit.jsonl                        # every AuditEntry redacted + appended
  reports/latest_invariants.json     # last invariant pass
```

## Bus model

- **CommandBus** — typed dispatch. Each `Command` carries `command_id`,
  `correlation_id`, `causation_id`, `actor`, `payload`, `dry_run`, `approved`,
  `idempotency_key`. Returns `CommandResult | CommandFailure`. Error kinds:
  `validation`, `permission`, `approval_required`, `idempotent_replay`,
  `handler_error`, `unknown_command`.
- **EventBus** — append-only. Subscribers fan out. JSONL persistence.
  `replay_file()` rebuilds in-memory state from disk.

## Audit + redaction

Every persisted line goes through `redact_value()` first. Patterns cover
OpenAI/Anthropic/HF/AWS/Wasabi/GitHub tokens, JWTs, basic auth in URLs, and
`password=`/`secret=`/`api_key=` k/v.

## Invariants

10 rules. See [SECURITY_INVARIANTS.md](SECURITY_INVARIANTS.md). Snapshot of
recent commands + events + audit is built; rules are pure over that snapshot.

## Workflows

- `claude_run` — pending → running → done | failed → archived
- `gpu_lifecycle` — requested → provisioning → ready ⇄ degraded → disposing → disposed
- `chat_request` — received → routed → answered | failed

Each state machine has an explicit transition table with `required` and
`forbidden_after` preconditions.

## Wrapped existing code (additive)

- `scripts/claude_whip.py:archive_run` — emits `claude.run.archived` event.
- `server/services/gpu_instances.py:safe_dispose` / `launch_disposable` —
  emit `gpu.dispose.*` / `gpu.launch_disposable` events.

## Process model

- **`assurance-runner` pm2 process** — loops `run_all()` every 60s.
- **In-process** — every dispatch / append in the FastAPI app.
- **CI** — `.github/workflows/assurance.yml`.
