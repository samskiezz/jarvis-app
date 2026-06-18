# AGENTS.md — How AI agents should work with this repo

This repo is a Palantir-class reference platform with 11 architecture planes,
65+ named subsystems, 54 SQLite databases, ~6GB of data, 20+ pm2 processes,
and 90+ FastAPI routes. **It is not a normal app.**

## Mandatory before any code change

1. **Read [AUTOPILOT.md](AUTOPILOT.md)** to learn the discover-first principle.
2. **Run `bash scripts/autopilot discover`** to refresh `autopilot/intelligence/*.json`.
3. **Read `autopilot/intelligence/subsystem-registry.md`** to see which 65 subsystems exist.
4. **Read `autopilot/reports/system-status.md`** to see current health score + issues.
5. **Read [`assurance/SECURITY_INVARIANTS.md`](assurance/SECURITY_INVARIANTS.md)** for the 10 safety invariants.

## How to act

Every state-changing action MUST route through one of:

- **`assurance.commands.bus`** — typed command bus (dry-run, idempotency, approval, audit)
- **`forge.approvals`** — owner-approval queue for code modifications
- **`autopilot.control.action_runner`** — discover-first, propose-don't-mutate

**Never:**

- Edit subsystem files directly without first checking `autopilot/intelligence/integration-graph.md`
- Touch `underworld/` cognition loop, `assurance/` history, `forge/approvals.db`
- Run destructive shell patterns (`rm -rf`, `git reset --hard`, `DROP TABLE`)
- Print or persist secrets (the audit log redactor catches `sk-…`, `hf_…`, `AKIA…`, `bearer …`, etc.)
- Deploy or publish (Apollo deploys are owner-only via `/apollo/release`)

## How to propose changes

When you want to change code in any subsystem other than `autopilot/`:

1. Write a proposal markdown to `autopilot/reports/proposals/`
2. Use `ActionRunner.propose(kind, title, body, affected_files, risk)`
3. Owner approves via `POST /assurance/autopilot/approve` (bearer)
4. Forge picks up approved proposals from its queue

## How to add a new capability

1. Add the FastAPI route under `server/routes/<name>.py`
2. Register it in `server/main.py` (import + `include_router`)
3. Update the mini-app dock in `server/jarvis_live.html` if user-facing
4. Add an entry to `autopilot/discover/subsystem_extractor.py:NAMED`
5. Add tests under `tests/test_<name>/`

## How to add a new safety invariant

1. Write the rule in `assurance/invariants/rules.py`
2. Register via `assurance.invariants.registry.register("name", fn)`
3. Add a test in `tests/test_assurance/test_invariants.py`
4. Document in `assurance/SECURITY_INVARIANTS.md`

## What's already done — DO NOT rebuild

- Command bus, event bus, audit log, redaction, invariants, telemetry → `assurance/`
- Autonomous code evolution + approval queue → `forge/`
- Self-improvement loop with score+gate+land+rollback → `scripts/auto_improve.py`
- GPU brain auto-provision + auto-dispose → `scripts/brain_watchdog.py`
- 13-probe health monitor → `scripts/health_watchdog.py`
- Repo-wide discover / propose / loop → `autopilot/` (this layer)

## References

- [AUTOPILOT.md](AUTOPILOT.md) — owner-facing entry point
- [assurance/README.md](assurance/README.md) — substrate documentation
- [autopilot/intelligence/](autopilot/intelligence/) — current repo map (regenerated each run)
