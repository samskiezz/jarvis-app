# Mission Control

## UI mini-app

Read-only overlay in `server/jarvis_live.html`:

- Dock entry: 🛡 Mission Control
- MINI_APPS id: `mission_control`
- Overlay id: `ovMissionControl`
- Polls `/assurance/report` every 7s
- Renders: invariants (green/red), telemetry, recent commands, recent events,
  workflows
- Zero destructive controls

## HTTP

| Path | Method | Auth |
|---|---|---|
| `/assurance/health` | GET | opt |
| `/assurance/commands` | GET | opt |
| `/assurance/events` | GET | opt |
| `/assurance/telemetry` | GET | opt |
| `/assurance/metrics` | GET | opt (Prom) |
| `/assurance/invariants` | GET | opt |
| `/assurance/workflows` | GET | opt |
| `/assurance/audit` | GET | opt |
| `/assurance/report` | GET | opt (full report) |
| `/assurance/run_invariants` | POST | bearer |
| `/assurance/dispatch` | POST | bearer |

## CLI

```bash
.venv/bin/python -m assurance.invariants.runner --once --json
```

## pm2

`assurance-runner` entry in `ecosystem.config.cjs` loops `run_all()` every
60s and persists `server/data/assurance/reports/latest_invariants.json`.
