# Jarvis red-team smoke report

- Target: `http://127.0.0.1:8095`
- Probes run: 20 (top 20 by severity from audit/results/)
- PASS: 20
- FAIL: 0
- SKIP (no probe registered or destructive): 0

## Probes

| # | Skill | Sev | Probe | Method | URL | Status | Expected | Result | Note |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `ai-regression-testing` | high | auth | GET | `/v1/admin/summary` | 404 | 401|403|404 | PASS |  |
| 2 | `api-connector-builder` | high | auth | GET | `/v1/admin/roles` | 404 | 401|403|404 | PASS |  |
| 3 | `audit-route-bas-rea` | high | auth | GET | `/v1/security/whoami` | 404 | 401|403|404 | PASS |  |
| 4 | `audit-route-rea` | high | ssrf | GET | `/openapi.json` | 200 | 200|404|500 | PASS | openapi surface reachable |
| 5 | `cost-aware-llm-pipeline` | high | auth | GET | `/v1/pm2` | 404 | 401|403|404 | PASS |  |
| 6 | `ecc-tools-cost-audit` | high | auth | GET | `/v1/pipeline` | 404 | 401|403|404 | PASS |  |
| 7 | `github-ops` | high | auth | GET | `/v1/metrics` | 404 | 401|403|404 | PASS |  |
| 8 | `hermes-imports` | high | auth | GET | `/v1/health/deep` | 404 | 401|403|404 | PASS |  |
| 9 | `hipaa-compliance` | high | auth | GET | `/v1/gpu/status` | 404 | 401|403|404 | PASS |  |
| 10 | `ito-trade-planner` | high | auth | GET | `/v1/token-governor/spend_status` | 404 | 401|403|404 | PASS |  |
| 11 | `laravel-plugin-discovery` | high | auth | GET | `/v1/admin/` | 404 | 401|403|404 | PASS |  |
| 12 | `latency-critical-systems` | high | auth | GET | `/v1/admin/summary` | 404 | 401|403|404 | PASS |  |
| 13 | `literature-review` | high | auth | GET | `/v1/admin/roles` | 404 | 401|403|404 | PASS |  |
| 14 | `llm-trading-agent-security` | high | auth | GET | `/v1/security/whoami` | 404 | 401|403|404 | PASS |  |
| 15 | `netmiko-ssh-automation` | high | auth | GET | `/v1/pm2` | 404 | 401|403|404 | PASS |  |
| 16 | `orch-add-feature` | high | auth | GET | `/v1/pipeline` | 404 | 401|403|404 | PASS |  |
| 17 | `orch-pipeline` | high | auth | GET | `/v1/metrics` | 404 | 401|403|404 | PASS |  |
| 18 | `other-route-bas-rea-age` | high | auth | GET | `/v1/health/deep` | 404 | 401|403|404 | PASS |  |
| 19 | `postgres-patterns` | high | auth | GET | `/v1/gpu/status` | 404 | 401|403|404 | PASS |  |
| 20 | `ralphinho-rfc-pipeline` | high | auth | GET | `/v1/token-governor/spend_status` | 404 | 401|403|404 | PASS |  |

## Notes

- All probes are read-only or hit only the idempotent `/reminders` test store and a malformed-payload check on `/v1/chat/route`.
- No POST/PUT/DELETE to `/tasks`, `/swarms`, `/gpu/dispose`, `/world/*`, `/underworld/*`, `/jarvis_live`, or any auto-improve endpoint.
- Each request timeout: 5s. Status `0` = network error (see Note).
- SKIP entries are deliberate safety refusals, not failures.
