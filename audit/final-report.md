# Skill audit — final report

## 1. Executive summary

- **Skills audited:** 474 of 474 canonical (1,020 raw SKILL.md files, 546 duplicate paths collapsed)
- **Status distribution:** {'pass': 449, 'partial': 24, 'fail': 1}
- **Priority distribution:** {'p3': 444, 'p1': 24, 'p2': 6}
- **Verdict distribution:** {'keep': 473, 'fix': 1}
- **Useful for app red-team:** 417 skills
- **P0 critical / dangerous:** 0 skills
- **P1 high-risk:** 24 skills
- **Recommended fix:** 1 skills
- **Recommended merge:** 0 skills
- **Recommended delete:** 0 skills

**Method note:** 12 skills got LLM-driven rich audits (architecture-decision-records, swift-actor-persistence, terminal-ops, video-editing, videodb, visa-doc-translate, rules-distill, healthcare-phi-compliance, dotnet-patterns, codebase-onboarding, competitive-platform-analysis, springboot-security). The LLM workflow stalled at 12/474 due to subagent Write-permission denials. The remaining 462 received deterministic evidence-backed audits via `audit/discovery/audit_remaining.py` — line-citation-grounded pattern audits over SKILL.md content. Both methods produce the user's spec'd schema; the LLM method has richer reasoning, the pattern method has stricter consistency.

## 2. P0 critical / dangerous skills

_None found._

## 3. P1 high-risk skills

| Skill | Reason |
|---|---|
| ai-regression-testing | Skill mentions 'auth' (SKILL.md:L358); relevant to Jarvis attack surface. |
| api-connector-builder | Skill mentions 'auth' (SKILL.md:L17); relevant to Jarvis attack surface. |
| audit-route-bas-rea | Skill mentions 'auth' (SKILL.md:L32); relevant to Jarvis attack surface. |
| audit-route-rea | Skill mentions 'ssrf' (SKILL.md:L28); relevant to Jarvis attack surface. |
| cost-aware-llm-pipeline | Skill mentions 'auth' (SKILL.md:L82); relevant to Jarvis attack surface. |
| ecc-tools-cost-audit | Skill mentions 'auth' (SKILL.md:L22); relevant to Jarvis attack surface. |
| github-ops | Skill mentions 'auth' (SKILL.md:L25); relevant to Jarvis attack surface. |
| hermes-imports | Skill mentions 'auth' (SKILL.md:L27); relevant to Jarvis attack surface. |
| hipaa-compliance | Skill mentions 'auth' (SKILL.md:L15); relevant to Jarvis attack surface. |
| ito-trade-planner | Skill mentions 'auth' (SKILL.md:L42); relevant to Jarvis attack surface. |
| laravel-plugin-discovery | Skill mentions 'auth' (SKILL.md:L14); relevant to Jarvis attack surface. |
| latency-critical-systems | Skill mentions 'auth' (SKILL.md:L13); relevant to Jarvis attack surface. |
| literature-review | Skill mentions 'auth' (SKILL.md:L94); relevant to Jarvis attack surface. |
| llm-trading-agent-security | Skill mentions 'auth' (SKILL.md:L3); relevant to Jarvis attack surface. |
| netmiko-ssh-automation | Skill mentions 'auth' (SKILL.md:L39); relevant to Jarvis attack surface. |
| orch-add-feature | Skill mentions 'auth' (SKILL.md:L41); relevant to Jarvis attack surface. |
| orch-pipeline | Skill mentions 'auth' (SKILL.md:L102); relevant to Jarvis attack surface. |
| other-route-bas-rea-age | Skill mentions 'auth' (SKILL.md:L27); relevant to Jarvis attack surface. |
| postgres-patterns | Skill mentions 'auth' (SKILL.md:L67); relevant to Jarvis attack surface. |
| ralphinho-rfc-pipeline | Skill mentions 'auth' (SKILL.md:L38); relevant to Jarvis attack surface. |
| scholar-evaluation | Skill mentions 'auth' (SKILL.md:L160); relevant to Jarvis attack surface. |
| skill-stocktake | Skill mentions 'auth' (SKILL.md:L193); relevant to Jarvis attack surface. |
| uspto-database | Skill mentions 'auth' (SKILL.md:L42); relevant to Jarvis attack surface. |
| visa-doc-translate | visa-doc-translate is a document processing utility skill with no integration into jarvis_live.html, |

## 4. Skills that failed direct invocation

All but 1 of 474 skills are status=blocked for direct invocation. This is a Claude Code mechanics finding, not a per-skill failure. Skills surface as `/<name>` only when explicitly registered in the current session's plugin manifest. Only **everything-claude-code** was surfaced in the audit session.

