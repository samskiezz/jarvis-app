# AUTOPILOT.md — Repo-level autopilot operating system

A discover-first, propose-don't-mutate, organism-aware control layer that sits
on top of `assurance/` (substrate) and routes proposed changes to `forge/`
(approval queue).

## Quick start

```bash
bash scripts/autopilot discover            # refresh intelligence/*.json
bash scripts/autopilot status              # generate system-status report
bash scripts/autopilot health              # emit health-score
bash scripts/autopilot verify              # pytest + assurance invariants + theme lock
bash scripts/autopilot loop --once --safe  # full cognitive cycle
bash scripts/autopilot full                # discover + graph + health + verify + run-safe + improve + report
```

## What it actually does

Five cognitive primitives:

1. **Perception** — senses `git status`, file mtimes, pm2 jlist, `brain_health.json`,
   `health.json`, `vast_events.jsonl` tail, broken imports, assurance invariants.
2. **Planning** — reads perception + intelligence + roadmap → emits safe actions
   + owner-approval proposals.
3. **Action** — executes only policy-approved actions via `assurance.commands.bus`;
   routes code-modify to `forge/` approval queue.
4. **Evaluation** — diffs health score before/after, scores impact.
5. **Improvement** — synthesises safe wrappers / docs / test stubs as proposals
   to `autopilot/reports/proposals/`.

## Discover-first

Before any planning or action, the autopilot rebuilds:

- **`plane-map.{json,md}`** — 11 architecture planes (control-plane, data-plane, …)
- **`subsystem-registry.{json,md}`** — 65 named subsystems with `alive/dormant/orphan` status
- **`capability-registry.{json,md}`** — 564 FastAPI endpoints with risk class
- **`resource-map.{json,md}`** — pm2 + brain + Vast + Wasabi + Ollama + LLM router
- **`db-catalogue.{json,md}`** — 54 SQLite DBs, sizes, writers, row counts
- **`integration-graph.{json,md}`** — module-level import graph
- **`unknown-systems.{json,md}`** — orphan scripts + dangerous patterns + brain offline
- **`system-limitations.{json,md}`** — hardcoded timeouts, swallowed exceptions, etc.

## Safety model

Action classes (in `autopilot/policy/action-policy.json`):

| Class | Default |
|---|---|
| `read_only` / `safe_write` / `generated_write` | auto |
| `database_read` | auto (SELECT-only) |
| `code_modify` | **routes to forge approval queue** |
| `external_read` | auto if `config.allow_external_read=true` |
| `external_write` / `worker_stop` | proposal → owner approval |
| `worker_start` / `paid_resource_launch` | dry-run / blocked unless explicitly opted in |
| `destructive` / `database_write` / `deploy` / `publish` / `secret_access` / `production_mutation` | **BLOCKED** |

Hard-blocked shell patterns: `rm -rf`, `git reset --hard`, `DROP TABLE`,
`TRUNCATE`, `chmod -R /`, paid GPU launch, env dump.

## What's in the dock

Mission Control mini-app (existing in `jarvis_live.html`) now polls 7 new
read-only endpoints under `/assurance/autopilot/*`:

| Endpoint | Returns |
|---|---|
| `GET /assurance/autopilot/status` | health score + issues + planes + subsystems + resources |
| `GET /assurance/autopilot/roadmap` | next actions + backlog |
| `GET /assurance/autopilot/resources` | pm2 + brain + Vast + Wasabi + Ollama summary |
| `GET /assurance/autopilot/unknowns` | orphan scripts + dangerous patterns + brain state |
| `GET /assurance/autopilot/subsystems` | 65-subsystem registry |
| `GET /assurance/autopilot/proposals` | list of `autopilot/reports/proposals/*.md` |
| `GET /assurance/autopilot/reports/{name}` | one specific generated report |
| `POST /assurance/autopilot/approve` (bearer) | record owner approval/rejection |

## Layout

```
autopilot/
  cli.py                          — argparse dispatch
  config/autopilot.config.json    — all knobs
  policy/                         — 4 JSONs + guard.py
  discover/                       — 8 cartography producers
  intelligence/                   — generated cartography (gitignored)
  state/                          — system state + last-run + history
  blackboard/                     — observations/hypotheses/plans/actions/results/learnings (gitignored)
  control/                        — capability_loader, action_runner, state_store, report_writer
  loops/                          — perception, planning, action, evaluation, improvement
  reports/                        — generated reports + proposals/
  roadmap/                        — roadmap, backlog, next-actions
```

## Verification

```bash
.venv/bin/python -m pytest tests/test_autopilot/ -q        # 37/37 passing
.venv/bin/python -m autopilot.cli discover                  # writes 8 intelligence files
.venv/bin/python -m autopilot.cli loop --once --safe        # full cycle
curl http://127.0.0.1:8001/assurance/autopilot/status       # live route
```

## Non-negotiables

- No production mutation. No deploy. No publish. No external writes without approval.
- No DB mutations. Read-only on all 54 SQLite DBs.
- Never touch `underworld/` cognition, `assurance/` history, `forge/approvals.db`.
- All destructive → blocked. All risky → dry-run proposal. All unknown risky → blocked.
- All actions emit Event → audit redacted via the assurance bus.

## See also

- [AGENTS.md](AGENTS.md) — for AI agents working in this repo
- [assurance/README.md](assurance/README.md) — substrate layer
- [assurance/SECURITY_INVARIANTS.md](assurance/SECURITY_INVARIANTS.md) — 10 invariants
