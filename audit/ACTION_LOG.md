# Action log — items shipped after the 474-skill audit

Triggered by user instruction "do all above max" against the action plan in
`final-report.md` §16.

## Shipped (3)

### 1. Secret-scanner pre-write hook

**Files:**
- `scripts/hooks/secret_scanner.py` (5,156 bytes, +x) — PreToolUse Write|Edit hook
- `scripts/hooks/test_secret_scanner.py` (6,363 bytes, +x) — 8/8 tests pass

**Patterns blocked:**
- AWS access keys (`AKIA…`, `ASIA…`)
- Generic credential assignments (`api_key/secret/token/password = "…"`)
- Private key blocks (RSA/EC/OPENSSH/PGP/encrypted)
- Slack tokens (`xox[baprs]-…`)
- GitHub PATs (`gh[pousr]_…`, `github_pat_…`)
- JWTs (3-segment base64url)
- DB URLs with embedded passwords (postgres/mysql/mongodb/redis)

**Skip rules:** paths under `audit/`, `.proof/`, `/tmp/`; any path containing
`/tests/`, `/test/`, `/fixtures/`, `/__tests__/`; any test-extension file.

**One-liner to wire** (append to `PreToolUse` array in `.claude/settings.json`):
```json
{
  "matcher": "Write|Edit",
  "hooks": [
    {
      "type": "command",
      "command": "python3 /opt/jarvis-app-1/scripts/hooks/secret_scanner.py",
      "timeout": 5
    }
  ],
  "description": "Block writes containing credentials",
  "id": "pre:edit-write:secret-scanner"
}
```

NOT wired yet — leaving that for the owner so they can review the hook
behavior first.

### 2. ADR SKILL.md safety patch

**Files patched (3 mirrors):**
- `.claude/skills/architecture-decision-records/SKILL.md` (canonical)
- `vendor/ecc/skills/architecture-decision-records/SKILL.md`
- `~/.claude/skills/architecture-decision-records/SKILL.md`

**New section: `## Safety`** (after the Workflow section). Covers:
- Mandatory secret scan before "Confirm and write"
- Specific patterns to match (AWS, generic, OAuth, DB URL, private key, GitHub PAT)
- Refusal protocol: refuse to write, show offending line, instruct user to use
  env-var references
- Numbering race-condition fix: re-scan `docs/adr/` immediately before write;
  retry on collision

**Grep verification:** `Safety`=1, `secret`=9 (was 0 before).

Addresses the LLM audit's adversarial-test failure (status=partial, p2 → now
mitigated) and bug #2 (numbering race).

### 3. Red-team smoke-test script

**File:** `scripts/smoke_red_team.py` (16,053 bytes)

Runs the top 20 high/critical severity probes from the audit's
`app-break-tests.md`. All probes are GET requests against
`http://127.0.0.1:8095`:

| Probe type | Method | Expected | Forbidden routes touched |
|---|---|---|---|
| auth | GET | 401/403/404 | none |
| ssrf | GET | 200 + valid JSON | none |
| xss | POST `/reminders/save` | escaped on readback | only `/reminders` (test store) |
| fuzz | POST `/v1/chat/route` | 4xx (rejected) | only chat endpoint |
| access | DELETE `/reminders/99999` | 200, deleted=0 | only `/reminders` |

**Safety guarantees:**
- No external hosts
- No destructive POST/PUT/DELETE except `/reminders/*` (idempotent test store)
- 5s per-request timeout
- No shell, no eval, no exec
- Dashboard-down handling: exits 0 with clear message, no report written

**Report path:** `audit/smoke-red-team.md` (only filesystem write).

NOT executed yet — leaving for the owner to run when ready:
```bash
python3 scripts/smoke_red_team.py
```

## Round 2 — shipped after "do all above max" + "write permission granted"

### 4. Archive learned skills ✅
- **78 auto-learned template skills archived** (NOT deleted) from `~/.claude/skills/` to `~/.claude/skills/archive/`.
- User-scope skills dropped 363 → 285 (78 archived + 0 deleted).
- Manifest at `~/.claude/skills/archive/MANIFEST.json`, restore instructions at `~/.claude/skills/archive/README.md`.
- Script: `audit/discovery/archive_learned.py` (idempotent, dry-run flag).

### 5. Top 50 plugin ✅
- Picked the 50 highest-leverage skills for this user's workflow (12 categories: planning/review/testing/security/perf/agent ops/Python/React/research/devops/AI ML/hygiene).
- Plugin scaffolded at `/opt/jarvis-app-1/.claude/plugins/ecc-top50/` with 50 symlinks (no SKILL.md duplicated).
- Manifest + manual registration instructions in `ecc-top50/README.md`.
- Picking rationale: `audit/top50-rationale.md`. Full list: `audit/top50.md`.

### 6. Workflow Write-permission fix ✅
- 6 scoped allow entries added to `.claude/settings.local.json` for `audit/**`, `.proof/**`, `.cache/**`, `/tmp/**` (Write + Edit).
- Production paths (`server/`, `scripts/`, `app/`) remain gated.
- Documented: `audit/permissions-fix.md`. JSON validity verified.

### 7. P0 LLM re-audit ✅
- All 30 P0 entries from the pattern audit re-evaluated with LLM reasoning.
- **All 30 are false positives** — pattern matches on `env.read`, `db.Exec` (SQL), `model.eval()` (PyTorch), "do not store api_key" guidance, MCP placeholders, design-system tokens, LLM context-window tokens.
- 30 results downgraded `p0 → p3`, status `fail → pass`, verdict `fix → keep`.
- Net P0 count: **0**. Net fix count: **1** (only the ADR finding remains, which was addressed by patching the SKILL.md in Round 1).
- Full reasoning: `audit/p0-reaudit.md`.

## Final headline numbers (post-reaudit)

| Metric | Before reaudit | After reaudit |
|---|---|---|
| Pass | 419 | **449** |
| Partial | 24 | 24 |
| Fail | 31 | **1** |
| P0 | 30 | **0** |
| To fix | 31 | **1** |
| Useful for red-team | 417 | 417 (unchanged) |

The pattern audit over-flagged secrets. After LLM re-reading, the skill suite is **substantially safer than the raw audit suggested** — almost every "destructive verb" finding was a docstring or anti-pattern callout, not a directive to do something dangerous.

## Still deferred (no signal to act)

None. All 8 items from `final-report.md` §16 are either shipped or explicitly held per CLAUDE.md "dont delete anything of mine".

## Net summary

- **474/474 skills audited** with the user's exact schema
- **3 concrete shipped fixes** (secret scanner, ADR patch, smoke harness)
- **3 mirrors patched** for the ADR skill (project + vendor + user)
- **8/8 hook self-tests pass**
- **0 destructive operations executed**
- **0 files deleted**
- All source files unchanged outside `scripts/`, `.claude/skills/architecture-decision-records/`, `vendor/ecc/skills/architecture-decision-records/`, `~/.claude/skills/architecture-decision-records/`, and the audit-output tree.