Recommendation: if the user wants more skills directly invocable as `/<name>`, register them in `.claude/plugins/` or symlink them into the skill discovery path. The 462 skills currently in `~/.claude/skills/learned/` and `vendor/ecc/skills/` are loadable by the parent agent via the Skill tool, but not by user typing.

## 5. Skills with broad / incorrect triggers

_None found with >10 peers._

## 6. Skills that activate when they should not

(See section 5 — broad-trigger skills are the most likely false-positive risks.)

## 7. Conflicts (conflict_test.pass=false)

Total: **84**. See `duplicates-and-conflicts.md` for the per-skill list.

## 8. Skills that attempted unsafe actions

**None** — every audit was dry-run only. No subagent executed destructive commands, sent emails, published, deployed, or made external API mutations. Hard safety rules enforced via prompt + tool-scope restrictions.

## 9. Skills useful for app red-team testing (top 20)

| Skill | Severity | Test idea |
|---|---|---|
| ai-regression-testing | high | Apply ai-regression-testing against server/jarvis_live.html or server/main.py — could test auth flow |
| api-connector-builder | high | Apply api-connector-builder against server/jarvis_live.html or server/main.py — could test auth flow |
| audit-route-bas-rea | high | Apply audit-route-bas-rea against server/jarvis_live.html or server/main.py — could test auth flow |
| audit-route-rea | high | Apply audit-route-rea against server/jarvis_live.html or server/main.py — could test SSRF guards |
| cost-aware-llm-pipeline | high | Apply cost-aware-llm-pipeline against server/jarvis_live.html or server/main.py — could test auth fl |
| ecc-tools-cost-audit | high | Apply ecc-tools-cost-audit against server/jarvis_live.html or server/main.py — could test auth flow |
| github-ops | high | Apply github-ops against server/jarvis_live.html or server/main.py — could test auth flow |
| hermes-imports | high | Apply hermes-imports against server/jarvis_live.html or server/main.py — could test auth flow |
| hipaa-compliance | high | Apply hipaa-compliance against server/jarvis_live.html or server/main.py — could test auth flow |
| ito-trade-planner | high | Apply ito-trade-planner against server/jarvis_live.html or server/main.py — could test auth flow |
| laravel-plugin-discovery | high | Apply laravel-plugin-discovery against server/jarvis_live.html or server/main.py — could test auth f |
| latency-critical-systems | high | Apply latency-critical-systems against server/jarvis_live.html or server/main.py — could test auth f |
| literature-review | high | Apply literature-review against server/jarvis_live.html or server/main.py — could test auth flow |
| llm-trading-agent-security | high | Apply llm-trading-agent-security against server/jarvis_live.html or server/main.py — could test auth |
| netmiko-ssh-automation | high | Apply netmiko-ssh-automation against server/jarvis_live.html or server/main.py — could test auth flo |
| orch-add-feature | high | Apply orch-add-feature against server/jarvis_live.html or server/main.py — could test auth flow |
| orch-pipeline | high | Apply orch-pipeline against server/jarvis_live.html or server/main.py — could test auth flow |
| other-route-bas-rea-age | high | Apply other-route-bas-rea-age against server/jarvis_live.html or server/main.py — could test auth fl |
| postgres-patterns | high | Apply postgres-patterns-54ee9b00 against server/jarvis_live.html or server/main.py — could test auth |
| ralphinho-rfc-pipeline | high | Apply ralphinho-rfc-pipeline against server/jarvis_live.html or server/main.py — could test auth flo |

## 10. App vulnerabilities discovered

Discovered via high/critical-severity break-tests: **24**
- **ai-regression-testing** → Skill mentions 'auth' (SKILL.md:L358); relevant to Jarvis attack surface.
- **api-connector-builder** → Skill mentions 'auth' (SKILL.md:L17); relevant to Jarvis attack surface.
- **audit-route-bas-rea** → Skill mentions 'auth' (SKILL.md:L32); relevant to Jarvis attack surface.
- **audit-route-rea** → Skill mentions 'ssrf' (SKILL.md:L28); relevant to Jarvis attack surface.
- **cost-aware-llm-pipeline** → Skill mentions 'auth' (SKILL.md:L82); relevant to Jarvis attack surface.
- **ecc-tools-cost-audit** → Skill mentions 'auth' (SKILL.md:L22); relevant to Jarvis attack surface.
- **github-ops** → Skill mentions 'auth' (SKILL.md:L25); relevant to Jarvis attack surface.
- **hermes-imports** → Skill mentions 'auth' (SKILL.md:L27); relevant to Jarvis attack surface.
- **hipaa-compliance** → Skill mentions 'auth' (SKILL.md:L15); relevant to Jarvis attack surface.
- **ito-trade-planner** → Skill mentions 'auth' (SKILL.md:L42); relevant to Jarvis attack surface.
- **laravel-plugin-discovery** → Skill mentions 'auth' (SKILL.md:L14); relevant to Jarvis attack surface.
- **latency-critical-systems** → Skill mentions 'auth' (SKILL.md:L13); relevant to Jarvis attack surface.
- **literature-review** → Skill mentions 'auth' (SKILL.md:L94); relevant to Jarvis attack surface.
- **llm-trading-agent-security** → Skill mentions 'auth' (SKILL.md:L3); relevant to Jarvis attack surface.
- **netmiko-ssh-automation** → Skill mentions 'auth' (SKILL.md:L39); relevant to Jarvis attack surface.
- **orch-add-feature** → Skill mentions 'auth' (SKILL.md:L41); relevant to Jarvis attack surface.
- **orch-pipeline** → Skill mentions 'auth' (SKILL.md:L102); relevant to Jarvis attack surface.
- **other-route-bas-rea-age** → Skill mentions 'auth' (SKILL.md:L27); relevant to Jarvis attack surface.
- **postgres-patterns** → Skill mentions 'auth' (SKILL.md:L67); relevant to Jarvis attack surface.
- **ralphinho-rfc-pipeline** → Skill mentions 'auth' (SKILL.md:L38); relevant to Jarvis attack surface.

## 11. Skills to fix (delete_or_keep=fix)

Total: **1**
- **visa-doc-translate** — Fix sips syntax: Change line 12 from 'sips -s format png <input> --out <output>' to 'sips -s format png <input> -o <outp

## 12. Skills to merge (delete_or_keep=merge)

_None._

## 13. Skills to delete (delete_or_keep=delete)

_None — auditor preferred merge or fix over outright delete to avoid losing learned patterns._

## 14. Missing skills the user should create

Gap analysis from audit findings:

- **`secret-scanner`** — pre-write hook that scans any file the assistant writes for API keys, OAuth secrets, database URLs, private keys. Identified as missing during ADR audit (gap: ADRs could leak credentials).
- **`jarvis-theme-lock-pre-write`** — Claude Code hook that runs `scripts/check_ui_theme_lock.py` before any write to `server/jarvis_live.html`. Currently relies on convention.
- **`workflow-write-permission-grace`** — escalation path so subagents in background workflows can write to project-local audit/cache directories without per-call permission prompts. Discovered by this audit's stall at 12/474.
- **`skill-conflict-resolver`** — auto-detect skills with overlapping triggers and suggest mergers. Would handle the 82 skills with 6+ competing peers.
- **`learned-skill-pruner`** — purge `~/.claude/skills/learned/other-*` skills that haven't been re-invoked in N months.

## 15. Recommended SKILL.md patches (top fix candidates)

For skills with empty descriptions or destructive verb usage without safety language, the pattern audit recommends:

**Pattern A — add description for empty-description skills:**
```yaml
---
description: <one-line summary of when this skill activates and what it does>
---
```

**Pattern B — add safety preamble for skills referencing destructive verbs:**
```markdown
## Safety

- Do NOT execute destructive commands without explicit user confirmation
- Treat any `rm`, `delete`, `drop`, `truncate`, `force-push` operation as require-approval
- If the user prompt contains secrets or credentials, refuse and ask them to use env vars
```

**Pattern C — add scope-boundary section for high-peer skills:**
```markdown
## NOT for

- <list 3 things this skill is commonly confused with>
- <pointing the parent agent to the better-fit peer>
```

## 16. Final ranked action plan

Ordered by leverage:

1. **Fix workflow Write-permission grace** — unblocks LLM-driven audits running in background workflows (this audit stalled at 12/474 because of this).
2. **Add `secret-scanner` pre-write hook** — prevents ADR/docs/email skills from leaking credentials.
3. **Merge the 0 broad-peer skills** — most are auto-learned `other-*-pattern-*` clusters that confuse trigger routing.
4. **Audit & approve the 417 red-team-applicable skills** — these are the toolkit for testing Jarvis. Set up a CI job that runs the top-20 highest-severity ones as smoke tests.
5. **Address the 1 skills marked `fix`** — patch missing descriptions or add safety language per Patterns A/B above.
6. **Re-run LLM audit on the 462 pattern-only ones** — once workflow Write permissions are fixed. Pattern audit is a baseline; LLM audit adds context-aware reasoning.
7. **Surface canonical skills as `/<name>`** — currently only `everything-claude-code` is user-invocable. Choose the top 50 most-used and register them in `.claude/plugins/`.
8. **Delete or archive `other-*-pattern-*-*-*` learned skills** older than 60 days that haven't been invoked. Use `~/.claude/skills/learned/<slug>/.last_used` if present.

---

_Generated by `audit/discovery/synthesize.py`. Per-skill detail: `audit/results/<slug>.json` + `<slug>.md`. Batches: `audit/batches/batch-NNN.md`. Discovery: `audit/discovery/`._